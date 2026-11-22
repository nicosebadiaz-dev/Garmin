// ---------- Textos y tarjetas ----------
const meRow0 = (id) => { const d = dash.data(id); return d.status === 'ok' && Array.isArray(d.data) && d.data[0] ? d.data[0] : null; };
const meSet = (el, v) => { el.textContent = v == null ? '—' : v; };

dash.draw('t-km', (el) => { const k = meRow0('kpis'); meSet(el, k && ME.fmtNum(k.km28)); });
dash.draw('t-runs', (el) => { const k = meRow0('kpis'); meSet(el, k && k.salidas28); });
dash.draw('t-pct', (el) => {
  const k = meRow0('kpis');
  document.querySelectorAll('.me-cmp').forEach((c) => { c.hidden = !k || k.cambio_pct == null; });
  meSet(el, k && k.cambio_pct != null ? Math.abs(k.cambio_pct) : null);
});
dash.draw('t-dir', (el) => { const k = meRow0('kpis'); meSet(el, k && k.cambio_pct != null ? (k.cambio_pct >= 0 ? 'más' : 'menos') : null); });
dash.draw('t-streak', (el) => { const s = meRow0('streak'); meSet(el, s && s.semanas); });
dash.draw('k-km', (el) => { const k = meRow0('kpis'); meSet(el, k && ME.fmtNum(k.km28)); });
dash.draw('k-km-prev', (el) => { const k = meRow0('kpis'); meSet(el, k && ME.fmtNum(k.km_prev)); });
dash.draw('k-km-delta', (el) => {
  const k = meRow0('kpis');
  el.className = '';
  if (!k || k.cambio_pct == null) return meSet(el, null);
  el.className = k.cambio_pct >= 0 ? 'me-good' : 'me-bad';
  meSet(el, `${k.cambio_pct >= 0 ? '▲ +' : '▼ '}${k.cambio_pct}%`);
});
dash.draw('k-streak', (el) => { const s = meRow0('streak'); meSet(el, s && s.semanas); });
dash.draw('k-streak-since', (el) => { const s = meRow0('streak'); meSet(el, s && s.desde ? ME.fmtDate.format(ME.keyToUTC(s.desde)) : null); });
dash.draw('z-suave', (el) => { const z = meRow0('zonas_resumen'); meSet(el, z && z.pct_suave); });
dash.draw('z-medio', (el) => { const z = meRow0('zonas_resumen'); meSet(el, z && z.pct_moderado); });
dash.draw('z-alto', (el) => { const z = meRow0('zonas_resumen'); meSet(el, z && z.pct_intenso); });
dash.draw('z5min', (el) => { const d = dash.data('zonas_fc'); const z = d.status === 'ok' ? d.data.find((r) => r.zona === 'Z5') : null; meSet(el, z && z.min); });
dash.draw('z2min', (el) => { const d = dash.data('zonas_fc'); const z = d.status === 'ok' ? d.data.find((r) => r.zona === 'Z2') : null; meSet(el, z && z.min); });

dash.draw('constancia', (el) => {
  const d = dash.data('constancia');
  if (!ME.status(el, d, 'la constancia')) return;
  el.replaceChildren(...d.data.map((r) => {
    const p = ME.el('span', 'me-pill' + (r.dias == null || r.dias >= 30 ? ' is-bad' : r.dias >= 14 ? ' is-warn' : ' is-ok'));
    const dot = ME.el('i', 'me-dot'); dot.style.background = ME.color(r.categoria);
    p.append(dot, ME.el('span', '', r.dias == null ? `${r.categoria}: sin sesiones cargadas` : r.dias === 0 ? `${r.categoria}: hoy` : `${r.categoria}: hace ${r.dias} ${r.dias === 1 ? 'día' : 'días'}`));
    p.title = r.ultima ? `Última: ${r.ultima}` : '';
    return p;
  }));
});

// ---------- Calendario ----------
dash.draw('month-label', (el) => { el.textContent = ME.fmtMonth.format(ME.state.month); });

