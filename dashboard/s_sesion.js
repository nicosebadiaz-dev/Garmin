// ================= ÚLTIMO ENTRENAMIENTO =================
// ---------- Cargadores ----------
dash.loader('sesion', {
  description: 'Toma de Strava el resumen de rendimiento del entrenamiento elegido: FC media y máxima, potencia, cadencia y calorías.',
  fn: ({ answer, args }) => {
    if (!answer || answer.error) throw new Error((answer && (answer.error.message || answer.error)) || 'Strava no devolvió el entrenamiento');
    const r = (x) => (x == null ? null : Math.round(x));
    return [{ activity_id: String(args.activity_id), deporte: answer.sport_type || '', tiene_fc: !!answer.has_heartrate, tiene_potencia: !!answer.has_device_watts, fc_media: answer.has_heartrate ? r(answer.average_heartrate) : null, fc_max: answer.has_heartrate ? r(answer.max_heartrate) : null, vatios_media: answer.has_device_watts ? r(answer.average_watts) : null, cadencia: r(answer.average_cadence), calorias: r(answer.calories), esfuerzo_percibido: answer.perceived_exertion != null ? answer.perceived_exertion : null }];
  }
});

dash.loader('sesion_vueltas', {
  description: 'Una fila por vuelta del entrenamiento elegido. Convierte metros a km, m/s a km/h y a ritmo por km, y redondea la FC.',
  fn: ({ answer }) => {
    if (!answer || answer.error) throw new Error((answer && (answer.error.message || answer.error)) || 'Strava no devolvió las vueltas');
    const p = (n) => String(n).padStart(2, '0');
    const mmss = (s) => { s = Math.round(s); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60; return h ? `${h}:${p(m)}:${p(x)}` : `${m}:${p(x)}`; };
    const run = ['Run', 'TrailRun', 'VirtualRun', 'Walk', 'Hike'].includes(answer.sport_type);
    return (answer.laps || []).map((l, i) => {
      const v = l.avg_speed || 0;
      return { vuelta: i + 1, distancia_km: Math.round((l.distance || 0) / 10) / 100, tiempo_s: l.moving_time || 0, tiempo: mmss(l.moving_time || 0), ritmo_s_km: run && v > 0.3 ? Math.round(1000 / v) : null, ritmo: run && v > 0.3 ? mmss(1000 / v) + ' /km' : '', vel_kmh: v ? Math.round(v * 36) / 10 : null, fc_media: l.avg_hr != null ? Math.round(l.avg_hr) : null, fc_max: l.max_hr != null ? Math.round(l.max_hr) : null, vatios: l.avg_watts != null ? Math.round(l.avg_watts) : null, desnivel_m: l.elevation_gain != null ? Math.round(l.elevation_gain) : null };
    });
  }
});

dash.loader('sesion_marcas', {
  description: 'Los mejores esfuerzos que Strava encontró dentro del entrenamiento elegido, con nombre en español.',
  fn: ({ answer }) => {
    if (!answer || answer.error) throw new Error((answer && (answer.error.message || answer.error)) || 'Strava no devolvió los esfuerzos');
    const p = (n) => String(n).padStart(2, '0');
    const fmt = (s) => { const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = Math.round(s % 60); return h ? `${h}:${p(m)}:${p(x)}` : `${m}:${p(x)}`; };
    const es = (t) => String(t || '').replace('1/2 mile', '1/2 milla').replace(/\bmile\b/, 'milla').replace(/\bsec\b/, 's').replace(/\bhr\b/, 'h');
    return (answer.best_efforts || []).map((e) => ({ esfuerzo: es(e.display_text || e.name), valor: e.unit === 'seconds' ? fmt(e.value) : e.unit === 'watts' ? `${e.value} W` : `${e.value} ${e.unit || ''}`.trim(), unidad: e.unit || '' }));
  }
});

