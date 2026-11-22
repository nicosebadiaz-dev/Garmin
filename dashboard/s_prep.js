// ================= RESUMEN: carrera y progreso =================
dash.calc('carrera_prep', {
  inputs: ['activities', 'carreras_cd'],
  title: 'Volumen hacia la próxima carrera',
  description: 'Km corriendo por semana (lunes a domingo) en las 12 semanas previas y las semanas que faltan hasta tu próxima carrera; las 2 semanas antes de la carrera se marcan como descarga.',
  fn: (activities, carreras) => {
    const next = carreras.filter((c) => c.dias >= 0).sort((a, b) => a.dias - b.dias)[0];
    if (!next) return [];
    const DAY = 86400000, now = new Date();
    const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
    const mon = (t) => t - ((new Date(t).getUTCDay() + 6) % 7) * DAY;
    const thisMon = mon(today);
    const [y, m, d] = next.fecha.split('-').map(Number);
    const raceMon = mon(Date.UTC(y, m - 1, d));
    const start = thisMon - 11 * 7 * DAY;
    const end = Math.min(raceMon, thisMon + 52 * 7 * DAY);
    const km = {};
    for (const r of activities) {
      if (r.categoria !== 'Carrera' || !r.day) continue;
      const [yy, mm, dd] = r.day.split('-').map(Number);
      const w = mon(Date.UTC(yy, mm - 1, dd));
      if (w >= start) km[w] = (km[w] || 0) + (Number(r.distance_km) || 0);
    }
    const out = [];
    for (let w = start; w <= end; w += 7 * DAY) {
      out.push({ semana: new Date(w).toISOString().slice(0, 10), km: w <= thisMon ? Math.round((km[w] || 0) * 10) / 10 : null, futura: w > thisMon, descarga: w >= raceMon - 14 * DAY && w < raceMon, carrera: w === raceMon, nombre: next.nombre, fecha: next.fecha, dias: next.dias });
    }
    return out;
  }
});

const mePR = (id) => { const d = dash.data(id); return d.status === 'ok' && Array.isArray(d.data) && d.data[0] ? d.data[0] : null; };
const mePT = (el, v) => { el.textContent = v == null ? '—' : String(v); };

dash.draw('k-eff', (el) => { const r = mePR('eficiencia_resumen'); mePT(el, r && r.reciente != null ? ME.fmtNum(r.reciente, 2) : null); });
dash.draw('k-eff-delta', (el) => {
  const r = mePR('eficiencia_resumen');
  el.className = 'me-kpi-sub';
  if (!r || r.cambio_pct == null) return mePT(el, 'Sin datos para comparar');
  el.classList.add(r.cambio_pct >= 0 ? 'me-good' : 'me-bad');
  mePT(el, `${r.cambio_pct >= 0 ? '▲ +' : '▼ '}${ME.fmtNum(r.cambio_pct, 1)} % vs. 8 semanas previas`);
});
const meNextRace = () => { const d = dash.data('carreras_cd'); return d.status === 'ok' ? d.data.find((c) => c.dias >= 0) : null; };
dash.draw('k-race-days', (el) => { const c = meNextRace(); mePT(el, c ? c.dias : null); });
dash.draw('k-race-name', (el) => {
  const d = dash.data('carreras_cd'), c = meNextRace();
  mePT(el, c ? `${c.nombre} · ${ME.fmtDate.format(ME.keyToUTC(c.fecha))}` : d.status === 'ok' ? 'Agrega una más abajo' : null);
});
dash.draw('prep-sub', (el) => {
  const c = meNextRace();
  mePT(el, c ? `${c.nombre}, ${ME.fmtDate.format(ME.keyToUTC(c.fecha))} · ${ME.fmtNum(c.distancia_km, c.distancia_km % 1 ? 2 : 0)} km${c.prediccion ? ' · tiempo estimado ' + c.prediccion : ''}` : 'Sin carrera anotada');
});

dash.draw('chart-prep', (el) => {
  const d = dash.data('carrera_prep');
  const has = d.status === 'ok' && d.data.length > 0;
  document.querySelectorAll('#prep-empty').forEach((e) => { e.hidden = d.status !== 'ok' || has; });
  document.querySelectorAll('#prep-legend').forEach((e) => { e.hidden = !has; });
  if (d.status === 'error') return ME.status(el, d, 'el volumen hacia la carrera');
  if (!has) return el.replaceChildren();
  const rows = d.data;
  const W = el.clientWidth, H = 230;
  el.replaceChildren();
  const svg = d3.select(el).append('svg').attr('width', '100%').attr('height', H).attr('viewBox', `0 0 ${W} ${H}`).attr('role', 'img').attr('aria-label', 'Km corriendo por semana hasta la próxima carrera');
  const done = rows.filter((r) => !r.futura);
  const maxKm = d3.max(done, (r) => r.km) || 10;
  const y = d3.scaleLinear().domain([0, maxKm * 1.2]).nice().range([H - 26, 12]);
  const ml = ME.textWidth(svg, y.ticks(4).map(String)) + 10;
  const x = d3.scaleBand().domain(rows.map((r) => r.semana)).range([ml, W - 4]).padding(0.2);
  svg.append('g').attr('transform', `translate(${ml},0)`).call(d3.axisLeft(y).ticks(4).tickSize(-(W - ml - 4))).call((g) => g.select('.domain').remove());
  const n = rows.length, every = Math.max(1, Math.ceil(n / (W < 420 ? 5 : 9)));
  svg.append('g').attr('transform', `translate(0,${H - 26})`).call(d3.axisBottom(x).tickValues(rows.map((r) => r.semana).filter((_, i) => (n - 1 - i) % every === 0)).tickFormat((s) => ME.fmtShort.format(ME.keyToUTC(s))).tickSizeOuter(0));
  const avg4 = d3.mean(done.slice(-4), (r) => r.km) || 0;
  const tp = ME.tip(el);
  svg.append('g').selectAll('rect').data(rows).join('rect')
    .attr('x', (r) => x(r.semana)).attr('width', x.bandwidth())
    .attr('y', (r) => (r.futura ? y(avg4 * (r.descarga ? 0.6 : 1)) : y(r.km)))
    .attr('height', (r) => (r.futura ? y(0) - y(avg4 * (r.descarga ? 0.6 : 1)) : y(0) - y(r.km))).attr('rx', 2)
    .style('fill', (r) => (r.futura ? 'transparent' : dash.colors[0]))
    .style('stroke', (r) => (r.futura ? (r.descarga ? 'var(--color-warn)' : 'var(--cds-chart-muted)') : 'none'))
    .style('stroke-dasharray', (r) => (r.futura ? '3 2' : null))
    .on('pointerenter pointermove', (ev, r) => {
      const [px, py] = d3.pointer(ev, el);
      const lines = [`Semana del ${ME.fmtShort.format(ME.keyToUTC(r.semana))}`];
      if (!r.futura) lines.push(`${ME.fmtNum(r.km)} km corriendo`);
      else lines.push(r.carrera ? 'Semana de la carrera' : r.descarga ? `Descarga: unos ${ME.fmtNum(avg4 * 0.6)} km (60 % de tu media)` : `Referencia: tu media de 4 semanas, ${ME.fmtNum(avg4)} km`);
      tp.show(lines, px, py);
    })
    .on('pointerleave', () => tp.hide());
  const last = rows[rows.length - 1];
  svg.append('text').attr('class', 'me-val').attr('x', x(last.semana) + x.bandwidth()).attr('y', 10).attr('text-anchor', 'end').text('Carrera: ' + ME.fmtShort.format(ME.keyToUTC(last.fecha)));
});
