// ================= MÁS ANÁLISIS =================
// ---------- Cargadores ----------
dash.loader('records_anio', {
  description: 'Mejores tiempos de carrera por año (1 km, 5 km, 10 km y media maratón), con nombre en español y distancia en metros.',
  fn: ({ answer }) => {
    if (!answer || answer.error) throw new Error((answer && (answer.error.message || answer.error)) || 'Strava no devolvió récords');
    const names = { Fastest1k: '1 km', Fastest5k: '5 km', Fastest10k: '10 km', FastestHalfMarathon: 'Media maratón' };
    const meters = { Fastest1k: 1000, Fastest5k: 5000, Fastest10k: 10000, FastestHalfMarathon: 21097.5 };
    return (answer.efforts || []).map((e) => ({ prueba: names[e.best_effort_type] || e.best_effort_type, anio: e.year, segundos: e.value, metros: meters[e.best_effort_type] || null, fecha: e.date, activity_id: String(e.activity_id) }));
  }
});

dash.loader('potencia_anio', {
  description: 'Mejor potencia media de 1, 5 y 20 minutos por año, en bici real y virtual.',
  fn: ({ answer }) => {
    if (!answer || answer.error) throw new Error((answer && (answer.error.message || answer.error)) || 'Strava no devolvió potencias');
    const names = { GreatestPower1min: '1 min', GreatestPower5min: '5 min', GreatestPower20min: '20 min' };
    return (answer.efforts || []).map((e) => ({ esfuerzo: names[e.best_effort_type] || e.best_effort_type, deporte: e.sport, anio: e.year, vatios: e.value, fecha: e.date }));
  }
});

dash.loader('comp_resumen', {
  description: 'Resumen de rendimiento del entrenamiento con el que comparas: FC media y máxima, potencia.',
  fn: ({ answer, args }) => {
    if (!answer || answer.error) throw new Error((answer && (answer.error.message || answer.error)) || 'Strava no devolvió el entrenamiento');
    const r = (x) => (x == null ? null : Math.round(x));
    return [{ activity_id: String(args.activity_id), fc_media: answer.has_heartrate ? r(answer.average_heartrate) : null, fc_max: answer.has_heartrate ? r(answer.max_heartrate) : null, vatios_media: answer.has_device_watts ? r(answer.average_watts) : null }];
  }
});

dash.loader('comp_curva', {
  description: 'Series del entrenamiento con el que comparas (hasta 300 puntos): minutos, km, FC y velocidad en km/h.',
  fn: ({ answer }) => {
    if (!answer || answer.error) throw new Error((answer && (answer.error.message || answer.error)) || 'Strava no devolvió las series');
    const t = answer.time || [];
    return { rows: t.map((s, i) => ({ min: Math.round(s / 6) / 10, t_s: s, dist_km: answer.distance ? Math.round(answer.distance[i]) / 1000 : null, fc: answer.heart_rate ? answer.heart_rate[i] : null, vel_kmh: answer.velocity_smooth ? Math.round(answer.velocity_smooth[i] * 36) / 10 : null })), columns: ['min', 't_s', 'dist_km', 'fc', 'vel_kmh'] };
  }
});

// ---------- Cálculos ----------
dash.calc('semana_resumen', {
  inputs: ['act_f'],
  title: 'Esta semana y la anterior',
  description: 'Km corriendo, horas y sesiones de esta semana (lunes a hoy) y de la semana pasada, y la sesión con más Esfuerzo relativo de esta semana.',
  fn: (acts) => {
    const DAY = 86400000, now = new Date();
    const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
    const mon = today - ((new Date(today).getUTCDay() + 6) % 7) * DAY;
    const k = (t) => new Date(t).toISOString().slice(0, 10);
    const a = k(mon), b = k(today), pa = k(mon - 7 * DAY), pb = k(mon - DAY);
    const sum = (from, to) => {
      let km = 0, s = 0, n = 0, dura = null;
      for (const r of acts) {
        if (!r.day || r.day < from || r.day > to) continue;
        n++; s += Number(r.moving_s) || 0;
        if (r.categoria === 'Carrera') km += Number(r.distance_km) || 0;
        if (r.relative_effort != null && (!dura || r.relative_effort > dura.relative_effort)) dura = r;
      }
      return { km: Math.round(km * 10) / 10, horas: Math.round(s / 360) / 10, n, dura };
    };
    const t = sum(a, b), p = sum(pa, pb);
    return [{ km: t.km, km_ant: p.km, horas: t.horas, horas_ant: p.horas, sesiones: t.n, sesiones_ant: p.n, dura_nombre: t.dura ? t.dura.name : null, dura_esfuerzo: t.dura ? t.dura.relative_effort : null, dura_id: t.dura ? t.dura.id : null }];
  }
});

