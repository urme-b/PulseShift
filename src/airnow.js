const AIRNOW_REPORTING_AREA_URL =
  "https://files.airnowtech.org/airnow/today/reportingarea.dat";

function round(value, digits = 1) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function toRadians(value) {
  return (value * Math.PI) / 180;
}

function milesBetween(latitudeA, longitudeA, latitudeB, longitudeB) {
  const earthRadiusMiles = 3958.8;
  const dLat = toRadians(latitudeB - latitudeA);
  const dLon = toRadians(longitudeB - longitudeA);
  const latA = toRadians(latitudeA);
  const latB = toRadians(latitudeB);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(latA) * Math.cos(latB) * Math.sin(dLon / 2) ** 2;

  return earthRadiusMiles * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function safeNumber(value) {
  if (value === null || value === undefined || String(value).trim() === "") {
    return null;
  }

  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function categoryToAqi(category) {
  const normalized = String(category || "").trim().toLowerCase();

  if (normalized === "good") {
    return 25;
  }

  if (normalized === "moderate") {
    return 75;
  }

  if (normalized === "unhealthy for sensitive groups") {
    return 125;
  }

  if (normalized === "unhealthy") {
    return 175;
  }

  if (normalized === "very unhealthy") {
    return 250;
  }

  if (normalized === "hazardous") {
    return 350;
  }

  return null;
}

function resolvedAqi(record) {
  if (!record) {
    return null;
  }

  return record.aqiValue ?? categoryToAqi(record.aqiCategory);
}

function getText(url) {
  return fetch(url, {
    headers: {
      Accept: "text/plain"
    }
  }).then((response) => {
    if (!response.ok) {
      throw new Error(`AirNow request failed: ${response.status}`);
    }

    return response.text();
  });
}

function parseRecord(line) {
  const parts = line.split("|");

  if (parts.length < 17) {
    return null;
  }

  const [
    issueDate,
    validDate,
    validTime,
    timeZone,
    recordSequence,
    dataType,
    primary,
    reportingArea,
    stateCode,
    latitude,
    longitude,
    pollutant,
    aqiValue,
    aqiCategory,
    actionDay,
    discussion,
    forecastSource
  ] = parts;

  return {
    issueDate,
    validDate,
    validTime,
    timeZone,
    recordSequence: safeNumber(recordSequence),
    dataType,
    primary,
    reportingArea,
    stateCode,
    latitude: safeNumber(latitude),
    longitude: safeNumber(longitude),
    pollutant,
    aqiValue: safeNumber(aqiValue),
    aqiCategory,
    actionDay,
    discussion,
    forecastSource
  };
}

function findBestGroup(records, latitude, longitude) {
  const groups = new Map();

  for (const record of records) {
    if (!record || record.latitude === null || record.longitude === null) {
      continue;
    }

    if (!record.reportingArea) {
      continue;
    }

    const key = `${record.reportingArea}|${record.stateCode || ""}`;
    const distanceMiles = milesBetween(
      latitude,
      longitude,
      record.latitude,
      record.longitude
    );
    const next = groups.get(key) || {
      key,
      reportingArea: record.reportingArea,
      stateCode: record.stateCode || null,
      latitude: record.latitude,
      longitude: record.longitude,
      distanceMiles,
      records: []
    };

    next.distanceMiles = Math.min(next.distanceMiles, distanceMiles);
    next.records.push(record);
    groups.set(key, next);
  }

  return [...groups.values()].sort((left, right) => left.distanceMiles - right.distanceMiles)[0];
}

function chooseObservedRecord(records) {
  return records
    .filter((record) => record.dataType === "O")
    .sort((left, right) => {
      if ((right.aqiValue || 0) !== (left.aqiValue || 0)) {
        return (right.aqiValue || 0) - (left.aqiValue || 0);
      }

      return String(right.validTime || "").localeCompare(String(left.validTime || ""));
    })[0] || null;
}

function chooseForecastRecord(records) {
  const forecastRecords = records.filter(
    (record) => record.dataType === "F" && record.primary === "Y"
  );

  const sequenceZero = forecastRecords.filter((record) => record.recordSequence === 0);

  return (sequenceZero[0] || forecastRecords[0] || null);
}

function smokeSignal(record) {
  if (!record) {
    return false;
  }

  const pollutant = String(record.pollutant || "").toUpperCase();
  return pollutant.startsWith("PM") && (resolvedAqi(record) || 0) >= 101;
}

export async function fetchOfficialAirQualitySnapshot(latitude, longitude) {
  const lat = safeNumber(latitude);
  const lon = safeNumber(longitude);

  if (lat === null || lon === null) {
    throw new Error("Latitude and longitude are required");
  }

  const text = await getText(AIRNOW_REPORTING_AREA_URL);
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const records = lines.map(parseRecord).filter(Boolean);
  const bestGroup = findBestGroup(records, lat, lon);

  if (!bestGroup) {
    throw new Error("AirNow reporting area lookup returned no data");
  }

  const observed = chooseObservedRecord(bestGroup.records);
  const forecast = chooseForecastRecord(bestGroup.records);
  const observedAqi = resolvedAqi(observed);
  const forecastAqi = resolvedAqi(forecast);
  const effectiveAqi = Math.max(observedAqi || 0, forecastAqi || 0);
  const effectiveCategory =
    (observed && observedAqi === effectiveAqi ? observed.aqiCategory : null) ||
    forecast?.aqiCategory ||
    null;
  const smokeAlert = smokeSignal(observed) || smokeSignal(forecast);

  return {
    sourceKey: "epa_airnow",
    latitude: lat,
    longitude: lon,
    reportingArea: bestGroup.reportingArea,
    state: bestGroup.stateCode,
    payload: {
      lookup: {
        strategy: "nearest_reporting_area",
        distanceMiles: round(bestGroup.distanceMiles, 1),
        sourceUrl: AIRNOW_REPORTING_AREA_URL
      },
      currentObservation: observed
        ? {
            validDate: observed.validDate,
            validTime: observed.validTime,
            timeZone: observed.timeZone,
            pollutant: observed.pollutant,
            aqi: observedAqi,
            aqiEstimated: observed.aqiValue === null,
            category: observed.aqiCategory,
            actionDay: observed.actionDay === "Yes",
            forecastSource: observed.forecastSource || null
          }
        : null,
      todayForecast: forecast
        ? {
            validDate: forecast.validDate,
            pollutant: forecast.pollutant,
            aqi: forecastAqi,
            aqiEstimated: forecast.aqiValue === null,
            category: forecast.aqiCategory,
            actionDay: forecast.actionDay === "Yes",
            discussion: forecast.discussion || null,
            forecastSource: forecast.forecastSource || null
          }
        : null,
      effective: {
        aqi: effectiveAqi,
        category: effectiveCategory,
        smokeAlert,
        decisionBasis:
          observed && forecast
            ? "max_current_observation_or_today_forecast"
            : observed
              ? "current_observation"
              : "today_forecast"
      }
    }
  };
}
