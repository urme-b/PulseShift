# PulseShift

[![CI](https://github.com/urme-b/PulseShift/actions/workflows/ci.yml/badge.svg)](https://github.com/urme-b/PulseShift/actions/workflows/ci.yml)
[![Python](https://img.shields.io/badge/python-3.11%20%7C%203.12-blue.svg)](research/requirements.txt)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

PulseShift forecasts whether weather and air quality will suppress a planned outdoor session, and
recommends the safest way to keep it. It is a single static web page that runs a calibrated model in
the browser, backed by a reproducible Python pipeline and a written analysis on three years of real
Washington DC data.

Live demo: https://urme-b.github.io/PulseShift/

## What it does

You give it the conditions for a planned session; it returns a calibrated probability that the
session will be lost to the weather, plus a recommendation. A hard safety rule sits above the model:
a heat index of 103°F or higher, or an AQI of 150 or higher, is always flagged unsafe. With the live
forecast it also reports the lowest-risk safe hour for the day.

## Results

Trained on Washington DC, 2022–2024, and evaluated out-of-time on a held-out 2024.

Calibration, not raw accuracy, is what makes a forecast usable. Class-weighting the model leaves it
badly overconfident; the unweighted model the app serves stays on the diagonal.

<img src="paper/figures/reliability.png" alt="Reliability diagram: served model tracks the ideal line; the balanced model is overconfident" width="440">

Cold drives most suppression here, not heat, because hot and smoky hours fall in peak summer
ridership. The June 2023 Canadian-wildfire smoke is the clean exception: at AQI 196, ridership fell
to 0.76x of normal.

<img src="paper/figures/smoke_event.png" alt="June 2023 wildfire smoke: AQI spikes to 196 as hourly ridership drops" width="680">

- Forecast AUROC rises from 0.69 (a season-aware baseline) to 0.94; gradient boosting does not beat it.
- The served model is well calibrated out-of-time (Brier 0.022).
- Controlling for weather and season across 1,096 days, a 50-point AQI rise is associated with a
  5.6-point drop in the daily ride ratio (95% CI 1.1 to 10.9).
- A safety-constrained time-shift policy recovers up to ~36% of otherwise-lost activity (an upper bound).
- The same pipeline reaches AUROC 0.87 on a second city, Seoul.

Full write-up, figures, and confidence intervals: [`paper/paper.md`](paper/paper.md).

## How it works

A logistic regression predicts whether an hour of outdoor cycling is suppressed — ridership below
half of a weather-free seasonal and diurnal baseline. Features are heat index, AQI, humidity, wind,
precipitation, two temperature hinge terms, visibility, a smoke flag, and a cyclical encoding of hour
and weekend. The model is trained in Python and exported to `model.js` as twelve coefficients; the
page standardizes the inputs and applies them directly, so inference is a dot product through a
sigmoid — no server, no build step, no keys.

## Method

- **Leak-free, out-of-time validation.** Trained on 2022–2023 and tested on a held-out 2024. The
  suppression label uses a climatology fit on the training years only, with the test-year volume
  carried forward, so no test-period information enters the label.
- **Calibration as a first-class metric.** Brier score, log loss, expected calibration error,
  calibration slope, and a decision curve, compared across unweighted, class-weighted, and
  isotonic-recalibrated variants — not AUROC alone.
- **Quantified uncertainty.** 95% confidence intervals by bootstrap, resampled over days for the
  policy metric.
- **Confound-aware effects.** The air-quality effect is estimated by a regression adjusted for
  temperature, precipitation, season, and weekend across 1,096 days, separating it from the seasonal
  confounding that makes naive exposure curves misleading.

The full pipeline, paper, and tests live in [`research/`](research/) and [`paper/`](paper/).

## Tech stack

| Layer | Choice |
| --- | --- |
| App | Vanilla HTML, CSS, and JavaScript — zero dependencies, static-hostable |
| Model | scikit-learn logistic regression, exported to JSON and run in the browser |
| Pipeline | Python, pandas, scikit-learn, scipy, matplotlib |
| Data | Capital Bikeshare, NOAA Local Climatological Data, EPA AirData (all public) |
| Quality | pytest, GitHub Actions CI, bootstrap confidence intervals, decision-curve analysis |

## Future scope

- [ ] Validate against observed session data, not a ridership proxy
- [ ] Extend to more cities and activities
- [ ] Add hourly air quality
- [ ] Neighborhood-level equity analysis
- [ ] Expose the forecast as a small API

## License

[MIT License](LICENSE)
