// ---------- Cómo se convierten las respuestas de Strava en filas ----------
dash.loader('activities', {
  description: 'Une tres páginas de 100 actividades (las 300 más recientes) y aplana el resumen de cada una en columnas. Agrupa los tipos de Strava en seis categorías.',
  fn: async ({ answer, call, args }) => {
    const catOf = (t) => {
      if (['Run', 'TrailRun', 'VirtualRun'].includes(t)) return 'Carrera';
      if (['Ride', 'VirtualRide', 'MountainBikeRide', 'GravelRide', 'EBikeRide'].includes(t)) return 'Ciclismo';
      if (t === 'Swim') return 'Natación';
      if (['WeightTraining', 'Workout', 'Crossfit', 'HighIntensityIntervalTraining'].includes(t)) return 'Fuerza';
      if (['Yoga', 'Pilates', 'Stretching'].includes(t)) return 'Movilidad';
      return 'Otros';
    };
    const hms = (s) => {
      s = Math.round(s || 0);
      const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
      const p = (n) => String(n).padStart(2, '0');
      return h ? `${h}:${p(m)}:${p(ss)}` : `${m}:${p(ss)}`;
    };
    const rows = [];
    let page = answer;
    for (let i = 0; i < 3; i++) {
      if (!page || page.error) throw new Error((page && (page.error.message || page.error)) || 'Strava no devolvió actividades');
      for (const a of page.activities || []) {
        const s = a.summary || {};
        rows.push({
          id: String(a.id),
          name: a.name || '',
          sport_type: a.sport_type || '',
          categoria: catOf(a.sport_type),
          start_local: a.start_local || '',
          day: (a.start_local || '').slice(0, 10),
          distance_km: s.distance != null ? Math.round(s.distance * 100) / 100 : 0,
          moving_s: s.moving_time || 0,
          duracion: hms(s.moving_time),
          elevation_m: s.elevation_gain || 0,
          pace_s_km: s.avg_pace != null ? Math.round(s.avg_pace) : null,
          pace: s.avg_pace_display || s.avg_swim_pace_display || '',
          relative_effort: s.relative_effort != null ? s.relative_effort : null,
          calories: s.total_calories != null ? s.total_calories : null,
          location: a.location_summary || ''
        });
      }
      if (!page.has_next_page || i === 2) break;
      page = await call('list_activities', { ...args, after: page.end_cursor });
    }
    return { rows, columns: ['id', 'day', 'name', 'sport_type', 'categoria', 'start_local', 'distance_km', 'moving_s', 'duracion', 'elevation_m', 'pace_s_km', 'pace', 'relative_effort', 'calories', 'location'] };
  }
});

dash.loader('hr', {
  description: 'De las 100 actividades más recientes toma las carreras de 4 km o más (hasta 25), pide a Strava el detalle de cada una y devuelve una fila por vuelta con su FC media y la FC media de la carrera.',
  fn: async ({ answer, call }) => {
    if (!answer || answer.error) throw new Error((answer && (answer.error.message || answer.error)) || 'Strava no devolvió actividades');
    const pick = (answer.activities || []).filter((a) => ['Run', 'TrailRun'].includes(a.sport_type) && ((a.summary && a.summary.distance) || 0) >= 4).slice(0, 25);
    const rows = [];
    let next = 0;
    const worker = async () => {
      while (next < pick.length) {
        const a = pick[next++];
        let p;
        try { p = await call('get_activity_performance', { activity_id: String(a.id) }); } catch (e) { continue; }
        if (!p || p.error || !p.has_heartrate) continue;
        (p.laps || []).forEach((l, k) => {
          if (l.avg_hr == null) return;
          rows.push({ activity_id: String(a.id), day: (a.start_local || '').slice(0, 10), lap: k + 1, lap_s: l.moving_time || 0, lap_hr: Math.round(l.avg_hr), run_avg_hr: p.average_heartrate != null ? Math.round(p.average_heartrate) : null });
        });
      }
    };
    await Promise.all([worker(), worker(), worker(), worker(), worker(), worker()]);
    rows.sort((x, y) => (y.day.localeCompare(x.day)) || (x.activity_id.localeCompare(y.activity_id)) || (x.lap - y.lap));
    return { rows, columns: ['activity_id', 'day', 'lap', 'lap_s', 'lap_hr', 'run_avg_hr'] };
  }
});

