/* Tablero Factura, pago y cobro.
   datos.js = cubo de CONTEOS (filas = combinación de dimensiones + medidas sumables). Todo indicador se calcula
   sumando las filas que pasan los filtros. comentarios.js se carga después de pintar.
   Se incrusta en Tableau (Chromium viejo): sin .at(), ||=, ??=, replaceAll ni structuredClone. */
'use strict';
(function () {
const D = window.DATOS;
if (!D) { document.getElementById('stage').innerHTML = '<p class="vacio">No se encontró datos.js. Corre el ETL (python -m etl.construir).</p>'; return; }

// ------------------------------------------------------------------ índices
const DIMS = D.dims, ND = DIMS.length, V = D.valores;
const DI = Object.fromEntries(DIMS.map((d, i) => [d, i]));
const MI = Object.fromEntries(D.medidas.map((m, i) => [m, ND + i]));
const NMIN = D.n_minimo, PERIODOS = V.periodo, PROC = V.proceso, NEG = V.negocio;
const FP = PROC.indexOf('Factura y pago'), COB = PROC.indexOf('Cobranza');
const CE = {'Hogar': 'var(--s-hog)', 'Móvil': 'var(--s-mov)'};
const MULTI = [['segmento', 'Segmento'], ['region', 'Región'], ['casa', 'Casa de cobro'], ['canal', 'Canal']];
const MT = new Map();   // fila del cubo → [[motivo, conteo]]
for (const [r, t, c] of D.motivos.filas) { if (!MT.has(r)) MT.set(r, []); MT.get(r).push([t, c]); }
const ultimo = a => a[a.length - 1];

// ------------------------------------------------------------------ formato es-CO
const nf0 = new Intl.NumberFormat('es-CO', {maximumFractionDigits: 0});
const nf1 = new Intl.NumberFormat('es-CO', {minimumFractionDigits: 1, maximumFractionDigits: 1});
const f0 = x => nf0.format(x).replace('-', '−'), f1 = x => nf1.format(x).replace('-', '−');
const fpp = x => (x > 0 ? '+' : '') + f1(x);
const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const MESL = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const mesC = p => `${MES[+p.slice(4) - 1]}-${p.slice(2, 4)}`, mesL = p => `${MESL[+p.slice(4) - 1]} ${p.slice(0, 4)}`;
const semC = s => { const [, m, d] = s.split('-'); return `${+d} ${MES[+m - 1]}`; };
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const norm = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const ICO = {
  resumen: '<path d="M4 13h6V4H4zM14 20h6v-9h-6zM4 20h6v-4H4zM14 4v4h6V4z"/>',
  factura: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6M9 16h3"/>',
  pago: '<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18M7 15h4"/>',
  cobranza: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/>',
  voz: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1.1-4.4A8 8 0 1 1 21 12z"/>',
  calidad: '<path d="M12 3l8 3v6c0 4.4-3.4 8-8 9-4.6-1-8-4.6-8-9V6z"/><path d="M8.5 12l2.5 2.5 4.5-5"/>',
  sol: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  luna: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>', izq: '<path d="M15 5l-7 7 7 7"/>', der: '<path d="M9 5l7 7-7 7"/>',
  flecha: '<path d="M2 8h24M20 3l6 5-6 5"/>', flechaP: '<path d="M2 8h24" stroke-dasharray="3 4"/><path d="M20 3l6 5-6 5"/>',
};
const svgI = k => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICO[k]}</svg>`;

// ------------------------------------------------------------------ indicadores
const prop = (x, b) => b ? {v: x / b * 100, n: b, ic: 196 * Math.sqrt((x / b) * (1 - x / b) / b)} : null;
const top2 = k => a => prop(a[k + '_4'] + a[k + '_5'], a[k + '_1'] + a[k + '_2'] + a[k + '_3'] + a[k + '_4'] + a[k + '_5']);
const esc5 = (k, corto, proc, fuente) => ({nombre: D.escalas[k], corto, proc, min: 0, max: 100, tipo: 'esc5',
  def: `% que califica 4 o 5 en la escala de 1 a 5 (${fuente}). Base: respuestas válidas. Más alto = mejor.`, calc: top2(k)});
const IND = {
  nps: {nombre: 'NPS · recomendación', corto: 'NPS', proc: FP, min: -100, max: 100, tipo: 'nps',
    def: 'Net Promoter Score de factura y pago: % promotores (9–10) − % detractores (0–6). Base: todas las respuestas de recomendación.',
    calc: a => { if (!a.nps_val) return null; const p = a.prom / a.nps_val, d = a.det / a.nps_val; return {v: (p - d) * 100, n: a.nps_val, ic: 196 * Math.sqrt((p + d - (p - d) ** 2) / a.nps_val)}; }},
  fsat: esc5('fsat', 'CSAT factura', FP, 'pregunta «CSAT - valor facturado»'),
  ces1: esc5('ces1', 'CES factura', FP, 'pregunta «CES - entender el contenido de la factura»: fácil y muy fácil'),
  va: {nombre: 'Valores acordes al plan', corto: 'Valores acordes', proc: FP, min: 0, max: 100, tipo: 'sino',
    def: '% que responde «Sí» a si los valores de la factura van de acuerdo con su plan. Base: Sí + No.',
    calc: a => prop(a.va_si, a.va_si + a.va_no)},
  psat: esc5('psat', 'CSAT pago', FP, 'pregunta «CSAT - proceso pago de factura»'),
  ces2: esc5('ces2', 'CES pago', FP, 'pregunta «CES - realizar el pago de la factura»: fácil y muy fácil'),
  seg: {nombre: 'Seguridad al pagar', corto: 'Seguridad', proc: FP, min: 0, max: 100, tipo: 'esc3',
    def: '% que califica 2 o 3 la seguridad del pago (escala de 1 a 3; el 1 es la respuesta mala). Supuesto sin confirmar con negocio.',
    calc: a => prop(a.seg_2 + a.seg_3, a.seg_1 + a.seg_2 + a.seg_3)},
  rap: {nombre: 'Rapidez al pagar', corto: 'Rapidez', proc: FP, min: 0, max: 100, tipo: 'esc3',
    def: '% que califica 2 o 3 la rapidez del pago (escala de 1 a 3; el 1 es la respuesta mala). Supuesto sin confirmar con negocio.',
    calc: a => prop(a.rap_2 + a.rap_3, a.rap_1 + a.rap_2 + a.rap_3)},
  clar: esc5('clar', 'Claridad', COB, 'campo CLARIDAD de cobranza: clara y muy clara'),
  cinf: esc5('cinf', 'CSAT información', COB, 'campo CSAT de cobranza'),
  ctra: esc5('ctra', 'CSAT trato', COB, 'campo CSAT1 de cobranza'),
};
const KS = Object.keys(IND);
const KPIS = {todos: ['nps', 'fsat', 'psat', 'cinf'], [FP]: ['nps', 'fsat', 'psat', 'va'], [COB]: ['cinf', 'ctra', 'clar']};
const fmt = (k, r) => r == null ? '—' : (k === 'nps' ? f1(r.v) : f1(r.v) + ' %');
const fmtGrande = (k, r) => r == null ? '—' : `${f1(r.v)}<small>${k === 'nps' ? 'pts' : '%'}</small>`;
const unidad = k => k === 'nps' ? 'pts' : 'pp';
const ETAPAS = [
  {t: 'Factura', s: 'Recibirla, entenderla y que cuadre con el plan', ks: ['ces1', 'va', 'fsat']},
  {t: 'Pago', s: 'Pagar fácil, rápido y seguro', ks: ['ces2', 'rap', 'seg', 'psat']},
  {t: 'Cobranza', s: 'Cuando el pago se atrasa: la gestión de cobro', ks: ['clar', 'cinf', 'ctra']},
];

// ------------------------------------------------------------------ estado + URL
const TABS = [['resumen', 'Resumen'], ['factura', 'Factura'], ['pago', 'Pago'], ['cobranza', 'Cobranza'], ['voz', 'Voces'], ['calidad', 'Calidad']];
const st = {periodo: PERIODOS.length - 1, meses: [PERIODOS.length - 1], proceso: null, negocio: null, tab: 'resumen', evo: 'nps', modo: PERIODOS.length > 1 ? 'mes' : 'semana'};
MULTI.forEach(([k]) => { st[k] = new Set(); });
function leerHash() {
  const h = new URLSearchParams(location.hash.slice(1));
  if (h.has('periodo')) { const ms = h.get('periodo').split('|').map(p => PERIODOS.indexOf(p)).filter(i => i >= 0); if (ms.length) fijarMeses(ms); }
  st.proceso = h.has('proceso') && PROC.includes(h.get('proceso')) ? PROC.indexOf(h.get('proceso')) : null;
  st.negocio = h.has('negocio') && NEG.includes(h.get('negocio')) ? NEG.indexOf(h.get('negocio')) : null;
  if (h.has('tab') && TABS.some(t => t[0] === h.get('tab'))) st.tab = h.get('tab');
  for (const [k] of MULTI) st[k] = new Set((h.get(k) || '').split('|').filter(Boolean).map(v => V[k].indexOf(v)).filter(i => i >= 0));
}
function escribirHash() {
  const h = new URLSearchParams();
  h.set('periodo', st.meses.map(i => PERIODOS[i]).join('|'));
  if (st.proceso != null) h.set('proceso', PROC[st.proceso]);
  if (st.negocio != null) h.set('negocio', NEG[st.negocio]);
  for (const [k] of MULTI) if (st[k].size) h.set(k, [...st[k]].map(i => V[k][i]).join('|'));
  if (st.tab !== 'resumen') h.set('tab', st.tab);
  history.replaceState(null, '', '#' + h);
}

// ------------------------------------------------------------------ motor
// o.periodo / o.proceso / o.negocio: null = todos, undefined = el del estado. o.ignorar: filtro múltiple que no se aplica.
// Meses elegidos (casilla múltiple). st.periodo = el más reciente de la selección: referencia para calidad y año corrido.
function fijarMeses(ms) {
  st.meses = [...new Set(ms)].sort((a, b) => a - b);
  st.periodo = ultimo(st.meses);
}
// Ventana anterior para comparar: los mismos N meses justo antes de la selección (si la selección es continua)
function mesesAnteriores() {
  const m = st.meses, n = m.length, ini = m[0];
  if (ultimo(m) - ini !== n - 1 || ini - n < 0) return null;
  return Array.from({length: n}, (_, i) => ini - n + i);
}
const etqMeses = ms => ms.length === 1 ? mesL(PERIODOS[ms[0]]) : ultimo(ms) - ms[0] === ms.length - 1 ? `${mesC(PERIODOS[ms[0]])} a ${mesC(PERIODOS[ultimo(ms)])}` : ms.map(i => mesC(PERIODOS[i])).join(', ');
const etqCorta = ms => ms.length === 1 ? mesC(PERIODOS[ms[0]]) : etqMeses(ms);
// o.periodo: null = todos, número = un mes, arreglo = esos meses; si no viene, los meses elegidos
function pasa(r, o) {
  o = o || {};
  const per = 'periodo' in o ? o.periodo : st.meses, pro = 'proceso' in o ? o.proceso : st.proceso, neg = 'negocio' in o ? o.negocio : st.negocio;
  if (per != null && (Array.isArray(per) ? !per.includes(r[0]) : r[0] !== per)) return false;
  if (pro != null && r[DI.proceso] !== pro) return false;
  if (neg != null && r[DI.negocio] !== neg) return false;
  for (const [k] of MULTI) if (k !== o.ignorar && st[k].size && !st[k].has(r[DI[k]])) return false;
  return true;
}
const filas = o => { const out = []; D.cubo.forEach((r, i) => { if (pasa(r, o)) out.push(i); }); return out; };
function sumar(idx) {
  const a = Object.fromEntries(D.medidas.map(m => [m, 0]));
  for (const i of idx) { const r = D.cubo[i]; for (const m of D.medidas) a[m] += r[MI[m]]; }
  return a;
}
function porDim(idx, dim) {
  const g = new Map();
  for (const i of idx) { const v = D.cubo[i][DI[dim]]; if (!g.has(v)) g.set(v, []); g.get(v).push(i); }
  return [...g].map(([v, ix]) => ({v, nombre: V[dim][v], idx: ix, a: sumar(ix)}));
}
const negs = () => st.negocio == null ? NEG.map((_, i) => i) : [st.negocio];
const alcance = () => [st.proceso == null ? 'Factura, pago y cobranza' : PROC[st.proceso], st.negocio == null ? 'Hogar + Móvil' : NEG[st.negocio]].join(' · ');
function serie(k, modo, neg) {
  const idx = filas(modo === 'mes' ? {periodo: null, negocio: neg} : {negocio: neg});
  return porDim(idx, modo === 'mes' ? 'periodo' : 'semana')
    .map(g => ({x: g.v, et: modo === 'mes' ? mesC(V.periodo[g.v]) : semC(V.semana[g.v]), r: IND[k].calc(g.a)}))
    .filter(p => p.r).sort((a, b) => a.x - b.x);
}
const porNeg = (o) => NEG.map((_, n) => sumar(filas(Object.assign({}, o || {}, {negocio: n}))));

// ------------------------------------------------------------------ comentarios (carga diferida)
let C = null;
function cargarComentarios() {
  if (C || document.getElementById('js-com')) return;
  const s = document.createElement('script'); s.src = 'comentarios.js'; s.id = 'js-com';
  s.onload = () => {
    const cm = window.COMENTARIOS, ix = Object.fromEntries(cm.campos.map((c, i) => [c, i]));
    const notas = cm.campos.slice(ND, cm.campos.indexOf('pregunta'));
    C = cm.filas.map(f => { const v = {r: f, preg: D.cod_preguntas[f[ix.pregunta]], texto: f[ix.texto]}; notas.forEach(k => { v[k] = f[ix[k]]; }); return v; });
    delete window.COMENTARIOS;
    pintarTab(); if (cajon.dataset.k) abrirCajon(cajon.dataset.k, false);
  };
  s.onerror = () => { C = []; pintarTab(); };
  document.body.appendChild(s);
}
// Lentes: qué comentarios ilustran cada lado de cada indicador
const malo = (v, k) => v[k] >= 1 && v[k] <= 3, bueno = (v, k) => v[k] >= 4;
const P_NPS = 'NPS_PROFUNDIZACION1', P_SUG = 'SUGERENCIA';
const LENTES = {
  det: {t: 'Detractores', malo: true, pred: v => v.nps >= 0 && v.nps <= 6, preg: [P_NPS, P_SUG]},
  pro: {t: 'Promotores', pred: v => v.nps >= 9, preg: [P_NPS, P_SUG]},
  fmal: {t: 'Insatisfechos con la factura', malo: true, pred: v => malo(v, 'fsat'), preg: [P_NPS, 'VALORES_ACORDES_CLASIFICACION1', 'CES1_CLASIFICACION1', P_SUG]},
  fbien: {t: 'Satisfechos con la factura', pred: v => bueno(v, 'fsat'), preg: [P_NPS, P_SUG]},
  fdif: {t: 'No entienden la factura', malo: true, pred: v => malo(v, 'ces1'), preg: ['CES1_CLASIFICACION1', P_NPS, P_SUG]},
  ffac: {t: 'La entienden fácil', pred: v => bueno(v, 'ces1'), preg: [P_NPS, P_SUG]},
  vano: {t: 'Valores que no cuadran', malo: true, pred: v => v.va === 0, preg: ['VALORES_ACORDES_CLASIFICACION1', P_NPS, P_SUG]},
  vasi: {t: 'Valores que cuadran', pred: v => v.va === 1, preg: [P_NPS, P_SUG]},
  pmal: {t: 'Insatisfechos con el pago', malo: true, pred: v => malo(v, 'psat'), preg: ['CES2_CLASIFICACION1', 'SEGURIDAD_CLASIFICACION1', 'RAPIDEZ_CLASIFICACION1', P_NPS, P_SUG]},
  pbien: {t: 'Satisfechos con el pago', pred: v => bueno(v, 'psat'), preg: [P_NPS, P_SUG]},
  pdif: {t: 'Pagar es difícil', malo: true, pred: v => malo(v, 'ces2'), preg: ['CES2_CLASIFICACION1', P_NPS, P_SUG]},
  pfac: {t: 'Pagar es fácil', pred: v => bueno(v, 'ces2'), preg: [P_NPS, P_SUG]},
  seg1: {t: 'Pago inseguro', malo: true, pred: v => v.seg === 1, preg: ['SEGURIDAD_CLASIFICACION1', P_NPS, P_SUG]},
  seg23: {t: 'Pago seguro', pred: v => v.seg >= 2, preg: [P_NPS, P_SUG]},
  rap1: {t: 'Pago lento', malo: true, pred: v => v.rap === 1, preg: ['RAPIDEZ_CLASIFICACION1', P_NPS, P_SUG]},
  rap23: {t: 'Pago ágil', pred: v => v.rap >= 2, preg: [P_NPS, P_SUG]},
  cnoc: {t: 'Información poco clara', malo: true, pred: v => malo(v, 'clar'), preg: ['CLARIDAD_PROFUNDIZACION1', 'CSAT_PROFUNDIZACION1', P_SUG]},
  cclar: {t: 'Información clara', pred: v => bueno(v, 'clar'), preg: ['CSAT_PROFUNDIZACION1', P_SUG]},
  imal: {t: 'Insatisfechos con la información', malo: true, pred: v => malo(v, 'cinf'), preg: ['CSAT_PROFUNDIZACION1', 'CLARIDAD_PROFUNDIZACION1', P_SUG]},
  ibien: {t: 'Satisfechos con la información', pred: v => bueno(v, 'cinf'), preg: ['CSAT_PROFUNDIZACION1', P_SUG]},
  tmal: {t: 'Insatisfechos con el trato', malo: true, pred: v => malo(v, 'ctra'), preg: ['CSAT1_PROFUNDIZACION1', P_SUG]},
  tbien: {t: 'Satisfechos con el trato', pred: v => bueno(v, 'ctra'), preg: ['CSAT1_PROFUNDIZACION1', P_SUG]},
};
const PAR = {nps: ['det', 'pro'], fsat: ['fmal', 'fbien'], ces1: ['fdif', 'ffac'], va: ['vano', 'vasi'], psat: ['pmal', 'pbien'], ces2: ['pdif', 'pfac'],
  seg: ['seg1', 'seg23'], rap: ['rap1', 'rap23'], clar: ['cnoc', 'cclar'], cinf: ['imal', 'ibien'], ctra: ['tmal', 'tbien']};
// Ejemplos representativos: filtros globales + lente, largo legible, variados por proceso × negocio y pregunta
function ejemplos(lente, k, q) {
  k = k || 12; q = q || '';
  if (!C) return null;
  const L = lente ? LENTES[lente] : null;
  const cand = C.filter(v => (!L || (L.pred(v) && L.preg.includes(v.preg))) && pasa(v.r) && v.texto.length >= 25 && (!q || norm(v.texto).includes(q)));
  const total = cand.length;
  cand.sort((a, b) => Math.abs(a.texto.length - 150) - Math.abs(b.texto.length - 150));
  const grupo = v => v.r[DI.proceso] * 10 + v.r[DI.negocio] + '|' + v.preg;
  const porG = new Map(); for (const v of cand) { const g = grupo(v); if (!porG.has(g)) porG.set(g, []); porG.get(g).push(v); }
  const colas = [...porG.values()].sort((a, b) => b.length - a.length), out = [], vistos = new Set();
  for (let i = 0; out.length < k && colas.some(c => c.length > i); i++)
    for (const c of colas) { const v = c[i]; if (v && !vistos.has(v.texto) && out.length < k) { vistos.add(v.texto); out.push(v); } }
  return {total, items: out};
}
const colNota = n => n == null || n < 0 ? 'var(--ink-3)' : n <= 6 ? 'var(--d-2)' : n <= 8 ? 'var(--ink-3)' : 'var(--d2)';
const col5 = n => n < 1 ? 'var(--ink-3)' : n <= 2 ? 'var(--d-2)' : n === 3 ? 'var(--ink-3)' : 'var(--d2)';
function chipNota(v) {
  if (v.nps >= 0) return `<span class="nota-nps" style="background:${colNota(v.nps)}" ${tipAttr(`Recomendación: ${v.nps} de 10`)}>${v.nps}</span>`;
  const s = v.cinf >= 1 ? v.cinf : v.fsat;
  return s >= 1 ? `<span class="nota-nps" style="background:${col5(s)}" ${tipAttr(`Satisfacción: ${s} de 5`)}>${s}/5</span>` : '';
}
function tarjeta(v, marcar) {
  let t = esc(v.texto);
  if (marcar) t = t.replace(new RegExp(`(${esc(marcar).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'), '<mark>$1</mark>');
  const n = NEG[v.r[DI.negocio]], p = PROC[v.r[DI.proceso]], pq = D.preguntas[D.cod_preguntas.indexOf(v.preg)];
  return `<article class="voz" tabindex="0"><q>${t}</q><div class="m">${chipNota(v)}
    <span><i class="punto" style="background:${CE[n]}"></i> ${esc(p)} ${esc(n)} · ${mesC(PERIODOS[v.r[0]])}</span><span class="mc" title="${esc(pq)}">${esc(pq)}</span></div></article>`;
}
const carEst = {};
function carrusel(id, lentes, titulo) {
  if (!carEst[id] || !lentes.includes(carEst[id].lente)) carEst[id] = {lente: lentes[0]};
  const e = carEst[id], ej = ejemplos(e.lente);
  const cards = ej == null ? Array(5).fill('<div class="esqueleto" aria-hidden="true"></div>').join('') :
    ej.items.length ? ej.items.map(v => tarjeta(v)).join('') : '<p class="vacio">Sin comentarios con estos filtros</p>';
  return `<section class="panel" data-car="${id}"><header><h2>${titulo || 'Lo que dicen los clientes'} <span class="nota" style="font-weight:600;margin-left:6px" ${tipAttr('Ejemplos variados por proceso, negocio y pregunta, con los filtros actuales. Clic en una tarjeta para leerla completa. Datos personales tapados.')}>${ej ? `${f0(ej.total)} comentarios · ${ej.items.length} ejemplos` : 'cargando…'}</span></h2>
      <div class="seg" role="group" aria-label="Tipo de comentario">${lentes.map(l => `<button type="button" data-lente="${l}" aria-pressed="${e.lente === l}">${LENTES[l].t}</button>`).join('')}</div>
</header>
    <div class="voces"><button type="button" class="flecha izq" aria-label="Anteriores">${svgI('izq')}</button><div class="riel-v">${cards}</div><button type="button" class="flecha der" aria-label="Siguientes">${svgI('der')}</button></div></section>`;
}
function montarCarrusel(raiz) {
  raiz.querySelectorAll('[data-car]').forEach(p => {
    p.querySelectorAll('[data-lente]').forEach(b => { b.onclick = () => { carEst[p.dataset.car].lente = b.dataset.lente; pintarTab(); }; });
    const riel = p.querySelector('.riel-v');
    p.querySelector('.izq').onclick = () => riel.scrollBy({left: -riel.clientWidth * .9, behavior: 'smooth'});
    p.querySelector('.der').onclick = () => riel.scrollBy({left: riel.clientWidth * .9, behavior: 'smooth'});
  });
  raiz.querySelectorAll('.voz').forEach(c => { c.onclick = () => c.classList.toggle('abierta'); c.onkeydown = e => { if (e.key === 'Enter') c.classList.toggle('abierta'); }; });
}

// ------------------------------------------------------------------ tooltip
const tip = document.getElementById('tip');
function verTip(html, x, y) {
  tip.innerHTML = html; tip.classList.add('ver');
  const w = tip.offsetWidth, h = tip.offsetHeight;
  tip.style.left = Math.min(innerWidth - w - 8, Math.max(8, x + 14)) + 'px';
  tip.style.top = (y + h + 18 > innerHeight ? y - h - 12 : y + 14) + 'px';
}
const cercano = (e, sel) => e.target && e.target.closest ? e.target.closest(sel) : null;
document.addEventListener('mousemove', e => { const t = cercano(e, '[data-tip]'); if (t) verTip(t.dataset.tip, e.clientX, e.clientY); else tip.classList.remove('ver'); });
document.addEventListener('focusin', e => { const t = cercano(e, '[data-tip]'); if (t) { const b = t.getBoundingClientRect(); verTip(t.dataset.tip, b.left, b.bottom); } });
document.addEventListener('focusout', () => tip.classList.remove('ver'));
const tipAttr = html => `data-tip="${esc(html)}"`;
const tipInd = (k, r, extra) => r == null ? 'Sin respuestas válidas' :
  `<div class="t">${IND[k].nombre}: ${fmt(k, r)}</div>n = ${f0(r.n)} · IC 95 % ±${f1(r.ic)} ${unidad(k)}${r.n < NMIN ? '<br><b>Muestra baja</b>: lectura indicativa' : ''}${extra || ''}`;
const bajo = r => r && r.n < NMIN ? ' <span class="bajo">muestra baja</span>' : '';

// ------------------------------------------------------------------ barra superior
const ctrl = document.getElementById('ctrl'), barF = document.getElementById('filtros');
function pintarCtrl() {
  ctrl.innerHTML = `
    <div class="mes-f" id="f-per"><button type="button" class="sel" aria-haspopup="true" aria-expanded="false" title="Elegir uno o varios meses">${etqMeses(st.meses)}${st.meses.length > 1 ? ` <b>· ${st.meses.length} meses</b>` : ''}</button>
      <div class="pop" hidden role="group" aria-label="Meses"><div class="atajos"><button type="button" data-m="ult">Solo el último</button><button type="button" data-m="todos">Todos</button></div>
        ${PERIODOS.map((p, i) => i).reverse().map(i => `<label class="op"><input type="checkbox" value="${i}"${st.meses.includes(i) ? ' checked' : ''}><span>${mesL(PERIODOS[i])}</span><small>${f0(D.periodos[PERIODOS[i]].n)}</small></label>`).join('')}
        <p class="nota" style="margin:6px 8px 2px">Con varios meses, las cifras suman todas sus encuestas y se comparan con los mismos meses justo antes.</p></div></div>
    <div class="seg" role="group" aria-label="Proceso" id="f-pro"><button type="button" data-v="" aria-pressed="${st.proceso == null}">Todo</button>${PROC.map((e, i) => `<button type="button" data-v="${i}" aria-pressed="${st.proceso === i}">${e}</button>`).join('')}</div>
    <div class="seg" role="group" aria-label="Negocio" id="f-neg"><button type="button" data-v="" aria-pressed="${st.negocio == null}">Ambos</button>${NEG.map((e, i) => `<button type="button" data-v="${i}" aria-pressed="${st.negocio === i}"><i style="background:${CE[e]}"></i>${e}</button>`).join('')}</div>`;
  const fp_ = ctrl.querySelector('#f-per'), bp = fp_.querySelector('button.sel'), pp = fp_.querySelector('.pop');
  bp.onclick = e => { e.stopPropagation(); const si = pp.hidden; document.querySelectorAll('.pop:not([hidden])').forEach(x => { x.hidden = true; }); pp.hidden = !si; bp.setAttribute('aria-expanded', si); };
  fp_.addEventListener('keydown', e => { if (e.key === 'Escape') { pp.hidden = true; bp.setAttribute('aria-expanded', false); bp.focus(); } });
  pp.querySelectorAll('input[type=checkbox]').forEach(c => { c.onchange = () => {
    const ms = new Set(st.meses); if (c.checked) ms.add(+c.value); else ms.delete(+c.value);
    if (!ms.size) { c.checked = true; return; }   // siempre queda al menos un mes
    fijarMeses([...ms]); refrescar({mantener: '__mes'}); }; });
  pp.querySelectorAll('[data-m]').forEach(b => { b.onclick = () => { fijarMeses(b.dataset.m === 'ult' ? [PERIODOS.length - 1] : PERIODOS.map((_, i) => i)); refrescar({mantener: '__mes'}); }; });
  ctrl.querySelectorAll('#f-pro button').forEach(b => { b.onclick = () => { st.proceso = b.dataset.v === '' ? null : +b.dataset.v; refrescar(); }; });
  ctrl.querySelectorAll('#f-neg button').forEach(b => { b.onclick = () => { st.negocio = b.dataset.v === '' ? null : +b.dataset.v; refrescar(); }; });
}
function pintarFiltros() {
  barF.innerHTML = MULTI.map(([k, et]) => {
    const n = st[k].size, txt = n === 0 ? et : n === 1 ? `${et}: <b>${esc(V[k][[...st[k]][0]])}</b>` : `${et}: <b>${n}</b>`;
    return `<div class="pill-f" data-k="${k}"><button type="button" class="${n ? 'activo' : ''}" aria-haspopup="true" aria-expanded="false"><span>${n ? '' : '+ '}${txt}</span></button><div class="pop" hidden role="group" aria-label="${et}"></div></div>`;
  }).join('') + `<button type="button" class="limpiar" id="f-limpiar" ${MULTI.some(([k]) => st[k].size) || st.proceso != null || st.negocio != null ? '' : 'hidden'}>Limpiar filtros</button>`;
  barF.querySelectorAll('.pill-f').forEach(montarPop);
  barF.querySelector('#f-limpiar').onclick = () => { MULTI.forEach(([k]) => st[k].clear()); st.proceso = st.negocio = null; refrescar(); };
}
function montarPop(caja) {
  const k = caja.dataset.k, btn = caja.querySelector('button'), pop = caja.querySelector('.pop');
  const abrir = si => { pop.hidden = !si; btn.setAttribute('aria-expanded', si); if (si) { pintar(); const b = pop.querySelector('.buscar'); if (b) b.focus(); } };
  btn.onclick = e => { e.stopPropagation(); document.querySelectorAll('.pop:not([hidden])').forEach(p => { if (p !== pop) p.hidden = true; }); abrir(pop.hidden); };
  caja.addEventListener('keydown', e => { if (e.key === 'Escape') { abrir(false); btn.focus(); } });
  function pintar() {
    const cnt = new Map(porDim(filas({ignorar: k}), k).map(g => [g.v, g.a.n]));
    const ops = V[k].map((nombre, i) => ({i, nombre, n: cnt.get(i) || 0})).filter(o => o.n || st[k].has(o.i));
    pop.innerHTML = (ops.length > 8 ? `<input class="buscar" type="search" placeholder="Buscar…" aria-label="Buscar">` : '') +
      (ops.length ? ops.map(o => `<label class="op"><input type="checkbox" value="${o.i}"${st[k].has(o.i) ? ' checked' : ''}><span>${esc(o.nombre)}</span><small>${f0(o.n)}</small></label>`).join('') : '<p class="nota" style="padding:8px">Sin opciones con los filtros actuales</p>');
    pop.querySelectorAll('input[type=checkbox]').forEach(c => { c.onchange = () => { if (c.checked) st[k].add(+c.value); else st[k].delete(+c.value); refrescar({mantener: k}); }; });
    const b = pop.querySelector('.buscar'); if (b) b.oninput = () => { const q = norm(b.value); pop.querySelectorAll('.op').forEach(o => { o.hidden = !norm(o.textContent).includes(q); }); };
  }
}
document.addEventListener('click', e => { if (!e.target.closest('.mes-f')) { const mp = document.querySelector('.mes-f .pop'); if (mp && !mp.hidden) { mp.hidden = true; mp.previousElementSibling.setAttribute('aria-expanded', false); } } });
document.addEventListener('click', e => { if (!e.target.closest('.pill-f')) document.querySelectorAll('.pill-f .pop:not([hidden])').forEach(p => { p.hidden = true; p.previousElementSibling.setAttribute('aria-expanded', false); }); });
function alternar(dim, i) {
  if (dim === 'negocio') { st.negocio = st.negocio === i ? null : i; refrescar(); return; }
  if (!MULTI.some(([k]) => k === dim)) return;
  if (st[dim].has(i)) st[dim].delete(i); else st[dim].add(i);
  refrescar();
}

// ------------------------------------------------------------------ navegación
const nav = document.getElementById('nav');
function pintarNav() {
  const inf = D.periodos[PERIODOS[st.periodo]], av = (inf ? inf.calidad : []).filter(c => c.nivel !== 'ok').length;
  nav.innerHTML = TABS.map(([k, t]) => `<button role="tab" id="t-${k}" aria-controls="p-${k}" aria-selected="${st.tab === k}" tabindex="${st.tab === k ? 0 : -1}">${svgI(k)}${t}${k === 'calidad' && av ? `<span class="badge" aria-label="${av} avisos">${av}</span>` : ''}</button>`).join('');
  nav.querySelectorAll('[role=tab]').forEach((b, i, all) => {
    b.onclick = () => irA(b.id.slice(2));
    b.onkeydown = e => {
      const j = ['ArrowDown', 'ArrowRight'].includes(e.key) ? (i + 1) % all.length : ['ArrowUp', 'ArrowLeft'].includes(e.key) ? (i - 1 + all.length) % all.length : -1;
      if (j >= 0) { e.preventDefault(); irA(TABS[j][0]); nav.querySelector('#t-' + TABS[j][0]).focus(); }
    };
  });
  TABS.forEach(([k]) => { document.getElementById('p-' + k).hidden = k !== st.tab; });
}
function irA(k) { st.tab = k; pintarNav(); pintarTab(); escribirHash(); const t = document.querySelector('.top'); if (scrollY > t.offsetTop) scrollTo({top: t.offsetTop}); }

// ------------------------------------------------------------------ piezas
function delta(k, act, ant, etq) {
  if (!act) return '';
  if (!ant) return `<span class="nota">${st.meses.length > 1 ? 'sin un periodo anterior igual para comparar' : 'sin mes anterior'}</span>`;
  const d = act.v - ant.v, c = Math.abs(d) < .05 ? 'igual' : d > 0 ? 'mejora' : 'empeora';
  return `<span class="delta ${c}" ${tipAttr(`${etq}: ${fmt(k, ant)} · n ${f0(ant.n)}`)}>${c === 'igual' ? '■' : d > 0 ? '▲' : '▼'} ${fpp(d)} ${unidad(k)}<span class="sr"> ${c === 'mejora' ? 'mejora' : c === 'empeora' ? 'empeora' : 'igual'}</span></span><span class="nota">vs ${etq}</span>`;
}
function spark(k) {
  const lines = negs().map(e => ({e, pts: serie(k, 'mes', e)})).filter(s => s.pts.length > 1);
  if (!lines.length) return '';
  const W = 200, H = 34, all = [].concat.apply([], lines.map(s => s.pts.map(p => p.r.v))), lo = Math.min.apply(null, all), hi = Math.max.apply(null, all), rg = hi - lo || 1, n = PERIODOS.length;
  const X = i => 3 + (W - 6) * i / Math.max(1, n - 1);
  return `<svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">${st.meses.map(m => `<line x1="${X(m)}" x2="${X(m)}" y1="0" y2="${H}" stroke="var(--eje)" stroke-dasharray="2 3" vector-effect="non-scaling-stroke"/>`).join('')}${lines.map(s =>
    `<polyline fill="none" stroke="${CE[NEG[s.e]]}" stroke-width="2" vector-effect="non-scaling-stroke" stroke-linejoin="round" points="${s.pts.map(p => X(p.x) + ',' + (3 + (H - 6) * (1 - (p.r.v - lo) / rg))).join(' ')}"/>`).join('')}</svg>`;
}
// Pesa: riel de min a max con un punto por negocio (hueco si la muestra es baja) y una marca del total
function pesa(k, rs, tot) {
  const ind = IND[k], X = v => (v - ind.min) / (ind.max - ind.min) * 100, ok = rs.filter(Boolean);
  let s = `<div class="pesa" role="img" aria-label="${ind.nombre}: ${NEG.map((e, i) => e + ' ' + fmt(k, rs[i])).join(', ')}"><span class="riel"></span>`;
  if (ind.min < 0) s += `<span class="cero" style="left:${X(0)}%"></span>`;
  if (ok.length === 2) s += `<span class="une" style="left:${Math.min(X(rs[0].v), X(rs[1].v))}%;width:${Math.abs(X(rs[0].v) - X(rs[1].v))}%"></span>`;
  if (tot && ok.length > 1) s += `<span class="tot" style="left:${X(tot.v)}%"></span>`;
  rs.forEach((r, i) => { if (r) s += `<span class="pt${r.n < NMIN ? ' hueco' : ''}" style="left:${X(r.v)}%;background:${CE[NEG[i]]};${r.n < NMIN ? 'border-color:' + CE[NEG[i]] : ''}" ${tipAttr(tipInd(k, r, `<br>${NEG[i]}`))}></span>`; });
  return s + '</div>';
}
// Gráfico de líneas: se dibuja después de insertar el HTML, con el tamaño real del contenedor
const lineasPH = (k, modo, id) => `<div class="chart" data-lineas="${k}" data-modo="${modo}" id="${id}" role="img" aria-label="${IND[k].nombre} por ${modo === 'mes' ? 'mes' : 'semana'}"></div>`;
const tablaPH = id => `<details class="equiv"><summary>Tabla</summary><div class="tw" data-tabla="${id}"></div></details>`;
function dibujarLineas(raiz) {
  raiz.querySelectorAll('[data-lineas]').forEach(el => {
    const k = el.dataset.lineas, modo = el.dataset.modo, W = el.clientWidth, H = el.clientHeight;
    if (!W || !H) return;
    const S = negs().map(e => ({e: NEG[e], pts: serie(k, modo, e)})).filter(s => s.pts.length);
    const xs = [...new Set([].concat.apply([], S.map(s => s.pts.map(p => p.x))))].sort((a, b) => a - b);
    const tabla = raiz.querySelector(`[data-tabla="${el.id}"]`);
    if (!xs.length) { el.innerHTML = `<p class="vacio">${IND[k].proc != null && st.proceso != null && st.proceso !== IND[k].proc ? `${IND[k].corto} no se mide en ${PROC[st.proceso].toLowerCase()}` : 'Sin datos con estos filtros'}</p>`; if (tabla) tabla.innerHTML = ''; return; }
    const etq = x => { for (const s of S) for (const p of s.pts) if (p.x === x) return p.et; return ''; };
    const L = 38, R = 58, T = 14, B = 24, vals = [].concat.apply([], S.map(s => s.pts.map(p => p.r.v)));
    let lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals); const pad = Math.max(4, (hi - lo) * .15);
    lo = Math.max(IND[k].min, Math.floor((lo - pad) / 10) * 10); hi = Math.min(IND[k].max, Math.ceil((hi + pad) / 10) * 10);
    const X = i => xs.length === 1 ? (L + W - R) / 2 : L + (W - L - R) * i / (xs.length - 1), Y = v => T + (H - T - B) * (1 - (v - lo) / (hi - lo));
    const paso = hi - lo > 60 ? 20 : 10, cada = Math.max(1, Math.ceil(xs.length / Math.max(2, Math.floor((W - L - R) / 52))));
    let s = `<svg viewBox="0 0 ${W} ${H}" aria-hidden="true">`;
    if (modo === 'mes') st.meses.filter(m => xs.includes(m)).forEach(m => { s += `<rect x="${X(xs.indexOf(m)) - 16}" y="${T - 6}" width="32" height="${H - T - B + 12}" rx="10" fill="var(--panel-2)"/>`; });
    for (let v = Math.ceil(lo / paso) * paso; v <= hi; v += paso) s += `<line class="grid" x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}"/><text x="${L - 8}" y="${Y(v) + 4}" text-anchor="end">${f0(v)}</text>`;
    if (lo < 0 && hi > 0) s += `<line class="eje" x1="${L}" x2="${W - R}" y1="${Y(0)}" y2="${Y(0)}"/>`;
    xs.forEach((x, i) => { if (i % cada === 0 || i === xs.length - 1) s += `<text x="${X(i)}" y="${H - 6}" text-anchor="middle"${modo === 'mes' && st.meses.includes(x) ? ' style="fill:var(--ink);font-weight:800"' : ''}>${esc(etq(x))}</text>`; });
    const etqs = [];
    for (const {e, pts} of S) {
      const c = CE[e], pos = pts.map(p => [X(xs.indexOf(p.x)), Y(p.r.v), p]);
      s += `<polyline fill="none" stroke="${c}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round" points="${pos.map(q => q[0] + ',' + q[1]).join(' ')}"/>`;
      s += pos.map(([x, y, p]) => `<circle cx="${x}" cy="${y}" r="4" fill="${p.r.n < NMIN ? 'var(--panel)' : c}" stroke="${p.r.n < NMIN ? c : 'var(--panel)'}" stroke-width="2"/>`).join('');
      const u = ultimo(pos); etqs.push({x: u[0] + 9, y: u[1] + 4, t: fmt(k, u[2].r)});
    }
    // Etiquetas finales: si dos quedan muy cerca, se separan en vertical (14 px)
    etqs.sort((a, b) => a.y - b.y);
    for (let i = 1; i < etqs.length; i++) if (etqs[i].y - etqs[i - 1].y < 14) etqs[i].y = etqs[i - 1].y + 14;
    s += etqs.map(q => `<text class="val" x="${q.x}" y="${q.y}">${q.t}</text>`).join('');
    xs.forEach((x, i) => {
      const x0 = i ? (X(i - 1) + X(i)) / 2 : L, x1 = i < xs.length - 1 ? (X(i) + X(i + 1)) / 2 : W - R;
      const t = S.map(({e, pts}) => { const p = pts.find(p => p.x === x); return p ? `<i style="background:${CE[e]}"></i>${e}: <b>${fmt(k, p.r)}</b> · n ${f0(p.r.n)}${p.r.n < NMIN ? ' (muestra baja)' : ''}` : ''; }).filter(Boolean).join('<br>');
      s += `<rect class="hit" x="${x0}" y="${T}" width="${x1 - x0}" height="${H - T - B}" ${tipAttr(`<div class="t">${esc(etq(x))}</div>${t}`)}/>`;
    });
    el.innerHTML = s + '</svg>';
    if (tabla) tabla.innerHTML = `<table class="rk"><thead><tr><th>${modo === 'mes' ? 'Mes' : 'Semana'}</th>${S.map(s => `<th class="num">${s.e}</th><th class="num">n</th>`).join('')}</tr></thead><tbody>${xs.map(x => `<tr><td>${esc(etq(x))}</td>${S.map(s => { const p = s.pts.find(p => p.x === x); return `<td class="num">${p ? fmt(k, p.r) : '—'}</td><td class="num">${p ? f0(p.r.n) : '—'}</td>`; }).join('')}</tr>`).join('')}</tbody></table>`;
  });
}
// Distribución 1–5 centrada en el 3: a la izquierda lo malo, a la derecha lo bueno
const C5 = ['var(--d-2)', 'var(--d-1)', 'var(--d0)', 'var(--d1)', 'var(--d2)'];
function divergente(grupos, k) {
  const P = grupos.map(g => { const t = [1, 2, 3, 4, 5].map(i => g.a[k + '_' + i]), n = t.reduce((x, y) => x + y, 0); return Object.assign({}, g, {t, n, p: t.map(x => n ? x / n * 100 : 0)}); }).filter(g => g.n);
  if (!P.length) return `<p class="vacio">Sin respuestas con estos filtros</p>`;
  const izq = Math.max.apply(null, P.map(g => g.p[0] + g.p[1] + g.p[2] / 2)), der = Math.max.apply(null, P.map(g => g.p[4] + g.p[3] + g.p[2] / 2)), tot = izq + der;
  return `<div class="leyenda">${[1, 2, 3, 4, 5].map((q, i) => `<span><i style="background:${C5[i]}"></i>${q}${i === 0 ? ' · la peor' : i === 4 ? ' · la mejor' : ''}</span>`).join('')}</div>` + P.map(g => {
    const off = (izq - (g.p[0] + g.p[1] + g.p[2] / 2)) / tot * 100;
    return `<div class="apil"><div class="et">${esc(g.nombre)}<small>n ${f0(g.n)}</small></div><div class="tira" style="padding-left:${off}%" role="img" aria-label="${esc(g.nombre)}: ${g.p.map((p, i) => (i + 1) + ': ' + f1(p) + ' %').join(', ')}">${g.p.map((p, i) => `<span class="${i === 2 ? 'osc' : ''}" style="width:${p / tot * 100}%;background:${C5[i]}" ${tipAttr(`<div class="t">${esc(g.nombre)} · nota ${i + 1}</div>${f1(p)} % (${f0(g.t[i])} de ${f0(g.n)})`)}>${p / tot * 100 > 7 ? f0(p) + '%' : ''}</span>`).join('')}<span class="centro" style="left:${izq / tot * 100}%"></span></div><div class="fin">${fmt(k, IND[k].calc(g.a))}<small>${IND[k].corto}</small></div></div>`;
  }).join('');
}
function apilada(grupos, partes, k) {
  const gs = grupos.filter(g => partes.some(p => p.v(g.a)));
  if (!gs.length) return `<p class="vacio">Sin respuestas con estos filtros</p>`;
  return `<div class="leyenda">${partes.map(p => `<span><i style="background:${p.c}"></i>${p.t}</span>`).join('')}</div>` + gs.map(g => {
    const c = partes.map(p => p.v(g.a)), n = c.reduce((x, y) => x + y, 0) || 1;
    return `<div class="apil"><div class="et">${esc(g.nombre)}<small>n ${f0(n)}</small></div><div class="tira">${c.map((x, i) => `<span class="${partes[i].osc ? 'osc' : ''}" style="width:${x / n * 100}%;background:${partes[i].c}" ${tipAttr(`<div class="t">${esc(g.nombre)} · ${partes[i].t}</div>${f1(x / n * 100)} % (${f0(x)})`)}>${x / n > .07 ? f0(x / n * 100) + '%' : ''}</span>`).join('')}</div><div class="fin">${fmt(k, IND[k].calc(g.a))}<small>${IND[k].corto}</small></div></div>`;
  }).join('');
}
const PARTES = {
  nps: [{t: 'Detractores 0–6', c: 'var(--d-2)', v: a => a.det}, {t: 'Pasivos 7–8', c: 'var(--d0)', osc: true, v: a => a.nps_val - a.det - a.prom}, {t: 'Promotores 9–10', c: 'var(--d2)', v: a => a.prom}],
  va: [{t: 'No cuadran', c: 'var(--d-2)', v: a => a.va_no}, {t: 'Sí cuadran', c: 'var(--d2)', v: a => a.va_si}],
  seg: [{t: '1 · la peor', c: 'var(--d-2)', v: a => a.seg_1}, {t: '2', c: 'var(--d1)', v: a => a.seg_2}, {t: '3', c: 'var(--d2)', v: a => a.seg_3}],
  rap: [{t: '1 · la peor', c: 'var(--d-2)', v: a => a.rap_1}, {t: '2', c: 'var(--d1)', v: a => a.rap_2}, {t: '3', c: 'var(--d2)', v: a => a.rap_3}],
};
const distribucion = (k, grupos) => IND[k].tipo === 'esc5' ? divergente(grupos, k) : apilada(grupos, PARTES[k], k);
function barras(items, base, color) {
  if (!items.length || !base) return '<p class="vacio">Sin datos</p>';
  const max = Math.max.apply(null, items.map(x => x.c));
  return `<div class="barras">${items.map(x => `<div class="barra${x.cod ? ' cod' : ''}" ${tipAttr(`<div class="t">${esc(x.nombre)}</div>${f0(x.c)} de ${f0(base)} (${f1(x.c / base * 100)} %)`)}><span class="et" title="${esc(x.nombre)}">${esc(x.nombre)}</span><span class="p"><b style="width:${x.c / max * 100}%;background:${color(x)}"></b></span><span class="num">${f1(x.c / base * 100)} %<small>${f0(x.c)}</small></span></div>`).join('')}</div>`;
}
// Motivos cerrados de una pregunta: % sobre las encuestas que dieron al menos un motivo
function motivos(k, idx) {
  const c = new Map();
  for (const i of idx) for (const [t, n] of MT.get(i) || []) { const et = D.motivos.etiquetas[t]; if (et.indexOf(k + '|') === 0) c.set(t, (c.get(t) || 0) + n); }
  return [...c].sort((a, b) => a[0] - b[0]).map(([t, n]) => { const nom = D.motivos.etiquetas[t].split('|')[1]; return {nombre: nom, c: n, cod: nom.indexOf('Código') === 0 || nom === 'Otro'}; });
}
// Móvil trae el texto de la opción; Hogar, un código sin catálogo. Se muestran por separado para no mezclar bases.
function panelMotivos(k, titulo, sub, idx) {
  const H = NEG.indexOf('Hogar'), M = NEG.indexOf('Móvil');
  const ixM = idx.filter(i => D.cubo[i][DI.negocio] === M), ixH = idx.filter(i => D.cubo[i][DI.negocio] === H);
  const bM = sumar(ixM)['mot_' + k], bH = sumar(ixH)['mot_' + k];
  const itM = motivos(k, ixM), itH = motivos(k, ixH);
  const color = x => x.cod ? 'var(--ink-3)' : 'var(--d-2)';
  const movil = bM ? `${barras(itM, bM, color)}` : `<p class="vacio">${st.negocio === H ? 'Con el filtro Hogar solo hay motivos en código: ábrelos abajo.' : 'Sin motivos con estos filtros'}</p>`;
  const hogar = bH ? `<details class="cods"${st.negocio === H ? ' open' : ''}><summary>Hogar: ${f0(bH)} encuestas con el motivo en código</summary>${barras(itH, bH, () => 'var(--ink-3)')}<p class="nota motivo-nota">Hogar entrega el motivo como número (1, 2… 94) y falta el catálogo para traducirlo.</p></details>` : '';
  return `<section class="panel"><header><h2>${titulo}</h2><p class="sub">${sub} · Móvil: % sobre ${f0(bM)} encuestas que dieron un motivo (puede elegir varios).</p></header>
    <div class="largas">${movil}</div>${hogar}</section>`;
}
const DIM_FP = [['region', 'Región'], ['negocio', 'Negocio']], DIM_COB = [['canal', 'Canal'], ['negocio', 'Negocio'], ['casa', 'Casa de cobro']];
const rkEst = {};
function ranking(id, k, dims, tope) {
  dims = dims || DIM_FP; tope = tope || 10;
  if (!rkEst[id]) rkEst[id] = {dim: dims[0][0], orden: 'n', todos: false};
  const e = rkEst[id];
  const idx = filas(), tot = IND[k].calc(sumar(idx));
  const g = porDim(idx, e.dim).map(x => Object.assign({}, x, {r: IND[k].calc(x.a)})).filter(x => x.r);
  const val = x => x.r.n < NMIN ? (e.orden === 'peor' ? 1e9 : -1e9) : x.r.v;
  g.sort(e.orden === 'n' ? (a, b) => b.r.n - a.r.n : e.orden === 'peor' ? (a, b) => val(a) - val(b) : (a, b) => val(b) - val(a));
  const vis = e.todos ? g : g.slice(0, tope), ind = IND[k], X = v => (v - ind.min) / (ind.max - ind.min) * 100, fil = e.dim === 'negocio' || MULTI.some(([m]) => m === e.dim);
  const nomDim = dims.find(d => d[0] === e.dim)[1];
  const sel = x => e.dim === 'negocio' ? st.negocio === x.v : fil && st[e.dim].has(x.v);
  return `<section class="panel" data-rk="${id}"><header><h2>${ind.corto} por ${nomDim.toLowerCase()}</h2>
    <div class="herr"><div class="seg" role="group" aria-label="Abrir por">${dims.map(([d, t]) => `<button type="button" data-dim="${d}" aria-pressed="${e.dim === d}">${t}</button>`).join('')}</div>
    <div class="seg" role="group" aria-label="Ordenar"><button type="button" data-ord="n" aria-pressed="${e.orden === 'n'}">Volumen</button><button type="button" data-ord="peor" aria-pressed="${e.orden === 'peor'}">Peor</button><button type="button" data-ord="mejor" aria-pressed="${e.orden === 'mejor'}">Mejor</button></div></div></header>
    <div class="tw"><table class="rk"><caption class="sr">${ind.nombre} por ${nomDim}</caption><thead><tr><th>${nomDim}</th><th class="num">n</th><th class="num">${ind.corto}</th><th><span aria-hidden="true">│ total ${fmt(k, tot)}</span><span class="sr">barra</span></th><th class="num">vs total</th></tr></thead><tbody>
    ${vis.map(x => { const d = tot ? x.r.v - tot.v : 0, b = ind.min < 0 ? `left:${Math.min(X(0), X(x.r.v))}%;width:${Math.abs(X(x.r.v) - X(0))}%` : `left:0;width:${X(x.r.v)}%`;
      return `<tr class="${x.r.n < NMIN ? 'poca' : ''}${fil ? ' clic' : ''}${sel(x) ? ' sel' : ''}" ${fil ? `tabindex="0" data-v="${x.v}"` : ''}><td class="nom">${esc(x.nombre)}${bajo(x.r)}</td><td class="num">${f0(x.r.n)}</td><td class="num"><b>${fmt(k, x.r)}</b></td><td class="bar"><div class="mini" ${tipAttr(tipInd(k, x.r))}><b style="${b}"></b>${tot ? `<span class="ref" style="left:${X(tot.v)}%"></span>` : ''}</div></td><td class="num"><span class="dif ${x.r.n < NMIN || Math.abs(d) < .05 ? '' : d > 0 ? 'mejora' : 'empeora'}">${fpp(d)}</span></td></tr>`; }).join('') || '<tr><td colspan="5" class="vacio">Sin datos</td></tr>'}
    </tbody></table></div>${g.length > tope ? `<button type="button" class="mas">${e.todos ? 'Ver menos' : `Ver los ${g.length}`}</button>` : ''}
    <p class="nota" style="margin:6px 0 0">${fil ? 'Clic en una fila para filtrar todo el tablero. ' : ''}Gris = menos de ${NMIN} encuestas (no se ordena por valor).</p></section>`;
}
function montarRanking(raiz) {
  raiz.querySelectorAll('[data-rk]').forEach(p => {
    const e = rkEst[p.dataset.rk];
    p.querySelectorAll('[data-dim]').forEach(b => { b.onclick = () => { e.dim = b.dataset.dim; e.todos = false; pintarTab(); }; });
    p.querySelectorAll('[data-ord]').forEach(b => { b.onclick = () => { e.orden = b.dataset.ord; pintarTab(); }; });
    const mas = p.querySelector('.mas'); if (mas) mas.addEventListener('click', () => { e.todos = !e.todos; pintarTab(); });
    p.querySelectorAll('tr.clic').forEach(tr => { const f = () => alternar(e.dim, +tr.dataset.v); tr.onclick = f; tr.onkeydown = ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); f(); } }; });
  });
}

