import test from "node:test";
import assert from "node:assert/strict";

import {
  calculateHeatIndex,
  normalizeSession,
  rankAdaptations,
  scoreSuppressionRisk
} from "./engine.js";

test("mild conditions keep the planned session", () => {
  const result = rankAdaptations({
    sessionName: "Easy morning run",
    durationMinutes: 45,
    effortLevel: "easy",
    tempF: 72,
    humidity: 45,
    aqi: 34,
    smokeAlert: false,
    flexibleStartMinutes: 60,
    indoorAvailable: true,
    alternativeRouteAvailable: true,
    shadeAvailable: true
  });

  assert.equal(result.recommendations[0].id, "keep");
});

test("smoke heavy conditions prefer indoor movement when available", () => {
  const result = rankAdaptations({
    sessionName: "Club run",
    durationMinutes: 50,
    effortLevel: "moderate",
    tempF: 84,
    humidity: 48,
    aqi: 176,
    smokeAlert: true,
    flexibleStartMinutes: 60,
    indoorAvailable: true,
    alternativeRouteAvailable: true,
    shadeAvailable: true
  });

  assert.equal(result.recommendations[0].id, "move-indoors");
});

test("extreme smoke with no indoor option cancels the session", () => {
  const result = rankAdaptations({
    sessionName: "Evening run",
    durationMinutes: 60,
    effortLevel: "hard",
    tempF: 90,
    humidity: 55,
    aqi: 224,
    smokeAlert: true,
    flexibleStartMinutes: 0,
    indoorAvailable: false,
    alternativeRouteAvailable: false,
    shadeAvailable: false
  });

  assert.equal(result.recommendations[0].id, "cancel");
});

test("heat stress prefers an earlier start over keeping the plan", () => {
  const result = rankAdaptations({
    sessionName: "Tempo run",
    startTime: "18:00",
    durationMinutes: 65,
    effortLevel: "hard",
    tempF: 92,
    humidity: 60,
    aqi: 82,
    smokeAlert: false,
    flexibleStartMinutes: 60,
    indoorAvailable: false,
    alternativeRouteAvailable: true,
    shadeAvailable: true
  });

  assert.equal(result.recommendations[0].id, "earlier-start");
});

test("later hot sessions get more benefit from starting earlier than morning sessions", () => {
  const evening = rankAdaptations({
    sessionName: "Evening run",
    startTime: "18:00",
    durationMinutes: 60,
    effortLevel: "moderate",
    tempF: 90,
    humidity: 55,
    aqi: 88,
    smokeAlert: false,
    flexibleStartMinutes: 60,
    indoorAvailable: false,
    alternativeRouteAvailable: false,
    shadeAvailable: false
  });
  const morning = rankAdaptations({
    sessionName: "Morning run",
    startTime: "06:00",
    durationMinutes: 60,
    effortLevel: "moderate",
    tempF: 90,
    humidity: 55,
    aqi: 88,
    smokeAlert: false,
    flexibleStartMinutes: 60,
    indoorAvailable: false,
    alternativeRouteAvailable: false,
    shadeAvailable: false
  });
  const eveningEarlier = evening.recommendations.find((item) => item.id === "earlier-start");
  const morningEarlier = morning.recommendations.find((item) => item.id === "earlier-start");

  assert.ok(eveningEarlier);
  assert.ok(morningEarlier);
  assert.ok(eveningEarlier.expectedMinutes > morningEarlier.expectedMinutes);
});

test("heat index rises above ambient temperature in humid heat", () => {
  const heatIndex = calculateHeatIndex(96, 62);

  assert.ok(heatIndex > 96);
});

test("risk score stays bounded", () => {
  const risk = scoreSuppressionRisk(
    normalizeSession({
      durationMinutes: 70,
      effortLevel: "hard",
      tempF: 101,
      humidity: 70,
      aqi: 165,
      smokeAlert: true,
      flexibleStartMinutes: 0,
      indoorAvailable: false,
      alternativeRouteAvailable: false,
      shadeAvailable: false
    })
  );

  assert.ok(risk.score >= 0);
  assert.ok(risk.score <= 1);
});
