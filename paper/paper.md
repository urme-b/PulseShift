# Forecasting Climate-Driven Suppression of Physical Activity: A Calibrated, Decision-Focused Evaluation on Real Urban Mobility Data

Urme B.

## Abstract

**Background.** Climate stress increasingly disrupts outdoor physical activity, yet most tools
communicate hazard rather than estimate whether a planned session will actually be lost or how best
to preserve it. **Methods.** We treat activity suppression as a probabilistic forecasting problem
and evaluate it as a decision tool. Using three real, public sources for Washington DC over
2022–2024 — Capital Bikeshare volumes, NOAA weather, and EPA air quality — we label each active
city-hour as suppressed when ridership falls below half of a weather-free temporal climatology
(a train-fit `season × daytype × hour` shape rescaled by a leak-free volume level), fit a logistic
model against a season-aware climatology baseline with out-of-time (2024) validation, and define
Recovered Active Minutes (RAM) as the activity preserved by a safety-constrained time-shift policy.
Uncertainty is quantified with the percentile bootstrap. **Results.** Environmental and temporal
features lift AUROC from 0.69 to 0.92 (95% CI 0.90–0.94) over a season-aware baseline. Calibration,
not accuracy, is the decisive property: a logistic model with balanced class weights discriminates
well yet is badly over-confident (Brier 0.142, ECE 0.271), while the unweighted model we serve is
well-calibrated (Brier 0.023, ECE 0.046) and post-hoc isotonic calibration also repairs the balanced
model (ECE 0.064); the served model shows positive decision-curve net benefit. Marginal
exposure–response is confounded by season — cold, not heat, is the dominant suppressor in this
temperate city, and every exposure coefficient loads negative. During the June 2023 wildfire-smoke
episode (AQI 196) ridership fell to 0.76× its seasonal expectation, the 6th-lowest of 66 summer
weekday days; several non-smoke days fell further, so we read this as suggestive, not causal. A
safety-constrained time-shift policy could recover up to ~32% (95% CI 29–35%) of otherwise-lost
activity while never recommending an unsafe hour, and discretionary riders bear ~1.9× the suppression
burden of committed riders. **Conclusion.** A minimal but calibrated, safety-aware framework turns
climate exposure into a usable, reproducible activity-retention decision; its central lessons are
that calibration and confounding — not headline accuracy — determine whether such a tool can be
trusted.

**Keywords:** physical activity; climate adaptation; probabilistic forecasting; calibration;
decision curve analysis; air quality; behaviour retention.

## 1. Introduction

Physical inactivity is a large, preventable contributor to cardiometabolic and mental-health
burden. Climate change adds a second-order constraint: it does not only threaten health directly,
it degrades the environmental conditions under which health-preserving movement happens. Heat,
humidity, wildfire smoke, and poor air quality increasingly disrupt outdoor exercise, active
commuting, and recreation.

Most public responses treat this as a problem of *hazard communication* — telling people that
conditions are unsafe — rather than *behaviour retention*. A hazard forecast does not estimate
whether a specific planned activity will actually be lost, nor which feasible adaptation best
preserves it. The practical question an organizer faces is not "is it hot?" but "will this session
survive, and what is the safest way to keep it?"

This paper treats climate-driven activity suppression as a probabilistic forecasting problem and
evaluates it the way a decision-support tool would actually be judged: by calibration, by
decision-relevant net benefit, by how much activity a constrained adaptation policy recovers, and by
whether that policy ever trades safety for participation. We deliberately keep the model minimal — a
logistic regression against a season-aware climatology baseline — because the contribution is the
*evaluation*, not model complexity.

We study Washington DC over 2022–2024 using three real, public sources: Capital Bikeshare trip
volumes as an outdoor-activity signal, NOAA weather, and EPA air quality. The window includes the
June 2023 Canadian-wildfire smoke episode, when DC air quality reached near-record levels.

Our contributions are bounded and concrete. We (i) formalize activity suppression as a session-level
(here, city-hour) binary forecasting target built transparently from real ridership relative to a
weather-free, leak-free climatology; (ii) show that calibration, not discrimination, governs whether
the forecast is usable, and report bootstrapped decision-curve net benefit; (iii) define Recovered
Active Minutes (RAM) as the activity preserved by a safety-constrained time-shift policy, report it
as an explicit upper bound, and audit that the policy never recommends an unsafe hour; and (iv) show
that naive exposure–response is confounded by season, isolating acute air-quality suppression at the
event level.

## 2. Related work

