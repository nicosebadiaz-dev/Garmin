// ---------- Utilidades compartidas ----------
window.ME = (() => {
  const CATS = ['Carrera', 'Ciclismo', 'Natación', 'Fuerza', 'Movilidad', 'Otros'];
  const color = (c) => { const i = CATS.indexOf(c); return i < 0 ? 'var(--cds-chart-muted)' : dash.colors[i % dash.colors.length]; };
  const ZONE_COLORS = ['var(--cds-chart-muted)', dash.colors[0], dash.colors[2 % dash.colors.length], dash.colors[3 % dash.colors.length], 'var(--cds-chart-status-critical)'];
  const pad = (n) => String(n).padStart(2, '0');
  const now = new Date();
  const todayKey = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const keyToUTC = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); };
  const utcKey = (dt) => dt.toISOString().slice(0, 10);
  const fmtShort = new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  const fmtLong = new Intl.DateTimeFormat('es', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  const fmtDate = new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  const fmtMonth = new Intl.DateTimeFormat('es', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const fmtNum = (x, d = 1) => Number(x).toLocaleString('es', { minimumFractionDigits: d, maximumFractionDigits: d });
  const fmtPace = (s) => `${Math.floor(s / 60)}:${pad(Math.round(s % 60))}`;
  const hasDist = (r) => (Number(r.distance_km) || 0) > 0.1 && ['Carrera', 'Ciclismo', 'Natación'].includes(r.categoria);
  const chipText = (r) => hasDist(r) ? `${fmtNum(r.distance_km, 1)} km` : `${Math.round((Number(r.moving_s) || 0) / 60)} min`;
  const state = { month: new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1)), sel: todayKey };
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

  function tip(host) {
    let t = host.querySelector(':scope > .me-tip');
    if (!t) { t = el('div', 'me-tip'); t.hidden = true; host.appendChild(t); }
    return {
      show(lines, x, y) {
        t.replaceChildren(...lines.map((s) => el('div', '', s)));
        t.hidden = false;
        const w = t.offsetWidth, W = host.clientWidth;
        t.style.left = Math.max(0, Math.min(W - w, x - w / 2)) + 'px';
        t.style.top = Math.max(0, y - t.offsetHeight - 10) + 'px';
      },
      hide() { t.hidden = true; }
    };
  }
  function status(host, d, what) {
    if (d.status === 'ok') return true;
    host.replaceChildren(d.status === 'error' ? el('p', 'me-err', `No se pudo cargar ${what}.`) : el('p', 'me-muted', '—'));
    return false;
  }
  function textWidth(svg, strings) {
    const t = svg.append('text').attr('class', 'me-axl');
    let w = 0;
    for (const s of strings) { t.text(s); w = Math.max(w, t.node().getComputedTextLength()); }
    t.remove();
    return w;
  }
  // Guardar en tu espacio privado del panel
  async function base() {
    const [db, user] = await Promise.all([claude.use('db'), claude.use('user')]);
    const uid = user ? await user.id() : null;
    if (!db || !uid) throw new Error('sin acceso');
    return { db, root: `data/users/${uid}` };
  }
  const store = {
    async add(coll, row) { const { db, root } = await base(); await db.collection(`${root}/${coll}`).add(row); },
    async del(coll, id) { const { db, root } = await base(); await db.doc(`${root}/${coll}/${id}`).delete(); }
  };
  function flash(name, ok) {
    document.querySelectorAll(`[data-msg="${name}-ok"]`).forEach((p) => { p.hidden = !ok; });
    document.querySelectorAll(`[data-msg="${name}-bad"]`).forEach((p) => { p.hidden = ok; });
    if (ok) setTimeout(() => document.querySelectorAll(`[data-msg="${name}-ok"]`).forEach((p) => { p.hidden = true; }), 2500);
  }
  return { CATS, ZONE_COLORS, color, todayKey, keyToUTC, utcKey, fmtShort, fmtLong, fmtDate, fmtMonth, fmtNum, fmtPace, chipText, hasDist, state, tip, status, textWidth, pad, el, store, flash };
})();

