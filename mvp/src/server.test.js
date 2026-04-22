import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { DatabaseSync } from "node:sqlite";

import { createAppServer } from "../server.js";
import { createStorage } from "./db.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");

test("server evaluates sessions and saves them in sqlite", async () => {
  const tempDir = mkdtempSync(path.join(tmpdir(), "pulse-shift-"));
  const dbPath = path.join(tempDir, "test.sqlite");
  const app = createAppServer({
    rootDir: ROOT_DIR,
    dbPath
  });

  const address = await app.start(0);
  const port = address.port;

  try {
    const healthResponse = await fetch(`http://127.0.0.1:${port}/api/health`);
    const health = await healthResponse.json();

    assert.equal(health.ok, true);
    assert.equal(health.savedEvaluations, 0);
    assert.equal(health.savedAqiSnapshots, 0);

    const evaluateResponse = await fetch(`http://127.0.0.1:${port}/api/evaluate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        persist: true,
        session: {
          sessionName: "Thursday heat test",
          startTime: "18:00",
          durationMinutes: 60,
          effortLevel: "moderate",
          tempF: 95,
          humidity: 60,
          aqi: 88,
          smokeAlert: false,
          flexibleStartMinutes: 60,
          indoorAvailable: true,
          alternativeRouteAvailable: true,
          shadeAvailable: true
        }
      })
    });

    const evaluation = await evaluateResponse.json();

    assert.equal(evaluation.persisted, true);
    assert.equal(typeof evaluation.savedRecord.id, "number");
    assert.equal(evaluation.result.recommendations.length > 0, true);

    const listResponse = await fetch(`http://127.0.0.1:${port}/api/evaluations?limit=5`);
    const list = await listResponse.json();

    assert.equal(list.items.length, 1);
    assert.equal(list.items[0].sessionName, "Thursday heat test");

    const latestWeatherResponse = await fetch(`http://127.0.0.1:${port}/api/latest-weather`);
    const latestWeather = await latestWeatherResponse.json();

    assert.equal(latestWeather.item, null);

    const latestConditionsResponse = await fetch(`http://127.0.0.1:${port}/api/latest-conditions`);
    const latestConditions = await latestConditionsResponse.json();

    assert.equal(latestConditions.item, null);

    const db = new DatabaseSync(dbPath);
    const count = db.prepare("SELECT COUNT(*) AS total FROM evaluations").get();
    db.close();

    assert.equal(count.total, 1);
  } finally {
    await app.stop();
  }
});

test("server exposes official sources and saves live source snapshots", async () => {
  const tempDir = mkdtempSync(path.join(tmpdir(), "pulse-shift-"));
  const dbPath = path.join(tempDir, "test.sqlite");

  const app = createAppServer({
    rootDir: ROOT_DIR,
    dbPath,
    weatherFetcher: async (latitude, longitude, { startTime } = {}) => ({
      sourceKey: "noaa_nws_api",
      latitude,
      longitude,
      city: "New York",
      state: "NY",
      payload: {
        point: {
          forecastOffice: "OKX",
          gridId: "OKX",
          gridX: 33,
          gridY: 37
        },
        forecast: {
          requestedStartTime: startTime,
          startTime: "2026-04-20T19:00:00-04:00",
          temperature: 84,
          temperatureUnit: "F",
          relativeHumidity: 52,
          shortForecast: "Mostly Sunny",
          windSpeed: "8 mph",
          windDirection: "SW",
          isDaytime: true
        }
      }
    }),
    airQualityFetcher: async (latitude, longitude) => ({
      sourceKey: "epa_airnow",
      latitude,
      longitude,
      reportingArea: "New York City",
      state: "NY",
      payload: {
        lookup: {
          strategy: "nearest_reporting_area",
          distanceMiles: 2.1
        },
        currentObservation: {
          aqi: 88,
          category: "Moderate",
          pollutant: "PM2.5",
          actionDay: false
        },
        todayForecast: {
          aqi: 94,
          category: "Moderate",
          pollutant: "PM2.5",
          actionDay: false
        },
        effective: {
          aqi: 94,
          category: "Moderate",
          smokeAlert: false,
          decisionBasis: "max_current_observation_or_today_forecast"
        }
      }
    })
  });

  const address = await app.start(0);
  const port = address.port;

  try {
    const sourcesResponse = await fetch(`http://127.0.0.1:${port}/api/sources`);
    const sources = await sourcesResponse.json();

    assert.equal(sources.items.length >= 5, true);
    assert.equal(sources.items[0].sourceKey, "noaa_nws_api");

    const weatherResponse = await fetch(
      `http://127.0.0.1:${port}/api/official-weather?lat=40.7128&lon=-74.0060&startTime=18:00`
    );
    const weather = await weatherResponse.json();

    assert.equal(weather.snapshot.city, "New York");
    assert.equal(weather.snapshot.payload.forecast.temperature, 84);
    assert.equal(weather.snapshot.payload.forecast.requestedStartTime, "18:00");

    const aqiResponse = await fetch(
      `http://127.0.0.1:${port}/api/official-air-quality?lat=40.7128&lon=-74.0060`
    );
    const aqi = await aqiResponse.json();

    assert.equal(aqi.snapshot.reportingArea, "New York City");
    assert.equal(aqi.snapshot.payload.effective.aqi, 94);

    const combinedResponse = await fetch(
      `http://127.0.0.1:${port}/api/official-conditions?lat=40.7128&lon=-74.0060&startTime=18:00`
    );
    const combined = await combinedResponse.json();

    assert.equal(combined.conditions.weather.city, "New York");
    assert.equal(combined.conditions.airQuality.reportingArea, "New York City");

    const saveResponse = await fetch(`http://127.0.0.1:${port}/api/official-conditions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        latitude: 40.7128,
        longitude: -74.006,
        startTime: "18:00"
      })
    });
    const saved = await saveResponse.json();

    assert.equal(typeof saved.importBatchId, "number");
    assert.equal(saved.weatherSnapshotId, 1);
    assert.equal(saved.aqiSnapshotId, 1);

    const db = new DatabaseSync(dbPath);
    const sourceCount = db.prepare("SELECT COUNT(*) AS total FROM source_catalog").get();
    const weatherCount = db.prepare("SELECT COUNT(*) AS total FROM weather_snapshots").get();
    const aqiCount = db.prepare("SELECT COUNT(*) AS total FROM aqi_snapshots").get();
    db.close();

    assert.equal(sourceCount.total >= 5, true);
    assert.equal(weatherCount.total, 1);
    assert.equal(aqiCount.total, 1);

    const latestWeatherResponse = await fetch(`http://127.0.0.1:${port}/api/latest-weather`);
    const latestWeather = await latestWeatherResponse.json();

    assert.equal(latestWeather.item.city, "New York");

    const latestAqiResponse = await fetch(`http://127.0.0.1:${port}/api/latest-aqi`);
    const latestAqi = await latestAqiResponse.json();

    assert.equal(latestAqi.item.reportingArea, "New York City");

    const latestConditionsResponse = await fetch(`http://127.0.0.1:${port}/api/latest-conditions`);
    const latestConditions = await latestConditionsResponse.json();

    assert.equal(latestConditions.item.weather.city, "New York");
    assert.equal(latestConditions.item.airQuality.reportingArea, "New York City");
    assert.equal(typeof latestConditions.item.importBatchId, "number");
  } finally {
    await app.stop();
  }
});

test("server rejects invalid official weather coordinates", async () => {
  const tempDir = mkdtempSync(path.join(tmpdir(), "pulse-shift-"));
  const dbPath = path.join(tempDir, "test.sqlite");
  const app = createAppServer({
    rootDir: ROOT_DIR,
    dbPath
  });

  const address = await app.start(0);
  const port = address.port;

  try {
    const response = await fetch(
      `http://127.0.0.1:${port}/api/official-weather?lat=not-a-number&lon=-74.0060`
    );
    const payload = await response.json();

    assert.equal(response.status, 400);
    assert.equal(payload.error, "Latitude must be a number");
  } finally {
    await app.stop();
  }
});

test("server rejects malformed JSON bodies with a 400", async () => {
  const tempDir = mkdtempSync(path.join(tmpdir(), "pulse-shift-"));
  const dbPath = path.join(tempDir, "test.sqlite");
  const app = createAppServer({
    rootDir: ROOT_DIR,
    dbPath
  });

  const address = await app.start(0);
  const port = address.port;

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/evaluate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: "{bad json"
    });
    const payload = await response.json();

    assert.equal(response.status, 400);
    assert.equal(payload.error, "Request body must be valid JSON");
  } finally {
    await app.stop();
  }
});

