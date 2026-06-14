# Forecasting Climate-Driven Suppression of Physical Activity: A Calibrated, Decision-Focused Evaluation on Real Urban Mobility Data

Urme B.

## Abstract

**Background.** Climate stress increasingly disrupts outdoor physical activity, yet most tools
communicate hazard rather than estimate whether a planned session will actually be lost or how best
to preserve it. **Methods.** We treat activity suppression as a probabilistic forecasting problem
and evaluate it as a decision tool. Using three real, public sources for Washington DC over
2022–2024 — Capital Bikeshare volumes, NOAA weather (temperature, humidity, wind, precipitation,
visibility), and EPA air quality — we label each active city-hour as suppressed when ridership falls
below half of a weather-free temporal climatology (a train-fit `season × daytype × hour` shape with a
leak-free volume level), fit a logistic model with nonlinear temperature terms against a season-aware
climatology baseline and a gradient-boosting comparator, validate out-of-time (2024) and on a second
city (Seoul), and define Recovered Active Minutes (RAM) under a safety-constrained time-shift policy.
Uncertainty is quantified with the percentile bootstrap. **Results.** Environmental and temporal
features lift AUROC from 0.69 to 0.94 (95% CI 0.92–0.95); gradient boosting does not beat the
logistic model on AUROC, confirming the minimal model suffices. Calibration is decisive: balanced
class weights make the model badly over-confident (Brier 0.130, ECE 0.255), while the unweighted
model we serve is well-calibrated (Brier 0.022, ECE 0.046). With precipitation and a cold-stress
term, the served model recovers correctly-signed drivers (rain +0.40, cold +0.55 increase
suppression), though heat still loads negative through seasonal confounding. Holding temperature,
precipitation, and season fixed, each +50 AQI is associated with a 5.6-point drop in the daily ride
ratio (95% CI 1.1–10.9), and the framework transfers to a second city, Seoul (AUROC 0.95 on a small
held-out tail). A safety-constrained time-shift policy could recover up to
~36% (95% CI 33–40%) of otherwise-lost activity while never recommending an unsafe hour; discretionary
riders bear ~1.9× the burden of committed riders. **Conclusion.** A minimal but calibrated,
safety-aware framework turns climate exposure into a usable, reproducible activity-retention decision;
its central lessons are that calibration and confounding — not headline accuracy — determine whether
such a tool can be trusted.

**Keywords:** physical activity; climate adaptation; probabilistic forecasting; calibration;
decision curve analysis; air quality; behaviour retention.

## 1. Introduction

Physical inactivity is a large, preventable contributor to cardiometabolic and mental-health
burden. Climate change adds a second-order constraint: it does not only threaten health directly, it
degrades the environmental conditions under which health-preserving movement happens. Heat, humidity,
wildfire smoke, poor air quality, and rain increasingly disrupt outdoor exercise, active commuting,
and recreation.

Most public responses treat this as a problem of *hazard communication* — telling people conditions
are unsafe — rather than *behaviour retention*. A hazard forecast does not estimate whether a
specific planned activity will be lost, nor which feasible adaptation best preserves it. The question
an organizer faces is not "is it hot?" but "will this session survive, and what is the safest way to
keep it?"

This paper treats climate-driven activity suppression as a probabilistic forecasting problem and
evaluates it the way a decision tool would be judged: by calibration, by decision-relevant net
benefit, by how much activity a constrained adaptation policy recovers, and by whether that policy
ever trades safety for participation. We keep the model minimal — a calibrated logistic regression
against a season-aware climatology baseline — because the contribution is the *evaluation*, not model
complexity; a gradient-boosting comparator confirms little is left on the table.

We study Washington DC over 2022–2024 (Capital Bikeshare, NOAA, EPA) and externally validate on
Seoul. The DC window includes the June 2023 Canadian-wildfire smoke episode.

Our contributions: we (i) formalize activity suppression as a city-hour binary forecasting target
from a weather-free, leak-free climatology; (ii) show calibration, not discrimination, governs
usability, with bootstrapped CIs and decision-curve net benefit; (iii) define RAM under a
safety-constrained policy, reported as an explicit upper bound and audited to never recommend an
unsafe hour; and (iv) show naive exposure–response is season-confounded, isolating the AQI effect
with a multi-day controlled analysis and confirming transfer to a second city.

## 2. Related work

