import asyncio
import json
import logging
from datetime import date, datetime, timedelta
from typing import AsyncGenerator

from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models.activity import Activity, normalize_type
from app.models.wellness import WellnessDaily
from app.services.garmin_service import garmin_service

logger = logging.getLogger(__name__)

# Global state visible to all clients
sync_state = {
    "running": False,
    "last_sync": None,   # ISO string
    "last_error": None,
}


def _ev(kind: str, message: str, progress: int = 0, **extra) -> str:
    return "data: " + json.dumps({"type": kind, "message": message, "progress": progress, **extra}) + "\n\n"


# ── Persistence helpers ────────────────────────────────────────────────────────

def _upsert_wellness(db: Session, day: date, **fields) -> None:
    row = db.query(WellnessDaily).filter(WellnessDaily.date == day).first()
    if row is None:
        row = WellnessDaily(date=day)
        db.add(row)
    for k, v in fields.items():
        if v is not None:
            setattr(row, k, v)


def _extract_stats(data: dict) -> dict:
    return {
        "steps": data.get("totalSteps"),
        "steps_goal": data.get("dailyStepGoal"),
        "calories_total": data.get("totalKilocalories") or data.get("totalCalories"),
        "calories_active": data.get("activeKilocalories") or data.get("activeCalories"),
        "calories_bmr": data.get("bmrKilocalories") or data.get("bmrCalories"),
        "distance_meters": data.get("totalDistanceMeters"),
        "floors_ascended": data.get("floorsAscended"),
        "active_seconds": data.get("activeSeconds"),
        "resting_hr": data.get("restingHeartRate"),
        "max_hr": data.get("maxHeartRate"),
        "min_hr": data.get("minHeartRate"),
        "stress_avg": data.get("averageStressLevel"),
        "stress_max": data.get("maxStressLevel"),
        "stress_rest_seconds": data.get("restStressDuration"),
        "body_battery_high": data.get("bodyBatteryHighestValue"),
        "body_battery_low": data.get("bodyBatteryLowestValue"),
    }


def _extract_sleep(data: dict) -> dict:
    dto = data.get("dailySleepDTO") or data
    scores = dto.get("sleepScores") or {}
    overall = scores.get("overall") or {}
    return {
        "sleep_duration_seconds": dto.get("sleepTimeSeconds"),
        "sleep_score": overall.get("value") if isinstance(overall, dict) else overall,
        "sleep_deep_seconds": dto.get("deepSleepSeconds"),
        "sleep_light_seconds": dto.get("lightSleepSeconds"),
        "sleep_rem_seconds": dto.get("remSleepSeconds"),
        "sleep_awake_seconds": dto.get("awakeSleepSeconds"),
    }


def _extract_hrv(data: dict) -> dict:
    summary = data.get("hrvSummary") or data.get("hrv") or data
    return {
        "hrv_weekly_avg": summary.get("weeklyAvg") or summary.get("weekly_avg"),
        "hrv_last_night": summary.get("lastNight") or summary.get("last_night"),
    }


def _extract_spo2(data: dict) -> dict:
    return {
        "spo2_avg": data.get("averageSpO2") or data.get("avgSpo2"),
        "spo2_min": data.get("lowestSpO2") or data.get("minSpo2"),
    }


def _extract_respiration(data: dict) -> dict:
    return {
        "respiration_avg": data.get("avgWakingRespirationValue") or data.get("averageRespirationValue"),
        "respiration_min": data.get("lowestRespirationValue"),
        "respiration_max": data.get("highestRespirationValue"),
    }


def _extract_hydration(data: dict) -> dict:
    return {
        "hydration_ml": data.get("valueInML") or data.get("totalIntakeInML"),
        "hydration_goal_ml": data.get("goalInML"),
    }


def _save_wellness_day(day: date, is_today: bool) -> dict:
    date_str = day.isoformat()
    fields: dict = {}

    stats = garmin_service.get_stats(date_str)
    if stats:
        fields.update(_extract_stats(stats))

    sleep = garmin_service.get_sleep_data(date_str)
    if sleep:
        fields.update(_extract_sleep(sleep))

    hrv = garmin_service.get_hrv_data(date_str)
    if hrv:
        fields.update(_extract_hrv(hrv))

    if is_today:
        spo2 = garmin_service.get_spo2_data(date_str)
        if spo2:
            fields.update(_extract_spo2(spo2))

        resp = garmin_service.get_respiration_data(date_str)
        if resp:
            fields.update(_extract_respiration(resp))

        hydra = garmin_service.get_hydration_data(date_str)
        if hydra:
            fields.update(_extract_hydration(hydra))

    db: Session = SessionLocal()
    try:
        _upsert_wellness(db, day, **fields)
        db.commit()
    finally:
        db.close()

    return fields