dash.calc('dias_anio', {
  inputs: ['act_f'],
  title: 'Minutos por día, último año',
  description: 'Minutos en movimiento, Esfuerzo relativo y sesiones de cada día con actividad en las últimas 52 semanas.',
  fn: (acts) => {
    const now = new Date();
    const from = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) - 371 * 86400000).toISOString().slice(0, 10);
    const acc = {};
    for (const r of acts) {
      if (!r.day || r.day < from) continue;
      const a = acc[r.day] || (acc[r.day] = { day: r.day, minutos: 0, esfuerzo: 0, sesiones: 0 });
      a.minutos += (Number(r.moving_s) || 0) / 60; a.esfuerzo += Number(r.relative_effort) || 0; a.sesiones++;
    }
    return Object.values(acc).map((a) => ({ ...a, minutos: Math.round(a.minutos) })).sort((x, y) => x.day.localeCompare(y.day));
  }
});

dash.calc('eficiencia', {
  inputs: ['activities', 'hr'],
  title: 'Eficiencia aeróbica por carrera',
  description: 'Metros por latido = velocidad media (m/min) ÷ FC media, en carreras de 4 km o más con FC.',
  fn: (activities, hr) => {
    const fc = {};
    for (const l of hr) if (l.run_avg_hr) fc[l.activity_id] = Number(l.run_avg_hr);
    return activities.filter((r) => r.categoria === 'Carrera' && Number(r.distance_km) >= 4 && Number(r.moving_s) > 0 && fc[r.id])
      .map((r) => ({ id: r.id, day: r.day, name: r.name, fc_media: fc[r.id], pace: r.pace, metros_latido: Math.round((r.distance_km * 1000) / (r.moving_s / 60) / fc[r.id] * 1000) / 1000 }))
      .sort((a, b) => a.day.localeCompare(b.day));
  }
});

dash.calc('eficiencia_semana', {
  inputs: ['eficiencia'],
  title: 'Eficiencia aeróbica por semana',
  description: 'Media semanal (lunes a domingo) de los metros por latido de tus carreras.',
  fn: (ef) => {
    const DAY = 86400000, acc = {};
    for (const r of ef) {
      const [y, m, d] = r.day.split('-').map(Number);
      const t = Date.UTC(y, m - 1, d), mon = new Date(t - ((new Date(t).getUTCDay() + 6) % 7) * DAY).toISOString().slice(0, 10);
      (acc[mon] = acc[mon] || []).push(r.metros_latido);
    }
    return Object.entries(acc).map(([semana, v]) => ({ semana, metros_latido: Math.round(v.reduce((a, b) => a + b, 0) / v.length * 1000) / 1000, carreras: v.length })).sort((a, b) => a.semana.localeCompare(b.semana));
  }
});

dash.calc('eficiencia_resumen', {
  inputs: ['eficiencia'],
  title: 'Cambio de eficiencia',
  description: 'Media de metros por latido de los últimos 28 días frente a los 56 días anteriores.',
  fn: (ef) => {
    const DAY = 86400000, now = new Date();
    const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
    const k = (t) => new Date(t).toISOString().slice(0, 10);
    const a = k(today - 27 * DAY), b = k(today - 83 * DAY);
    const mean = (v) => (v.length ? v.reduce((s, x) => s + x, 0) / v.length : null);
    const rec = mean(ef.filter((r) => r.day >= a).map((r) => r.metros_latido));
    const prev = mean(ef.filter((r) => r.day >= b && r.day < a).map((r) => r.metros_latido));
    return [{ reciente: rec != null ? Math.round(rec * 100) / 100 : null, anterior: prev != null ? Math.round(prev * 100) / 100 : null, cambio_pct: rec != null && prev ? Math.round((rec - prev) / prev * 1000) / 10 : null }];
  }
});

dash.calc('ritmos_base', {
  inputs: ['records_anio'],
  title: 'Marca de referencia para los ritmos',
  description: 'Del año más reciente con marcas de 5 km, 10 km o media maratón, la que equivale al mejor 10 km según Riegel (T2 = T1 × (D2/D1)^1,06).',
  fn: (recs) => {
    const ok = recs.filter((r) => r.metros >= 5000 && r.segundos);
    if (!ok.length) return [{ anio: null, base: null, t10: null }];
    const year = Math.max(...ok.map((r) => r.anio));
    let best = null;
    for (const r of ok.filter((q) => q.anio === year)) { const t10 = r.segundos * Math.pow(10000 / r.metros, 1.06); if (!best || t10 < best.t10) best = { r, t10 }; }
    const p = (n) => String(n).padStart(2, '0');
    const fmt = (s) => { s = Math.round(s); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60; return h ? `${h}:${p(m)}:${p(x)}` : `${m}:${p(x)}`; };
    return [{ anio: year, base: `${best.r.prueba} en ${fmt(best.r.segundos)} (${best.r.fecha})`, t10: Math.round(best.t10) }];
  }
});

