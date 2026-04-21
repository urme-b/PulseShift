import test from "node:test";
import assert from "node:assert/strict";

import { fetchOfficialAirQualitySnapshot } from "./airnow.js";

test("airnow snapshot uses the nearest reporting area and preserves numeric AQI", async () => {
  const originalFetch = global.fetch;

  global.fetch = async () => ({
    ok: true,
    async text() {
      return [
        "04/21/26|04/21/26|13:00|EDT|0|O|Y|Boston|MA|42.3601|-71.0589|PM2.5|88|Moderate|No||MassDEP",
        "04/21/26|04/21/26||EDT|0|F|Y|Boston|MA|42.3601|-71.0589|PM2.5|94|Moderate|No|Holding steady.|MassDEP",
        "04/21/26|04/21/26|13:00|EDT|0|O|Y|Denver|CO|39.7392|-104.9903|OZONE|41|Good|No||CDPHE"
      ].join("\n");
    }
  });

  try {
    const snapshot = await fetchOfficialAirQualitySnapshot(42.35, -71.05);

    assert.equal(snapshot.reportingArea, "Boston");
    assert.equal(snapshot.payload.currentObservation.aqi, 88);
    assert.equal(snapshot.payload.todayForecast.aqi, 94);
    assert.equal(snapshot.payload.effective.aqi, 94);
    assert.equal(snapshot.payload.lookup.distanceMiles < 2, true);
  } finally {
    global.fetch = originalFetch;
  }
});

test("airnow snapshot estimates AQI from category when the numeric forecast is blank", async () => {
  const originalFetch = global.fetch;

  global.fetch = async () => ({
    ok: true,
    async text() {
      return [
        "04/21/26|04/21/26|13:00|PDT|0|O|Y|Sacramento|CA|38.5816|-121.4944|PM2.5|72|Moderate|No||CARB",
        "04/21/26|04/21/26||PDT|0|F|Y|Sacramento|CA|38.5816|-121.4944|PM2.5||Unhealthy for Sensitive Groups|Yes|Smoke impact likely.|CARB"
      ].join("\n");
    }
  });

  try {
    const snapshot = await fetchOfficialAirQualitySnapshot(38.58, -121.49);

    assert.equal(snapshot.payload.todayForecast.aqi, 125);
    assert.equal(snapshot.payload.todayForecast.aqiEstimated, true);
    assert.equal(snapshot.payload.effective.aqi, 125);
    assert.equal(snapshot.payload.effective.smokeAlert, true);
  } finally {
    global.fetch = originalFetch;
  }
});
