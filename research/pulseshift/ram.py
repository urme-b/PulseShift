"""Time-shift adaptation and Recovered Active Minutes (RAM)."""

import numpy as np
import pandas as pd

from . import config


def _safe(heat_index_f, pm25):
    return (heat_index_f < config.HEAT_UNSAFE_F) & (pm25 < config.PM25_UNSAFE)


def recommend(panel, risk_col="risk", window=config.SHIFT_WINDOW_H):
    """Per active hour, choose keep or the lowest-risk safe time shift."""
    df = panel.copy()
    df["date"] = df["ts_local"].dt.date
    df["safe"] = _safe(df["heat_index_f"], df["pm25"])

    actions, targets, target_risk, t_heat, t_pm = [], [], [], [], []
    for _, day in df.groupby("date"):
        hours = day["hour"].to_numpy()
        risk = day[risk_col].to_numpy()
        safe = day["safe"].to_numpy()
        heat = day["heat_index_f"].to_numpy()
        pm = day["pm25"].to_numpy()
        for i in range(len(day)):
            near = np.abs(hours - hours[i]) <= window
            feasible = near & safe
            if not feasible.any():
                actions.append("cancel")
                targets.append(np.nan)
                target_risk.append(1.0)
                t_heat.append(heat[i])
                t_pm.append(pm[i])
                continue
            cand = np.where(feasible)[0]
            best = cand[np.argmin(risk[cand])]
            actions.append("keep" if best == i and safe[i] else "shift")
            targets.append(hours[best])
            target_risk.append(risk[best])
            t_heat.append(heat[best])
            t_pm.append(pm[best])

    df["action"] = actions
    df["target_hour"] = targets
    df["chosen_risk"] = target_risk
    df["target_heat_index_f"] = t_heat
    df["target_pm25"] = t_pm
    return df


def ram_table(reco, risk_col="risk"):
    """Recovered activity from acting vs doing nothing."""
    expected = reco["expected_rides"].to_numpy()
    no_adapt = expected * (1 - reco[risk_col].to_numpy())
    adapted = expected * (1 - reco["chosen_risk"].to_numpy())
    recovered = np.maximum(0.0, adapted - no_adapt)

    lost = float((expected * reco[risk_col].to_numpy()).sum())
    total = float(recovered.sum())
    return {
        "recovered_rides": total,
        "recovered_minutes": total * config.MEAN_RIDE_MIN,
        "lost_rides_no_adapt": lost,
        "ram_pct_of_lost": float(total / lost) if lost else 0.0,
        "share_shifted": float((reco["action"] == "shift").mean()),
        "share_cancel": float((reco["action"] == "cancel").mean()),
        "per_hour": pd.Series(recovered, index=reco.index),
    }
