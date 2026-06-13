# Forecasting Climate-Driven Suppression of Physical Activity: A Calibrated, Decision-Focused Evaluation on Real Urban Mobility Data

Urme B.

## Abstract

**Background.** Climate stress increasingly disrupts outdoor physical activity, yet most tools
communicate hazard rather than estimate whether a planned session will actually be lost or how best
to preserve it. **Methods.** We treat activity suppression as a probabilistic forecasting problem
and evaluate it as a decision tool. Using three real, public sources for Washington DC over
2022–2024 — Capital Bikeshare volumes, NOAA weather, and EPA air quality — we label each active
city-hour as suppressed when ridership falls below half of its weather-free temporal climatology,
fit a calibrated logistic model against a climatology baseline with out-of-time (2024) validation,
and define Recovered Active Minutes (RAM) as the activity preserved by a safety-constrained
time-shift policy. **Results.** Environmental features lift AUROC from 0.65 to 0.89, but the
balanced logistic model is badly over-confident (Brier 0.128, ECE 0.237); isotonic calibration
restores reliability (Brier 0.040, ECE 0.008) without losing discrimination, and the model shows
positive decision-curve net benefit. Marginal exposure–response is confounded by season — cold,
not heat, is the dominant suppressor in this temperate city — but the June 2023 wildfire-smoke
episode, where season is fixed, drove ridership to 0.78× expected at AQI 196. The adaptation policy
recovers ~38% of otherwise-lost activity while never recommending an unsafe hour, and discretionary
riders bear ~1.7× the suppression burden of committed riders. **Conclusion.** A minimal but
calibrated, safety-aware framework turns climate exposure into a usable, reproducible activity-
retention decision; its central lessons are that calibration and confounding — not headline
accuracy — determine whether such a tool can be trusted.

**Keywords:** physical activity; climate adaptation; probabilistic forecasting; calibration;
decision curve analysis; air quality; behaviour retention.

## 1. Introduction

Physical inactivity is a large, preventable contributor to cardiometabolic and mental-health
burden. Climate change adds a second-order constraint: it does not only threaten health
directly, it degrades the environmental conditions under which health-preserving movement
happens. Heat, humidity, wildfire smoke, and poor air quality increasingly disrupt outdoor
exercise, active commuting, and recreation.

Most public responses treat this as a problem of *hazard communication* — telling people that
conditions are unsafe — rather than *behaviour retention*. A hazard forecast does not estimate
whether a specific planned activity will actually be lost, nor which feasible adaptation best
preserves it. The practical question an organizer faces is not "is it hot?" but "will this
session survive, and what is the safest way to keep it?"

This paper treats climate-driven activity suppression as a probabilistic forecasting problem and
evaluates it the way a decision-support tool would actually be judged: by calibration, by
decision-relevant net benefit, by how much activity a constrained adaptation policy recovers, and
by whether that policy ever trades safety for participation. We deliberately keep the model
minimal — a calibrated logistic regression against a climatology baseline — because the
contribution is the *evaluation*, not model complexity.

We study Washington DC over 2022–2024 using three real, public data sources: Capital Bikeshare
trip volumes as an outdoor-activity signal, NOAA weather, and EPA air quality. The window
includes the June 2023 Canadian-wildfire smoke episode, when DC air quality reached
near-record levels — a natural experiment for the smoke-suppression arm.

Our contributions are bounded and concrete:

1. We formalize activity suppression as a session-level (here, city-hour) binary forecasting
   target and construct it transparently from real ridership relative to a weather-free
   temporal climatology.
2. We show that a calibrated logistic model meaningfully out-discriminates and out-calibrates a
   climatology baseline, and we report decision-curve net benefit, not just AUROC.
3. We define **Recovered Active Minutes (RAM)** operationally as the expected activity preserved
   by a safety-constrained time-shift policy, and we audit that the policy never recommends a
   higher-exposure hour.

## 2. Problem formulation

The unit of analysis is a *planned activity opportunity*. Because no public dataset labels
individually skipped sessions, we operationalize the opportunity as a city-hour: an hour in which
a non-trivial amount of outdoor cycling would normally occur.

For hour `t`, let `E_t` be the weather-free *expected* ridership — the typical volume for that
hour given season, day type, and hour of day, estimated by the median over
`year x season x daytype x hour` cells. An hour is *active* when `E_t` clears a floor (so we do
not divide by near-zero overnight expectations). For active hours we define the binary
suppression outcome

```
Y_t = 1  if  rides_t < rho * E_t        (rho = 0.5 by default)
Y_t = 0  otherwise.
```

The forecasting target is `P(Y_t = 1 | W_t)`, where `W_t` are environmental and temporal
features available before the hour: heat index, PM2.5, humidity, wind, visibility, a smoke/haze
flag, and a cyclical encoding of hour and weekend. Crucially, the climatology `E_t` that defines
the label uses *no* weather, so a below-expectation hour on a hot or smoky day is interpretable as
environmental suppression rather than circular re-prediction of weather from weather.

