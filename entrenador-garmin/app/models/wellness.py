from sqlalchemy import Column, Integer, String, Float, Date, DateTime
from sqlalchemy.sql import func
from app.database import Base


class WellnessDaily(Base):
    __tablename__ = "wellness_daily"

    id = Column(Integer, primary_key=True, index=True)
    date = Column(Date, unique=True, index=True, nullable=False)

    # Steps & calories
    steps = Column(Integer, nullable=True)
    steps_goal = Column(Integer, nullable=True)
    calories_total = Column(Integer, nullable=True)
    calories_active = Column(Integer, nullable=True)
    calories_bmr = Column(Integer, nullable=True)
    distance_meters = Column(Float, nullable=True)
    floors_ascended = Column(Integer, nullable=True)
    active_seconds = Column(Integer, nullable=True)

    # Heart rate
    resting_hr = Column(Integer, nullable=True)
    max_hr = Column(Integer, nullable=True)
    min_hr = Column(Integer, nullable=True)

    # Body battery
    body_battery_high = Column(Integer, nullable=True)
    body_battery_low = Column(Integer, nullable=True)

    # Sleep
    sleep_duration_seconds = Column(Integer, nullable=True)
    sleep_score = Column(Integer, nullable=True)
    sleep_deep_seconds = Column(Integer, nullable=True)
    sleep_light_seconds = Column(Integer, nullable=True)
    sleep_rem_seconds = Column(Integer, nullable=True)
    sleep_awake_seconds = Column(Integer, nullable=True)

    # Stress
    stress_avg = Column(Integer, nullable=True)
    stress_max = Column(Integer, nullable=True)
    stress_rest_seconds = Column(Integer, nullable=True)

    # HRV
    hrv_weekly_avg = Column(Float, nullable=True)
    hrv_last_night = Column(Float, nullable=True)

    # Body composition
    weight_kg = Column(Float, nullable=True)
    body_fat_pct = Column(Float, nullable=True)
    bmi = Column(Float, nullable=True)

    # SpO2
    spo2_avg = Column(Float, nullable=True)
    spo2_min = Column(Float, nullable=True)

    # Respiration
    respiration_avg = Column(Float, nullable=True)
    respiration_min = Column(Float, nullable=True)
    respiration_max = Column(Float, nullable=True)

    # Hydration
    hydration_ml = Column(Integer, nullable=True)
    hydration_goal_ml = Column(Integer, nullable=True)

    synced_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
