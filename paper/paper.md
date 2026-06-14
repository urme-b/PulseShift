# Forecasting Climate-Driven Suppression of Physical Activity: A Calibrated, Decision-Focused Evaluation on Real Urban Mobility Data

Urme B.

## Abstract

Climate stress increasingly disrupts outdoor physical activity, but most tools communicate hazard
rather than estimate whether a planned session will be lost or how to preserve it. We treat activity
suppression as a probabilistic forecasting problem and evaluate it as a decision tool, using three
public sources for Washington DC, 2022–2024: Capital Bikeshare volumes, NOAA weather, and EPA air
quality. Each active city-hour is labelled suppressed when ridership falls below half of a
weather-free, leak-free climatology; we fit a calibrated logistic model against a season-aware
baseline and a gradient-boosting comparator, and define Recovered Active Minutes (RAM) under a
safety-constrained time-shift policy. Out-of-time on 2024, features lift AUROC from 0.69 to 0.94
(95% CI 0.92–0.95); gradient boosting does not improve on it. Calibration is decisive: class-weighting
makes the model badly over-confident (Brier 0.13, ECE 0.26), while the unweighted served model is well
calibrated (Brier 0.022). Marginal exposure–response is confounded by season — cold, not heat,
dominates — but adjusting for weather and season across 1,096 days, a 50-point AQI rise is associated
with a 5.6-point drop in the daily ride ratio (95% CI 1.1–10.9), and during the June 2023 wildfire
smoke ridership fell to 0.76× of normal at AQI 196. The policy recovers up to ~36% of otherwise-lost
activity (an upper bound) while never recommending an unsafe hour, and the framework reaches AUROC 0.87
on a second city, Seoul. The central lesson is that calibration and confounding, not headline
accuracy, determine whether such a tool can be trusted.

**Keywords:** physical activity; climate adaptation; probabilistic forecasting; calibration; decision
curve analysis; air quality.

## 1. Introduction

Physical inactivity is a large, preventable health burden, and climate change degrades the conditions
under which health-preserving movement happens: heat, humidity, wildfire smoke, poor air quality, and
rain all disrupt outdoor activity. Most responses communicate *hazard* ("it is unsafe") rather than
*behaviour retention* — whether a specific planned session will actually be lost, and which feasible
adaptation best preserves it.

We treat suppression as a probabilistic forecast and judge it as a decision tool: by calibration,
decision-relevant net benefit, how much activity a constrained policy recovers, and whether that
policy ever trades safety for participation. The model is kept minimal — a calibrated logistic
regression against a season-aware baseline — because the contribution is the evaluation, not model
complexity. We study Washington DC (2022–2024) and externally check on Seoul. Contributions: (i) a
city-hour suppression target from a weather-free, leak-free climatology; (ii) evidence that
calibration, not discrimination, governs usability; (iii) RAM under a safety-constrained, audited
policy; and (iv) a demonstration that naive exposure–response is season-confounded, with the
air-quality effect isolated by a multi-day controlled analysis.

## 2. Related work

Bike-share demand tracks weather: across forty cities and ~100M trips, usage rises with temperature
to ~27–28 °C then falls, with time of day dominant [4]; heat above ~30 °C and rain depress trips
[3, 5]. We use municipal bike-share volume as an observable activity proxy, after the canonical
weather-labelled dataset [6]. Heat reduces physical work capacity and raises morbidity [2]; wildfire
smoke's behavioural effect is threshold-like — in a 2019 bushfire experiment children's activity held
until air quality became hazardous, then dropped sharply [1]. The evaluation borrows from clinical
prediction, where calibration is a distinct, often-neglected requirement [7, 9], and from
decision-curve analysis [8].

## 3. Problem formulation

The unit is a city-hour. Let `E_t` be weather-free expected ridership: a train-fit diurnal/seasonal
shape (median over `season × daytype × hour`, training years only) scaled by a volume level carried
forward from the last training year, so no test-period information enters the label. An hour is
*active* when `E_t` clears a floor; for active hours,

```
Y_t = 1  if  rides_t < rho * E_t      (rho = 0.5)
```

The target is `P(Y_t = 1 | W_t)`, with features heat index, two temperature hinges (`max(0, 55−T)`,
`max(0, HI−85)`), AQI, humidity, wind, precipitation, visibility, a smoke flag, and cyclical hour and
weekend. Because `E_t` conditions on season, the label measures within-season deviation and the fitted
coefficients are associational.

## 4. Data

