const M = window.PULSESHIFT_MODEL;
const $ = (id) => document.getElementById(id);

function heatIndex(t, rh) {
  if (t < 80 || rh < 40) return t;
  const hi =
    -42.379 + 2.04901523 * t + 10.14333127 * rh - 0.22475541 * t * rh -
    0.00683783 * t * t - 0.05481717 * rh * rh + 0.00122874 * t * t * rh +
    0.00085282 * t * rh * rh - 0.00000199 * t * t * rh * rh;
  return Math.round(hi * 10) / 10;
}

function features(input) {
  const angle = (2 * Math.PI * input.hour) / 24;
  return {
    heat_index_f: heatIndex(input.temp, input.humidity),
    aqi: input.aqi,
    humidity: input.humidity,
    wind_mph: input.wind,
    visibility_mi: input.smoke ? 3 : 10,
    smoke_haze: input.smoke ? 1 : 0,
    hour_sin: Math.sin(angle),
    hour_cos: Math.cos(angle),
    is_weekend: input.weekend ? 1 : 0,
  };
}

function risk(input) {
  const f = features(input);
  let z = M.intercept;
  M.features.forEach((name, i) => {
    z += M.coef[i] * ((f[name] - M.mean[i]) / M.scale[i]);
  });
  return 1 / (1 + Math.exp(-z));
}

function band(p) {
  if (p < 0.15) return { label: "Low", cls: "low" };
  if (p < 0.35) return { label: "Moderate", cls: "moderate" };
  if (p < 0.6) return { label: "High", cls: "high" };
  return { label: "Severe", cls: "severe" };
}

function recommend(input, hi, p, unsafe) {
  if (unsafe) {
    return "Unsafe for outdoor activity — move indoors or reschedule.";
  }
  if (p >= 0.6) {
    if (hi >= 85) return "High suppression risk from heat — shift to early morning or evening.";
    if (input.aqi >= 100) return "Elevated risk from air quality — shorten, ease intensity, or move indoors.";
    return "High risk — reduce intensity and shorten the session.";
  }
  if (p >= 0.35) return "Elevated risk — shorten the session and ease the pace.";
  if (p >= 0.15) return "Moderate risk — hydrate, ease the pace, and keep it shorter.";
  return "Conditions look favorable — keep your plan.";
}

function read() {
  return {
    temp: Number($("temp").value),
    humidity: Number($("humidity").value),
    aqi: Number($("aqi").value),
    wind: Number($("wind").value),
    hour: Number($("hour").value),
    weekend: $("weekend").checked,
    smoke: $("smoke").checked,
  };
}

function update() {
  const input = read();
  const hi = heatIndex(input.temp, input.humidity);
  const p = risk(input);
  const unsafe = hi >= M.safety.heat_unsafe_f || input.aqi >= M.safety.aqi_unsafe;
  const b = unsafe ? { label: "Unsafe conditions", cls: "severe" } : band(p);

  $("result").hidden = false;
  $("risk").className = "risk " + b.cls;
  $("pct").textContent = unsafe ? "⚠" : Math.round(p * 100) + "%";
  $("band").textContent = unsafe ? "unsafe to exercise outdoors" : b.label + " suppression risk";
  $("reco").textContent = recommend(input, hi, p, unsafe);
  $("detail").textContent = unsafe
    ? `Heat index ${Math.round(hi)}°F · AQI ${input.aqi} · model suppression ${Math.round(p * 100)}%`
    : `Heat index ${Math.round(hi)}°F · AQI ${input.aqi}`;
}

async function liveWeather() {
  const btn = $("live");
  btn.textContent = "Loading…";
  try {
    const point = await fetch("https://api.weather.gov/points/38.8951,-77.0364").then((r) => r.json());
    const hourly = await fetch(point.properties.forecastHourly).then((r) => r.json());
    const now = hourly.properties.periods[0];
    $("temp").value = now.temperature;
    if (now.relativeHumidity && now.relativeHumidity.value != null) $("humidity").value = now.relativeHumidity.value;
    $("wind").value = parseInt(now.windSpeed, 10) || $("wind").value;
    btn.textContent = "Live DC weather loaded";
    update();
  } catch {
    btn.textContent = "Live weather unavailable — enter manually";
  }
}

function init() {
  const sel = $("hour");
  for (let h = 0; h < 24; h++) {
    const o = document.createElement("option");
    o.value = h;
    o.textContent = String(h).padStart(2, "0") + ":00";
    sel.appendChild(o);
  }
  sel.value = 17;

  document.querySelectorAll("input, select").forEach((el) => el.addEventListener("input", update));
  $("live").addEventListener("click", liveWeather);
  $("meta").textContent = `Trained on ${M.meta.trained_on} · 2024 AUROC ${M.meta.auroc_2024}`;
  update();
}

init();
