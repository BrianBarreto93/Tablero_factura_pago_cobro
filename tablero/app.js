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
  x: '<path d="M6 6l12 12M18 6L6 18"/>', copiar: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h8"/>', izq: '<path d="M15 5l-7 7 7 7"/>', der: '<path d="M9 5l7 7-7 7"/>',
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
// Nombres que el enmascarado de origen dejó a la vista («Cliente victoria…», «YUBILU [nombre]», «[nombre] garcía»).
// Se tapan al cargar, así no salen en la nube, los carruseles ni el cajón.
const NOMBRES = {}, NOMBRES_AMB = {};
('alejandra alejandro andrea andres angela angelica ana adriana alberto alfredo alvaro amanda antonio arturo beatriz bernardo camila carlos carolina ' +
  'catalina cecilia cristian cristina daniel daniela david diana diego edgar eduardo edwin elizabeth elsa emilio enrique ernesto fabio fernando francisco ' +
  'gabriel gabriela german gerardo gilberto guillermo gustavo hector helena elena henry hernan hernando hugo humberto ignacio ines isabel jaime javier ' +
  'jairo jesus jhon john jorge jose josefa juan juana julian juliana luis luisa manuel marcela marcos margarita maria mariana marina mario martha ' +
  'mauricio milena monica nancy natalia nelson nestor nicolas nidia nohora olga oscar pablo patricia paula pedro rafael ramiro raul ricardo roberto ' +
  'rodrigo ruben ruth sandra sebastian sergio sofia sonia stella susana tatiana teresa valentina vanessa veronica victor viviana wilson william yolanda ' +
  'yesenia yaneth yenny jenny johana johanna ximena lorena dora aide marleny edith gladys omaira nubia miriam myriam nelly yamile yuli yuliana dario ' +
  'duvan yesid fredy freddy alexander alexandra jhonatan jonathan kevin brayan yeison stiven estefania paola lucy libia doris ofelia rubiela orlando ' +
  'alirio efrain ivan yesica jessica erika erica marisol jenifer jennifer deisy leidy mayra mireya nora irma betty esther ester eva lida ligia marlene sara')
  .split(' ').forEach(w => { NOMBRES[w] = 1; });
// Nombres que también son palabras o lugares («la luz», «Santa Marta», «julio»): solo se tapan junto a «cliente», «titular», [nombre]…
('luz norma victoria esperanza consuelo amparo pilar soledad mercedes dolores socorro blanca clara aurora flor paz cruz silvia florencia alba estrella ' +
  'sol rocio carmen gloria cesar santiago marco marta julio angel rosa armando salvador lucero piedad concepcion').split(' ').forEach(w => { NOMBRES_AMB[w] = 1; });
