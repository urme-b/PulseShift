"""Sources, paths, and analysis constants for the Washington DC study."""

from pathlib import Path

YEARS = (2022, 2023, 2024)

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
INTERIM = ROOT / "data" / "interim"
PROCESSED = ROOT / "data" / "processed"
FIGURES = ROOT.parent / "paper" / "figures"
TABLES = ROOT.parent / "paper" / "tables"

# Capital Bikeshare public S3
BIKESHARE_URL = "https://s3.amazonaws.com/capitalbikeshare-data/{ym}-capitalbikeshare-tripdata.zip"

# NOAA Local Climatological Data, Reagan National (DCA), WBAN 13743
LCD_STATION = "72405013743"
LCD_URL = "https://www.ncei.noaa.gov/data/local-climatological-data/access/{year}/{station}.csv"

# EPA AirData
EPA_HOURLY_PM25_URL = "https://aqs.epa.gov/aqsweb/airdata/hourly_88101_{year}.zip"
EPA_DAILY_AQI_URL = "https://aqs.epa.gov/aqsweb/airdata/daily_aqi_by_county_{year}.zip"
DC_STATE_CODE = "11"
DC_COUNTY_CODE = "001"

LOCAL_TZ = "America/New_York"

# Suppression label
EXPECTED_FLOOR = 20          # min typical rides to call an hour "plausibly active"
SUPPRESSION_RATIO = 0.5      # observed below half of expected -> suppressed
SENSITIVITY_RATIOS = (0.4, 0.5, 0.6)

# Temporal back-testing
TRAIN_YEARS = (2022, 2023)
TEST_YEAR = 2024

# EPA PM2.5 -> AQI breakpoints (24h standard, ug/m3), 2024 revision
PM25_BREAKPOINTS = (
    (0.0, 9.0, 0, 50),
    (9.1, 35.4, 51, 100),
    (35.5, 55.4, 101, 150),
    (55.5, 125.4, 151, 200),
    (125.5, 225.4, 201, 300),
    (225.5, 325.4, 301, 500),
)


def ym_list():
    return [f"{y}{m:02d}" for y in YEARS for m in range(1, 13)]