def _save_activities(raw_list: list) -> int:
    db: Session = SessionLocal()
    new_count = 0
    try:
        for item in raw_list:
            garmin_id = str(item.get("activityId", ""))
            if not garmin_id:
                continue
            if db.query(Activity).filter_by(garmin_id=garmin_id).first():
                continue

            type_info = item.get("activityType", {})
            type_key = (
                type_info.get("typeKey", "other")
                if isinstance(type_info, dict)
                else str(type_info)
            )

            start_time: datetime | None = None
            raw_ts = item.get("startTimeLocal")
            if raw_ts:
                try:
                    start_time = datetime.fromisoformat(raw_ts)
                except (ValueError, TypeError):
                    pass

            db.add(Activity(
                garmin_id=garmin_id,
                name=item.get("activityName", ""),
                activity_type=normalize_type(type_key),
                start_time=start_time,
                duration_seconds=item.get("duration"),
                distance_meters=item.get("distance"),
                calories=item.get("calories"),
                average_hr=item.get("averageHR"),
                max_hr=item.get("maxHR"),
                average_speed=item.get("averageSpeed"),
                elevation_gain=item.get("elevationGain"),
                raw_data=json.dumps(item),
            ))
            new_count += 1
        db.commit()
    finally:
        db.close()
    return new_count


def _save_body_composition(data: dict) -> None:
    entries = data.get("dateWeightList") or []
    db: Session = SessionLocal()
    try:
        for entry in entries:
            raw_date = entry.get("calendarDate")
            if not raw_date:
                continue
            try:
                d = date.fromisoformat(raw_date)
            except ValueError:
                continue
            _upsert_wellness(db, d,
                weight_kg=entry.get("weight") and entry["weight"] / 1000,  # grams → kg
                body_fat_pct=entry.get("bodyFat"),
                bmi=entry.get("bmi"),
            )
        db.commit()
    finally:
        db.close()


# ── Main async generator for SSE ──────────────────────────────────────────────

async def full_sync() -> AsyncGenerator[str, None]:
    if sync_state["running"]:
        yield _ev("skipped", "Sync ya en progreso", 0)
        return

    sync_state["running"] = True
    sync_state["last_error"] = None

    try:
        yield _ev("start", "Conectando a Garmin Connect...", 2)
        try:
            await asyncio.to_thread(garmin_service.login)
        except Exception as exc:
            sync_state["last_error"] = str(exc)
            yield _ev("error", f"Error de conexión: {exc}", 0)
            return
        yield _ev("progress", "Conexión exitosa ✓", 5)

        # Activities
        yield _ev("progress", "Descargando actividades...", 8)
        try:
            activities = await asyncio.to_thread(garmin_service.get_activities, 0, 100)
            new_acts = await asyncio.to_thread(_save_activities, activities)
            yield _ev("progress", f"Actividades: {new_acts} nuevas de {len(activities)} ✓", 20)
        except Exception as exc:
            yield _ev("warning", f"Actividades: error parcial — {exc}", 20)

        # Wellness — last 7 days (today first for fast dashboard refresh)
        today = date.today()
        days = [today - timedelta(days=i) for i in range(7)]

        for i, d in enumerate(days):
            pct = 22 + int(i / len(days) * 60)
            label = "Hoy" if d == today else d.strftime("%a %d %b")
            yield _ev("progress", f"Sincronizando {label}...", pct)
            try:
                await asyncio.to_thread(_save_wellness_day, d, d == today)
            except Exception as exc:
                logger.warning("Wellness sync error %s: %s", d, exc)

        yield _ev("progress", "Composición corporal...", 85)
        try:
            start_30 = (today - timedelta(days=30)).isoformat()
            body = await asyncio.to_thread(
                garmin_service.get_body_composition, start_30, today.isoformat()
            )
            if body:
                await asyncio.to_thread(_save_body_composition, body)
        except Exception as exc:
            logger.warning("Body composition sync error: %s", exc)

        sync_state["last_sync"] = datetime.utcnow().isoformat()
        yield _ev("done", "Sincronización completa ✓", 100)

    finally:
        sync_state["running"] = False