dash.loader('zonas', {
  description: 'Toma las 5 zonas de frecuencia cardíaca de Strava, una fila por zona, con el FTP de Strava en cada fila.',
  fn: ({ answer }) => {
    if (!answer || answer.error) throw new Error((answer && (answer.error.message || answer.error)) || 'Strava no devolvió las zonas');
    return (answer.heart_rate_zones || []).map((z, i) => ({ zona: 'Z' + (i + 1), min: z.min, max: z.max != null ? z.max : null, fuente: answer.heart_rate_zone_source || '', ftp: answer.ftp != null ? answer.ftp : null, ftp_estimado: !!answer.ftp_is_estimated }));
  }
});

dash.loader('streak', {
  description: 'Convierte la racha semanal de Strava en una fila.',
  fn: ({ answer }) => {
    if (!answer || answer.error) throw new Error((answer && (answer.error.message || answer.error)) || 'Strava no devolvió la racha');
    return [{ semanas: answer.length, estado: answer.streak_status, actividades: answer.valid_activity_count, desde: answer.start_date }];
  }
});

dash.loader('records', {
  description: 'Pone nombre en español a cada mejor marca, añade su distancia en metros y escribe el tiempo como h:mm:ss.',
  fn: ({ answer }) => {
    if (!answer || answer.error) throw new Error((answer && (answer.error.message || answer.error)) || 'Strava no devolvió récords');
    const names = { Fastest400: '400 m', Fastest1k: '1 km', FastestMile: '1 milla', Fastest5k: '5 km', Fastest10k: '10 km', Fastest15k: '15 km', FastestHalfMarathon: 'Media maratón', FastestMarathon: 'Maratón' };
    const meters = { Fastest400: 400, Fastest1k: 1000, FastestMile: 1609.34, Fastest5k: 5000, Fastest10k: 10000, Fastest15k: 15000, FastestHalfMarathon: 21097.5, FastestMarathon: 42195 };
    const fmt = (s) => { const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60, p = (n) => String(n).padStart(2, '0'); return h ? `${h}:${p(m)}:${p(x)}` : `${m}:${p(x)}`; };
    return (answer.efforts || []).map((e) => ({ prueba: names[e.best_effort_type] || e.best_effort_type, tiempo: fmt(e.value), segundos: e.value, metros: meters[e.best_effort_type] || null, fecha: e.date, activity_id: String(e.activity_id) }));
  }
});

// ---------- Cálculos ----------
dash.calc('zonas_fc', {
  inputs: ['zonas'],
  title: 'Zonas de FC con tu FC máxima',
  description: 'Las 5 zonas de FC recalculadas con una FC máxima de 204 lpm, con los mismos porcentajes que usa Strava: zona 2 desde el 65 %, zona 3 desde el 81 %, zona 4 desde el 89 % y zona 5 desde el 97 %.',
  fn: (zonas) => {
    const FCMAX = 204;
    const cuts = [0, 0.65, 0.81, 0.89, 0.97];
    const mins = cuts.map((c) => Math.round(FCMAX * c));
    return mins.map((m, i) => ({ zona: 'Z' + (i + 1), min: m, max: i < 4 ? mins[i + 1] - 1 : null }));
  }
});

dash.calc('act_f', {
  inputs: ['activities'],
  title: 'Actividades del deporte elegido',
  description: 'Las actividades cargadas, filtradas por el deporte elegido arriba (todas si no hay filtro).',
  fn: (activities) => {
    const dep = dash.params().deporte || '';
    return dep ? activities.filter((r) => r.categoria === dep) : activities;
  }
});

dash.calc('kpis', {
  inputs: ['activities'],
  title: 'Resumen de 28 días',
  description: 'Km corriendo, horas y sesiones de los últimos 28 días (hoy incluido), y km corriendo de los 28 días anteriores.',
  fn: (activities) => {
    const DAY = 86400000, now = new Date();
    const end = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) + DAY;
    const ts = (k) => { const [y, m, d] = k.split('-').map(Number); return Date.UTC(y, m - 1, d); };
    let km = 0, kmPrev = 0, sec = 0, n = 0, runs = 0;
    for (const r of activities) {
      if (!r.day) continue;
      const age = (end - ts(r.day)) / DAY;
      if (age <= 0) continue;
      if (age <= 28) {
        sec += Number(r.moving_s) || 0; n++;
        if (r.categoria === 'Carrera') { km += Number(r.distance_km) || 0; runs++; }
      } else if (age <= 56 && r.categoria === 'Carrera') kmPrev += Number(r.distance_km) || 0;
    }
    const r1 = (x) => Math.round(x * 10) / 10;
    return [{ km28: r1(km), km_prev: r1(kmPrev), cambio_pct: kmPrev > 0 ? Math.round((km - kmPrev) / kmPrev * 100) : null, horas28: r1(sec / 3600), sesiones28: n, salidas28: runs }];
  }
});

