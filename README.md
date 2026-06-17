<div align="center">

# PulseShift

### A weather-and-air-quality model that forecasts when an outdoor session gets ruined — running entirely in your browser, zero dependencies, nothing to install.

**Air quality barely affects outdoor mobility once you control for season — and the research layer here shows why.**

### ▶ **[Try the live demo](https://urme-b.github.io/PulseShift/)** — type in conditions, get a calibrated forecast. 5 seconds, nothing to install.

</div>

---

## Try it in 5 seconds

Open **[the demo](https://urme-b.github.io/PulseShift/)** and type in tonight's conditions — temperature, humidity, wind, rain, AQI, start hour. You get back:

- **The odds** that weather will *suppress* your outdoor session — ridership falling below half of a normal day for that season and hour.
- **A recommendation** — keep your plan, shorten it, shift it, or move indoors.
- **A hard safety override.** Heat index ≥ 103 °F or AQI ≥ 150 → flagged unsafe, full stop. The rule sits *on top of* the model and the probability can never talk you past it.
- Hit **"Use live DC weather"** and it pulls the real DC forecast (National Weather Service + Open-Meteo hourly AQI, both keyless) and points to the lowest-risk *safe* daytime hour ahead.

No sign-up, no API key, no backend. The page is a single static file you can host anywhere.

## The model runs in your browser

There is no server doing inference, no WebAssembly blob, no ONNX runtime, no 50 MB download. The whole model is **12 logistic-regression coefficients** in [`model.js`](model.js), and a prediction is a dot product through a sigmoid in vanilla JavaScript:

```js
let z = M.intercept;
M.features.forEach((name, i) => {
  z += M.coef[i] * ((f[name] - M.mean[i]) / M.scale[i]); // standardize, then weight
});
return 1 / (1 + Math.exp(-z));                            // sigmoid → probability
```

That's the entire inference path. Train in Python with scikit-learn → export the standardizer and coefficients to JSON → ship it.

```
Python (scikit-learn)  ──train──►  model.js (12 coefficients)  ──dot product──►  forecast in your browser
```

**Zero dependencies. Zero build step. Zero keys.**

---

## So... does air quality actually keep people indoors?

This is where PulseShift stops being a forecast widget and becomes a study. The brand of this project is honesty, so here is the finding straight:

**The effect of air quality on outdoor mobility depends entirely on how you measure it.** Measure it one way and pollution looks *good* for you. Measure it carefully and it nearly vanishes.

Daily AQI is treacherous: the dirtiest days are hot, stagnant summer days — exactly when outdoor activity peaks. So a regression of activity on daily pollution can report almost anything, *including that pollution is protective.* The fix is to stop comparing *days* and start comparing *hours within the same day*, which holds season, weather regime, and day-of-week fixed. That needs **hourly** AQI — the one data change that makes honest identification possible.

Run the same DC data up an **identification ladder** and the apparent effect collapses toward zero:

| How you measure the AQI effect | Effect (ride-ratio pts per +50 AQI) | 95% CI |
| --- | --- | --- |
| **Marginal** (no controls) | *positive* — apparently **protective** | seasonal confound |
| **Between-day** (season + weather controlled) | **−10.9** | −14.6 to −7.3 |
| **Within-day** (day & hour fixed effects) | **−2.4** | −5.9 to **+1.1** *(crosses zero)* |
| **Matched** high-AQI vs clean hours | **1.01×** of clean | 0.94 to 1.08 |

<div align="center">
<img src="paper/figures/aqi_identification.png" alt="Forest plot: the air-quality effect shrinks from a large negative value to near zero as identification tightens from between-day to within-day" width="600">
<br><em>The air-quality effect collapses toward zero as identification tightens from between-day to within-day.</em>
</div>

**And this isn't lost power.** The within-day estimate is as precise as the between-day one (SE 1.8 vs 1.9), and the design's 80%-power threshold (~5 points) sits well below the −10.9 between-day estimate — an effect that size *would* have shown up within-day. It didn't. The collapse is real de-confounding: most of the large negative effect a daily specification reports is **seasonal confounding**, and only hourly, within-day data exposes it.

The practical upshot for the forecast: **air quality adds essentially nothing beyond weather** (ΔAUROC ≈ 0). In this city it's **cold and rain** that suppress outdoor mobility, not smoke.

> The June 2023 Canadian-wildfire smoke is the vivid exception that proves the rule. On 8 June ridership fell to 0.76× of expected — but as a single day it's only the 6th-lowest of 66 summer weekdays and coincided with official advisories, so it can't carry a population claim. The within-day estimate is the credible evidence, and it's modest.

---

## The evidence: calibration is the lesson, not accuracy

Washington DC, 2022–2024. Capital Bikeshare volumes as a proxy for outdoor mobility, NOAA weather, and hourly air quality — all public, all keyless. The panel is **26,288 city-hours** (24,354 clear the activity floor, 6.0% suppressed), with a leak-free out-of-time split: **train on 2022–2023** (16,150 hours), **test on held-out 2024** (8,204 hours, 2.5% suppressed). The model the app serves is then refit on all three years.

A forecast that's accurate but overconfident is useless, so PulseShift evaluates **calibration first** — whether "70%" actually means 70% — not AUROC alone. Class-weighting, the textbook default for imbalanced labels, wins on AUROC but leaves the model badly overconfident, with a Brier score *worse than doing nothing*. The unweighted model the app serves stays on the diagonal.

| Model | AUROC | Brier | ECE |
| --- | --- | --- | --- |
| Season-aware climatology (baseline) | 0.692 | 0.027 | 0.053 |
| **Logistic, unweighted (served)** | **0.936** | **0.021** | **0.044** |
| Logistic, class-weighted | 0.940 | 0.128 | 0.253 |
| Gradient boosting | 0.941 | 0.025 | 0.046 |

<sub>Test year 2024, n = 8,204. Served-model 95% CIs (day-clustered bootstrap): AUROC 0.90–0.97, Brier 0.017–0.026, ECE 0.036–0.052. Full table — AUPRC, calibration slope, isotonic variant — in [`paper/paper.md`](paper/paper.md).</sub>

Weather features lift AUROC from **0.69** (the season-aware baseline) to **0.94**; gradient boosting ties it, so the simple model ships. The served model is well calibrated out-of-time: **Brier 0.021, ECE 0.044**.

<div align="center">
<img src="paper/figures/reliability.png" alt="Reliability diagram: the served model tracks the ideal diagonal while the class-weighted model is badly overconfident" width="460">
<br><em>The served model tracks the ideal line. The class-weighted model is overconfident — fine on AUROC, unusable in practice.</em>
</div>

The exposure–response curves below are the *confounded* marginal associations that motivate the whole identification ladder: suppression appears to *drop* as AQI climbs, purely because dirty hours are busy summer hours.

<div align="center">
<img src="paper/figures/exposure_response.png" alt="Marginal suppression rate by heat index and by AQI" width="600">
<br><em>Marginal suppression by heat index and by AQI. The AQI panel is the trap — it looks protective until you control for season.</em>
</div>

A few more results, stated plainly:

- **AUROC overstates skill.** The label is dichotomized against a climatology built from the same calendar the model sees, so the baseline alone already reaches 0.69 — that much is shared calendar structure, not weather skill. We treat the continuous within-day ride ratio, not the binary AUROC, as the substantive estimand for the air-quality question.
- **Safe time-shifting recovers up to ~37%** of otherwise-lost mobility (95% CI 33–41%) — an **upper bound** that assumes perfect demand transfer; at a realistic 50% transfer it's **~18%**. What's solid isn't the magnitude, it's the safety: no recommendation ever falls in unsafe conditions, by construction.
- **Method transfer:** the same pipeline reaches AUROC **0.87** on a second city (Seoul) — a check that the *method* travels, **not** a replication of the confounding result.

Full write-up, all figures, and every confidence interval: [`paper/paper.md`](paper/paper.md). Pipeline: [`research/`](research/).

---

## How the forecast works

- **Target** — a logistic regression predicts whether a given hour of outdoor cycling is *suppressed*: ridership below half (ρ = 0.5) of a weather-free, leak-free seasonal-and-diurnal baseline.
- **Features (12)** — heat index, two temperature hinges (`max(0, 55−T)`, `max(0, HI−85)`), hourly AQI, humidity, wind, precipitation, visibility, a smoke flag, and cyclical encodings of hour and weekend.
- **Pipeline** — train in Python → export the standardizer and twelve coefficients to `model.js` → the page standardizes inputs and applies them directly.
- **Inference** — a dot product through a sigmoid. No server, no build step, no API keys.
- **Safety envelope** — the hard override (heat index ≥ 103 °F **or** AQI ≥ 150 → unsafe) sits on top of the model as a guardrail it can never overrule.

### What makes the method trustworthy

| Practice | What it guards against |
| --- | --- |
| **Leak-free, out-of-time split** (label climatology fit on training years only) | optimistic in-sample metrics |
| **Hourly AQI** (CAMS via Open-Meteo, anchored to EPA daily) | seasonal confounding of daily exposure |
| **Identification ladder** (marginal → between-day → within-day → matched) | reporting one convenient specification |
| **Calibration-first eval** (Brier, log loss, ECE, slope, decision curve) | accurate-but-overconfident models |
| **Minimum-detectable-effect reporting** | mistaking a null for low power |
| **Sensitivity sweeps** (label ratio, activity floor, shift window, AQI threshold) | silent analyst degrees of freedom |
| **Bootstrap CIs**, day-clustered for the within-day estimator | overstated precision |

This project is built to survive scrutiny, its own included — which is why the limits below get their own section instead of a footnote.

---

## Honest limits (kept visible on purpose)

- **Single city (n = 1, DC).** Treat the de-confounding result as a *DC finding pending replication*, not a universal law. The pipeline is city-configurable, but the Seoul run is a *method* check, not a second confirmation.
- **Mobility, not exercise.** Bike-share is a proxy for outdoor mobility demand; it bundles commuting, errands, and tourism with recreation. Any physical-activity or health reading needs external validation against measured activity.
- **Modeled AQI underestimates smoke.** CAMS hourly read the 8 June peak near 150 AQI where the EPA ground station recorded 196 — so the within-day estimate is *conservative* for exactly the smoke events of interest. Ground-station hourly data would sharpen it.
- **RAM (recovered mobility) is a model-based upper bound,** not a measured outcome — it assumes perfect, uncapped demand transfer.

> An educational tool, not safety advice — always obey official heat and air-quality advisories.

---

## Reproduce

```bash
make all       # venv, analysis, model export, tests
```

Python **3.9–3.12** (all tested in CI). The processed panel is **committed** alongside a **SHA-256 checksum** and a column-level [data dictionary](research/data/README.md), so analysis and tests run **offline** without re-downloading raw data. Step-by-step instructions live in [`research/README.md`](research/README.md). `pytest` guards the heat-index formula, the leak-free label, the within-day estimator, the safety policy, and Python↔`model.js` export parity.

## Tech stack

| Layer | Choice |
| --- | --- |
| App | Vanilla HTML / CSS / JavaScript — **zero dependencies**, static-hostable |
| Model | scikit-learn logistic regression, exported to JSON and run in the browser |
| Pipeline | Python · pandas · NumPy · scikit-learn · matplotlib |
| Data | Capital Bikeshare · NOAA LCD weather · EPA AirData daily AQI · CAMS hourly AQI via Open-Meteo (all public, keyless) |
| Quality | pytest · GitHub Actions CI (3.9–3.12) · bootstrap CIs · decision-curve analysis |

## Roadmap

- [ ] Validate the ridership proxy against measured activity (wearable or survey data)
- [ ] Replace CAMS hourly AQI with ground-station hourly measurements
- [ ] Replicate the confounding result across cities (the pipeline is city-configurable)
- [ ] Neighborhood-level equity analysis
- [ ] Expose the forecast as a small API

---

<div align="center">

**Paper:** [`paper/paper.md`](paper/paper.md) · **Pipeline:** [`research/`](research/) · **App:** [`index.html`](index.html), [`app.js`](app.js), [`model.js`](model.js)
**Contributing:** [`CONTRIBUTING.md`](CONTRIBUTING.md) · **Conduct:** [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md) · **Security:** [`SECURITY.md`](SECURITY.md) · **Cite:** [`CITATION.cff`](CITATION.cff)
**License:** [MIT](LICENSE) · Built by [Urme Bose](https://github.com/urme-b) · v1.0.0

</div>
