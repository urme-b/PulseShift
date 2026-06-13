"""Probability calibration and reliability."""

from sklearn.calibration import CalibratedClassifierCV, calibration_curve

from .features import MODEL_FEATURES


def calibrate(model, calib_df, method="isotonic", features=MODEL_FEATURES):
    calibrated = CalibratedClassifierCV(model, method=method, cv="prefit")
    calibrated.fit(calib_df[features], calib_df["suppressed"])
    return calibrated


def reliability(y_true, y_prob, n_bins=10):
    frac_pos, mean_pred = calibration_curve(y_true, y_prob, n_bins=n_bins, strategy="quantile")
    return mean_pred, frac_pos
