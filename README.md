# PulseShift

PulseShift estimates whether weather and air quality will suppress a planned outdoor activity
session, and recommends the safest way to keep it. It ships as a single static web page that runs a
calibrated model in the browser, backed by a reproducible Python pipeline and a written analysis.

Live demo: https://urme-b.github.io/PulseShift/

## Requirements

- A modern web browser, to run the app.
- Python 3.9 or newer, to reproduce the analysis or retrain the model.

## Installation

The app needs no installation. Open `index.html` directly, or serve the directory:

```
python3 -m http.server 8000
```

For the research pipeline:

```
python3 -m venv .venv
.venv/bin/pip install -r research/requirements.txt
```

## Usage

Enter the planned conditions — temperature, humidity, air quality, wind, rain, and hour — and the
app returns a calibrated suppression probability and a recommendation. "Use live DC weather" fills
the form from the National Weather Service forecast and reports the lowest-risk safe hour for the day.

A hard safety rule overrides the model: a heat index of 103°F or higher, or an AQI of 150 or higher,
is always reported as unsafe.

## Configuration

No configuration, API keys, or environment variables are required; the app calls only the public,
keyless National Weather Service API. Analysis parameters — study years, weather station, and
label/safety thresholds — are defined in `research/pulseshift/config.py`.

## How it works

A logistic regression predicts whether an hour of outdoor cycling is suppressed, defined as ridership
below half of a weather-free seasonal and diurnal baseline. The features are heat index, AQI,
humidity, wind, precipitation, two temperature hinge terms, visibility, a smoke flag, and a cyclical
encoding of hour and weekend. The model is trained in Python and exported to `model.js` as plain
coefficients; the page standardizes the inputs and applies them directly.

## Results

Evaluated out-of-time on 2024 (Washington DC, 2022–2024):

- Forecast AUROC of 0.94; gradient boosting does not improve on it.
- The unweighted model is well calibrated (Brier 0.022); class-weighting makes it overconfident,
  which post-hoc calibration corrects.
- Suppression is driven by cold rather than heat, since hot hours coincide with peak summer
  ridership. During the June 2023 wildfire smoke, ridership fell to 0.76x of normal at AQI 196.
- A safety-constrained time-shift policy recovers up to about 36% of otherwise-lost activity, an
  upper bound under perfect demand transfer.

The full write-up, figures, and confidence intervals are in `paper/paper.md`.

## Repository layout

```
index.html, app.js, styles.css, model.js, model.json   web app
paper/                                                  manuscript, figures, tables
research/pulseshift/                                    data, model, and evaluation modules
research/scripts/                                       build_data, run_analysis, train_model, validate_seoul
research/tests/                                         test suite
```

## Development

Reproduce the dataset, analysis, and model from public data:

```
cd research
PYTHONPATH=. ../.venv/bin/python scripts/build_data.py
PYTHONPATH=. ../.venv/bin/python scripts/run_analysis.py
PYTHONPATH=. ../.venv/bin/python scripts/train_model.py
PYTHONPATH=. ../.venv/bin/pytest tests/ -q
```

Tests also run in CI on every push. See `research/README.md` for pipeline details.

## Limitations

The suppression outcome is a constructed proxy from ridership, not recorded skipped sessions. The
study covers one city and one activity, air quality is measured daily, and the recovered-activity
figure is a model-based upper bound. These are detailed in the paper.

## License

MIT. See `LICENSE`.