// ---------- Años para récords y potencia (este año y los 3 anteriores) ----------
(() => {
  const y = new Date().getFullYear();
  const want = [y - 3, y - 2, y - 1, y];
  const cur = dash.params().anios;
  if (String(cur) !== String(want)) dash.setParams({ anios: want });
})();

// ---------- Filtro de deporte ----------
document.querySelectorAll('#f-deporte').forEach((s) => {
  s.value = dash.params().deporte || '';
  s.addEventListener('change', () => dash.setParams({ deporte: s.value }));
});
dash.onData(() => document.querySelectorAll('#f-deporte').forEach((s) => { if (document.activeElement !== s) s.value = dash.params().deporte || ''; }));

// ---------- Pestañas ----------
(() => {
  const names = ['resumen', 'calendario', 'progreso', 'sesion', 'detalle'];
  const show = (name, link) => {
    if (!names.includes(name)) name = 'resumen';
    document.querySelectorAll('.me-tab').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === name)));
    names.forEach((n) => document.querySelectorAll('#' + n).forEach((s) => { s.hidden = n !== name; }));
    if (link) dash.setLink(name);
  };
  document.querySelectorAll('.me-tab').forEach((b) => b.addEventListener('click', () => show(b.dataset.tab, true)));
  show((location.hash || '').slice(1), false);
  window.addEventListener('hashchange', () => show((location.hash || '').slice(1), false));
  window.addEventListener('beforeprint', () => names.forEach((n) => document.querySelectorAll('#' + n).forEach((s) => { s.hidden = false; })));
  window.addEventListener('afterprint', () => show(document.querySelector('.me-tab[aria-selected="true"]')?.dataset.tab || 'resumen', false));
})();

// ---------- Colores de leyendas ----------
dash.onData(() => {
  document.querySelectorAll('.me-legend [data-cat]').forEach((d) => { d.style.background = ME.color(d.dataset.cat); });
  document.querySelectorAll('.me-legend [data-series]').forEach((d) => { d.style.background = d.dataset.series === '0' ? dash.colors[0] : dash.colors[1 % dash.colors.length]; });
  document.querySelectorAll('.me-legend [data-zone]').forEach((d) => { d.style.background = ME.ZONE_COLORS[Number(d.dataset.zone)]; });
});

window.meRedrawDay = () => ['month-label', 'calendar'].forEach((n) => dash.draw(n));

// Navegación del calendario
document.querySelectorAll('[data-cal-nav]').forEach((b) => b.addEventListener('click', () => {
  const step = Number(b.dataset.calNav), s = ME.state;
  if (step === 0) { const n = new Date(); s.month = new Date(Date.UTC(n.getFullYear(), n.getMonth(), 1)); }
  else s.month = new Date(Date.UTC(s.month.getUTCFullYear(), s.month.getUTCMonth() + step, 1));
  window.meRedrawDay();
}));

// ---------- Formularios ----------
const meNum = (id) => { const i = document.getElementById(id); return i && i.value !== '' && i.validity.valid ? Number(i.value) : null; };
const meTxt = (id) => { const i = document.getElementById(id); return i ? i.value.trim() : ''; };
const meForm = (id, fn) => document.querySelectorAll('#' + id).forEach((f) => f.addEventListener('submit', async (ev) => { ev.preventDefault(); if (!f.reportValidity()) return; await fn(f); }));

meForm('form-meta', async (f) => {
  const tipo = meTxt('f-meta-tipo');
  const row = { tipo, periodo: meTxt('f-meta-per'), objetivo: meNum('f-meta-obj') };
  if (tipo === 'sesiones' && meTxt('f-meta-cat')) row.categoria = meTxt('f-meta-cat');
  try { await ME.store.add('metas/items', row); ME.flash('meta', true); document.querySelectorAll('#f-meta-obj').forEach((i) => { i.value = ''; }); }
  catch { ME.flash('meta', false); }
});

meForm('form-carrera', async (f) => {
  const row = { nombre: meTxt('f-car-nombre'), fecha: meTxt('f-car-fecha'), distancia_km: meNum('f-car-dist') };
  const obj = meTxt('f-car-obj');
  if (obj) row.objetivo = obj;
  try { await ME.store.add('carreras/items', row); ME.flash('carrera', true); f.reset(); }
  catch { ME.flash('carrera', false); }
});