**Weather shapes outdoor cycling.** Bike-share studies consistently find demand sensitive to
temperature, precipitation, and time of day. Across forty cities and ~100M trips, usage rises with
temperature up to roughly 27–28 °C and then declines, with time of day the single most important
factor [4]; high temperatures above ~30 °C depress ridership [3]; and cold and rain suppress trips,
with effects that differ by weekday/weekend and trip purpose [5]. Bean et al. note that a changing
climate will likely lower ridership in warm climates and raise it in cold ones [4] — the
weather–activity link is real but regionally contingent. We use this same signal, municipal
bike-share volume, as an observable proxy for outdoor activity that can be lost to adverse
conditions; the canonical bike-share-plus-weather dataset was introduced by Fanaee-T and Gama [6].

**Heat and air quality act through different channels.** Heat reduces physical work capacity and
motor-cognitive performance and raises morbidity and mortality, with extreme-heat exposure now
reaching much of the global population [2]. Wildfire smoke is increasingly disruptive, but its
behavioural effect appears threshold-like: in a natural experiment during the 2019 Australian
bushfires, children's device-measured activity was largely maintained until air quality reached
roughly 3.5× the "hazardous" (AQI > 200) threshold, after which it dropped sharply [1]. That pattern
— little response at moderate pollution, a steep drop only at extreme levels — anticipates what we
find for June 2023.

**Evaluation borrows from clinical prediction.** There, discrimination and calibration are treated
as distinct, both-necessary properties, and calibration is the commonly neglected one [7, 9];
decision-curve analysis measures net benefit across decision thresholds rather than accuracy alone
[8]. We adopt all three lenses.

## 3. Problem formulation

The unit of analysis is a *planned activity opportunity*. Because no public dataset labels
individually skipped sessions, we operationalize the opportunity as a city-hour: an hour in which a
non-trivial amount of outdoor cycling would normally occur.

For hour `t`, let `E_t` be the weather-free *expected* ridership. We estimate it as a train-fit
diurnal/seasonal shape — the median ridership over `season × daytype × hour` cells computed on the
training years only — multiplied by a volume level. To keep the label a true out-of-time test, the
level for the held-out year is **carried forward from the last training year** rather than taken from
the held-out year itself, so no test-period information enters the label. An hour is *active* when
`E_t` clears a floor (so we do not divide by near-zero overnight expectations). For active hours,

```
Y_t = 1  if  rides_t < rho * E_t        (rho = 0.5 by default)
Y_t = 0  otherwise.
```

The forecasting target is `P(Y_t = 1 | W_t)`, where `W_t` are environmental and temporal features
available before the hour: heat index, AQI, humidity, wind, visibility, a smoke/haze flag, and a
cyclical encoding of hour and weekend. The label uses no weather and its structure and volume level
are fit only on training years, so a below-expectation hour reflects a deviation from the city's
established rhythm. It does condition on season, so the construct measures *within-season* deviation;
we treat the fitted coefficients as associational throughout.

We separate three tasks the literature often conflates: (i) **risk estimation** — how likely an hour
is suppressed; (ii) **adaptation ranking** — which feasible time shift best preserves activity; and
(iii) **benefit measurement** — how much activity is recovered.

## 4. Data

All data are public and downloaded by the pipeline; nothing is hand-edited.

- **Activity — Capital Bikeshare** (public trip history, 2022–2024), aggregated to city-wide hourly
  counts, split by rider type (member vs casual).
- **Weather — NOAA Local Climatological Data**, Reagan National (DCA) station: hourly temperature,
  humidity, dew point, wind, visibility, and present-weather codes (including smoke/haze). Temperature
  and humidity yield the NWS heat index.
- **Air quality — EPA AirData daily AQI** for the District of Columbia. The `aqi` feature is constant
  within a calendar day; intra-day air-quality variation enters only through the hourly NOAA
  visibility and smoke/haze signals.

Activity (local wall-clock, DST-aware) and weather (local standard time) are converted to UTC and
joined on the hour; daily AQI is joined on the local calendar day. Because LCD timestamps are local
*standard* time (no DST) while rides follow the wall clock, solar-driven weather is fixed in UTC
year-round while ridership shifts with daylight saving — both are correct, and joining on UTC pairs
genuinely simultaneous conditions. The 2024 monthly trip files switched to a fractional-second
timestamp format, which we parse explicitly so no rides are silently dropped.

## 5. Methods