dash.draw('calendar', (el) => {
  const a = dash.data('act_f');
  if (a.status === 'error') return ME.status(el, a, 'tus actividades');
  const acts = new Map();
  if (a.status === 'ok') for (const r of a.data) { if (!acts.has(r.day)) acts.set(r.day, []); acts.get(r.day).push(r); }
  for (const v of acts.values()) v.sort((x, y) => x.start_local.localeCompare(y.start_local));
  const DAY = 86400000, m0 = ME.state.month;
  const offset = (m0.getUTCDay() + 6) % 7;
  const start = new Date(m0.getTime() - offset * DAY);
  const nextMonth = new Date(Date.UTC(m0.getUTCFullYear(), m0.getUTCMonth() + 1, 1));
  const cells = [];
  for (let w = 0; w < 6; w++) {
    const wkStart = new Date(start.getTime() + w * 7 * DAY);
    if (w > 3 && wkStart >= nextMonth) break;
    let wkSec = 0, wkRun = 0;
    for (let d = 0; d < 7; d++) {
      const dt = new Date(wkStart.getTime() + d * DAY), key = ME.utcKey(dt);
      const list = acts.get(key) || [];
      const c0 = ME.el('div', 'me-day' + (dt.getUTCMonth() !== m0.getUTCMonth() ? ' is-out' : '') + (key === ME.todayKey ? ' is-today' : ''));
      c0.setAttribute('aria-label', `${ME.fmtLong.format(dt)}: ${list.length} actividades`);
      c0.appendChild(ME.el('span', 'me-dnum', dt.getUTCDate()));
      const dots = ME.el('span', 'me-dots');
      for (const r of list) {
        wkSec += Number(r.moving_s) || 0;
        if (r.categoria === 'Carrera') wkRun += Number(r.distance_km) || 0;
        const c = ME.el('span', 'me-chip');
        c.title = `${r.name} · ${r.duracion}${r.pace ? ' · ' + r.pace : ''}`;
        const dot = ME.el('i', 'me-dot'); dot.style.background = ME.color(r.categoria);
        c.append(dot, ME.el('span', 'me-chip-t', ME.chipText(r)));
        c0.appendChild(c);
        const dd = ME.el('i', 'me-dot'); dd.style.background = ME.color(r.categoria); dots.appendChild(dd);
      }
      c0.appendChild(dots);
      cells.push(c0);
    }
    const wk = ME.el('div', 'me-wk');
    wk.append(ME.el('b', '', wkSec ? `${ME.fmtNum(wkSec / 3600)} h` : '—'), ME.el('span', '', wkRun ? `${ME.fmtNum(wkRun)} km corr.` : ''));
    cells.push(wk);
  }
  el.replaceChildren(...cells);
});

// ---------- Gráficos ----------
const meSvg = (el, H, label) => { el.replaceChildren(); return d3.select(el).append('svg').attr('width', '100%').attr('height', H).attr('viewBox', `0 0 ${el.clientWidth} ${H}`).attr('role', 'img').attr('aria-label', label); };
const meWeekAxis = (svg, x, H, weeks, W) => {
  const every = W < 420 ? 3 : 2;
  svg.append('g').attr('transform', `translate(0,${H - 26})`).call(d3.axisBottom(x).tickValues(weeks.filter((_, i) => (weeks.length - 1 - i) % every === 0)).tickFormat((s) => ME.fmtShort.format(ME.keyToUTC(s))).tickSizeOuter(0));
};

dash.draw('chart-runkm', (el) => {
  const d = dash.data('weekly');
  if (!ME.status(el, d, 'el volumen semanal')) return;
  const rows = d.data.filter((r) => r.categoria === 'Carrera');
  const W = el.clientWidth, H = 230, svg = meSvg(el, H, 'Kilómetros de carrera por semana en las últimas 16 semanas');
  const y = d3.scaleLinear().domain([0, (d3.max(rows, (r) => r.km) || 10) * 1.15]).nice().range([H - 26, 10]);
  const ml = ME.textWidth(svg, y.ticks(4).map(String)) + 10;
  const x = d3.scaleBand().domain(rows.map((r) => r.semana)).range([ml, W - 4]).padding(0.25);
  svg.append('g').attr('transform', `translate(${ml},0)`).call(d3.axisLeft(y).ticks(4).tickSize(-(W - ml - 4))).call((g) => g.select('.domain').remove());
  meWeekAxis(svg, x, H, x.domain(), W);
  const tp = ME.tip(el);
  svg.append('g').selectAll('rect').data(rows).join('rect')
    .attr('x', (r) => x(r.semana)).attr('width', x.bandwidth()).attr('y', (r) => y(r.km)).attr('height', (r) => y(0) - y(r.km)).attr('rx', 2)
    .style('fill', dash.colors[0])
    .on('pointerenter pointermove', (ev, r) => { const [px, py] = d3.pointer(ev, el); tp.show([`Semana del ${ME.fmtShort.format(ME.keyToUTC(r.semana))}`, `${ME.fmtNum(r.km)} km corriendo`], px, py); })
    .on('pointerleave', () => tp.hide());
  const last = rows[rows.length - 1];
  if (last) svg.append('text').attr('class', 'me-val').attr('x', x(last.semana) + x.bandwidth()).attr('y', y(last.km) - 5).attr('text-anchor', 'end').text(`${ME.fmtNum(last.km)} km`);
});

