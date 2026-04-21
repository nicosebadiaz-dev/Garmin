from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta
from typing import Optional

from sqlalchemy.orm import Session

from app.models.activity import Activity
from app.models.wellness import WellnessDaily

# ── Race calendar ─────────────────────────────────────────────────────────────
RACE_HALF_MARATHON = date(2026, 5, 10)   # Montevideo
RACE_703           = date(2026, 10, 11)  # Punta del Este (aprox domingo)

# ── Data classes ──────────────────────────────────────────────────────────────

@dataclass
class WorkoutSuggestion:
    title: str
    description: str
    duration_min: int
    zones: str
    notes: str = ""


@dataclass
class CoachAnalysis:
    readiness_score: int
    readiness_label: str
    readiness_color: str
    phase: str
    phase_label: str
    days_to_race: int
    race_name: str
    recommendation: str          # FUERTE | SUAVE | DESCANSO
    workout: Optional[WorkoutSuggestion]
    alerts: list[str] = field(default_factory=list)
    insights: list[str] = field(default_factory=list)


# ── Training phase logic ───────────────────────────────────────────────────────

def _get_phase() -> tuple[str, str, int, str]:
    """(phase_code, phase_label, days_to_next_race, race_name)"""
    today = date.today()
    d_hm  = (RACE_HALF_MARATHON - today).days
    d_703 = (RACE_703 - today).days

    if 0 < d_hm <= 7:
        return "RACE_WEEK_HM",  "Semana de carrera 🏁",        d_hm,  "Media Maratón Montevideo"
    if 7 < d_hm <= 21:
        return "TAPER_HM",      f"Taper — {d_hm} días",        d_hm,  "Media Maratón Montevideo"
    if 21 < d_hm <= 84:
        return "BUILD_HM",      f"Preparación — {d_hm} días",  d_hm,  "Media Maratón Montevideo"
    if d_hm <= 0 and d_703 > 0:
        if d_703 <= 7:
            return "RACE_WEEK_703", "Semana de carrera 🏁",     d_703, "70.3 Punta del Este"
        if d_703 <= 21:
            return "TAPER_703",  f"Taper 70.3 — {d_703} días", d_703, "70.3 Punta del Este"
        if d_703 <= 70:
            return "PEAK_703",   f"Pico de carga — {d_703} días", d_703, "70.3 Punta del Este"
        if d_703 <= 140:
            return "BUILD_703",  f"Construcción — {d_703} días", d_703, "70.3 Punta del Este"
        return "BASE_703",       f"Base — {d_703} días",        d_703, "70.3 Punta del Este"
    return "RECOVERY", "Post-temporada — recuperación", 0, ""


# ── Workout library ───────────────────────────────────────────────────────────

_WS = WorkoutSuggestion  # alias


def _workouts_taper_hm() -> dict[int, WorkoutSuggestion]:
    return {
        0: _WS("Recuperación activa", "Natación 35 min técnica suave o movilidad. Sin impacto.", 35, "Z1",
                "Lunes = recuperación. Nada de carrera."),
        1: _WS("Carrera Z2 controlada", "45 min Z2 estricta. Salida lenta, primer km conversacional.",
                45, "Z2", "Si la FC supera Z2 en los primeros 2 km → caminá hasta bajar."),
        2: _WS("Ciclismo suave + natación", "45 min Rouvy Z2 + 20 min natación (técnica de brazada).",
                65, "Z1-Z2", "Postura en bici: core activo, lumbar no redondeada."),
        3: _WS("Carrera de ritmo", "15' entrada Z2 + 20' al ritmo objetivo de carrera + 10' vuelta calma.",
                45, "Z2/Z3", "Único día de intensidad en el taper. Nada más."),
        4: _WS("Descanso o nado muy suave", "Si nadás: 30 min técnica solamente. Si no, descansá.",
                30, "Z1", ""),
        5: _WS("Brick corto", "30 min bici Z2 + 10 min carrera a ritmo objetivo. Practicar transición.",
                45, "Z2/Z3", "Última sesión de calidad antes de la carrera."),
        6: _WS("Tirada larga suave", "70 min Z2 máximo. No más.",
                70, "Z2", "Última tirada larga del taper — guardá energía."),
    }


