"""Download and assemble real DC activity, weather, and air-quality series."""

import io
import zipfile
import urllib.request
from pathlib import Path

import numpy as np
import pandas as pd

from . import config


def _download(url, dest):
    dest = Path(dest)
    if dest.exists() and dest.stat().st_size > 0:
        return dest
    dest.parent.mkdir(parents=True, exist_ok=True)
    req = urllib.request.Request(url, headers={"User-Agent": "pulseshift-research/1.0"})
    with urllib.request.urlopen(req, timeout=120) as response, open(dest, "wb") as out:
        while True:
            chunk = response.read(1 << 20)
            if not chunk:
                break
            out.write(chunk)
    return dest


def _to_numeric(series):
    cleaned = series.astype(str).str.replace(r"[^0-9.\-]", "", regex=True)
    return pd.to_numeric(cleaned, errors="coerce")


def load_bikeshare():
    """City-wide hourly ride counts (UTC), split by rider type."""
    cache = config.INTERIM / "bikeshare_hourly.csv"
    if cache.exists():
        return pd.read_csv(cache, parse_dates=["ts_utc"])

    frames = []
    for ym in config.ym_list():
        path = _download(config.BIKESHARE_URL.format(ym=ym), config.RAW / f"cabi_{ym}.zip")
        with zipfile.ZipFile(path) as archive:
            members = [n for n in archive.namelist() if n.lower().endswith(".csv") and "macosx" not in n.lower()]
            for name in members:
                with archive.open(name) as handle:
                    df = pd.read_csv(handle, usecols=["started_at", "member_casual"], low_memory=False)
                frames.append(df)

    trips = pd.concat(frames, ignore_index=True)
    started = pd.to_datetime(trips["started_at"], errors="coerce")
    local = started.dt.tz_localize(
        config.LOCAL_TZ, ambiguous="NaT", nonexistent="shift_forward"
    )
    trips = trips.assign(ts_utc=local.dt.tz_convert("UTC").dt.floor("h")).dropna(subset=["ts_utc"])
    trips["ts_utc"] = trips["ts_utc"].dt.tz_localize(None)

    pivot = (
        trips.assign(member_casual=trips["member_casual"].fillna("unknown"))
        .pivot_table(index="ts_utc", columns="member_casual", aggfunc="size", fill_value=0)
        .rename(columns={"member": "rides_member", "casual": "rides_casual"})
    )
    pivot["rides_total"] = pivot.sum(axis=1)
    out = pivot.reset_index()[["ts_utc", "rides_member", "rides_casual", "rides_total"]]
    cache.parent.mkdir(parents=True, exist_ok=True)
    out.to_csv(cache, index=False)
    return out


def load_weather():
    """Hourly DCA weather (UTC) from NOAA LCD."""
    cache = config.INTERIM / "weather_hourly.csv"
    if cache.exists():
        return pd.read_csv(cache, parse_dates=["ts_utc"])

    cols = [
        "DATE",
        "HourlyDryBulbTemperature",
        "HourlyRelativeHumidity",
        "HourlyDewPointTemperature",
        "HourlyWindSpeed",
        "HourlyVisibility",
        "HourlyPresentWeatherType",
    ]
    frames = []
    for year in config.YEARS:
        path = _download(
            config.LCD_URL.format(year=year, station=config.LCD_STATION),
            config.RAW / f"lcd_{year}.csv",
        )
        df = pd.read_csv(path, usecols=lambda c: c in cols, low_memory=False)
        frames.append(df)

    lcd = pd.concat(frames, ignore_index=True)
    stamp = pd.to_datetime(lcd["DATE"], errors="coerce")
    # LCD is local standard time (UTC-5) year round.
    lcd["ts_utc"] = stamp.dt.tz_localize("Etc/GMT+5").dt.tz_convert("UTC").dt.tz_localize(None)
    lcd["smoke_haze"] = (
        lcd["HourlyPresentWeatherType"].astype(str).str.contains("HZ|FU|smoke|haze", case=False, na=False)
    ).astype(int)
    for col in cols[1:6]:
        lcd[col] = _to_numeric(lcd[col])

    lcd["hour"] = lcd["ts_utc"].dt.floor("h")
    hourly = (
        lcd.dropna(subset=["hour"])
        .groupby("hour")
        .agg(
            temp_f=("HourlyDryBulbTemperature", "mean"),
            humidity=("HourlyRelativeHumidity", "mean"),
            dewpoint_f=("HourlyDewPointTemperature", "mean"),
            wind_mph=("HourlyWindSpeed", "mean"),
            visibility_mi=("HourlyVisibility", "mean"),
            smoke_haze=("smoke_haze", "max"),
        )
        .reset_index()
        .rename(columns={"hour": "ts_utc"})
    )
    cache.parent.mkdir(parents=True, exist_ok=True)
    hourly.to_csv(cache, index=False)
    return hourly


def load_pm25():
    """Hourly DC PM2.5 (UTC) from EPA AQS, averaged across monitors."""
    cache = config.INTERIM / "pm25_hourly.csv"
    if cache.exists():
        return pd.read_csv(cache, parse_dates=["ts_utc"])

    use = ["State Code", "County Code", "Date GMT", "Time GMT", "Sample Measurement"]
    parts = []
    for year in config.YEARS:
        path = _download(config.EPA_HOURLY_PM25_URL.format(year=year), config.RAW / f"epa_pm25_{year}.zip")
        for chunk in pd.read_csv(path, usecols=use, compression="zip", chunksize=500_000, low_memory=False):
            dc = chunk[(chunk["State Code"] == 11) & (chunk["County Code"] == 1)]
            if len(dc):
                parts.append(dc.copy())

    pm = pd.concat(parts, ignore_index=True)
    pm["ts_utc"] = pd.to_datetime(pm["Date GMT"] + " " + pm["Time GMT"], errors="coerce")
    hourly = (
        pm.dropna(subset=["ts_utc"])
        .groupby("ts_utc")["Sample Measurement"]
        .mean()
        .reset_index()
        .rename(columns={"Sample Measurement": "pm25"})
    )
    hourly["pm25"] = hourly["pm25"].clip(lower=0)
    cache.parent.mkdir(parents=True, exist_ok=True)
    hourly.to_csv(cache, index=False)
    return hourly
