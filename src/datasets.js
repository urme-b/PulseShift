export const DATASET_DEFINITIONS = {
  evaluations: {
    key: "evaluations",
    label: "Saved evaluations",
    columns: [
      "evaluationId",
      "createdAt",
      "sessionName",
      "startTime",
      "durationMinutes",
      "effortLevel",
      "tempF",
      "humidity",
      "aqi",
      "smokeAlert",
      "flexibleStartMinutes",
      "indoorAvailable",
      "alternativeRouteAvailable",
      "shadeAvailable",
      "baselineRiskScore",
      "baselineRiskBand",
      "baselineExpectedMinutes",
      "baselineHeatIndexF",
      "bestAction",
      "bestRam",
      "recommendationCount"
    ]
  },
  officialConditions: {
    key: "officialConditions",
    label: "Official condition imports",
    columns: [
      "importBatchId",
      "importedAt",
      "latitude",
      "longitude",
      "city",
      "state",
      "requestedStartTime",
      "forecastStartTime",
      "temperatureF",
      "temperatureUnit",
      "relativeHumidity",
      "shortForecast",
      "windSpeed",
      "windDirection",
      "forecastOffice",
      "gridId",
      "gridX",
      "gridY",
      "weatherSourceKey",
      "reportingArea",
      "aqi",
      "aqiCategory",
      "smokeAlert",
      "observedAqi",
      "forecastAqi",
      "lookupStrategy",
      "lookupDistanceMiles",
      "aqiSourceKey"
    ]
  }
};

function parseJsonValue(value) {
  if (!value) {
    return {};
  }

  return typeof value === "string" ? JSON.parse(value) : value;
}

function normalizeLabel(value) {
  return String(value || "").replaceAll("_", "-");
}

export function buildEvaluationDatasetRow(record) {
  const input = parseJsonValue(record.inputJson);
  const result = parseJsonValue(record.resultJson);
  const baseline = result.baseline || {};
  const recommendations = Array.isArray(result.recommendations)
    ? result.recommendations
    : [];

  return {
    evaluationId: record.id,
    createdAt: record.createdAt,
    sessionName: record.sessionName,
    startTime: input.startTime || "",
    durationMinutes: input.durationMinutes ?? "",
    effortLevel: input.effortLevel || "",
    tempF: input.tempF ?? "",
    humidity: input.humidity ?? "",
    aqi: input.aqi ?? "",
    smokeAlert: Boolean(input.smokeAlert),
    flexibleStartMinutes: input.flexibleStartMinutes ?? "",
    indoorAvailable: Boolean(input.indoorAvailable),
    alternativeRouteAvailable: Boolean(input.alternativeRouteAvailable),
    shadeAvailable: Boolean(input.shadeAvailable),
    baselineRiskScore: record.baselineRiskScore ?? baseline.riskScore ?? "",
    baselineRiskBand: record.baselineRiskBand ?? baseline.riskBand ?? "",
    baselineExpectedMinutes:
      record.baselineExpectedMinutes ?? baseline.expectedMinutes ?? "",
    baselineHeatIndexF: baseline.heatIndexF ?? "",
    bestAction: record.bestAction,
    bestRam: record.bestRam ?? "",
    recommendationCount: recommendations.length
  };
}

export function buildOfficialConditionsDatasetRow(record) {
  const weatherPayload = parseJsonValue(record.weatherPayloadJson);
  const aqiPayload = parseJsonValue(record.aqiPayloadJson);
  const point = weatherPayload.point || {};
  const forecast = weatherPayload.forecast || {};
  const effective = aqiPayload.effective || {};
  const observation = aqiPayload.currentObservation || {};
  const todayForecast = aqiPayload.todayForecast || {};

  return {
    importBatchId: record.importBatchId,
    importedAt: record.createdAt,
    latitude: record.latitude,
    longitude: record.longitude,
    city: record.city || "",
    state: record.weatherState || record.aqiState || "",
    requestedStartTime: forecast.requestedStartTime || "",
    forecastStartTime: forecast.startTime || "",
    temperatureF: forecast.temperature ?? "",
    temperatureUnit: forecast.temperatureUnit || "",
    relativeHumidity: forecast.relativeHumidity ?? "",
    shortForecast: forecast.shortForecast || "",
    windSpeed: forecast.windSpeed || "",
    windDirection: forecast.windDirection || "",
    forecastOffice: point.forecastOffice || "",
    gridId: point.gridId || "",
    gridX: point.gridX ?? "",
    gridY: point.gridY ?? "",
    weatherSourceKey: record.weatherSourceKey,
    reportingArea: record.reportingArea || "",
    aqi: effective.aqi ?? "",
    aqiCategory: effective.category || "",
    smokeAlert: Boolean(effective.smokeAlert),
    observedAqi: observation.aqi ?? "",
    forecastAqi: todayForecast.aqi ?? "",
    lookupStrategy: normalizeLabel((aqiPayload.lookup || {}).strategy),
    lookupDistanceMiles: (aqiPayload.lookup || {}).distanceMiles ?? "",
    aqiSourceKey: record.aqiSourceKey
  };
}

function escapeCsvCell(value) {
  if (value === null || value === undefined) {
    return "";
  }

  const text = String(value);

  if (/[",\n]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`;
  }

  return text;
}

export function toCsv(columns, rows) {
  const header = columns.join(",");
  const body = rows
    .map((row) => columns.map((column) => escapeCsvCell(row[column])).join(","))
    .join("\n");

  return body ? `${header}\n${body}\n` : `${header}\n`;
}
