"""Train, evaluate, and produce all paper figures and tables."""

import json

import numpy as np
import pandas as pd

from pulseshift import config, decision, equity, plots, ram, safety
from pulseshift.calibration import calibrate_cv
from pulseshift.evaluation import metrics
from pulseshift.features import MODEL_FEATURES
from pulseshift.models import ClimatologyBaseline, fit_logistic, predict, temporal_split
from pulseshift.panel import active, label_suppression, load_panel


def _fmt(value):
    if isinstance(value, float):
        return f"{value:.3f}"
    return str(value)


def _write_table(df, name):
    config.TABLES.mkdir(parents=True, exist_ok=True)
    df.to_csv(config.TABLES / f"{name}.csv", index=False)
    header = "| " + " | ".join(df.columns) + " |"
    sep = "| " + " | ".join("---" for _ in df.columns) + " |"
    rows = ["| " + " | ".join(_fmt(v) for v in row) + " |" for row in df.itertuples(index=False)]
    (config.TABLES / f"{name}.md").write_text("\n".join([header, sep, *rows]) + "\n")


def _exposure_table(work):
    rows = []
    for var, edges in [("heat_index_f", [0, 40, 55, 70, 80, 90, 130]), ("aqi", [0, 50, 75, 100, 150, 400])]:
        binned = pd.cut(work[var], edges)
        for interval, g in work.groupby(binned, observed=True):
            rows.append(
                {"variable": var, "bin": str(interval), "n": len(g), "suppression_rate": g["suppressed"].mean()}
            )
    return pd.DataFrame(rows)


def main():
    panel = load_panel()
    work = active(panel)
    train_all, test = temporal_split(work)

    clim = ClimatologyBaseline().fit(train_all)
    logit_unw = fit_logistic(train_all, balanced=False)
    logit = fit_logistic(train_all, balanced=True)
    calibrated = calibrate_cv(train_all, method="isotonic", cv=5, balanced=True)

    p_clim = clim.predict_proba(test)
    p_unw = predict(logit_unw, test)
    p_bal = predict(logit, test)
    p_cal = calibrated.predict_proba(test[MODEL_FEATURES])[:, 1]

    comparison = pd.DataFrame(
        [
            {"model": "Climatology", **metrics(test["suppressed"], p_clim)},
            {"model": "Logistic (unweighted)", **metrics(test["suppressed"], p_unw)},
            {"model": "Logistic (balanced)", **metrics(test["suppressed"], p_bal)},
            {"model": "Logistic (balanced) + calibration", **metrics(test["suppressed"], p_cal)},
        ]
    )
    _write_table(comparison, "model_comparison")

    coef = pd.DataFrame(
        {"feature": MODEL_FEATURES, "coefficient": logit.named_steps["clf"].coef_[0]}
    ).sort_values("coefficient", key=abs, ascending=False)
    _write_table(coef, "logistic_coefficients")
    _write_table(_exposure_table(work), "exposure_response")

    thresholds = [0.05, 0.1, 0.2, 0.3, 0.4, 0.5]
    nb_model, nb_all = decision.net_benefit(test["suppressed"], p_cal, thresholds)
    _write_table(
        pd.DataFrame({"threshold": thresholds, "model": nb_model, "adapt_all": nb_all}),
        "decision_curve",
    )

    plots.reliability_plot(test["suppressed"].to_numpy(), p_bal, p_cal)
    plots.roc_plot(
        {
            "Climatology": (test["suppressed"], p_clim, comparison.iloc[0]["auroc"]),
            "Logistic": (test["suppressed"], p_bal, comparison.iloc[2]["auroc"]),
            "Calibrated": (test["suppressed"], p_cal, comparison.iloc[3]["auroc"]),
        }
    )
    plots.decision_plot(test["suppressed"].to_numpy(), p_cal)
    plots.exposure_response(work)
    plots.smoke_event(panel)

    test = test.assign(risk=p_cal)
    reco = ram.recommend(test)
    ram_stats = ram.ram_table(reco)
    plots.ram_by_month(reco, ram_stats["per_hour"])
    audit = safety.audit(reco)

    event = panel[(panel["ts_local"] >= "2023-06-06") & (panel["ts_local"] < "2023-06-10")]
    event_tbl = (
        event.groupby(event["ts_local"].dt.date)
        .agg(aqi=("aqi", "max"), rides=("rides_total", "sum"), expected=("expected_rides", "sum"))
        .reset_index()
        .rename(columns={"ts_local": "date"})
    )
    event_tbl["rides_vs_expected"] = (event_tbl["rides"] / event_tbl["expected"]).round(2)
    _write_table(event_tbl, "smoke_event")

    summer = panel[
        (panel["ts_local"] >= "2023-06-01") & (panel["ts_local"] < "2023-09-01") & (panel["daytype"] == "weekday")
    ]
    daily_ratio = summer.groupby(summer["ts_local"].dt.date).apply(
        lambda d: d["rides_total"].sum() / d["expected_rides"].sum()
    )
    jun8 = float(event_tbl.loc[event_tbl["date"].astype(str) == "2023-06-08", "rides_vs_expected"].iloc[0])
    smoke_context = {
        "jun8_ratio": jun8,
        "summer_weekday_days": int(len(daily_ratio)),
        "pct_days_below_jun8": float((daily_ratio <= jun8).mean()),
        "summer_ratio_median": float(daily_ratio.median()),
    }

    by_season = equity.strata_metrics(test, "season")
    by_daytype = equity.strata_metrics(test, "daytype")
    burden = equity.rider_burden(panel)
    _write_table(by_season, "equity_by_season")
    _write_table(by_daytype, "equity_by_daytype")
    _write_table(burden, "rider_burden")

    sens = []
    for ratio in config.SENSITIVITY_RATIOS:
        _, lab = label_suppression(work, ratio=ratio)
        tmp = work.assign(suppressed=lab)
        tr, te = temporal_split(tmp)
        m = calibrate_cv(tr, method="isotonic", cv=5, balanced=True)
        p = m.predict_proba(te[MODEL_FEATURES])[:, 1]
        row = {"ratio": ratio, "base_rate": float(lab.mean())}
        row.update({k: metrics(te["suppressed"], p)[k] for k in ["auroc", "brier", "ece"]})
        sens.append(row)
    _write_table(pd.DataFrame(sens), "label_sensitivity")

    summary = {
        "panel_rows": int(len(panel)),
        "active_hours": int(len(work)),
        "train_rows": int(len(train_all)),
        "test_rows": int(len(test)),
        "test_base_rate": float(test["suppressed"].mean()),
        "model_comparison": comparison.to_dict(orient="records"),
        "ram": {k: v for k, v in ram_stats.items() if k != "per_hour"},
        "safety": audit,
        "smoke_event": smoke_context,
        "rider_burden": burden.to_dict(orient="records"),
    }
    (config.TABLES / "summary.json").write_text(json.dumps(summary, indent=2))
    print(json.dumps(summary["model_comparison"], indent=2))
    print("RAM:", summary["ram"])
    print("Safety:", summary["safety"])
    print("Smoke:", summary["smoke_event"])


if __name__ == "__main__":
    main()
