"""Train, evaluate, and produce all paper figures and tables."""

import json

import numpy as np
import pandas as pd

from pulseshift import config, equity, plots, ram, safety
from pulseshift.calibration import calibrate
from pulseshift.evaluation import metrics
from pulseshift.features import MODEL_FEATURES
from pulseshift.models import (
    ClimatologyBaseline,
    calibration_split,
    fit_logistic,
    predict,
    temporal_split,
)
from pulseshift.panel import active, load_panel


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


def main():
    panel = load_panel()
    work = active(panel)
    train_all, test = temporal_split(work)
    fit_df, calib_df = calibration_split(train_all)

    clim = ClimatologyBaseline().fit(train_all)
    logit = fit_logistic(fit_df)
    calibrated = calibrate(logit, calib_df)

    p_clim = clim.predict_proba(test)
    p_raw = predict(logit, test)
    p_cal = calibrated.predict_proba(test[MODEL_FEATURES])[:, 1]

    comparison = pd.DataFrame(
        [
            {"model": "Climatology", **metrics(test["suppressed"], p_clim)},
            {"model": "Logistic", **metrics(test["suppressed"], p_raw)},
            {"model": "Logistic + calibration", **metrics(test["suppressed"], p_cal)},
        ]
    )
    _write_table(comparison, "model_comparison")

    coef = pd.DataFrame(
        {"feature": MODEL_FEATURES, "coefficient": logit.named_steps["clf"].coef_[0]}
    ).sort_values("coefficient", key=abs, ascending=False)
    _write_table(coef, "logistic_coefficients")

    plots.reliability_plot(test["suppressed"].to_numpy(), p_raw, p_cal)
    plots.roc_plot(
        {
            "Climatology": (test["suppressed"], p_clim, metrics(test["suppressed"], p_clim)["auroc"]),
            "Logistic": (test["suppressed"], p_raw, comparison.iloc[1]["auroc"]),
            "Calibrated": (test["suppressed"], p_cal, comparison.iloc[2]["auroc"]),
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

    by_season = equity.strata_metrics(test, "season")
    by_daytype = equity.strata_metrics(test, "daytype")
    burden = equity.rider_burden(panel)
    _write_table(by_season, "equity_by_season")
    _write_table(by_daytype, "equity_by_daytype")
    _write_table(burden, "rider_burden")

    sens = []
    from pulseshift.panel import label_suppression

    for ratio in config.SENSITIVITY_RATIOS:
        _, lab = label_suppression(work, ratio=ratio)
        tmp = work.assign(suppressed=lab)
        tr, te = temporal_split(tmp)
        fd, cd = calibration_split(tr)
        m = calibrate(fit_logistic(fd), cd)
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
        "rider_burden": burden.to_dict(orient="records"),
    }
    (config.TABLES / "summary.json").write_text(json.dumps(summary, indent=2))
    print(json.dumps(summary["model_comparison"], indent=2))
    print("RAM:", summary["ram"])
    print("Safety:", summary["safety"])


if __name__ == "__main__":
    main()