dash.draw('chart-hours', (el) => {
  const d = dash.data('weekly');
  if (!ME.status(el, d, 'el volumen semanal')) return;
  const weeks = [...new Set(d.data.map((r) => r.semana))];
  const table = weeks.map((w) => { const o = { semana: w }; for (const c of ME.CATS) o[c] = 0; for (const r of d.data) if (r.semana === w) o[r.categoria] = r.horas; return o; });
  const series = d3.stack().keys(ME.CATS)(table);
  const W = el.clientWidth, H = 230, svg = meSvg(el, H, 'Horas de entrenamiento por semana, separadas por deporte');
  const y = d3.scaleLinear().domain([0, (d3.max(table, (o) => ME.CATS.reduce((s, c) => s + o[c], 0)) || 1) * 1.1]).nice().range([H - 26, 10]);
  const ml = ME.textWidth(svg, y.ticks(4).map((v) => v + ' h')) + 10;
  const x = d3.scaleBand().domain(weeks).range([ml, W - 4]).padding(0.25);
  svg.append('g').attr('transform', `translate(${ml},0)`).call(d3.axisLeft(y).ticks(4).tickFormat((v) => v + ' h').tickSize(-(W - ml - 4))).call((g) => g.select('.domain').remove());
  meWeekAxis(svg, x, H, weeks, W);
  const tp = ME.tip(el);
  svg.append('g').selectAll('g').data(series).join('g').style('fill', (s) => ME.color(s.key))
    .selectAll('rect').data((s) => s).join('rect')
    .attr('x', (p) => x(p.data.semana)).attr('width', x.bandwidth()).attr('y', (p) => y(p[1])).attr('height', (p) => Math.max(0, y(p[0]) - y(p[1])))
    .on('pointerenter pointermove', (ev, p) => {
      const [px, py] = d3.pointer(ev, el), o = p.data;
      const lines = [`Semana del ${ME.fmtShort.format(ME.keyToUTC(o.semana))}: ${ME.fmtNum(ME.CATS.reduce((s, c) => s + o[c], 0))} h`];
      for (const c of ME.CATS) if (o[c] > 0) lines.push(`${c}: ${ME.fmtNum(o[c])} h`);
      tp.show(lines, px, py);
    })
    .on('pointerleave', () => tp.hide());
});

