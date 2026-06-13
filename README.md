# PulseShift

[Live demo](https://urme-b.github.io/PulseShift/)

Will heat, cold, wind, or smoke wreck your outdoor session? PulseShift gives you a
calibrated risk for that, and the safest way to still get the session in. The page runs a
real model — trained on three years of Washington DC data — right in your browser. No
server, no build, no API keys.

## Run it

Open `index.html`. That's the whole app (the model is baked into `model.js`, so even
double-clicking the file works). If you'd rather serve it:

```bash
python3 -m http.server 8800     # then open http://localhost:8800
```

Type in the conditions, or hit "Use live DC weather" to pull the current forecast from the
NWS API.

## How it works

The model is a logistic regression. It estimates the chance an hour of outdoor cycling gets
*suppressed* — ridership dropping below half of what's normal for that hour, day, and season.
It's trained in `research/` and exported to `model.js`, so the page just scales the inputs
and runs the numbers. One rule sits on top: if the heat index hits 103°F or AQI hits 150, the
hour is flagged unsafe no matter what the model says.

## What the data show

Washington DC, 2022–2024, tested on a held-out 2024:

- Weather and time of day push forecast AUROC from 0.66 to 0.89.
- The model is only trustworthy once calibrated. Balanced class weights make it wildly
  overconfident (Brier 0.14); calibration pulls it back to 0.04 without costing accuracy.
- Cold drives most suppression here, not heat — hot and smoky hours land in summer, when
  ridership peaks anyway. The June 2023 wildfire smoke is the clean exception: at AQI 196,
  ridership fell to 0.76× of normal.
- Shifting sessions to a safer hour recovers up to ~37% of the activity that would otherwise
  be lost, and never points you at an unsafe hour.

The full write-up is in [`paper/paper.md`](paper/paper.md).

## Reproduce it

```bash
python3 -m venv .venv
.venv/bin/pip install -r research/requirements.txt
cd research
PYTHONPATH=. ../.venv/bin/python scripts/build_data.py     # download + build the dataset
PYTHONPATH=. ../.venv/bin/python scripts/run_analysis.py   # figures + tables
PYTHONPATH=. ../.venv/bin/python scripts/train_model.py    # re-export model.js
```

Everything comes from public data: Capital Bikeshare trips, NOAA weather (Reagan National),
and EPA daily AQI.

## Caveats

One city, one activity. There's no dataset that records skipped sessions, so the suppression
label is constructed from ridership, and the recovered-activity number is a model-based upper
bound. The paper spells this out.

## Layout

| Path | What |
| --- | --- |
| `index.html`, `app.js`, `styles.css`, `model.js` | the app |
| `research/` | data, model, evaluation |
| `paper/` | the write-up |