const PERSONA = /^(cliente|clienta|titular|tercero|tercera|senor|senora|sr|sra|don|dona|esposo|esposa|hijo|hija|mama|papa|hermano|hermana|asesor|asesora|evaluacion|usuario|usuaria|hablo|hable)$/;
const FAMILIA = /^(padre|madre|papa|mama|hijo|hija|esposo|esposa|sobrin[oa]|niet[oa]|abuel[oa]|ti[oa]|suegr[oa]|cunad[oa]|prim[oa]|herman[oa])$/;
const TOK_NOM = /\[nombre\]|[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+/g;
function taparNombres(textos) {
  const frec = {};
  textos.forEach(t => { (norm(t).match(/[a-zñ]+/g) || []).forEach(w => { frec[w] = (frec[w] || 0) + 1; }); });
  const raro = (w, k) => (frec[w] || 0) <= k;
  return textos.map(t => {
    const tk = []; let m; TOK_NOM.lastIndex = 0;
    while ((m = TOK_NOM.exec(t))) tk.push({s: m[0], i: m.index, w: norm(m[0]), nom: m[0] === '[nombre]'});
    if (!tk.length) return t;
    const mayus = t === t.toUpperCase();
    const pegado = (a, b) => /^[\s.,]*$/.test(t.slice(a.i + a.s.length, b.i));   // solo espacios, punto o coma entre los dos
    let cambio = false;
    tk.forEach((x, j) => {
      if (x.nom) return;
      const ant = j ? tk[j - 1] : null, sig = tk[j + 1], w = x.w;
      const santo = ant && /^(san|santa|santo)$/.test(ant.w);   // «santa maría», «San Vicente»: lugares
      const trasPersona = ant && !ant.nom && PERSONA.test(ant.w) && pegado(ant, x);
      const junto = (ant && (ant.nom || ant.tap) && pegado(ant, x)) || (sig && sig.nom && /^\s+$/.test(t.slice(x.i + x.s.length, sig.i)));
      const mayInicial = /^[A-ZÁÉÍÓÚÑ]/.test(x.s), capital = /^[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+$/.test(x.s);
      const apellido = ant && (ant.nom || ant.tap) && /^\s+$/.test(t.slice(ant.i + ant.s.length, x.i)) && w.length >= 2;
      if (santo || /^(san|santa|santo)$/.test(w)) return;
      if ((NOMBRES[w] && !NOMBRES_AMB[w]) ||
        (NOMBRES_AMB[w] && (trasPersona || junto)) ||
        (trasPersona && capital && !mayus && raro(w, 2)) ||                                  // «Tercero Deyli indica…»
        (sig && sig.nom && /^\s+$/.test(t.slice(x.i + x.s.length, sig.i)) && mayInicial && raro(w, 4)) ||   // «YUBILU [nombre]», «Dora [nombre]»
        (apellido && raro(w, 2) && !FAMILIA.test(w) && (ant.tap || /^[A-ZÁÉÍÓÚÑ]/.test(x.s) || !/(o|ar|er|ir)$/.test(w)))) {   // apellido: «jose suarez», «[nombre] garcía»
        x.tap = true; cambio = true;
      }
    });
    if (!cambio) return t;
    let out = '', p = 0;
    tk.forEach(x => { if (x.tap) { out += t.slice(p, x.i) + '[nombre]'; p = x.i + x.s.length; } });
    return (out + t.slice(p)).replace(/\[nombre\](\s*\[nombre\])+/g, '[nombre]');
  });
}
// Texto para la nube sin las plantillas del analista: «(Cobranza móvil)», «Factura y pago PYME (móvil PYME)», «Evaluación [nombre]»,
// «Su servicio funciona bien, comunicaciones normales», «Sugerencia: no»… Lo que queda vacío o en una sola palabra no entra.
function sinPlantilla(t) {
  const s0 = t.replace(/([a-záéíóúñ])(Sugerencia|SUGERENCIA)/g, '$1. $2');
  let s = s0.replace(/^[\s.,;:-]*(no\b[\s.,;:-]*)?(\(\s*cobranza[^)]{0,20}\)|cobranza (m[oó]vil|fijo)( pyme)?\b|factura y pago (fijo )?pyme\s*\(\s*(m[oó]vil )?pyme\s*\)|\(\s*pyme\s*\))[\s.,;:-]*(ón\b[\s.,;:-]*)?/i, '')
    .replace(/^[\s.,;:-]*evaluaci[oó]n( pyme)?(\s*\[nombre\])*[\s.,;:-]*/i, '')
    .replace(/[\s.,;:-]*factura y pago (fijo )?pyme\s*\(\s*(m[oó]vil )?pyme\s*\)[\s,;:-]*/gi, ' ')   // también al final («Aumento de la factura. Factura y pago PYME…»)
    .replace(/^[\s.,;:-]*ón\b[\s.,;:-]*/i, '')
    .replace(/^((el )?cliente menciona que )?Su servicio funciona (bien|estable)\b[\s,.]*((comunicaciones normales|su facturaci[oó]n bien|en (comunicaciones de )?factura(ci[oó]n)?( esta bien)?)[\s,.]*)?/i, m => /Su servicio/.test(m) ? '' : m)
    .replace(/[\s.,;:]*novedades:\s*se devuelve (la )?llamada y se contin[uú]a (con )?la gesti[oó]n[\s.]*/i, ' ');
  const pref = s !== s0;
  s = s.replace(/[\s.,;:]*\bsugerencias?\s*:\s*(no|n\/a|ninguna?|sin sugerencias?|no tiene|no aplica)?[\s.]*$/i, '')
    .replace(/[\s.,;:]*\bs?in sugerencias?[\s.]*$/i, m => pref || /[.,;:]/.test(m) ? '' : m)
    .replace(/^[\s.,;:-]*sugerencias?\s*:\s*/i, '')
    .trim();
  if (s === t.trim()) return t;
  // Vacío, una sola palabra o solo «el cliente menciona que»: no queda comentario
  return (s.match(/[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+/g) || []).length >= 2 && !/^(el |la )?client[ea] \S+( que)?[\s.,]*$/i.test(s) ? s : '';
}
let C = null, IXP = null, DLC = [], DLP = {};   // IXP = posición de «pregunta» en la fila; DLC/DLP = dolores de los comentarios
function cargarComentarios() {
  if (C || document.getElementById('js-com')) return;
  const s = document.createElement('script'); s.src = 'comentarios.js'; s.id = 'js-com';
  s.onload = () => {
    const cm = window.COMENTARIOS, ix = Object.fromEntries(cm.campos.map((c, i) => [c, i]));
    const notas = cm.campos.slice(ND, cm.campos.indexOf('pregunta'));
    const tx = taparNombres(cm.filas.map(f => f[ix.texto]));
    C = cm.filas.map((f, i) => { const v = {r: f, preg: D.cod_preguntas[f[ix.pregunta]], texto: tx[i], dl: ix.dl == null ? 0 : f[ix.dl] || 0}; notas.forEach(k => { v[k] = f[ix[k]]; }); return v; });
    IXP = ix.pregunta; DLC = cm.dl_claves || []; DLP = cm.dl_propia || {};
    delete window.COMENTARIOS;
    // Solo se rehacen los carruseles: repintar toda la pestaña reiniciaría las animaciones de los gráficos
    if (st.tab === 'voz' || st.tab === 'calidad') pintarTab(); else rehacerCarruseles(document.getElementById('p-' + st.tab));
    if (cajon.dataset.k) abrirCajon(cajon.dataset.k, false, true);
    const sd = document.getElementById('dolores'); if (sd && dolEst.voz) ponerVoces(sd, false);
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
  return `<section class="panel" data-car="${id}" data-lentes="${lentes.join('|')}"${titulo ? ` data-tit="${esc(titulo)}"` : ''}><header><h2>${titulo || 'Lo que dicen los clientes'} <span class="nota" style="font-weight:600;margin-left:6px" ${tipAttr('Ejemplos variados por proceso, negocio y pregunta, con los filtros actuales. Clic en una tarjeta para leerla completa. Datos personales tapados.')}>${ej ? `${f0(ej.total)} comentarios · ${ej.items.length} ejemplos` : 'cargando…'}</span></h2>
      <div class="seg" role="group" aria-label="Tipo de comentario">${lentes.map(l => `<button type="button" data-lente="${l}" aria-pressed="${e.lente === l}">${LENTES[l].t}</button>`).join('')}</div>
</header>
    <div class="voces"><button type="button" class="flecha izq" aria-label="Anteriores">${svgI('izq')}</button><div class="riel-v">${cards}</div><button type="button" class="flecha der" aria-label="Siguientes">${svgI('der')}</button></div></section>`;
}
// Rehace los carruseles (o solo el de id «soloId») sin tocar el resto de la pestaña
function rehacerCarruseles(raiz, soloId) {
  const proc = {factura: FP, pago: FP, cobranza: COB}[st.tab];
  const f = () => raiz.querySelectorAll('[data-car]').forEach(sec => {
    if (soloId && sec.dataset.car !== soloId) return;
    const t = document.createElement('div');
    t.innerHTML = carrusel(sec.dataset.car, sec.dataset.lentes.split('|'), sec.dataset.tit || undefined);
    sec.parentNode.replaceChild(t.firstElementChild, sec);
  });
  if (proc != null) conProceso(proc, f); else f();
  montarCarrusel(raiz);
}
function montarCarrusel(raiz) {
  raiz.querySelectorAll('[data-car]').forEach(p => {
    p.querySelectorAll('[data-lente]').forEach(b => { b.onclick = () => { carEst[p.dataset.car].lente = b.dataset.lente; rehacerCarruseles(raiz, p.dataset.car); }; });
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
GRAF.config({tip: tipAttr});
// Cifra grande que cuenta desde 0 al entrar en pantalla (mismo texto final que fmtGrande)
const grandeAn = (k, r) => r == null ? '—' : `${GRAF.cuenta(r.v, 1)}<small>${k === 'nps' ? 'pts' : '%'}</small>`;
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
    <div class="seg seg-cli${st.segmento.size ? '' : ' sin-elegir'}" role="group" aria-label="Segmento" id="f-seg" ${tipAttr('Masivo = Factura y Pago Fijo y Móvil (y cobranza). Corporativo = Factura y Pago Fijo PYME y Móvil PYME. Con «Todos» las cifras mezclan los dos segmentos.')}><span class="et-seg" aria-hidden="true">Segmento</span><button type="button" data-v="" aria-pressed="${!st.segmento.size}">Todos</button>${V.segmento.map((e, i) => `<button type="button" data-v="${i}" aria-pressed="${st.segmento.size === 1 && st.segmento.has(i)}">${e}</button>`).join('')}</div>
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
  ctrl.querySelectorAll('#f-seg button').forEach(b => { b.onclick = () => { st.segmento = b.dataset.v === '' ? new Set() : new Set([+b.dataset.v]); refrescar(); }; });
  ctrl.querySelectorAll('#f-pro button').forEach(b => { b.onclick = () => { st.proceso = b.dataset.v === '' ? null : +b.dataset.v; refrescar(); }; });
  ctrl.querySelectorAll('#f-neg button').forEach(b => { b.onclick = () => { st.negocio = b.dataset.v === '' ? null : +b.dataset.v; refrescar(); }; });
}
function pintarFiltros() {
  // El segmento va en la barra de arriba, junto al mes (control propio, resaltado); aquí solo los demás filtros
  barF.innerHTML = MULTI.filter(([k]) => k !== 'segmento').map(([k, et]) => {
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
// Spark de área animado: una serie por negocio con su color, marcas en los meses elegidos
function spark(k) {
  const lines = negs().map(e => ({color: CE[NEG[e]], pts: serie(k, 'mes', e).map(p => ({i: p.x, v: p.r.v}))})).filter(s => s.pts.length > 1);
  // Las áreas del spark se animan con svgFx (ver abajo): con Motion, «aparece» en SVG se queda invisible
  return lines.length ? GRAF.spark(lines, PERIODOS.length, st.meses).replace(/data-an="aparece"/g, 'data-fx="aparece"') : '';
}
// Animación propia para elementos SVG (aparece / pop) con la Web Animations API nativa.
// Motion escribe opacity y transform como ATRIBUTOS en SVG, y el estilo en línea de arranque de GRAF los tapa.
function svgFx(raiz, o) {
  o = o || {};
  if (!raiz || !GRAF.activo()) return;
  const grupos = new Map();
  raiz.querySelectorAll('[data-fx]').forEach(el => {
    const c = el.closest('.kpi, .panel') || raiz;
    el.style.opacity = '0';
    if (!grupos.has(c)) grupos.set(c, []);
    grupos.get(c).push(el);
  });
  const ir = lista => lista.forEach(el => {
    const t = el.getAttribute('data-fx'), del = ((o.base || 0) + +(el.getAttribute('data-i') || 0) * .05) * 1000;
    el.style.opacity = '';
    const fin = +getComputedStyle(el).opacity;   // termina en la opacidad que le da el CSS
    if (t === 'pop') el.animate([{opacity: 0, transform: 'scale(.2)'}, {opacity: 1, transform: 'scale(1.35)', offset: .65}, {opacity: 1, transform: 'scale(1)'}], {duration: 650, delay: del + 250, easing: 'ease-out', fill: 'backwards'});
    else el.animate([{opacity: 0}, {opacity: fin}], {duration: 750, delay: del + 200, easing: 'ease-out', fill: 'backwards'});
  });
  grupos.forEach((lista, c) => { if (o.inmediato || !window.Motion || !Motion.inView) ir(lista); else Motion.inView(c, () => { ir(lista); }, {amount: .12}); });
}
addEventListener('beforeprint', () => { document.querySelectorAll('[data-fx]').forEach(el => { el.getAnimations().forEach(x => x.finish()); el.style.opacity = ''; }); });
// La opacidad del riel va en el CSS (distinta en claro y oscuro)
const RAMPA = GRAF.rampaCss().replace(/;opacity:[^;]*/, '');
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
    // Curvas con movimiento de graficos.js (GRAF.lineas): trazo con cometa, puntos que aparecen al paso y cifra final en píldora
    GRAF.lineas(el, {id: el.id, xs, etq, marcas: modo === 'mes' ? st.meses : [], min: IND[k].min, max: IND[k].max, nmin: NMIN,
      fmt: v => fmt(k, {v}), series: S.map(sr => ({nombre: sr.e, color: CE[sr.e], pts: sr.pts.map(p => ({x: p.x, v: p.r.v, n: p.r.n}))})),
      tip: x => `<div class="t">${esc(etq(x))}</div>` + S.map(({e, pts}) => { const p = pts.find(p => p.x === x); return p ? `<i style="background:${CE[e]}"></i>${e}: <b>${fmt(k, p.r)}</b> · n ${f0(p.r.n)}${p.r.n < NMIN ? ' (muestra baja)' : ''}` : ''; }).filter(Boolean).join('<br>')});
    if (tabla) {
      // Filas para copiar: cifras con coma decimal y n sin separador de miles, así Excel en español las toma como números
      const cab = [modo === 'mes' ? 'Mes' : 'Semana'].concat([].concat.apply([], S.map(s => [`${s.e} ${IND[k].corto}${k === 'nps' ? '' : ' (%)'}`, `${s.e} n`])));
      const filasT = xs.map(x => [etq(x)].concat([].concat.apply([], S.map(s => { const p = s.pts.find(p => p.x === x); return p ? [f1(p.r.v), String(p.r.n)] : ['', '']; }))));
      tabla.innerHTML = `<div class="tw-barra"><span class="nota">Clic en las filas para elegir cuáles copiar</span><button type="button" class="copiar">${svgI('copiar')}<span>Copiar todo</span></button></div>
        <table class="rk copiable"><thead><tr><th>${modo === 'mes' ? 'Mes' : 'Semana'}</th>${S.map(s => `<th class="num">${s.e}</th><th class="num">n</th>`).join('')}</tr></thead><tbody>${xs.map((x, i) => `<tr class="clic" data-f="${i}" aria-selected="false"><td>${esc(etq(x))}</td>${S.map(s => { const p = s.pts.find(p => p.x === x); return `<td class="num">${p ? fmt(k, p.r) : '—'}</td><td class="num">${p ? f0(p.r.n) : '—'}</td>`; }).join('')}</tr>`).join('')}</tbody></table>`;
      montarCopia(tabla, cab, filasT, `${IND[k].nombre} · ${alcance()}`);
    }
  });
}
// Copiar al portapapeles las filas elegidas (o todas) como texto separado por tabulaciones, listo para pegar en Excel
function alPortapapeles(txt) {
  if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(txt).then(() => true, () => copiaVieja(txt));
  return Promise.resolve(copiaVieja(txt));
}
function copiaVieja(txt) {
  const t = document.createElement('textarea'); t.value = txt; t.setAttribute('readonly', ''); t.style.cssText = 'position:fixed;top:-1000px;opacity:0';
  document.body.appendChild(t); t.select(); let ok = false; try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
  t.remove(); return ok;
}
function montarCopia(caja, cab, filasT, titulo) {
  const btn = caja.querySelector('.copiar'), et = btn.querySelector('span');
  const elegidas = () => [...caja.querySelectorAll('tr[aria-selected="true"]')].map(tr => +tr.dataset.f);
  const rotulo = () => { const n = elegidas().length; et.textContent = n ? `Copiar ${n} ${n === 1 ? 'fila' : 'filas'}` : 'Copiar todo'; };
  caja.querySelectorAll('tr[data-f]').forEach(tr => tr.onclick = () => {
    if (String(getSelection()).trim()) return;   // arrastrar para seleccionar texto no cambia la elección
    tr.setAttribute('aria-selected', tr.getAttribute('aria-selected') !== 'true'); rotulo();
  });
  btn.onclick = () => {
    const ix = elegidas(), fs = ix.length ? ix.map(i => filasT[i]) : filasT;
    alPortapapeles([titulo, cab.join('\t')].concat(fs.map(f => f.join('\t'))).join('\n')).then(ok => {
      et.textContent = ok ? `¡Copiado${ix.length ? ` (${ix.length})` : ''}!` : 'No se pudo copiar'; btn.classList.toggle('ok', ok);
      setTimeout(() => { btn.classList.remove('ok'); rotulo(); }, 1600);
    });
  };
}
// Distribuciones: cada escala con su gráfico, coloreada de la peor respuesta (rojo intenso) a la mejor (verde sobrio)
const finInd = (k, a) => `${fmt(k, IND[k].calc(a))}<small>${IND[k].corto}</small>`;
// 1–5: barras divergentes centradas en el 3 que crecen desde el centro
function divergente(grupos, k) {
  return GRAF.divergente(grupos.map(g => ({nombre: g.nombre, cuentas: [1, 2, 3, 4, 5].map(i => g.a[k + '_' + i]), fin: finInd(k, g.a)})), ['1 · la peor', '2', '3', '4', '5 · la mejor']);
}
// Recomendación: waffle de 100 cuadritos (detractores, pasivos, promotores)
const waffleNps = grupos => GRAF.waffle(grupos.map(g => ({nombre: g.nombre, cuentas: [g.a.det, g.a.nps_val - g.a.det - g.a.prom, g.a.prom], fin: finInd('nps', g.a)})), ['Detractores 0–6', 'Pasivos 7–8', 'Promotores 9–10']);
// Valores acordes: donas no / sí
// El centro ya es el indicador (con un decimal): no se repite debajo
const donasVa = grupos => GRAF.donas(grupos.map(g => ({nombre: g.nombre, cuentas: [g.a.va_no, g.a.va_si]})), ['No cuadran', 'Sí cuadran'], {centro: 'cuadran', dec: 1});
// Seguridad y rapidez (1–3): torres apiladas en vertical
const torres3 = (grupos, k) => GRAF.torres(grupos.map(g => ({nombre: g.nombre, cuentas: [g.a[k + '_1'], g.a[k + '_2'], g.a[k + '_3']], fin: fmt(k, IND[k].calc(g.a))})), ['1 · la peor', '2', '3 · la mejor'], {tonos: [GRAF.tono(0), GRAF.tono(.75), GRAF.tono(1)]});   // el 2 cuenta como respuesta buena
const distribucion = (k, grupos) => IND[k].tipo === 'esc5' ? divergente(grupos, k) : k === 'nps' ? waffleNps(grupos) : k === 'va' ? donasVa(grupos) : torres3(grupos, k);
// Motivos: paletas (lollipop) de la más frecuente a la menos; los códigos sin catálogo y «Otro» al final, en gris
const ordenMot = items => items.slice().sort((a, b) => (a.cod - b.cod) || ((a.nombre === 'Otro') - (b.nombre === 'Otro')) || (b.c - a.c));
// Canales: barras radiales (hasta 7 arcos); si hay más, los restantes van en una línea aparte con sus cifras
function canalesRadial(items, base) {
  if (!items.length || !base) return '<p class="vacio">Sin datos</p>';
  const resto = items.slice(7);
  return GRAF.radial(items.slice(0, 7), base) + (resto.length ? `<p class="nota radial-resto">Además: ${resto.map(x => `<span ${tipAttr(`<div class="t">${esc(x.nombre)}</div>${f0(x.c)} de ${f0(base)} (${f1(x.c / base * 100)} %)`)}>${esc(x.nombre)} ${f1(x.c / base * 100)} % (${f0(x.c)})</span>`).join(' · ')}</p>` : '');
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
  const movil = bM ? GRAF.paletas(ordenMot(itM), bM) : `<p class="vacio">${st.negocio === H ? 'Con el filtro Hogar solo hay motivos en código: ábrelos abajo.' : 'Sin motivos con estos filtros'}</p>`;
  const hogar = bH ? `<details class="cods"${st.negocio === H ? ' open' : ''}><summary>Hogar: ${f0(bH)} encuestas con el motivo en código</summary>${GRAF.paletas(ordenMot(itH), bH, {color: () => 'var(--ink-3)'})}<p class="nota motivo-nota">Hogar entrega el motivo como número (1, 2… 94) y falta el catálogo para traducirlo.</p></details>` : '';
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
    ${vis.map((x, fi) => { const d = tot ? x.r.v - tot.v : 0, poca = x.r.n < NMIN, neg = ind.min < 0 && x.r.v < 0;
      // Color según la diferencia contra el total (rojo = peor, verde = mejor); gris si la muestra es baja
      const b = (ind.min < 0 ? `left:${Math.min(X(0), X(x.r.v))}%;width:${Math.abs(X(x.r.v) - X(0))}%` : `left:0;width:${X(x.r.v)}%`) + (poca || !tot ? '' : `;background:${GRAF.tonoDif(d, ind.min < 0 ? 40 : 20)}`);
      return `<tr class="${x.r.n < NMIN ? 'poca' : ''}${fil ? ' clic' : ''}${sel(x) ? ' sel' : ''}" ${fil ? `tabindex="0" data-v="${x.v}"` : ''}><td class="nom">${esc(x.nombre)}${bajo(x.r)}</td><td class="num">${f0(x.r.n)}</td><td class="num"><b>${fmt(k, x.r)}</b></td><td class="bar"><div class="mini" ${tipAttr(tipInd(k, x.r))}><b style="${b}" data-an="barra" data-o="${neg ? 'r' : 'l'}" data-i="${fi}"></b>${tot ? `<span class="ref" style="left:${X(tot.v)}%"></span>` : ''}</div></td><td class="num"><span class="dif ${x.r.n < NMIN || Math.abs(d) < .05 ? '' : d > 0 ? 'mejora' : 'empeora'}">${fpp(d)}</span></td></tr>`; }).join('') || '<tr><td colspan="5" class="vacio">Sin datos</td></tr>'}
    </tbody></table></div>${g.length > tope ? `<button type="button" class="mas">${e.todos ? 'Ver menos' : `Ver los ${g.length}`}</button>` : ''}
    <p class="nota" style="margin:6px 0 0">${fil ? 'Clic en una fila para filtrar todo el tablero. ' : ''}Gris = menos de ${NMIN} encuestas (no se ordena por valor).</p></section>`;
}
function montarRanking(raiz) {
  raiz.querySelectorAll('[data-rk]').forEach(p => {
    const e = rkEst[p.dataset.rk];
    const solo = `[data-rk="${p.dataset.rk}"]`;   // al reordenar se anima solo este ranking
    p.querySelectorAll('[data-dim]').forEach(b => { b.onclick = () => { e.dim = b.dataset.dim; e.todos = false; pintarTab(solo); }; });
    p.querySelectorAll('[data-ord]').forEach(b => { b.onclick = () => { e.orden = b.dataset.ord; pintarTab(solo); }; });
    const mas = p.querySelector('.mas'); if (mas) mas.addEventListener('click', () => { e.todos = !e.todos; pintarTab(solo); });
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

// ------------------------------------------------------------------ indicadores mes a mes (firma del Resumen)
// NPS, CES y CSAT en filas, separados por estudio (factura y pago, cobranza), y hasta 3 meses en columnas. El grupo muestra
// el % combinado de sus indicadores (aciertos sumados sobre respuestas sumadas). Respeta todos los filtros, también el de proceso.
const SECC = [
  {t: 'Factura y pago', s: 'Encuesta de factura y pago · Hogar y Móvil', proc: FP, cls: 'reg',
    grupos: [{ks: ['nps']}, {t: 'CES · esfuerzo', ks: ['ces1', 'ces2']}, {t: 'CSAT · satisfacción', ks: ['fsat', 'psat']}]},
  {t: 'Cobranza', s: 'Encuesta de la gestión de cobro · no pregunta NPS ni CES', proc: COB, cls: 'cob',
    grupos: [{t: 'CSAT · satisfacción', ks: ['cinf', 'ctra']}]},
];
const TIPO = {nps: 'NPS', ces1: 'CES', ces2: 'CES', fsat: 'CSAT', psat: 'CSAT', cinf: 'CSAT', ctra: 'CSAT', clar: '1 a 5', va: 'Sí / No', seg: '1 a 3', rap: '1 a 3'};
const tabEst = {cerrados: new Set()};
// Meses de la tabla: los elegidos (los 3 más recientes) o, con un solo mes, ese y los dos anteriores. Se saltan los meses
// sin encuestas con los filtros actuales (p. ej. cobranza en un mes que aún no llega).
function mesesTabla() {
  const hay = m => sumar(filas({periodo: m})).n > 0;
  const cand = st.meses.length > 1 ? st.meses : PERIODOS.map((_, i) => i).filter(i => i <= st.periodo);
  const ok = cand.filter(hay).slice(-3);
  return ok.length ? ok : [st.periodo];
}
// Mes en curso: el último del cubo cuando el corte es de ese mismo mes
function mesParcial() {
  const g = D.generado, ult = PERIODOS.length - 1;
  if (g.slice(0, 4) + g.slice(5, 7) !== PERIODOS[ult]) return null;
  const dia = +g.slice(8, 10), dias = new Date(+PERIODOS[ult].slice(0, 4), +PERIODOS[ult].slice(4), 0).getDate();
  return dia < dias ? {i: ult, dia, dias, factor: dias / dia} : null;
}
// Combina varios indicadores de proporción: aciertos sumados / respuestas sumadas
function combinar(rs) {
  const ok = rs.filter(Boolean);
  return ok.length ? prop(ok.reduce((s, r) => s + r.v * r.n / 100, 0), ok.reduce((s, r) => s + r.n, 0)) : null;
}
const margenDe = (a, b) => Math.hypot(a.ic, b.ic);
function cambioT(k, r, rA, etA) {
  if (!r || !rA) return '<span class="cb na">—</span>';
  const d = r.v - rA.v, m = margenDe(r, rA), sig = Math.abs(d) > m && r.n >= NMIN && rA.n >= NMIN;
  const c = Math.abs(d) < .05 ? 'igual' : d > 0 ? 'mejora' : 'empeora';
  const t = `<div class="t">${c === 'igual' ? 'Igual' : d > 0 ? 'Sube' : 'Baja'} ${f1(Math.abs(d))} ${unidad(k)} frente a ${etA}</div>${fmt(k, rA)} (n ${f0(rA.n)}) → ${fmt(k, r)} (n ${f0(r.n)})<br>Margen de error al 95 %: ±${f1(m)} ${unidad(k)}.<br>${sig ? '<b>Fuera del margen</b>: el cambio es real.' : 'Dentro del margen: puede ser ruido de la muestra.'}`;
  return `<span class="cb ${c}${sig ? ' sig' : ''}" ${tipAttr(t)}>${c === 'igual' ? '■ 0,0' : (d > 0 ? '▲ ' : '▼ ') + fpp(d)}<small>${unidad(k)}</small><span class="sr"> ${sig ? 'cambio real' : 'puede ser ruido'}</span></span>`;
}
// Mini serie de los meses de la tabla, en su propia escala, del color del último cambio
function tendencia(vals, i) {
  const pts = vals.map((r, j) => r ? {j, v: r.v} : null).filter(Boolean);
  if (pts.length < 2) return '';
  const W = 76, H = 26, px = 6, n = vals.length;
  const lo = Math.min.apply(null, pts.map(p => p.v)), hi = Math.max.apply(null, pts.map(p => p.v)), amp = Math.max(hi - lo, 4);
  const X = j => px + (n > 1 ? j / (n - 1) : .5) * (W - 2 * px), Y = v => H - 5 - (v - (lo + hi) / 2 + amp / 2) / amp * (H - 10);
  const u = pts[pts.length - 1], p = pts[pts.length - 2], d = u.v - p.v;
  const col = Math.abs(d) < .05 ? 'var(--ink-3)' : d > 0 ? 'var(--t7)' : 'var(--t1)';
  const path = pts.map((q, k) => `${k ? 'L' : 'M'}${X(q.j).toFixed(1)} ${Y(q.v).toFixed(1)}`).join('');
  return `<svg class="tend" viewBox="0 0 ${W} ${H}" aria-hidden="true"><path d="${path}" pathLength="1" style="stroke:${col}" vector-effect="non-scaling-stroke" data-an="traza" data-i="${i}"/>
    ${pts.map((q, k) => `<circle cx="${X(q.j).toFixed(1)}" cy="${Y(q.v).toFixed(1)}" r="${k === pts.length - 1 ? 3.6 : 2.2}" style="fill:${k === pts.length - 1 ? col : 'var(--panel)'};stroke:${col}"/>`).join('')}</svg>`;
}
function vTabla() {
  const ms = mesesTabla(), u = ms.length - 1, par = mesParcial();
  const secs = SECC.filter(S => st.proceso == null || S.proc === st.proceso);
  // Conteos por proceso y mes; por negocio solo para el tooltip
  const agg = {}, aggN = {};
  for (const S of secs) if (!agg[S.proc]) {
    agg[S.proc] = ms.map(m => sumar(filas({proceso: S.proc, periodo: m})));
    aggN[S.proc] = ms.map(m => negs().map(e => ({e, a: sumar(filas({proceso: S.proc, periodo: m, negocio: e}))})));
  }
  const etA = u ? mesC(PERIODOS[ms[u - 1]]) : '';
  const cuenta = {mejora: 0, empeora: 0, igual: 0};
  let fi = 0;
  const celda = (k, r, j, extra, nom) => {
    const act = j === u, ind = IND[k];
    if (!r) return `<td class="mc${act ? ' act' : ''}"><span class="mv na">—</span></td>`;
    const w = Math.max(2, (r.v - ind.min) / (ind.max - ind.min) * 100), poca = r.n < NMIN;
    const t = `<div class="t">${mesC(PERIODOS[ms[j]])}</div>` + tipInd(k, r, extra).replace(IND[k].nombre + ':', (nom || IND[k].nombre) + ':');
    return `<td class="mc${act ? ' act' : ''}"><div class="mv${poca ? ' poca' : ''}" ${tipAttr(t)}>${act ? GRAF.cuenta(r.v, 1) : f1(r.v)}<small>${k === 'nps' ? 'pts' : '%'}</small></div>
      <span class="mb"><i style="width:${w.toFixed(1)}%;background:${GRAF.tonoV(r.v, ind.min, ind.max)}" data-an="ancho" data-i="${fi + j}"></i></span></td>`;
  };
  const filaInd = (S, k, hijo, gid) => {
    const vals = agg[S.proc].map(a => IND[k].calc(a)), r = vals[u], rA = u ? vals[u - 1] : null;
    if (vals.every(x => !x)) return '';
    if (r && rA && r.n >= NMIN && rA.n >= NMIN && Math.abs(r.v - rA.v) > margenDe(r, rA)) cuenta[r.v > rA.v ? 'mejora' : 'empeora']++; else if (r && rA) cuenta.igual++;
    const neg = j => st.negocio != null ? '' : '<br>' + aggN[S.proc][j].map(x => `${NEG[x.e]}: ${fmt(k, IND[k].calc(x.a))}`).join(' · ');
    fi++;
    return `<tr class="fi${hijo ? ' hijo' : ''}" ${gid ? `data-g="${gid}"` : ''} data-cajon="${k}" tabindex="0" aria-label="${esc(IND[k].nombre)}: ver detalle y comentarios"${gid && tabEst.cerrados.has(gid) ? ' hidden' : ''}>
      <th scope="row" class="nm"><span class="nm-t">${esc(IND[k].nombre)}</span><span class="tp">${TIPO[k]}</span></th>
      ${vals.map((x, j) => celda(k, x, j, neg(j))).join('')}
      <td class="cm">${u ? cambioT(k, r, rA, etA) : ''}</td>
      <td class="td-t">${tendencia(vals, fi)}</td>
      <td class="rn">${r ? corrTxt(k, agg[S.proc][u]).replace(/^ · /, '') : ''}</td>
      <td class="bs">${r ? f0(r.n) : '—'}</td></tr>`;
  };
  const filaGrupo = (S, G, gid) => {
    const vals = agg[S.proc].map(a => combinar(G.ks.map(k => IND[k].calc(a)))), r = vals[u], rA = u ? vals[u - 1] : null, k = G.ks[0];
    if (vals.every(x => !x)) return '';
    const abierto = !tabEst.cerrados.has(gid);
    const def = `<div class="t">${G.t}</div>% combinado de ${G.ks.map(x => IND[x].corto).join(' y ')}: respuestas buenas sumadas sobre respuestas válidas sumadas.`;
    fi++;
    return `<tr class="gr">
      <th scope="row" class="nm"><button type="button" class="tg" data-gid="${gid}" aria-expanded="${abierto}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg><span class="nm-t">${G.t}</span></button><span class="tp" ${tipAttr(def)}>${G.ks.length} indicadores</span></th>
      ${vals.map((x, j) => celda(k, x, j, '<br>' + def.replace(/<div[^>]*>.*?<\/div>/, ''), G.t)).join('')}
      <td class="cm">${u ? cambioT(k, r, rA, etA) : ''}</td>
      <td class="td-t">${tendencia(vals, fi)}</td><td class="rn"></td>
      <td class="bs">${r ? f0(r.n) : '—'}</td></tr>`;
  };
  const cuerpo = secs.map(S => {
    const filasS = S.grupos.map((G, gi) => {
      if (G.ks.length === 1) return filaInd(S, G.ks[0], false);
      const gid = S.cls + gi, cab = filaGrupo(S, G, gid);
      return cab ? cab + G.ks.map(k => filaInd(S, k, true, gid)).join('') : '';
    }).join('');
    return filasS ? `<tbody class="sec ${S.cls}"><tr class="banda"><th scope="rowgroup" colspan="${ms.length + 5}"><span class="bd-t">${S.t}</span><span class="bd-s">${S.s}</span></th></tr>${filasS}</tbody>` : '';
  }).join('');
  const cabMes = ms.map((m, j) => `<th scope="col" class="mc${j === u ? ' act' : ''}"><span class="mes">${mesC(PERIODOS[m])}</span>${par && par.i === m ? `<span class="encurso" ${tipAttr(`Mes en curso: encuestas hasta el ${par.dia}/${PERIODOS[m].slice(4)}. Las cifras pueden moverse.`)}>al ${par.dia}</span>` : ''}</th>`).join('');
  const resumen = u ? `<div class="tb-cont" aria-label="Cambios frente a ${etA}">${cuenta.mejora ? `<span class="tc mejora">▲ ${cuenta.mejora} ${cuenta.mejora === 1 ? 'sube' : 'suben'}</span>` : ''}${cuenta.empeora ? `<span class="tc empeora">▼ ${cuenta.empeora} ${cuenta.empeora === 1 ? 'baja' : 'bajan'}</span>` : ''}${cuenta.igual ? `<span class="tc igual">${cuenta.igual} sin cambio real</span>` : ''}</div>` : '';
  return `<section class="panel tab-ind" id="tab-ind"><header><h2 ${tipAttr('NPS, CES y CSAT de cada estudio, mes a mes (hasta 3 meses: los elegidos o, con un solo mes, ese y los dos anteriores). Respeta todos los filtros. Clic en un indicador para ver su detalle y comentarios.')}>Indicadores mes a mes <span class="info">?</span></h2>${resumen}
      <p class="sub">${alcance()} · ${ms.map(m => mesC(PERIODOS[m])).join(', ')}${u ? ` · el cambio compara ${mesC(PERIODOS[ms[u]])} con ${etA}` : ''}.</p></header>
    ${cuerpo ? `<div class="tw"><table class="ind"><thead><tr><th scope="col" class="nm">Indicador</th>${cabMes}<th scope="col" class="cm">Cambio</th><th scope="col" class="td-t">Tendencia</th><th scope="col" class="rn" ${tipAttr('Correlación del indicador con la recomendación (NPS) en el último mes. Verde ≥ 0,50 fuerte · amarillo 0,30 a 0,49 moderada · rojo < 0,30 baja.')}>r NPS</th><th scope="col" class="bs">Base</th></tr></thead>${cuerpo}</table></div>
    <p class="nota tb-ley"><span class="mb ley"><i style="${RAMPA};width:100%"></i></span> La barra ubica el valor en su escala: rojo lo peor, verde lo mejor · <span class="cb mejora sig">▲</span><span class="cb empeora sig">▼</span> relleno = cambio fuera del margen de error al 95 % · <span class="cb mejora">▲</span> con borde = puede ser ruido · cifra tenue = menos de ${NMIN} encuestas</p>`
      : '<p class="vacio">Sin encuestas con estos filtros</p>'}</section>`;
}
function montarTabla(raiz) {
  raiz.querySelectorAll('#tab-ind .tg').forEach(b => b.onclick = () => {
    const g = b.dataset.gid, abrir = tabEst.cerrados.has(g);
    if (abrir) tabEst.cerrados.delete(g); else tabEst.cerrados.add(g);
    b.setAttribute('aria-expanded', abrir);
    raiz.querySelectorAll(`#tab-ind tr[data-g="${g}"]`).forEach(tr => { tr.hidden = !abrir; });
  });
  raiz.querySelectorAll('#tab-ind tr[data-cajon]').forEach(tr => tr.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrirCajon(tr.dataset.cajon); } });
}

// ------------------------------------------------------------------ alarmas (Resumen) · mismas reglas que Soporte y Fallas masivas
// Por proceso (el del filtro o los dos) e indicador, con los meses y filtros actuales. Una diferencia cuenta solo si sale
// del margen de error al 95 % de las dos cifras juntas: √(ic₁² + ic₂²). Reglas:
//  · alta  · el indicador cae frente al periodo anterior; un segmento (n ≥ 30 en ambos) cae frente al periodo anterior
//  · media · tres meses seguidos bajando o el valor más bajo de la serie (con un solo mes elegido); un segmento queda por
//            debajo del total del proceso; un dolor sube
//  · bien  · el indicador mejora frente al periodo anterior
// Segmentos y dolores: se muestran los 3 de más peso por proceso (n × diferencia, en proporción a la escala del indicador).
const DIM_AL = [['negocio', 'Negocio'], ['segmento', 'Segmento'], ['region', 'Región'], ['casa', 'Casa de cobro'], ['canal', 'Canal']];
const NIVEL_AL = {alta: 0, media: 1, bien: 2};
const ESC = k => IND[k].max - IND[k].min;
const procsAl = () => st.proceso == null ? [FP, COB] : [st.proceso];
const ksDe = e => KS.filter(k => IND[k].proc === e);
const SIN_SEG = ['Sin dato', 'No aplica'];
const filtrado = (dim, v) => dim === 'negocio' ? st.negocio === v : st[dim].has(v);
// Volumen de encuestas: promedio mensual de los meses elegidos frente al promedio histórico de los demás meses (con los mismos
// filtros). Si el mes elegido es el último y está en curso, se proyecta al mes completo (n × días del mes / días corridos).
// Alarma si la diferencia pasa de ±25 %; crítica si hay 50 % o más de encuestas de menos (la lectura pierde respaldo).
const UMBRAL_VOL = .25;
function volumen(e) {
  const porP = new Map(porDim(filas({proceso: e, periodo: null}), 'periodo').map(g => [g.v, g.a.n]));
  const ult = PERIODOS.length - 1, par = mesParcial();
  const hist = [...porP.keys()].filter(i => !st.meses.includes(i) && !(i === ult && par));
  if (hist.length < 3) return null;
  const prom = hist.reduce((t, i) => t + porP.get(i), 0) / hist.length;
  if (prom < NMIN) return null;
  const proy = i => (porP.get(i) || 0) * (i === ult && par ? par.factor : 1);
  const real = st.meses.reduce((t, i) => t + (porP.get(i) || 0), 0) / st.meses.length, act = st.meses.reduce((t, i) => t + proy(i), 0) / st.meses.length;
  const rel = act / prom - 1;
  if (Math.abs(rel) < UMBRAL_VOL) return null;
  const proyectado = st.meses.includes(ult) && par, mas = rel > 0;
  return {nivel: !mas && rel <= -.5 ? 'alta' : 'media', e, peso: Math.min(Math.abs(rel), 1) / 2,
    tit: `Encuestas: ${f0(act)}${st.meses.length > 1 ? ' al mes' : ''}, ${f0(Math.abs(rel) * 100)} % ${mas ? 'más' : 'menos'} que el promedio histórico`,
    det: `Promedio de ${hist.length} meses: ${f0(prom)} al mes · ${etqCorta(st.meses)}: ${f0(real)}${proyectado ? ` hasta el ${par.dia}, proyectado al mes completo ${f0(act)}` : ''}${mas ? ' · más encuestas de lo normal: revisa si cambió la muestra o hubo un evento' : ' · con menos encuestas las cifras tienen más margen de error'}`};
}
function serieProc(k, e) {
  return porDim(filas({proceso: e, periodo: null}), 'periodo').map(g => ({x: g.v, et: mesC(PERIODOS[g.v]), r: IND[k].calc(g.a)})).filter(p => p.r).sort((a, b) => a.x - b.x);
}
function alarmas() {
  const out = [], ant = mesesAnteriores(), etA = ant ? etqCorta(ant) : '', etM = etqCorta(st.meses);
  for (const e of procsAl()) {
    const idx = filas({proceso: e}), a = sumar(idx), idxA = ant ? filas({proceso: e, periodo: ant}) : [], aA = ant ? sumar(idxA) : null;
    const seg = [], dol = [];
    const vol = volumen(e); if (vol) out.push(vol);
    for (const k of ksDe(e)) {
      const r = IND[k].calc(a), rA = aA ? IND[k].calc(aA) : null;
      if (!r || r.n < NMIN) continue;
      // Total del proceso frente al periodo anterior
      if (rA && rA.n >= NMIN) {
        const d = r.v - rA.v, m = margenDe(r, rA);
        if (Math.abs(d) > m) out.push({nivel: d < 0 ? 'alta' : 'bien', e, peso: Math.abs(d) / ESC(k),
          tit: `${IND[k].corto} ${d < 0 ? 'cae' : 'sube'} ${f1(Math.abs(d))} ${unidad(k)}`,
          det: `${etA} ${fmt(k, rA)} → ${etM} ${fmt(k, r)} · margen ±${f1(m)} · n ${f0(rA.n)} → ${f0(r.n)}`});
      }
      // Racha y mínimo de la serie mensual (solo con un mes elegido)
      if (st.meses.length === 1) {
        const pts = serieProc(k, e).filter(x => x.x <= st.periodo && x.r.n >= NMIN), u = pts.length - 1;
        if (u >= 0 && pts[u].x === st.periodo) {
          const ult4 = pts.slice(-4), racha = ult4.length === 4 && ult4.every((x, i) => !i || (x.x === ult4[i - 1].x + 1 && x.r.v < ult4[i - 1].r.v));
          const minimo = pts.length >= 6 && pts.slice(0, u).every(x => x.r.v > pts[u].r.v);
          if (racha || minimo) out.push({nivel: 'media', e, peso: 1,
            tit: `${IND[k].corto}: ${[minimo ? `el más bajo desde ${pts[0].et}` : '', racha ? 'tres meses seguidos bajando' : ''].filter(Boolean).join(' y ')}`,
            det: (racha ? ult4 : pts.slice(-4)).map(x => `${x.et} ${fmt(k, x.r)}`).join(' → ')});
        }
      }
      // Segmentos: caen frente al periodo anterior o quedan por debajo del total
      for (const [dim, nomDim] of DIM_AL) {
        if (dim === 'negocio' ? st.negocio != null : st[dim].size === 1) continue;   // ya filtrado a un solo valor: es el total
        const antD = ant ? new Map(porDim(idxA, dim).map(g => [g.v, IND[k].calc(g.a)])) : new Map();
        for (const g of porDim(idx, dim)) {
          const rs = IND[k].calc(g.a);
          if (!rs || rs.n < NMIN || SIN_SEG.includes(g.nombre)) continue;
          const ra = antD.get(g.v), filtro = {dim, v: g.v};
          if (ra && ra.n >= NMIN && rs.v - ra.v < -margenDe(rs, ra))
            seg.push({nivel: 'alta', e, filtro, clave: dim + g.v, peso: rs.n * (ra.v - rs.v) / ESC(k) / a.n,
              tit: `${nomDim} ${esc(g.nombre)}: ${IND[k].corto} cae ${f1(ra.v - rs.v)} ${unidad(k)}`,
              det: `${etA} ${fmt(k, ra)} → ${etM} ${fmt(k, rs)} · n ${f0(ra.n)} → ${f0(rs.n)}`});
          else if (rs.v + rs.ic < r.v)
            seg.push({nivel: 'media', e, filtro, clave: dim + g.v, peso: rs.n * (r.v - rs.v) / ESC(k) / a.n / 2,
              tit: `${nomDim} ${esc(g.nombre)}: ${IND[k].corto} ${f1(r.v - rs.v)} ${unidad(k)} bajo el total`,
              det: `${fmt(k, rs)} frente a ${fmt(k, r)} del proceso · n ${f0(rs.n)} (${f0(rs.n / r.n * 100)} %)`});
        }
      }
    }
    // Dolores que suben (proporción de encuestas que lo menciona)
    if (ant && a.n >= NMIN && aA.n >= NMIN) {
      const g = dolEst.proc; dolEst.proc = e;
      try {
        const dAct = calcDolores(idx).dol, dAnt = new Map(calcDolores(idxA).dol.map(x => [x.k, x]));
        for (const x of dAct) {
          const y = dAnt.get(x.k); if (!y) continue;
          const p1 = x.pct / 100, p0 = y.pct / 100, m = 196 * Math.hypot(Math.sqrt(p1 * (1 - p1) / a.n), Math.sqrt(p0 * (1 - p0) / aA.n));
          if (x.pct - y.pct > m) dol.push({nivel: 'media', e, peso: (x.pct - y.pct) / 100,
            tit: `Dolor en alza: «${esc(DOLOR[x.k][0])}»`,
            det: `Lo vive el ${f1(y.pct)} % → ${f1(x.pct)} % de las encuestas (+${f1(x.pct - y.pct)} pp) · ${e === FP ? 'NPS' : 'CSAT información'} de quien lo vive ${x.con == null ? '—' : f1(x.con)}`});
        }
      } finally { dolEst.proc = g; }
    }
    // De cada segmento queda la alarma de más peso; 3 caídas y 3 brechas por proceso
    const unico = new Map();
    for (const x of seg.sort((p, q) => NIVEL_AL[p.nivel] - NIVEL_AL[q.nivel] || q.peso - p.peso)) if (!unico.has(x.clave)) unico.set(x.clave, x);
    const segs = [...unico.values()];
    out.push(...segs.filter(x => x.nivel === 'alta').slice(0, 3), ...segs.filter(x => x.nivel === 'media').slice(0, 3),
      ...dol.sort((p, q) => q.peso - p.peso).slice(0, 3));
  }
  return out.sort((p, q) => NIVEL_AL[p.nivel] - NIVEL_AL[q.nivel] || q.peso - p.peso);
}
function vAlarmas() {
  const al = alarmas(), ant = mesesAnteriores(), par = mesParcial();
  const cnt = Object.keys(NIVEL_AL).map(n => [n, al.filter(x => x.nivel === n).length]);
  const nomN = {alta: ['crítica', 'críticas'], media: ['a vigilar', 'a vigilar'], bien: ['mejora', 'mejoras']};
  const enCurso = par && st.meses.includes(par.i);
  const reglas = 'Cuenta como alarma solo lo que sale del margen de error al 95 %.<br><b>Crítica</b>: el indicador o un segmento (negocio, segmento, región, casa de cobro, canal; n ≥ ' + NMIN + ') cae frente al periodo anterior.<br><b>A vigilar</b>: el valor más bajo de la serie o tres meses seguidos bajando (con un solo mes elegido), un segmento por debajo del total del proceso o un dolor que sube.<br><b>Encuestas</b>: más o menos de ±25 % frente al promedio mensual histórico (a vigilar; crítica si hay 50 % o más de menos). El mes en curso se proyecta al mes completo.<br><b>Mejora</b>: el indicador sube frente al periodo anterior.<br>Responde a los filtros: con un proceso elegido muestra solo ese.';
  const li = (x, i) => `<li class="al ${x.nivel}" data-an="aparece" data-i="${i}"><i class="al-p" aria-hidden="true"></i>
      <div class="al-x"><div class="al-t"><span class="al-e">${x.e === FP ? 'Factura y pago' : 'Cobranza'}</span>${x.tit}</div><p>${x.det}</p></div>
      ${x.filtro ? `<button type="button" class="al-f" data-dim="${x.filtro.dim}" data-v="${x.filtro.v}" aria-pressed="${filtrado(x.filtro.dim, x.filtro.v)}">${filtrado(x.filtro.dim, x.filtro.v) ? 'Quitar filtro' : 'Filtrar'}</button>` : ''}</li>`;
  return `<section class="panel alarmas${al.length ? ' con' : ''}" id="alarmas"><header><h2 ${tipAttr(reglas)}>Alarmas <span class="info">?</span></h2>
      <div class="al-cont">${cnt.filter(([, n]) => n).map(([nv, n]) => `<span class="al-c ${nv}">${n} ${nomN[nv][n === 1 ? 0 : 1]}</span>`).join('')}</div>
      <p class="sub">${alcance()} · ${etqMeses(st.meses)}${ant ? ` frente a ${etqCorta(ant)}` : ' · sin un periodo anterior igual para comparar'}${enCurso ? ` · mes en curso (corte al ${D.generado.slice(8, 10)}/${D.generado.slice(5, 7)}): las cifras pueden moverse` : ''}</p></header>
    ${al.length ? `<ol class="al-lista">${al.map(li).join('')}</ol>`
      : `<p class="al-ok"><b>Sin alarmas.</b> Ningún indicador, segmento ni dolor se movió fuera del margen de error.</p>`}
  </section>`;
}
function montarAlarmas(raiz) {
  raiz.querySelectorAll('#alarmas .al-f').forEach(b => b.onclick = () => alternar(b.dataset.dim, +b.dataset.v));
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
const dolEst = {rango: 'mes', proc: FP, sel: null, voz: null};   // sel = dolor resaltado; voz = dolor con sus comentarios abiertos
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
function pista(con, sin, min, ref, suf, tip, fi) {
  if (con == null || sin == null) return '<div class="pz vacia">—</div>';
  const X = v => (v - min) / (100 - min) * 100, lo = Math.min(con, sin), hi = Math.max(con, sin);
  const etq = v => `${f0(v)}${suf}`;
  return `<div class="pz" ${tipAttr(tip)}><div class="riel">${min < 0 ? '<span class="cero" style="left:50%"></span>' : ''}
    ${ref != null ? `<span class="ref" style="left:${X(ref)}%"></span>` : ''}
    <span class="tramo" style="left:${X(lo)}%;width:${X(hi) - X(lo)}%" data-an="ancho" data-i="${fi}"></span>
    <span class="pt sin" style="left:${X(sin)}%" data-an="pop" data-i="${fi + 1}"></span><span class="pt con" style="left:${X(con)}%" data-an="pop" data-i="${fi}"></span>
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
      <div class="dh-num"><span>${n1} hoy</span><b>${GRAF.cuenta(tot.m1, 1)}${s1}</b></div>
      <div class="dh-pista" ${tipAttr(`<div class="t">Techo teórico</div>Las ${f0(alguno.nSin)} encuestas que no muestran ningún dolor dan ${n1} de ${techo == null ? '—' : f1(techo) + s1}. Si todos calificaran así, el ${n1} subiría ${techo == null ? '—' : f1(techo - tot.m1)} ${u1}.`)}>
        <div class="riel">${min1 < 0 ? '<span class="cero" style="left:50%"></span>' : ''}
          ${techo == null ? '' : `<span class="flujo" style="left:${X(Math.min(tot.m1, techo))}%;width:${Math.abs(X(techo) - X(tot.m1))}%" data-an="ancho"></span><span class="pt fin" style="left:${X(techo)}%" data-an="desliza" data-desde="${X(tot.m1)}%"></span>`}
          <span class="pt hoy" style="left:${X(tot.m1)}%"></span>${marcaElegido(orden, X)}</div>
        <div class="escala"><span>${min1 < 0 ? '−100' : '0'}</span><span>${min1 < 0 ? '0' : '50'}</span><span>100</span></div></div>
      <div class="dh-num der"><span>Sin ningún dolor</span><b>${techo == null ? '—' : GRAF.cuenta(techo, 1) + s1}</b></div>
      <div class="dh-pts"><b>${techo == null ? '—' : GRAF.cuenta(techo - tot.m1, 1, {signo: true})}</b><span>${u1} de ${n1} en juego</span></div>
      <p class="dh-pie">${f1(alguno.pct)} % de las encuestas (${f0(alguno.n)} de ${f0(tot.n)}) muestra al menos un dolor. Su ${n1} es ${f1(alguno.con)}${s1}${alguno.c2 != null ? ` y su ${n2} ${f1(alguno.c2)} %` : ''}.</p>
    </div>`;
  const filasH = orden.map((x, i) => {
    const tc = DOLOR[x.k], poca = x.n < NMIN, br = x.sin - x.con;
    const tipN = `<div class="t">${esc(tc[0])}</div>${n1} con el dolor: <b>${f1(x.con)}${s1}</b> (n ${f0(x.n)})<br>${n1} sin el dolor: <b>${f1(x.sin)}${s1}</b> (n ${f0(x.nSin)})<br>Brecha: ${f1(br)} ${u1}`;
    const tipC = `<div class="t">${n2} · ${esc(tc[0])}</div>Con el dolor: <b>${x.c2 == null ? '—' : f1(x.c2) + ' %'}</b><br>Sin el dolor: <b>${x.s2 == null ? '—' : f1(x.s2) + ' %'}</b>${x.c2 != null && x.s2 != null ? `<br>Brecha: ${f1(x.s2 - x.c2)} pp` : ''}`;
    const tipP = `<div class="t">Si este dolor desapareciera</div>Quienes lo viven (${f1(x.pct)} %) pasarían a calificar como quienes no lo viven: el ${n1} iría de ${f1(tot.m1)} a ${f1(x.sin)}.<br>${f1(x.pct)} % × ${f1(br)} ${u1} de brecha = <b>${fpp(x.pts)} ${u1}</b>`;
    const sel = dolEst.sel === x.k, voz = dolEst.voz === x.k;
    return `<li class="dol${poca ? ' poca' : ''}${sel ? ' dol-on' : ''}" data-k="${x.k}"${x.sin == null ? '' : ` data-x="${X(x.sin).toFixed(2)}" data-et="${esc(f1(x.sin) + s1 + ' sin este dolor')}"`}>
      <span class="rk">${String(i + 1).padStart(2, '0')}</span>
      <div class="qu"><span class="mom" ${tipAttr('Regla: ' + DL.reglas[x.k][2])}>${esc(DL.reglas[x.k][1])}</span>
        <div class="dol-tt"><button type="button" class="dol-t" aria-pressed="${sel}">${esc(tc[0])}</button>${botonVoces(x.k, voz)}</div><q>${esc(tc[1])}</q></div>
      <div class="vive"><b>${f1(x.pct)} %</b><span>${f0(x.n)} encuestas</span>${poca ? '<span class="bajo">muestra baja</span>' : ''}</div>
      ${pista(x.con, x.sin, min1, tot.m1, s1, tipN, i)}
      ${pista(x.c2, x.s2, 0, tot.m2, ' %', tipC, i + 1)}
      <div class="gana" ${tipAttr(tipP)}><b>${x.pts == null ? '—' : GRAF.cuenta(x.pts, 1, {signo: true})}</b><small>${u1}</small><span class="barrita"><i style="width:${poca || x.pts == null ? 0 : Math.max(0, x.pts) / maxPts * 100}%" data-an="ancho" data-i="${i + 2}"></i></span></div>
      ${voz ? vocesDolor(x.k) : ''}
    </li>`;
  }).join('');
  const segProc = st.proceso == null ? `<div class="seg" role="group" aria-label="Proceso de los dolores" id="dol-p">${[FP, COB].map(p => `<button type="button" data-p="${p}" aria-pressed="${dolEst.proc === p}">${PROC[p]}</button>`).join('')}</div>` : '';
  return `<section class="panel dolores" id="dolores"><header><h2>Dolores del cliente</h2>
      <div class="herr">${segProc}<div class="seg" role="group" aria-label="Periodo de los dolores" id="dol-r"><button type="button" data-r="mes" aria-pressed="${dolEst.rango === 'mes'}">${st.meses.length > 1 ? 'Meses elegidos' : 'Mes'}</button><button type="button" data-r="acum" aria-pressed="${dolEst.rango === 'acum'}">Año corrido</button></div></div>
      <p class="sub">${PROC[dolEst.proc]} · ${st.negocio == null ? 'Hogar + Móvil' : NEG[st.negocio]} · ${rango}. Lo que responden y cuentan los clientes, cruzado con su ${n1} y su ${n2}. Arriba, el dolor que más ${u1} de ${n1} le quita a la nota.</p></header>
    ${cab}
    ${leyendaDolores('Lo vive', n1, n2, `${n1} que recupera`)}
    <ol class="dol-lista${dolEst.sel && orden.some(x => x.k === dolEst.sel) ? ' con-sel' : ''}">${filasH || '<li class="vacio">Sin encuestas con estos filtros</li>'}</ol>
    <p class="nota dol-nota">${fp ? 'Cuatro dolores salen de la respuesta a la encuesta (valores que no cuadran, entender la factura de 1 a 3, pagar de 1 a 3 y seguridad o rapidez en 1) y tres de lo que cuenta el cliente en sus comentarios.' : 'La claridad sale de la respuesta (1 a 3); el resto, de lo que cuenta el cliente en sus comentarios.'} Pasa el cursor por la etiqueta de cada dolor para ver su regla; clic en un dolor para resaltarlo y en el globo para leer lo que más repiten quienes lo viven. Los puntos son teóricos: suponen que quien deja de vivir el dolor califica igual que quien nunca lo vivió. Como un cliente puede tener varios dolores, las filas no se suman; el número de arriba cuenta cada encuesta una sola vez.</p>
  </section>`;
}

// ------------------------------------------------------------------ dolores: resaltar uno y leer lo que más repiten
// Encabezado de la lista: el nombre del indicador grande y debajo la clave de los puntos, centrado sobre su columna
const pareja = (c, t) => `<span><i class="pt ${c}"></i>${t}</span>`;
const leyendaDolores = (vive, n1, n2, recupera) => {
  const pts = `<small>${pareja('con', 'Con el dolor')}${pareja('sin', 'Sin el dolor')}<span><i class="ref"></i>Total</span></small>`;
  return `<div class="dol-ley" aria-hidden="true"><span></span><span class="dl-t"><b>${vive}</b><small>de las encuestas</small></span>
    <span class="dl-t"><b>${n1}</b>${pts}</span><span class="dl-t"><b>${n2}</b>${pts}</span><span class="dl-t"><b>${recupera}</b><small>si el dolor desaparece</small></span></div>`;
};
const ICO_VOZ = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v7.5a2.5 2.5 0 0 1-2.5 2.5H10.5L6.6 19.7c-.5.4-1.1 0-1.1-.6v-2.6A2.5 2.5 0 0 1 4 14z"/><path d="M8.5 9h7M8.5 12.2h4.5"/></svg>';
const botonVoces = (k, abierto) => `<button type="button" class="dol-com" aria-expanded="${abierto}" aria-label="Ver lo que más repiten quienes viven «${esc(DOLOR[k][0])}»" ${tipAttr('Lo que más repiten quienes viven este dolor')}>${ICO_VOZ}</button>`;
// Punto del dolor elegido sobre el riel del recuadro de arriba: hasta dónde llegaría el indicador sin ese dolor
function marcaElegido(orden, X) {
  const x = dolEst.sel ? orden.find(d => d.k === dolEst.sel) : null, ok = x && x.sin != null;
  return `<span class="pt elegido" style="left:${ok ? X(x.sin) : 50}%"${ok ? '' : ' hidden'}></span><span class="elegido-et" style="left:${ok ? X(x.sin) : 50}%"${ok ? '' : ' hidden'}>${ok ? esc(f1(x.sin) + (dolEst.proc === FP ? '' : ' %') + ' sin este dolor') : ''}</span>`;
}
// Comentarios de quienes viven el dolor k, con los filtros y el periodo de la caja de dolores
function comDolor(k) {
  if (!C) return null;
  const bit = DLC.indexOf(k);
  if (bit < 0) return [];
  const acum = dolEst.rango !== 'mes', anio = PERIODOS[st.periodo].slice(0, 4), o = {proceso: dolEst.proc};
  if (acum) o.periodo = null;
  return baseNube().filter(v => (v.dl >> bit) & 1 && pasa(v.r, o) && (!acum || (PERIODOS[v.r[0]].slice(0, 4) === anio && v.r[0] <= st.periodo)));
}
const recortar = (t, n) => t.length > n ? t.slice(0, n).replace(/\s+\S*$/, '') + '…' : t;
// Lo que más repiten: palabras más frecuentes y comentarios agrupados (los casi iguales juntos), primero los que más se
// repiten; en los dolores de respuesta cerrada pesan doble los que escribió en la pregunta del propio dolor
function vocesDolor(k) {
  const items = comDolor(k), tit = DOLOR[k][0];
  if (items == null) return '<div class="dol-voces"><p class="nota">Cargando comentarios…</p></div>';
  if (!items.length) return `<div class="dol-voces"><p class="nota">Sin comentarios de quienes viven «${esc(tit)}» con estos filtros.</p></div>`;
  const an = NUBE.analizar(items, NB_CFG), sim = NUBE.similares(items, null, NB_CFG, {df: an.df, max: 80}), prop = DLP[k];
  const gr = sim.grupos.map((g, i) => ({g, i, peso: g.miembros.length * (prop && g.miembros.some(v => v.preg === prop) ? 2 : 1)}))
    .sort((a, b) => b.peso - a.peso || a.i - b.i).slice(0, 5).map(z => z.g);
  const pal = an.palabras.slice(0, 8);
  return `<div class="dol-voces" role="region" aria-label="Lo que más repiten quienes viven ${esc(tit)}">
    <div class="dv-cab"><b>Lo que más repiten</b><span class="nota">${f0(items.length)} ${items.length === 1 ? 'comentario' : 'comentarios'} de quienes viven este dolor · los casi iguales van juntos</span></div>
    ${pal.length ? `<div class="dv-pal" aria-label="Palabras que más se repiten">${pal.map(w => `<span>${esc(w.t)}<small>${f0(w.n)}</small></span>`).join('')}</div>` : ''}
    <ol class="dv-lista">${gr.map(g => { const v = g.rep.v, n = g.miembros.length;
      return `<li>${chipNota(v) || '<span></span>'}<q>${esc(recortar(v.texto, 300))}</q>${n > 1 ? `<span class="dv-rep" ${tipAttr(f0(n) + ' comentarios casi iguales')}>×${n}</span>` : '<span></span>'}<div class="dv-meta">${metaCom(v)}</div></li>`; }).join('')}</ol>
  </div>`;
}
const anima = () => GRAF.activo() && window.Motion;
function pintarSel(sec, anim) {
  const lista = sec.querySelector('.dol-lista'); if (!lista) return;
  lista.classList.toggle('con-sel', !!dolEst.sel);
  sec.querySelectorAll('.dol[data-k]').forEach(li => {
    const on = li.dataset.k === dolEst.sel;
    li.classList.toggle('dol-on', on); li.querySelector('.dol-t').setAttribute('aria-pressed', on);
    if (on && anim && anima()) Motion.animate(li, {scale: [.98, 1]}, {type: 'spring', bounce: .45, duration: .5});
  });
  const m = sec.querySelector('.dh-pista .elegido'), et = sec.querySelector('.dh-pista .elegido-et');
  const li = dolEst.sel ? sec.querySelector(`.dol[data-k="${dolEst.sel}"]`) : null;
  if (!m || !et) return;
  if (li && li.dataset.x) {
    const nuevo = m.hidden;
    m.hidden = et.hidden = false; m.style.left = et.style.left = li.dataset.x + '%'; et.textContent = li.dataset.et;
    // WAAPI y no Motion: el marcador ya lleva translate(-50%) y Motion reemplazaría todo el transform
    if (nuevo && anim && anima()) {
      m.animate([{transform: 'translate(-50%,-50%) scale(0)'}, {transform: 'translate(-50%,-50%) scale(1)'}], {duration: 480, easing: 'cubic-bezier(.34,1.56,.64,1)'});
      et.animate([{opacity: 0, transform: 'translate(-50%,6px)'}, {opacity: 1, transform: 'translate(-50%,0)'}], {duration: 300, easing: 'ease-out'});
    }
  } else m.hidden = et.hidden = true;
}
function ponerVoces(sec, anim) {
  const k = dolEst.voz; if (!k) return;
  const li = sec.querySelector(`.dol[data-k="${k}"]`);
  if (!li) { dolEst.voz = null; return; }
  li.querySelectorAll('.dol-voces').forEach(x => x.remove());
  li.insertAdjacentHTML('beforeend', vocesDolor(k));
  li.querySelector('.dol-com').setAttribute('aria-expanded', 'true');
  const caja = li.querySelector('.dol-voces');
  if (anim && anima()) {
    Motion.animate(caja, {opacity: [0, 1], y: [-8, 0]}, {duration: .35, ease: [.22, 1, .36, 1]});
    Motion.animate(caja.querySelectorAll('.dv-pal span, .dv-lista li'), {opacity: [0, 1], y: [8, 0]}, {duration: .35, delay: Motion.stagger(.035, {startDelay: .08})});
  }
}
function abrirVoces(sec, k) {
  const cerrar = dolEst.voz === k;
  sec.querySelectorAll('.dol-voces').forEach(x => x.remove());
  sec.querySelectorAll('.dol-com').forEach(b => b.setAttribute('aria-expanded', 'false'));
  dolEst.voz = cerrar ? null : k;
  if (cerrar) return;
  dolEst.sel = k; pintarSel(sec, true); ponerVoces(sec, true);
  if (!C) cargarComentarios();
}
function montarDolores(raiz) {
  const sec = raiz.querySelector('#dolores'); if (!sec) return;
  sec.querySelectorAll('.dol[data-k]').forEach(li => {
    const k = li.dataset.k, elegir = () => { dolEst.sel = dolEst.sel === k ? null : k; pintarSel(sec, true); };
    li.onclick = e => { if (!e.target.closest('.dol-com, .dol-voces, .dol-t')) elegir(); };
    li.querySelector('.dol-t').onclick = elegir;
    li.querySelector('.dol-com').onclick = () => abrirVoces(sec, k);
  });
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
    const ind = IND[k], esc0 = ind.min < 0 ? `de ${f0(ind.min)} a ${f0(ind.max)}` : `de ${f0(ind.min)} a ${f0(ind.max)} %`;
    // Anillo: dónde cae el valor en su escala completa, coloreado de rojo (lo peor) a verde (lo mejor)
    const an = r ? GRAF.anillo(r.v, ind.min, ind.max, {tip: tipInd(k, r, `<br>El anillo ubica el valor en la escala ${esc0}: rojo es lo peor, verde lo mejor.`)}) : '';
    return `<article class="kpi${i === 0 ? ' estrella' : ''}">${i === 0 ? '<span class="glow"></span>' : ''}${an}
      <div class="et">${IND[k].corto} <span class="info" tabindex="0" ${tipAttr(esc(IND[k].nombre + '. ' + IND[k].def))}>?</span></div>
      <div class="v" ${tipAttr(tipInd(k, r))}>${grandeAn(k, r)}</div>
      <div class="pie">${r ? delta(k, r, pr, etA) : `<span class="nota">${IND[k].proc != null ? 'Solo se mide en ' + PROC[IND[k].proc].toLowerCase() : 'Sin respuestas'}</span>`}</div>
      ${spark(k)}
      <div class="pie"><span>n ${r ? f0(r.n) : 0}${r ? ` · ±${f1(r.ic)}` : ''}</span>${bajo(r)}<button type="button" class="ver" data-cajon="${k}" aria-label="Ver detalle y comentarios de ${IND[k].nombre}">Voces ›</button></div></article>`;
  }).join('')}</section>`;
}
function vResumen(p) {
  const ks = KPIS[st.proceso == null ? 'todos' : st.proceso];
  const evoKs = KS.filter(k => st.proceso == null || IND[k].proc === st.proceso);
  if (!evoKs.includes(st.evo)) st.evo = evoKs[0];
  const lentes = st.proceso === COB ? ['imal', 'tmal', 'cnoc', 'ibien'] : st.proceso === FP ? ['det', 'pro', 'vano', 'fdif', 'pdif'] : ['det', 'pro', 'vano', 'imal', 'tmal'];
  p.innerHTML = `
    ${kpiCards(ks)}
    <div class="g g-evo-al">
      <section class="panel" id="evo-p"><header><h2>${IND[st.evo].corto} · ${st.modo === 'mes' ? 'mes a mes' : 'semana a semana, ' + etqMeses(st.meses)}</h2>
        <div class="herr"><label class="sr" for="evo-k">Indicador</label><select class="sel" id="evo-k">${ETAPAS.map(E => { const ks = E.ks.filter(k => evoKs.includes(k)); return ks.length ? `<optgroup label="${E.t}">${ks.map(k => `<option value="${k}"${st.evo === k ? ' selected' : ''}>${IND[k].nombre}</option>`).join('')}</optgroup>` : ''; }).join('')}${evoKs.includes('nps') ? `<option value="nps"${st.evo === 'nps' ? ' selected' : ''}>NPS · recomendación</option>` : ''}</select>
        ${PERIODOS.length > 1 ? `<div class="seg" role="group" aria-label="Agrupar" id="evo-m"><button type="button" data-m="mes" aria-pressed="${st.modo === 'mes'}">Mes</button><button type="button" data-m="semana" aria-pressed="${st.modo === 'semana'}">Semana</button></div>` : ''}</div>
        <div class="leyenda" style="flex-basis:100%">${negs().map(e => `<span><i class="l" style="background:${CE[NEG[e]]}"></i>${NEG[e]}</span>`).join('')}<span class="nota">Punto hueco = menos de ${NMIN} encuestas</span>${tablaPH('evo')}</div></header>
        ${lineasPH(st.evo, st.modo, 'evo')}</section>
      ${vAlarmas()}
    </div>
    ${vTabla()}
    ${vDolores()}
    ${carrusel('res', lentes)}`;
  montarTabla(p); montarAlarmas(p); montarDolores(p);
  p.querySelectorAll('#dol-r button').forEach(b => { b.onclick = () => { dolEst.rango = b.dataset.r; pintarTab('#dolores'); }; });
  p.querySelectorAll('#dol-p button').forEach(b => { b.onclick = () => { dolEst.proc = +b.dataset.p; dolEst.sel = dolEst.voz = null; pintarTab('#dolores'); }; });
  p.querySelector('#evo-k').onchange = e => { st.evo = e.target.value; pintarTab('#evo-p'); };
  p.querySelectorAll('#evo-m button').forEach(b => { b.onclick = () => { st.modo = b.dataset.m; pintarTab('#evo-p'); }; });
}
// En las pestañas de proceso se ignora el filtro de proceso: cada una muestra el suyo
const avisoProceso = proc => st.proceso != null && st.proceso !== proc ? `<p class="nota" style="margin:0">El filtro de proceso dice «${PROC[st.proceso]}»; esta pestaña muestra ${PROC[proc].toLowerCase()} igual.</p>` : '';
function conProceso(proc, fn) { const g = st.proceso; st.proceso = proc; try { return fn(); } finally { st.proceso = g; } }
function vFactura(p) {
  p.innerHTML = avisoProceso(FP) + conProceso(FP, () => {
    const idx = filas(), a = sumar(idx), gr = grNeg();
    return `${kpiCards(['fsat', 'ces1', 'va'])}
    <div class="g g2"><section class="panel"><header><h2>¿Qué tan fácil es entender la factura?</h2><p class="sub">CES 1 · centrado en el 3: a la izquierda lo difícil, a la derecha lo fácil.</p></header>${divergente(gr, 'ces1')}<h3 class="sub-t">Satisfacción con el valor facturado</h3>${divergente(gr, 'fsat')}</section>
      <section class="panel dona-panel"><header><h2>¿Los valores cuadran con el plan?</h2><p class="sub">% de quienes dicen que los valores de la factura van de acuerdo con su plan. En el centro, el indicador.</p></header>${donasVa(gr)}</section></div>
    <div class="g g2">${panelMotivos('va', 'Por qué no cuadran los valores', 'Motivos de quienes dicen que no', idx)}${panelMotivos('ces1', 'Qué cuesta entender de la factura', 'Motivos de quienes califican 1 a 3', idx)}</div>
    ${carrusel('fac', ['vano', 'fdif', 'fmal', 'fbien'])}
    <div class="g g2">${ranking('va', 'va')}${ranking('ces1', 'ces1')}</div>`;
  });
}
function vPago(p) {
  p.innerHTML = avisoProceso(FP) + conProceso(FP, () => {
    const idx = filas(), a = sumar(idx), gr = grNeg();
    return `${kpiCards(['psat', 'ces2', 'rap', 'seg'])}
    <div class="g g2"><section class="panel"><header><h2>¿Qué tan fácil es pagar?</h2><p class="sub">CES 2 · centrado en el 3: a la izquierda lo difícil, a la derecha lo fácil.</p></header>${divergente(gr, 'ces2')}<h3 class="sub-t">Satisfacción con el pago</h3>${divergente(gr, 'psat')}</section>
      <section class="panel"><header><h2>Rapidez y seguridad al pagar</h2><p class="sub">Escala de 1 a 3. El 1 es la respuesta mala; el indicador es el % que da 2 o 3.</p></header><div class="par-torres"><div><h3>Rapidez</h3>${torres3(gr, 'rap')}</div><div><h3>Seguridad</h3>${torres3(gr, 'seg')}</div></div></section></div>
    <div class="g g3">${panelMotivos('ces2', 'Qué hace difícil pagar', 'Motivos de quienes califican 1 a 3', idx)}${panelMotivos('rap', 'Por qué el pago es lento', 'Motivos de quienes califican 1', idx)}${panelMotivos('seg', 'Por qué el pago no da confianza', 'Motivos de quienes califican 1', idx)}</div>
    ${carrusel('pag', ['pdif', 'pmal', 'rap1', 'seg1', 'pbien'])}
    <div class="g g2">${ranking('ces2', 'ces2')}${ranking('psat', 'psat')}</div>`;
  });
}
function vCobranza(p) {
  p.innerHTML = avisoProceso(COB) + conProceso(COB, () => {
    const idx = filas(), a = sumar(idx), gr = grNeg();
    const canales = porDim(idx, 'canal').filter(x => V.canal[x.v] !== 'No aplica').map(x => ({nombre: x.nombre, c: x.a.n})).sort((x, y) => y.c - x.c);
    return `${kpiCards(['cinf', 'ctra', 'clar'])}
    <div class="g g2"><section class="panel"><header><h2>Información y trato en la gestión de cobro</h2><p class="sub">De 1 a 5 · centrado en el 3.</p></header>${divergente(gr, 'cinf')}<h3 class="sub-t">Satisfacción con el trato</h3>${divergente(gr, 'ctra')}</section>
      <section class="panel"><header><h2>¿Fue clara la información?</h2><p class="sub">Claridad de 1 a 5.</p></header>${divergente(gr, 'clar')}<h3 class="sub-t">Por dónde se enteró del cobro</h3><p class="nota" style="margin:-2px 0 8px">Canal de comunicación · % de ${f0(a.n)} encuestas de cobranza.</p>${canalesRadial(canales, a.n)}</section></div>
    ${carrusel('cob', ['imal', 'tmal', 'cnoc', 'ibien', 'tbien'])}
    <div class="g g2">${ranking('cinf', 'cinf', DIM_COB)}${ranking('ctra', 'ctra', DIM_COB)}</div>`;
  });
}
// ------------------------------------------------------------------ nube de comentarios (pestaña Voces, usa nube.js)
// Temas: reglas sobre el texto normalizado (minúsculas, sin tildes, «ñ» → «n»). Un comentario puede tocar varios.
const NB_CATS = [
  {k: 'servicio', nombre: 'Señal, internet y fallas', re: /senal|cobertura|internet|interm|\bse (le )?cae\b|\bse va (la senal|el internet|el servicio|la luz|la linea)|\bcaen?\b|\bfall(a|as|an|ando|ado|o)\b|\bfalencia|\bred\b|velocidad|\blent[oa]s?\b|\bconexion|conectiv|estab(le|ilidad)|inestab|\bmegas|\bwifi|\bwi fi|televis|\btv\b|\bcanales\b(?! de (atencion|comunicacion|pago))|parrilla|(los|sin|mis|sus|plan de|paquete de|consumo de) datos\b|\bdatos (moviles|se |no |muy |lent|ilimit)|sin servicio|no (le )?(funciona|sirve)|danad|\bdano|averia|\btecnic|\bvisita|navega|antena|repetidor|telefonia|fibra|servicio (es |esta )?(muy )?(malo|pesimo|regular|deficiente)|\bservcio|calidad|se cuelga (la linea|el internet|el servicio)|\bse (va|corta) (la luz|el servicio|la linea)/},
  {k: 'elogio', nombre: 'Satisfecho, sin quejas', re: /^(?!.*(\bno (lo )?(le )?(llega|funciona|sirve|gusta|esta|recomiend)|\bpero\b|\bmal[oa]?\b|\bpesim|aument|increment|\bsub(e|en|ieron)\b|fall|\bcae\b|interm|insatisf|inconform|molest|deberia|desea|quiere|solicita))(?:.*(todo (esta |muy |le parece |ha estado )?bien|todo le gusta|le gusta todo|satisf|conforme|excelente|buen(a|o)? (servicio|experiencia|atencion|senal|cobertura|funcionamiento)|funciona (muy )?bien|(esta|todo|muy) bien|si (lo )?recomiend|ningun (inconveniente|problema)|sin (inconvenientes|problemas|novedad|quejas)|no (ha tenido|tiene|presenta) (sugerencias?|quejas?|inconvenientes?|problemas?|novedad|recomendaciones)|sin sugerencias?|^ *(ninguna?|nada)\W*$|le gusta (el servicio|todo|claro|mucho)|siga[n]? asi|perfect|el mejor|\bcontent[oa]|\beficient|confiab|servicio (es|ha sido|le (a|ha) salido) (muy )?buen|se siente bien|de acuerdo)|\W*(es |muy |le parece (es )?)?buen[oa]\W*$|.*todo se encuentra bien|.*no (ha|a|ah) (tenido|presentado) (ningun |ninguna )?(inconvenientes?|inconformidad\w*|problemas?)|.*cumplimiento)/},
  {k: 'aumento', nombre: 'Aumentos y precio', re: /aument|increment|\bsub(e|en|io|ieron|ido|iendo|ir|irle|an|a|ida|idas)\b|\bcar[oa]s?\b|costos[oa]|elevad|excesiv|muy alt[oa]s?\b|\bcostos?\b|\bprecios?\b|\btarifas?\b|economic|\bbaj(e|en|ar|aran?|o|aron)\b.{0,25}(precio|plan|valor|tarifa|costo|factura)|rebaj|reajust|alza/},
  {k: 'gestion', nombre: 'Llamadas y avisos de cobro', re: /\b(lo|la|le|los|las|me|nos) (estan |siguen |vuelven a )?llam(an|en|aron|ando|a|aban)\b|\bllam(an|en|aron) (mucho|demasiado|tanto|cada|todos|a toda|varias|insistent|seguido|para cobrar)|llamadas? (de|del|para|por) (la )?(cobr|recordat|pago|mora|deuda)|(muchas|tantas|varias|demasiadas|constantes|reiterativ|insistent|seguidas|repetitiv|excesiv)\w* (las )?llamad|llamad\w* (automatic|grabad|de (una )?maquina|robot|todo el dia|a toda hora|diari|constant|seguid|insistent|reiterativ|repetitiv|excesiv|molest)|llamadera|mensaj|\bwhats|wasap|\bsms\b|\bmsm\b|recordat|recordacion|recordar|\bbot\b|grabac|(contesta|llama|habla|atiende|es|son)\w* (una |la )?maquina|maquina (que|contesta|llama)|robot|(llamad|mensaj)\w* automatic|amenaz|acos|insist|molest(?!\w* (mucho )?(la senal|el servicio|el internet))|fastidi|\bpresion|hostig|\bmora\b|centrales|datacredito|reportar|embarg|abogad|juridic|cobrador|horario|fin(es)? de semana|domingo|de noche|en la noche|madrugada|cada \d+ (minutos|horas)|spam|comunicaciones\b|notific|gestion de cobr|\bcobranzas?\b(?! (movil|fijo|hogar|pyme)\))|desesper|recuerd(e|en|an)\b|constantes|intens|llam\w* (tanto|demasiado|mucho)|llamando|recurrentes|veces al dia|canson|toleran|extorsi|\bllamas\b|contestador|\bia\b|inteligencia artificial|ser humano|maquina|llamad\w*.{0,30}(cobr|cada rato|seguid|frecuen|inoportun)|frecuencia de (las )?llamad|(cada rato|seguido).{0,20}llam/},
  {k: 'factura', nombre: 'Recibir y entender factura', re: /lleg\w* (la |su |las )?factur|factur\w* (no )?(le )?(lleg|ha llegado|ha sido enviad)|factura (fisica|electronica|digital|impresa)|factur.{0,40}correo|correo.{0,30}factur|fisic[ao]|factur\w* electronic|electronic\w* (de )?factur|entend|factur.{0,30}(clara|confus|legible|detall)|(clara|confus|legible)\w* .{0,30}factur|claridad|detall|desglos|\bciclo|fecha (de )?(corte|limite|vencim)|cambi\w* (de |la )?fecha|(lleg|envi|factur)\w* .{0,15}(puntual|a tiempo|oportun[ao]s?\b|oportunamente|tarde|atrasad|antes)|\bpdf|legible|confus|(no )?se entiende|(problema|inconvenient|falencia|error|insatisf|inconform)\w* (en|con) (la |el proceso de )?factur|factur\w* (alta|elevada|errad)|\brecibo|lleg\w* (al|por) correo|lleg\w* .{0,12}factura|fechas? limites?/},
  {k: 'plan', nombre: 'Planes, ofertas y cambios', re: /(cambi|baj|sub|mejor|nuev|otro|ofrec|contrat|adquir|vend|aument|increment|suspend|cancel)\w* (de |el |del |su |un |al |a |los |sus |mi )?(plan|paquete)|plan(es)? (mas )?(econom|barat|car[oa]|fijo|ofrecid|ofertad|acordad|contratad|aliado|ilimitad|de datos|con mas|que)|\bplanes\b|precio (del )?plan|valor del plan|benefic|descuent|promoc|oferta|ofrec|prometi|\bbono|paquete|cancel\w* (el |del |su |los |mi )?(servicio|plan|contrato|linea|cuenta)|cancelacion|quiere cancelar|retir|traslad|permanenc|antiguedad|fidelid|portab|otros? operador|competencia|\bgigas?\b|\bgb\b|ilimitad|contrat(o|ado|ar)\b|no (le )?cumpl\w* (con )?(lo|la|el|los) (ofrec|ofert|promet|acord|pact|descuent|plan|benefic)/},
  {k: 'atencion', nombre: 'Atención y solución', re: /(^|\. |la |buena |mala |mejor |excelente |pesima |su |poca |rapida |buen |en |y )atencion\b(?! (de )?(cobr|pag|factur))|servicio al cliente|asesor|\btrato\b|amabl|grose|\brespet(o|uos)|(no|sin) (le )?(dan |dieron |han dado |brindan )?(respuesta|solucion)|no (le )?(contestan|responden|solucionan|resuelven)|solucion|resolv|\bpqr|\bquejas?\b|reclam|tiempo de espera|a la espera|muy demorad|tramit|oficina|centro de atencion|\bcac\b|linea de atencion|cuelgan|\bcapacit|personal|mas atencion|atencion al cliente|informacion (no es |incomplet|errone|fals|equivoc)|mala informacion|mal informad|humaniz|evaden|empat/},
  {k: 'pago', nombre: 'Pagar: canales y facilidad', re: /\bpag(o|os|ar|a|an|ando|ado|ue|uen|arla|arlo)\b.{0,40}(facil|rapid|app|aplicac|en linea|virtual|pagina|nequi|pse|banco|punto|efecty|tarjeta|daviplata|bancolombia|portal|\bweb|domicili|debito|reflej|segur)|(facil|facilidad|rapidez|rapido|sencill|comod|agil|segur)\w* (de |del |para |en (el|los) |al )?(proceso de |realizar (el|los) )?pag|\bnequi|\bpse\b|daviplata|bancolombia|efecty|\bapp\b|(aplicacion|pagina|plataforma)s?.{0,30}(pag|factur|consult|ingres|bloque|cae|caen|colaps|sirve|funciona|arregl)|(pag|factur)\w*.{0,30}(aplicacion|pagina|plataforma)|mi claro|debito autom|medios? de pago|canales de pago|puntos? (de pago|fisico|autorizado)|sitios autorizados|referencia de pago|\bpaga(r)? (en|por) |\bfila|\bpag\w*.{0,20}(facil|instant|sencill|agil|\bcomod)|\bpag\w* (es |muy |mas )*rapid|(facil|facilita|rapid|sencill|agil|\bcomod)\w*.{0,20}\bpag|formas? de pago|metodos? de pago|presencial|en efectivo|\bcav\b|transacci/},
  {k: 'info', nombre: 'Información clara o confusa', re: /informacion (es |fue |muy |no es |no fue |le parece )?(clara|confus|complet|incomplet|concret|precis|oportun|correct|errone|buena|mala|deficiente)|(clara|completa|concreta|buena|mala|poca|falta de|mejor|mas clara) informacion|(brindan|dan|dar|brindar|brindaron|dieron|dio) (la |una )?informacion (errad|incomplet|clara|complet|equivoc|fals|concret|correct)|(no|poco|sean|ser|mas) (son |es |fue |muy )?clar[oa]s?\b|\b(todo|fue|es|esta) (muy )?clar[oa]\b|no (se le )?entiend|no (le )?(explic|especific|informa)|(no|mas) (se )?(le )?especific|especificar|especifique|le dicen una cosa|(no|sin) (le )?(avis|inform)|avisar|informar (antes|el|la|del|sobre|cuando)|desinform|confus|explic/},
  {k: 'cobro', nombre: 'Cobros que no cuadran', re: /cobr(o|os|an|ando|aron|ar|arle|e|en|ado|a)\b.{0,30}(de mas|demas\b|doble|indebid|no corresp|que no (contrat|adquir|acept|solicit|usa|utiliza|tiene|pidio)|adicional)|cobros? (indebido|doble|adicional|de mas)|valor(es)? (diferente|distinto|que no corresp|mas alto)|no cuadra|(valor|valores|cobros?|factura|facturados|pagos?|cartera|cobrado) (no )?(le )?(corresp|coincid|concuerd)\w*|no (corresp|coincid|concuerd)\w* (con )?(lo|el|la|los|al|a lo) ?(valor|cobr|factur|plan|contrat|acord|pag|que)|\bcargos?\b|no (le )?(aplic|reflej)|(diferente|distinto|otro) (al|a lo|del) (acordad|ofrecid|pactad)|mas de lo (acordado|pactado|ofrecido|esperado)|(valor|valores|cobros?|factura|monto|facturados)\w* no (son|es|esta|estan) (acorde|correct)|saldos? (pendiente|a favor|anterior|que no|adicional|erron)|devolucion (del|de su|de) (dinero|saldo|valor|plata|pago)|reembols|le cobran otro|un valor y (le )?(cobran|llega otro)|cobr\w* (mas|mucho|cosas|un servicio|servicios? que|cuando (ya|esta))|siguen cobrando|valor\w* .{0,30}(diferente|distint)|valor(es)? adicional|pagaba de mas|no (tiene|tenia) conocimiento|seguia?n? cobrando|cobros? repetid|mas de una vez|cobran cuando|no cobran lo que|lleg\w* otros? valor|otros valores|cobr\w*.{0,30}(al dia|ya pag)|ya (habia )?(pago|pagado|cancelado)|robad|terceros|(cambi|vari)\w* (el |los |de )?valor|valor\w* .{0,25}(cambi|vari|superior|otro)|otro valor|ponen un valor|le lleg\w* (con )?otro valor/},
];
// Palabras que no entran a la nube: plantillas y notas del analista, las que repiten la pregunta o el sentimiento
// (el color ya dice si es bueno o malo) y los nombres del estudio y del negocio
const NB_STOP = {};
('sugerencia sugerencias biensugerencia facturacionsugerencia facturasugerencia sugiere sugieren sugerir sugirio nombre evaluacion observacion ' +
  'observaciones observacionescliente novedad novedades remite presenta presentado presentando presente presento presentan presentaba realiza ' +
  'realizar realizado realizan realizaron realice realizo realizada encuentra encuentran parece siente sabe necesita desea pasa queda toca hacen ' +
  'maneja manejas brinda brindan brindar brindaron brindarle brindado dijeron indican indicando indicandole comentarios comentaron comentario ' +
  'comentan califica calificacion calificar menciono mencionan manifiestan manifesto manifestando refiere solicita solicitar solicito solicitado ' +
  'solicitan solicitud solicitudes mes meses momento momentos aveces avez ido manera respecto cuanto tema temas mucha muchas demasiado demasiada ' +
  'demasiadas demasiados experiencia recomienda recomiendo recomiendas recomieda recomendaria recomendar recomendaciones recomendacion ' +
  'recomendatoria recomendo recomendado gusta gustaria gustan gustado gusto gusten bien buena buenas buen malo malos mala malas excelente mejorar ' +
  'mejoren mejora mejoras mejorara mejoraria mejoraran mejorarian mejore mejor mejores satisfecho satisfecha satisfechos conforme conformes ' +
  'inconforme inconformes inconformidad inconformidades insatisfecho insatisfecha problema problemas inconveniente inconvenientes servicio servicios ' +
  'serviciio servcio servcios proceso procesos facturacion facturaciones facturados facturado general generales generalessin generalesse ' +
  'generalesla pyme pymes movil moviles hogar empresarial canal canales deja dejan dejar nota notas rr bloqueado temporal credenciales reset permite ' +
  'acceso soporte tyd tipificar tipifica aplicativos aplicativo aplicaticos registran registra cierre cuento tercero titular esposo esposa hija hijo ' +
  'mama familiar responde contestar usuarios clientes personas senor senora don dona recibe recibir cuenta falta estado normal normales varias ' +
  'varia atenido tenido ningun ninguno texto oportunidades oportunidad ocasiones').split(' ').forEach(w => { NB_STOP[w] = 1; });
// Sinónimos y formas que se cuentan como una sola palabra
const NB_UNIR = {};
[['llega', 'llegan llego llegue lleguen llegando llegar llegaron llegado llegara llegaba'],
  ['llamada', 'llaman llamar llamen llama llamando llamaron llamado llame llamara llamaran llamaban llamadera llamas'],
  ['cobro', 'cobran cobrando cobrar cobraron cobra cobren cobrado cobre cobrarle cobrarles cobrandoles cobradera'],
  ['aumento', 'aumenta aumentan aumentaron aumentar aumentando aumentado aumentada aumente incremento incrementos incrementa incrementan incrementado ' +
    'incrementando incrementaron incrementada incrementar incremente incrementen sube suben subiendo subido subieron subio subir suba suban subida subidas alza alzas'],
  ['pago', 'pagar paga pagando pagado pague paguen pagan pagaba pagarla pagarlo'],
  ['facil', 'facilidad facilidades facilmente'],
  ['rapido', 'rapida rapidas rapidez'],
  ['precio', 'costo costos tarifa tarifas'],
  ['caro', 'costoso costosa costosos costosas cara caras elevado elevada elevados elevadas'],
  ['cancela', 'cancelo cancelen cancele'],
  ['cae', 'caen caida caidas'],
  ['falla', 'fallando fallan fallado fallo'],
  ['asesor', 'asesora asesoras'],
  ['recorda', 'recuerdan recuerden recuerde recuerda'],
  ['molest', 'molesta molesto molestan molestando molesten molestoso molestos'],
  ['acoso', 'acosan acosada acosado acosar acosen acosador acosados'],
  ['maquina', 'bot bots robot robotizada robotizadas contestadora contestadoras grabacion grabaciones'],
  ['whatsap', 'whatsaap whatssap wasap wasapp watsap watsapp'],
  ['sms', 'msm'],
  ['app', 'apps aplicacion aplicaciones'],
  ['acord', 'acorde acordado acordada acordados acordadas pactado pactada'],
  ['estabil', 'estable estables'],
  ['dificil', 'dificulta dificultad dificultades dificultado complicado complicada complicadas complicados complica'],
  ['oferta', 'ofrecieron ofrecen ofrecido ofrecida ofrecio ofrecer ofrece ofrecimiento ofrecimientos ofrecieran ofreciendo ofreciendole ofertado ofertada'],
  ['funcionami', 'funcionamiento']].forEach(([k, ws]) => ws.split(' ').forEach(w => { NB_UNIR[w] = k; }));
// Nota de 0 a 1: recomendación (0–10) en factura y pago; cobranza no la pregunta, así que va la satisfacción con la información (1–5) y, si falta, con el trato
const notaCom = v => v.nps >= 0 ? v.nps / 10 : v.cinf >= 1 ? (v.cinf - 1) / 4 : v.ctra >= 1 ? (v.ctra - 1) / 4 : null;
// Con factura y pago y cobranza juntos, cada nota se mide frente a la media de su proceso (las escalas no se comparan):
// nbAj = {base: media de todo, proc: media de cada proceso}; null = un solo proceso, nota tal cual
let nbAj = null;
const notaNube = v => { const x = notaCom(v); return x == null || !nbAj ? x : x - nbAj.proc[v.r[DI.proceso]] + nbAj.base; };
const NB_CFG = {categorias: NB_CATS, stop: NB_STOP, unir: NB_UNIR, nota: notaNube, otros: 'Otros temas'};   // un solo objeto: nube.js guarda lo preparado por cfg
// Línea de datos del comentario en la pestaña de la nube: proceso y negocio · mes · pregunta (sin datos personales)
function metaCom(v) {
  const n = NEG[v.r[DI.negocio]], pq = D.preguntas[D.cod_preguntas.indexOf(v.preg)];
  return `<i class="punto" style="background:${CE[n]}"></i> ${esc(PROC[v.r[DI.proceso]])} ${esc(n)} · ${mesC(PERIODOS[v.r[0]])} · ${esc(pq)}`;
}
const exEst = {lente: '', q: '', nube: {}};
let nubeEl = null;   // el mismo contenedor entre repintados: nube.js le cuelga sus escuchas (Esc, clic fuera) una sola vez
let nbQuieto = false;   // repintar la nube sin la animación de entrada (al escribir en el buscador)
// Comentarios para la nube, una sola vez: sin las plantillas del analista y sin los que solo eran plantilla
let CN = null;
const baseNube = () => CN || (CN = C.reduce((a, v) => { const t = sinPlantilla(v.texto); if (t.trim()) a.push(t === v.texto ? v : Object.assign({}, v, {texto: t})); return a; }, []));
// Comentarios que alimentan la nube: filtros globales + tipo de comentario + búsqueda.
// El mismo texto de una encuesta pegado en dos preguntas (mismas dimensiones y notas) cuenta una vez.
function comNube() {
  const L = exEst.lente ? LENTES[exEst.lente] : null, q = norm(exEst.q), visto = {};
  return baseNube().filter(v => {
    if (!((!L || (L.pred(v) && L.preg.includes(v.preg))) && pasa(v.r) && (!q || norm(v.texto).includes(q)))) return false;
    const k = v.r.slice(0, IXP).join('|') + '|' + norm(v.texto).replace(/\W+/g, ' ').trim(), pr = visto[k];
    if (pr && !pr[v.preg]) return false;   // otra pregunta de la misma encuesta
    (visto[k] = pr || {})[v.preg] = 1;
    return true;
  });
}
// Media de la nota por proceso entre los comentarios de la nube; nbAj solo si hay más de un proceso con nota
function ajustarNotas(items) {
  const s = {}, n = {}; let sT = 0, nT = 0;
  items.forEach(v => { const x = notaCom(v), p = v.r[DI.proceso]; if (x == null) return; s[p] = (s[p] || 0) + x; n[p] = (n[p] || 0) + 1; sT += x; nT++; });
  const ps = Object.keys(n), proc = {};
  ps.forEach(p => { proc[p] = s[p] / n[p]; });
  nbAj = ps.length > 1 ? {base: sT / nT, proc} : null;
}
const etqNube = x => {
  if (!nbAj) return 'nota media ' + GRAF.num(x * 10, 1) + ' de 10';
  const d = (x - nbAj.base) * 10;
  return Math.abs(d) < .05 ? 'nota igual a la media de su proceso' : 'nota ' + GRAF.num(Math.abs(d), 1) + (d > 0 ? ' sobre' : ' bajo') + ' la media de su proceso';
};
function vVoz(p) {
  const items = C ? comNube() : null;
  if (items) ajustarNotas(items);
  const mixto = nbAj ? ` Con factura y pago y cobranza juntos, el color compara cada comentario con la nota media de su proceso (${PROC.map((e, i) => nbAj.proc[i] == null ? '' : `${e.toLowerCase()} ${GRAF.num(nbAj.proc[i] * 10, 1)} de 10`).filter(Boolean).join('; ')}), así no pesa de qué proceso viene.` : '';
  const grupos = [['Factura y pago', ['det', 'pro', 'fmal', 'fbien', 'fdif', 'ffac', 'vano', 'vasi', 'pmal', 'pbien', 'pdif', 'pfac', 'seg1', 'seg23', 'rap1', 'rap23']], ['Cobranza', ['imal', 'ibien', 'tmal', 'tbien', 'cnoc', 'cclar']]];
  p.innerHTML = `
    <section class="panel"><header><h2>Nube de comentarios</h2><span class="nota">${items ? f0(items.length) + ' comentarios' : 'Cargando…'}</span><p class="sub">${alcance()} · ${etqMeses(st.meses)}. Cada comentario se clasifica en uno o varios temas según lo que dice. La nota es la recomendación de 0 a 10 en factura y pago; cobranza no pregunta recomendación, así que ahí se usa la satisfacción con la información del cobro (1 a 5), llevada a 0 a 10.${mixto} Los comentarios los transcribe el analista durante la llamada; se quitan sus plantillas y los datos personales van tapados.</p></header>
      <div class="ex-herr"><input type="search" id="ex-q" placeholder="Buscar: factura, llamadas, Nequi, aumento…" value="${esc(exEst.q)}" aria-label="Buscar en comentarios">
        <label class="sr" for="ex-l">Tipo de comentario</label><select class="sel" id="ex-l"><option value="">Todos los comentarios</option>${grupos.map(([g, ls]) => `<optgroup label="${g}">${ls.map(l => `<option value="${l}"${exEst.lente === l ? ' selected' : ''}>${LENTES[l].t}</option>`).join('')}</optgroup>`).join('')}</select></div>
      ${items == null ? '<div class="nb-esq" aria-hidden="true"><div class="esqueleto"></div><div class="esqueleto"></div></div>' : '<div id="ex-nube"></div>'}</section>`;
  if (items) {
    const slot = p.querySelector('#ex-nube');
    if (!nubeEl) { nubeEl = document.createElement('div'); nubeEl.className = 'ex-nube'; }
    slot.parentNode.replaceChild(nubeEl, slot);
    NUBE.montar(nubeEl, {items, cfg: NB_CFG, estado: exEst.nube, etqNota: etqNube, chip: chipNota, meta: metaCom, quieto: nbQuieto});
  }
  const q = p.querySelector('#ex-q'); let t;
  q.oninput = () => { clearTimeout(t); t = setTimeout(() => { exEst.q = q.value.trim(); nbQuieto = true; try { pintarTab(''); } finally { nbQuieto = false; } const n = p.querySelector('#ex-q'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }, 250); };
  p.querySelector('#ex-l').onchange = e => { exEst.lente = e.target.value; pintarTab(); };
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
// solo: sin valor = anima toda la pestaña; un selector = anima solo ese panel; '' = no anima nada
function pintarTab(solo) {
  const p = document.getElementById('p-' + st.tab);
  VISTAS[st.tab](p);
  const proc = {factura: FP, pago: FP, cobranza: COB}[st.tab];
  if (proc != null) conProceso(proc, () => { montarRanking(p); montarCarrusel(p); dibujarLineas(p); });
  else { montarRanking(p); montarCarrusel(p); dibujarLineas(p); }
  p.querySelectorAll('[data-cajon]').forEach(b => { b.onclick = () => abrirCajon(b.dataset.cajon); });
  if (solo === undefined) { GRAF.animar(p); svgFx(p); }
  else if (solo) { const el = p.querySelector(solo); if (el) { GRAF.animar(el); svgFx(el); } }
  if (!C && st.tab !== 'calidad') cargarComentarios();
}

// ------------------------------------------------------------------ spotlight por indicador
const cajon = document.getElementById('cajon'), velo = document.getElementById('velo'); let volverA = null;
// quieto = repintar sin animar (p. ej. cuando llegan los comentarios con el cajón abierto)
function abrirCajon(k, foco, quieto) {
  if (foco !== false) volverA = document.activeElement;
  const ind = IND[k];
  conProceso(ind.proc, () => {
    const a = sumar(filas()), r = ind.calc(a), par = PAR[k];
    const col = l => { const ej = ejemplos(l, 4); return `<div class="col"><h4><i class="punto" style="background:${LENTES[l].malo ? 'var(--d-2)' : 'var(--d2)'}"></i>${LENTES[l].t}${ej ? ` <span class="nota">${f0(ej.total)}</span>` : ''}</h4>${ej == null ? '<div class="esqueleto"></div>' : ej.items.map(v => tarjeta(v)).join('') || '<p class="nota">Sin comentarios</p>'}</div>`; };
    cajon.dataset.k = k;
    cajon.innerHTML = `<header><span class="nota">${etqMeses(st.meses)} · ${PROC[ind.proc]} · ${st.negocio == null ? 'Hogar + Móvil' : NEG[st.negocio]}</span><h2 id="cajon-t" style="margin:0;font:900 22px var(--f-num)">${ind.nombre}</h2>
        <div class="big">${grandeAn(k, r)}</div><p class="def">${esc(ind.def)}</p><span class="nota">n ${r ? f0(r.n) : 0}${r ? ` · IC 95 % ±${f1(r.ic)}` : ''}</span>
        <button type="button" class="icono x" aria-label="Cerrar">${svgI('x')}</button></header>
      <div class="cuerpo"><div><h3>Mes a mes</h3><div class="chart" style="min-height:170px" data-lineas="${k}" data-modo="mes" id="cj-l"></div>${tablaPH('cj-l')}</div>
        <div><h3>Distribución</h3>${distribucion(k, grNeg())}</div>
        <div><h3>Lo que dicen</h3><div class="dos">${col(par[0])}${col(par[1])}</div>
        <button type="button" class="mas" id="cj-mas">Ver todos en Voces ›</button></div></div>`;
    cajon.hidden = velo.hidden = false;
    requestAnimationFrame(() => { cajon.classList.add('ver'); velo.classList.add('ver'); conProceso(ind.proc, () => dibujarLineas(cajon)); if (!quieto) { GRAF.animar(cajon, {inmediato: true, base: .15}); svgFx(cajon, {inmediato: true, base: .15}); } });
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
  // cambiar de tema no repite las animaciones (tampoco la entrada de la nube ni la de su pestaña)
  const h = document.documentElement; h.setAttribute('data-sin-anim', '');
  try { pintarTema(); pintarTab(''); } finally { h.removeAttribute('data-sin-anim'); }
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
// Al cambiar el tamaño se repinta en el estado final, sin repetir las animaciones
let rz; addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => {
  const h = document.documentElement; h.setAttribute('data-sin-anim', '');
  try { pintarTab(); if (cajon.dataset.k) conProceso(IND[cajon.dataset.k].proc, () => dibujarLineas(cajon)); } finally { h.removeAttribute('data-sin-anim'); }
}, 150); });
addEventListener('hashchange', () => { leerHash(); refrescar(); });
})();
