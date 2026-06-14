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

## Results

Washington DC, 2022–2024, tested on a held-out 2024:

- Weather and time of day push forecast AUROC from 0.69 to 0.92.
- Calibration is what makes it usable. Balanced class weights leave the model badly overconfident
  (Brier 0.14, ECE 0.27); the unweighted model the app serves is well-calibrated (Brier 0.023).
- Cold drives most suppression, not heat — hot and smoky hours fall in summer, when ridership
  peaks, so every exposure term loads negative. The June 2023 wildfire smoke (AQI 196) cut ridership
  to 0.76× of normal, though several non-smoke days dipped further.
- Shifting sessions to a safer hour could recover up to ~32% of otherwise-lost activity (an upper
  bound), never pointing at an unsafe hour.

Full write-up in [`paper/paper.md`](paper/paper.md).

## Reproduce

```bash
python3 -m venv .venv
.venv/bin/pip install -r research/requirements.txt
cd research
PYTHONPATH=. ../.venv/bin/python scripts/build_data.py     # download + build the dataset
PYTHONPATH=. ../.venv/bin/python scripts/run_analysis.py   # figures + tables
PYTHONPATH=. ../.venv/bin/python scripts/train_model.py    # re-export model.js
```

## Roadmap

- Hourly air quality and a live AQI feed alongside the live weather pull.
- More cities, so the model isn't tied to one ridership pattern.
- Per-rider and per-activity personalization rather than a single city-wide forecast.
- Richer adaptations: route and intensity changes, not just time shifts.
- A small hosted API for apps that want the forecast without the page.

## Layout

| Path | What |
| --- | --- |
| `index.html`, `app.js`, `styles.css`, `model.js` | the app |
| `research/` | data, model, evaluation |
| `paper/` | the write-up |

## License

MIT. See [LICENSE](LICENSE).