dash.calc('ritmos', {
  inputs: ['ritmos_base'],
  title: 'Ritmos de entrenamiento',
  description: 'Rangos de ritmo como múltiplos de tu ritmo equivalente de 10 km: recuperación ≥ 1,32; suave 1,20–1,32; fondo 1,15–1,28; umbral 1,03–1,07; 10 km 1,00; series 0,94–0,97.',
  fn: (base) => {
    const b = base[0];
    if (!b || !b.t10) return [];
    const pk = b.t10 / 10;
    const p = (n) => String(n).padStart(2, '0');
    const f = (s) => `${Math.floor(s / 60)}:${p(Math.round(s % 60))}`;
    const z = [
      ['Recuperación', 1.32, null, 'Días después de una sesión dura; trote muy cómodo'],
      ['Rodaje suave', 1.20, 1.32, 'La mayor parte de tus km; puedes conversar'],
      ['Fondo largo', 1.15, 1.28, 'Salida larga del fin de semana'],
      ['Umbral (tempo)', 1.03, 1.07, 'Bloques de 15–30 min «cómodamente duros»'],
      ['Ritmo de 10 km', 1.0, 1.0, 'Series largas o tests'],
      ['Series (VO2máx)', 0.94, 0.97, 'Repeticiones de 400 m a 1 km con pausa']
    ];
    return z.map(([tipo, a, c, uso]) => {
      const fast = pk * a, slow = c ? pk * c : null;
      const rango = slow == null ? `más lento que ${f(fast)} /km` : a === c ? `${f(fast)} /km` : `${f(fast)}–${f(slow)} /km`;
      return { tipo, rapido_s: Math.round(fast), lento_s: slow != null ? Math.round(slow) : null, rango, uso };
    });
  }
});

dash.calc('rodajes_check', {
  inputs: ['ritmos', 'activities'],
  title: 'Carreras más rápidas que el ritmo suave',
  description: 'De las carreras de 4 km o más de los últimos 28 días, cuántas fueron más rápidas que el límite rápido de tu ritmo suave.',
  fn: (ritmos, activities) => {
    const suave = ritmos.find((r) => r.tipo === 'Rodaje suave');
    if (!suave) return [{ rapidos: null, total: null }];
    const now = new Date();
    const from = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) - 27 * 86400000).toISOString().slice(0, 10);
    const runs = activities.filter((r) => r.categoria === 'Carrera' && r.day >= from && Number(r.distance_km) >= 4 && r.pace_s_km);
    return [{ rapidos: runs.filter((r) => r.pace_s_km < suave.rapido_s).length, total: runs.length }];
  }
});

dash.calc('records_pivot', {
  inputs: ['records_anio', 'records'],
  title: 'Récords por año',
  description: 'Mejor tiempo de cada distancia en este año y los tres anteriores, junto al mejor de siempre.',
  fn: (recs, siempre) => {
    const years = (dash.params().anios || []).map(Number).sort((a, b) => b - a);
    const p = (n) => String(n).padStart(2, '0');
    const fmt = (s) => { const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60; return h ? `${h}:${p(m)}:${p(x)}` : `${m}:${p(x)}`; };
    return ['1 km', '5 km', '10 km', 'Media maratón'].map((prueba) => {
      const row = { prueba };
      years.slice(0, 4).forEach((y, i) => { const r = recs.find((q) => q.prueba === prueba && Number(q.anio) === y); row['y' + i] = r ? fmt(r.segundos) : null; });
      const s = siempre.find((q) => q.prueba === prueba);
      row.siempre = s ? `${s.tiempo} (${String(s.fecha).slice(0, 4)})` : null;
      return row;
    });
  }
});

