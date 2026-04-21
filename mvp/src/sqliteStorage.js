import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import { OFFICIAL_SOURCES } from "./sourceCatalog.js";

function ensureDirectory(filePath) {
  mkdirSync(path.dirname(filePath), { recursive: true });
}

function formatCreatedAt(value) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
}

function migrate(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS evaluations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_name TEXT NOT NULL,
      input_json TEXT NOT NULL,
      baseline_risk_score REAL NOT NULL,
      baseline_risk_band TEXT NOT NULL,
      baseline_expected_minutes INTEGER NOT NULL,
      best_action TEXT NOT NULL,
      best_ram INTEGER NOT NULL,
      result_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS source_catalog (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_key TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      provider TEXT NOT NULL,
      role TEXT NOT NULL,
      freshness TEXT NOT NULL,
      access_model TEXT NOT NULL,
      status TEXT NOT NULL,
      fit_score INTEGER NOT NULL,
      source_url TEXT NOT NULL,
      notes TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS weather_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_key TEXT NOT NULL,
      latitude REAL NOT NULL,
      longitude REAL NOT NULL,
      city TEXT,
      state TEXT,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS aqi_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_key TEXT NOT NULL,
      latitude REAL NOT NULL,
      longitude REAL NOT NULL,
      reporting_area TEXT,
      state TEXT,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

function seedSources(db) {
  const upsertSource = db.prepare(`
    INSERT INTO source_catalog (
      source_key,
      name,
      provider,
      role,
      freshness,
      access_model,
      status,
      fit_score,
      source_url,
      notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(source_key) DO UPDATE SET
      name = excluded.name,
      provider = excluded.provider,
      role = excluded.role,
      freshness = excluded.freshness,
      access_model = excluded.access_model,
      status = excluded.status,
      fit_score = excluded.fit_score,
      source_url = excluded.source_url,
      notes = excluded.notes
  `);

  for (const source of OFFICIAL_SOURCES) {
    upsertSource.run(
      source.key,
      source.name,
      source.provider,
      source.role,
      source.freshness,
      source.accessModel,
      source.status,
      source.fitScore,
      source.url,
      source.notes
    );
  }
}

export function createSqliteStorage(filePath) {
  ensureDirectory(filePath);

  const db = new DatabaseSync(filePath);
  migrate(db);
  seedSources(db);

  const insertEvaluation = db.prepare(`
    INSERT INTO evaluations (
      session_name,
      input_json,
      baseline_risk_score,
      baseline_risk_band,
      baseline_expected_minutes,
      best_action,
      best_ram,
      result_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const countEvaluations = db.prepare(`
    SELECT COUNT(*) AS total
    FROM evaluations
  `);

  const countWeatherSnapshots = db.prepare(`
    SELECT COUNT(*) AS total
    FROM weather_snapshots
  `);

  const countAqiSnapshots = db.prepare(`
    SELECT COUNT(*) AS total
    FROM aqi_snapshots
  `);

  const listEvaluations = db.prepare(`
    SELECT
      id,
      session_name AS sessionName,
      baseline_risk_score AS baselineRiskScore,
      baseline_risk_band AS baselineRiskBand,
      baseline_expected_minutes AS baselineExpectedMinutes,
      best_action AS bestAction,
      best_ram AS bestRam,
      created_at AS createdAt
    FROM evaluations
    ORDER BY id DESC
    LIMIT ?
  `);

  const listSources = db.prepare(`
    SELECT
      source_key AS sourceKey,
      name,
      provider,
      role,
      freshness,
      access_model AS accessModel,
      status,
      fit_score AS fitScore,
      source_url AS url,
      notes
    FROM source_catalog
    ORDER BY fit_score DESC, name ASC
  `);

  const insertWeatherSnapshot = db.prepare(`
    INSERT INTO weather_snapshots (
      source_key,
      latitude,
      longitude,
      city,
      state,
      payload_json
    ) VALUES (?, ?, ?, ?, ?, ?)
  `);

  const insertAqiSnapshot = db.prepare(`
    INSERT INTO aqi_snapshots (
      source_key,
      latitude,
      longitude,
      reporting_area,
      state,
      payload_json
    ) VALUES (?, ?, ?, ?, ?, ?)
  `);

  function saveOfficialConditions(weatherSnapshot, aqiSnapshot) {
    db.exec("BEGIN");

    try {
      const weatherOutcome = insertWeatherSnapshot.run(
        weatherSnapshot.sourceKey,
        weatherSnapshot.latitude,
        weatherSnapshot.longitude,
        weatherSnapshot.city || null,
        weatherSnapshot.state || null,
        JSON.stringify(weatherSnapshot.payload)
      );
      const aqiOutcome = insertAqiSnapshot.run(
        aqiSnapshot.sourceKey,
        aqiSnapshot.latitude,
        aqiSnapshot.longitude,
        aqiSnapshot.reportingArea || null,
        aqiSnapshot.state || null,
        JSON.stringify(aqiSnapshot.payload)
      );

      db.exec("COMMIT");

      return {
        weatherSnapshotId: Number(weatherOutcome.lastInsertRowid),
        aqiSnapshotId: Number(aqiOutcome.lastInsertRowid)
      };
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }

  const latestWeatherSnapshot = db.prepare(`
    SELECT
      id,
      source_key AS sourceKey,
      latitude,
      longitude,
      city,
      state,
      payload_json AS payloadJson,
      created_at AS createdAt
    FROM weather_snapshots
    ORDER BY id DESC
    LIMIT 1
  `);

  const latestAqiSnapshot = db.prepare(`
    SELECT
      id,
      source_key AS sourceKey,
      latitude,
      longitude,
      reporting_area AS reportingArea,
      state,
      payload_json AS payloadJson,
      created_at AS createdAt
    FROM aqi_snapshots
    ORDER BY id DESC
    LIMIT 1
  `);

  return {
    backend: "sqlite",
    connectionLabel: filePath,
    async saveEvaluation(session, result) {
      const top = result.recommendations[0];

      const outcome = insertEvaluation.run(
        result.session.sessionName,
        JSON.stringify(session),
        result.baseline.riskScore,
        result.baseline.riskBand,
        result.baseline.expectedMinutes,
        top.label,
        top.ram,
        JSON.stringify(result)
      );

      return {
        id: Number(outcome.lastInsertRowid),
        sessionName: result.session.sessionName,
        bestAction: top.label,
        bestRam: top.ram
      };
    },
    async saveWeatherSnapshot(snapshot) {
      const outcome = insertWeatherSnapshot.run(
        snapshot.sourceKey,
        snapshot.latitude,
        snapshot.longitude,
        snapshot.city || null,
        snapshot.state || null,
        JSON.stringify(snapshot.payload)
      );

      return Number(outcome.lastInsertRowid);
    },
    async saveAqiSnapshot(snapshot) {
      const outcome = insertAqiSnapshot.run(
        snapshot.sourceKey,
        snapshot.latitude,
        snapshot.longitude,
        snapshot.reportingArea || null,
        snapshot.state || null,
        JSON.stringify(snapshot.payload)
      );

      return Number(outcome.lastInsertRowid);
    },
    async saveOfficialConditions(weatherSnapshot, aqiSnapshot) {
      return saveOfficialConditions(weatherSnapshot, aqiSnapshot);
    },
    async getHealth() {
      const evaluationRow = countEvaluations.get();
      const weatherRow = countWeatherSnapshots.get();
      const aqiRow = countAqiSnapshots.get();

      return {
        ok: true,
        backend: "sqlite",
        connectionLabel: filePath,
        savedEvaluations: evaluationRow.total,
        savedWeatherSnapshots: weatherRow.total,
        savedAqiSnapshots: aqiRow.total,
        sourceCatalogSize: OFFICIAL_SOURCES.length
      };
    },
    async listRecent(limit = 5) {
      return listEvaluations.all(limit).map((item) => ({
        ...item,
        createdAtLabel: formatCreatedAt(item.createdAt)
      }));
    },
    async listSources() {
      return listSources.all();
    },
    async getLatestWeatherSnapshot() {
      const row = latestWeatherSnapshot.get();

      if (!row) {
        return null;
      }

      const { payloadJson, ...rest } = row;

      return {
        ...rest,
        payload: JSON.parse(payloadJson),
        createdAtLabel: formatCreatedAt(rest.createdAt)
      };
    },
    async getLatestAqiSnapshot() {
      const row = latestAqiSnapshot.get();

      if (!row) {
        return null;
      }

      const { payloadJson, ...rest } = row;

      return {
        ...rest,
        payload: JSON.parse(payloadJson),
        createdAtLabel: formatCreatedAt(rest.createdAt)
      };
    },
    async close() {
      db.close();
    }
  };
}
