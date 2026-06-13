# PulseShift research pipeline

Reproducible analysis behind the paper: forecasting climate-driven suppression of
physical activity in Washington DC, and ranking behaviour-preserving adaptations.

## Data

All sources are public and downloaded by the pipeline. Nothing is hand-edited.

| Source | What | Access |
| --- | --- | --- |
| Capital Bikeshare trip history | Hourly outdoor-activity volume (2022-2024) | public S3 bucket |
| NOAA Local Climatological Data (DCA) | Hourly temperature, humidity, dew point, wind, visibility, smoke/haze | NCEI open data |
| EPA AQS hourly PM2.5 | Hourly air quality for DC monitors | EPA AirData |

Activity, weather, and air quality are aligned on UTC, then expressed in local time.
The suppression outcome is constructed (no public dataset labels skipped sessions): an
active hour is *suppressed* when observed ridership falls below half of its weather-free
temporal climatology (`season x daytype x hour`). See `pulseshift/panel.py`.

## Run

```bash
python3 -m venv ../.venv
../.venv/bin/pip install -r requirements.txt

PYTHONPATH=. ../.venv/bin/python scripts/build_data.py     # download + build panel
PYTHONPATH=. ../.venv/bin/python scripts/run_analysis.py   # models, figures, tables
```

Outputs land in `../paper/figures` and `../paper/tables` (including `summary.json`).

## Layout

| Path | Purpose |
| --- | --- |
| `pulseshift/ingest.py` | Download and assemble the three real series |
| `pulseshift/panel.py` | Merge, label suppression, write the analysis panel |
| `pulseshift/features.py` | Heat index, AQI, temporal encodings |
| `pulseshift/models.py` | Climatology baseline and logistic model |
| `pulseshift/calibration.py` | Probability calibration and reliability |
| `pulseshift/evaluation.py` | Brier, log loss, AUROC, AUPRC, calibration slope |
| `pulseshift/ram.py` | Time-shift adaptation and Recovered Active Minutes |
| `pulseshift/decision.py` | Decision-curve net benefit |
| `pulseshift/equity.py` | Subgroup stratification |
| `pulseshift/safety.py` | Audit that adaptations never raise exposure |
| `pulseshift/plots.py` | Figures |