dash.calc('potencia', {
  inputs: ['potencia_anio'],
  title: 'Potencia por año',
  description: 'Mejor potencia media (W) de 1, 5 y 20 minutos en este año y los tres anteriores, la más alta entre bici real y virtual.',
  fn: (pot) => {
    const years = (dash.params().anios || []).map(Number).sort((a, b) => b - a);
    return ['1 min', '5 min', '20 min'].map((esfuerzo) => {
      const row = { esfuerzo };
      years.slice(0, 4).forEach((y, i) => { const v = pot.filter((q) => q.esfuerzo === esfuerzo && Number(q.anio) === y).map((q) => Number(q.vatios)); row['y' + i] = v.length ? Math.max(...v) : null; });
      return row;
    });
  }
});

dash.calc('ftp', {
  inputs: ['potencia_anio', 'zonas'],
  title: 'FTP',
  description: 'FTP estimado = 95 % de tu mejor potencia de 20 minutos del año más reciente que la tenga, junto al FTP guardado en Strava.',
  fn: (pot, zonas) => {
    const p20 = pot.filter((q) => q.esfuerzo === '20 min');
    const year = p20.length ? Math.max(...p20.map((q) => Number(q.anio))) : null;
    const best = year ? Math.max(...p20.filter((q) => Number(q.anio) === year).map((q) => Number(q.vatios))) : null;
    const z = zonas[0] || {};
    return [{ ftp_20min: best ? Math.round(best * 0.95) : null, anio: year, ftp_strava: z.ftp != null ? z.ftp : null, ftp_strava_estimado: !!z.ftp_estimado }];
  }
});

dash.calc('comparacion', {
  inputs: ['activities', 'sesion', 'comp_resumen'],
  title: 'Comparación de entrenamientos',
  description: 'Distancia, tiempo, ritmo o velocidad, FC, potencia, desnivel y esfuerzo del entrenamiento elegido frente al de comparación, con la diferencia.',
  fn: (activities, sesion, comp) => {
    const pa = dash.params();
    const A = activities.find((r) => r.id === String(pa.actividad)), B = activities.find((r) => r.id === String(pa.comparar));
    if (!A || !B) return [];
    const sa = sesion.find((s) => s.activity_id === A.id) || {}, sb = comp.find((s) => s.activity_id === B.id) || {};
    const p = (n) => String(n).padStart(2, '0');
    const hms = (s) => { s = Math.round(Math.abs(s)); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60; return h ? `${h}:${p(m)}:${p(x)}` : `${m}:${p(x)}`; };
    const num = (x, d = 1) => Number(x).toLocaleString('es', { minimumFractionDigits: d, maximumFractionDigits: d });
    const sign = (v) => (v > 0 ? '+' : v < 0 ? '−' : '±');
    const rows = [{ metrica: 'Fecha', a: A.day, b: B.day, dif: '' }];
    const dist = (r) => Number(r.distance_km) || 0;
    if (dist(A) > 0.1 && dist(B) > 0.1) rows.push({ metrica: 'Distancia', a: `${num(dist(A), 2)} km`, b: `${num(dist(B), 2)} km`, dif: `${sign(dist(A) - dist(B))}${num(Math.abs(dist(A) - dist(B)), 2)} km` });
    rows.push({ metrica: 'Tiempo', a: A.duracion, b: B.duracion, dif: `${sign(A.moving_s - B.moving_s)}${hms(A.moving_s - B.moving_s)}` });
    if (A.pace_s_km && B.pace_s_km) rows.push({ metrica: 'Ritmo medio', a: A.pace, b: B.pace, dif: `${sign(A.pace_s_km - B.pace_s_km)}${hms(A.pace_s_km - B.pace_s_km)} /km` });
    else if (dist(A) > 0.1 && dist(B) > 0.1) { const va = dist(A) / (A.moving_s / 3600), vb = dist(B) / (B.moving_s / 3600); rows.push({ metrica: 'Velocidad media', a: `${num(va)} km/h`, b: `${num(vb)} km/h`, dif: `${sign(va - vb)}${num(Math.abs(va - vb))} km/h` }); }
    const pair = (metrica, x, y, unit) => { if (x != null && y != null) rows.push({ metrica, a: `${x} ${unit}`, b: `${y} ${unit}`, dif: `${sign(x - y)}${Math.abs(x - y)} ${unit}` }); };
    pair('FC media', sa.fc_media, sb.fc_media, 'lpm');
    pair('FC máxima', sa.fc_max, sb.fc_max, 'lpm');
    pair('Potencia media', sa.vatios_media, sb.vatios_media, 'W');
    pair('Desnivel', Math.round(A.elevation_m), Math.round(B.elevation_m), 'm');
    if (A.relative_effort != null && B.relative_effort != null) rows.push({ metrica: 'Esfuerzo relativo', a: String(A.relative_effort), b: String(B.relative_effort), dif: `${sign(A.relative_effort - B.relative_effort)}${Math.abs(A.relative_effort - B.relative_effort)}` });
    return rows;
  }
});

