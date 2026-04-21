/* ── Entrenador Garmin — app.js ─────────────────────────────────────────── */

const BASE = '';   // same-origin

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmt(val, fallback = '—') {
  return (val == null || val === '') ? fallback : val;
}

function fmtNum(val, decimals = 0, fallback = '—') {
  if (val == null) return fallback;
  return Number(val).toFixed(decimals);
}

function secToHhmm(sec) {
  if (!sec) return '—';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function secToHours(sec) {
  if (!sec) return '—';
  return (sec / 3600).toFixed(1) + 'h';
}

function fmtDist(m) {
  if (!m) return '—';
  return (m / 1000).toFixed(1) + ' km';
}

function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('es-UY', { weekday: 'short', day: 'numeric', month: 'short' });
}

function clamp(v, min, max) { return Math.min(max, Math.max(min, v)); }

const TYPE_ICON = { running: '🏃', cycling: '🚴', swimming: '🏊', other: '⚡' };

// ── Tab navigation ────────────────────────────────────────────────────────────

const tabLoaded = { today: false, activities: false, coach: false, sync: true };

document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const tab = btn.dataset.tab;
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('tab-' + tab).classList.add('active');

    if (tab === 'today'      && !tabLoaded.today)      { loadToday(); tabLoaded.today = true; }
    if (tab === 'activities' && !tabLoaded.activities) { loadActivities(); tabLoaded.activities = true; }
    if (tab === 'coach'      && !tabLoaded.coach)      { loadCoach(); tabLoaded.coach = true; }
  });
});

// Header date
const _now = new Date();
document.getElementById('header-date').textContent =
  _now.toLocaleDateString('es-UY', { weekday: 'short', day: 'numeric', month: 'short' });

// ── API fetches ───────────────────────────────────────────────────────────────

async function apiFetch(url) {
  try {
    const res = await fetch(BASE + url);
    if (!res.ok) throw new Error(res.statusText);
    return await res.json();
  } catch (e) {
    console.warn('API error:', url, e);
    return null;
  }
}

// ── TAB: HOY ──────────────────────────────────────────────────────────────────

let hrvChartToday = null;

async function loadToday() {
  const [today, wellness] = await Promise.all([
    apiFetch('/api/dashboard/today'),
    apiFetch('/api/dashboard/wellness?days=7'),
  ]);

  if (!today) return;

  // Quick stats
  setText('qs-steps',  today.steps ? (today.steps / 1000).toFixed(1) + 'k' : '—');
  setText('qs-sleep',  today.sleep_duration_seconds ? secToHours(today.sleep_duration_seconds) : '—');
  setText('qs-hrv',    fmtNum(today.hrv_last_night, 0));
  setText('qs-stress', fmtNum(today.stress_avg, 0));

  // Sleep card
  setText('sleep-hours', secToHours(today.sleep_duration_seconds));
  setText('sleep-score', fmtNum(today.sleep_score, 0));
  updateSleepStages(today);

  // HRV
  setText('hrv-val',    fmtNum(today.hrv_last_night, 0));
  setText('hrv-weekly', fmtNum(today.hrv_weekly_avg, 0));

  // FC reposo
  setText('rhr-val', fmtNum(today.resting_hr, 0));

  // Estrés
  setText('stress-val', fmtNum(today.stress_avg, 0));
  setText('stress-max', fmtNum(today.stress_max, 0));

  // Body battery
  setText('bb-high', fmtNum(today.body_battery_high, 0));
  setText('bb-low',  fmtNum(today.body_battery_low, 0));

  // Pasos
  setText('steps-val', today.steps ? today.steps.toLocaleString('es') : '—');
  if (today.steps && today.steps_goal) {
    const pct = clamp((today.steps / today.steps_goal) * 100, 0, 100);
    setText('steps-goal-sub', `Meta: ${today.steps_goal.toLocaleString('es')}`);
    setStyle('steps-bar', 'width', pct + '%');
  }

  // Calorías
  setText('cal-val',    fmtNum(today.calories_total, 0));
  setText('cal-active', fmtNum(today.calories_active, 0));

  // SpO2
  setText('spo2-val', fmtNum(today.spo2_avg, 1));
  setText('spo2-min', fmtNum(today.spo2_min, 1));

  // Respiración
  setText('resp-val', fmtNum(today.respiration_avg, 1));
  if (today.respiration_min && today.respiration_max) {
    setText('resp-range', `${fmtNum(today.respiration_min,1)}–${fmtNum(today.respiration_max,1)}`);
  }

  // Hidratación
  setText('hydra-val', fmtNum(today.hydration_ml, 0));
  setText('hydra-goal', fmtNum(today.hydration_goal_ml, 0));
  if (today.hydration_ml && today.hydration_goal_ml) {
    const pct = clamp((today.hydration_ml / today.hydration_goal_ml) * 100, 0, 100);
    setStyle('hydra-bar', 'width', pct + '%');
  }

  // Peso
  setText('weight-val', fmtNum(today.weight_kg, 1));
  setText('fat-val',    fmtNum(today.body_fat_pct, 1));

  // Pisos
  setText('floors-val', fmtNum(today.floors_ascended, 0));

  // HRV chart
  if (wellness && wellness.length) renderHrvChart('hrv-chart', wellness, hrvChartToday, c => { hrvChartToday = c; });
}

