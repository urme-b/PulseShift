import { OFFICIAL_SOURCES } from "./sourceCatalog.js";

function formatCreatedAt(value) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
}

const POSTGRES_SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS evaluations (
    id BIGSERIAL PRIMARY KEY,
    session_name TEXT NOT NULL,
    input_json JSONB NOT NULL,
    baseline_risk_score DOUBLE PRECISION NOT NULL,
    baseline_risk_band TEXT NOT NULL,
    baseline_expected_minutes INTEGER NOT NULL,
    best_action TEXT NOT NULL,
    best_ram INTEGER NOT NULL,
    result_json JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS source_catalog (
    id BIGSERIAL PRIMARY KEY,
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
    id BIGSERIAL PRIMARY KEY,
    source_key TEXT NOT NULL,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    city TEXT,
    state TEXT,
    payload_json JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS aqi_snapshots (
    id BIGSERIAL PRIMARY KEY,
    source_key TEXT NOT NULL,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    reporting_area TEXT,
    state TEXT,
    payload_json JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
`;

async function createPool(postgresUrl) {
  let pgModule;

  try {
    pgModule = await import("pg");
  } catch {
    throw new Error("PostgreSQL driver missing. Install the pg package before using postgres mode.");
  }

  const { Pool } = pgModule.default ? pgModule.default : pgModule;
  return new Pool({
    connectionString: postgresUrl
  });
}

async function seedSources(client) {
  const query = `
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
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    ON CONFLICT(source_key) DO UPDATE SET
      name = EXCLUDED.name,
      provider = EXCLUDED.provider,
      role = EXCLUDED.role,
      freshness = EXCLUDED.freshness,
      access_model = EXCLUDED.access_model,
      status = EXCLUDED.status,
      fit_score = EXCLUDED.fit_score,
      source_url = EXCLUDED.source_url,
      notes = EXCLUDED.notes
  `;

  for (const source of OFFICIAL_SOURCES) {
    await client.query(query, [
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
    ]);
  }
}

async function withTransaction(client, action) {
  if (typeof client.connect === "function") {
    const connection = await client.connect();

    try {
      await connection.query("BEGIN");
      const result = await action(connection);
      await connection.query("COMMIT");
      return result;
    } catch (error) {
      await connection.query("ROLLBACK");
      throw error;
    } finally {
      connection.release();
    }
  }

  await client.query("BEGIN");

  try {
    const result = await action(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

export async function createPostgresStorage({
  postgresUrl,
  client = null
} = {}) {
  const activeClient = client || (await createPool(postgresUrl));

  await activeClient.query(POSTGRES_SCHEMA_SQL);
  await seedSources(activeClient);

  return {
    backend: "postgresql",
    connectionLabel: postgresUrl || "postgresql://local",
    async saveEvaluation(session, result) {
      const top = result.recommendations[0];
      const query = `
        INSERT INTO evaluations (
          session_name,
          input_json,
          baseline_risk_score,
          baseline_risk_band,
          baseline_expected_minutes,
          best_action,
          best_ram,
          result_json
        ) VALUES ($1, $2::jsonb, $3, $4, $5, $6, $7, $8::jsonb)
        RETURNING id
      `;

      const response = await activeClient.query(query, [
        result.session.sessionName,
        JSON.stringify(session),
        result.baseline.riskScore,
        result.baseline.riskBand,
        result.baseline.expectedMinutes,
        top.label,
        top.ram,
        JSON.stringify(result)
      ]);

      return {
        id: Number(response.rows[0].id),
        sessionName: result.session.sessionName,
        bestAction: top.label,
        bestRam: top.ram
      };
    },
    async saveWeatherSnapshot(snapshot) {
      const query = `
        INSERT INTO weather_snapshots (
          source_key,
          latitude,
          longitude,
          city,
          state,
          payload_json
        ) VALUES ($1, $2, $3, $4, $5, $6::jsonb)
        RETURNING id
      `;

      const response = await activeClient.query(query, [
        snapshot.sourceKey,
        snapshot.latitude,
        snapshot.longitude,
        snapshot.city || null,
        snapshot.state || null,
        JSON.stringify(snapshot.payload)
      ]);

      return Number(response.rows[0].id);
    },
    async saveAqiSnapshot(snapshot) {
      const query = `
        INSERT INTO aqi_snapshots (
          source_key,
          latitude,
          longitude,
          reporting_area,
          state,
          payload_json
        ) VALUES ($1, $2, $3, $4, $5, $6::jsonb)
        RETURNING id
      `;

      const response = await activeClient.query(query, [
        snapshot.sourceKey,
        snapshot.latitude,
        snapshot.longitude,
        snapshot.reportingArea || null,
        snapshot.state || null,
        JSON.stringify(snapshot.payload)
      ]);

      return Number(response.rows[0].id);
    },
    async saveOfficialConditions(weatherSnapshot, aqiSnapshot) {
      return withTransaction(activeClient, async (transaction) => {
        const weatherQuery = `
          INSERT INTO weather_snapshots (
            source_key,
            latitude,
            longitude,
            city,
            state,
            payload_json
          ) VALUES ($1, $2, $3, $4, $5, $6::jsonb)
          RETURNING id
        `;
        const aqiQuery = `
          INSERT INTO aqi_snapshots (
            source_key,
            latitude,
            longitude,
            reporting_area,
            state,
            payload_json
          ) VALUES ($1, $2, $3, $4, $5, $6::jsonb)
          RETURNING id
        `;
        const weatherResponse = await transaction.query(weatherQuery, [
          weatherSnapshot.sourceKey,
          weatherSnapshot.latitude,
          weatherSnapshot.longitude,
          weatherSnapshot.city || null,
          weatherSnapshot.state || null,
          JSON.stringify(weatherSnapshot.payload)
        ]);
        const aqiResponse = await transaction.query(aqiQuery, [
          aqiSnapshot.sourceKey,
          aqiSnapshot.latitude,
          aqiSnapshot.longitude,
          aqiSnapshot.reportingArea || null,
          aqiSnapshot.state || null,
          JSON.stringify(aqiSnapshot.payload)
        ]);

        return {
          weatherSnapshotId: Number(weatherResponse.rows[0].id),
          aqiSnapshotId: Number(aqiResponse.rows[0].id)
        };
      });
    },
    async getHealth() {
      const evaluationResponse = await activeClient.query(
        "SELECT COUNT(*)::int AS total FROM evaluations"
      );
      const weatherResponse = await activeClient.query(
        "SELECT COUNT(*)::int AS total FROM weather_snapshots"
      );
      const aqiResponse = await activeClient.query(
        "SELECT COUNT(*)::int AS total FROM aqi_snapshots"
      );

      return {
        ok: true,
        backend: "postgresql",
        connectionLabel: postgresUrl || "postgresql://local",
        savedEvaluations: evaluationResponse.rows[0].total,
        savedWeatherSnapshots: weatherResponse.rows[0].total,
        savedAqiSnapshots: aqiResponse.rows[0].total,
        sourceCatalogSize: OFFICIAL_SOURCES.length
      };
    },
    async listRecent(limit = 5) {
      const query = `
        SELECT
          id,
          session_name AS "sessionName",
          baseline_risk_score AS "baselineRiskScore",
          baseline_risk_band AS "baselineRiskBand",
          baseline_expected_minutes AS "baselineExpectedMinutes",
          best_action AS "bestAction",
          best_ram AS "bestRam",
          created_at AS "createdAt"
        FROM evaluations
        ORDER BY id DESC
        LIMIT $1
      `;
      const response = await activeClient.query(query, [limit]);

      return response.rows.map((item) => ({
        ...item,
        createdAtLabel: formatCreatedAt(item.createdAt)
      }));
    },
    async listSources() {
      const query = `
        SELECT
          source_key AS "sourceKey",
          name,
          provider,
          role,
          freshness,
          access_model AS "accessModel",
          status,
          fit_score AS "fitScore",
          source_url AS url,
          notes
        FROM source_catalog
        ORDER BY fit_score DESC, name ASC
      `;
      const response = await activeClient.query(query);
      return response.rows;
    },
    async getLatestWeatherSnapshot() {
      const query = `
        SELECT
          id,
          source_key AS "sourceKey",
          latitude,
          longitude,
          city,
          state,
          payload_json AS payload,
          created_at AS "createdAt"
        FROM weather_snapshots
        ORDER BY id DESC
        LIMIT 1
      `;
      const response = await activeClient.query(query);
      const row = response.rows[0];

      if (!row) {
        return null;
      }

      return {
        ...row,
        createdAtLabel: formatCreatedAt(row.createdAt)
      };
    },
    async getLatestAqiSnapshot() {
      const query = `
        SELECT
          id,
          source_key AS "sourceKey",
          latitude,
          longitude,
          reporting_area AS "reportingArea",
          state,
          payload_json AS payload,
          created_at AS "createdAt"
        FROM aqi_snapshots
        ORDER BY id DESC
        LIMIT 1
      `;
      const response = await activeClient.query(query);
      const row = response.rows[0];

      if (!row) {
        return null;
      }

      return {
        ...row,
        createdAtLabel: formatCreatedAt(row.createdAt)
      };
    },
    async close() {
      await activeClient.end();
    }
  };
}