// ---------- Comparación: elegir sesión ----------
window.meCompPicked = false;
dash.onData(() => {
  if (window.meCompPicked) return;
  const a = dash.data('activities');
  if (a.status !== 'ok') return;
  const pa = dash.params();
  const i = a.data.findIndex((r) => r.id === String(pa.actividad));
  if (i < 0) return;
  const prev = a.data.slice(i + 1).find((r) => r.categoria === a.data[i].categoria);
  if (prev && String(pa.comparar) !== prev.id) dash.setParams({ comparar: prev.id });
});

dash.draw('c-select', (sel) => {
  const a = dash.data('activities');
  const list = a.status === 'ok' ? a.data.slice(0, 120) : [];
  sel.replaceChildren(...list.map((r) => new Option(`${ME.fmtShort.format(ME.keyToUTC(r.day))} ${r.day.slice(0, 4)} · ${r.name}${ME.hasDist(r) ? ' · ' + ME.fmtNum(r.distance_km) + ' km' : ''}`, r.id)));
  sel.value = String(dash.params().comparar || '');
  sel.onchange = () => { window.meCompPicked = true; dash.setParams({ comparar: sel.value }); };
});

dash.draw('c-table', (el) => {
  const d = dash.data('comparacion');
  if (d.status !== 'ok') return el.replaceChildren();
  el.replaceChildren(...d.data.map((r) => { const tr = document.createElement('tr'); tr.append(ME.el('td', '', r.metrica), ME.el('td', 'me-num', r.a), ME.el('td', 'me-num', r.b), ME.el('td', 'me-num', r.dif)); return tr; }));
});

const meCompAct = () => { const a = dash.data('activities'); const id = String(dash.params().actividad || ''); return a.status === 'ok' ? a.data.find((r) => r.id === id) : null; };
dash.draw('c-speed-title', (el) => { const r = meCompAct(); el.textContent = r && r.categoria === 'Carrera' ? 'Ritmo (min/km)' : 'Velocidad (km/h)'; });

const meCompChart = (kind) => (el) => {
  const A = dash.data('sesion_curva'), B = dash.data('comp_curva');
  if (A.status === 'error' || B.status === 'error') return el.replaceChildren(ME.el('p', 'me-err', 'No se pudieron cargar las series.'));
  if (A.status !== 'ok' || B.status !== 'ok') return el.replaceChildren(ME.el('p', 'me-muted', '—'));
  const act = meCompAct();
  const isRun = act && act.categoria === 'Carrera';
  const useDist = A.data.some((c) => c.dist_km > 0.2) && B.data.some((c) => c.dist_km > 0.2);
  const xv = (c) => (useDist ? c.dist_km : c.min);
  const val = (c) => kind === 'hr' ? (c.fc > 40 ? c.fc : null) : (isRun ? (c.vel_kmh > 3 ? 3600 / c.vel_kmh : null) : (c.vel_kmh || null));
  const prep = (rows) => { const pts = rows.map((c) => ({ x: xv(c), v: val(c) })).filter((c) => c.v != null && c.x != null); return pts.map((c, i) => { const w = pts.slice(Math.max(0, i - 2), i + 3); return { x: c.x, v: w.reduce((s, q) => s + q.v, 0) / w.length }; }); };
  const a = prep(A.data), b = prep(B.data);
  if (!a.length && !b.length) return el.replaceChildren(ME.el('p', 'me-muted', 'Sin datos para comparar.'));
  const W = el.clientWidth, H = 200;
  el.replaceChildren();
  const svg = d3.select(el).append('svg').attr('width', '100%').attr('height', H).attr('viewBox', `0 0 ${W} ${H}`).attr('role', 'img').attr('aria-label', kind === 'hr' ? 'Frecuencia cardíaca de las dos sesiones' : 'Ritmo o velocidad de las dos sesiones');
  const all = a.concat(b);
  const ext = d3.extent(all, (c) => c.v);
  const y = kind !== 'hr' && isRun ? d3.scaleLinear().domain([ext[1] + 10, ext[0] - 10]).range([H - 24, 8]) : d3.scaleLinear().domain([ext[0] - 5, ext[1] + 5]).nice().range([H - 24, 8]);
  const fmt = kind !== 'hr' && isRun ? ME.fmtPace : (v) => String(Math.round(v));
  const ml = ME.textWidth(svg, y.ticks(4).map(fmt)) + 10;
  const x = d3.scaleLinear().domain([0, d3.max(all, (c) => c.x) || 1]).range([ml, W - 6]);
  svg.append('g').attr('transform', `translate(${ml},0)`).call(d3.axisLeft(y).ticks(4).tickFormat(fmt).tickSize(-(W - ml - 6))).call((g) => g.select('.domain').remove());
  svg.append('g').attr('transform', `translate(0,${H - 24})`).call(d3.axisBottom(x).ticks(W < 420 ? 4 : 6).tickFormat((v) => useDist ? `${v} km` : `${v} min`).tickSizeOuter(0));
  const line = d3.line().x((c) => x(c.x)).y((c) => y(c.v));
  svg.append('path').datum(b).attr('d', line).style('fill', 'none').style('stroke', dash.colors[1 % dash.colors.length]).style('stroke-width', 1.75);
  svg.append('path').datum(a).attr('d', line).style('fill', 'none').style('stroke', dash.colors[0]).style('stroke-width', 2);
  const tp = ME.tip(el);
  const bisA = d3.bisector((c) => c.x).center;
  svg.append('rect').attr('x', ml).attr('y', 0).attr('width', Math.max(0, W - ml - 6)).attr('height', H - 24).style('fill', 'transparent')
    .on('pointermove', (ev) => {
      const [px, py] = d3.pointer(ev, el), xx = x.invert(px);
      const ca = a.length ? a[bisA(a, xx)] : null, cb = b.length ? b[bisA(b, xx)] : null;
      const f = (c) => (c ? (kind === 'hr' ? `${Math.round(c.v)} lpm` : isRun ? `${ME.fmtPace(c.v)} /km` : `${ME.fmtNum(c.v)} km/h`) : '—');
      tp.show([useDist ? `Km ${ME.fmtNum(xx, 1)}` : `Minuto ${ME.fmtNum(xx, 0)}`, `Esta sesión: ${f(ca)}`, `Comparada: ${f(cb)}`], px, py);
    })
    .on('pointerleave', () => tp.hide());
};
dash.draw('chart-c-hr', meCompChart('hr'));
dash.draw('chart-c-speed', meCompChart('speed'));

