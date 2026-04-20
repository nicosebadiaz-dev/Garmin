import json
import logging
from datetime import datetime
from typing import Any

from apscheduler.schedulers.background import BackgroundScheduler
from sqlalchemy.orm import Session

from app.config import settings
from app.database import SessionLocal
from app.models.activity import Activity
from app.services.garmin_service import garmin_service, normalize_activity_type

logger = logging.getLogger(__name__)


class SyncService:
    def __init__(self) -> None:
        self._scheduler = BackgroundScheduler(timezone="UTC")
        self.is_syncing = False
        self.last_sync: datetime | None = None
        self.last_error: str | None = None

    def start(self) -> None:
        self._scheduler.add_job(
            self.sync_activities,
            trigger="interval",
            minutes=settings.sync_interval_minutes,
            id="garmin_sync",
            replace_existing=True,
            next_run_time=datetime.utcnow(),  # run immediately on startup
        )
        self._scheduler.start()
        logger.info(
            "Sync scheduler started — interval: %d min", settings.sync_interval_minutes
        )

    def stop(self) -> None:
        self._scheduler.shutdown(wait=False)
        logger.info("Sync scheduler stopped")

    def sync_activities(self) -> dict[str, Any]:
        if self.is_syncing:
            logger.warning("Sync already in progress, skipping")
            return {"status": "skipped", "reason": "sync already in progress"}

        self.is_syncing = True
        synced = skipped = errors = 0

        try:
            logger.info("Starting Garmin sync...")
            raw_activities = garmin_service.fetch_activities(
                start=0, limit=settings.activities_per_sync
            )

            db: Session = SessionLocal()
            try:
                for item in raw_activities:
                    try:
                        garmin_id = str(item.get("activityId", ""))
                        if not garmin_id:
                            continue

                        if db.query(Activity).filter_by(garmin_id=garmin_id).first():
                            skipped += 1
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

                        db.add(
                            Activity(
                                garmin_id=garmin_id,
                                name=item.get("activityName", ""),
                                activity_type=normalize_activity_type(type_key),
                                start_time=start_time,
                                duration_seconds=item.get("duration"),
                                distance_meters=item.get("distance"),
                                calories=item.get("calories"),
                                average_hr=item.get("averageHR"),
                                max_hr=item.get("maxHR"),
                                average_speed=item.get("averageSpeed"),
                                elevation_gain=item.get("elevationGain"),
                                raw_data=json.dumps(item),
                            )
                        )
                        synced += 1

                    except Exception as exc:
                        errors += 1
                        logger.error(
                            "Error processing activity %s: %s",
                            item.get("activityId"),
                            exc,
                        )

                db.commit()
            finally:
                db.close()

            self.last_sync = datetime.utcnow()
            self.last_error = None
            logger.info(
                "Sync complete — synced: %d, skipped: %d, errors: %d",
                synced,
                skipped,
                errors,
            )
            return {"status": "success", "synced": synced, "skipped": skipped, "errors": errors}

        except Exception as exc:
            self.last_error = str(exc)
            logger.error("Sync failed: %s", exc)
            return {"status": "error", "error": str(exc)}
        finally:
            self.is_syncing = False


sync_service = SyncService()