function updateSleepStages(w) {
  const total = (w.sleep_duration_seconds || 0) + (w.sleep_awake_seconds || 0);
  if (!total) return;
  const pct = s => ((s || 0) / total * 100).toFixed(1) + '%';
  setStyle('st-deep',  'width', pct(w.sleep_deep_seconds));
  setStyle('st-light', 'width', pct(w.sleep_light_seconds));
  setStyle('st-rem',   'width', pct(w.sleep_rem_seconds));
  setStyle('st-awake', 'width', pct(w.sleep_awake_seconds));
}

// ── TAB: ACTIVIDADES ──────────────────────────────────────────────────────────

let volumeChart = null;

async function loadActivities() {
  const [acts, volume] = await Promise.all([
    apiFetch('/api/dashboard/activities?limit=25'),
    apiFetch('/api/dashboard/weekly-volume?weeks=8'),
  ]);

  if (acts) renderActivityList(acts);
  if (volume) renderVolumeChart(volume);
}

function renderActivityList(acts) {
  const el = document.getElementById('activity-list');
  if (!acts.length) {
    el.innerHTML = `<div class="empty-state"><span class="es-icon">🏃</span>Sin actividades. Sincronizá primero.</div>`;
    return;
  }
  el.innerHTML = acts.map(a => {
    const icon  = TYPE_ICON[a.activity_type] || '⚡';
    const cls   = 'act-' + a.activity_type;
    const dist  = a.distance_meters ? fmtDist(a.distance_meters) : '';
    const dur   = a.duration_seconds ? secToHhmm(a.duration_seconds) : '';
    const meta  = [fmtDate(a.start_time), a.average_hr ? `${a.average_hr} bpm` : ''].filter(Boolean).join(' · ');
    return `
    <div class="activity-item">
      <div class="act-type-icon ${cls}">${icon}</div>
      <div class="act-info">
        <div class="act-name">${a.name || 'Actividad'}</div>
        <div class="act-meta">${meta}</div>
      </div>
      <div class="act-stats">
        <div class="act-dist">${dist}</div>
        <div class="act-time">${dur}</div>
      </div>
    </div>`;
  }).join('');
}

function renderVolumeChart(data) {
  const ctx = document.getElementById('volume-chart');
  if (!ctx) return;
  if (volumeChart) volumeChart.destroy();

  const labels   = data.map(d => d.week.replace(/\d{4}-W/, 'S'));
  const running  = data.map(d => d.running  || 0);
  const cycling  = data.map(d => d.cycling  || 0);
  const swimming = data.map(d => d.swimming || 0);

  volumeChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: '🏃 Carrera',   data: running,  backgroundColor: 'rgba(34,197,94,.7)',   borderRadius: 4 },
        { label: '🚴 Ciclismo',  data: cycling,  backgroundColor: 'rgba(56,189,248,.7)',  borderRadius: 4 },
        { label: '🏊 Natación',  data: swimming, backgroundColor: 'rgba(167,139,250,.7)', borderRadius: 4 },
      ],
    },
    options: chartOptions({ stacked: true, yLabel: 'km' }),
  });
}