// ------------------------------------------------------------------ correlación con el NPS
// Pearson entre la nota del indicador y la recomendación 0–10, encuesta por encuesta (solo factura y pago pregunta NPS)
function corr(k, a) {
  const n = a['r_' + k + '_n'];
  if (n == null || n < NMIN) return null;
  const mx = a['r_' + k + '_x'] / n, my = a['r_' + k + '_y'] / n;
  const vx = a['r_' + k + '_xx'] / n - mx * mx, vy = a['r_' + k + '_yy'] / n - my * my, cv = a['r_' + k + '_xy'] / n - mx * my;
  return vx > 0 && vy > 0 ? {r: cv / Math.sqrt(vx * vy), n} : null;
}
// Fuerza: verde ≥ 0,5 (fuerte), amarillo 0,3–0,5 (moderada), rojo < 0,3 (baja)
const fuerza = r => Math.abs(r) >= .5 ? 'fuerte' : Math.abs(r) >= .3 ? 'moderada' : 'baja';
const nf2 = new Intl.NumberFormat('es-CO', {minimumFractionDigits: 2, maximumFractionDigits: 2});
function corrTxt(k, a) {
  if (IND[k].proc === COB) return ` · <span class="corr na" ${tipAttr('<div class="t">Correlación con el NPS</div>Cobranza no pregunta recomendación (NPS), así que no hay correlación que calcular.')}>—</span>`;
  const c = corr(k, a);
  if (!c) return ` · <span class="corr na" ${tipAttr('<div class="t">Correlación con el NPS</div>Menos de ' + NMIN + ' encuestas con ambas respuestas: no se calcula.')}>—</span>`;
  const v = nf2.format(c.r).replace('-', '−'), f = fuerza(c.r);
  return ` · <span class="corr ${f}" ${tipAttr(`<div class="t">Correlación con el NPS: ${v} (${f})</div>Pearson entre la nota de este indicador y la recomendación de 0 a 10, encuesta por encuesta (${f0(c.n)} pares, con los filtros actuales).<br>Verde ≥ 0,50 fuerte · amarillo 0,30 a 0,49 moderada · rojo < 0,30 baja.<br>${c.r >= .3 ? 'Quien califica mejor este punto tiende a recomendar más.' : 'Este punto se mueve poco junto con la recomendación.'} Correlación no es causa.`)}><span class="sr">Correlación con el NPS, ${f}: </span>${v}</span>`;
}

