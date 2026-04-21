from sqlalchemy import Column, Integer, String, Float, DateTime
from sqlalchemy.sql import func
from app.database import Base

_TYPE_MAP: dict[str, str] = {
    "running": "running", "trail_running": "running",
    "treadmill_running": "running", "virtual_run": "running",
    "cycling": "cycling", "road_biking": "cycling",
    "mountain_biking": "cycling", "indoor_cycling": "cycling",
    "virtual_ride": "cycling",
    "lap_swimming": "swimming", "open_water_swimming": "swimming",
}


def normalize_type(raw: str) -> str:
    key = raw.lower()
    if key in _TYPE_MAP:
        return _TYPE_MAP[key]
    for known in ("running", "cycling", "swimming"):
        if known in key:
            return known
    return "other"


class Activity(Base):
    __tablename__ = "activities"

    id = Column(Integer, primary_key=True, index=True)
    garmin_id = Column(String, unique=True, index=True, nullable=False)
    name = Column(String, default="")
    activity_type = Column(String, index=True, default="other")
    start_time = Column(DateTime, index=True, nullable=True)
    duration_seconds = Column(Float, nullable=True)
    distance_meters = Column(Float, nullable=True)
    calories = Column(Integer, nullable=True)
    average_hr = Column(Integer, nullable=True)
    max_hr = Column(Integer, nullable=True)
    average_speed = Column(Float, nullable=True)
    elevation_gain = Column(Float, nullable=True)
    raw_data = Column(String, nullable=True)
    synced_at = Column(DateTime, server_default=func.now())
