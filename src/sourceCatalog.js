export const OFFICIAL_SOURCES = [
  {
    key: "noaa_nws_api",
    name: "NOAA National Weather Service API",
    provider: "NOAA NWS",
    role: "Live hourly forecast and alerts for United States locations",
    freshness: "Operational hourly forecast updates",
    accessModel: "Open data, no key currently required",
    status: "Active in current system",
    fitScore: 100,
    url: "https://www.weather.gov/documentation/services-web-api",
    notes: "Best operational fit for United States organizer first decisions"
  },
  {
    key: "noaa_heatrisk",
    name: "NWS HeatRisk",
    provider: "NOAA NWS",
    role: "Heat health risk context for short range decisions",
    freshness: "Daily forecasts up to 7 days",
    accessModel: "Open public product",
    status: "Reference source for next integration",
    fitScore: 94,
    url: "https://www.wpc.ncep.noaa.gov/heatrisk/",
    notes: "Better product fit than generic temperature thresholds"
  },
  {
    key: "epa_airnow",
    name: "EPA AirNow API",
    provider: "US EPA AirNow",
    role: "Current and forecast AQI for reporting areas",
    freshness: "Near real time and forecast",
    accessModel: "Public reporting area file feed",
    status: "Active in current system",
    fitScore: 93,
    url: "https://s3-us-west-1.amazonaws.com/files.airnowtech.org/airnow/docs/ReportingAreaFactSheet.pdf",
    notes: "Using the official reporting area feed for key free AQI import"
  },
  {
    key: "copernicus_era5_land",
    name: "Copernicus ERA5 Land",
    provider: "Copernicus Climate Data Store",
    role: "Historical hourly weather backfill for model training and backtests",
    freshness: "Daily updates, historical from 1950",
    accessModel: "Open access under CC BY with platform account",
    status: "Backtest source",
    fitScore: 91,
    url: "https://cds.climate.copernicus.eu/datasets/reanalysis-era5-land-timeseries",
    notes: "Best historical climate source in this stack"
  },
  {
    key: "epa_aqs",
    name: "EPA AQS API",
    provider: "US EPA AQS",
    role: "Validated historical air quality monitor data",
    freshness: "Lagged regulatory quality history",
    accessModel: "Public API with key",
    status: "Historical validation source",
    fitScore: 85,
    url: "https://aqs.epa.gov/aqsweb/documents/data_api.html",
    notes: "Not real time, but strong for retrospective model validation"
  },
  {
    key: "owid_context",
    name: "Our World in Data",
    provider: "Global Change Data Lab",
    role: "Macro narrative and market context only",
    freshness: "Topic dependent",
    accessModel: "Open access",
    status: "Context source, not product source",
    fitScore: 42,
    url: "https://ourworldindata.org/",
    notes: "Good for pitch context, weak for session level product logic"
  }
];
