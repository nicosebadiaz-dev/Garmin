from datetime import date, datetime, time, timedelta
from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.activity import Activity
from app.models.wellness import WellnessDaily

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


class ActivityOut(BaseModel):
    id: int
    garmin_id: str
    name: str
    activity_type: str
    start_time: Optional[datetime]
    duration_seconds: Optional[float]
    distance_meters: Optional[float]
    calories: Optional[int]
    average_hr: Optional[int]
    max_hr: Optional[int]
    average_speed: Optional[float]
    elevation_gain: Optional[float]
    model_config = {"from_attributes": True}


class WellnessOut(BaseModel):
    date: date
    steps: Optional[int]
    steps_goal: Optional[int]
    calories_total: Optional[int]
    calories_active: Optional[int]
    resting_hr: Optional[int]
    sleep_duration_seconds: Optional[int]
    sleep_score: Optional[int]
    sleep_deep_seconds: Optional[int]
    sleep_light_seconds: Optional[int]
    sleep_rem_seconds: Optional[int]
    stress_avg: Optional[int]
    stress_max: Optional[int]
    hrv_weekly_avg: Optional[float]
    hrv_last_night: Optional[float]
    weight_kg: Optional[float]
    body_fat_pct: Optional[float]
    spo2_avg: Optional[float]
    respiration_avg: Optional[float]
    hydration_ml: Optional[int]
    hydration_goal_ml: Optional[int]
    body_battery_high: Optional[int]
    body_battery_low: Optional[int]
    model_config = {"from_attributes": True}


@router.get("/today", response_model=WellnessOut)
def today_wellness(db: Session = Depends(get_db)):
    today = date.today()
    row = db.query(WellnessDaily).filter(WellnessDaily.date == today).first()
    if not row:
        return WellnessOut(date=today)
    return row


@router.get("/wellness", response_model=list[WellnessOut])
def wellness_history(days: int = 14, db: Session = Depends(get_db)):
    since = date.today() - timedelta(days=days - 1)
    rows = (
        db.query(WellnessDaily)
        .filter(WellnessDaily.date >= since)
        .order_by(WellnessDaily.date)
        .all()
    )
    return rows


@router.get("/activities", response_model=list[ActivityOut])
def recent_activities(
    limit: int = 20,
    activity_type: Optional[str] = None,
    db: Session = Depends(get_db),
):
    q = db.query(Activity)
    if activity_type:
        q = q.filter(Activity.activity_type == activity_type.lower())
    return q.order_by(Activity.start_time.desc()).limit(limit).all()


@router.get("/weekly-volume")
def weekly_volume(weeks: int = 8, db: Session = Depends(get_db)):
    """Returns per-week distance totals grouped by sport (for charts)."""
    since = date.today() - timedelta(weeks=weeks)
    activities = (
        db.query(Activity)
        .filter(
            Activity.start_time >= datetime.combine(since, time.min),
            Activity.activity_type.in_(["running", "cycling", "swimming"]),
        )
        .all()
    )

    weeks_data: dict[str, dict] = {}
    for a in activities:
        if not a.start_time:
            continue
        # ISO week label e.g. "2026-W16"
        week_label = a.start_time.strftime("%Y-W%W")
        if week_label not in weeks_data:
            weeks_data[week_label] = {"week": week_label, "running": 0.0, "cycling": 0.0, "swimming": 0.0}
        if a.distance_meters:
            weeks_data[week_label][a.activity_type] += round(a.distance_meters / 1000, 2)

    return sorted(weeks_data.values(), key=lambda x: x["week"])
