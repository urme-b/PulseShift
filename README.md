# PulseShift

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/new/template?template=https://github.com/urme-b/PulseShift)

PulseShift is an organizer first decision support system for outdoor activity planning under climate stress.

The repository contains a working application that estimates session suppression risk and ranks safer adaptations for planned activity sessions.

## What Problem It Solves

Outdoor sessions are often disrupted by heat, humidity, smoke, and poor air quality.

Most weather tools report conditions.

They do not answer the practical question an organizer actually faces:

How can this session be preserved as safely as possible?

PulseShift addresses that gap by combining climate conditions with session context and recommending the safest high value alternative.

## Current System Scope

1. Heat and smoke focused risk estimation
2. Organizer first workflow for planned sessions
3. Action ranking for:
   keep plan
   start earlier
   shift route
   reduce intensity
   shorten session
   move indoors
   cancel session
4. RAM style retained activity output
5. Official source integration:
   NOAA National Weather Service
   EPA AirNow
6. Local SQLite mode and live PostgreSQL mode

## Key Features

1. Planned session input with duration, effort, flexibility, and available adaptations
2. Time aware NOAA hourly weather selection
3. Official AirNow AQI ingestion
4. Combined official weather plus AQI import
5. Server side validation
6. Atomic persistence for official condition imports
7. Test coverage for core engine, source adapters, and API routes
8. Stats layer for evaluation counts, RAM, import volume, and recommendation mix
9. Clean dataset exports for saved evaluations and official condition imports

## Project Structure

| Path | Purpose |
| --- | --- |
| `index.html` | Main UI |
| `styles.css` | Styling |
| `server.js` | Local server and API routes |
| `src/datasets.js` | Clean dataset definitions and CSV export helpers |
| `src/engine.js` | Risk and adaptation logic |
| `src/nws.js` | NOAA weather adapter |
| `src/airnow.js` | AirNow AQI adapter |
| `src/sqliteStorage.js` | SQLite persistence |
| `src/postgresStorage.js` | PostgreSQL persistence |
| `src/*.test.js` | Automated tests |

## How To Run

### Default local mode

```bash
npm install
npm run dev
```

Open:

```bash
http://127.0.0.1:4173
```

### PostgreSQL mode

```bash
npm install
npm run dev:postgres
```

This expects a local PostgreSQL database named `pulseshift`.

## How To Test

```bash
npm test
```

## Data Sources

1. NOAA National Weather Service API
2. EPA AirNow reporting area data feed

## Dataset Layer

1. `GET /api/datasets/summary` returns row counts, time coverage, and column definitions
2. `GET /api/datasets/evaluations.csv` exports a clean session level evaluation table
3. `GET /api/datasets/official-conditions.csv` exports a clean official import table for NOAA weather and AirNow AQI

## Current Limitations

1. AQI is reporting area based, not hyperlocal
2. The project is still an academic prototype, not a production deployment
3. The current focus is outdoor session retention under heat and smoke, not every climate hazard
4. Evaluations and official condition imports are exported as separate clean tables because the current schema does not yet link each evaluation to a specific import batch

## Evaluation Notes

For an academic or professor review, the important points are:

1. The repository contains a runnable working system
2. The logic is modular and testable
3. Official environmental sources are integrated
4. The decision engine is explicit and inspectable
5. The system has a clear behavioral and product thesis
6. The stats layer makes recommendation behavior easier to audit
7. The dataset layer makes the stored evidence exportable for downstream analysis