dash.loader('sesion_curva', {
  description: 'Convierte las series de Strava (hasta 300 puntos) en filas: tiempo en minutos, distancia en km, FC, velocidad en km/h, altitud y potencia.',
  fn: ({ answer }) => {
    if (!answer || answer.error) throw new Error((answer && (answer.error.message || answer.error)) || 'Strava no devolvió las series');
    const t = answer.time || [], n = t.length;
    const rows = [];
    for (let i = 0; i < n; i++) {
      rows.push({ min: Math.round(t[i] / 6) / 10, t_s: t[i], dist_km: answer.distance ? Math.round(answer.distance[i]) / 1000 : null, fc: answer.heart_rate ? answer.heart_rate[i] : null, vel_kmh: answer.velocity_smooth ? Math.round(answer.velocity_smooth[i] * 36) / 10 : null, alt_m: answer.altitude ? answer.altitude[i] : null, vatios: answer.watts ? answer.watts[i] : null });
    }
    return { rows, columns: ['min', 't_s', 'dist_km', 'fc', 'vel_kmh', 'alt_m', 'vatios'] };
  }
});

// ---------- Cálculos ----------
dash.calc('sesion_zonas', {
  inputs: ['sesion_curva', 'zonas_fc'],
  title: 'Zonas de FC de la sesión',
  description: 'Minutos de la sesión en cada zona de FC, sumando el tiempo entre puntos de la serie (huecos de más de 30 s se cuentan como 30 s).',
  fn: (curva, zonas) => {
    const sec = zonas.map(() => 0);
    for (let i = 1; i < curva.length; i++) {
      const h = Number(curva[i].fc);
      if (!h) continue;
      const dt = Math.min(30, Math.max(0, curva[i].t_s - curva[i - 1].t_s));
      let z = 0;
      for (let k = zonas.length - 1; k >= 0; k--) if (h >= Number(zonas[k].min)) { z = k; break; }
      sec[z] += dt;
    }
    const tot = sec.reduce((a, b) => a + b, 0);
    return zonas.map((zz, k) => ({ zona: zz.zona, minutos: Math.round(sec[k] / 6) / 10, pct: tot ? Math.round(sec[k] / tot * 100) : 0 }));
  }
});

