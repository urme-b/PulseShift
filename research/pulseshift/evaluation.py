"""Discrimination and calibration metrics."""

import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    average_precision_score,
    brier_score_loss,
    log_loss,
    roc_auc_score,
)


def _logit(p):
    p = np.clip(p, 1e-6, 1 - 1e-6)
    return np.log(p / (1 - p))


def calibration_fit(y_true, y_prob):
    """Cox calibration: regress outcome on predicted logit."""
    model = LogisticRegression(max_iter=2000)
    model.fit(_logit(y_prob).reshape(-1, 1), y_true)
    return float(model.coef_[0][0]), float(model.intercept_[0])


def expected_calibration_error(y_true, y_prob, n_bins=10):
    bins = np.linspace(0, 1, n_bins + 1)
    idx = np.digitize(y_prob, bins[1:-1])
    ece = 0.0
    for b in range(n_bins):
        mask = idx == b
        if mask.any():
            ece += mask.mean() * abs(y_true[mask].mean() - y_prob[mask].mean())
    return float(ece)


def metrics(y_true, y_prob):
    y_true = np.asarray(y_true)
    y_prob = np.asarray(y_prob)
    slope, intercept = calibration_fit(y_true, y_prob)
    return {
        "n": int(len(y_true)),
        "base_rate": float(y_true.mean()),
        "auroc": float(roc_auc_score(y_true, y_prob)),
        "auprc": float(average_precision_score(y_true, y_prob)),
        "brier": float(brier_score_loss(y_true, y_prob)),
        "log_loss": float(log_loss(y_true, np.clip(y_prob, 1e-6, 1 - 1e-6), labels=[0, 1])),
        "ece": expected_calibration_error(y_true, y_prob),
        "cal_slope": slope,
        "cal_intercept": intercept,
    }
