"""Audit that recommendations never raise exposure."""

import numpy as np

from . import config


def audit(reco):
    shifts = reco[reco["action"] == "shift"]
    heat_delta = shifts["target_heat_index_f"] - shifts["heat_index_f"]
    pm_delta = shifts["target_pm25"] - shifts["pm25"]

    unsafe_target = (
        (reco["action"] != "cancel")
        & (
            (reco["target_heat_index_f"] >= config.HEAT_UNSAFE_F)
            | (reco["target_pm25"] >= config.PM25_UNSAFE)
        )
    )
    return {
        "n_shifts": int(len(shifts)),
        "n_cancel": int((reco["action"] == "cancel").sum()),
        "unsafe_recommendations": int(unsafe_target.sum()),
        "max_heat_increase": float(heat_delta.max()) if len(shifts) else 0.0,
        "max_pm25_increase": float(pm_delta.max()) if len(shifts) else 0.0,
        "mean_heat_reduction": float(-heat_delta.mean()) if len(shifts) else 0.0,
        "mean_pm25_reduction": float(-pm_delta.mean()) if len(shifts) else 0.0,
        "all_safe": bool(unsafe_target.sum() == 0),
    }