**Baselines and model.** The climatology baseline predicts the training suppression rate for each
`season × daytype × hour` cell and uses no weather; because it already conditions on season, day
type, and hour, it is a *season-aware* comparator. The model is a standardized logistic regression on
the environmental and temporal features. We fit it two ways — unweighted and with balanced class
weights — because the weighting choice drives the calibration result; the **served** model (used for
RAM and in the companion app) is the unweighted one.

**Calibration.** If the tool says risk is 0.7, suppression should occur near 70% of the time under
similar conditions. We report Brier, log loss, expected calibration error (ECE), and calibration
slope/intercept, and additionally calibrate the balanced model with 5-fold cross-validated isotonic
regression to show post-hoc repair is also possible.

**Temporal back-testing and uncertainty.** We train on 2022–2023 and test on 2024 — future
conditions, not shuffled history. We report AUROC and AUPRC (discrimination), the calibration metrics
above, and a decision curve (net benefit across risk thresholds) against adapt-all and adapt-none.
Served-model test metrics carry 95% percentile-bootstrap confidence intervals (1000 resamples);
RAM is bootstrapped over days, since the policy operates within a day.

**Adaptation and RAM.** For each active hour the recommender keeps the session or shifts it to the
lowest-risk hour within ±3 hours, subject to a hard safety envelope (heat index below 103 °F and AQI
below 150) and a minimum-benefit rule. RAM is the expected activity gained by acting versus doing
nothing, `E_t · (risk_keep − risk_chosen)` summed over hours, reported as a share of the activity
that would otherwise be lost. The envelope, not a fixed direction, defines safety. RAM is an **upper
bound** — it assumes the demand expected at the original hour transfers fully to the safer hour and
does not cap target-hour capacity (we report the target-slot collision count).

**Safety and equity.** We audit that no recommendation falls in unsafe conditions, stratify
performance by season and day type, and report suppression burden for discretionary (casual) versus
committed (member) riders.

## 6. Results

The panel holds 26,288 city-hours (2022–2024); 24,354 clear the activity floor, of which 1,466
(6.0%) are suppressed. We train on 2022–2023 (16,150 active hours) and test on 2024 (8,204 hours,
2.5% suppressed).

### 6.1 Discrimination and calibration

| Model | AUROC | AUPRC | Brier | ECE | Cal. slope / intercept |
| --- | --- | --- | --- | --- | --- |
| Season-aware climatology | 0.69 | 0.05 | 0.027 | 0.053 | 1.04 / −1.14 |
| Logistic (unweighted, served) | 0.92 | 0.45 | 0.023 | 0.046 | 1.21 / −1.18 |
| Logistic (balanced) | 0.93 | 0.42 | 0.142 | 0.271 | 1.01 / −4.05 |
| Logistic (balanced) + calibration | 0.92 | 0.41 | 0.030 | 0.064 | 1.26 / −1.50 |

*Test year 2024, n = 8,204. Served-model 95% CIs: AUROC 0.90–0.94, AUPRC 0.38–0.52,
Brier 0.021–0.025, ECE 0.043–0.049.*

Environmental and temporal information adds a great deal over the city's rhythm: the season-aware
baseline reaches only AUROC 0.69, while the logistic model reaches 0.92. But discrimination is not
the point of a decision tool, and the calibration results are the real story. Fitting with **balanced
class weights** — a common default for imbalance — discriminates well yet is badly **over-confident**:
its Brier (0.142) is far worse than the baseline's (0.027), with ECE 0.271 and a calibration intercept
of −4.05. Reading probabilities off such a model is unsafe by construction. The **unweighted** model
we serve avoids this entirely (Brier 0.023, ECE 0.046, slope 1.21), and for completeness post-hoc
isotonic calibration also repairs the balanced model (ECE 0.271 → 0.064) (Figure `reliability`). A
model can rank well and still lie about probabilities; calibration — whether by weighting choice or
post hoc — is what makes the risk numbers usable [7, 9]. The decision curve (Figure and Table
`decision_curve`) shows the served model gives positive net benefit across low-to-moderate action
thresholds, above both adapt-all and adapt-none [8].

### 6.2 What actually suppresses activity

Marginal exposure–response is **confounded by season** (Figure and Table `exposure_response`).
Suppression falls monotonically with heat index — from ~17% in the coldest hours to near zero above
90 °F — and falls with AQI as well, because hot, high-AQI hours coincide with summer, when DC cycling
is at its seasonal peak. The dominant environmental suppressor in this temperate city is **cold**, not
heat, consistent with the regional contingency reported across cities [4]. Accordingly, *every*
exposure coefficient in the served model loads negative (heat index −1.29, visibility −0.43, AQI
−0.13, smoke flag −0.10); these are associational and largely reflect season, not causal effects.

