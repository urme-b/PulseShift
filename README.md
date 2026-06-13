# PulseShift

**[Live Demo →](https://urme-b.github.io/PulseShift/)**

PulseShift forecasts whether climate stress will **suppress** an outdoor activity session — heat,
cold, wind, or smoke — and recommends the safest way to keep it. The web app is a single page that
runs a **real model trained on real Washington DC data** entirely in your browser. No server, no
build step, no keys.

## Two parts

1. **The app** — `index.html` + `app.js` + `styles.css` + `model.js`. Open it and enter conditions;
   it returns a calibrated suppression-risk forecast and a safety-aware recommendation. The model
   parameters in `model.js` are exported from the research pipeline, so the tool reflects the actual
   fitted model — not a hand-tuned heuristic.
2. **The research** — [`research/`](research/) builds the dataset and trains/evaluates the model;
   [`paper/paper.md`](paper/paper.md) is the write-up. This is the evidence behind the app.

## Use it

Just open `index.html` in a browser (double-click works — the model is embedded). Or serve it:

```bash
python3 -m http.server 8800   # then open http://localhost:8800
```

Enter temperature, humidity, AQI, wind, hour, and flags, or click **Use live DC weather** to pull
current conditions from the (keyless) NWS API.

## What the study found

On real DC data (2022–2024), with out-of-time (2024) validation:

- Environmental + temporal features lift suppression-forecast **AUROC from 0.66 to 0.89**.
- A **balanced** logistic model is badly **over-confident** (Brier 0.136, ECE 0.249); both an
  unweighted model and isotonic calibration restore reliability (Brier ≈ 0.04) — calibration, not
  accuracy, is what makes the risk usable.
- Marginal exposure–response is **confounded by season** (cold dominates suppression here), but
  during the **June 2023 wildfire-smoke episode** ridership fell to **0.76× expected at AQI 196**.
- A safety-constrained time-shift policy could recover **up to ~37% of otherwise-lost activity**
  while never recommending an unsafe hour.

## Retrain / reproduce

```bash
python3 -m venv .venv
.venv/bin/pip install -r research/requirements.txt
cd research
PYTHONPATH=. ../.venv/bin/python scripts/build_data.py     # download + build the panel
PYTHONPATH=. ../.venv/bin/python scripts/run_analysis.py   # figures + tables
PYTHONPATH=. ../.venv/bin/python scripts/train_model.py    # export model.js + model.json
```

Sources: Capital Bikeshare trips, NOAA Local Climatological Data (Reagan National), EPA daily AQI.

## Structure

| Path | Purpose |
| --- | --- |
| `index.html`, `app.js`, `styles.css` | The browser app |
| `model.js`, `model.json` | The trained model, exported from the pipeline |
| `research/pulseshift/` | Data, model, calibration, evaluation, RAM, equity, safety |
| `research/scripts/` | `build_data.py`, `run_analysis.py`, `train_model.py` |
| `paper/` | Manuscript, figures, tables |

## Honest scope

The app forecasts *ridership suppression*; because DC suppression is cold-dominated, hot days score
low suppression — so the app applies a hard **safety override** (dangerous heat or AQI → "move
indoors / reschedule") regardless of the model risk. The suppression label is *constructed* from
ridership relative to a weather-free climatology, the study is one city and one activity, and RAM is
a model-based upper bound. These limitations are stated in the paper.