// ------------------------------------------------------------------ el recorrido (firma del Resumen)
function vRuta() {
  const o = {proceso: null}, a = sumar(filas(o)), pn = porNeg(o);
  const ma = mesesAnteriores(), ant = ma ? sumar(filas({proceso: null, periodo: ma})) : null, etA = ma ? etqCorta(ma) : '';
  const etapa = (E, i) => {
    const rs = E.ks.map(k => ({k, r: IND[k].calc(a)})), ok = rs.filter(x => x.r && x.r.n >= NMIN);
    const debil = ok.length > 1 ? ok.reduce((m, x) => x.r.v < m.r.v ? x : m).k : null;
    const pasos = rs.map(({k, r}) => {
      if (!r) return '';
      const pr = ant ? IND[k].calc(ant) : null;
      return `<button type="button" class="paso${k === debil ? ' debil' : ''}" data-cajon="${k}" aria-label="${IND[k].nombre}: ${fmt(k, r)}. Ver detalle">
        <span class="nom">${esc(IND[k].nombre)}<small>n ${f0(r.n)}${r.n < NMIN ? ' · muestra baja' : ''}${corrTxt(k, a)}</small></span>
        <span class="val" ${tipAttr(tipInd(k, r))}>${fmtGrande(k, r)}</span>
        ${pesa(k, pn.map(x => IND[k].calc(x)), r)}
        <span class="pie-p">${delta(k, r, pr, etA)}${k === debil ? '<span class="tag">la más baja de la etapa</span>' : ''}</span></button>`;
    }).join('');
    return `<div class="etapa"><h3><span class="ord" aria-hidden="true">${i + 1}</span>${E.t}</h3><p>${E.s}</p>${pasos || '<p class="vacio nota">Sin encuestas de esta etapa con los filtros actuales</p>'}</div>`;
  };
  const con = (k, txt) => `<div class="conector" aria-hidden="true"><svg viewBox="0 0 28 16">${ICO[k]}</svg>${txt ? `<small>${txt}</small>` : ''}</div>`;
  return `<section class="panel"><header><h2 ${tipAttr('Todos los indicadores de la encuesta, en el orden en que el cliente vive el proceso. Respeta los filtros de mes, negocio, segmento, región, casa de cobro y canal; no el de proceso. Clic en un indicador para ver su detalle y comentarios.')}>El recorrido del cliente <span class="info">?</span></h2>
      <div class="leyenda">${NEG.map(e => `<span><i style="background:${CE[e]};border-radius:50%"></i>${e}</span>`).join('')}<span><i class="l" style="background:var(--ink);opacity:.55;width:2px;height:11px"></i>Total</span><span class="nota">Punto hueco = menos de ${NMIN} encuestas</span></div>
      <p class="sub">${etqMeses(st.meses)} · ${st.negocio == null ? 'Hogar + Móvil' : NEG[st.negocio]}. La raya roja marca el indicador más bajo de cada etapa. Junto al n, la correlación con el NPS (verde fuerte, amarillo moderada, rojo baja).</p></header>
    <div class="ruta">${etapa(ETAPAS[0], 0)}${con('flecha')}${etapa(ETAPAS[1], 1)}${con('flechaP', 'si no paga a tiempo')}${etapa(ETAPAS[2], 2)}</div></section>`;
}