**Weather shapes outdoor cycling.** Across forty cities and ~100M trips, usage rises with
temperature up to ~27–28 °C then declines, with time of day the strongest factor [4]; high
temperatures above ~30 °C depress ridership [3]; cold and rain suppress trips, differing by
weekday/weekend and purpose [5]. Bean et al. note a changing climate will likely lower ridership in
warm climates and raise it in cold ones [4] — the link is real but regionally contingent. We use
municipal bike-share volume as an observable proxy for outdoor activity; the canonical
bike-share-plus-weather dataset is from Fanaee-T and Gama [6].

**Heat and air quality act through different channels.** Heat reduces physical work capacity and
motor-cognitive performance and raises morbidity and mortality [2]. Wildfire smoke is increasingly
disruptive, but its behavioural effect appears threshold-like: in a 2019 Australian-bushfire natural
experiment, children's measured activity held until air quality reached ~3.5× the "hazardous"
(AQI > 200) threshold, then dropped sharply [1] — anticipating what we find in June 2023.

**Evaluation borrows from clinical prediction**, where discrimination and calibration are distinct,
both-necessary properties and calibration is commonly neglected [7, 9]; decision-curve analysis
measures net benefit across thresholds rather than accuracy alone [8].

## 3. Problem formulation

The unit of analysis is a city-hour: an hour in which a non-trivial amount of outdoor cycling would
normally occur. For hour `t`, let `E_t` be the weather-free *expected* ridership — a train-fit
diurnal/seasonal shape (median over `season × daytype × hour` cells, training years only) times a
volume level whose value for the held-out year is **carried forward from the last training year**, so
no test-period information enters the label. An hour is *active* when `E_t` clears a floor. For active
hours,

```
Y_t = 1  if  rides_t < rho * E_t        (rho = 0.5 by default)
Y_t = 0  otherwise.
```

The target is `P(Y_t = 1 | W_t)`, with `W_t` = heat index, two temperature hinges (cold-stress
`max(0, 55−T)` and heat-stress `max(0, HI−85)`), AQI, humidity, wind, precipitation, visibility, a
smoke/haze flag, and cyclical hour + weekend. The label uses no weather and is fit only on training
years; it conditions on season, so the construct measures *within-season* deviation and the fitted
coefficients are associational.

## 4. Data

All data are public and downloaded by the pipeline; nothing is hand-edited.

- **Activity — Capital Bikeshare** (2022–2024), aggregated to city-wide hourly counts by rider type.
- **Weather — NOAA Local Climatological Data** (Reagan National): hourly temperature, humidity, dew
  point, wind, visibility, **precipitation**, and present-weather codes (smoke/haze). Temperature and
  humidity yield the NWS heat index.
- **Air quality — EPA AirData daily AQI** for DC; intra-day variation enters via the hourly NOAA
  visibility and smoke/haze signals.

Activity (local wall-clock, DST-aware) and weather (local standard time) are converted to UTC and
joined on the hour; daily AQI joins on the local day. Because LCD timestamps are local *standard*
time while rides follow the wall clock, solar-driven weather is fixed in UTC year-round while
ridership shifts with daylight saving — both correct, and joining on UTC pairs simultaneous
conditions. The 2024 trip files switched to fractional-second timestamps, parsed explicitly so no
rides are dropped.

## 5. Methods

**Baselines and models.** The climatology baseline predicts the training suppression rate per
`season × daytype × hour` cell (no weather) — a season-aware comparator. The model is a standardized
logistic regression, fit unweighted and with balanced class weights; the **served** model (used for
RAM and the app) is the unweighted one. A gradient-boosting classifier is included to check whether
nonlinearity beyond the temperature hinges adds discrimination.

**Calibration and uncertainty.** We report Brier, log loss, ECE, and calibration slope/intercept,
and additionally apply 5-fold cross-validated isotonic calibration to the balanced model to show
post-hoc repair. We train on 2022–2023 and test on 2024; served-model metrics carry 95%
percentile-bootstrap CIs (1000 resamples), and RAM is bootstrapped over days.

**AQI event study.** To go beyond a single smoke episode, we regress the daily ride ratio
(observed/expected over active hours) on daily AQI controlling for temperature, precipitation,
weekend, and season across all 1,096 days, and bootstrap the AQI coefficient over days.

