"""Dolores del cliente por encuesta.

Factura y pago: cuatro dolores salen de la respuesta cerrada de la propia encuesta (valores que no cuadran, factura
difícil de entender, pagar difícil, pago lento o inseguro) y tres de lo que el cliente cuenta (no le llega la factura,
la factura sube, el servicio falla). Cobranza: la claridad sale de la respuesta y el resto de los comentarios.
Las reglas de texto se calibraron leyendo los comentarios de sep–oct 2026; están aquí para revisarlas a la vista.
"""
import re

import pandas as pd

from etl.limpiar import texto_opcion

# clave: (proceso, momento, regla en palabras)
REGLAS = {
    "va_no": ("Factura y pago", "Factura", "Valores acordes al plan = No"),
    "entender": ("Factura y pago", "Factura", "Facilidad para entender la factura de 1 a 3"),
    "no_llega": ("Factura y pago", "Factura", "Comentario: no le llega la factura"),
    "sube": ("Factura y pago", "Factura", "Comentario: la factura sube o aumenta"),
    "pagar": ("Factura y pago", "Pago", "Facilidad para pagar de 1 a 3"),
    "lento": ("Factura y pago", "Pago", "Rapidez al pagar = 1 (la peor)"),
    "confianza": ("Factura y pago", "Pago", "Seguridad al pagar = 1 (la peor)"),
    "servicio": ("Factura y pago", "Servicio", "Comentario: el servicio falla (señal, internet, caídas)"),
    "insisten": ("Cobranza", "Contacto", "Comentario: llamadas o mensajes de cobro excesivos"),
    "maquina": ("Cobranza", "Contacto", "Comentario: cobra una grabación o una máquina"),
    "ya_pague": ("Cobranza", "Pago", "Comentario: le siguen cobrando aunque ya pagó"),
    "claridad": ("Cobranza", "Información", "Claridad de la información de 1 a 3"),
    "valor": ("Cobranza", "Factura", "Comentario: cobran un valor que no reconoce o que subió"),
}
CLAVES = list(REGLAS)
POR_PROCESO = {p: [k for k, r in REGLAS.items() if r[0] == p] for p in ("Factura y pago", "Cobranza")}

TEXTOS = {
    "Factura y pago": ["NPS_PROFUNDIZACION1", "CES1_CLASIFICACION1", "VALORES_ACORDES_CLASIFICACION1", "CES2_CLASIFICACION1",
                       "SEGURIDAD_CLASIFICACION1", "RAPIDEZ_CLASIFICACION1", "SUGERENCIA"],
    "Cobranza": ["CSAT_PROFUNDIZACION1", "CSAT1_PROFUNDIZACION1", "CLARIDAD_PROFUNDIZACION1", "SUGERENCIA"],
}
# Frases de plantilla de los analistas que no son quejas («el cliente menciona que no ha presentado fallas…»)
_NEGADO = re.compile(r"no (ha )?(presentado|presenta|tiene|ha tenido|tuvo|reporta)( ning[uú]n[ao]?s?)? "
                     r"(falla|inconveniente|problema|novedad)e?s?|sin (falla|inconveniente|problema)s?", re.I)
RX = {
    "no_llega": re.compile(r"no (le |me |les )?(est[aá] )?(llega|lleg[oó]|ha llegado|llegando|recibe|ha recibido)|nunca (le )?llega|"
                           r"llega (muy )?(tarde|encima|despu[eé]s)|no (le |me )?(envían|env[ií]an|mandan)", re.I),
    "sube": re.compile(r"\baument|\bsub(e|i[oó]|ieron|iendo|ido)\b|\bincrement|\balza\b|m[aá]s car[ao]|cada vez (m[aá]s|sube)", re.I),
    "servicio": re.compile(r"(mala|p[eé]sima|poca|sin|no hay|no tiene|no (le )?(llega|entra) la|falla la|deficiente|intermitente) se[ñn]al|"
                           r"se[ñn]al (es |esta |está |muy )?(mala|p[eé]sima|deficiente|intermitente|no )|intermiten|"
                           r"\bfallas?\b (en|del|de|con) (el |la )?(servicio|internet|se[ñn]al|red)|presenta(n)? (muchas |varias )?fallas|"
                           r"se cae|se caen|se va (la se[ñn]al|el internet|el servicio)|no funciona|lentitud|"
                           r"internet (es |esta |está |muy )?(malo|lento|deficiente|p[eé]simo)|"
                           r"servicio (es |ha sido |muy |est[aá] )?(malo|p[eé]simo|deficiente|intermitente)|mal servicio|servcio malo|"
                           r"(mala|sin|poca) cobertura", re.I),
    "insisten": re.compile(r"llamad|\bllam(an|aban|en|ando)\b|insist|acos|bombarde|cansones|intens|reiterativ|persecuci|persigu|"
                           r"(muchos|demasiados|excesivos) mensajes|cada rato|todo el d[ií]a|fastidi|hostig|cada \d+ minutos|"
                           r"veces (al|en el) d[ií]a", re.I),
    "maquina": re.compile(r"m[aá]quina|robot|\bbot\b|grabaci[oó]n|\bivr\b|autom[aá]tic|no se escucha|no hablan|nadie habla", re.I),
    "ya_pague": re.compile(r"ya (hab[ií]a )?(pag|realiz|cancel)|despu[eé]s de (pagar|realizar|hacer) (el )?pago|"
                           r"(pag[oó]|pagu[eé]|pagaba|paga) (y|pero|a tiempo)|aunque (pag|ya)|a pesar de (pagar|estar al d[ií]a)|"
                           r"(estoy|est[aá]|estar|estaba|ponerse|ponga) al d[ií]a|no (fueron|fue|se ven|se vio|se ve|se reflej)\w* reflejad|sigue(n)? (cobrando|llegando|apareciendo)", re.I),
    "valor": re.compile(r"cobr\w* (de )?m[aá]s|valor(es)? (diferente|distint|que no)|no (es|son) el mismo valor|no corresponde|"
                        r"\baument|\bsub(e|i[oó]|ieron)\b|\bincrement|\balza\b|no reconoc|no acept|tercer|suscripci|"
                        r"ofrec\w+ .{0,40}(otro|diferente|distint)", re.I),
}


def _texto(crudo, i, cols):
    partes = [texto_opcion(crudo.at[i, c]) for c in cols]
    return _NEGADO.sub(" ", " | ".join(p for p in partes if p))


def marcar(crudo, d):
    """DataFrame booleano (encuesta × dolor) + 'alguno_fp' / 'alguno_cob' (al menos un dolor del proceso)."""
    m = pd.DataFrame(False, index=d.index, columns=CLAVES)
    fp, cob = d.proceso == "Factura y pago", d.proceso == "Cobranza"
    m["va_no"] = fp & (d.va == 0)
    m["entender"] = fp & d.ces1.between(1, 3)
    m["pagar"] = fp & d.ces2.between(1, 3)
    m["lento"] = fp & (d.rap == 1)
    m["confianza"] = fp & (d.seg == 1)
    m["claridad"] = cob & d.clar.between(1, 3)
    for i in d.index:
        proc = d.at[i, "proceso"]
        if proc not in TEXTOS:
            continue
        t = _texto(crudo, i, TEXTOS[proc])
        if not t:
            continue
        for k in POR_PROCESO[proc]:
            if k in RX and RX[k].search(t):
                m.at[i, k] = True
    m["alguno_fp"] = m[POR_PROCESO["Factura y pago"]].any(axis=1)
    m["alguno_cob"] = m[POR_PROCESO["Cobranza"]].any(axis=1)
    return m
