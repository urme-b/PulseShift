"""Assemble the hourly analysis panel and define the suppression label."""

import pandas as pd

from . import config, ingest
from .features import add_temporal, heat_index_f


def _expected_rides(df):
    """Weather-free temporal climatology of typical ridership."""
    keys = ["year", "season", "daytype", "hour"]
    return df.groupby(keys)["rides_total"].transform("median")


def label_suppression(df, ratio=config.SUPPRESSION_RATIO, floor=config.EXPECTED_FLOOR):
    expected = df["expected_rides"]
    active = expected >= floor
    suppressed = (df["rides_total"] < ratio * expected) & active
    return active, suppressed.astype(int)


def build_panel(write=True):
    bikes = ingest.load_bikeshare()
    weather = ingest.load_weather()
    aqi = ingest.load_aqi()

    for frame in (bikes, weather):
        frame["ts_utc"] = pd.to_datetime(frame["ts_utc"])

    panel = bikes.merge(weather, on="ts_utc", how="inner").sort_values("ts_utc").reset_index(drop=True)
    for col in ["temp_f", "humidity", "dewpoint_f", "wind_mph", "visibility_mi"]:
        panel[col] = panel[col].interpolate(limit=3).ffill(limit=3).bfill(limit=3)

    panel["ts_local"] = panel["ts_utc"].dt.tz_localize("UTC").dt.tz_convert(config.LOCAL_TZ).dt.tz_localize(None)
    panel["date"] = panel["ts_local"].dt.normalize()
    panel = panel.merge(aqi[["date", "aqi", "aqi_category", "defining_parameter"]], on="date", how="left")
    panel["aqi"] = panel["aqi"].ffill().bfill()

    panel = add_temporal(panel)
    panel["is_weekend"] = (panel["daytype"] == "weekend").astype(int)
    panel["heat_index_f"] = heat_index_f(panel["temp_f"], panel["humidity"])
    panel = panel.dropna(subset=["temp_f", "humidity", "aqi"]).reset_index(drop=True)

    panel["expected_rides"] = _expected_rides(panel)
    panel["active_hour"], panel["suppressed"] = label_suppression(panel)

    if write:
        config.PROCESSED.mkdir(parents=True, exist_ok=True)
        panel.to_csv(config.PROCESSED / "panel.csv", index=False)
    return panel


def load_panel():
    path = config.PROCESSED / "panel.csv"
    if not path.exists():
        return build_panel()
    return pd.read_csv(path, parse_dates=["ts_utc", "ts_local"])


def active(panel):
    return panel[panel["active_hour"]].reset_index(drop=True)
