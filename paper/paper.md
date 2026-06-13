# Forecasting Climate-Driven Suppression of Physical Activity: A Calibrated, Decision-Focused Evaluation on Real Urban Mobility Data

Urme B.

## Abstract

*Written after the analysis (see Results).*

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
- **Air quality — EPA AQS hourly PM2.5** for DC monitors, averaged across sites and converted to
  AQI with the EPA breakpoints.

Activity (local wall-clock, DST-aware), weather (local standard time), and air quality (GMT) are
each converted to UTC, joined on the hour, and then expressed in local time so that features
reflect the conditions a rider actually experiences.

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

**Adaptation and RAM.** For each active hour the recommender considers keeping the session or
shifting it to the lowest-risk hour within a window, subject to a hard safety filter (heat index
below 103 F and PM2.5 below the AQI-150 boundary). Recovered Active Minutes is the expected
activity gained by acting versus doing nothing, `E_t * (risk_keep - risk_chosen)` summed over
hours, reported as a share of the activity that would otherwise be lost.

**Safety and equity.** We audit that no recommendation moves activity into a higher-exposure hour.
We stratify performance by season and day type, and report suppression burden separately for
discretionary (casual) versus committed (member) riders, since adaptation capacity differs.

## 5. Results

*Written after the analysis run (`scripts/run_analysis.py`).*

## 6. Discussion

*Written after the analysis run.*

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