test("server accepts coordinate aliases and rejects invalid list limits", async () => {
  const tempDir = mkdtempSync(path.join(tmpdir(), "pulse-shift-"));
  const dbPath = path.join(tempDir, "test.sqlite");

  const app = createAppServer({
    rootDir: ROOT_DIR,
    dbPath,
    weatherFetcher: async (latitude, longitude, { startTime } = {}) => ({
      sourceKey: "noaa_nws_api",
      latitude,
      longitude,
      city: "Boston",
      state: "MA",
      payload: {
        point: {
          forecastOffice: "BOX",
          gridId: "BOX",
          gridX: 70,
          gridY: 76
        },
        forecast: {
          requestedStartTime: startTime,
          startTime: "2026-04-20T18:00:00-04:00",
          temperature: 61,
          temperatureUnit: "F",
          relativeHumidity: 40,
          shortForecast: "Clear",
          windSpeed: "6 mph",
          windDirection: "W",
          isDaytime: true
        }
      }
    }),
    airQualityFetcher: async (latitude, longitude) => ({
      sourceKey: "epa_airnow",
      latitude,
      longitude,
      reportingArea: "Boston",
      state: "MA",
      payload: {
        lookup: {
          strategy: "nearest_reporting_area",
          distanceMiles: 1.4
        },
        currentObservation: {
          aqi: 32,
          category: "Good",
          pollutant: "PM2.5",
          actionDay: false
        },
        todayForecast: {
          aqi: 38,
          category: "Good",
          pollutant: "OZONE",
          actionDay: false
        },
        effective: {
          aqi: 38,
          category: "Good",
          smokeAlert: false,
          decisionBasis: "max_current_observation_or_today_forecast"
        }
      }
    })
  });

  const address = await app.start(0);
  const port = address.port;

  try {
    const aliasGetResponse = await fetch(
      `http://127.0.0.1:${port}/api/official-weather?latitude=42.3601&longitude=-71.0589&startTime=18:00`
    );
    const aliasGetPayload = await aliasGetResponse.json();

    assert.equal(aliasGetResponse.status, 200);
    assert.equal(aliasGetPayload.snapshot.city, "Boston");

    const aliasPostResponse = await fetch(`http://127.0.0.1:${port}/api/official-conditions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        lat: 42.3601,
        lon: -71.0589,
        startTime: "18:00"
      })
    });
    const aliasPostPayload = await aliasPostResponse.json();

    assert.equal(aliasPostResponse.status, 200);
    assert.equal(typeof aliasPostPayload.importBatchId, "number");
    assert.equal(aliasPostPayload.weatherSnapshotId, 1);
    assert.equal(aliasPostPayload.aqiSnapshotId, 1);

    const limitResponse = await fetch(`http://127.0.0.1:${port}/api/evaluations?limit=bad`);
    const limitPayload = await limitResponse.json();

    assert.equal(limitResponse.status, 400);
    assert.equal(limitPayload.error, "Limit must be an integer between 1 and 25");
  } finally {
    await app.stop();
  }
});

test("server rejects invalid persist flags", async () => {
  const tempDir = mkdtempSync(path.join(tmpdir(), "pulse-shift-"));
  const dbPath = path.join(tempDir, "test.sqlite");
  const app = createAppServer({
    rootDir: ROOT_DIR,
    dbPath
  });

  const address = await app.start(0);
  const port = address.port;

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/evaluate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        persist: "yes",
        session: {
          sessionName: "Validation test",
          startTime: "18:00",
          durationMinutes: 60,
          effortLevel: "moderate",
          tempF: 80,
          humidity: 45,
          aqi: 40,
          smokeAlert: false,
          flexibleStartMinutes: 30,
          indoorAvailable: false,
          alternativeRouteAvailable: true,
          shadeAvailable: true
        }
      })
    });
    const payload = await response.json();

    assert.equal(response.status, 400);
    assert.equal(payload.error, "Persist must be true or false");
  } finally {
    await app.stop();
  }
});

