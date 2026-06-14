<div align="center">

# 🚴 PulseShift

**Will heat, cold, wind, or smoke wreck your outdoor session?**
A calibrated forecast — and the safest way to keep it — running entirely in your browser.

[![CI](https://github.com/urme-b/PulseShift/actions/workflows/ci.yml/badge.svg)](https://github.com/urme-b/PulseShift/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Live demo](https://img.shields.io/badge/demo-live-2dd4a7)](https://urme-b.github.io/PulseShift/)
[![Python 3.9+](https://img.shields.io/badge/python-3.9%2B-3776ab)](research/requirements.txt)

### [▶ Try the live demo](https://urme-b.github.io/PulseShift/)

</div>

---

PulseShift turns weather and air quality into a single decision: a **calibrated probability** that an
hour of outdoor activity gets *suppressed*, plus a **safety-aware recommendation**. The page runs a
real model — trained on three years of Washington DC data — with **no server, no build, and no API
keys**. The research pipeline and [paper](paper/paper.md) behind every number live in this repo.

## ✨ Highlights

- 🧠 **Real model, in the browser** — a calibrated logistic forecast (AUROC **0.94**) exported to plain
  coefficients; inference is a dot product through a sigmoid in ~15 lines of JS.
- 🛡️ **Safety override** — dangerous heat (≥103 °F) or AQI (≥150) is flagged *unsafe* no matter what
  the model says, so the tool never trades safety for participation.
- ⏰ **Best safe hour today** — pulls the keyless NWS hourly forecast and finds the lowest-risk safe hour.
- 🔬 **Reproducible** — two commands rebuild every figure and table from public data; byte-identical.
- ✅ **Tested + CI**, zero-dependency frontend, deploys as a static site.

## 🚀 Quick start

Open `index.html` in a browser — that's the whole app (the model is embedded). Or serve it:

```bash
python3 -m http.server 8000        # then open http://localhost:8000
```

Enter conditions, or hit **Use live DC weather** to pull the current forecast.

## 📊 What the data show

Washington DC, 2022–2024, evaluated out-of-time on 2024.

**Calibration is what makes a forecast usable.** Balanced class weights leave the model badly
over-confident; the unweighted model we serve is well-calibrated and hugs the diagonal:

<img src="paper/figures/reliability.png" alt="Reliability diagram" width="420">

**Cold — not heat — dominates suppression here**, because hot and smoky hours fall in summer when
ridership peaks (a season confound), so every exposure term loads negative. But the **June 2023
wildfire smoke** is a clean exception: at AQI 196, ridership fell to **0.76× of normal**.

<img src="paper/figures/smoke_event.png" alt="June 2023 wildfire smoke event" width="640">

- Environmental + temporal features lift forecast **AUROC 0.69 → 0.94**; gradient boosting doesn't beat it.
- Controlling for weather and season across 1,096 days, **+50 AQI ≈ −5.6 pp** daily ride ratio (95% CI −10.9 to −1.1).
- A safety-constrained time-shift policy could recover **up to ~36%** of otherwise-lost activity (upper bound).
- The framework transfers to a second city, **Seoul** (AUROC 0.87 on a random hold-out).

Full write-up with confidence intervals and limitations: **[`paper/paper.md`](paper/paper.md)**.

## 🔍 How it works

A logistic regression estimates the chance an hour of outdoor cycling is *suppressed* — ridership
below half of a weather-free temporal climatology (`season × daytype × hour`, fit leak-free). Inputs
are heat index, AQI, humidity, wind, precipitation, two temperature hinges, visibility, a smoke flag,
and cyclical hour/weekend. Trained in Python, exported to `model.js`, and run client-side; a hard
safety envelope sits on top of the model output.

## 🧪 Reproduce

```bash
python3 -m venv .venv
.venv/bin/pip install -r research/requirements.txt
cd research
PYTHONPATH=. ../.venv/bin/python scripts/build_data.py     # download + build the panel
PYTHONPATH=. ../.venv/bin/python scripts/run_analysis.py   # figures + tables
PYTHONPATH=. ../.venv/bin/python scripts/train_model.py    # export model.js
PYTHONPATH=. ../.venv/bin/python scripts/validate_seoul.py # cross-city check
PYTHONPATH=. ../.venv/bin/pytest tests/ -q                 # tests
```

Sources: Capital Bikeshare trip history, NOAA Local Climatological Data (Reagan National), EPA daily AQI — all public.

## 🗂 Structure

```
PulseShift/
├── index.html  app.js  styles.css  model.js  model.json   # the app (static, client-side)
├── .github/workflows/ci.yml                                # tests on every push
├── paper/
│   ├── paper.md                                            # manuscript
│   └── figures/   tables/                                  # generated artifacts
└── research/
    ├── pulseshift/   # ingest · panel · features · models · calibration ·
    │                 # evaluation · ram · decision · equity · safety · plots
    ├── scripts/      # build_data · run_analysis · train_model · validate_seoul
    ├── tests/        # pytest
    └── data/processed/panel.csv.gz                         # committed for reproducibility
```

## 🧱 Tech

| Layer | Stack |
| --- | --- |
| Frontend | Vanilla HTML/CSS/JS — zero dependencies, no build, static-hostable |
| Model | scikit-learn logistic regression → JSON; browser inference `sigmoid(β·z)` |
| Pipeline | Python · pandas · scikit-learn · scipy · matplotlib |
| Quality | `pytest` + GitHub Actions CI |

## ⚠️ Scope & limitations

The app forecasts *ridership suppression*; the suppression label is a **constructed** proxy (no
public dataset records skipped sessions). It's **one city, one activity**, AQI is daily, and the
recovered-activity figure is a **model-based upper bound**. These are detailed in the paper —
engineering caveats are none; these are scientific bounds on the claims.

## 📄 License

MIT — see [LICENSE](LICENSE).
