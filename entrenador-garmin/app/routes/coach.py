from dataclasses import asdict
from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.services import coach_service

router = APIRouter(prefix="/api/coach", tags=["coach"])


class WorkoutOut(BaseModel):
    title: str
    description: str
    duration_min: int
    zones: str
    notes: str


class CoachOut(BaseModel):
    readiness_score: int
    readiness_label: str
    readiness_color: str
    phase: str
    phase_label: str
    days_to_race: int
    race_name: str
    recommendation: str
    workout: Optional[WorkoutOut]
    alerts: list[str]
    insights: list[str]


@router.get("/analysis", response_model=CoachOut)
def get_analysis(db: Session = Depends(get_db)):
    result = coach_service.analyze(db)
    return CoachOut(
        readiness_score=result.readiness_score,
        readiness_label=result.readiness_label,
        readiness_color=result.readiness_color,
        phase=result.phase,
        phase_label=result.phase_label,
        days_to_race=result.days_to_race,
        race_name=result.race_name,
        recommendation=result.recommendation,
        workout=WorkoutOut(**asdict(result.workout)) if result.workout else None,
        alerts=result.alerts,
        insights=result.insights,
    )
