(function () {
  const OFFICIAL_SOURCES = [
    {
      key: "noaa_nws_api",
      name: "NOAA National Weather Service API",
      provider: "NOAA NWS",
      role: "Live hourly forecast and alerts for United States locations",
      freshness: "Operational hourly forecast updates",
      accessModel: "Open data, no key currently required",
      status: "Active in MVP",
      fitScore: 100,
      url: "https://www.weather.gov/documentation/services-web-api",
      notes: "Best operational fit for United States organizer first decisions"
    },
    {
      key: "noaa_heatrisk",
      name: "NWS HeatRisk",
      provider: "NOAA NWS",
      role: "Heat health risk context for short range decisions",
      freshness: "Daily forecasts up to 7 days",
      accessModel: "Open public product",
      status: "Reference source for next integration",
      fitScore: 94,
      url: "https://www.wpc.ncep.noaa.gov/heatrisk/",
      notes: "Better product fit than generic temperature thresholds"
    },
    {
      key: "epa_airnow",
      name: "EPA AirNow API",
      provider: "US EPA AirNow",
      role: "Current and forecast AQI for reporting areas",
      freshness: "Near real time and forecast",
      accessModel: "Public reporting area file feed",
      status: "Active in MVP",
      fitScore: 93,
      url: "https://s3-us-west-1.amazonaws.com/files.airnowtech.org/airnow/docs/ReportingAreaFactSheet.pdf",
      notes: "Using the official reporting area feed for key free AQI import"
    },
    {
      key: "copernicus_era5_land",
      name: "Copernicus ERA5 Land",
      provider: "Copernicus Climate Data Store",
      role: "Historical hourly weather backfill for model training and backtests",
      freshness: "Daily updates, historical from 1950",
      accessModel: "Open access under CC BY with platform account",
      status: "Backtest source",
      fitScore: 91,
      url: "https://cds.climate.copernicus.eu/datasets/reanalysis-era5-land-timeseries",
      notes: "Best historical climate source in this stack"
    },
    {
      key: "epa_aqs",
      name: "EPA AQS API",
      provider: "US EPA AQS",
      role: "Validated historical air quality monitor data",
      freshness: "Lagged regulatory quality history",
      accessModel: "Public API with key",
      status: "Historical validation source",
      fitScore: 85,
      url: "https://aqs.epa.gov/aqsweb/documents/data_api.html",
      notes: "Not real time, but strong for retrospective model validation"
    },
    {
      key: "owid_context",
      name: "Our World in Data",
      provider: "Global Change Data Lab",
      role: "Macro narrative and market context only",
      freshness: "Topic dependent",
      accessModel: "Open access",
      status: "Context source, not product source",
      fitScore: 42,
      url: "https://ourworldindata.org/",
      notes: "Good for pitch context, weak for session level product logic"
    }
  ];

  const EFFORT_SCORES = {
    easy: 0.04,
    moderate: 0.1,
    hard: 0.18
  };

  const CHANGE_COSTS = {
    keep: 0,
    earlier: 8,
    route: 7,
    easier: 6,
    shorten: 5,
    indoor: 14,
    cancel: 999
  };

  const RISK_BANDS = [
    { limit: 0.25, label: "Low" },
    { limit: 0.5, label: "Moderate" },
    { limit: 0.75, label: "High" },
    { limit: 1, label: "Severe" }
  ];

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function round(value, digits = 0) {
    const factor = 10 ** digits;
    return Math.round(value * factor) / factor;
  }

  function interpolate(value, fromMin, fromMax, toMin, toMax) {
    if (fromMin === fromMax) {
      return toMax;
    }

    const progress = clamp((value - fromMin) / (fromMax - fromMin), 0, 1);
    return toMin + (toMax - toMin) * progress;
  }

  function lowerEffortLevel(level) {
    if (level === "hard") {
      return "moderate";
    }

    return "easy";
  }

  function normalizeBoolean(value) {
    if (typeof value === "boolean") {
      return value;
    }

    return value === "true" || value === "yes" || value === 1;
  }

  function normalizeSession(input) {
    const effortLevel = ["easy", "moderate", "hard"].includes(input.effortLevel)
      ? input.effortLevel
      : "moderate";

    return {
      sessionName: String(input.sessionName || "Untitled session").trim() || "Untitled session",
      startTime: String(input.startTime || "18:00"),
      durationMinutes: clamp(Number(input.durationMinutes) || 45, 15, 240),
      effortLevel,
      tempF: clamp(Number(input.tempF) || 75, 20, 130),
      humidity: clamp(Number(input.humidity) || 50, 5, 100),
      aqi: clamp(Number(input.aqi) || 40, 0, 500),
      smokeAlert: normalizeBoolean(input.smokeAlert),
      flexibleStartMinutes: clamp(Number(input.flexibleStartMinutes) || 0, 0, 180),
      indoorAvailable: normalizeBoolean(input.indoorAvailable),
      alternativeRouteAvailable: normalizeBoolean(input.alternativeRouteAvailable),
      shadeAvailable: normalizeBoolean(input.shadeAvailable)
    };
  }

  function calculateHeatIndex(tempF, humidity) {
    if (tempF < 80 || humidity < 40) {
      return tempF;
    }

    const simpleIndex =
      -42.379 +
      2.04901523 * tempF +
      10.14333127 * humidity -
      0.22475541 * tempF * humidity -
      0.00683783 * tempF ** 2 -
      0.05481717 * humidity ** 2 +
      0.00122874 * tempF ** 2 * humidity +
      0.00085282 * tempF * humidity ** 2 -
      0.00000199 * tempF ** 2 * humidity ** 2;

    return round(simpleIndex, 1);
  }

  function scoreHeatSeverity(heatIndexF) {
    if (heatIndexF <= 80) {
      return 0.04;
    }

    if (heatIndexF <= 90) {
      return interpolate(heatIndexF, 80, 90, 0.04, 0.32);
    }

    if (heatIndexF <= 103) {
      return interpolate(heatIndexF, 90, 103, 0.32, 0.7);
    }

    if (heatIndexF <= 124) {
      return interpolate(heatIndexF, 103, 124, 0.7, 1);
    }

    return 1;
  }

  function scoreSmokeSeverity(aqi, smokeAlert) {
    let severity = 0;

    if (aqi <= 50) {
      severity = 0.04;
    } else if (aqi <= 100) {
      severity = interpolate(aqi, 51, 100, 0.12, 0.34);
    } else if (aqi <= 150) {
      severity = interpolate(aqi, 101, 150, 0.4, 0.68);
    } else if (aqi <= 200) {
      severity = interpolate(aqi, 151, 200, 0.74, 0.92);
    } else {
      severity = 1;
    }

    if (smokeAlert) {
      severity += 0.08;
    }

    return clamp(severity, 0, 1);
  }

  function durationFactor(durationMinutes) {
    return clamp((durationMinutes - 30) / 90, 0, 1) * 0.12;
  }

  function flexibilityPenalty(flexibleStartMinutes) {
    if (flexibleStartMinutes >= 60) {
      return 0;
    }

    if (flexibleStartMinutes >= 30) {
      return 0.03;
    }

    return 0.08;
  }

  function optionPenalty(session) {
    if (session.indoorAvailable || session.alternativeRouteAvailable || session.shadeAvailable) {
      return 0;
    }

    return 0.05;
  }

  function riskBand(score) {
    return RISK_BANDS.find((entry) => score <= entry.limit).label;
  }

  function buildDrivers(parts) {
    return Object.entries(parts)
      .sort((left, right) => right[1] - left[1])
      .slice(0, 4)
      .map(function (entry) {
        return {
          label: entry[0],
          contribution: round(entry[1], 2)
        };
      });
  }

  function scoreSuppressionRisk(input) {
    const session = normalizeSession(input);
    const heatIndexF = calculateHeatIndex(session.tempF, session.humidity);
    const heatSeverity = scoreHeatSeverity(heatIndexF);
    const smokeSeverity = scoreSmokeSeverity(session.aqi, session.smokeAlert);
    const duration = durationFactor(session.durationMinutes);
    const effort = EFFORT_SCORES[session.effortLevel];
    const flexibility = flexibilityPenalty(session.flexibleStartMinutes);
    const options = optionPenalty(session);
    const interaction = 0.12 * heatSeverity * smokeSeverity;

    let score =
      0.36 * heatSeverity +
      0.34 * smokeSeverity +
      duration +
      effort +
      flexibility +
      options +
      interaction;

    if (session.indoorAvailable) {
      score -= 0.03;
    }

    if (session.shadeAvailable || session.alternativeRouteAvailable) {
      score -= 0.02;
    }

    score = clamp(score, 0.03, 0.99);

    const drivers = buildDrivers({
      Heat: 0.36 * heatSeverity,
      Smoke: 0.34 * smokeSeverity,
      Duration: duration,
      Effort: effort,
      Flexibility: flexibility,
      Options: options,
      Interaction: interaction
    });

    return {
      session: session,
      score: round(score, 2),
      band: riskBand(score),
      heatIndexF: heatIndexF,
      heatSeverity: round(heatSeverity, 2),
      smokeSeverity: round(smokeSeverity, 2),
      drivers: drivers
    };
  }

  function createCandidatePlans(session) {
    const plans = [
      {
        id: "keep",
        label: "Keep plan",
        kind: "keep",
        session: session
      }
    ];

    if (session.flexibleStartMinutes >= 30) {
      const shift = session.flexibleStartMinutes >= 60 ? 60 : 30;

      plans.push({
        id: "earlier-start",
        label: "Start " + shift + " min earlier",
        kind: "earlier",
        session: Object.assign({}, session, {
          tempF: session.tempF - (shift >= 60 ? 7 : 4),
          aqi: Math.max(0, session.aqi - (session.aqi > 100 ? 12 : 4))
        })
      });
    }

    if (session.alternativeRouteAvailable || session.shadeAvailable) {
      plans.push({
        id: "route-shift",
        label: "Shift to cooler route",
        kind: "route",
        session: Object.assign({}, session, {
          tempF: session.tempF - (session.shadeAvailable ? 5 : 3),
          aqi: Math.max(0, session.aqi - (session.alternativeRouteAvailable ? 6 : 0)),
          durationMinutes: round(session.durationMinutes * 0.95)
        })
      });
    }

    if (session.effortLevel !== "easy") {
      plans.push({
        id: "ease-intensity",
        label: "Reduce intensity",
        kind: "easier",
        session: Object.assign({}, session, {
          effortLevel: lowerEffortLevel(session.effortLevel),
          durationMinutes: round(session.durationMinutes * 0.9)
        })
      });
    }

    if (session.durationMinutes > 30) {
      plans.push({
        id: "shorten-session",
        label: "Shorten session",
        kind: "shorten",
        session: Object.assign({}, session, {
          durationMinutes: Math.max(20, round(session.durationMinutes * 0.7)),
          effortLevel: session.effortLevel === "hard" ? "moderate" : session.effortLevel
        })
      });
    }

    if (session.indoorAvailable) {
      plans.push({
        id: "move-indoors",
        label: "Move indoors",
        kind: "indoor",
        session: Object.assign({}, session, {
          tempF: 72,
          humidity: 45,
          aqi: 20,
          smokeAlert: false,
          durationMinutes: round(session.durationMinutes * 0.9)
        })
      });
    }

    plans.push({
      id: "cancel",
      label: "Cancel session",
      kind: "cancel",
      session: Object.assign({}, session, {
        durationMinutes: 0,
        tempF: 72,
        humidity: 45,
        aqi: 20,
        smokeAlert: false
      })
    });

    return plans;
  }

  function safetyMargin(session) {
    const heatIndexF = calculateHeatIndex(session.tempF, session.humidity);
    const heatHeadroom = clamp((124 - heatIndexF) / 44, 0, 1);
    const smokeHeadroom = clamp((200 - session.aqi) / 180, 0, 1);
    return round(Math.min(heatHeadroom, smokeHeadroom), 2);
  }

  function violatesSafety(candidate) {
    if (candidate.kind === "cancel" || candidate.kind === "indoor") {
      return false;
    }

    const session = candidate.session;
    const heatIndexF = calculateHeatIndex(session.tempF, session.humidity);

    if (session.aqi >= 201) {
      return true;
    }

    if (session.smokeAlert && session.aqi >= 151) {
      return true;
    }

    if (heatIndexF >= 124) {
      return true;
    }

    if (heatIndexF >= 110 && session.durationMinutes >= 45) {
      return true;
    }

    if (heatIndexF >= 103 && session.effortLevel === "hard") {
      return true;
    }

    return false;
  }

  function buildReason(candidate, baseEvaluation) {
    if (candidate.kind === "keep") {
      return "Risk is manageable without changing the plan, so change cost is not justified.";
    }

    if (candidate.kind === "earlier") {
      return "Earlier timing cuts heat load fast while preserving most planned minutes.";
    }

    if (candidate.kind === "route") {
      return "A cooler or shaded route lowers exposure without fully breaking the session.";
    }

    if (candidate.kind === "easier") {
      return "Lower intensity reduces heat and smoke strain while keeping the session intact.";
    }

    if (candidate.kind === "shorten") {
      return "A shorter session protects safety when conditions are marginal but still usable.";
    }

    if (candidate.kind === "indoor") {
      return "Indoor replacement removes the outdoor hazard while preserving most activity.";
    }

    if (baseEvaluation.score >= 0.9) {
      return "Conditions are too risky for a safe outdoor session and no adaptation preserves enough value.";
    }

    return "Cancellation is the safest fallback when safer alternatives do not exist.";
  }

  function evaluateCandidate(candidate, baseEvaluation, baselineExpectedMinutes) {
    if (candidate.kind === "cancel") {
      return {
        id: candidate.id,
        label: candidate.label,
        kind: candidate.kind,
        safe: true,
        riskScore: 0,
        riskBand: "Low",
        expectedMinutes: 0,
        ram: 0,
        safetyMargin: 1,
        decisionScore: -200,
        reason: buildReason(candidate, baseEvaluation)
      };
    }

    const risk = scoreSuppressionRisk(candidate.session);
    const safe = !violatesSafety(candidate);
    const expectedMinutes = round(candidate.session.durationMinutes * (1 - risk.score));
    const ram = Math.max(0, round(expectedMinutes - baselineExpectedMinutes));
    const friction = CHANGE_COSTS[candidate.kind] || 0;
    let decisionScore = ram - friction + round(safetyMargin(candidate.session) * 8, 2);

    if (candidate.kind === "keep" && risk.score <= 0.32 && safe) {
      decisionScore += 18;
    }

    if (!safe) {
      decisionScore = Number.NEGATIVE_INFINITY;
    }

    return {
      id: candidate.id,
      label: candidate.label,
      kind: candidate.kind,
      safe: safe,
      riskScore: risk.score,
      riskBand: risk.band,
      expectedMinutes: expectedMinutes,
      ram: ram,
      safetyMargin: safetyMargin(candidate.session),
      decisionScore: decisionScore,
      reason: buildReason(candidate, baseEvaluation)
    };
  }

  function rankAdaptations(input) {
    const session = normalizeSession(input);
    const baseRisk = scoreSuppressionRisk(session);
    const baselineExpectedMinutes = round(session.durationMinutes * (1 - baseRisk.score));
    const evaluated = createCandidatePlans(session).map(function (candidate) {
      return evaluateCandidate(candidate, baseRisk, baselineExpectedMinutes);
    });

    const cancelAction = evaluated.find(function (entry) {
      return entry.id === "cancel";
    });

    const safeActions = evaluated
      .filter(function (entry) {
        return entry.id !== "cancel" && entry.safe;
      })
      .sort(function (left, right) {
        if (right.decisionScore !== left.decisionScore) {
          return right.decisionScore - left.decisionScore;
        }

        if (right.expectedMinutes !== left.expectedMinutes) {
          return right.expectedMinutes - left.expectedMinutes;
        }

        return right.safetyMargin - left.safetyMargin;
      });

    let recommendations = safeActions;

    if (!recommendations.length) {
      recommendations = [cancelAction];
    } else if (
      baseRisk.score >= 0.9 &&
      recommendations[0].expectedMinutes < round(session.durationMinutes * 0.35)
    ) {
      recommendations = [cancelAction].concat(recommendations);
    }

    return {
      session: session,
      baseline: {
        riskScore: baseRisk.score,
        riskBand: baseRisk.band,
        expectedMinutes: baselineExpectedMinutes,
        heatIndexF: baseRisk.heatIndexF,
        heatSeverity: baseRisk.heatSeverity,
        smokeSeverity: baseRisk.smokeSeverity,
        drivers: baseRisk.drivers
      },
      recommendations: recommendations
    };
  }

  const form = document.querySelector("#session-form");
  const riskBandNode = document.querySelector("#risk-band");
  const riskScore = document.querySelector("#risk-score");
  const expectedMinutes = document.querySelector("#expected-minutes");
  const heatSmoke = document.querySelector("#heat-smoke");
  const bestAction = document.querySelector("#best-action");
  const bestActionDetail = document.querySelector("#best-action-detail");
  const topRecommendation = document.querySelector("#top-recommendation");
  const riskDrivers = document.querySelector("#risk-drivers");
  const rankingBody = document.querySelector("#ranking-body");
  const historyBody = document.querySelector("#history-body");
  const sourcesBody = document.querySelector("#sources-body");
  const weatherSnapshot = document.querySelector("#weather-snapshot");
  const aqiSnapshot = document.querySelector("#aqi-snapshot");
  const dbState = document.querySelector("#db-state");
  const dbDetail = document.querySelector("#db-detail");
  const fetchWeatherButton = document.querySelector("#fetch-weather-button");
  const sourceStatus = document.querySelector("#source-status");

  const DEFAULT_SOURCE_COPY = "Use official NOAA weather and AirNow AQI to fill conditions.";
  const SERVER_HINT = "Open http://127.0.0.1:4173 to enable database and official data features.";

  let apiAvailable = false;

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function readSession() {
    const formData = new FormData(form);

    return {
      sessionName: formData.get("sessionName"),
      startTime: formData.get("startTime"),
      durationMinutes: Number(formData.get("durationMinutes")),
      effortLevel: formData.get("effortLevel"),
      tempF: Number(formData.get("tempF")),
      humidity: Number(formData.get("humidity")),
      aqi: Number(formData.get("aqi")),
      smokeAlert: formData.get("smokeAlert") === "yes",
      flexibleStartMinutes: Number(formData.get("flexibleStartMinutes")),
      indoorAvailable: formData.has("indoorAvailable"),
      alternativeRouteAvailable: formData.has("alternativeRouteAvailable"),
      shadeAvailable: formData.has("shadeAvailable")
    };
  }

  function chipClass(riskLabel) {
    return "recommendation-chip chip-" + riskLabel.toLowerCase();
  }

  function renderEmptyRow(target, colspan, message) {
    target.replaceChildren();
    const row = document.createElement("tr");
    row.className = "empty-row";
    row.innerHTML = "<td colspan=\"" + colspan + "\">" + escapeHtml(message) + "</td>";
    target.append(row);
  }

  async function requestJson(url, options) {
    const response = await fetch(
      url,
      Object.assign(
        {
          headers: {
            "Content-Type": "application/json"
          }
        },
        options || {}
      )
    );

    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.error || "Request failed");
    }

    return payload;
  }

  function renderRecommendation(recommendation) {
    topRecommendation.innerHTML =
      "<div class=\"recommendation-title\"><div><h3>" +
      escapeHtml(recommendation.label) +
      "</h3><p class=\"recommendation-copy\">" +
      escapeHtml(recommendation.reason) +
      "</p></div><span class=\"" +
      chipClass(recommendation.riskBand) +
      "\">" +
      escapeHtml(recommendation.riskBand) +
      "</span></div><div class=\"recommendation-meta\"><div class=\"meta-card\"><p class=\"summary-label\">Expected minutes</p><p class=\"meta-value\">" +
      recommendation.expectedMinutes +
      "</p></div><div class=\"meta-card\"><p class=\"summary-label\">RAM</p><p class=\"meta-value\">" +
      recommendation.ram +
      "</p></div><div class=\"meta-card\"><p class=\"summary-label\">Safety margin</p><p class=\"meta-value\">" +
      Math.round(recommendation.safetyMargin * 100) +
      "%</p></div></div>";
  }

  function renderDrivers(drivers) {
    riskDrivers.replaceChildren();

    drivers.forEach(function (driver) {
      const item = document.createElement("li");
      item.className = "driver-item";
      item.innerHTML =
        "<span>" +
        escapeHtml(driver.label) +
        "</span><span class=\"driver-value\">" +
        driver.contribution +
        "</span>";
      riskDrivers.append(item);
    });
  }

  function renderRanking(recommendations) {
    rankingBody.replaceChildren();

    recommendations.forEach(function (recommendation) {
      const row = document.createElement("tr");
      row.innerHTML =
        "<td>" +
        escapeHtml(recommendation.label) +
        "</td><td>" +
        recommendation.riskBand +
        " (" +
        recommendation.riskScore +
        ")</td><td>" +
        recommendation.expectedMinutes +
        "</td><td>" +
        recommendation.ram +
        "</td><td class=\"" +
        (recommendation.safe ? "safe" : "unsafe") +
        "\">" +
        (recommendation.safe ? "Safe" : "Unsafe") +
        "</td>";
      rankingBody.append(row);
    });
  }

  function renderHistory(items) {
    if (!items.length) {
      renderEmptyRow(historyBody, 5, "No saved evaluations yet");
      return;
    }

    historyBody.replaceChildren();

    items.forEach(function (item) {
      const row = document.createElement("tr");
      row.innerHTML =
        "<td>" +
        escapeHtml(item.sessionName) +
        "</td><td>" +
        escapeHtml(item.createdAtLabel) +
        "</td><td>" +
        escapeHtml(item.baselineRiskBand) +
        " (" +
        item.baselineRiskScore +
        ")</td><td>" +
        escapeHtml(item.bestAction) +
        "</td><td>" +
        item.bestRam +
        "</td>";
      historyBody.append(row);
    });
  }

  function renderSources(items) {
    if (!items.length) {
      renderEmptyRow(sourcesBody, 5, "No source catalog available");
      return;
    }

    sourcesBody.replaceChildren();

    items.forEach(function (item) {
      const row = document.createElement("tr");
      row.innerHTML =
        "<td><a href=\"" +
        escapeHtml(item.url) +
        "\" target=\"_blank\" rel=\"noreferrer\">" +
        escapeHtml(item.name) +
        "</a></td><td>" +
        escapeHtml(item.provider) +
        "</td><td>" +
        escapeHtml(item.role) +
        "</td><td>" +
        escapeHtml(item.status) +
        "</td><td>" +
        item.fitScore +
        "</td>";
      sourcesBody.append(row);
    });
  }

  function renderWeatherSnapshot(snapshot) {
    if (!snapshot) {
      weatherSnapshot.innerHTML =
        "<p class=\"recommendation-copy\">No official weather snapshot saved yet.</p>";
      return;
    }

    const forecast = snapshot.payload.forecast;
    weatherSnapshot.innerHTML =
      "<div class=\"recommendation-title\"><div><h3>" +
      escapeHtml(snapshot.city || "Unknown city") +
      (snapshot.state ? ", " + escapeHtml(snapshot.state) : "") +
      "</h3><p class=\"recommendation-copy\">" +
      escapeHtml(forecast.shortForecast || "Forecast unavailable") +
      "</p></div><span class=\"recommendation-chip chip-low\">" +
      escapeHtml(snapshot.sourceKey) +
      "</span></div><div class=\"recommendation-meta\"><div class=\"meta-card\"><p class=\"summary-label\">Temperature</p><p class=\"meta-value\">" +
      forecast.temperature +
      " " +
      escapeHtml(forecast.temperatureUnit || "F") +
      "</p></div><div class=\"meta-card\"><p class=\"summary-label\">Humidity</p><p class=\"meta-value\">" +
      (forecast.relativeHumidity ?? "NA") +
      "%</p></div><div class=\"meta-card\"><p class=\"summary-label\">Saved</p><p class=\"meta-value\">" +
      escapeHtml(snapshot.createdAtLabel || "Live") +
      "</p></div></div><p class=\"recommendation-copy\">Grid " +
      escapeHtml(snapshot.payload.point.gridId || "NA") +
      " " +
      (snapshot.payload.point.gridX ?? "NA") +
      ", " +
      (snapshot.payload.point.gridY ?? "NA") +
      "  |  " +
      escapeHtml(forecast.windSpeed || "NA") +
      " " +
      escapeHtml(forecast.windDirection || "") +
      "</p>";
  }

  function renderAqiSnapshot(snapshot) {
    if (!snapshot) {
      aqiSnapshot.innerHTML =
        "<p class=\"recommendation-copy\">No official AQI snapshot saved yet.</p>";
      return;
    }

    const effective = snapshot.payload.effective;
    const observed = snapshot.payload.currentObservation;
    const forecast = snapshot.payload.todayForecast;
    const chipTone =
      effective.aqi >= 101 ? "chip-high" : effective.aqi >= 51 ? "chip-moderate" : "chip-low";

    aqiSnapshot.innerHTML =
      "<div class=\"recommendation-title\"><div><h3>" +
      escapeHtml(snapshot.reportingArea || "Unknown area") +
      (snapshot.state ? ", " + escapeHtml(snapshot.state) : "") +
      "</h3><p class=\"recommendation-copy\">" +
      escapeHtml(effective.category || "AQI category unavailable") +
      "</p></div><span class=\"recommendation-chip " +
      chipTone +
      "\">AQI " +
      effective.aqi +
      "</span></div><div class=\"recommendation-meta\"><div class=\"meta-card\"><p class=\"summary-label\">Observed</p><p class=\"meta-value\">" +
      (observed ? observed.aqi : "NA") +
      "</p></div><div class=\"meta-card\"><p class=\"summary-label\">Forecast</p><p class=\"meta-value\">" +
      (forecast ? forecast.aqi : "NA") +
      "</p></div><div class=\"meta-card\"><p class=\"summary-label\">Saved</p><p class=\"meta-value\">" +
      escapeHtml(snapshot.createdAtLabel || "Live") +
      "</p></div></div><p class=\"recommendation-copy\">Strategy " +
      escapeHtml(snapshot.payload.lookup.strategy) +
      "  |  Distance " +
      snapshot.payload.lookup.distanceMiles +
      " mi  |  Smoke signal " +
      (effective.smokeAlert ? "Yes" : "No") +
      "</p>";
  }

  function renderDecision(result) {
    const top = result.recommendations[0];

    riskBandNode.textContent = result.baseline.riskBand;
    riskScore.textContent = "Risk score " + result.baseline.riskScore;
    expectedMinutes.textContent = result.baseline.expectedMinutes + " min";
    heatSmoke.textContent =
      "Heat index " + result.baseline.heatIndexF + "F  |  AQI " + result.session.aqi;
    bestAction.textContent = top.label;
    bestActionDetail.textContent = "RAM +" + top.ram + " min";

    renderRecommendation(top);
    renderDrivers(result.baseline.drivers);
    renderRanking(result.recommendations);
  }

  function setDatabaseState(health) {
    dbState.textContent = health.ok ? "Connected" : "Unavailable";
    dbDetail.textContent = health.ok
      ? health.backend +
        "  |  " +
        health.savedEvaluations +
        " evaluations, " +
        health.savedWeatherSnapshots +
        " weather snapshots, " +
        health.savedAqiSnapshots +
        " AQI snapshots, " +
        health.sourceCatalogSize +
        " ranked sources"
      : "Database connection failed";
  }

  function setOfflineState(reason) {
    apiAvailable = false;
    dbState.textContent = "Local only";
    dbDetail.textContent = reason + "  |  " + SERVER_HINT;
    fetchWeatherButton.disabled = true;
    sourceStatus.textContent = "Official data import unavailable. " + SERVER_HINT;
    renderHistory([]);
    renderSources(
      OFFICIAL_SOURCES.map(function (item) {
        return {
          sourceKey: item.key,
          name: item.name,
          provider: item.provider,
          role: item.role,
          freshness: item.freshness,
          accessModel: item.accessModel,
          status: item.status,
          fitScore: item.fitScore,
          url: item.url,
          notes: item.notes
        };
      })
    );
    renderWeatherSnapshot(null);
    renderAqiSnapshot(null);
  }

  async function loadDatabaseStatus() {
    const health = await requestJson("/api/health");
    apiAvailable = true;
    setDatabaseState(health);
  }

  async function loadHistory() {
    const payload = await requestJson("/api/evaluations?limit=5");
    renderHistory(payload.items);
  }

  async function loadSources() {
    const payload = await requestJson("/api/sources");
    renderSources(payload.items);
  }

  async function loadLatestWeather() {
    const payload = await requestJson("/api/latest-weather");
    renderWeatherSnapshot(payload.item);
  }

  async function loadLatestAqi() {
    const payload = await requestJson("/api/latest-aqi");
    renderAqiSnapshot(payload.item);
  }

  function setWorkingState(button, isWorking, message) {
    button.disabled = isWorking;
    sourceStatus.textContent = message || DEFAULT_SOURCE_COPY;
  }

  function applyOfficialConditions(conditions) {
    const forecast = conditions.weather.payload.forecast;
    const effective = conditions.airQuality.payload.effective;

    form.elements.tempF.value = forecast.temperature;

    if (Number.isFinite(forecast.relativeHumidity)) {
      form.elements.humidity.value = Math.round(forecast.relativeHumidity);
    }

    form.elements.aqi.value = effective.aqi;
    form.elements.smokeAlert.value = effective.smokeAlert ? "yes" : "no";
    sourceStatus.textContent =
      ("Loaded official NOAA weather for " +
        (conditions.weather.city || "unknown city") +
        ", " +
        (conditions.weather.state || "") +
        " and AirNow AQI for " +
        (conditions.airQuality.reportingArea || "unknown area")).trim();
  }

  async function evaluateSession(options) {
    const persist = options.persist;

    if (!apiAvailable) {
      const result = rankAdaptations(readSession());
      renderDecision(result);
      return;
    }

    const payload = await requestJson("/api/evaluate", {
      method: "POST",
      body: JSON.stringify({
        session: readSession(),
        persist: persist
      })
    });

    renderDecision(payload.result);

    if (persist) {
      await Promise.all([loadDatabaseStatus(), loadHistory()]);
    }
  }

  async function fetchOfficialConditions() {
    try {
      setWorkingState(fetchWeatherButton, true, "Pulling official NOAA weather and AirNow AQI");

      const latitude = Number(form.elements.latitude.value);
      const longitude = Number(form.elements.longitude.value);
      const payload = await requestJson(
        "/api/official-conditions?lat=" +
          encodeURIComponent(latitude) +
          "&lon=" +
          encodeURIComponent(longitude)
      );

      applyOfficialConditions(payload.conditions);
      renderWeatherSnapshot(
        Object.assign({}, payload.conditions.weather, {
          createdAtLabel: "Just now"
        })
      );
      renderAqiSnapshot(
        Object.assign({}, payload.conditions.airQuality, {
          createdAtLabel: "Just now"
        })
      );

      await Promise.all([
        loadDatabaseStatus(),
        loadLatestWeather(),
        loadLatestAqi(),
        evaluateSession({ persist: false })
      ]);
    } catch (error) {
      sourceStatus.textContent = error.message;
    } finally {
      setWorkingState(fetchWeatherButton, false, sourceStatus.textContent || DEFAULT_SOURCE_COPY);
    }
  }

  form.addEventListener("submit", async function (event) {
    event.preventDefault();
    await evaluateSession({ persist: true });
  });

  fetchWeatherButton.addEventListener("click", async function () {
    await fetchOfficialConditions();
  });

  async function initializeApp() {
    renderSources(
      OFFICIAL_SOURCES.map(function (item) {
        return {
          sourceKey: item.key,
          name: item.name,
          provider: item.provider,
          role: item.role,
          freshness: item.freshness,
          accessModel: item.accessModel,
          status: item.status,
          fitScore: item.fitScore,
          url: item.url,
          notes: item.notes
        };
      })
    );

    try {
      sourceStatus.textContent = DEFAULT_SOURCE_COPY;
      await Promise.all([
        loadDatabaseStatus(),
        loadHistory(),
        loadSources(),
        loadLatestWeather(),
        loadLatestAqi()
      ]);
      await evaluateSession({ persist: false });
    } catch (error) {
      setOfflineState(error.message || "Server unavailable");
      await evaluateSession({ persist: false });
    }
  }

  initializeApp();
})();