dash.calc('sesion_lectura', {
  inputs: ['activities', 'sesion', 'sesion_curva', 'sesion_zonas'],
  title: 'Lectura del entrenamiento',
  description: 'Compara la sesión con la media de tus 10 sesiones anteriores del mismo deporte, compara las dos mitades (ritmo y desacople FC-velocidad) y resume el tiempo en zonas altas.',
  fn: (activities, sesion, curva, zonasSesion) => {
    const id = String(dash.params().actividad || '');
    const act = activities.find((r) => r.id === id);
    if (!act) return [];
    const p = (n) => String(n).padStart(2, '0');
    const pace = (s) => `${Math.floor(s / 60)}:${p(Math.round(s % 60))} /km`;
    const num = (x, d = 1) => Number(x).toLocaleString('es', { minimumFractionDigits: d, maximumFractionDigits: d });
    const isRun = act.categoria === 'Carrera';
    const out = [];
    const prev = activities.filter((r) => r.categoria === act.categoria && r.start_local < act.start_local).slice(0, 10);
    const avg = (arr, f) => { const v = arr.map(f).filter((x) => x != null && isFinite(x) && x > 0); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
    if (prev.length >= 3) {
      const cat = act.categoria.toLowerCase();
      const dAvg = avg(prev, (r) => Number(r.distance_km));
      if (dAvg && Number(act.distance_km) > 0.1) {
        const diff = Math.round((act.distance_km - dAvg) / dAvg * 100);
        out.push({ tono: 'info', texto: `Distancia ${num(act.distance_km)} km, ${Math.abs(diff) < 5 ? 'similar a' : diff > 0 ? `un ${diff} % más que` : `un ${-diff} % menos que`} tu media de las últimas ${prev.length} sesiones de ${cat} (${num(dAvg)} km).` });
      } else {
        const tAvg = avg(prev, (r) => Number(r.moving_s));
        if (tAvg) { const diff = Math.round((act.moving_s - tAvg) / tAvg * 100); out.push({ tono: 'info', texto: `Duración ${Math.round(act.moving_s / 60)} min, ${Math.abs(diff) < 5 ? 'similar a' : diff > 0 ? `un ${diff} % más que` : `un ${-diff} % menos que`} tu media reciente de ${cat} (${Math.round(tAvg / 60)} min).` }); }
      }
      if (isRun && act.pace_s_km) {
        const pAvg = avg(prev, (r) => Number(r.pace_s_km));
        if (pAvg) { const d = Math.round(act.pace_s_km - pAvg); out.push({ tono: d <= 0 ? 'ok' : 'info', texto: `Ritmo medio ${pace(act.pace_s_km)}: ${Math.abs(d) < 3 ? 'igual que' : d < 0 ? `${-d} s/km más rápido que` : `${d} s/km más lento que`} tu media reciente (${pace(pAvg)}).` }); }
      }
      const eAvg = avg(prev, (r) => Number(r.relative_effort));
      if (eAvg && act.relative_effort != null) { const diff = Math.round((act.relative_effort - eAvg) / eAvg * 100); out.push({ tono: diff > 40 ? 'warn' : 'info', texto: `Esfuerzo relativo ${act.relative_effort}, ${Math.abs(diff) < 10 ? 'en línea con' : diff > 0 ? `un ${diff} % por encima de` : `un ${-diff} % por debajo de`} lo habitual (${Math.round(eAvg)}).` }); }
    }
    const pts = curva.filter((c) => c.t_s != null);
    if (pts.length > 20) {
      const half = pts[pts.length - 1].t_s / 2;
      const a = pts.filter((c) => c.t_s <= half), b = pts.filter((c) => c.t_s > half);
      const mean = (arr, f) => { const v = arr.map(f).filter((x) => x != null && x > 0); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null; };
      const v1 = mean(a, (c) => c.vel_kmh), v2 = mean(b, (c) => c.vel_kmh), h1 = mean(a, (c) => c.fc), h2 = mean(b, (c) => c.fc);
      if (isRun && v1 && v2) {
        const d = Math.round(3600 / v2 - 3600 / v1);
        out.push({ tono: d <= 0 ? 'ok' : Math.abs(d) > 20 ? 'warn' : 'info', texto: `Primera mitad a ${pace(3600 / v1)} y segunda a ${pace(3600 / v2)}: ${Math.abs(d) < 3 ? 'ritmo parejo' : d < 0 ? `split negativo, terminaste ${-d} s/km más rápido` : `bajaste ${d} s/km en la segunda mitad`}.` });
      }
      if (v1 && v2 && h1 && h2 && pts[pts.length - 1].t_s >= 1200) {
        const drift = Math.round(((v1 / h1) - (v2 / h2)) / (v1 / h1) * 1000) / 10;
        out.push({ tono: drift < 5 ? 'ok' : 'warn', texto: `Desacople FC-velocidad de ${num(drift)} %: ${drift < 5 ? 'la FC se mantuvo estable para la velocidad que llevabas, buena señal de base aeróbica (menos de 5 %).' : 'la FC subió más que la velocidad en la segunda mitad; suele indicar fatiga, calor, poca hidratación o un ritmo por encima de tu base aeróbica.'}` });
      }
      if (h1 && h2) out.push({ tono: 'info', texto: `FC media de ${Math.round(h1)} lpm en la primera mitad y ${Math.round(h2)} lpm en la segunda.` });
    }
    const z45 = zonasSesion.filter((z) => z.zona === 'Z4' || z.zona === 'Z5').reduce((s, z) => s + z.pct, 0);
    const zTot = zonasSesion.reduce((s, z) => s + z.minutos, 0);
    if (zTot > 0) out.push({ tono: z45 > 50 ? 'warn' : 'info', texto: `${z45} % del tiempo en zonas 4–5${z45 > 50 ? '. Fue una sesión exigente: conviene que la siguiente sea suave.' : '.'}` });
    const s = sesion[0];
    if (s && s.vatios_media) out.push({ tono: 'info', texto: `Potencia media ${s.vatios_media} W.` });
    return out.map((r, i) => ({ orden: i + 1, ...r }));
  }
});

// ---------- Elegir el entrenamiento ----------
window.meSesionPicked = false;
dash.onData(() => {
  if (window.meSesionPicked) return;
  const a = dash.data('activities');
  if (a.status !== 'ok' || !a.data.length) return;
  const latest = a.data.find((r) => r.categoria !== 'Movilidad') || a.data[0];
  if (String(dash.params().actividad) !== latest.id) dash.setParams({ actividad: latest.id });
});

dash.draw('s-select', (sel) => {
  const a = dash.data('activities');
  const list = a.status === 'ok' ? a.data.slice(0, 25) : [];
  sel.replaceChildren(...list.map((r) => new Option(`${ME.fmtShort.format(ME.keyToUTC(r.day))} · ${r.name}${ME.hasDist(r) ? ' · ' + ME.fmtNum(r.distance_km) + ' km' : ''}`, r.id)));
  sel.value = String(dash.params().actividad || '');
  sel.onchange = () => { window.meSesionPicked = true; dash.setParams({ actividad: sel.value }); };
});

const meAct = () => { const a = dash.data('activities'); const id = String(dash.params().actividad || ''); return a.status === 'ok' ? a.data.find((r) => r.id === id) : null; };

dash.draw('s-name', (el) => {
  const r = meAct();
  el.replaceChildren();
  if (!r) return el.append('—');
  const a = ME.el('a', '', r.name); a.href = 'https://www.strava.com/activities/' + encodeURIComponent(r.id); a.target = '_blank'; a.rel = 'noopener';
  a.style.color = 'inherit'; a.style.textDecoration = 'none';
  el.appendChild(a);
});
dash.draw('s-when', (el) => {
  const r = meAct();
  el.textContent = r ? `${ME.fmtLong.format(ME.keyToUTC(r.day))} · ${r.start_local.slice(11, 16)} · ${r.categoria}${r.location ? ' · ' + r.location : ''}` : '—';
});
dash.draw('s-curve-label', (el) => { const r = meAct(); el.textContent = r && r.categoria === 'Carrera' ? 'Ritmo' : 'Velocidad'; });

dash.draw('s-stats', (el) => {
  const r = meAct(), sd = dash.data('sesion');
  const s = sd.status === 'ok' && sd.data[0] ? sd.data[0] : null;
  if (!r) return el.replaceChildren(ME.el('p', 'me-muted', '—'));
  const items = [];
  const add = (label, value, unit, src, field, rowAttr) => {
    if (value == null || value === '') return;
    const box = ME.el('div', 'me-stat');
    const v = ME.el('span', 'me-stat-v', String(value));
    if (src) { v.dataset.source = src; v.dataset.field = field; if (rowAttr) v.dataset.where = rowAttr; else v.dataset.row = '0'; }
    if (unit) v.appendChild(ME.el('span', 'me-kpi-unit', unit));
    box.append(ME.el('span', 'me-stat-l', label), v);
    items.push(box);
  };
  const where = 'id=' + encodeURIComponent(r.id);
  if (ME.hasDist(r)) add('Distancia', ME.fmtNum(r.distance_km, 2), 'km', 'activities', 'distance_km', where);
  add('Tiempo en movimiento', r.duracion, '', 'activities', 'duracion', where);
  if (r.pace) add(r.categoria === 'Natación' ? 'Ritmo /100 m' : 'Ritmo medio', r.pace.replace(/ \/(km|100m)$/, ''), r.categoria === 'Natación' ? '/100 m' : '/km', 'activities', 'pace', where);
  else if (ME.hasDist(r) && r.moving_s) add('Velocidad media', ME.fmtNum(r.distance_km / (r.moving_s / 3600)), 'km/h');
  if (s && s.fc_media != null) add('FC media', s.fc_media, 'lpm', 'sesion', 'fc_media');
  if (s && s.fc_max != null) add('FC máxima', s.fc_max, 'lpm', 'sesion', 'fc_max');
  if (s && s.vatios_media != null) add('Potencia media', s.vatios_media, 'W', 'sesion', 'vatios_media');
  if (r.elevation_m > 0) add('Desnivel', Math.round(r.elevation_m), 'm', 'activities', 'elevation_m', where);
  if (r.relative_effort != null) add('Esfuerzo relativo', r.relative_effort, '', 'activities', 'relative_effort', where);
  if (r.calories != null) add('Calorías', r.calories, 'kcal', 'activities', 'calories', where);
  if (s && s.cadencia) add(r.categoria === 'Carrera' ? 'Cadencia (pasos/min)' : 'Cadencia', r.categoria === 'Carrera' ? s.cadencia * 2 : s.cadencia, r.categoria === 'Carrera' ? 'ppm' : 'rpm');
  el.replaceChildren(...items);
});

dash.draw('s-lectura', (el) => {
  const d = dash.data('sesion_lectura');
  if (!ME.status(el, d, 'la lectura del entrenamiento')) return;
  if (!d.data.length) return el.replaceChildren(ME.el('li', 'me-empty', 'No hay suficientes datos para comparar esta sesión.'));
  el.replaceChildren(...d.data.map((r) => { const li = ME.el('li', 'me-read is-' + r.tono); li.append(ME.el('i', 'me-read-mark'), ME.el('span', '', r.texto)); return li; }));
});

// ---------- Gráficos de la sesión ----------
const meSvg = (el, H, label) => { el.replaceChildren(); return d3.select(el).append('svg').attr('width', '100%').attr('height', H).attr('viewBox', `0 0 ${el.clientWidth} ${H}`).attr('role', 'img').attr('aria-label', label); };
const meZoneIdx = (h) => { const z = dash.data('zonas_fc'); if (z.status !== 'ok') return 0; for (let k = z.data.length - 1; k >= 0; k--) if (h >= Number(z.data[k].min)) return k; return 0; };

dash.draw('chart-s-curve', (el) => {
  const d = dash.data('sesion_curva');
  if (!ME.status(el, d, 'las series del entrenamiento')) return;
  const r = meAct();
  const isRun = r && r.categoria === 'Carrera';
  const useDist = d.data.some((c) => c.dist_km > 0.2) && r && ME.hasDist(r);
  const pts = d.data.filter((c) => c.fc || c.vel_kmh);
  if (pts.length < 5) return el.replaceChildren(ME.el('p', 'me-muted', 'Esta sesión no tiene series de FC ni velocidad.'));
  const xv = (c) => (useDist ? c.dist_km : c.min);
  const W = el.clientWidth, H = 260;
  const svg = meSvg(el, H, 'Frecuencia cardíaca y velocidad a lo largo de la sesión');
  const hrPts = pts.filter((c) => c.fc > 40);
  const spd = pts.map((c) => ({ x: xv(c), v: isRun ? (c.vel_kmh > 3 ? 3600 / c.vel_kmh : null) : c.vel_kmh })).filter((c) => c.v != null);
  // suavizado simple de 5 puntos para la velocidad
  const sm = spd.map((c, i) => { const w = spd.slice(Math.max(0, i - 2), i + 3); return { x: c.x, v: w.reduce((s, q) => s + q.v, 0) / w.length }; });
  const hrExt = d3.extent(hrPts, (c) => c.fc);
  const yH = d3.scaleLinear().domain([Math.max(40, (hrExt[0] || 60) - 5), (hrExt[1] || 180) + 5]).nice().range([H - 26, 10]);
  let yS;
  if (isRun) { const e = d3.extent(sm, (c) => c.v); yS = d3.scaleLinear().domain([Math.min(600, e[1] + 10), Math.max(150, e[0] - 10)]).range([H - 26, 10]); }
  else yS = d3.scaleLinear().domain([0, (d3.max(sm, (c) => c.v) || 30) * 1.1]).nice().range([H - 26, 10]);
  const ml = ME.textWidth(svg, yH.ticks(4).map(String)) + 10;
  const sFmt = isRun ? ME.fmtPace : (v) => String(Math.round(v));
  const mr = ME.textWidth(svg, yS.ticks(4).map(sFmt)) + 10;
  const x = d3.scaleLinear().domain(d3.extent(pts, xv)).range([ml, W - mr]);
  svg.append('g').attr('transform', `translate(${ml},0)`).call(d3.axisLeft(yH).ticks(4).tickSize(-(W - ml - mr))).call((g) => g.select('.domain').remove());
  svg.append('g').attr('transform', `translate(${W - mr},0)`).call(d3.axisRight(yS).ticks(4).tickFormat(sFmt).tickSize(0)).call((g) => g.select('.domain').remove());
  svg.append('g').attr('transform', `translate(0,${H - 26})`).call(d3.axisBottom(x).ticks(W < 420 ? 4 : 8).tickFormat((v) => useDist ? `${v} km` : `${v} min`).tickSizeOuter(0));
  if (sm.length) svg.append('path').datum(sm).attr('d', d3.line().x((c) => x(c.x)).y((c) => yS(c.v))).style('fill', 'none').style('stroke', dash.colors[1 % dash.colors.length]).style('stroke-width', 1.75);
  if (hrPts.length) svg.append('path').datum(hrPts).attr('d', d3.line().x((c) => x(xv(c))).y((c) => yH(c.fc))).style('fill', 'none').style('stroke', dash.colors[0]).style('stroke-width', 2);
  const tp = ME.tip(el);
  const guide = svg.append('line').attr('class', 'me-ref').attr('y1', 10).attr('y2', H - 26).style('opacity', 0);
  const bis = d3.bisector(xv).center;
  svg.append('rect').attr('x', ml).attr('y', 0).attr('width', Math.max(0, W - ml - mr)).attr('height', H - 26).style('fill', 'transparent')
    .on('pointermove', (ev) => {
      const [px, py] = d3.pointer(ev, el);
      const c = pts[bis(pts, x.invert(px))];
      guide.attr('x1', x(xv(c))).attr('x2', x(xv(c))).style('opacity', 1);
      const lines = [useDist ? `Km ${ME.fmtNum(c.dist_km, 2)} · min ${ME.fmtNum(c.min)}` : `Minuto ${ME.fmtNum(c.min)}`];
      if (c.fc) lines.push(`FC ${c.fc} lpm`);
      if (c.vel_kmh) lines.push(isRun && c.vel_kmh > 3 ? `Ritmo ${ME.fmtPace(3600 / c.vel_kmh)} /km` : `${ME.fmtNum(c.vel_kmh)} km/h`);
      if (c.vatios != null) lines.push(`${c.vatios} W`);
      if (c.alt_m != null) lines.push(`Altitud ${Math.round(c.alt_m)} m`);
      tp.show(lines, px, py);
    })
    .on('pointerleave', () => { tp.hide(); guide.style('opacity', 0); });
});

dash.draw('chart-s-laps', (el) => {
  const d = dash.data('sesion_vueltas');
  if (!ME.status(el, d, 'las vueltas')) return;
  const laps = d.data.filter((l) => l.tiempo_s > 0 && l.fc_media != null);
  if (!laps.length) return el.replaceChildren(ME.el('p', 'me-muted', 'Las vueltas de esta sesión no tienen FC.'));
  const W = el.clientWidth, H = 230, svg = meSvg(el, H, 'FC media de cada vuelta');
  const tot = laps.reduce((s, l) => s + l.tiempo_s, 0);
  const y = d3.scaleLinear().domain([Math.max(60, d3.min(laps, (l) => l.fc_media) - 15), d3.max(laps, (l) => l.fc_media) + 5]).nice().range([H - 26, 10]);
  const ml = ME.textWidth(svg, y.ticks(4).map(String)) + 10;
  const x = d3.scaleLinear().domain([0, tot / 60]).range([ml, W - 4]);
  svg.append('g').attr('transform', `translate(${ml},0)`).call(d3.axisLeft(y).ticks(4).tickSize(-(W - ml - 4))).call((g) => g.select('.domain').remove());
  svg.append('g').attr('transform', `translate(0,${H - 26})`).call(d3.axisBottom(x).ticks(W < 420 ? 4 : 7).tickFormat((v) => `${v} min`).tickSizeOuter(0));
  let acc = 0;
  const bars = laps.map((l) => { const b = { ...l, x0: acc / 60, x1: (acc + l.tiempo_s) / 60 }; acc += l.tiempo_s; return b; });
  const tp = ME.tip(el);
  svg.append('g').selectAll('rect').data(bars).join('rect')
    .attr('x', (b) => x(b.x0) + 0.5).attr('width', (b) => Math.max(1, x(b.x1) - x(b.x0) - 1)).attr('y', (b) => y(b.fc_media)).attr('height', (b) => y.range()[0] - y(b.fc_media))
    .style('fill', (b) => ME.ZONE_COLORS[meZoneIdx(b.fc_media)])
    .on('pointerenter pointermove', (ev, b) => {
      const [px, py] = d3.pointer(ev, el);
      const lines = [`Vuelta ${b.vuelta} · ${b.tiempo}${b.distancia_km ? ' · ' + ME.fmtNum(b.distancia_km, 2) + ' km' : ''}`, `FC ${b.fc_media} lpm (máx. ${b.fc_max ?? '—'}) · Z${meZoneIdx(b.fc_media) + 1}`];
      if (b.ritmo) lines.push(`Ritmo ${b.ritmo}`); else if (b.vel_kmh) lines.push(`${ME.fmtNum(b.vel_kmh)} km/h`);
      if (b.vatios != null) lines.push(`${b.vatios} W`);
      tp.show(lines, px, py);
    })
    .on('pointerleave', () => tp.hide());
});

dash.draw('chart-s-zones', (el) => {
  const d = dash.data('sesion_zonas');
  if (!ME.status(el, d, 'las zonas de la sesión')) return;
  const rows = d.data;
  if (!rows.some((r) => r.minutos > 0)) return el.replaceChildren(ME.el('p', 'me-muted', 'Esta sesión no tiene datos de FC.'));
  const W = el.clientWidth, bh = 26, H = rows.length * (bh + 10) + 10, svg = meSvg(el, H, 'Minutos en cada zona de FC durante la sesión');
  const ml = ME.textWidth(svg, rows.map((r) => r.zona)) + 12;
  const labels = rows.map((r) => `${ME.fmtNum(r.minutos)} min · ${r.pct} %`);
  const mr = ME.textWidth(svg, labels) + 10;
  const x = d3.scaleLinear().domain([0, d3.max(rows, (r) => r.minutos) || 1]).range([0, Math.max(40, W - ml - mr)]);
  const g = svg.append('g').selectAll('g').data(rows).join('g').attr('transform', (_, i) => `translate(0,${10 + i * (bh + 10)})`);
  g.append('text').attr('class', 'me-axl').attr('x', ml - 10).attr('y', bh / 2).attr('dy', '0.35em').attr('text-anchor', 'end').text((r) => r.zona);
  g.append('rect').attr('x', ml).attr('height', bh).attr('rx', 3).attr('width', (r) => Math.max(r.minutos ? 2 : 0, x(r.minutos))).style('fill', (_, i) => ME.ZONE_COLORS[i]);
  g.append('text').attr('class', 'me-val').attr('x', (r) => ml + Math.max(2, x(r.minutos)) + 6).attr('y', bh / 2).attr('dy', '0.35em').text((_, i) => labels[i]);
});

dash.draw('s-laps-table', (el) => {
  const d = dash.data('sesion_vueltas');
  if (d.status !== 'ok') return el.replaceChildren();
  const show = (v) => (v == null || v === '' ? '—' : String(v));
  el.replaceChildren(...d.data.map((l) => {
    const tr = document.createElement('tr');
    tr.append(...[[l.vuelta], [l.distancia_km != null ? l.distancia_km.toFixed(2) : '—'], [l.tiempo], [show(l.ritmo)], [l.vel_kmh != null ? l.vel_kmh.toFixed(1) : '—'], [show(l.fc_media)], [show(l.fc_max)], [show(l.vatios)], [show(l.desnivel_m)]].map(([v]) => ME.el('td', 'me-num', String(v))));
    return tr;
  }));
});

dash.draw('s-marcas', (el) => {
  const d = dash.data('sesion_marcas');
  document.querySelectorAll('#s-marcas-empty').forEach((e) => { e.hidden = d.status !== 'ok' || d.data.length > 0; });
  if (d.status !== 'ok') return el.replaceChildren();
  el.replaceChildren(...d.data.map((m, i) => {
    const p = ME.el('span', 'me-pill');
    const v = ME.el('b', '', m.valor); v.dataset.source = 'sesion_marcas'; v.dataset.field = 'valor'; v.dataset.row = String(i);
    p.append(ME.el('span', 'me-muted', m.esfuerzo), v);
    return p;
  }));
});