dash.draw('chart-load', (el) => {
  const d = dash.data('carga');
  if (!ME.status(el, d, 'la carga')) return;
  const rows = d.data;
  if (!rows.length) return el.replaceChildren(ME.el('p', 'me-muted', 'Sin datos de esfuerzo.'));
  const W = el.clientWidth, H = 230, svg = meSvg(el, H, 'Carga aguda y crónica de los últimos 120 días');
  const y = d3.scaleLinear().domain([0, d3.max(rows, (r) => Math.max(r.aguda, r.cronica)) * 1.1 || 1]).nice().range([H - 26, 10]);
  const ml = ME.textWidth(svg, y.ticks(4).map(String)) + 10;
  const x = d3.scaleUtc().domain(d3.extent(rows, (r) => ME.keyToUTC(r.day))).range([ml, W - 8]);
  svg.append('g').attr('transform', `translate(${ml},0)`).call(d3.axisLeft(y).ticks(4).tickSize(-(W - ml - 8))).call((g) => g.select('.domain').remove());
  svg.append('g').attr('transform', `translate(0,${H - 26})`).call(d3.axisBottom(x).ticks(W < 420 ? 3 : 5).tickFormat((t) => ME.fmtShort.format(t)).tickSizeOuter(0));
  const line = (k) => d3.line().x((r) => x(ME.keyToUTC(r.day))).y((r) => y(r[k]));
  svg.append('path').datum(rows).attr('d', line('cronica')).style('fill', 'none').style('stroke', dash.colors[1 % dash.colors.length]).style('stroke-width', 2);
  svg.append('path').datum(rows).attr('d', line('aguda')).style('fill', 'none').style('stroke', dash.colors[0]).style('stroke-width', 2);
  const last = rows[rows.length - 1];
  svg.append('circle').attr('cx', x(ME.keyToUTC(last.day))).attr('cy', y(last.aguda)).attr('r', 3.5).style('fill', dash.colors[0]);
  const tp = ME.tip(el);
  const guide = svg.append('line').attr('class', 'me-ref').attr('y1', 10).attr('y2', H - 26).style('opacity', 0);
  const bis = d3.bisector((r) => ME.keyToUTC(r.day)).center;
  svg.append('rect').attr('x', ml).attr('y', 0).attr('width', W - ml).attr('height', H - 26).style('fill', 'transparent')
    .on('pointermove', (ev) => {
      const [px, py] = d3.pointer(ev, el);
      const r = rows[bis(rows, x.invert(px))];
      guide.attr('x1', x(ME.keyToUTC(r.day))).attr('x2', x(ME.keyToUTC(r.day))).style('opacity', 1);
      tp.show([ME.fmtDate.format(ME.keyToUTC(r.day)), `Aguda ${ME.fmtNum(r.aguda)} · Crónica ${ME.fmtNum(r.cronica)}`, `Cociente ${r.ratio != null ? ME.fmtNum(r.ratio, 2) : '—'} · Esfuerzo del día ${r.esfuerzo}`], px, py);
    })
    .on('pointerleave', () => { tp.hide(); guide.style('opacity', 0); });
});

dash.draw('chart-zones', (el) => {
  const d = dash.data('zonas_semana');
  if (!ME.status(el, d, 'las zonas de frecuencia cardíaca')) return;
  const zones = ['Z1', 'Z2', 'Z3', 'Z4', 'Z5'];
  const weeks = [...new Set(d.data.map((r) => r.semana))];
  const table = weeks.map((w) => { const o = { semana: w }; for (const z of zones) o[z] = 0; for (const r of d.data) if (r.semana === w) o[r.zona] = r.horas; return o; });
  const series = d3.stack().keys(zones)(table);
  const W = el.clientWidth, H = 230, svg = meSvg(el, H, 'Horas de carrera por zona de frecuencia cardíaca en las últimas 6 semanas');
  const y = d3.scaleLinear().domain([0, (d3.max(table, (o) => zones.reduce((s, z) => s + o[z], 0)) || 1) * 1.1]).nice().range([H - 26, 10]);
  const ml = ME.textWidth(svg, y.ticks(4).map((v) => v + ' h')) + 10;
  const x = d3.scaleBand().domain(weeks).range([ml, W - 4]).padding(0.3);
  svg.append('g').attr('transform', `translate(${ml},0)`).call(d3.axisLeft(y).ticks(4).tickFormat((v) => v + ' h').tickSize(-(W - ml - 4))).call((g) => g.select('.domain').remove());
  svg.append('g').attr('transform', `translate(0,${H - 26})`).call(d3.axisBottom(x).tickFormat((s) => ME.fmtShort.format(ME.keyToUTC(s))).tickSizeOuter(0));
  const tp = ME.tip(el);
  svg.append('g').selectAll('g').data(series).join('g').style('fill', (s) => ME.ZONE_COLORS[zones.indexOf(s.key)])
    .selectAll('rect').data((s) => s.map((p) => Object.assign(p, { z: s.key }))).join('rect')
    .attr('x', (p) => x(p.data.semana)).attr('width', x.bandwidth()).attr('y', (p) => y(p[1])).attr('height', (p) => Math.max(0, y(p[0]) - y(p[1])))
    .on('pointerenter pointermove', (ev, p) => {
      const [px, py] = d3.pointer(ev, el);
      const rows = d.data.filter((r) => r.semana === p.data.semana && r.horas > 0);
      tp.show([`Semana del ${ME.fmtShort.format(ME.keyToUTC(p.data.semana))}`, ...rows.map((r) => `${r.zona}: ${ME.fmtNum(r.horas, 2)} h (${r.pct}%)`)], px, py);
    })
    .on('pointerleave', () => tp.hide());
});

