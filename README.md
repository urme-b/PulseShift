# PulseShift

[Live demo](https://urme-b.github.io/PulseShift/)

Will heat, cold, wind, or smoke wreck your outdoor session? PulseShift gives you a calibrated
risk for that and the safest way to still get it in. The page runs a real model — trained on
three years of Washington DC data — directly in the browser. No server, no build, no API keys.

## Run

Open `index.html`. That's the whole app; the model ships inside `model.js`, so double-clicking
the file works. To serve it instead:

```bash
python3 -m http.server 8800     # http://localhost:8800
```

Enter the conditions, or hit "Use live DC weather" to pull the current forecast from the NWS API.

## How it works

A logistic regression estimates the probability that an hour of outdoor cycling is *suppressed* —
ridership falling below half of its normal level for that hour, day, and season. The model is
trained in Python and exported to `model.js` as plain coefficients, so the page only has to scale
the inputs and run a dot product through a sigmoid. A safety rule sits on top: heat index ≥ 103°F
or AQI ≥ 150 flags the hour unsafe regardless of the model output, so the tool never trades safety
for participation.

## Tech

- **Frontend** — vanilla HTML, CSS, and JavaScript. Zero dependencies, no build step, fully
  client-side, deployable as a static site (GitHub Pages).
- **Model** — scikit-learn logistic regression on standardized features, exported to JSON. Browser
  inference is `sigmoid(intercept + Σ coefᵢ · (xᵢ − meanᵢ) / scaleᵢ)`.
- **Research pipeline** — Python with pandas, scikit-learn, scipy, and matplotlib. One command
  builds the dataset, another trains, evaluates, and exports the model.
- **Data** — Capital Bikeshare trip history, NOAA Local Climatological Data (Reagan National), and
  EPA daily AQI, all public and pulled by the pipeline.
- **Tests/CI** — `pytest` guards the heat index, the leak-free label, the safety policy, and
  model-export parity; GitHub Actions runs them on every push.

## Results

Washington DC, 2022–2024, tested on a held-out 2024:

- Weather and time of day push forecast AUROC from 0.69 to 0.94; a gradient-boosting model doesn't
  beat the logistic, so the minimal model suffices.
- Calibration is what makes it usable. Balanced class weights leave the model badly overconfident
  (Brier 0.13, ECE 0.26); the unweighted model the app serves is well-calibrated (Brier 0.022).
- With precipitation and a cold-stress term, the model recovers correctly-signed drivers (rain and
  cold both raise suppression); heat still loads negative through seasonal confounding.
- Controlling for weather and season across 1,096 days, +50 AQI ≈ a 5.6-point drop in the daily ride
  ratio (95% CI 1.1–10.9). The June 2023 wildfire smoke (AQI 196) cut ridership to 0.76× of normal.
- A safety-constrained time-shift policy could recover up to ~36% of otherwise-lost activity (upper
  bound), never pointing at an unsafe hour. The framework also transfers to Seoul (AUROC 0.95 on a
  small held-out tail).

Full write-up in [`paper/paper.md`](paper/paper.md).

## Reproduce

```bash
python3 -m venv .venv
.venv/bin/pip install -r research/requirements.txt
cd research
PYTHONPATH=. ../.venv/bin/python scripts/build_data.py     # download + build the dataset
PYTHONPATH=. ../.venv/bin/python scripts/run_analysis.py   # figures + tables
PYTHONPATH=. ../.venv/bin/python scripts/train_model.py    # re-export model.js
PYTHONPATH=. ../.venv/bin/python scripts/validate_seoul.py # external check (Seoul)
PYTHONPATH=. ../.venv/bin/pytest tests/ -q                 # tests
```

## Roadmap

Recently added: precipitation + nonlinear temperature, a gradient-boosting comparator, bootstrap
CIs, a multi-day AQI event study, a cost-sensitive operating point, Seoul as a second city, a
"best safe hour today" view, and tests + CI. Still open:

- Hourly air quality (EPA's hourly feed is throttled too hard to pull at a practical rate).
- Neighbourhood/demographic equity — needs a spatial re-aggregation of trips and a census join.
- Per-rider personalization and a small hosted API.
- A Zenodo deposit for a citable dataset+code DOI.

## Layout

| Path | What |
| --- | --- |
| `index.html`, `app.js`, `styles.css`, `model.js` | the app |
| `research/` | data, model, evaluation |
| `paper/` | the write-up |

## License

MIT. See [LICENSE](LICENSE).
