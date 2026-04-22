const USER_AGENT =
  "PulseShift/0.1 (local verification, urmebose1996@gmail.com)";

function assertCoordinate(value, label) {
  const numeric = Number(value);

  if (!Number.isFinite(numeric)) {
    throw new Error(`${label} is required`);
  }

  return numeric;
}

function splitReferenceIso(value) {
  const match = String(value || "").match(/^(\d{4}-\d{2}-\d{2})T\d{2}:\d{2}:\d{2}([+-]\d{2}:\d{2}|Z)$/);

  if (!match) {
    throw new Error("NWS forecast period timestamp is invalid");
  }

  return {
    datePart: match[1],
    offsetPart: match[2]
  };
}

function nextDatePart(datePart) {
  const next = new Date(`${datePart}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString().slice(0, 10);
}

function buildRequestedInstant(referenceIso, startTime) {
  if (!startTime) {
    return null;
  }

  const { datePart, offsetPart } = splitReferenceIso(referenceIso);
  const sameDay = new Date(`${datePart}T${startTime}:00${offsetPart}`);
  const reference = new Date(referenceIso);

  if (sameDay >= reference) {
    return sameDay;
  }

  return new Date(`${nextDatePart(datePart)}T${startTime}:00${offsetPart}`);
}

function chooseForecastPeriod(periods, startTime) {
  const firstPeriod = periods?.[0];

  if (!firstPeriod) {
    return null;
  }

  const requestedInstant = buildRequestedInstant(firstPeriod.startTime, startTime);

  if (!requestedInstant) {
    return firstPeriod;
  }

  return periods.reduce((best, current) => {
    const currentDistance = Math.abs(
      new Date(current.startTime).getTime() - requestedInstant.getTime()
    );
    const bestDistance = Math.abs(
      new Date(best.startTime).getTime() - requestedInstant.getTime()
    );

    return currentDistance < bestDistance ? current : best;
  }, firstPeriod);
}

async function getJson(url) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/geo+json",
      "User-Agent": USER_AGENT
    }
  });

  if (!response.ok) {
    throw new Error(`NWS request failed: ${response.status}`);
  }

  return response.json();
}

export async function fetchOfficialWeatherSnapshot(latitude, longitude, { startTime = null } = {}) {
  const lat = assertCoordinate(latitude, "Latitude");
  const lon = assertCoordinate(longitude, "Longitude");

  const point = await getJson(`https://api.weather.gov/points/${lat},${lon}`);
  const hourlyUrl = point.properties?.forecastHourly;

  if (!hourlyUrl) {
    throw new Error("NWS hourly forecast endpoint missing");
  }

  const forecast = await getJson(hourlyUrl);
  const selectedPeriod = chooseForecastPeriod(forecast.properties?.periods, startTime);

  if (!selectedPeriod) {
    throw new Error("NWS hourly forecast did not return periods");
  }

  return {
    sourceKey: "noaa_nws_api",
    latitude: lat,
    longitude: lon,
    city: point.properties?.relativeLocation?.properties?.city || null,
    state: point.properties?.relativeLocation?.properties?.state || null,
    payload: {
      point: {
        forecastOffice: point.properties?.cwa || null,
        gridId: point.properties?.gridId || null,
        gridX: point.properties?.gridX ?? null,
        gridY: point.properties?.gridY ?? null
      },
      forecast: {
        requestedStartTime: startTime,
        startTime: selectedPeriod.startTime,
        temperature: selectedPeriod.temperature,
        temperatureUnit: selectedPeriod.temperatureUnit,
        relativeHumidity: selectedPeriod.relativeHumidity?.value ?? null,
        shortForecast: selectedPeriod.shortForecast || null,
        windSpeed: selectedPeriod.windSpeed || null,
        windDirection: selectedPeriod.windDirection || null,
        isDaytime: Boolean(selectedPeriod.isDaytime)
      }
    }
  };
}