def _workouts_race_week_hm() -> dict[int, WorkoutSuggestion]:
    return {
        0: _WS("Activación suave", "20 min trote muy suave + movilidad.", 25, "Z1", ""),
        1: _WS("Activación con progresivos", "25 min Z2 + 4×100m a ritmo de carrera al final.", 30, "Z2", ""),
        2: _WS("Nado técnico corto", "20 min técnica. Sin esfuerzo.", 20, "Z1", ""),
        3: _WS("Activación final", "15 min muy suave + 4×30 seg progresivos.", 20, "Z1/Z2",
                "Preparar ropa, zapatillas y nutrición para el domingo."),
        4: _WS("Descanso total", "Hidratación, carga de carbohidratos, check de equipamiento.", 0, "", ""),
        5: _WS("Descanso total", "Dormir temprano. Último repaso del protocolo Nutremax.", 0, "",
                "Sport Fuel 320 Hidrogel + Hydro Max + gel cafeína segunda mitad."),
        6: _WS("🏁 MEDIA MARATÓN MONTEVIDEO", "¡Hoy es el día! Protocolo nutricional completo.", 0, "",
                "Salida controlada primeros 3 km — el ritmo se gana en la segunda mitad."),
    }


def _workouts_base_703() -> dict[int, WorkoutSuggestion]:
    return {
        0: _WS("Recuperación activa", "Natación técnica 40 min.", 40, "Z1-Z2", ""),
        1: _WS("Carrera Z2", "60 min Z2 estricta. Cadencia 170+ pasos/min.", 60, "Z2", ""),
        2: _WS("Ciclismo + natación", "75 min Rouvy Z2 + 30 min natación resistencia.", 105, "Z2", ""),
        3: _WS("Carrera progresiva", "20' Z2 + 20' Z3 + 10' Z2 vuelta calma.", 50, "Z2-Z3", ""),
        4: _WS("Natación resistencia", "1500m: 3×500m con 30 seg descanso.", 45, "Z2-Z3", ""),
        5: _WS("Ride largo", "2.5-3h Rouvy Z2. Testear nutrición on-bike.", 150, "Z2",
                "Practicar el protocolo nutricional para el 70.3."),
        6: _WS("Tirada larga", "90-100 min Z2 puro.", 90, "Z2", ""),
    }


def _get_workout(phase: str, weekday: int) -> Optional[WorkoutSuggestion]:
    mapping = {
        "TAPER_HM":     _workouts_taper_hm(),
        "BUILD_HM":     _workouts_taper_hm(),   # same structure, higher volume
        "RACE_WEEK_HM": _workouts_race_week_hm(),
        "BASE_703":     _workouts_base_703(),
        "BUILD_703":    _workouts_base_703(),
    }
    return mapping.get(phase, _workouts_base_703()).get(weekday)


# ── Readiness scoring ─────────────────────────────────────────────────────────

def _avg(values: list) -> float | None:
    clean = [v for v in values if v is not None]
    return sum(clean) / len(clean) if clean else None


