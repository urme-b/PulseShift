import { rankAdaptations } from "./engine.js";
import { OFFICIAL_SOURCES } from "./sourceCatalog.js";

const form = document.querySelector("#session-form");
const riskBand = document.querySelector("#risk-band");
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

const DEFAULT_SOURCE_COPY =
  "Use official NOAA weather and AirNow AQI to fill conditions.";
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
  return `recommendation-chip chip-${riskLabel.toLowerCase()}`;
}

function renderEmptyRow(target, colspan, message) {
  target.replaceChildren();

  const row = document.createElement("tr");
  row.className = "empty-row";
  row.innerHTML = `
    <td colspan="${colspan}">${escapeHtml(message)}</td>
  `;
  target.append(row);
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    headers: {
      "Content-Type": "application/json"
    },
    ...options
  });

  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.error || "Request failed");
  }

  return payload;
}

function renderRecommendation(recommendation) {
  topRecommendation.innerHTML = `
    <div class="recommendation-title">
      <div>
        <h3>${escapeHtml(recommendation.label)}</h3>
        <p class="recommendation-copy">${escapeHtml(recommendation.reason)}</p>
      </div>
      <span class="${chipClass(recommendation.riskBand)}">${escapeHtml(recommendation.riskBand)}</span>
    </div>
    <div class="recommendation-meta">
      <div class="meta-card">
        <p class="summary-label">Expected minutes</p>
        <p class="meta-value">${recommendation.expectedMinutes}</p>
      </div>
      <div class="meta-card">
        <p class="summary-label">RAM</p>
        <p class="meta-value">${recommendation.ram}</p>
      </div>
      <div class="meta-card">
        <p class="summary-label">Safety margin</p>
        <p class="meta-value">${Math.round(recommendation.safetyMargin * 100)}%</p>
      </div>
    </div>
  `;
}

function renderDrivers(drivers) {
  riskDrivers.replaceChildren();

  drivers.forEach((driver) => {
    const item = document.createElement("li");
    item.className = "driver-item";
    item.innerHTML = `
      <span>${escapeHtml(driver.label)}</span>
      <span class="driver-value">${driver.contribution}</span>
    `;
    riskDrivers.append(item);
  });
}

function renderRanking(recommendations) {
  rankingBody.replaceChildren();

  recommendations.forEach((recommendation) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${escapeHtml(recommendation.label)}</td>
      <td>${recommendation.riskBand} (${recommendation.riskScore})</td>
      <td>${recommendation.expectedMinutes}</td>
      <td>${recommendation.ram}</td>
      <td class="${recommendation.safe ? "safe" : "unsafe"}">${recommendation.safe ? "Safe" : "Unsafe"}</td>
    `;
    rankingBody.append(row);
  });
}

function renderHistory(items) {
  if (!items.length) {
    renderEmptyRow(historyBody, 5, "No saved evaluations yet");
    return;
  }

  historyBody.replaceChildren();

  items.forEach((item) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${escapeHtml(item.sessionName)}</td>
      <td>${escapeHtml(item.createdAtLabel)}</td>
      <td>${escapeHtml(item.baselineRiskBand)} (${item.baselineRiskScore})</td>
      <td>${escapeHtml(item.bestAction)}</td>
      <td>${item.bestRam}</td>
    `;
    historyBody.append(row);
  });
}

