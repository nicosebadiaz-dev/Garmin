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

_RETRYABLE = (GarminConnectConnectionError, GarminConnectTooManyRequestsError, ConnectionError)
_RETRY = dict(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=5, max=30),
    retry=retry_if_exception_type(_RETRYABLE),
    before_sleep=before_sleep_log(logger, logging.WARNING),
    reraise=True,
)


class GarminService:
    def __init__(self) -> None:
        self._client: Garmin | None = None
        self._logged_in = False

    @retry(**_RETRY)
    def login(self) -> None:
        logger.info("Logging into Garmin Connect...")
        self._client = Garmin(settings.garmin_email, settings.garmin_password)
        self._client.login()
        self._logged_in = True
        logger.info("Garmin login successful")

    def _ensure(self) -> None:
        if not self._logged_in or self._client is None:
            self.login()

    def _call(self, method: str, *args, **kwargs):
        """Call a garminconnect method, re-login once on auth failure."""
        self._ensure()
        try:
            return getattr(self._client, method)(*args, **kwargs)
        except GarminConnectAuthenticationError:
            logger.warning("Auth expired — re-logging in")
            self._logged_in = False
            self.login()
            return getattr(self._client, method)(*args, **kwargs)
        except Exception as exc:
            logger.warning("garminconnect.%s failed: %s", method, exc)
            return None

    # ── Activities ─────────────────────────────────────────────────────────
    def get_activities(self, start: int = 0, limit: int = 100) -> list:
        return self._call("get_activities", start, limit) or []

    # ── Daily stats ─────────────────────────────────────────────────────────
    def get_stats(self, date_str: str) -> dict | None:
        return self._call("get_stats", date_str)

    def get_user_summary(self, date_str: str) -> dict | None:
        return self._call("get_user_summary", date_str)

    # ── Sleep ───────────────────────────────────────────────────────────────
    def get_sleep_data(self, date_str: str) -> dict | None:
        return self._call("get_sleep_data", date_str)

    # ── Stress ──────────────────────────────────────────────────────────────
    def get_stress_data(self, date_str: str) -> dict | None:
        return self._call("get_stress_data", date_str)

    # ── HRV ─────────────────────────────────────────────────────────────────
    def get_hrv_data(self, date_str: str) -> dict | None:
        return self._call("get_hrv_data", date_str)

    # ── Heart rate ──────────────────────────────────────────────────────────
    def get_rhr_day(self, date_str: str) -> dict | None:
        return self._call("get_rhr_day", date_str)

    def get_heart_rates(self, date_str: str) -> dict | None:
        return self._call("get_heart_rates", date_str)

    # ── SpO2 ────────────────────────────────────────────────────────────────
    def get_spo2_data(self, date_str: str) -> dict | None:
        return self._call("get_spo2_data", date_str)

    # ── Respiration ─────────────────────────────────────────────────────────
    def get_respiration_data(self, date_str: str) -> dict | None:
        return self._call("get_respiration_data", date_str)

    # ── Hydration ───────────────────────────────────────────────────────────
    def get_hydration_data(self, date_str: str) -> dict | None:
        return self._call("get_hydration_data", date_str)

    # ── Body composition ────────────────────────────────────────────────────
    def get_body_composition(self, start_date: str, end_date: str) -> dict | None:
        return self._call("get_body_composition", start_date, end_date)

    # ── Floors ──────────────────────────────────────────────────────────────
    def get_floors(self, date_str: str) -> dict | None:
        return self._call("get_floors", date_str)


garmin_service = GarminService()