// ── TAB: ENTRENADOR ───────────────────────────────────────────────────────────

let hrvChartCoach = null;

async function loadCoach() {
  const [analysis, wellness] = await Promise.all([
    apiFetch('/api/coach/analysis'),
    apiFetch('/api/dashboard/wellness?days=7'),
  ]);

  if (!analysis) return;

  // Phase chip
  setText('phase-chip', analysis.phase_label);

  // Readiness circle
  const score = analysis.readiness_score;
  const circumference = 2 * Math.PI * 42;  // r=42
  const arc = document.getElementById('readiness-arc');
  arc.setAttribute('stroke', analysis.readiness_color);
  arc.setAttribute('stroke-dasharray', `${(score / 100) * circumference} ${circumference}`);
  const numEl = document.getElementById('readiness-num');
  numEl.textContent = score;
  numEl.setAttribute('fill', analysis.readiness_color);

  setText('readiness-label', analysis.readiness_label);

  const badge = document.getElementById('rec-badge');
  badge.textContent = analysis.recommendation;
  badge.className   = 'rec-badge rec-' + analysis.recommendation;

  // Alerts
  const alertsEl = document.getElementById('coach-alerts');
  alertsEl.innerHTML = analysis.alerts.length
    ? analysis.alerts.map(a => `<div class="alert-item">${a}</div>`).join('')
    : '';

  // Insights
  const insightsEl = document.getElementById('coach-insights');
  insightsEl.innerHTML = analysis.insights.length
    ? analysis.insights.map(i => `<div class="insight-item">${i}</div>`).join('')
    : '';

  // Workout card
  const wrapEl = document.getElementById('workout-card-wrap');
  if (analysis.workout && analysis.workout.title) {
    const w = analysis.workout;
    const notesHtml = w.notes ? `<div class="wk-notes">💡 ${w.notes}</div>` : '';
    const durHtml   = w.duration_min > 0 ? `<span class="wk-pill">⏱ ${w.duration_min} min</span>` : '';
    const zoneHtml  = w.zones ? `<span class="wk-pill">📊 ${w.zones}</span>` : '';
    wrapEl.innerHTML = `
      <div class="section-title">Entrenamiento sugerido</div>
      <div class="workout-card">
        <div class="wk-title">${w.title}</div>
        <div class="wk-desc">${w.description}</div>
        <div class="wk-meta">${durHtml}${zoneHtml}</div>
        ${notesHtml}
      </div>`;
  } else {
    wrapEl.innerHTML = '';
  }

  // Race countdown
  if (analysis.days_to_race > 0) {
    setText('race-days',    `${analysis.days_to_race} días`);
    setText('race-name-lbl', analysis.race_name);
  }

  // HRV chart
  if (wellness) renderHrvChart('hrv-chart-coach', wellness, hrvChartCoach, c => { hrvChartCoach = c; });
}

// ── TAB: SYNC ─────────────────────────────────────────────────────────────────

const syncBtn        = document.getElementById('sync-btn');
const syncStatusText = document.getElementById('sync-status-text');
const syncBarWrap    = document.getElementById('sync-progress-bar-wrap');
const syncBarFill    = document.getElementById('sync-bar-fill');
const syncBarPct     = document.getElementById('sync-progress-pct');
const syncSteps      = document.getElementById('sync-steps');
const lastSyncInfo   = document.getElementById('last-sync-info');

syncBtn.addEventListener('click', startSync);

// Show last sync on tab open
apiFetch('/api/sync/status').then(s => {
  if (s && s.last_sync) showLastSync(s.last_sync);
});

function startSync() {
  if (syncBtn.disabled) return;

  syncBtn.disabled = true;
  syncBtn.classList.add('spinning');
  syncStatusText.textContent = 'Sincronizando...';
  syncBarWrap.classList.add('visible');
  syncSteps.innerHTML = '';
  setProgress(0);

  const es = new EventSource('/api/sync/stream');

  es.onmessage = (e) => {
    const data = JSON.parse(e.data);
    handleSyncEvent(data);

    if (data.type === 'done' || data.type === 'error') {
      es.close();
      syncBtn.disabled = false;
      syncBtn.classList.remove('spinning');
      syncStatusText.textContent = data.type === 'done' ? 'Sincronización completa ✓' : 'Error en sync';

      if (data.type === 'done') {
        showLastSync(new Date().toISOString());
        // Reload tabs so they pick up fresh data
        tabLoaded.today = false;
        tabLoaded.activities = false;
        tabLoaded.coach = false;
      }
    }
  };

  es.onerror = () => {
    es.close();
    syncBtn.disabled = false;
    syncBtn.classList.remove('spinning');
    syncStatusText.textContent = 'Error de conexión';
    addSyncStep('error', '❌', 'Conexión interrumpida');
  };
}