dash.draw('chart-pace', (el) => {
  const d = dash.data('activities');
  if (!ME.status(el, d, 'tus carreras')) return;
  const runs = d.data.filter((r) => r.categoria === 'Carrera' && r.pace_s_km >= 180 && r.pace_s_km <= 600 && r.distance_km >= 1);
  if (!runs.length) return el.replaceChildren(ME.el('p', 'me-muted', 'No hay carreras en este periodo.'));
  const W = el.clientWidth, H = 230, svg = meSvg(el, H, 'Ritmo medio de cada carrera a lo largo del tiempo');
  const ext = d3.extent(runs, (r) => r.pace_s_km);
  const y = d3.scaleLinear().domain([ext[1] + 15, ext[0] - 15]).range([H - 26, 12]);
  const ml = ME.textWidth(svg, y.ticks(5).map(ME.fmtPace)) + 10;
  const x = d3.scaleUtc().domain(d3.extent(runs, (r) => ME.keyToUTC(r.day))).range([ml + 8, W - 10]);
  const rs = d3.scaleSqrt().domain([0, d3.max(runs, (q) => q.distance_km)]).range([0, W < 420 ? 8 : 11]);
  svg.append('g').attr('transform', `translate(${ml},0)`).call(d3.axisLeft(y).ticks(5).tickFormat(ME.fmtPace).tickSize(-(W - ml - 4))).call((g) => g.select('.domain').remove());
  svg.append('g').attr('transform', `translate(0,${H - 26})`).call(d3.axisBottom(x).ticks(W < 420 ? 3 : 6).tickFormat((t) => new Intl.DateTimeFormat('es', { month: 'short', timeZone: 'UTC' }).format(t)).tickSizeOuter(0));
  const tp = ME.tip(el);
  svg.append('g').selectAll('circle').data(runs).join('circle')
    .attr('cx', (q) => x(ME.keyToUTC(q.day))).attr('cy', (q) => y(q.pace_s_km)).attr('r', (q) => Math.max(2.5, rs(q.distance_km)))
    .style('fill', dash.colors[0]).style('fill-opacity', 0.55).style('stroke', dash.colors[0])
    .on('pointerenter pointermove', (ev, q) => { const [px, py] = d3.pointer(ev, el); tp.show([`${ME.fmtShort.format(ME.keyToUTC(q.day))} · ${q.name}`, `${q.pace} · ${ME.fmtNum(q.distance_km, 2)} km`], px, py); })
    .on('pointerleave', () => tp.hide());
});

dash.draw('chart-sports', (el) => {
  const d = dash.data('deportes90');
  if (!ME.status(el, d, 'el reparto por deporte')) return;
  const rows = d.data;
  if (!rows.length) return el.replaceChildren(ME.el('p', 'me-muted', 'Sin actividades en los últimos 90 días.'));
  const W = el.clientWidth, bh = 26, H = rows.length * (bh + 10) + 10, svg = meSvg(el, H, 'Horas por deporte en los últimos 90 días');
  const ml = ME.textWidth(svg, rows.map((q) => q.categoria)) + 12;
  const labels = rows.map((q) => `${ME.fmtNum(q.horas)} h · ${q.sesiones}`);
  const mr = ME.textWidth(svg, labels) + 10;
  const x = d3.scaleLinear().domain([0, d3.max(rows, (q) => q.horas) || 1]).range([0, Math.max(40, W - ml - mr)]);
  const g = svg.append('g').selectAll('g').data(rows).join('g').attr('transform', (_, i) => `translate(0,${10 + i * (bh + 10)})`);
  g.append('text').attr('class', 'me-axl').attr('x', ml - 10).attr('y', bh / 2).attr('dy', '0.35em').attr('text-anchor', 'end').text((q) => q.categoria);
  g.append('rect').attr('x', ml).attr('height', bh).attr('rx', 3).attr('width', (q) => Math.max(2, x(q.horas))).style('fill', (q) => ME.color(q.categoria));
  g.append('text').attr('class', 'me-val').attr('x', (q) => ml + Math.max(2, x(q.horas)) + 6).attr('y', bh / 2).attr('dy', '0.35em').text((_, i) => labels[i]);
});