**Adaptation, cost, and safety.** For each active hour the recommender keeps the session or shifts it
to the lowest-risk hour within ±3 hours, under a hard safety envelope (heat index < 103 °F, AQI < 150)
and a minimum-benefit rule. RAM = `E_t·(risk_keep − risk_chosen)` summed over hours, an **upper
bound** (assumes full demand transfer, uncapped target-hour capacity). We also report the
model's operating characteristics (sensitivity, specificity) at explicit cost ratios. We audit that no recommendation
falls in unsafe conditions, stratify by season and day type, report burden by rider type, and
externally validate the whole framework on the Seoul Bike dataset.

## 6. Results

The panel holds 26,288 city-hours (2022–2024); 24,354 clear the activity floor, of which 1,466
(6.0%) are suppressed. We train on 2022–2023 (16,150 active hours) and test on 2024 (8,204 hours,
2.5% suppressed).

### 6.1 Discrimination and calibration

| Model | AUROC | AUPRC | Brier | ECE | Cal. slope / int. |
| --- | --- | --- | --- | --- | --- |
| Season-aware climatology | 0.69 | 0.05 | 0.027 | 0.053 | 1.04 / −1.14 |
| Logistic (unweighted, served) | 0.94 | 0.48 | 0.022 | 0.046 | 1.05 / −1.51 |
| Logistic (balanced) | 0.94 | 0.45 | 0.130 | 0.255 | 0.69 / −3.84 |
| Logistic (balanced) + calibration | 0.94 | 0.46 | 0.029 | 0.065 | 1.19 / −1.82 |
| Gradient boosting | 0.93 | 0.52 | 0.025 | 0.046 | 0.98 / −1.75 |

*Test year 2024, n = 8,204. Served-model 95% CIs: AUROC 0.92–0.95, AUPRC 0.41–0.56,
Brier 0.020–0.024, ECE 0.043–0.049.*