All sources are public and downloaded by the pipeline.

- **Activity** — Capital Bikeshare trips (2022–2024), aggregated to hourly counts by rider type.
- **Weather** — NOAA Local Climatological Data (Reagan National): hourly temperature, humidity, wind,
  visibility, precipitation, and present-weather codes; temperature and humidity give the NWS heat index.
- **Air quality** — EPA AirData daily AQI for DC; intra-day variation enters via hourly visibility and
  the smoke flag.

Activity (DST-aware local) and weather (local standard time) are converted to UTC and joined on the
hour; daily AQI joins on the local day. The 2024 trip files switched to fractional-second timestamps,
parsed explicitly so no rides are dropped.

## 5. Methods

The season-aware climatology baseline predicts the training suppression rate per cell (no weather).
The model is a standardized logistic regression, fit unweighted and class-weighted; the served model
(used for RAM and the app) is the unweighted one, with a gradient-boosting comparator to test for
residual nonlinearity. We report Brier, log loss, ECE, and calibration slope/intercept, and apply
5-fold cross-validated isotonic calibration to the class-weighted model. Training is 2022–2023, test
2024; served-model metrics carry 95% percentile-bootstrap CIs (1,000 resamples; RAM resampled over
days).

To isolate air quality, we regress the daily ride ratio on AQI adjusting for temperature,
precipitation, weekend, and season across all 1,096 days, bootstrapping the coefficient over days. The
recommender keeps each active hour or shifts it to the lowest-risk hour within ±3 h under a hard safety
envelope (heat index < 103 °F, AQI < 150) and a minimum-benefit rule; RAM = `Σ E_t·(risk_keep −
risk_chosen)`, an upper bound that assumes full, uncapped demand transfer. We audit that no
recommendation falls in unsafe conditions, report operating points at explicit cost ratios, stratify
by season and rider type, and refit the whole pipeline on Seoul.

## 6. Results

The panel holds 26,288 city-hours; 24,354 clear the activity floor, of which 1,466 (6.0%) are
suppressed. We train on 2022–2023 (16,150 hours) and test on 2024 (8,204 hours, 2.5% suppressed).

### 6.1 Discrimination and calibration

| Model | AUROC | AUPRC | Brier | ECE | Cal. slope / int. |
| --- | --- | --- | --- | --- | --- |
| Season-aware climatology | 0.692 | 0.05 | 0.027 | 0.053 | 1.04 / −1.14 |
| Logistic (unweighted, served) | 0.935 | 0.48 | 0.022 | 0.046 | 1.05 / −1.51 |
| Logistic (class-weighted) | 0.939 | 0.45 | 0.130 | 0.255 | 0.69 / −3.84 |
| Logistic (class-weighted) + calibration | 0.939 | 0.46 | 0.029 | 0.065 | 1.19 / −1.82 |
| Gradient boosting | 0.935 | 0.52 | 0.025 | 0.046 | 0.98 / −1.75 |

*Test year 2024, n = 8,204. Served-model 95% CIs: AUROC 0.92–0.95, AUPRC 0.41–0.56, Brier 0.020–0.024,
ECE 0.043–0.049.*