// ------------------------------------------------------------------ dolores del cliente
// Conteos por fila del cubo y dolor: [n, prom, det, npsv, a_ok, a_val, b_ok, b_val]. Los de «sin el dolor» salen por resta.
const DL = D.dolores, DLF = new Map();
for (const f of DL.filas) { if (!DLF.has(f[0])) DLF.set(f[0], []); DLF.get(f[0]).push(f); }
const DOLOR = {
  va_no: ['Lo que cobran no cuadra con mi plan', 'Le indican un valor y después resulta uno diferente.'],
  entender: ['No entiendo la factura', 'Es muy engorroso entender la factura cuando no se entienden los valores facturados.'],
  no_llega: ['La factura no me llega', 'No recibe factura, solo mensajes de pago.'],
  sube: ['La factura sube sin aviso', 'Le dicen un valor y a los 3 meses sube.'],
  pagar: ['Pagar no es fácil', 'Para pagar por Nequi se le dificulta porque no le permite continuar con el proceso.'],
  lento: ['El pago tarda o no se confirma', 'El sistema tarda en confirmar el pago.'],
  confianza: ['Pagar no me da confianza', 'El canal de pago no genera suficiente confianza.'],
  servicio: ['Pago por un servicio que falla', 'El servicio de hogar, la señal es muy intermitente.'],
  insisten: ['Me llaman demasiado', 'Uno se pasa un día de la factura y lo bombardean con llamadas.'],
  maquina: ['Me cobra una máquina', 'Lo llaman y son bots; le gustaría que el contacto fuera más humano.'],
  ya_pague: ['Me cobran aunque ya pagué', 'Paga el servicio, pero le siguen cobrando así ya haya pagado.'],
  claridad: ['No me explican qué debo ni por qué', 'Le comentaron solo el saldo y no le aclararon a qué se deben las alzas en la factura.'],
  valor: ['Me cobran un valor que no reconozco', 'Le ofrecieron un servicio y le están cobrando otro valor totalmente diferente.'],
};
const dolEst = {rango: 'mes', proc: FP};
function filasDolor() {
  const o = {proceso: dolEst.proc};
  if (dolEst.rango === 'mes') return filas(o);
  const anio = PERIODOS[st.periodo].slice(0, 4);   // año corrido hasta el último mes elegido
  return filas(Object.assign(o, {periodo: null})).filter(i => { const p = PERIODOS[D.cubo[i][0]]; return p.slice(0, 4) === anio && D.cubo[i][0] <= st.periodo; });
}
const npsDe = (v, prom, det) => v ? (prom - det) / v * 100 : null, pctDe = (ok, v) => v ? ok / v * 100 : null;
function calcDolores(idx) {
  const fp = dolEst.proc === FP, a = sumar(idx), s = DL.claves.map(() => [0, 0, 0, 0, 0, 0, 0, 0]);
  for (const i of idx) for (const f of DLF.get(i) || []) { const t = s[f[1]]; for (let j = 0; j < 8; j++) t[j] += f[2 + j]; }
  const A = fp ? 'fsat' : 'cinf', aOk = a[A + '_4'] + a[A + '_5'], aV = [1, 2, 3, 4, 5].reduce((x, i) => x + a[A + '_' + i], 0);
  const bOk = a.ctra_4 + a.ctra_5, bV = [1, 2, 3, 4, 5].reduce((x, i) => x + a['ctra_' + i], 0);
  // m1 = indicador de los puntos (NPS en factura y pago, CSAT información en cobranza); m2 = el segundo carril
  const m1 = fp ? (v, x) => npsDe(v[3], v[1], v[2]) : v => pctDe(v[4], v[5]);
  const tot = {n: a.n, m1: fp ? npsDe(a.nps_val, a.prom, a.det) : pctDe(aOk, aV), m2: fp ? pctDe(aOk, aV) : pctDe(bOk, bV)};
  const totV = [a.n, a.prom, a.det, a.nps_val, aOk, aV, bOk, bV];
  const fila = (k, v) => {
    const r = v.map((x, j) => totV[j] - x), con = m1(v), sin = m1(r);
    const c2 = fp ? pctDe(v[4], v[5]) : pctDe(v[6], v[7]), s2 = fp ? pctDe(r[4], r[5]) : pctDe(r[6], r[7]);
    return {k, n: v[0], nSin: r[0], pct: a.n ? v[0] / a.n * 100 : 0, con, sin, c2, s2, pts: con != null && sin != null ? v[0] / a.n * (sin - con) : null};
  };
  const todas = DL.claves.map((k, i) => fila(k, s[i]));
  const alg = fp ? 'alguno_fp' : 'alguno_cob';
  return {tot, alguno: todas.find(x => x.k === alg), dol: todas.filter(x => DL.reglas[x.k] && DL.reglas[x.k][0] === PROC[dolEst.proc])};
}
// Pista de −100 a 100 (NPS) o de 0 a 100 (%) con los dos puntos: con el dolor y sin él
function pista(con, sin, min, ref, suf, tip) {
  if (con == null || sin == null) return '<div class="pz vacia">—</div>';
  const X = v => (v - min) / (100 - min) * 100, lo = Math.min(con, sin), hi = Math.max(con, sin);
  const etq = v => `${f0(v)}${suf}`;
  return `<div class="pz" ${tipAttr(tip)}><div class="riel">${min < 0 ? '<span class="cero" style="left:50%"></span>' : ''}
    ${ref != null ? `<span class="ref" style="left:${X(ref)}%"></span>` : ''}
    <span class="tramo" style="left:${X(lo)}%;width:${X(hi) - X(lo)}%"></span>
    <span class="pt sin" style="left:${X(sin)}%"></span><span class="pt con" style="left:${X(con)}%"></span>
    <span class="lbl izq" style="right:${100 - X(lo)}%">${etq(lo)}</span><span class="lbl der" style="left:${X(hi)}%">${etq(hi)}</span></div></div>`;
}
function vDolores() {
  if (st.proceso != null) dolEst.proc = st.proceso;
  const fp = dolEst.proc === FP, idx = filasDolor(), r = calcDolores(idx), tot = r.tot, alguno = r.alguno;
  const n1 = fp ? 'NPS' : 'CSAT información', n2 = fp ? 'CSAT factura' : 'CSAT trato', u1 = fp ? 'pts' : 'pp', min1 = fp ? -100 : 0, s1 = fp ? '' : ' %';
  const rango = dolEst.rango === 'mes' ? etqMeses(st.meses) : `${mesC(PERIODOS[0]).split('-')[0]} a ${MES[+PERIODOS[st.periodo].slice(4) - 1]} ${PERIODOS[st.periodo].slice(0, 4)}`;
  const orden = r.dol.filter(x => x.n).sort((a, b) => (b.n >= NMIN) - (a.n >= NMIN) || b.pts - a.pts);
  const maxPts = Math.max.apply(null, [1].concat(orden.filter(x => x.n >= NMIN).map(x => x.pts)));
  const X = v => (v - min1) / (100 - min1) * 100;
  const techo = alguno && alguno.sin != null && alguno.nSin >= NMIN ? alguno.sin : null;
  const cab = tot.m1 == null || !alguno ? '' : `
    <div class="dol-hero">
      <div class="dh-num"><span>${n1} hoy</span><b>${f1(tot.m1)}${s1}</b></div>
      <div class="dh-pista" ${tipAttr(`<div class="t">Techo teórico</div>Las ${f0(alguno.nSin)} encuestas que no muestran ningún dolor dan ${n1} de ${techo == null ? '—' : f1(techo) + s1}. Si todos calificaran así, el ${n1} subiría ${techo == null ? '—' : f1(techo - tot.m1)} ${u1}.`)}>
        <div class="riel">${min1 < 0 ? '<span class="cero" style="left:50%"></span>' : ''}
          ${techo == null ? '' : `<span class="flujo" style="left:${X(Math.min(tot.m1, techo))}%;width:${Math.abs(X(techo) - X(tot.m1))}%"></span><span class="pt fin" style="left:${X(techo)}%"></span>`}
          <span class="pt hoy" style="left:${X(tot.m1)}%"></span></div>
        <div class="escala"><span>${min1 < 0 ? '−100' : '0'}</span><span>${min1 < 0 ? '0' : '50'}</span><span>100</span></div></div>
      <div class="dh-num der"><span>Sin ningún dolor</span><b>${techo == null ? '—' : f1(techo) + s1}</b></div>
      <div class="dh-pts"><b>${techo == null ? '—' : fpp(techo - tot.m1)}</b><span>${u1} de ${n1} en juego</span></div>
      <p class="dh-pie">${f1(alguno.pct)} % de las encuestas (${f0(alguno.n)} de ${f0(tot.n)}) muestra al menos un dolor. Su ${n1} es ${f1(alguno.con)}${s1}${alguno.c2 != null ? ` y su ${n2} ${f1(alguno.c2)} %` : ''}.</p>
    </div>`;
  const filasH = orden.map((x, i) => {
    const tc = DOLOR[x.k], poca = x.n < NMIN, br = x.sin - x.con;
    const tipN = `<div class="t">${esc(tc[0])}</div>${n1} con el dolor: <b>${f1(x.con)}${s1}</b> (n ${f0(x.n)})<br>${n1} sin el dolor: <b>${f1(x.sin)}${s1}</b> (n ${f0(x.nSin)})<br>Brecha: ${f1(br)} ${u1}`;
    const tipC = `<div class="t">${n2} · ${esc(tc[0])}</div>Con el dolor: <b>${x.c2 == null ? '—' : f1(x.c2) + ' %'}</b><br>Sin el dolor: <b>${x.s2 == null ? '—' : f1(x.s2) + ' %'}</b>${x.c2 != null && x.s2 != null ? `<br>Brecha: ${f1(x.s2 - x.c2)} pp` : ''}`;
    const tipP = `<div class="t">Si este dolor desapareciera</div>Quienes lo viven (${f1(x.pct)} %) pasarían a calificar como quienes no lo viven: el ${n1} iría de ${f1(tot.m1)} a ${f1(x.sin)}.<br>${f1(x.pct)} % × ${f1(br)} ${u1} de brecha = <b>${fpp(x.pts)} ${u1}</b>`;
    return `<li class="dol${poca ? ' poca' : ''}">
      <span class="rk">${String(i + 1).padStart(2, '0')}</span>
      <div class="qu"><span class="mom" ${tipAttr('Regla: ' + DL.reglas[x.k][2])}>${esc(DL.reglas[x.k][1])}</span><b>${esc(tc[0])}</b><q>${esc(tc[1])}</q></div>
      <div class="vive"><b>${f1(x.pct)} %</b><span>${f0(x.n)} encuestas</span>${poca ? '<span class="bajo">muestra baja</span>' : ''}</div>
      ${pista(x.con, x.sin, min1, tot.m1, s1, tipN)}
      ${pista(x.c2, x.s2, 0, tot.m2, ' %', tipC)}
      <div class="gana" ${tipAttr(tipP)}><b>${x.pts == null ? '—' : fpp(x.pts)}</b><small>${u1}</small><span class="barrita"><i style="width:${poca || x.pts == null ? 0 : Math.max(0, x.pts) / maxPts * 100}%"></i></span></div>
    </li>`;
  }).join('');
  const segProc = st.proceso == null ? `<div class="seg" role="group" aria-label="Proceso de los dolores" id="dol-p">${[FP, COB].map(p => `<button type="button" data-p="${p}" aria-pressed="${dolEst.proc === p}">${PROC[p]}</button>`).join('')}</div>` : '';
  return `<section class="panel dolores" id="dolores"><header><h2>Dolores del cliente</h2>
      <div class="herr">${segProc}<div class="seg" role="group" aria-label="Periodo de los dolores" id="dol-r"><button type="button" data-r="mes" aria-pressed="${dolEst.rango === 'mes'}">${st.meses.length > 1 ? 'Meses elegidos' : 'Mes'}</button><button type="button" data-r="acum" aria-pressed="${dolEst.rango === 'acum'}">Año corrido</button></div></div>
      <p class="sub">${PROC[dolEst.proc]} · ${st.negocio == null ? 'Hogar + Móvil' : NEG[st.negocio]} · ${rango}. Lo que responden y cuentan los clientes, cruzado con su ${n1} y su ${n2}. Arriba, el dolor que más ${u1} de ${n1} le quita a la nota.</p></header>
    ${cab}
    <div class="dol-ley" aria-hidden="true"><span></span><span>Lo vive</span><span><i class="pt con"></i>Con el dolor <i class="pt sin"></i>Sin el dolor <i class="ref"></i>Total · ${n1}</span><span>${n2}</span><span>${n1} que recupera</span></div>
    <ol class="dol-lista">${filasH || '<li class="vacio">Sin encuestas con estos filtros</li>'}</ol>
    <p class="nota dol-nota">${fp ? 'Cuatro dolores salen de la respuesta a la encuesta (valores que no cuadran, entender la factura de 1 a 3, pagar de 1 a 3 y seguridad o rapidez en 1) y tres de lo que cuenta el cliente en sus comentarios.' : 'La claridad sale de la respuesta (1 a 3); el resto, de lo que cuenta el cliente en sus comentarios.'} Pasa el cursor por la etiqueta de cada dolor para ver su regla. Los puntos son teóricos: suponen que quien deja de vivir el dolor califica igual que quien nunca lo vivió. Como un cliente puede tener varios dolores, las filas no se suman; el número de arriba cuenta cada encuesta una sola vez.</p>
  </section>`;
}