The exception is the acute event, where season is roughly fixed. During the June 2023 wildfire-smoke
episode (Table `smoke_event`), AQI climbed to 169 on 7 June and 196 on 8 June; ridership fell to
0.76× its seasonal-temporal expectation on the worst day — a ~24% drop at mild temperature. This
threshold-like response mirrors the natural-experiment finding that activity holds until air quality
becomes hazardous and only then collapses [1]. We are deliberately restrained about it: 8 June is
only the 6th-lowest of the 66 summer weekday days (~9th percentile), and five non-smoke weekdays fell
further (one to 0.44×), so the episode is suggestive of acute air-quality suppression, not a clean
isolation of it — especially as the smoke days coincided with public-health advisories and event
cancellations.

### 6.3 Recovered activity and safety

Applying the safety-constrained time-shift policy to the 2024 test year could recover an expected
~32% (95% CI 29–35%) of the activity that would otherwise be lost — about 82,065 rides, ≈1.07M
rider-minutes at the typical ride length, against ≈256,063 rides lost under no adaptation. This is an
upper bound under perfect demand transfer; it also does not cap target-hour capacity (the 1,132
recommended shifts land in 764 distinct day–hour slots). The policy is conservative — it shifts only
14% of hours and cancels 0.06% — and is **safe by construction**: zero recommendations fall in unsafe
conditions, and each shift lowers predicted risk by 0.14 on average. The ~32% sits at the upper end of
the 18–32% the earlier project draft asserted with no evidence; here it is a bounded estimate
reproduced from public data.

### 6.4 Robustness and subgroups

Results are stable to the label threshold (Table `label_sensitivity`): across `rho` ∈ {0.4, 0.5, 0.6}
the base rate moves from 3.8% to 8.9% while AUROC stays 0.90–0.94 and ECE ≤ 0.07. Performance holds
across seasons (AUROC 0.89–0.95) and day types. Burden is unequal: over the full 2022–2024 panel,
casual (discretionary) riders are suppressed 9.5% of active hours versus 5.1% for members (≈1.9×) —
the more committed the activity, the more it survives adverse conditions, which is exactly the
population for whom adaptation support matters most.

## 7. Discussion

Three things follow. First, **calibration is the contribution that matters.** The same model that
looks excellent on AUROC is unusable when fit with balanced weights; reporting only discrimination
would have hidden a Brier score five times the baseline's. Decision-support claims should lead with
reliability and net benefit, and should treat class-weighting as a calibration decision, not just a
recall knob.

Second, **naive climate–activity associations are confounded**, and saying so is part of the result.
Every exposure coefficient loads negative; a pipeline that regressed activity on heat would have
"found" that heat protects activity. The defensible signal comes from holding season roughly fixed —
here, an acute event — which is a general lesson for climate-and-behaviour studies built on
observational mobility data.

Third, the framework still does useful work despite a modest model: a transparent, well-calibrated
risk score plus a safety-constrained adaptation policy recovers a meaningful, bounded share of lost
activity without ever recommending an unsafe hour. RAM gives organizers a single decision-facing
number, and the safety audit guarantees the policy cannot buy participation with exposure. The
companion PulseShift application ships exactly this served model (the unweighted logistic, refit on
all data) client-side; this paper is its evidence layer.

## 8. Limitations

The suppression label is **constructed**, not observed: bike-share volume is an aggregate,
discretionary-skewed proxy, the climatology cells can be small, and a below-expectation hour can
reflect shocks other than weather. Because the 2024 volume baseline is carried forward from 2023 to
keep the test leak-free, and ridership grew, the 2024 suppression rate (2.5%) is measured against a
slightly stale baseline and is likely a modest undercount. This is **one city and one activity**, so
external validity is untested. RAM is a **model-based upper bound** under behavioural assumptions
(full demand transfer, unbounded target-hour capacity); the achievable figure is lower. Equity here
is environmental and behavioural, **not demographic** — the data carry no age, sex, income, or
neighbourhood. The smoke episode is a **single, short event** confounded by simultaneous advisories
and closures, and several non-smoke days saw larger drops; it is suggestive, not a clean isolation of
air quality.

## 9. Reproducibility

Every figure and table is regenerated from public data by two commands (`scripts/build_data.py`,
`scripts/run_analysis.py`) against pinned dependencies; `scripts/train_model.py` exports the served
model. The processed panel is committed so the analysis runs without re-downloading. See
`research/README.md`.

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