dash.calc('weekly', {
  inputs: ['act_f'],
  title: 'Totales por semana y deporte',
  description: 'Horas en movimiento y km por categoría en cada una de las últimas 16 semanas (lunes a domingo).',
  fn: (activities) => {
    const DAY = 86400000, WEEKS = 16, now = new Date();
    const cats = ['Carrera', 'Ciclismo', 'Natación', 'Fuerza', 'Movilidad', 'Otros'];
    const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
    const monday = today - ((new Date(today).getUTCDay() + 6) % 7) * DAY;
    const start = monday - (WEEKS - 1) * 7 * DAY;
    const acc = {};
    for (const r of activities) {
      if (!r.day) continue;
      const [y, m, d] = r.day.split('-').map(Number);
      const i = Math.floor((Date.UTC(y, m - 1, d) - start) / (7 * DAY));
      if (i < 0 || i >= WEEKS) continue;
      const k = i + '|' + r.categoria;
      acc[k] = acc[k] || { s: 0, km: 0 };
      acc[k].s += Number(r.moving_s) || 0;
      acc[k].km += Number(r.distance_km) || 0;
    }
    const out = [];
    for (let i = 0; i < WEEKS; i++) {
      const semana = new Date(start + i * 7 * DAY).toISOString().slice(0, 10);
      for (const c of cats) {
        const a = acc[i + '|' + c] || { s: 0, km: 0 };
        out.push({ semana, categoria: c, horas: Math.round(a.s / 36) / 100, km: Math.round(a.km * 10) / 10 });
      }
    }
    return out;
  }
});

dash.calc('deportes90', {
  inputs: ['act_f'],
  title: 'Reparto por deporte, 90 días',
  description: 'Horas en movimiento y número de sesiones por categoría en los últimos 90 días.',
  fn: (activities) => {
    const DAY = 86400000, now = new Date();
    const end = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) + DAY;
    const acc = {};
    for (const r of activities) {
      if (!r.day) continue;
      const [y, m, d] = r.day.split('-').map(Number);
      const age = (end - Date.UTC(y, m - 1, d)) / DAY;
      if (age <= 0 || age > 90) continue;
      acc[r.categoria] = acc[r.categoria] || { s: 0, n: 0 };
      acc[r.categoria].s += Number(r.moving_s) || 0;
      acc[r.categoria].n++;
    }
    return Object.entries(acc).map(([categoria, a]) => ({ categoria, horas: Math.round(a.s / 360) / 10, sesiones: a.n })).sort((a, b) => b.horas - a.horas);
  }
});

dash.calc('constancia', {
  inputs: ['activities'],
  title: 'Días desde la última sesión',
  description: 'Para cada deporte, la fecha de la última sesión cargada y cuántos días pasaron desde entonces.',
  fn: (activities) => {
    const DAY = 86400000, now = new Date();
    const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
    const last = {};
    for (const r of activities) if (r.day && (!last[r.categoria] || r.day > last[r.categoria])) last[r.categoria] = r.day;
    return ['Carrera', 'Ciclismo', 'Natación', 'Fuerza', 'Movilidad'].map((c) => {
      if (!last[c]) return { categoria: c, ultima: null, dias: null };
      const [y, m, d] = last[c].split('-').map(Number);
      return { categoria: c, ultima: last[c], dias: Math.round((today - Date.UTC(y, m - 1, d)) / DAY) };
    });
  }
});

