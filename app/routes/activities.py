from datetime import date, datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.activity import Activity
from app.services.sync_service import sync_service

router = APIRouter(prefix="/activities", tags=["activities"])

VALID_TYPES = {"running", "cycling", "swimming", "other"}


class ActivityResponse(BaseModel):
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
    synced_at: Optional[datetime]

    model_config = {"from_attributes": True}


class SyncStatusResponse(BaseModel):
    is_syncing: bool
    last_sync: Optional[datetime]
    last_error: Optional[str]


class SyncResult(BaseModel):
    status: str
    synced: Optional[int] = None
    skipped: Optional[int] = None
    errors: Optional[int] = None
    error: Optional[str] = None
    reason: Optional[str] = None


@router.get("/", response_model=list[ActivityResponse])
def list_activities(
    activity_type: Optional[str] = Query(
        None, description="Filter by type: running, cycling, swimming, other"
    ),
    date_from: Optional[date] = Query(None, description="Start date inclusive (YYYY-MM-DD)"),
    date_to: Optional[date] = Query(None, description="End date inclusive (YYYY-MM-DD)"),
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    if activity_type and activity_type.lower() not in VALID_TYPES:
        raise HTTPException(
            status_code=422,
            detail=f"Invalid activity_type. Valid values: {sorted(VALID_TYPES)}",
        )

    q = db.query(Activity)

    if activity_type:
        q = q.filter(Activity.activity_type == activity_type.lower())
    if date_from:
        q = q.filter(Activity.start_time >= datetime.combine(date_from, datetime.min.time()))
    if date_to:
        q = q.filter(Activity.start_time <= datetime.combine(date_to, datetime.max.time()))

    return q.order_by(Activity.start_time.desc()).offset(offset).limit(limit).all()


@router.get("/sync/status", response_model=SyncStatusResponse)
def get_sync_status():
    return SyncStatusResponse(
        is_syncing=sync_service.is_syncing,
        last_sync=sync_service.last_sync,
        last_error=sync_service.last_error,
    )


@router.post("/sync", response_model=SyncResult)
def force_sync():
    if sync_service.is_syncing:
        raise HTTPException(status_code=409, detail="Sync already in progress")
    result = sync_service.sync_activities()
    return result


@router.get("/{activity_id}", response_model=ActivityResponse)
def get_activity(activity_id: int, db: Session = Depends(get_db)):
    activity = db.query(Activity).filter(Activity.id == activity_id).first()
    if not activity:
        raise HTTPException(status_code=404, detail="Activity not found")
    return activity
