import logging
from garminconnect import (
    Garmin,
    GarminConnectConnectionError,
    GarminConnectTooManyRequestsError,
    GarminConnectAuthenticationError,
)
from tenacity import (
    retry,
    stop_after_attempt,
    wait_exponential,
    retry_if_exception_type,
    before_sleep_log,
)
from app.config import settings

logger = logging.getLogger(__name__)

# Maps Garmin typeKey values to normalized activity types
_TYPE_MAP: dict[str, str] = {
    "running": "running",
    "trail_running": "running",
    "treadmill_running": "running",
    "virtual_run": "running",
    "cycling": "cycling",
    "road_biking": "cycling",
    "mountain_biking": "cycling",
    "indoor_cycling": "cycling",
    "virtual_ride": "cycling",
    "lap_swimming": "swimming",
    "open_water_swimming": "swimming",
}


def normalize_activity_type(garmin_type: str) -> str:
    key = garmin_type.lower()
    if key in _TYPE_MAP:
        return _TYPE_MAP[key]
    for known in ("running", "cycling", "swimming"):
        if known in key:
            return known
    return "other"


class GarminService:
    def __init__(self) -> None:
        self._client: Garmin | None = None
        self._logged_in = False

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=4, max=30),
        retry=retry_if_exception_type((GarminConnectConnectionError, ConnectionError)),
        before_sleep=before_sleep_log(logger, logging.WARNING),
        reraise=True,
    )
    def login(self) -> None:
        logger.info("Logging into Garmin Connect...")
        self._client = Garmin(settings.garmin_email, settings.garmin_password)
        self._client.login()
        self._logged_in = True
        logger.info("Garmin Connect login successful")

    def _ensure_logged_in(self) -> None:
        if not self._logged_in or self._client is None:
            self.login()

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=4, max=30),
        retry=retry_if_exception_type(
            (GarminConnectConnectionError, GarminConnectTooManyRequestsError, ConnectionError)
        ),
        before_sleep=before_sleep_log(logger, logging.WARNING),
        reraise=True,
    )
    def fetch_activities(self, start: int = 0, limit: int = 100) -> list[dict]:
        self._ensure_logged_in()
        logger.info("Fetching %d activities from Garmin (offset=%d)...", limit, start)
        try:
            activities = self._client.get_activities(start, limit)  # type: ignore[union-attr]
            logger.info("Fetched %d activities", len(activities))
            return activities
        except GarminConnectAuthenticationError:
            logger.warning("Auth error — forcing re-login")
            self._logged_in = False
            raise GarminConnectConnectionError("re-login required")


garmin_service = GarminService()