dash.calc('carga', {
  inputs: ['act_f'],
  title: 'Carga aguda y crónica',
  description: 'Suma diaria del Esfuerzo relativo de Strava; carga aguda = media ponderada exponencial de 7 días, crónica = de 42 días, y su cociente. Se muestran los últimos 120 días.',
  fn: (activities) => {
    const DAY = 86400000, now = new Date();
    const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
    const byDay = {};
    let first = today;
    for (const r of activities) {
      if (!r.day) continue;
      const [y, m, d] = r.day.split('-').map(Number);
      const t = Date.UTC(y, m - 1, d);
      if (t < first) first = t;
      byDay[t] = (byDay[t] || 0) + (Number(r.relative_effort) || 0);
    }
    const ka = 1 - Math.exp(-1 / 7), kc = 1 - Math.exp(-1 / 42);
    let atl = 0, ctl = 0;
    const out = [];
    for (let t = first; t <= today; t += DAY) {
      const e = byDay[t] || 0;
      atl += (e - atl) * ka; ctl += (e - ctl) * kc;
      if (today - t < 120 * DAY) out.push({ day: new Date(t).toISOString().slice(0, 10), esfuerzo: e, aguda: Math.round(atl * 10) / 10, cronica: Math.round(ctl * 10) / 10, ratio: ctl > 0 ? Math.round(atl / ctl * 100) / 100 : null });
    }
    return out;
  }
});

dash.calc('zonas_semana', {
  inputs: ['hr', 'zonas_fc'],
  title: 'Horas por zona de FC y semana',
  description: 'Suma el tiempo de cada vuelta de carrera en la zona de su FC media, por semana (lunes a domingo), últimas 6 semanas.',
  fn: (hr, zonas) => {
    const DAY = 86400000, WEEKS = 6, now = new Date();
    const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
    const monday = today - ((new Date(today).getUTCDay() + 6) % 7) * DAY;
    const start = monday - (WEEKS - 1) * 7 * DAY;
    const zoneOf = (h) => { for (let i = zonas.length - 1; i >= 0; i--) if (h >= Number(zonas[i].min)) return i; return 0; };
    const acc = {};
    for (const l of hr) {
      const [y, m, d] = l.day.split('-').map(Number);
      const i = Math.floor((Date.UTC(y, m - 1, d) - start) / (7 * DAY));
      if (i < 0 || i >= WEEKS) continue;
      const k = i + '|' + zoneOf(Number(l.lap_hr));
      acc[k] = (acc[k] || 0) + (Number(l.lap_s) || 0);
    }
    const out = [];
    for (let i = 0; i < WEEKS; i++) {
      let tot = 0;
      for (let z = 0; z < zonas.length; z++) tot += acc[i + '|' + z] || 0;
      for (let z = 0; z < zonas.length; z++) {
        const s = acc[i + '|' + z] || 0;
        out.push({ semana: new Date(start + i * 7 * DAY).toISOString().slice(0, 10), zona: 'Z' + (z + 1), horas: Math.round(s / 36) / 100, pct: tot ? Math.round(s / tot * 100) : 0 });
      }
    }
    return out;
  }
});

dash.calc('zonas_resumen', {
  inputs: ['zonas_semana'],
  title: 'Reparto de zonas, últimas 4 semanas',
  description: 'Porcentaje del tiempo de carrera de las últimas 4 semanas en zonas 1–2, 3 y 4–5.',
  fn: (zonasSemana) => {
    const weeks = [...new Set(zonasSemana.map((r) => r.semana))].sort().slice(-4);
    let s12 = 0, s3 = 0, s45 = 0;
    for (const r of zonasSemana) {
      if (!weeks.includes(r.semana)) continue;
      if (r.zona === 'Z1' || r.zona === 'Z2') s12 += r.horas; else if (r.zona === 'Z3') s3 += r.horas; else s45 += r.horas;
    }
    const tot = s12 + s3 + s45;
    if (!tot) return [{ pct_suave: null, pct_moderado: null, pct_intenso: null }];
    return [{ pct_suave: Math.round(s12 / tot * 100), pct_moderado: Math.round(s3 / tot * 100), pct_intenso: Math.round(s45 / tot * 100) }];
  }
});

dash.calc('fondos', {
  inputs: ['activities', 'hr'],
  title: 'Salidas largas',
  description: 'Carreras de 12 km o más, con la FC media que da Strava para cada una.',
  fn: (activities, hr) => {
    const fc = {};
    for (const l of hr) if (l.run_avg_hr != null) fc[l.activity_id] = l.run_avg_hr;
    return activities.filter((r) => r.categoria === 'Carrera' && Number(r.distance_km) >= 12).slice(0, 15)
      .map((r) => ({ id: r.id, day: r.day, name: r.name, distance_km: r.distance_km, pace: r.pace, pace_s_km: r.pace_s_km, fc_media: fc[r.id] != null ? fc[r.id] : null, elevation_m: Math.round(Number(r.elevation_m) || 0), relative_effort: r.relative_effort }));
  }
});

