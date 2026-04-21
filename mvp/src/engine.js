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

function parseStartMinutes(value) {
  const match = String(value || "").match(/^(\d{2}):(\d{2})$/);

  if (!match) {
    return null;
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);

  if (hours > 23 || minutes > 59) {
    return null;
  }

  return hours * 60 + minutes;
}

function adjustClock(startTime, deltaMinutes) {
  const startMinutes = parseStartMinutes(startTime);

  if (startMinutes === null) {
    return startTime;
  }

  const minutesInDay = 24 * 60;
  const shifted = (startMinutes - deltaMinutes + minutesInDay) % minutesInDay;
  const hours = String(Math.floor(shifted / 60)).padStart(2, "0");
  const minutes = String(shifted % 60).padStart(2, "0");
  return `${hours}:${minutes}`;
}

function earlierStartBenefit(startTime, shiftMinutes) {
  const startMinutes = parseStartMinutes(startTime);

  if (startMinutes === null) {
    return {
      tempDrop: shiftMinutes >= 60 ? 7 : 4,
      aqiDrop: shiftMinutes >= 60 ? 6 : 3
    };
  }

  let heatFactor = 0.2;

  if (startMinutes >= 15 * 60 && startMinutes <= 19 * 60) {
    heatFactor = 1;
  } else if (startMinutes >= 11 * 60 && startMinutes < 15 * 60) {
    heatFactor = 0.8;
  } else if (startMinutes >= 8 * 60 && startMinutes < 11 * 60) {
    heatFactor = 0.45;
  } else if (startMinutes >= 5 * 60 && startMinutes < 8 * 60) {
    heatFactor = 0.2;
  } else if (startMinutes > 19 * 60) {
    heatFactor = 0.35;
  }

  const shiftFactor = shiftMinutes / 60;

  return {
    tempDrop: round(1.5 + 5.5 * heatFactor * shiftFactor, 1),
    aqiDrop: round(1 + 5 * heatFactor * shiftFactor, 1)
  };
}

export function normalizeSession(input = {}) {
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

export function calculateHeatIndex(tempF, humidity) {
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

export function scoreHeatSeverity(heatIndexF) {
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

export function scoreSmokeSeverity(aqi, smokeAlert) {
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
  return RISK_BANDS.find((entry) => score <= entry.limit)?.label || "Severe";
}

function buildDrivers(parts) {
  return Object.entries(parts)
    .sort((left, right) => right[1] - left[1])
    .slice(0, 4)
    .map(([label, value]) => ({
      label,
      contribution: round(value, 2)
    }));
}

export function scoreSuppressionRisk(input) {
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
    session,
    score: round(score, 2),
    band: riskBand(score),
    heatIndexF,
    heatSeverity: round(heatSeverity, 2),
    smokeSeverity: round(smokeSeverity, 2),
    drivers
  };
}

function createCandidatePlans(session) {
  const plans = [
    {
      id: "keep",
      label: "Keep plan",
      kind: "keep",
      session
    }
  ];

    if (session.flexibleStartMinutes >= 30) {
      const shift = session.flexibleStartMinutes >= 60 ? 60 : 30;
      const benefit = earlierStartBenefit(session.startTime, shift);

      plans.push({
        id: "earlier-start",
        label: `Start ${shift} min earlier`,
        kind: "earlier",
        session: {
          ...session,
          startTime: adjustClock(session.startTime, shift),
          tempF: round(Math.max(20, session.tempF - benefit.tempDrop), 1),
          aqi: round(Math.max(0, session.aqi - benefit.aqiDrop))
        }
      });
    }

  if (session.alternativeRouteAvailable || session.shadeAvailable) {
    plans.push({
      id: "route-shift",
      label: "Shift to cooler route",
      kind: "route",
      session: {
        ...session,
        tempF: session.tempF - (session.shadeAvailable ? 5 : 3),
        aqi: Math.max(0, session.aqi - (session.alternativeRouteAvailable ? 6 : 0)),
        durationMinutes: round(session.durationMinutes * 0.95)
      }
    });
  }

  if (session.effortLevel !== "easy") {
    plans.push({
      id: "ease-intensity",
      label: "Reduce intensity",
      kind: "easier",
      session: {
        ...session,
        effortLevel: lowerEffortLevel(session.effortLevel),
        durationMinutes: round(session.durationMinutes * 0.9)
      }
    });
  }

  if (session.durationMinutes > 30) {
    plans.push({
      id: "shorten-session",
      label: "Shorten session",
      kind: "shorten",
      session: {
        ...session,
        durationMinutes: Math.max(20, round(session.durationMinutes * 0.7)),
        effortLevel: session.effortLevel === "hard" ? "moderate" : session.effortLevel
      }
    });
  }

  if (session.indoorAvailable) {
    plans.push({
      id: "move-indoors",
      label: "Move indoors",
      kind: "indoor",
      session: {
        ...session,
        tempF: 72,
        humidity: 45,
        aqi: 20,
        smokeAlert: false,
        durationMinutes: round(session.durationMinutes * 0.9)
      }
    });
  }

  plans.push({
    id: "cancel",
    label: "Cancel session",
    kind: "cancel",
    session: {
      ...session,
      durationMinutes: 0,
      tempF: 72,
      humidity: 45,
      aqi: 20,
      smokeAlert: false
    }
  });

  return plans;
}

function isOutdoorPlan(candidate) {
  return candidate.kind !== "indoor" && candidate.kind !== "cancel";
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

  const { session } = candidate;
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

function buildReason(candidate, evaluation, baseEvaluation) {
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
      reason: buildReason(candidate, { score: 0 }, baseEvaluation)
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
    safe,
    riskScore: risk.score,
    riskBand: risk.band,
    expectedMinutes,
    ram,
    safetyMargin: safetyMargin(candidate.session),
    decisionScore,
    reason: buildReason(candidate, risk, baseEvaluation)
  };
}

export function rankAdaptations(input) {
  const session = normalizeSession(input);
  const baseRisk = scoreSuppressionRisk(session);
  const baselineExpectedMinutes = round(session.durationMinutes * (1 - baseRisk.score));
  const evaluated = createCandidatePlans(session).map((candidate) =>
    evaluateCandidate(candidate, baseRisk, baselineExpectedMinutes)
  );

  const cancelAction = evaluated.find((entry) => entry.id === "cancel");
  const safeActions = evaluated
    .filter((entry) => entry.id !== "cancel" && entry.safe)
    .sort((left, right) => {
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
    recommendations = [cancelAction, ...recommendations];
  }

  return {
    session,
    baseline: {
      riskScore: baseRisk.score,
      riskBand: baseRisk.band,
      expectedMinutes: baselineExpectedMinutes,
      heatIndexF: baseRisk.heatIndexF,
      heatSeverity: baseRisk.heatSeverity,
      smokeSeverity: baseRisk.smokeSeverity,
      drivers: baseRisk.drivers
    },
    recommendations
  };
}