function handleSyncEvent(data) {
  setProgress(data.progress || 0);

  const iconMap = {
    start:    '⏳',
    progress: data.progress >= 100 ? '✅' : '🔄',
    done:     '✅',
    error:    '❌',
    warning:  '⚠️',
    skipped:  '⏭️',
  };
  const cls = {
    start:    'ss-active',
    progress: data.progress >= 100 ? 'ss-done' : 'ss-active',
    done:     'ss-done',
    error:    'ss-error',
    warning:  'ss-warn',
    skipped:  'ss-warn',
  };

  // Mark previous "active" steps as done
  syncSteps.querySelectorAll('.ss-active').forEach(el => {
    el.classList.remove('ss-active');
    el.classList.add('ss-done');
    el.querySelector('.ss-icon').textContent = '✅';
  });

  if (data.type !== 'done') {
    addSyncStep(cls[data.type] || 'ss-active', iconMap[data.type] || '🔄', data.message);
  }
}

function addSyncStep(cls, icon, message) {
  const el = document.createElement('div');
  el.className = `sync-step ${cls}`;
  el.innerHTML = `<span class="ss-icon">${icon}</span><span>${message}</span>`;
  syncSteps.appendChild(el);
  el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function setProgress(pct) {
  syncBarFill.style.width = pct + '%';
  syncBarPct.textContent  = pct + '%';
}

function showLastSync(isoStr) {
  const d = new Date(isoStr);
  lastSyncInfo.textContent = `Último sync: ${d.toLocaleString('es-UY', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' })}`;
}

// ── Chart helpers ─────────────────────────────────────────────────────────────

function renderHrvChart(canvasId, wellness, existingChart, setChart) {
  const ctx = document.getElementById(canvasId);
  if (!ctx) return;
  if (existingChart) existingChart.destroy();

  const labels = wellness.map(d => {
    const dt = new Date(d.date + 'T00:00:00');
    return dt.toLocaleDateString('es-UY', { weekday: 'short', day: 'numeric' });
  });
  const hrvData = wellness.map(d => d.hrv_last_night || null);

  const chart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'HRV',
        data: hrvData,
        borderColor: '#a78bfa',
        backgroundColor: 'rgba(167,139,250,.15)',
        tension: 0.35,
        fill: true,
        pointBackgroundColor: '#a78bfa',
        pointRadius: 4,
        spanGaps: true,
      }],
    },
    options: chartOptions({ yLabel: 'ms' }),
  });

  setChart(chart);
}

function chartOptions({ stacked = false, yLabel = '' } = {}) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { labels: { color: '#94a3b8', font: { size: 11 }, boxWidth: 12, padding: 10 } },
      tooltip: { backgroundColor: '#1e293b', titleColor: '#f1f5f9', bodyColor: '#94a3b8', borderColor: '#334155', borderWidth: 1 },
    },
    scales: {
      x: {
        stacked,
        ticks: { color: '#94a3b8', font: { size: 10 }, maxRotation: 0 },
        grid:  { color: 'rgba(51,65,85,.5)' },
      },
      y: {
        stacked,
        ticks: { color: '#94a3b8', font: { size: 10 } },
        grid:  { color: 'rgba(51,65,85,.5)' },
        title: { display: !!yLabel, text: yLabel, color: '#94a3b8', font: { size: 10 } },
      },
    },
  };
}

// ── DOM helpers ───────────────────────────────────────────────────────────────

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

function setStyle(id, prop, val) {
  const el = document.getElementById(id);
  if (el) el.style[prop] = val;
}

// ── Initial load (default tab = Hoy) ─────────────────────────────────────────
loadToday();
tabLoaded.today = true;