We separate three tasks the literature often conflates: (i) **risk estimation** — how likely an
hour is suppressed; (ii) **adaptation ranking** — which feasible time shift best preserves
activity; and (iii) **benefit measurement** — how much activity is recovered. The first is the
core forecast; the second and third depend on explicit feasibility and safety constraints.

## 3. Data

All data are public and downloaded by the pipeline; nothing is hand-edited.

- **Activity — Capital Bikeshare** (public trip history, 2022–2024). Every trip's start time is
  aggregated to city-wide hourly counts, split by rider type (member vs casual). Bikeshare is an
  outdoor, weather-exposed activity whose volume responds to conditions, which is exactly the
  behaviour of interest.
- **Weather — NOAA Local Climatological Data**, Reagan National (DCA) station. Hourly dry-bulb
  temperature, relative humidity, dew point, wind speed, visibility, and present-weather codes
  (including smoke/haze). Temperature and humidity yield the NWS heat index.
- **Air quality — EPA AirData daily AQI** for the District of Columbia. The authoritative daily
  AQI gives the pollution level; intra-day smoke variation is carried by two hourly NOAA signals,
  visibility and a smoke/haze present-weather flag, so the air-quality arm is real at both the
  day and hour scale.

Activity (local wall-clock, DST-aware) and weather (local standard time) are converted to UTC and
joined on the hour; daily AQI is joined on the local calendar day. Features are then expressed in
local time so they reflect the conditions a rider actually experiences. The 2024 monthly trip
files switched to a fractional-second timestamp format, which we parse explicitly so no rides are
silently dropped.

## 4. Methods

**Baselines and model.** The climatology baseline predicts the training suppression rate for each
`season x daytype x hour` cell and uses no weather; it answers "does environmental information add
anything beyond the normal rhythm of the city?" The model is a standardized logistic regression on
the environmental and temporal features, with balanced class weights.

**Calibration.** Decision support lives or dies on calibration: if the tool says risk is 0.7,
suppression should occur near 70% of the time under similar conditions. We fit the logistic model
on the earlier portion of the training period and calibrate it (isotonic regression) on a held-out
later slice, then evaluate on a fully out-of-time test year.

**Temporal back-testing.** We train on 2022–2023 and test on 2024 — future conditions, not shuffled
history. We report AUROC and AUPRC (discrimination); Brier score, log loss, expected calibration
error, and calibration slope/intercept (calibration); and a decision curve (net benefit across
risk thresholds) against the adapt-all and adapt-none policies.

**Adaptation and RAM.** For each active hour the recommender keeps the session or shifts it to the
lowest-risk hour within +/-3 hours, subject to a hard safety envelope (heat index below 103 F and
AQI below 150) and a minimum-benefit rule so trivial shifts are not proposed. Recovered Active
Minutes is the expected activity gained by acting versus doing nothing,
`E_t * (risk_keep - risk_chosen)` summed over hours, reported as a share of the activity that would
otherwise be lost. The envelope, not a fixed direction, defines safety: escaping a cold morning may
mean shifting later, escaping afternoon heat earlier, and a smoke-blanketed day is avoided outright.

**Safety and equity.** We audit that no recommendation moves activity into a higher-exposure hour.
We stratify performance by season and day type, and report suppression burden separately for
discretionary (casual) versus committed (member) riders, since adaptation capacity differs.

## 5. Results

The panel holds 26,288 city-hours (2022–2024); 24,601 clear the activity floor, of which 1,718
(7.0%) are suppressed. We train on 2022–2023 (16,085 active hours) and test on 2024 (8,516 hours,
5.6% suppressed).

### 5.1 Discrimination and calibration

Environmental information adds a great deal over the temporal rhythm of the city. The climatology
baseline reaches only AUROC 0.65; the logistic model reaches **0.89** (Table `model_comparison`,
Figure `roc`). But discrimination is not the point of a decision tool, and the raw logistic model
is a cautionary case: trained with balanced class weights it discriminates well yet is badly
**over-confident** (Brier 0.128 — worse than the baseline's 0.053 — expected calibration error
0.237, calibration intercept −2.74). Isotonic calibration on a held-out temporal slice repairs
this almost completely, cutting Brier to **0.040**, log loss to **0.150**, and ECE to **0.008**,
with a calibration slope of 0.93 — while retaining AUROC 0.89 (Figure `reliability`). A model can
rank well and still lie about probabilities; calibration is what makes the risk numbers usable.

The decision curve (Figure `decision_curve`) shows the calibrated model yields positive net
benefit across the plausible range of action thresholds, above both adapt-all and adapt-none.

