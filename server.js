import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { fetchOfficialAirQualitySnapshot } from "./src/airnow.js";
import { createStorage } from "./src/db.js";
import { rankAdaptations } from "./src/engine.js";
import { fetchOfficialWeatherSnapshot } from "./src/nws.js";
import {
  validateEvaluationRequest,
  validateListLimit,
  validateOfficialImportPayload
} from "./src/validation.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8"
};

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8"
  });
  response.end(JSON.stringify(payload));
}

function sendText(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "text/plain; charset=utf-8"
  });
  response.end(payload);
}

function badRequest(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

async function readBody(request) {
  const chunks = [];

  for await (const chunk of request) {
    chunks.push(chunk);
  }

  if (!chunks.length) {
    return {};
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw badRequest("Request body must be valid JSON");
  }
}

function officialImportFromQuery(url) {
  return validateOfficialImportPayload({
    latitude: url.searchParams.get("latitude"),
    longitude: url.searchParams.get("longitude"),
    lat: url.searchParams.get("lat"),
    lon: url.searchParams.get("lon"),
    startTime: url.searchParams.get("startTime") || null
  });
}

async function serveStatic(response, rootDir, requestPath) {
  const safePath = requestPath === "/" ? "/index.html" : requestPath;
  const normalized = path.normalize(safePath).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(rootDir, normalized);

  if (!filePath.startsWith(rootDir)) {
    sendText(response, 403, "Forbidden");
    return;
  }

  try {
    const content = await readFile(filePath);
    const extension = path.extname(filePath);
    response.writeHead(200, {
      "Content-Type": MIME_TYPES[extension] || "application/octet-stream"
    });
    response.end(content);
  } catch {
    sendText(response, 404, "Not found");
  }
}

export function createAppServer({
  rootDir = __dirname,
  driver = process.env.PULSESHIFT_DB_DRIVER || "sqlite",
  dbPath = path.join(__dirname, "data", "pulseshift.sqlite"),
  postgresUrl = process.env.PULSESHIFT_POSTGRES_URL,
  client = null,
  weatherFetcher = fetchOfficialWeatherSnapshot,
  airQualityFetcher = fetchOfficialAirQualitySnapshot
} = {}) {
  let databasePromise = null;

  function getDatabase() {
    if (!databasePromise) {
      databasePromise = createStorage({
        driver,
        dbPath,
        postgresUrl,
        client
      });
    }

    return databasePromise;
  }

  const server = createServer(async (request, response) => {
    const url = new URL(request.url, "http://127.0.0.1");

    try {
      const database = await getDatabase();

      if (request.method === "GET" && url.pathname === "/api/health") {
        sendJson(response, 200, await database.getHealth());
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/evaluations") {
        const limit = validateListLimit(url.searchParams.get("limit"));
        sendJson(response, 200, {
          items: await database.listRecent(limit)
        });
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/stats/summary") {
        sendJson(response, 200, {
          item: await database.getStatsSummary()
        });
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/stats/recommendations") {
        sendJson(response, 200, {
          items: await database.listRecommendationStats()
        });
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/latest-weather") {
        sendJson(response, 200, {
          item: await database.getLatestWeatherSnapshot()
        });
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/latest-aqi") {
        sendJson(response, 200, {
          item: await database.getLatestAqiSnapshot()
        });
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/latest-conditions") {
        sendJson(response, 200, {
          item: await database.getLatestOfficialConditions()
        });
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/sources") {
        sendJson(response, 200, {
          items: await database.listSources()
        });
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/official-weather") {
        const { latitude, longitude, startTime } = officialImportFromQuery(url);
        const snapshot = await weatherFetcher(latitude, longitude, {
          startTime
        });

        sendJson(response, 200, {
          snapshot
        });
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/official-weather") {
        const payload = validateOfficialImportPayload(await readBody(request));
        const snapshot = await weatherFetcher(payload.latitude, payload.longitude, {
          startTime: payload.startTime
        });
        const snapshotId = await database.saveWeatherSnapshot(snapshot);

        sendJson(response, 200, {
          snapshotId,
          snapshot
        });
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/official-air-quality") {
        const { latitude, longitude } = officialImportFromQuery(url);
        const snapshot = await airQualityFetcher(latitude, longitude);

        sendJson(response, 200, {
          snapshot
        });
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/official-air-quality") {
        const payload = validateOfficialImportPayload(await readBody(request));
        const snapshot = await airQualityFetcher(payload.latitude, payload.longitude);
        const snapshotId = await database.saveAqiSnapshot(snapshot);

        sendJson(response, 200, {
          snapshotId,
          snapshot
        });
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/official-conditions") {
        const { latitude, longitude, startTime } = officialImportFromQuery(url);
        const [weatherSnapshot, aqiSnapshot] = await Promise.all([
          weatherFetcher(latitude, longitude, {
            startTime
          }),
          airQualityFetcher(latitude, longitude)
        ]);

        sendJson(response, 200, {
          conditions: {
            weather: weatherSnapshot,
            airQuality: aqiSnapshot
          }
        });
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/official-conditions") {
        const payload = validateOfficialImportPayload(await readBody(request));
        const [weatherSnapshot, aqiSnapshot] = await Promise.all([
          weatherFetcher(payload.latitude, payload.longitude, {
            startTime: payload.startTime
          }),
          airQualityFetcher(payload.latitude, payload.longitude)
        ]);
        const { importBatchId, weatherSnapshotId, aqiSnapshotId } =
          await database.saveOfficialConditions(
          weatherSnapshot,
          aqiSnapshot
          );

        sendJson(response, 200, {
          importBatchId,
          weatherSnapshotId,
          aqiSnapshotId,
          conditions: {
            weather: weatherSnapshot,
            airQuality: aqiSnapshot
          }
        });
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/evaluate") {
        const payload = validateEvaluationRequest(await readBody(request));
        const { session, persist } = payload;
        const result = rankAdaptations(session);
        const savedRecord = persist ? await database.saveEvaluation(session, result) : null;

        sendJson(response, 200, {
          persisted: persist,
          savedRecord,
          result
        });
        return;
      }

      await serveStatic(response, rootDir, url.pathname);
    } catch (error) {
      sendJson(response, error.statusCode || 500, {
        error: error.message || "Server error"
      });
    }
  });

  return {
    server,
    async start(port = 4173) {
      await new Promise((resolve) => server.listen(port, resolve));
      return server.address();
    },
    async stop() {
      await new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      });
      const database = await getDatabase();
      await database.close();
    },
    async getStorage() {
      return getDatabase();
    }
  };
}

if (process.argv[1] === __filename) {
  const app = createAppServer({
    driver: process.env.PULSESHIFT_DB_DRIVER || "sqlite",
    dbPath: process.env.PULSESHIFT_DB_PATH || path.join(__dirname, "data", "pulseshift.sqlite"),
    postgresUrl: process.env.PULSESHIFT_POSTGRES_URL
  });
  const port = Number(process.env.PORT) || 4173;

  app
    .start(port)
    .then(async (address) => {
      const activePort = typeof address === "object" && address ? address.port : port;
      const storage = await app.getStorage();
      console.log(`PulseShift server running on http://127.0.0.1:${activePort}`);
      console.log(`Database backend ${storage.backend}`);
      console.log(`Database target ${storage.connectionLabel}`);
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