// ---------- Resumen semanal ----------
const meR = (id) => { const d = dash.data(id); return d.status === 'ok' && Array.isArray(d.data) && d.data[0] ? d.data[0] : null; };
const meT = (el, v) => { el.textContent = v == null ? '—' : String(v); };
dash.draw('w-km', (el) => { const r = meR('semana_resumen'); meT(el, r && ME.fmtNum(r.km)); });
dash.draw('w-km-ant', (el) => { const r = meR('semana_resumen'); meT(el, r && ME.fmtNum(r.km_ant)); });
dash.draw('w-h', (el) => { const r = meR('semana_resumen'); meT(el, r && ME.fmtNum(r.horas)); });
dash.draw('w-h-ant', (el) => { const r = meR('semana_resumen'); meT(el, r && ME.fmtNum(r.horas_ant)); });
dash.draw('w-s', (el) => { const r = meR('semana_resumen'); meT(el, r && r.sesiones); });
dash.draw('w-s-ant', (el) => { const r = meR('semana_resumen'); meT(el, r && r.sesiones_ant); });
dash.draw('w-dura', (el) => { const r = meR('semana_resumen'); meT(el, r && r.dura_nombre ? r.dura_nombre : (r ? 'Sin sesiones aún' : null)); });
dash.draw('w-dura-e', (el) => { const r = meR('semana_resumen'); meT(el, r && r.dura_esfuerzo); });