Features lift AUROC from 0.69 to 0.94; gradient boosting ties the logistic (0.935 each, edging only
AUPRC). But discrimination is not the point. Class weighting — a common default for imbalance — leaves
the model badly over-confident (Brier 0.130, worse than the baseline's 0.027; ECE 0.255), while the
unweighted served model is well calibrated (Brier 0.022, ECE 0.046), and post-hoc isotonic calibration
also repairs the weighted model (ECE 0.255 → 0.065; Figure `reliability`). Net benefit is positive
across low-to-moderate thresholds and maximized at the lowest ones (Figure `decision_curve`); at a
10:1 cost ratio (missed suppression vs unnecessary shift) the threshold is 0.09, flagging 21% of hours
at 0.89 sensitivity and 0.81 specificity.

### 6.2 What suppresses activity

Marginal exposure–response is confounded by season (Figure `exposure_response`): suppression falls
from ~17% in the coldest hours to near zero above 90 °F, because hot hours coincide with peak summer
ridership — cold, not heat, dominates. With precipitation and a cold-stress hinge the served model
recovers correctly-signed drivers (rain +0.40, cold +0.55 raise suppression), while heat loads
negative (−0.66) and daily AQI is near zero (−0.04); all coefficients are associational. Adjusting for
weather and season across 1,096 days, each 50-point AQI rise is associated with a 5.6-point drop in
the daily ride ratio (95% CI 1.1–10.9). The June 2023 smoke episode is the visible exemplar (AQI 196,
ridership 0.76× expected), though as a single day it is only the 6th-lowest of 66 summer weekdays and
coincided with advisories; the multi-day regression is the stronger evidence.

### 6.3 Recovered activity and safety

The policy could recover ~36% (95% CI 33–40%) of otherwise-lost activity — about 94,000 rides
(~1.2M rider-minutes) against ~260,000 lost under no adaptation — an upper bound under perfect,
uncapped demand transfer (1,115 shifts into 755 distinct slots). It is conservative (14% of hours
shifted, 0.06% cancelled) and safe by construction: no recommendation falls in unsafe conditions, and
each shift lowers predicted risk by 0.16 on average (Figure `ram_by_month`).

### 6.4 Robustness, transfer, and subgroups

Results are stable to the label threshold (ρ ∈ {0.4, 0.5, 0.6}: base rate 3.8–8.9%, AUROC 0.92–0.95,
ECE ≤ 0.07) and across seasons (AUROC 0.90–0.96). Refitting on the Seoul Bike dataset and evaluating
on a random 25% hold-out gives AUROC 0.87 (ECE 0.02, n = 2,117) — a cross-city method check, since a
one-year panel cannot support a clean out-of-time tail. Burden is unequal: casual riders are
suppressed 9.5% of active hours versus 5.1% for members (~1.9×).

## 7. Discussion

Calibration is the result that matters: a model excellent on AUROC is unusable when class-weighted,
and reporting discrimination alone would have hidden a Brier worse than the baseline. Naive
climate–activity associations are confounded — a regression of activity on heat would have "found"
heat protective — so the defensible signal comes from controls and the within-season event. Despite a
modest model, a calibrated risk score plus a safety-constrained policy recovers a meaningful, bounded
share of lost activity and transfers to a second city. The PulseShift app ships exactly this served
model client-side; this paper is its evidence layer.

## 8. Limitations

The label is a constructed proxy from ridership, not observed skipped sessions. Carrying the 2024
volume forward to stay leak-free makes the 2024 suppression rate a modest undercount. RAM is a
model-based upper bound. Equity is behavioural (rider type), not demographic. AQI is daily; hourly air
quality would sharpen the smoke arm. The smoke episode is a single confounded event — the multi-day
regression carries that claim.

## 9. Reproducibility

Public data and pinned dependencies; `build_data.py` and `run_analysis.py` regenerate every figure and
table, `train_model.py` exports the served model, `validate_seoul.py` runs the external check, and
`pytest` (in CI) guards the heat index, the leak-free label, the safety policy, and model-export
parity. See `research/README.md`.

## References

1. Del Pozo Cruz B, Hartwig TB, Sanders T, et al. The effects of the Australian bushfires on physical
   activity in children. *Environment International*. 2020;146:106214. doi:10.1016/j.envint.2020.106214
2. Ebi KL, Capon A, Berry P, et al. Hot weather and heat extremes: health risks. *The Lancet*.
   2021;398(10301):698–708. doi:10.1016/S0140-6736(21)01208-3
3. Kim K. Investigation on the effects of weather and calendar events on bike-sharing according to the
   trip patterns of bike rentals of stations. *Journal of Transport Geography*. 2018.
4. Bean R, et al. How does weather affect bikeshare use? A comparative analysis of forty cities across
   climate zones. *Journal of Transport Geography*. 2021.
5. Guzel D, et al. Assessment of weather-driven travel behavior on a small-scale docked bike-sharing
   system usage. *Travel Behaviour and Society*. 2025.
6. Fanaee-T H, Gama J. Event labeling combining ensemble detectors and background knowledge.
   *Progress in Artificial Intelligence*. 2013. doi:10.1007/s13748-013-0040-3
7. Staffa SJ, Zurakowski D. Statistical development and validation of clinical prediction models.
   *Anesthesiology*. 2021;135(3):396–405. doi:10.1097/ALN.0000000000003871
8. Vickers AJ, Elkin EB. Decision curve analysis: a novel method for evaluating prediction models.
   *Medical Decision Making*. 2006;26(6):565–574. doi:10.1177/0272989X06295361
9. Niculescu-Mizil A, Caruana R. Predicting good probabilities with supervised learning. *Proceedings
   of the 22nd International Conference on Machine Learning (ICML)*. 2005.