// ---------- Listas: objetivos y carreras ----------
dash.draw('goals', (el) => {
  const d = dash.data('metas_progreso');
  document.querySelectorAll('#goals-empty').forEach((e) => { e.hidden = d.status !== 'ok' || d.data.length > 0; });
  if (d.status !== 'ok') return el.replaceChildren();
  el.replaceChildren(...d.data.map((g) => {
    const li = ME.el('li', 'me-goal');
    const top = ME.el('div', 'me-goal-top');
    const name = ME.el('span', 'me-goal-name', g.titulo);
    const x = ME.el('button', 'me-x', 'Quitar'); x.type = 'button'; x.style.marginLeft = '8px';
    x.addEventListener('click', async () => { x.disabled = true; try { await ME.store.del('metas/items', g.id); } catch { x.disabled = false; ME.flash('meta', false); } });
    name.appendChild(x);
    const st = ME.el('span', 'me-goal-num ' + (g.estado === 'Atrasado' ? 'me-state-warn' : 'me-state-ok'), `${ME.fmtNum(g.actual, g.unidad === 'sesiones' ? 0 : 1)} de ${g.objetivo} ${g.unidad} · ${g.pct}% · ${g.estado}`);
    top.append(name, st);
    const bar = ME.el('div', 'me-bar');
    const fill = ME.el('i'); fill.style.width = Math.min(100, g.pct) + '%'; fill.style.background = g.estado === 'Atrasado' ? 'var(--color-warn)' : dash.colors[0];
    const mark = ME.el('b'); mark.style.left = `calc(${g.esperado}% - 1px)`; mark.title = `Esperado a hoy: ${g.esperado}%`;
    bar.append(fill, mark);
    li.append(top, bar);
    return li;
  }));
});

dash.draw('races', (el) => {
  const d = dash.data('carreras_cd');
  document.querySelectorAll('#races-empty').forEach((e) => { e.hidden = d.status !== 'ok' || d.data.length > 0; });
  if (d.status !== 'ok') return el.replaceChildren();
  el.replaceChildren(...d.data.map((c) => {
    const li = ME.el('li', 'me-race');
    const days = ME.el('div', 'me-race-days', c.dias < 0 ? '✓' : String(c.dias));
    days.appendChild(ME.el('small', '', c.dias < 0 ? 'pasada' : c.dias === 1 ? 'día' : 'días'));
    const mid = ME.el('div');
    mid.append(ME.el('div', 'me-goal-name', c.nombre));
    const meta = [`${ME.fmtDate.format(ME.keyToUTC(c.fecha))}`, `${ME.fmtNum(c.distancia_km, c.distancia_km % 1 ? 2 : 0)} km`];
    if (c.objetivo) meta.push(`objetivo ${c.objetivo}`);
    mid.append(ME.el('div', 'me-race-meta', meta.join(' · ')));
    if (c.prediccion) mid.append(ME.el('div', 'me-race-meta', `Estimado: ${c.prediccion} (${c.ritmo_pred}) · según ${c.base}`));
    const x = ME.el('button', 'me-x', 'Quitar'); x.type = 'button';
    x.addEventListener('click', async () => { x.disabled = true; try { await ME.store.del('carreras/items', c.id); } catch { x.disabled = false; ME.flash('carrera', false); } });
    li.append(days, mid, x);
    return li;
  }));
});

// ---------- Tablas ----------
const meRowsTo = (el, rows, cellsOf) => el.replaceChildren(...rows.map((r) => {
  const tr = document.createElement('tr'); if (r.id != null) tr.dataset.key = r.id;
  tr.append(...cellsOf(r).map(([v, cls]) => ME.el('td', cls || '', v)));
  return tr;
}));

dash.draw('fondos', (el) => {
  const d = dash.data('fondos');
  if (d.status !== 'ok') return el.replaceChildren();
  meRowsTo(el, d.data, (r) => [[r.day], [r.name, 'me-wrap'], [Number(r.distance_km).toFixed(2), 'me-num'], [r.pace || '—', 'me-num'], [r.fc_media != null ? String(r.fc_media) : '—', 'me-num'], [String(r.elevation_m), 'me-num'], [r.relative_effort != null ? String(r.relative_effort) : '—', 'me-num']]);
});

dash.draw('recent', (el) => {
  const d = dash.data('act_f');
  if (d.status !== 'ok') return el.replaceChildren();
  meRowsTo(el, d.data.slice(0, 12), (r) => [[r.day], [r.name, 'me-wrap'], [ME.hasDist(r) ? Number(r.distance_km).toFixed(2) : '—', 'me-num'], [r.duracion, 'me-num'], [r.pace || '—', 'me-num']]);
});
