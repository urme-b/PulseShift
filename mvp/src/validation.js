function badRequest(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function assertObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw badRequest(`${label} must be an object`);
  }

  return value;
}

function assertString(value, label, maxLength = 120) {
  const text = String(value || "").trim();

  if (!text) {
    throw badRequest(`${label} is required`);
  }

  if (text.length > maxLength) {
    throw badRequest(`${label} is too long`);
  }

  return text;
}

function assertNumber(value, label, min, max) {
  const numeric = Number(value);

  if (!Number.isFinite(numeric)) {
    throw badRequest(`${label} must be a number`);
  }

  if (numeric < min || numeric > max) {
    throw badRequest(`${label} must be between ${min} and ${max}`);
  }

  return numeric;
}

function assertEffortLevel(value) {
  if (!["easy", "moderate", "hard"].includes(value)) {
    throw badRequest("Effort level is invalid");
  }

  return value;
}

function assertStartTime(value, label = "Start time") {
  const text = assertString(value, label, 5);

  if (!/^\d{2}:\d{2}$/.test(text)) {
    throw badRequest(`${label} must be in HH:MM format`);
  }

  const [hours, minutes] = text.split(":").map(Number);

  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    throw badRequest(`${label} is invalid`);
  }

  return text;
}

function assertBoolean(value, label) {
  if (typeof value !== "boolean") {
    throw badRequest(`${label} must be true or false`);
  }

  return value;
}

function pickDefined(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return value;
    }
  }

  return undefined;
}

export function validateSessionPayload(input = {}) {
  const payload = assertObject(input, "Session payload");

  return {
    sessionName: assertString(payload.sessionName, "Session name"),
    startTime: assertStartTime(payload.startTime),
    durationMinutes: assertNumber(payload.durationMinutes, "Duration minutes", 15, 240),
    effortLevel: assertEffortLevel(payload.effortLevel),
    tempF: assertNumber(payload.tempF, "Temperature", 20, 130),
    humidity: assertNumber(payload.humidity, "Humidity", 5, 100),
    aqi: assertNumber(payload.aqi, "AQI", 0, 500),
    smokeAlert: assertBoolean(payload.smokeAlert, "Smoke alert"),
    flexibleStartMinutes: assertNumber(
      payload.flexibleStartMinutes,
      "Flexible start window",
      0,
      180
    ),
    indoorAvailable: assertBoolean(payload.indoorAvailable, "Indoor option"),
    alternativeRouteAvailable: assertBoolean(
      payload.alternativeRouteAvailable,
      "Alternative route option"
    ),
    shadeAvailable: assertBoolean(payload.shadeAvailable, "Shade option")
  };
}

export function validateCoordinates(latitude, longitude) {
  return {
    latitude: assertNumber(latitude, "Latitude", -90, 90),
    longitude: assertNumber(longitude, "Longitude", -180, 180)
  };
}

export function validateOfficialImportPayload(input = {}) {
  const payload = assertObject(input, "Official import payload");
  const { latitude, longitude } = validateCoordinates(
    pickDefined(payload.latitude, payload.lat),
    pickDefined(payload.longitude, payload.lon)
  );

  return {
    latitude,
    longitude,
    startTime: payload.startTime ? assertStartTime(payload.startTime) : null
  };
}

export function validateEvaluationRequest(input = {}) {
  const payload = assertObject(input, "Evaluation payload");

  return {
    persist:
      payload.persist === undefined ? true : assertBoolean(payload.persist, "Persist"),
    session: validateSessionPayload(payload.session)
  };
}

export function validateListLimit(value, { defaultValue = 5, max = 25 } = {}) {
  if (value === null || value === undefined || value === "") {
    return defaultValue;
  }

  const limit = Number(value);

  if (!Number.isInteger(limit) || limit < 1 || limit > max) {
    throw badRequest(`Limit must be an integer between 1 and ${max}`);
  }

  return limit;
}