// ---------- Mapa del año ----------
dash.onData(() => {
  document.querySelectorAll('.me-hcell').forEach((c) => {
    const l = Number(c.dataset.lvl);
    if (l > 0) { c.style.background = dash.colors[0]; c.style.opacity = String([0, 0.3, 0.55, 0.8, 1][l]); c.style.borderColor = 'transparent'; }
  });
});
dash.draw('heatmap', (el) => {
  const d = dash.data('dias_anio');
  if (!ME.status(el, d, 'tu año de entrenamiento')) return;
  const by = new Map(d.data.map((r) => [r.day, r]));
  const DAY = 86400000;
  const today = ME.keyToUTC(ME.todayKey).getTime();
  const mon = today - ((new Date(today).getUTCDay() + 6) % 7) * DAY;
  const start = mon - 51 * 7 * DAY;
  const W = Math.max((el.parentElement || el).clientWidth, 560);
  const left = 26, top = 16, gap = 2;
  const cell = Math.max(8, Math.floor((W - left) / 52) - gap);
  const H = top + 7 * (cell + gap);
  el.replaceChildren();
  const svg = d3.select(el).append('svg').attr('width', left + 52 * (cell + gap)).attr('height', H).attr('role', 'img').attr('aria-label', 'Minutos de entrenamiento por día en las últimas 52 semanas');
  ['L', '', 'X', '', 'V', '', 'D'].forEach((t, i) => { if (t) svg.append('text').attr('x', 0).attr('y', top + i * (cell + gap) + cell - 1).text(t); });
  const lvl = (m) => (!m ? 0 : m < 30 ? 1 : m < 60 ? 2 : m < 90 ? 3 : 4);
  const op = [0, 0.3, 0.55, 0.8, 1];
  const fmtM = new Intl.DateTimeFormat('es', { month: 'short', timeZone: 'UTC' });
  const tp = ME.tip(el);
  const cells = [];
  let lastMonth = -1, lastLabelW = -10;
  for (let w = 0; w < 52; w++) {
    const wk = start + w * 7 * DAY;
    const mth = new Date(wk).getUTCMonth();
    if (mth !== lastMonth) { if (w < 50 && w - lastLabelW >= 3) { svg.append('text').attr('x', left + w * (cell + gap)).attr('y', 10).text(fmtM.format(new Date(wk))); lastLabelW = w; } lastMonth = mth; }
    for (let i = 0; i < 7; i++) {
      const t = wk + i * DAY;
      if (t > today) continue;
      const key = new Date(t).toISOString().slice(0, 10);
      cells.push({ key, x: left + w * (cell + gap), y: top + i * (cell + gap), r: by.get(key) });
    }
  }
  svg.append('g').selectAll('rect').data(cells).join('rect')
    .attr('x', (c) => c.x).attr('y', (c) => c.y).attr('width', cell).attr('height', cell).attr('rx', 2)
    .style('fill', (c) => (c.r ? dash.colors[0] : 'var(--color-bg)'))
    .style('fill-opacity', (c) => (c.r ? op[lvl(c.r.minutos)] : 1))
    .style('stroke', (c) => (c.r ? 'none' : 'var(--color-border-line)'))
    .on('pointerenter', (ev, c) => { const [px, py] = d3.pointer(ev, el); tp.show([ME.fmtLong.format(ME.keyToUTC(c.key)), c.r ? `${c.r.minutos} min · ${c.r.sesiones} ${c.r.sesiones === 1 ? 'sesión' : 'sesiones'} · esfuerzo ${c.r.esfuerzo}` : 'Descanso'], px, py); })
    .on('pointerleave', () => tp.hide());
});

// ---------- Eficiencia ----------
dash.draw('e-now', (el) => { const r = meR('eficiencia_resumen'); meT(el, r && r.reciente != null ? ME.fmtNum(r.reciente, 2) : null); });
dash.draw('e-prev', (el) => { const r = meR('eficiencia_resumen'); meT(el, r && r.anterior != null ? ME.fmtNum(r.anterior, 2) : null); });
dash.draw('e-pct', (el) => {
  const r = meR('eficiencia_resumen');
  document.querySelectorAll('.me-eff-cmp').forEach((c) => { c.hidden = !r || r.cambio_pct == null; });
  meT(el, r && r.cambio_pct != null ? ME.fmtNum(Math.abs(r.cambio_pct), 1) : null);
});
dash.draw('e-dir', (el) => { const r = meR('eficiencia_resumen'); meT(el, r && r.cambio_pct != null ? (r.cambio_pct >= 0 ? 'más' : 'menos') : null); });