// ------------------------------------------------------------------ vistas
const grNeg = (o, total) => {
  const g = negs().map(e => ({nombre: NEG[e], a: sumar(filas(Object.assign({}, o || {}, {negocio: e})))}));
  return st.negocio == null && total !== false ? g.concat([{nombre: 'Total', a: sumar(filas(Object.assign({}, o || {}, {negocio: null})))}]) : g;
};
function kpiCards(ks) {
  const a = sumar(filas()), ant = mesesAnteriores(), aAnt = ant ? sumar(filas({periodo: ant})) : null, etA = ant ? etqCorta(ant) : '';
  return `<section class="kpis${ks.length % 2 ? ' impar' : ''}" style="--nk:${ks.length - 1}" aria-label="Indicadores de ${etqMeses(st.meses)}">${ks.map((k, i) => {
    const r = IND[k].calc(a), pr = aAnt ? IND[k].calc(aAnt) : null;
    return `<article class="kpi${i === 0 ? ' estrella' : ''}">${i === 0 ? '<span class="glow"></span>' : ''}
      <div class="et">${IND[k].corto} <span class="info" tabindex="0" ${tipAttr(esc(IND[k].nombre + '. ' + IND[k].def))}>?</span></div>
      <div class="v" ${tipAttr(tipInd(k, r))}>${fmtGrande(k, r)}</div>
      <div class="pie">${r ? delta(k, r, pr, etA) : `<span class="nota">${IND[k].proc != null ? 'Solo se mide en ' + PROC[IND[k].proc].toLowerCase() : 'Sin respuestas'}</span>`}</div>
      ${spark(k)}
      <div class="pie"><span>n ${r ? f0(r.n) : 0}${r ? ` · ±${f1(r.ic)}` : ''}</span>${bajo(r)}<button type="button" class="ver" data-cajon="${k}" aria-label="Ver detalle y comentarios de ${IND[k].nombre}">Voces ›</button></div></article>`;
  }).join('')}</section>`;
}
function vResumen(p) {
  const ks = KPIS[st.proceso == null ? 'todos' : st.proceso];
  const evoKs = KS.filter(k => st.proceso == null || IND[k].proc === st.proceso);
  if (!evoKs.includes(st.evo)) st.evo = evoKs[0];
  // Panel derecho: en factura y pago, el efecto de que el cobro no cuadre; en cobranza, por dónde se enteró
  let der;
  if (st.proceso === COB) {
    const idx = filas(), a = sumar(idx), g = porDim(idx, 'canal').filter(x => V.canal[x.v] !== 'No aplica').map(x => ({nombre: x.nombre, c: x.a.n})).sort((x, y) => y.c - x.c);
    der = `<section class="panel"><header><h2>Por dónde se enteró del cobro</h2><p class="sub">Canal de comunicación · % de ${f0(a.n)} encuestas de cobranza.</p></header>${barras(g, a.n, () => 'var(--d1)')}</section>`;
  } else {
    const gs = grNeg({proceso: FP}).map(g => { const a = g.a, si = npsDe(a.va_si, a.prom_vasi, a.det_vasi), no = npsDe(a.va_no, a.prom_vano, a.det_vano);
      return `<div class="bf"><div class="et"><b>${esc(g.nombre)}</b><br><span class="nota">${fmt('va', IND.va.calc(a))} cuadran</span></div>
        <div class="c"><span>Cuadran</span><b>${si == null ? '—' : f1(si)}</b><span>n ${f0(a.va_si)}</span></div>
        <div class="c"><span>No cuadran</span><b>${no == null ? '—' : f1(no)}</b><span>n ${f0(a.va_no)}</span></div>
        <div class="c gap"><span>Brecha</span><b>${si != null && no != null ? f1(si - no) : '—'}</b><span>pts de NPS</span></div></div>`; }).join('');
    der = `<section class="panel"><header><h2>Cuando la factura no cuadra con el plan</h2><p class="sub">NPS de quienes dicen que los valores de la factura van de acuerdo con su plan, frente al de quienes dicen que no.</p></header><div class="brechas">${gs}</div></section>`;
  }
  const lentes = st.proceso === COB ? ['imal', 'tmal', 'cnoc', 'ibien'] : st.proceso === FP ? ['det', 'pro', 'vano', 'fdif', 'pdif'] : ['det', 'pro', 'vano', 'imal', 'tmal'];
  p.innerHTML = `
    ${kpiCards(ks)}
    ${vRuta()}
    <div class="g g-2-1" style="min-height:0">
      <section class="panel"><header><h2>${IND[st.evo].corto} · ${st.modo === 'mes' ? 'mes a mes' : 'semana a semana, ' + etqMeses(st.meses)}</h2>
        <div class="herr"><label class="sr" for="evo-k">Indicador</label><select class="sel" id="evo-k">${ETAPAS.map(E => { const ks = E.ks.filter(k => evoKs.includes(k)); return ks.length ? `<optgroup label="${E.t}">${ks.map(k => `<option value="${k}"${st.evo === k ? ' selected' : ''}>${IND[k].nombre}</option>`).join('')}</optgroup>` : ''; }).join('')}${evoKs.includes('nps') ? `<option value="nps"${st.evo === 'nps' ? ' selected' : ''}>NPS · recomendación</option>` : ''}</select>
        ${PERIODOS.length > 1 ? `<div class="seg" role="group" aria-label="Agrupar" id="evo-m"><button type="button" data-m="mes" aria-pressed="${st.modo === 'mes'}">Mes</button><button type="button" data-m="semana" aria-pressed="${st.modo === 'semana'}">Semana</button></div>` : ''}</div>
        <div class="leyenda" style="flex-basis:100%">${negs().map(e => `<span><i class="l" style="background:${CE[NEG[e]]}"></i>${NEG[e]}</span>`).join('')}<span class="nota">Punto hueco = menos de ${NMIN} encuestas</span>${tablaPH('evo')}</div></header>
        ${lineasPH(st.evo, st.modo, 'evo')}</section>
      ${der}
    </div>
    ${vDolores()}
    ${carrusel('res', lentes)}`;
  p.querySelectorAll('#dol-r button').forEach(b => { b.onclick = () => { dolEst.rango = b.dataset.r; pintarTab(); }; });
  p.querySelectorAll('#dol-p button').forEach(b => { b.onclick = () => { dolEst.proc = +b.dataset.p; pintarTab(); }; });
  p.querySelector('#evo-k').onchange = e => { st.evo = e.target.value; pintarTab(); };
  p.querySelectorAll('#evo-m button').forEach(b => { b.onclick = () => { st.modo = b.dataset.m; pintarTab(); }; });
}
// En las pestañas de proceso se ignora el filtro de proceso: cada una muestra el suyo
const avisoProceso = proc => st.proceso != null && st.proceso !== proc ? `<p class="nota" style="margin:0">El filtro de proceso dice «${PROC[st.proceso]}»; esta pestaña muestra ${PROC[proc].toLowerCase()} igual.</p>` : '';
function conProceso(proc, fn) { const g = st.proceso; st.proceso = proc; try { return fn(); } finally { st.proceso = g; } }
function vFactura(p) {
  p.innerHTML = avisoProceso(FP) + conProceso(FP, () => {
    const idx = filas(), a = sumar(idx), gr = grNeg();
    return `${kpiCards(['fsat', 'ces1', 'va'])}
    <div class="g g2"><section class="panel"><header><h2>¿Qué tan fácil es entender la factura?</h2><p class="sub">CES 1 · centrado en el 3: a la izquierda lo difícil, a la derecha lo fácil.</p></header>${divergente(gr, 'ces1')}</section>
      <section class="panel"><header><h2>¿Los valores cuadran con el plan?</h2><p class="sub">Y la satisfacción con el valor facturado, de 1 a 5.</p></header>${apilada(gr, PARTES.va, 'va')}<div style="height:10px"></div>${divergente(gr, 'fsat')}</section></div>
    <div class="g g2">${panelMotivos('va', 'Por qué no cuadran los valores', 'Motivos de quienes dicen que no', idx)}${panelMotivos('ces1', 'Qué cuesta entender de la factura', 'Motivos de quienes califican 1 a 3', idx)}</div>
    ${carrusel('fac', ['vano', 'fdif', 'fmal', 'fbien'])}
    <div class="g g2">${ranking('va', 'va')}${ranking('ces1', 'ces1')}</div>`;
  });
}
function vPago(p) {
  p.innerHTML = avisoProceso(FP) + conProceso(FP, () => {
    const idx = filas(), a = sumar(idx), gr = grNeg();
    return `${kpiCards(['psat', 'ces2', 'rap', 'seg'])}
    <div class="g g2"><section class="panel"><header><h2>¿Qué tan fácil es pagar?</h2><p class="sub">CES 2 · centrado en el 3: a la izquierda lo difícil, a la derecha lo fácil.</p></header>${divergente(gr, 'ces2')}<div style="height:10px"></div><h2 style="margin:6px 0 4px;font:800 14px var(--f-ui)">Satisfacción con el pago</h2>${divergente(gr, 'psat')}</section>
      <section class="panel"><header><h2>Rapidez y seguridad al pagar</h2><p class="sub">Escala de 1 a 3. El 1 es la respuesta mala; el indicador es el % que da 2 o 3.</p></header>${apilada(gr, PARTES.rap, 'rap')}<div style="height:10px"></div>${apilada(gr, PARTES.seg, 'seg')}</section></div>
    <div class="g g2">${panelMotivos('ces2', 'Qué hace difícil pagar', 'Motivos de quienes califican 1 a 3', idx)}<div class="g">${panelMotivos('rap', 'Por qué el pago es lento', 'Motivos de quienes califican 1', idx)}${panelMotivos('seg', 'Por qué el pago no da confianza', 'Motivos de quienes califican 1', idx)}</div></div>
    ${carrusel('pag', ['pdif', 'pmal', 'rap1', 'seg1', 'pbien'])}
    <div class="g g2">${ranking('ces2', 'ces2')}${ranking('psat', 'psat')}</div>`;
  });
}
function vCobranza(p) {
  p.innerHTML = avisoProceso(COB) + conProceso(COB, () => {
    const idx = filas(), a = sumar(idx), gr = grNeg();
    const canales = porDim(idx, 'canal').filter(x => V.canal[x.v] !== 'No aplica').map(x => ({nombre: x.nombre, c: x.a.n})).sort((x, y) => y.c - x.c);
    return `${kpiCards(['cinf', 'ctra', 'clar'])}
    <div class="g g2"><section class="panel"><header><h2>Información y trato en la gestión de cobro</h2><p class="sub">De 1 a 5 · centrado en el 3.</p></header>${divergente(gr, 'cinf')}<div style="height:10px"></div><h2 style="margin:6px 0 4px;font:800 14px var(--f-ui)">Satisfacción con el trato</h2>${divergente(gr, 'ctra')}</section>
      <section class="panel"><header><h2>¿Fue clara la información?</h2><p class="sub">Claridad de 1 a 5.</p></header>${divergente(gr, 'clar')}<div style="height:14px"></div><h2 style="margin:0 0 8px;font:800 14px var(--f-ui)">Por dónde se enteró del cobro</h2>${barras(canales, a.n, () => 'var(--d1)')}</section></div>
    ${carrusel('cob', ['imal', 'tmal', 'cnoc', 'ibien', 'tbien'])}
    <div class="g g2">${ranking('cinf', 'cinf', DIM_COB)}${ranking('ctra', 'ctra', DIM_COB)}</div>`;
  });
}
const exEst = {lente: '', q: '', ver: 36};
function vVoz(p) {
  const ej = C ? ejemplos(exEst.lente || null, exEst.ver, norm(exEst.q)) : null;
  const grupos = [['Factura y pago', ['det', 'pro', 'fmal', 'fbien', 'fdif', 'ffac', 'vano', 'vasi', 'pmal', 'pbien', 'pdif', 'pfac', 'seg1', 'seg23', 'rap1', 'rap23']], ['Cobranza', ['imal', 'ibien', 'tmal', 'tbien', 'cnoc', 'cclar']]];
  p.innerHTML = `
    <section class="panel"><header><h2>Explorador de comentarios</h2><span class="nota">${ej ? f0(ej.total) + ' comentarios' : 'Cargando…'}</span><p class="sub">${alcance()} · ${etqMeses(st.meses)}. Los comentarios los transcribe el analista durante la llamada; los datos personales van tapados.</p></header>
      <div class="ex-herr"><input type="search" id="ex-q" placeholder="Buscar: factura, llamadas, Nequi, aumento…" value="${esc(exEst.q)}" aria-label="Buscar en comentarios">
        <label class="sr" for="ex-l">Tipo de comentario</label><select class="sel" id="ex-l"><option value="">Todos los comentarios</option>${grupos.map(([g, ls]) => `<optgroup label="${g}">${ls.map(l => `<option value="${l}"${exEst.lente === l ? ' selected' : ''}>${LENTES[l].t}</option>`).join('')}</optgroup>`).join('')}</select></div>
      <div class="ex">${ej == null ? Array(6).fill('<div class="esqueleto"></div>').join('') : ej.items.map(v => tarjeta(v, exEst.q)).join('') || '<p class="vacio">Sin comentarios</p>'}</div>
      ${ej && ej.total > ej.items.length ? `<button type="button" class="mas" id="ex-mas">Ver más (${f0(ej.total - ej.items.length)} restantes)</button>` : ''}</section>`;
  const q = p.querySelector('#ex-q'); let t;
  q.oninput = () => { clearTimeout(t); t = setTimeout(() => { exEst.q = q.value.trim(); exEst.ver = 36; pintarTab(); const n = p.querySelector('#ex-q'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }, 250); };
  p.querySelector('#ex-l').onchange = e => { exEst.lente = e.target.value; exEst.ver = 36; pintarTab(); };
  const mas = p.querySelector('#ex-mas'); if (mas) mas.addEventListener('click', () => { exEst.ver += 36; pintarTab(); });
}
function vCalidad(p) {
  const per = PERIODOS[st.periodo], inf = D.periodos[per], o = {error: 0, aviso: 1, ok: 2}, ico = {ok: '✓', aviso: '!', error: '✕'};
  const ch = inf.calidad.slice().sort((a, b) => o[a.nivel] - o[b.nivel]), n = l => ch.filter(c => c.nivel === l).length;
  p.innerHTML = `
    <div class="g g-2-1"><section class="panel"><header><h2>Contrato de datos · ${mesL(per)}</h2><span class="nota">${n('ok')} correctos · ${n('aviso')} avisos · ${n('error')} errores</span><p class="sub">Un «error» detiene la actualización y no se publica. Los avisos se explican aquí. Elige el mes:</p></header>
      <div class="meses" role="group" aria-label="Mes">${PERIODOS.map((pp, i) => { const a = D.periodos[pp].calidad.filter(c => c.nivel !== 'ok').length; return `<button type="button" data-i="${i}" aria-pressed="${i === st.periodo}">${mesC(pp)} · ${a} avisos</button>`; }).join('')}</div><div style="height:10px"></div>
      <div class="checks">${ch.map(c => `<div class="check ${c.nivel}"><span class="ico" aria-hidden="true">${ico[c.nivel]}</span><div><b>${esc(c.titulo)}</b><span class="sr"> (${c.nivel})</span><p>${esc(c.detalle)}</p></div></div>`).join('')}</div></section>
      <div class="g" style="align-content:start"><section class="panel"><header><h2>Fuente</h2></header><dl class="defs"><dt>Tabla</dt><dd>${esc(D.tabla)} · Oracle. Factura y pago llega cada mes desde TBL_ENCUESTAS_BRM + TBL_CLIENTES_BRM (cruce por UNIQUEID); cobranza, de la carga inicial.</dd><dt>Encuestas</dt><dd>${f0(inf.n)} en ${mesL(per)} · ${f0(PERIODOS.reduce((s, pp) => s + D.periodos[pp].n, 0))} en total</dd><dt>Carga en Oracle</dt><dd>${esc(inf.fecha_carga)}</dd><dt>Procesado</dt><dd>${esc(inf.generado)}</dd><dt>Comentarios</dt><dd>${f0(D.n_comentarios)} con contenido, con datos personales tapados</dd></dl></section>
        <section class="panel"><header><h2>Definiciones</h2></header><dl class="defs">${KS.map(k => `<dt>${IND[k].corto}</dt><dd>${esc(IND[k].nombre)}. ${esc(IND[k].def)}</dd>`).join('')}
          <dt>Mes</dt><dd>Mes de FECHA_GESTION, el día de la llamada. En factura y pago es la FECHA_REGISTRADA de TBL_CLIENTES_BRM.</dd><dt>Unidad</dt><dd>La encuesta (ID_GESTION).</dd><dt>Negocio</dt><dd>Fijo = Hogar; Móvil = Móvil.</dd><dt>Segmento</dt><dd>Masivo = estudios «Factura y Pago Fijo» y «Móvil» y cobranza; Corporativo = «Factura y Pago Fijo PYME» y «Móvil PYME». Hogar y Móvil incluyen los dos segmentos salvo que se filtre.</dd><dt>IC 95 %</dt><dd>Margen de error por muestreo. Diferencias menores pueden ser ruido.</dd>
          <dt>Supuestos</dt><dd>En factura y pago, el nombre de cada pregunta viene de BRM (AGRUPACION). Siguen sin confirmar el umbral 2–3 de seguridad y rapidez y las etiquetas de cobranza (CSAT = información del cobro, CSAT1 = trato), que se dedujeron de los motivos.</dd></dl></section></div></div>`;
  p.querySelectorAll('.meses button').forEach(b => { b.onclick = () => { fijarMeses([+b.dataset.i]); refrescar(); }; });
}
const VISTAS = {resumen: vResumen, factura: vFactura, pago: vPago, cobranza: vCobranza, voz: vVoz, calidad: vCalidad};
function pintarTab() {
  const p = document.getElementById('p-' + st.tab);
  VISTAS[st.tab](p);
  const proc = {factura: FP, pago: FP, cobranza: COB}[st.tab];
  if (proc != null) conProceso(proc, () => { montarRanking(p); montarCarrusel(p); dibujarLineas(p); });
  else { montarRanking(p); montarCarrusel(p); dibujarLineas(p); }
  p.querySelectorAll('[data-cajon]').forEach(b => { b.onclick = () => abrirCajon(b.dataset.cajon); });
  if (!C && st.tab !== 'calidad') cargarComentarios();
}

// ------------------------------------------------------------------ spotlight por indicador
const cajon = document.getElementById('cajon'), velo = document.getElementById('velo'); let volverA = null;
function abrirCajon(k, foco) {
  if (foco !== false) volverA = document.activeElement;
  const ind = IND[k];
  conProceso(ind.proc, () => {
    const a = sumar(filas()), r = ind.calc(a), par = PAR[k];
    const col = l => { const ej = ejemplos(l, 4); return `<div class="col"><h4><i class="punto" style="background:${LENTES[l].malo ? 'var(--d-2)' : 'var(--d2)'}"></i>${LENTES[l].t}${ej ? ` <span class="nota">${f0(ej.total)}</span>` : ''}</h4>${ej == null ? '<div class="esqueleto"></div>' : ej.items.map(v => tarjeta(v)).join('') || '<p class="nota">Sin comentarios</p>'}</div>`; };
    cajon.dataset.k = k;
    cajon.innerHTML = `<header><span class="nota">${etqMeses(st.meses)} · ${PROC[ind.proc]} · ${st.negocio == null ? 'Hogar + Móvil' : NEG[st.negocio]}</span><h2 id="cajon-t" style="margin:0;font:900 22px var(--f-num)">${ind.nombre}</h2>
        <div class="big">${fmtGrande(k, r)}</div><p class="def">${esc(ind.def)}</p><span class="nota">n ${r ? f0(r.n) : 0}${r ? ` · IC 95 % ±${f1(r.ic)}` : ''}</span>
        <button type="button" class="icono x" aria-label="Cerrar">${svgI('x')}</button></header>
      <div class="cuerpo"><div><h3>Mes a mes</h3><div class="chart" style="min-height:170px" data-lineas="${k}" data-modo="mes" id="cj-l"></div>${tablaPH('cj-l')}</div>
        <div><h3>Distribución</h3>${distribucion(k, grNeg())}</div>
        <div><h3>Lo que dicen</h3><div class="dos">${col(par[0])}${col(par[1])}</div>
        <button type="button" class="mas" id="cj-mas">Ver todos en Voces ›</button></div></div>`;
    cajon.hidden = velo.hidden = false;
    requestAnimationFrame(() => { cajon.classList.add('ver'); velo.classList.add('ver'); conProceso(ind.proc, () => dibujarLineas(cajon)); });
    cajon.querySelector('.x').onclick = cerrarCajon;
    cajon.querySelector('#cj-mas').onclick = () => { exEst.lente = par[0]; cerrarCajon(); irA('voz'); };
    montarCarrusel(cajon);
  });
  if (foco !== false) cajon.querySelector('.x').focus();
  if (!C) cargarComentarios();
}
function cerrarCajon() {
  cajon.classList.remove('ver'); velo.classList.remove('ver'); delete cajon.dataset.k;
  setTimeout(() => { if (!cajon.dataset.k) cajon.hidden = velo.hidden = true; }, 300);
  if (volverA && volverA.focus) volverA.focus();
}
velo.onclick = cerrarCajon;
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && cajon.dataset.k) cerrarCajon();
  if (e.key === 'Tab' && cajon.dataset.k) { const f = [...cajon.querySelectorAll('button,[tabindex="0"],summary')]; if (!f.length) return;
    if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); ultimo(f).focus(); } else if (!e.shiftKey && document.activeElement === ultimo(f)) { e.preventDefault(); f[0].focus(); } }
});