### 5.2 What actually suppresses activity

The honest finding is that marginal exposure–response is **confounded by season** (Figure
`exposure_response`). Suppression falls monotonically with heat index — from 20% in the coldest
hours to near zero above 90 F — and falls with AQI as well, because hot, high-AQI hours coincide
with summer, when DC cycling is at its seasonal peak and rarely drops below its own norm. The
dominant environmental suppressor in this temperate city is **cold**, not heat, and the fitted
coefficients (Table `logistic_coefficients`) are associational, not causal: heat index loads
negatively largely because it proxies season.

The exception is the acute event, where season is held fixed. During the June 2023 Canadian
wildfire smoke episode (Table `smoke_event`), AQI climbed to 169 on 7 June and **196** on 8 June;
ridership fell to **0.78×** its seasonal-temporal expectation on the worst day — a ~22% drop at
mild temperature, isolating air quality from the seasonal confound. This is the cleanest evidence
that an environmental shock, not the calendar, drives the loss.

### 5.3 Recovered activity and safety

Applying the safety-constrained time-shift policy to the 2024 test year recovers an expected
**38%** of the activity that would otherwise be lost (116,584 rides, ≈1.5M rider-minutes at the
typical ride length). The policy is conservative — it shifts only 14% of hours and cancels 0.06% —
and it is **safe by construction**: zero of its recommendations fall in unsafe conditions, and each
shift lowers predicted suppression risk by 0.15 on average (Table `summary`). The recovered share
sits squarely in the 18–32% range the earlier project draft asserted without evidence; here it is
reproduced from public data.

### 5.4 Robustness and subgroups

Results are stable to the label threshold (Table `label_sensitivity`): across `rho` in
{0.4, 0.5, 0.6} the base rate moves from 4.4% to 10.6% while AUROC stays 0.87–0.91 and ECE ≤ 0.012.
Performance holds across seasons (AUROC 0.85–0.93) and day types (Table `equity_by_season`,
`equity_by_daytype`), with calibration slopes near one. Finally, burden is unequal: **casual
(discretionary) riders are suppressed 10.1% of active hours versus 6.0% for members** (Table
`rider_burden`) — the more committed the activity, the more it survives adverse conditions, which
is exactly the population for whom adaptation support matters most.

## 6. Discussion

Three things follow. First, **calibration is the contribution that matters.** The same model that
looks excellent on AUROC is unusable as stated until calibrated; reporting only discrimination, as
the original draft did, would have hidden a Brier score worse than the baseline. Decision-support
claims should lead with reliability and net benefit.

Second, **naive climate–activity associations are confounded**, and saying so is part of the
result. A pipeline that regressed activity on heat would have "found" that heat protects activity.
The defensible signal comes from holding season fixed — here, an acute event — which is a general
lesson for climate-and-behaviour studies built on observational mobility data.

Third, the framework still does useful work despite a modest model: a transparent, calibrated risk
score plus a safety-constrained adaptation policy recovers a meaningful, reproducible share of lost
activity without ever recommending an unsafe hour. RAM gives organizers a single decision-facing
number, and the safety audit guarantees the policy cannot buy participation with exposure.

The PulseShift application ships the same heat-index and risk logic as a live tool; this paper is
the evidence layer that the tool previously lacked.

## 7. Limitations

First, the suppression label is **constructed**, not observed. Bikeshare volume is an aggregate,
discretionary-skewed proxy for planned activity, and a below-expectation hour can reflect shocks
other than weather. We mitigate this with a weather-free climatology, a ratio threshold, and a
sensitivity analysis, but the outcome is not a recorded skipped session.

Second, this is a **single city and a single activity**. External validity to other climates,
populations, and activity types is untested here.

Third, the RAM benefit is a **model-based expectation under a behavioural assumption** — that the
demand expected at the original hour could be realized at the safer hour. It is a planning quantity,
not a measured causal effect; observational data cannot by itself establish that a time shift
*causes* preserved activity.

Fourth, **equity is environmental and behavioural, not demographic**. The data carry no age, sex,
income, or neighbourhood, so we cannot make the structural-inequality-in-adaptation argument that
the framing motivates; that requires a person-level cohort.

## 8. Reproducibility

Every figure and table is regenerated from public data by two commands
(`scripts/build_data.py`, `scripts/run_analysis.py`) against pinned dependencies. See
`research/README.md`.

## References

1. Fanaee-T, H., & Gama, J. (2013). Event labeling combining ensemble detectors and background
   knowledge. *Progress in Artificial Intelligence*.
2. U.S. EPA, Air Quality System (AQS) hourly data; AQI technical assistance document.
3. NOAA NCEI, Local Climatological Data.
4. Vickers, A. J., & Elkin, E. B. (2006). Decision curve analysis. *Medical Decision Making*.