dash.draw('chart-eff', (el) => {
  const d = dash.data('eficiencia'), wk = dash.data('eficiencia_semana');
  if (!ME.status(el, d, 'la eficiencia')) return;
  if (!d.data.length) return el.replaceChildren(ME.el('p', 'me-muted', 'No hay carreras con FC suficientes.'));
  const W = el.clientWidth, H = 230;
  el.replaceChildren();
  const svg = d3.select(el).append('svg').attr('width', '100%').attr('height', H).attr('viewBox', `0 0 ${W} ${H}`).attr('role', 'img').attr('aria-label', 'Metros por latido de cada carrera y media semanal');
  const ext = d3.extent(d.data, (r) => r.metros_latido);
  const y = d3.scaleLinear().domain([ext[0] - 0.03, ext[1] + 0.03]).nice().range([H - 26, 10]);
  const ml = ME.textWidth(svg, y.ticks(4).map((v) => ME.fmtNum(v, 2))) + 10;
  const x = d3.scaleUtc().domain(d3.extent(d.data, (r) => ME.keyToUTC(r.day))).range([ml + 6, W - 10]);
  svg.append('g').attr('transform', `translate(${ml},0)`).call(d3.axisLeft(y).ticks(4).tickFormat((v) => ME.fmtNum(v, 2)).tickSize(-(W - ml - 4))).call((g) => g.select('.domain').remove());
  svg.append('g').attr('transform', `translate(0,${H - 26})`).call(d3.axisBottom(x).ticks(W < 420 ? 3 : 6).tickFormat((t) => new Intl.DateTimeFormat('es', { month: 'short', timeZone: 'UTC' }).format(t)).tickSizeOuter(0));
  const tp = ME.tip(el);
  svg.append('g').selectAll('circle').data(d.data).join('circle')
    .attr('cx', (r) => x(ME.keyToUTC(r.day))).attr('cy', (r) => y(r.metros_latido)).attr('r', 3.5)
    .style('fill', dash.colors[0]).style('fill-opacity', 0.4)
    .on('pointerenter', (ev, r) => { const [px, py] = d3.pointer(ev, el); tp.show([`${ME.fmtShort.format(ME.keyToUTC(r.day))} · ${r.name}`, `${ME.fmtNum(r.metros_latido, 2)} m por latido`, `${r.pace} · FC ${r.fc_media} lpm`], px, py); })
    .on('pointerleave', () => tp.hide());
  if (wk.status === 'ok' && wk.data.length > 1) {
    const pts = wk.data.map((r) => ({ t: ME.keyToUTC(r.semana).getTime() + 3 * 86400000, v: r.metros_latido }));
    svg.append('path').datum(pts).attr('d', d3.line().x((p) => x(new Date(p.t))).y((p) => y(p.v))).style('fill', 'none').style('stroke', dash.colors[0]).style('stroke-width', 2);
  }
});

// ---------- Ritmos ----------
dash.draw('r-anio', (el) => { const r = meR('ritmos_base'); meT(el, r && r.anio); });
dash.draw('r-base', (el) => { const r = meR('ritmos_base'); meT(el, r && r.base); });
dash.draw('r-rapidos', (el) => { const r = meR('rodajes_check'); meT(el, r && r.rapidos); });
dash.draw('r-total', (el) => { const r = meR('rodajes_check'); meT(el, r && r.total); });
dash.draw('ritmos', (el) => {
  const d = dash.data('ritmos');
  if (d.status !== 'ok') return el.replaceChildren();
  el.replaceChildren(...d.data.map((r) => { const tr = document.createElement('tr'); tr.append(ME.el('td', '', r.tipo), ME.el('td', 'me-num', r.rango), ME.el('td', 'me-wrap', r.uso)); return tr; }));
});

// ---------- Años en cabeceras ----------
const meYear = (i) => (el) => { const ys = (dash.params().anios || []).map(Number).sort((a, b) => b - a); meT(el, ys[i] != null ? ys[i] : null); };
[0, 1, 2, 3].forEach((i) => { dash.draw('p-y' + i, meYear(i)); dash.draw('rp-y' + i, meYear(i)); });

// ---------- Potencia y récords por año ----------
dash.draw('potencia', (el) => {
  const d = dash.data('potencia');
  if (d.status !== 'ok') return el.replaceChildren();
  el.replaceChildren(...d.data.map((r) => { const tr = document.createElement('tr'); tr.append(ME.el('td', '', r.esfuerzo), ...[0, 1, 2, 3].map((i) => ME.el('td', 'me-num', r['y' + i] != null ? String(r['y' + i]) : '—'))); return tr; }));
});
dash.draw('records-pivot', (el) => {
  const d = dash.data('records_pivot');
  if (d.status !== 'ok') return el.replaceChildren();
  el.replaceChildren(...d.data.map((r) => { const tr = document.createElement('tr'); tr.append(ME.el('td', '', r.prueba), ...[0, 1, 2, 3].map((i) => ME.el('td', 'me-num', r['y' + i] || '—')), ME.el('td', 'me-num', r.siempre || '—')); return tr; }));
});
dash.draw('f-20', (el) => { const r = meR('ftp'); meT(el, r && r.ftp_20min); });
dash.draw('f-anio', (el) => { const r = meR('ftp'); meT(el, r && r.anio); });
dash.draw('f-strava', (el) => { const r = meR('ftp'); meT(el, r && r.ftp_strava); });
dash.draw('f-strava-src', (el) => { const r = meR('ftp'); meT(el, r ? (r.ftp_strava_estimado ? 'Estimado por Strava' : 'Configurado por ti') : null); });
