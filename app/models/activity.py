from sqlalchemy import Column, Integer, String, Float, DateTime
from sqlalchemy.sql import func
from app.database import Base


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
    raw_data = Column(String, nullable=True)  # full JSON from Garmin API
    synced_at = Column(DateTime, server_default=func.now())