def analyze(db: Session) -> CoachAnalysis:
    today = date.today()
    phase, phase_label, days_to_race, race_name = _get_phase()

    w_today = db.query(WellnessDaily).filter(WellnessDaily.date == today).first()

    week_ago = today - timedelta(days=6)
    recent_wellness: list[WellnessDaily] = (
        db.query(WellnessDaily)
        .filter(WellnessDaily.date >= week_ago)
        .order_by(WellnessDaily.date)
        .all()
    )

    recent_activities: list[Activity] = (
        db.query(Activity)
        .filter(Activity.start_time >= datetime.combine(week_ago, time.min))
        .all()
    )

    score = 100
    alerts: list[str] = []
    insights: list[str] = []

    if not w_today:
        score = 50
        insights.append("Sin datos de hoy — sincronizá para análisis completo")
    else:
        w = w_today

        # ── HRV ────────────────────────────────────────────────────────────
        hrv_list = [x.hrv_last_night for x in recent_wellness if x.hrv_last_night]
        if w.hrv_last_night and len(hrv_list) >= 3:
            avg_hrv = _avg(hrv_list[:-1]) or _avg(hrv_list)  # exclude today for trend
            if avg_hrv:
                ratio = w.hrv_last_night / avg_hrv
                if ratio < 0.80:
                    score -= 30
                    alerts.append(f"🚨 HRV muy bajo ({int(w.hrv_last_night)} vs promedio {int(avg_hrv)}) — fatiga importante")
                elif ratio < 0.90:
                    score -= 15
                    alerts.append(f"⚠️ HRV bajo ({int(w.hrv_last_night)} vs promedio {int(avg_hrv)}) — recuperación incompleta")
                elif ratio > 1.10:
                    insights.append(f"✅ HRV elevado ({int(w.hrv_last_night)}) — buena supercompensación")
                else:
                    insights.append(f"HRV normal ({int(w.hrv_last_night)} ms)")

        # ── Sleep ───────────────────────────────────────────────────────────
        if w.sleep_duration_seconds:
            h = w.sleep_duration_seconds / 3600
            if h < 5.5:
                score -= 30
                alerts.append(f"🚨 Solo {h:.1f}h de sueño — recuperación muy comprometida")
            elif h < 6.5:
                score -= 18
                alerts.append(f"⚠️ {h:.1f}h de sueño — por debajo del óptimo para recuperación")
            elif h >= 8:
                insights.append(f"✅ {h:.1f}h de sueño — excelente")
            else:
                insights.append(f"✅ {h:.1f}h de sueño")
        if w.sleep_score:
            if w.sleep_score < 55:
                score -= 15
                alerts.append(f"⚠️ Calidad de sueño baja ({w.sleep_score}/100)")
            elif w.sleep_score >= 75:
                insights.append(f"✅ Calidad de sueño: {w.sleep_score}/100")

        # ── Resting HR ──────────────────────────────────────────────────────
        rhr_list = [x.resting_hr for x in recent_wellness if x.resting_hr]
        if w.resting_hr and len(rhr_list) >= 3:
            avg_rhr = _avg(rhr_list[:-1]) or _avg(rhr_list)
            if avg_rhr and w.resting_hr > avg_rhr * 1.07:
                score -= 15
                alerts.append(f"⚠️ FC reposo elevada ({w.resting_hr} vs promedio {int(avg_rhr)} bpm) — señal de estrés o enfermedad")

        # ── Stress ──────────────────────────────────────────────────────────
        if w.stress_avg:
            if w.stress_avg > 65:
                score -= 20
                alerts.append(f"⚠️ Estrés muy alto ({w.stress_avg}/100) — priorizar recuperación")
            elif w.stress_avg > 45:
                score -= 10
                insights.append(f"Estrés moderado ({w.stress_avg}/100) — monitoreá")

        # ── Consecutive training load ────────────────────────────────────────
        today_dt = datetime.combine(today, time.min)
        two_days_ago = today_dt - timedelta(days=2)
        hard_recent = sum(
            1 for a in recent_activities
            if a.start_time and a.start_time >= two_days_ago
            and a.activity_type in ("running", "cycling")
        )
        if hard_recent >= 3:
            score -= 15
            alerts.append("⚠️ 3+ sesiones de impacto en 48h — considerar descanso activo")

        # ── SpO2 ────────────────────────────────────────────────────────────
        if w.spo2_avg and w.spo2_avg < 93:
            score -= 10
            alerts.append(f"⚠️ SpO2 bajo ({w.spo2_avg:.0f}%) — revisá con médico si persiste")

        # ── Specific to Nico: running start pace alert ───────────────────────
        today_runs = [
            a for a in recent_activities
            if a.activity_type == "running"
            and a.start_time
            and a.start_time.date() == today
        ]
        if today_runs:
            insights.append("🏃 Recordá: salida lenta — primeros 2 km por debajo de tu umbral aeróbico")

    score = max(0, min(100, score))

    # ── Recommendation ────────────────────────────────────────────────────────
    if score >= 80:
        recommendation, readiness_label, readiness_color = "FUERTE",   "Listo para entrenar fuerte",      "#22c55e"
    elif score >= 65:
        recommendation, readiness_label, readiness_color = "SUAVE",    "Entrenamiento moderado",           "#84cc16"
    elif score >= 45:
        recommendation, readiness_label, readiness_color = "SUAVE",    "Solo trabajo suave hoy",           "#eab308"
    elif score >= 25:
        recommendation, readiness_label, readiness_color = "DESCANSO", "Descanso activo recomendado",      "#f97316"
    else:
        recommendation, readiness_label, readiness_color = "DESCANSO", "Día de recuperación total",        "#ef4444"

    workout = _get_workout(phase, today.weekday())
    if recommendation == "DESCANSO" and workout and workout.duration_min > 0:
        workout = _WS(
            "Descanso activo",
            "Caminata suave 20-30 min o movilidad. Nada más.",
            25, "Z1",
            "Los datos de hoy indican que tu cuerpo necesita recuperarse."
        )

    return CoachAnalysis(
        readiness_score=score,
        readiness_label=readiness_label,
        readiness_color=readiness_color,
        phase=phase,
        phase_label=phase_label,
        days_to_race=days_to_race,
        race_name=race_name,
        recommendation=recommendation,
        workout=workout,
        alerts=alerts,
        insights=insights,
    )