function renderSources(items) {
  if (!items.length) {
    renderEmptyRow(sourcesBody, 5, "No source catalog available");
    return;
  }

  sourcesBody.replaceChildren();

  items.forEach((item) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td><a href="${escapeHtml(item.url)}" target="_blank" rel="noreferrer">${escapeHtml(item.name)}</a></td>
      <td>${escapeHtml(item.provider)}</td>
      <td>${escapeHtml(item.role)}</td>
      <td>${escapeHtml(item.status)}</td>
      <td>${item.fitScore}</td>
    `;
    sourcesBody.append(row);
  });
}

function renderWeatherSnapshot(snapshot) {
  if (!snapshot) {
    weatherSnapshot.innerHTML = `
      <p class="recommendation-copy">No official weather snapshot saved yet.</p>
    `;
    return;
  }

  const forecast = snapshot.payload.forecast;
  weatherSnapshot.innerHTML = `
    <div class="recommendation-title">
      <div>
        <h3>${escapeHtml(snapshot.city || "Unknown city")}${snapshot.state ? `, ${escapeHtml(snapshot.state)}` : ""}</h3>
        <p class="recommendation-copy">${escapeHtml(forecast.shortForecast || "Forecast unavailable")}</p>
      </div>
      <span class="recommendation-chip chip-low">${escapeHtml(snapshot.sourceKey)}</span>
    </div>
    <div class="recommendation-meta">
      <div class="meta-card">
        <p class="summary-label">Temperature</p>
        <p class="meta-value">${forecast.temperature} ${escapeHtml(forecast.temperatureUnit || "F")}</p>
      </div>
      <div class="meta-card">
        <p class="summary-label">Humidity</p>
        <p class="meta-value">${forecast.relativeHumidity ?? "NA"}%</p>
      </div>
      <div class="meta-card">
        <p class="summary-label">Saved</p>
        <p class="meta-value">${escapeHtml(snapshot.createdAtLabel || "Live")}</p>
      </div>
    </div>
    <p class="recommendation-copy">
      Grid ${escapeHtml(snapshot.payload.point.gridId || "NA")} ${snapshot.payload.point.gridX ?? "NA"}, ${snapshot.payload.point.gridY ?? "NA"}  |  ${escapeHtml(forecast.windSpeed || "NA")} ${escapeHtml(forecast.windDirection || "")}
    </p>
  `;
}

function renderAqiSnapshot(snapshot) {
  if (!snapshot) {
    aqiSnapshot.innerHTML = `
      <p class="recommendation-copy">No official AQI snapshot saved yet.</p>
    `;
    return;
  }

  const effective = snapshot.payload.effective;
  const observed = snapshot.payload.currentObservation;
  const forecast = snapshot.payload.todayForecast;
  aqiSnapshot.innerHTML = `
    <div class="recommendation-title">
      <div>
        <h3>${escapeHtml(snapshot.reportingArea || "Unknown area")}${snapshot.state ? `, ${escapeHtml(snapshot.state)}` : ""}</h3>
        <p class="recommendation-copy">${escapeHtml(effective.category || "AQI category unavailable")}</p>
      </div>
      <span class="recommendation-chip ${effective.aqi >= 101 ? "chip-high" : effective.aqi >= 51 ? "chip-moderate" : "chip-low"}">AQI ${effective.aqi}</span>
    </div>
    <div class="recommendation-meta">
      <div class="meta-card">
        <p class="summary-label">Observed</p>
        <p class="meta-value">${observed ? observed.aqi : "NA"}</p>
      </div>
      <div class="meta-card">
        <p class="summary-label">Forecast</p>
        <p class="meta-value">${forecast ? forecast.aqi : "NA"}</p>
      </div>
      <div class="meta-card">
        <p class="summary-label">Saved</p>
        <p class="meta-value">${escapeHtml(snapshot.createdAtLabel || "Live")}</p>
      </div>
    </div>
    <p class="recommendation-copy">
      Strategy ${escapeHtml(snapshot.payload.lookup.strategy)}  |  Distance ${snapshot.payload.lookup.distanceMiles} mi  |  Smoke signal ${effective.smokeAlert ? "Yes" : "No"}
    </p>
  `;
}

function formatTimeInput(isoValue) {
  const match = String(isoValue || "").match(/T(\d{2}:\d{2})/);
  return match ? match[1] : null;
}

function sameLocation(left, right) {
  if (!left || !right) {
    return true;
  }

  return (
    Math.abs(Number(left.latitude) - Number(right.latitude)) < 0.01 &&
    Math.abs(Number(left.longitude) - Number(right.longitude)) < 0.01
  );
}

function renderDecision(result) {
  const top = result.recommendations[0];

  riskBand.textContent = result.baseline.riskBand;
  riskScore.textContent = `Risk score ${result.baseline.riskScore}`;
  expectedMinutes.textContent = `${result.baseline.expectedMinutes} min`;
  heatSmoke.textContent = `Heat index ${result.baseline.heatIndexF}F  |  AQI ${result.session.aqi}`;
  bestAction.textContent = top.label;
  bestActionDetail.textContent = `RAM +${top.ram} min`;

  renderRecommendation(top);
  renderDrivers(result.baseline.drivers);
  renderRanking(result.recommendations);
}

function setDatabaseState(health) {
  dbState.textContent = health.ok ? "Connected" : "Unavailable";
  dbDetail.textContent = health.ok
    ? `${health.backend}  |  ${health.savedEvaluations} evaluations, ${health.savedWeatherSnapshots} weather snapshots, ${health.savedAqiSnapshots} AQI snapshots, ${health.sourceCatalogSize} ranked sources`
    : "Database connection failed";
}

function setOfflineState(reason) {
  apiAvailable = false;
  dbState.textContent = "Local only";
  dbDetail.textContent = `${reason}  |  ${SERVER_HINT}`;
  fetchWeatherButton.disabled = true;
  sourceStatus.textContent = `Official data import unavailable. ${SERVER_HINT}`;
  renderHistory([]);
  renderSources(
    OFFICIAL_SOURCES.map((item) => ({
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
    }))
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

async function fetchLatestWeatherSnapshot() {
  const payload = await requestJson("/api/latest-weather");
  return payload.item;
}

async function fetchLatestAqiSnapshot() {
  const payload = await requestJson("/api/latest-aqi");
  return payload.item;
}

async function fetchLatestOfficialConditions() {
  const payload = await requestJson("/api/latest-conditions");
  return payload.item;
}

function setWorkingState(button, isWorking, message = DEFAULT_SOURCE_COPY) {
  button.disabled = isWorking;
  sourceStatus.textContent = message;
}

function applyOfficialConditions({
  weather = null,
  airQuality = null,
  sourceMessage = null
}) {
  if (weather) {
    const forecast = weather.payload.forecast;

    form.elements.latitude.value = weather.latitude;
    form.elements.longitude.value = weather.longitude;
    form.elements.tempF.value = forecast.temperature;

    if (Number.isFinite(forecast.relativeHumidity)) {
      form.elements.humidity.value = Math.round(forecast.relativeHumidity);
    }

    const startTime = formatTimeInput(forecast.startTime);

    if (startTime) {
      form.elements.startTime.value = startTime;
    }
  }

  if (airQuality) {
    const effective = airQuality.payload.effective;

    form.elements.latitude.value = airQuality.latitude;
    form.elements.longitude.value = airQuality.longitude;
    form.elements.aqi.value = effective.aqi;
    form.elements.smokeAlert.value = effective.smokeAlert ? "yes" : "no";
  }

  if (sourceMessage) {
    sourceStatus.textContent = sourceMessage;
  }
}

function syncOfficialSnapshotViews({
  weather = null,
  airQuality = null,
  sourceMessage = null
}) {
  renderWeatherSnapshot(weather);
  renderAqiSnapshot(airQuality);
  applyOfficialConditions({
    weather,
    airQuality,
    sourceMessage
  });
}

async function loadLatestOfficialConditions() {
  const combined = await fetchLatestOfficialConditions();

  if (combined) {
    syncOfficialSnapshotViews({
      weather: combined.weather,
      airQuality: combined.airQuality,
      sourceMessage: "Loaded latest saved official conditions into the session form."
    });

    return {
      weather: combined.weather,
      airQuality: combined.airQuality
    };
  }

  const [weather, airQuality] = await Promise.all([
    fetchLatestWeatherSnapshot(),
    fetchLatestAqiSnapshot()
  ]);

  const canHydrate = sameLocation(weather, airQuality);
  const hasWeather = Boolean(weather);
  const hasAirQuality = Boolean(airQuality);

  if (canHydrate) {
    syncOfficialSnapshotViews({
      weather,
      airQuality,
      sourceMessage:
        hasWeather && hasAirQuality
          ? "Loaded latest saved official conditions into the session form."
          : hasWeather
            ? "Loaded latest saved official weather into the session form. AQI is still manual."
            : hasAirQuality
              ? "Loaded latest saved official AQI into the session form. Weather is still manual."
              : DEFAULT_SOURCE_COPY
    });
  } else {
    renderWeatherSnapshot(weather);
    renderAqiSnapshot(airQuality);
    sourceStatus.textContent =
      "Latest saved official snapshots use different locations. Pull fresh official conditions.";
  }

  return {
    weather,
    airQuality
  };
}

async function evaluateSession({ persist }) {
  if (!apiAvailable) {
    const result = rankAdaptations(readSession());
    renderDecision(result);
    return;
  }

  const payload = await requestJson("/api/evaluate", {
    method: "POST",
    body: JSON.stringify({
      session: readSession(),
      persist
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

    const payload = await requestJson("/api/official-conditions", {
      method: "POST",
      body: JSON.stringify({
        latitude: Number(form.elements.latitude.value),
        longitude: Number(form.elements.longitude.value),
        startTime: form.elements.startTime.value
      })
    });

    syncOfficialSnapshotViews({
      weather: {
        ...payload.conditions.weather,
        createdAtLabel: "Just now"
      },
      airQuality: {
        ...payload.conditions.airQuality,
        createdAtLabel: "Just now"
      },
      sourceMessage:
        `Loaded official NOAA weather for ${payload.conditions.weather.city || "unknown city"}, ${payload.conditions.weather.state || ""} and AirNow AQI for ${payload.conditions.airQuality.reportingArea || "unknown area"}`.trim()
    });

    await Promise.all([loadDatabaseStatus(), evaluateSession({ persist: false })]);
  } catch (error) {
    sourceStatus.textContent = error.message;
  } finally {
    setWorkingState(fetchWeatherButton, false, sourceStatus.textContent || DEFAULT_SOURCE_COPY);
  }
}

async function initializeLiveData() {
  sourceStatus.textContent = DEFAULT_SOURCE_COPY;
  await Promise.all([loadDatabaseStatus(), loadHistory(), loadSources(), loadLatestOfficialConditions()]);
}

async function initializeApp() {
  renderSources(
    OFFICIAL_SOURCES.map((item) => ({
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
    }))
  );

  try {
    await initializeLiveData();
    await evaluateSession({ persist: false });
  } catch (error) {
    setOfflineState(error.message || "Server unavailable");
    await evaluateSession({ persist: false });
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  await evaluateSession({ persist: true });
});

fetchWeatherButton.addEventListener("click", async () => {
  await fetchOfficialConditions();
});

initializeApp();
