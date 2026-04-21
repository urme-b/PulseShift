function badRequest(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
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

export function validateSessionPayload(input = {}) {
  return {
    sessionName: assertString(input.sessionName, "Session name"),
    startTime: assertStartTime(input.startTime),
    durationMinutes: assertNumber(input.durationMinutes, "Duration minutes", 15, 240),
    effortLevel: assertEffortLevel(input.effortLevel),
    tempF: assertNumber(input.tempF, "Temperature", 20, 130),
    humidity: assertNumber(input.humidity, "Humidity", 5, 100),
    aqi: assertNumber(input.aqi, "AQI", 0, 500),
    smokeAlert: assertBoolean(input.smokeAlert, "Smoke alert"),
    flexibleStartMinutes: assertNumber(
      input.flexibleStartMinutes,
      "Flexible start window",
      0,
      180
    ),
    indoorAvailable: assertBoolean(input.indoorAvailable, "Indoor option"),
    alternativeRouteAvailable: assertBoolean(
      input.alternativeRouteAvailable,
      "Alternative route option"
    ),
    shadeAvailable: assertBoolean(input.shadeAvailable, "Shade option")
  };
}

export function validateCoordinates(latitude, longitude) {
  return {
    latitude: assertNumber(latitude, "Latitude", -90, 90),
    longitude: assertNumber(longitude, "Longitude", -180, 180)
  };
}

export function validateOfficialImportPayload(input = {}) {
  const { latitude, longitude } = validateCoordinates(input.latitude, input.longitude);

  return {
    latitude,
    longitude,
    startTime: input.startTime ? assertStartTime(input.startTime) : null
  };
}
