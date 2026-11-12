"""Contrato de datos. Cada chequeo devuelve {id, nivel, titulo, detalle, n}.
nivel = 'error' → la corrida se detiene y no se publica; 'aviso' → se muestra en la pestaña Calidad; 'ok'.
"""
import re

import pandas as pd

from etl.config import (COLUMNAS, ESTUDIOS, GRUPOS_FUENTE, MOTIVOS, REQUERIDOS, SIN_DATO,
                        VARIACION_N_AVISO)
from etl.limpiar import a_entero, texto_opcion


class ErrorCalidad(RuntimeError):
    pass


def _chk(id_, nivel, titulo, detalle, n=0):
    return {"id": id_, "nivel": nivel, "titulo": titulo, "detalle": detalle, "n": int(n)}


def num(n):
    return f"{int(n):,}".replace(",", ".")


def _pct(a, b):
    if not b:
        return "0"
    return f"{num(a)} de {num(b)} (" + f"{a / b * 100:.1f}".replace(".", ",") + " %)"


def esquema(columnas_oracle):
    faltan = sorted(set(COLUMNAS) - set(columnas_oracle))
    if faltan:
        raise ErrorCalidad(f"Faltan columnas en la tabla fuente: {', '.join(faltan)}")


def evaluar(crudo, d, repetidas=None, n_anterior=None):
    """Chequeos de UN periodo (crudo y d ya filtrados a ese periodo)."""
    n = len(d)
    out = []

    dup = int(crudo.ID_GESTION.duplicated().sum())
    out.append(_chk("id_unico", "error" if dup else "ok", "Una fila por encuesta (ID_GESTION)",
                    f"{dup} ID_GESTION repetidos" if dup else "Sin repetidos", dup))

    fuera = int(d.proceso.isna().sum())
    out.append(_chk("estudio", "error" if fuera else "ok", "ESTUDIO es uno de los cuatro conocidos",
                    f"{fuera} filas con otro estudio: {sorted(crudo.ESTUDIO[d.proceso.isna()].astype(str).unique())[:3]}"
                    if fuera else ", ".join(f"{e}: {num((d.estudio == e).sum())}" for e in ESTUDIOS), fuera))

    # Notas dentro de su escala: un valor que no es número o se sale del rango detiene la corrida
    malos = []
    for col, lo, hi in [("NPS_NUM", 0, 10), ("CSAT_NUM", 1, 5), ("CSAT1_NUM", 1, 5), ("CES1_NUM", 1, 5), ("CES2_NUM", 1, 5),
                        ("CLARIDAD_NUM", 1, 5), ("SEGURIDAD", 1, 3), ("RAPIDEZ", 1, 3)]:
        v = crudo[col].map(texto_opcion)
        k = int((v.notna() & crudo[col].map(lambda x: a_entero(x, lo, hi)).isna()).sum())
        if k:
            malos.append(f"{col}: {k}")
    va = crudo.VALORES_ACORDES.map(texto_opcion)
    k = int((va.notna() & ~va.str.lower().isin(["si", "sí", "no"])).sum())
    if k:
        malos.append(f"VALORES_ACORDES: {k}")
    out.append(_chk("escalas", "error" if malos else "ok", "Notas dentro de su escala",
                    "Fuera de rango o no numéricas: " + "; ".join(malos) if malos
                    else "NPS 0–10, satisfacción, CES y claridad 1–5, seguridad y rapidez 1–3, valores Sí/No", len(malos)))

    # El grupo que trae la fuente coincide con la nota
    inc = []
    for gcol, (ncol, grupos) in GRUPOS_FUENTE.items():
        nota = crudo[ncol].map(lambda x: a_entero(x, 0, 10))
        g = crudo[gcol].map(texto_opcion)
        for nombre, (lo, hi) in grupos.items():
            k = int(((g == nombre) & ~nota.between(lo, hi)).sum())
            if k:
                inc.append(f"{gcol} {nombre}: {k}")
    out.append(_chk("grupos", "error" if inc else "ok", "Grupos de la fuente coinciden con la nota",
                    "; ".join(inc) if inc else "Satisfecho = 4–5, Uso fácil = 4–5, Muy clara = 4–5, Promotores = 9–10", len(inc)))

    # Cada proceso trae sus preguntas
    falt = []
    for proc, cols in REQUERIDOS.items():
        sel = d.proceso == proc
        if not sel.any():
            continue
        for c in cols:
            k = int(crudo.loc[sel, c].map(texto_opcion).isna().sum())
            if k > 0.02 * sel.sum():
                falt.append(f"{proc} · {c}: {_pct(k, sel.sum())}")
    out.append(_chk("requeridos", "aviso" if falt else "ok", "Cada proceso trae sus preguntas",
                    "Vacías en más del 2 %: " + "; ".join(falt) if falt else "Todas las preguntas de cada proceso vienen llenas",
                    len(falt)))

    # ---- avisos
    mes_txt = crudo.MES.map(texto_opcion).str.upper()
    mes_fecha = d.fecha.dt.month.map({9: "SEP", 10: "OCT", 11: "NOV", 12: "DIC", 1: "ENE", 2: "FEB", 3: "MAR",
                                      4: "ABR", 5: "MAY", 6: "JUN", 7: "JUL", 8: "AGO"})
    k = int((mes_txt.notna() & (mes_txt != mes_fecha)).sum())
    out.append(_chk("mes", "aviso" if k else "ok", "Columna MES coincide con la fecha de gestión",
                    f"{k} encuestas con MES distinto al mes de FECHA_GESTION. El tablero usa la fecha." if k
                    else "Coincide en todas", k))

    fp = d.proceso == "Factura y pago"
    k = int((fp & (d.region == SIN_DATO)).sum())
    out.append(_chk("region_sin_dato", "aviso" if k else "ok", "Región sin dato (factura y pago)", _pct(k, fp.sum()), k))
    mov = fp & (d.negocio == "Móvil")
    if mov.any() and not (mov & (d.region == "Centro")).any():
        out.append(_chk("region_movil", "aviso", "Móvil sin región Centro",
                        "Factura y pago Móvil usa cuatro regiones: Bogotá y Cundinamarca vienen en Oriente. "
                        "Comparar regiones entre Hogar y Móvil con cuidado.", int(mov.sum())))
    cob = d.proceso == "Cobranza"
    k = int((cob & (d.casa == SIN_DATO)).sum())
    out.append(_chk("casa_sin_dato", "aviso" if k else "ok", "Casa de cobro sin dato (cobranza)",
                    f"{_pct(k, cob.sum())}. La columna ENCUESTA solo viene llena en parte de las bases de cobranza.", k))

    cod = sum(int(d[f"mot_{m}"].map(lambda x: any(t.startswith("Código ") for t in x)).sum()) for m in MOTIVOS)
    out.append(_chk("motivos_codigo", "aviso" if cod else "ok", "Motivos de Hogar en código",
                    f"{num(cod)} respuestas de motivo llegan como número (1, 2, 3… 94) en vez de texto, todas de Hogar. "
                    "Sin el catálogo de opciones se muestran como «Código n». Móvil sí trae el texto." if cod
                    else "Todos los motivos vienen en texto", cod))

    if repetidas is not None and len(repetidas):
        extra = int((repetidas.ENCUESTAS - repetidas.CUENTAS).sum())
        out.append(_chk("clientes_repetidos", "aviso" if extra else "ok", "Clientes con más de una encuesta",
                        f"{extra} encuestas de más sobre el mismo cliente y estudio. Se conservan: la unidad del "
                        "tablero es la encuesta." if extra else "Un cliente por encuesta en cada estudio", extra))

    bases = sorted(crudo.NOMBRE_ESTUDIO.map(texto_opcion).dropna().unique())
    out.append(_chk("bases", "ok", "Bases cargadas", f"{len(bases)} bases: " + ", ".join(re.sub(r"^Base_", "", b) for b in bases),
                    len(bases)))

    if n_anterior:
        var = n / n_anterior - 1
        nivel = "aviso" if abs(var) > VARIACION_N_AVISO else "ok"
        out.append(_chk("volumen", nivel, "Volumen frente al mes anterior",
                        f"{num(n)} encuestas vs {num(n_anterior)} ({var * 100:+.0f} %)", n))
    return out


# ------------------------------------------------------------------ escaneo de datos personales en la salida
_CORREO = re.compile(r"[\w.+-]+@[\w-]+\.[\w.]+")
_DIGITOS = re.compile(r"\d[\d .-]{5,}\d")  # 7+ dígitos, aunque vengan con espacios o guiones


def escanear_pii(items):
    """items = [(texto, nombres_del_cliente), …]. Devuelve los hallazgos (lista vacía = limpio)."""
    hall = []
    for t, nombres in items:
        if not t:
            continue
        if _CORREO.search(t):
            hall.append(("correo", t[:60]))
        if any(sum(c.isdigit() for c in m.group()) >= 7 for m in _DIGITOS.finditer(t)):
            hall.append(("número largo", t[:60]))
        for nom in nombres or ():
            if nom and len(nom) >= 3 and re.search(rf"\b{re.escape(nom)}\b", t, re.I):
                hall.append(("nombre del cliente", t[:60]))
                break
    return hall