// ------------------------------------------------------------------ descarga de la base (filtros activos)
const dl = document.getElementById('dl'), dlPop = document.getElementById('dl-pop'), dlAbrir = document.getElementById('dl-abrir');
const dlEst = {alcance: 'mes', formato: 'xlsx'};
const slug = t => norm(t).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const filtrosTxt = () => [st.proceso != null ? PROC[st.proceso] : '', st.negocio != null ? NEG[st.negocio] : '', ...MULTI.filter(([k]) => st[k].size).map(([k, et]) => `${et}: ${[...st[k]].map(i => V[k][i]).join(', ')}`)].filter(Boolean).join(' · ') || 'Sin filtros';
function dlPeriodos() { return dlEst.alcance === 'mes' ? st.meses.map(i => PERIODOS[i]) : D.base.periodos; }
function dlNombre() {
  const ps = dlPeriodos(), f = [st.proceso != null ? slug(PROC[st.proceso]) : '', st.negocio != null ? slug(NEG[st.negocio]) : '', ...MULTI.filter(([k]) => st[k].size).map(([k]) => [...st[k]].map(i => slug(V[k][i])).join('-'))].filter(Boolean);
  return `factura_pago_cobro_base_${ps[0]}${ps.length > 1 ? '_a_' + ultimo(ps) : ''}${f.length ? '_' + f.join('_').slice(0, 80) : ''}.${dlEst.formato}`;
}
function pintarDescarga() {
  if (dlPop.hidden) return;
  const n = sumar(filas(dlEst.alcance === 'mes' ? {} : {periodo: null})).n;
  const ir = dlPop.querySelector('.ir');
  if (ir && ir.dataset.estado === 'trabajando') return;
  dlPop.innerHTML = `<h3>Descargar base de encuestas</h3>
    <div><div class="et-dl">Meses</div><div class="seg" role="group" aria-label="Meses"><button type="button" data-a="mes" aria-pressed="${dlEst.alcance === 'mes'}">${etqMeses(st.meses)}</button><button type="button" data-a="todos" aria-pressed="${dlEst.alcance === 'todos'}">Todos (${mesC(D.base.periodos[0])} a ${mesC(ultimo(D.base.periodos))})</button></div></div>
    <div><div class="et-dl">Formato</div><div class="seg" role="group" aria-label="Formato"><button type="button" data-f="xlsx" aria-pressed="${dlEst.formato === 'xlsx'}" title="Libro de Excel (.xlsx)">Excel</button><button type="button" data-f="csv" aria-pressed="${dlEst.formato === 'csv'}" title="Texto separado por punto y coma">CSV</button><button type="button" data-f="parquet" aria-pressed="${dlEst.formato === 'parquet'}" title="Columnar y comprimido, para Python o Power BI">Parquet</button></div></div>
    <div class="resumen-dl"><b>${f0(n)} encuestas</b>${esc(filtrosTxt())}</div>
    <button type="button" class="ir"${n ? '' : ' disabled'}><span>Descargar ${dlEst.formato === 'xlsx' ? 'Excel' : dlEst.formato.toUpperCase()}</span></button>
    <p class="nota" style="margin:0">Una fila por encuesta con notas, motivos, segmentos y comentarios. Sin datos personales: no trae nombre, cédula, teléfono ni analista; los comentarios van con [nombre], [#] y [correo] tapados.</p>`;
  dlPop.querySelectorAll('[data-a]').forEach(b => { b.onclick = () => { dlEst.alcance = b.dataset.a; pintarDescarga(); }; });
  dlPop.querySelectorAll('[data-f]').forEach(b => { b.onclick = () => { dlEst.formato = b.dataset.f; pintarDescarga(); }; });
  dlPop.querySelector('.ir').onclick = e => descargarBase(e.currentTarget);
}
const cargarBase = p => new Promise((ok, mal) => {
  if (window.BASE && window.BASE[p]) return ok(window.BASE[p]);
  const sc = document.createElement('script'); sc.src = `base/${p}.js`;
  sc.onload = () => window.BASE && window.BASE[p] ? ok(window.BASE[p]) : mal(new Error(p)); sc.onerror = () => mal(new Error(p));
  document.body.appendChild(sc);
});
const lineaCSV = f => f.map(v => /[;"\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v).join(';');
async function descargarBase(btn) {
  if (btn.dataset.estado === 'trabajando') return;
  const txt = btn.querySelector('span'), etq = txt.textContent, aviso = (e, t, p) => { btn.dataset.estado = e; txt.textContent = t; btn.style.setProperty('--p', (p == null ? 0 : p) + '%'); };
  try {
    const cols = D.base.columnas, ci = c => cols.indexOf(c), ps = dlPeriodos(), conds = [];
    if (st.proceso != null) { const j = ci(D.base.filtro.proceso), v = PROC[st.proceso]; conds.push(r => r[j] === v); }
    if (st.negocio != null) { const j = ci(D.base.filtro.negocio), v = NEG[st.negocio]; conds.push(r => r[j] === v); }
    for (const [k] of MULTI) if (st[k].size) { const j = ci(D.base.filtro[k]), vs = new Set([...st[k]].map(i => V[k][i])); conds.push(r => vs.has(r[j])); }
    const w = EXPORTAR.crear(dlEst.formato, cols);
    let n = 0;
    for (let i = 0; i < ps.length; i++) {
      aviso('trabajando', `Preparando ${Math.round(i / ps.length * 100)} %`, i / ps.length * 100);
      const rows = (await cargarBase(ps[i])).filter(r => conds.every(c => c(r)));
      for (let j = 0; j < rows.length; j += 5000) await w.agregar(rows.slice(j, j + 5000).map(lineaCSV));
      n += rows.length;
    }
    aviso('trabajando', 'Generando archivo…', 100);
    const blob = await w.cerrar(), a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = dlNombre(); a.addEventListener('click', e => e.stopPropagation()); a.click();   // sin insertarlo: su clic no debe cerrar el panel
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    aviso('listo', `Listo: ${f0(n)} filas`, 100);
  } catch (e) {
    console.warn(e); aviso('error', 'No se pudo descargar (¿abierto sin servidor?)', 0);
  }
  setTimeout(() => { delete btn.dataset.estado; txt.textContent = etq; btn.style.removeProperty('--p'); }, 3500);
}
dlAbrir.onclick = e => { e.stopPropagation(); const si = dlPop.hidden; dlPop.hidden = !si; dlAbrir.setAttribute('aria-expanded', si); if (si) { pintarDescarga(); const b = dlPop.querySelector('.ir'); if (b) b.focus(); } };
dlPop.addEventListener('click', e => e.stopPropagation());   // el panel se repinta al elegir opciones: que el clic no lo cierre
dl.addEventListener('keydown', e => { if (e.key === 'Escape' && !dlPop.hidden) { dlPop.hidden = true; dlAbrir.setAttribute('aria-expanded', false); dlAbrir.focus(); } });
document.addEventListener('click', e => { const b = dlPop.querySelector('.ir'); if (!dl.contains(e.target) && !dlPop.hidden && !(b && b.dataset.estado === 'trabajando')) { dlPop.hidden = true; dlAbrir.setAttribute('aria-expanded', false); } });

// ------------------------------------------------------------------ tema
const btnTema = document.getElementById('tema');
function pintarTema() {
  const osc = document.documentElement.dataset.theme === 'dark';
  btnTema.innerHTML = svgI(osc ? 'sol' : 'luna') + `<span class="tx">${osc ? 'Modo claro' : 'Modo oscuro'}</span>`;
  btnTema.setAttribute('aria-label', osc ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro');
  btnTema.title = osc ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro';
}
btnTema.onclick = () => {
  const t = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = t; try { localStorage.setItem('fpc-tema', t); } catch (e) { /* sin almacenamiento */ }
  pintarTema(); pintarTab();
};

// ------------------------------------------------------------------ ciclo
function refrescar(o) {
  o = o || {};
  pintarCtrl(); pintarFiltros();
  if (o.mantener === '__mes') { const b = ctrl.querySelector('#f-per button.sel'); if (b) b.click(); }
  else if (o.mantener) { const b = barF.querySelector(`.pill-f[data-k="${o.mantener}"] button`); if (b) b.click(); }
  pintarNav(); pintarTab(); escribirHash(); pintarDescarga();
  if (cajon.dataset.k) abrirCajon(cajon.dataset.k, false);
}
leerHash();
document.getElementById('actualizado').textContent = D.generado.slice(0, 10).split('-').reverse().join('/');
document.getElementById('sello').textContent = `${mesC(PERIODOS[0])} a ${mesC(ultimo(PERIODOS))} · ${f0(PERIODOS.reduce((s, p) => s + D.periodos[p].n, 0))} encuestas`;
pintarTema(); refrescar();
let rz; addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { pintarTab(); if (cajon.dataset.k) conProceso(IND[cajon.dataset.k].proc, () => dibujarLineas(cajon)); }, 150); });
addEventListener('hashchange', () => { leerHash(); refrescar(); });
})();
