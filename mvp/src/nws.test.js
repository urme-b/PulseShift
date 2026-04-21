import test from "node:test";
import assert from "node:assert/strict";

import { fetchOfficialWeatherSnapshot } from "./nws.js";

test("nws snapshot picks the forecast period closest to the requested start time", async () => {
  const originalFetch = global.fetch;
  const calls = [];

  global.fetch = async (url) => {
    calls.push(String(url));

    if (String(url).includes("/points/")) {
      return {
        ok: true,
        async json() {
          return {
            properties: {
              forecastHourly: "https://api.weather.gov/gridpoints/OKX/33,42/forecast/hourly",
              relativeLocation: {
                properties: {
                  city: "Hoboken",
                  state: "NJ"
                }
              },
              cwa: "OKX",
              gridId: "OKX",
              gridX: 33,
              gridY: 42
            }
          };
        }
      };
    }

    return {
      ok: true,
      async json() {
        return {
          properties: {
            periods: [
              {
                startTime: "2026-04-21T05:00:00-04:00",
                temperature: 35,
                temperatureUnit: "F",
                relativeHumidity: { value: 47 },
                shortForecast: "Clear",
                windSpeed: "10 mph",
                windDirection: "N",
                isDaytime: false
              },
              {
                startTime: "2026-04-21T18:00:00-04:00",
                temperature: 62,
                temperatureUnit: "F",
                relativeHumidity: { value: 41 },
                shortForecast: "Sunny",
                windSpeed: "7 mph",
                windDirection: "SW",
                isDaytime: true
              }
            ]
          }
        };
      }
    };
  };

  try {
    const snapshot = await fetchOfficialWeatherSnapshot(40.7128, -74.006, {
      startTime: "18:00"
    });

    assert.equal(snapshot.payload.forecast.temperature, 62);
    assert.equal(snapshot.payload.forecast.requestedStartTime, "18:00");
    assert.equal(calls.length, 2);
  } finally {
    global.fetch = originalFetch;
  }
});