test("storage can switch to a postgres adapter without sqlite", async () => {
  const queries = [];
  const fakeClient = {
    async query(query, params = []) {
      queries.push({
        query,
        params
      });

      if (query.includes("SELECT COUNT(*)::int AS total FROM evaluations")) {
        return {
          rows: [{ total: 0 }]
        };
      }

      if (query.includes("SELECT COUNT(*)::int AS total FROM weather_snapshots")) {
        return {
          rows: [{ total: 0 }]
        };
      }

      if (query.includes("SELECT COUNT(*)::int AS total FROM aqi_snapshots")) {
        return {
          rows: [{ total: 0 }]
        };
      }

      if (query.includes("FROM source_catalog")) {
        return {
          rows: [
            {
              sourceKey: "noaa_nws_api",
              name: "NOAA National Weather Service API",
              provider: "NOAA NWS",
              role: "Live hourly forecast and alerts for United States locations",
              freshness: "Operational hourly forecast updates",
              accessModel: "Open data, no key currently required",
              status: "Active in MVP",
              fitScore: 100,
              url: "https://www.weather.gov/documentation/services-web-api",
              notes: "Best operational fit for United States organizer first decisions"
            }
          ]
        };
      }

      if (query.includes("FROM weather_snapshots")) {
        return {
          rows: []
        };
      }

      return {
        rows: []
      };
    },
    async end() {}
  };

  const storage = await createStorage({
    driver: "postgres",
    postgresUrl: "postgresql://localhost/pulseshift",
    client: fakeClient
  });

  try {
    const health = await storage.getHealth();
    const sources = await storage.listSources();

    assert.equal(health.backend, "postgresql");
    assert.equal(health.connectionLabel, "postgresql://localhost/pulseshift");
    assert.equal(health.savedAqiSnapshots, 0);
    assert.equal(sources.length, 1);
    assert.equal(
      queries.some((entry) => entry.query.includes("CREATE TABLE IF NOT EXISTS evaluations")),
      true
    );
  } finally {
    await storage.close();
  }
});
