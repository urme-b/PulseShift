import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { DatabaseSync } from "node:sqlite";

import { createPostgresStorage } from "./postgresStorage.js";
import { createSqliteStorage } from "./sqliteStorage.js";

function createWeatherSnapshot() {
  return {
    sourceKey: "noaa_nws_api",
    latitude: 40.7128,
    longitude: -74.006,
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
        requestedStartTime: "18:00",
        startTime: "2026-04-20T18:00:00-04:00",
        temperature: 82,
        temperatureUnit: "F",
        relativeHumidity: 56,
        shortForecast: "Mostly Sunny",
        windSpeed: "8 mph",
        windDirection: "SW",
        isDaytime: true
      }
    }
  };
}

function createAqiSnapshot() {
  return {
    sourceKey: "epa_airnow",
    latitude: 40.7128,
    longitude: -74.006,
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
  };
}

test("sqlite official condition saves roll back fully on mid-transaction failure", async () => {
  const tempDir = mkdtempSync(path.join(tmpdir(), "pulse-shift-storage-"));
  const dbPath = path.join(tempDir, "test.sqlite");
  const storage = createSqliteStorage(dbPath);

  try {
    const weatherSnapshot = createWeatherSnapshot();
    const aqiSnapshot = createAqiSnapshot();
    aqiSnapshot.payload.self = aqiSnapshot.payload;

    await assert.rejects(
      storage.saveOfficialConditions(weatherSnapshot, aqiSnapshot),
      /circular structure/i
    );

    const db = new DatabaseSync(dbPath);
    const importCount = db.prepare("SELECT COUNT(*) AS total FROM official_condition_imports").get();
    const weatherCount = db.prepare("SELECT COUNT(*) AS total FROM weather_snapshots").get();
    const aqiCount = db.prepare("SELECT COUNT(*) AS total FROM aqi_snapshots").get();
    db.close();

    assert.equal(importCount.total, 0);
    assert.equal(weatherCount.total, 0);
    assert.equal(aqiCount.total, 0);
  } finally {
    await storage.close();
  }
});

test("postgres official condition saves roll back and never commit on failure", async () => {
  const queries = [];
  const connection = {
    async query(query, params = []) {
      queries.push({
        query,
        params
      });

      if (typeof query === "string" && query.includes("INSERT INTO aqi_snapshots")) {
        throw new Error("forced aqi insert failure");
      }

      if (typeof query === "string" && query.includes("INSERT INTO official_condition_imports")) {
        return {
          rows: [{ id: 1 }]
        };
      }

      if (typeof query === "string" && query.includes("INSERT INTO weather_snapshots")) {
        return {
          rows: [{ id: 1 }]
        };
      }

      if (typeof query === "string" && query.includes("FROM source_catalog")) {
        return {
          rows: []
        };
      }

      return {
        rows: []
      };
    },
    releaseCalled: false,
    release() {
      this.releaseCalled = true;
    }
  };

  const pool = {
    async query(query, params = []) {
      queries.push({
        query,
        params
      });

      return {
        rows: []
      };
    },
    async connect() {
      return connection;
    },
    async end() {}
  };

  const storage = await createPostgresStorage({
    postgresUrl: "postgresql://localhost/pulseshift",
    client: pool
  });

  try {
    await assert.rejects(
      storage.saveOfficialConditions(createWeatherSnapshot(), createAqiSnapshot()),
      /forced aqi insert failure/
    );

    assert.equal(
      queries.some((entry) => entry.query === "BEGIN"),
      true
    );
    assert.equal(
      queries.some((entry) => entry.query === "ROLLBACK"),
      true
    );
    assert.equal(
      queries.some((entry) => entry.query === "COMMIT"),
      false
    );
    assert.equal(connection.releaseCalled, true);
  } finally {
    await storage.close();
  }
});