dash.calc('metas_progreso', {
  inputs: ['metas', 'activities'],
  title: 'Progreso de objetivos',
  description: 'Para cada objetivo, el total del periodo en curso (semana de lunes a domingo, mes o año natural) frente al objetivo, y qué parte del periodo ya pasó.',
  fn: (metas, activities) => {
    const DAY = 86400000, now = new Date();
    const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
    const per = (p) => {
      if (p === 'semana') { const s = today - ((new Date(today).getUTCDay() + 6) % 7) * DAY; return [s, s + 7 * DAY]; }
      if (p === 'anio') return [Date.UTC(now.getFullYear(), 0, 1), Date.UTC(now.getFullYear() + 1, 0, 1)];
      return [Date.UTC(now.getFullYear(), now.getMonth(), 1), Date.UTC(now.getFullYear(), now.getMonth() + 1, 1)];
    };
    const perTxt = { semana: 'esta semana', mes: 'este mes', anio: 'este año' };
    return metas.map((g) => {
      const [s, e] = per(g.periodo);
      let actual = 0;
      for (const r of activities) {
        if (!r.day) continue;
        const [y, m, d] = r.day.split('-').map(Number);
        const t = Date.UTC(y, m - 1, d);
        if (t < s || t >= e) continue;
        if (g.tipo === 'km_carrera') { if (r.categoria === 'Carrera') actual += Number(r.distance_km) || 0; }
        else if (g.tipo === 'horas') actual += (Number(r.moving_s) || 0) / 3600;
        else if (!g.categoria || r.categoria === g.categoria) actual += 1;
      }
      const obj = Number(g.objetivo) || 0;
      const unidad = g.tipo === 'km_carrera' ? 'km' : g.tipo === 'horas' ? 'h' : 'sesiones';
      const titulo = g.tipo === 'km_carrera' ? `Correr ${obj} km ${perTxt[g.periodo] || ''}`
        : g.tipo === 'horas' ? `Entrenar ${obj} h ${perTxt[g.periodo] || ''}`
        : `${obj} sesiones${g.categoria ? ' de ' + g.categoria : ''} ${perTxt[g.periodo] || ''}`;
      const pct = obj ? Math.round(actual / obj * 100) : 0;
      const esperado = Math.round(Math.min(1, (today + DAY - s) / (e - s)) * 100);
      return { id: g.id, titulo: titulo.trim(), actual: Math.round(actual * 10) / 10, objetivo: obj, unidad, pct, esperado, estado: pct >= 100 ? 'Cumplido' : pct >= esperado - 5 ? 'En camino' : 'Atrasado' };
    });
  }
});

dash.calc('carreras_cd', {
  inputs: ['carreras', 'records'],
  title: 'Próximas carreras',
  description: 'Días que faltan para cada carrera y tiempo estimado con la fórmula de Riegel (T2 = T1 × (D2/D1)^1,06) aplicada al récord de distancia más cercana.',
  fn: (carreras, records) => {
    const DAY = 86400000, now = new Date();
    const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
    const fmt = (s) => { s = Math.round(s); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60, p = (n) => String(n).padStart(2, '0'); return h ? `${h}:${p(m)}:${p(x)}` : `${m}:${p(x)}`; };
    const recs = records.filter((r) => r.metros && r.segundos);
    return carreras.filter((c) => c.fecha && Number(c.distancia_km) > 0).map((c) => {
      const [y, m, d] = c.fecha.split('-').map(Number);
      const dias = Math.round((Date.UTC(y, m - 1, d) - today) / DAY);
      const D = Number(c.distancia_km) * 1000;
      let best = null;
      for (const r of recs) { const dist = Math.abs(Math.log(D / r.metros)); if (!best || dist < best.dist) best = { r, dist }; }
      const pred = best ? best.r.segundos * Math.pow(D / best.r.metros, 1.06) : null;
      return { id: c.id, nombre: c.nombre || '', fecha: c.fecha, dias, distancia_km: Number(c.distancia_km), objetivo: c.objetivo || '', prediccion: pred ? fmt(pred) : null, ritmo_pred: pred ? fmt(pred / (D / 1000)) + ' /km' : null, base: best ? `${best.r.prueba} en ${best.r.tiempo} (${best.r.fecha})` : null };
    }).filter((c) => c.dias >= -7).sort((a, b) => a.dias - b.dias);
  }
});
