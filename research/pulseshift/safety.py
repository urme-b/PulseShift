"""Audit that recommendations never raise exposure."""

import numpy as np

from . import config


def audit(reco):
    shifts = reco[reco["action"] == "shift"]
    heat_delta = shifts["target_heat_index_f"] - shifts["heat_index_f"]
    aqi_delta = shifts["target_aqi"] - shifts["aqi"]

    unsafe_target = (
        (reco["action"] != "cancel")
        & (
            (reco["target_heat_index_f"] >= config.HEAT_UNSAFE_F)
            | (reco["target_aqi"] >= config.AQI_UNSAFE)
        )
    )
    return {
        "n_shifts": int(len(shifts)),
        "n_cancel": int((reco["action"] == "cancel").sum()),
        "unsafe_recommendations": int(unsafe_target.sum()),
        "max_heat_increase": float(heat_delta.max()) if len(shifts) else 0.0,
        "max_aqi_increase": float(aqi_delta.max()) if len(shifts) else 0.0,
        "mean_heat_reduction": float(-heat_delta.mean()) if len(shifts) else 0.0,
        "mean_aqi_reduction": float(-aqi_delta.mean()) if len(shifts) else 0.0,
        "all_safe": bool(unsafe_target.sum() == 0),
    }