Environmental and temporal features lift AUROC from 0.69 (season-aware baseline) to 0.94 (Figure
`roc`). Gradient
boosting does not beat the logistic model on AUROC (0.93 vs 0.94; it edges AUPRC, 0.52 vs 0.48), confirming
the minimal model captures the signal. But discrimination is not the point of a decision tool.
Fitting with **balanced class weights** — a common default for imbalance — discriminates well yet is
badly **over-confident**: Brier 0.130 (worse than the baseline's 0.027), ECE 0.255, calibration
intercept −3.84. The **unweighted** model we serve avoids this (Brier 0.022, ECE 0.046, slope 1.05),
and post-hoc isotonic calibration also repairs the balanced model (ECE 0.255 → 0.065) (Figure
`reliability`). Calibration — by weighting choice or post hoc — is what makes the risk usable [7, 9].
The decision curve (Figure and Table `decision_curve`) shows positive net benefit across low-to-
moderate thresholds [8]. Net benefit is maximized at the lowest thresholds (no interior optimum), so
we report operating points at explicit cost ratios (Table `cost_threshold`): treating a missed
suppression as 10× costlier than an unnecessary shift sets the threshold at 0.09, flagging 21% of
hours at sensitivity 0.89 and specificity 0.81.

### 6.2 What actually suppresses activity

Marginal exposure–response is **confounded by season** (Figure and Table `exposure_response`):
suppression falls from ~17% in the coldest hours to near zero above 90 °F, because hot hours coincide
with summer's activity peak. Cold, not heat, is the dominant suppressor in this temperate city.
Adding precipitation and a cold-stress hinge recovers **correctly-signed drivers**: in the served
model (Table `logistic_coefficients`), rain (+0.40) and cold (+0.55) raise suppression, while heat
loads negative (heat index −0.66, heat-stress −0.80) and the daily-AQI term is near zero (−0.04) —
all reflecting seasonal confounding. The coefficients are associational, not causal.

For the air-quality arm we go beyond the single episode. Controlling for temperature, precipitation,
season, and weekend across all 1,096 days, **each +50 AQI is associated with a 5.6-percentage-point
reduction in the daily ride ratio (95% CI 1.1–10.9)** (Table `event_study`; 21 days exceeded AQI 100).
The June 2023 wildfire-smoke episode is the visible exemplar (Table `smoke_event`): AQI 169 on 7 June
and 196 on 8 June, with ridership falling to 0.76× expected on the worst day. We remain restrained
about that single day — it is only the 6th-lowest of 66 summer weekdays and several non-smoke days
fell further, and it coincided with advisories — but the multi-day regression makes the AQI effect
itself defensible.

### 6.3 Recovered activity and safety

The safety-constrained time-shift policy could recover an expected ~36% (95% CI 33–40%) of the
activity that would otherwise be lost — about 94,154 rides, ≈1.22M rider-minutes, against ≈259,598
rides lost under no adaptation. This is an upper bound under perfect demand transfer and uncapped
target-hour capacity (the 1,115 shifts land in 755 distinct day–hour slots). The policy is
conservative — it shifts 14% of hours and cancels 0.06% — and **safe by construction**: zero
recommendations fall in unsafe conditions, and each shift lowers predicted risk by 0.16 on average. Recovered activity concentrates
in the colder months, when suppression is most common (Figure `ram_by_month`).

### 6.4 Robustness, transfer, and subgroups

Results are stable to the label threshold (Table `label_sensitivity`): across `rho` ∈ {0.4, 0.5, 0.6}
the base rate moves from 3.8% to 8.9% while AUROC stays 0.92–0.95 and ECE ≤ 0.07. Performance holds
across seasons (AUROC 0.90–0.96) and day types. **External validity:** applying the same framework to
the Seoul Bike dataset (a different climate and hemisphere) yields AUROC 0.95 on a small leak-free
held-out tail (n = 180; calibration is weaker on this short, high-suppression autumn window, ECE 0.12)
(Table `seoul_validation`). **Equity:** over the full panel, casual (discretionary) riders are
suppressed 9.5% of active hours versus 5.1% for members (≈1.9×) — the more committed the activity,
the more it survives adverse conditions, which is exactly the population for whom adaptation support
matters most.

## 7. Discussion

First, **calibration is the contribution that matters.** The same model that looks excellent on AUROC
is unusable when fit with balanced weights; reporting only discrimination would have hidden a Brier
score five times the baseline's. Decision claims should lead with reliability and net benefit, and
treat class-weighting as a calibration decision.

Second, **naive climate–activity associations are confounded.** Heat loads negative; a pipeline
regressing activity on heat would have "found" heat protective. The defensible signal comes from
controls — the multi-day AQI regression and the within-season event — a general lesson for
climate-and-behaviour studies on observational mobility data.

Third, the framework does useful work despite a modest model: a calibrated risk score plus a
safety-constrained policy recovers a meaningful, bounded share of lost activity without recommending
an unsafe hour, and it transfers to a second city. The companion PulseShift application ships exactly
this served model (the unweighted logistic) client-side; this paper is its evidence layer.

## 8. Limitations

The suppression label is **constructed**, not observed: bike-share volume is an aggregate proxy,
climatology cells can be small, and a below-expectation hour can reflect non-weather shocks. Because
the 2024 volume baseline is carried forward from 2023 (to stay leak-free) and ridership grew, the
2024 suppression rate (2.5%) is measured against a slightly stale baseline and is likely a modest
undercount. RAM is a **model-based upper bound**; the achievable figure is lower. Equity here is
behavioural (rider type), **not demographic or neighbourhood-level** — that needs a spatial
re-aggregation of trips by station and a census join, which we leave to future work. The AQI feature
is **daily**; hourly AQI would sharpen the smoke arm but EPA's hourly feed was not retrievable at a
practical rate, so intra-day smoke enters only through visibility and the haze flag. The smoke
*episode* is a single, confounded event; the multi-day regression is the stronger evidence.

## 9. Reproducibility

Every figure and table is regenerated from public data by two commands (`scripts/build_data.py`,
`scripts/run_analysis.py`); `scripts/train_model.py` exports the served model (stamped with version
and commit), `scripts/validate_seoul.py` runs the external check, and `pytest tests/` (also run in
CI) guards the heat index, the leak-free label, the safety policy, and model-export parity. The
processed panel is committed so the analysis runs without re-downloading. See `research/README.md`.

## References

1. Del Pozo Cruz B, Hartwig TB, Sanders T, et al. The effects of the Australian bushfires on physical
   activity in children. *Environment International*. 2020;146:106214.
   doi:10.1016/j.envint.2020.106214
2. Ebi KL, Capon A, Berry P, et al. Hot weather and heat extremes: health risks. *The Lancet*.
   2021;398(10301):698–708. doi:10.1016/S0140-6736(21)01208-3
3. Kim K. Investigation on the effects of weather and calendar events on bike-sharing according to
   the trip patterns of bike rentals of stations. *Journal of Transport Geography*. 2018.
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
9. Niculescu-Mizil A, Caruana R. Predicting good probabilities with supervised learning.
   *Proceedings of the 22nd International Conference on Machine Learning (ICML)*. 2005.
