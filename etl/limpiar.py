"""Normalización de la encuesta cruda. Una fila de entrada = una fila de salida (nunca descarta encuestas);
lo que no se puede interpretar queda en None / «Sin dato» y lo cuenta calidad.py.
"""
import re
import unicodedata

import pandas as pd

from etl.config import (CANAL_OTRO, CASAS, ESCALA_3, ESCALAS, ESTUDIOS, MOTIVOS, NO_APLICA, REGIONES, SIN_DATO)

_PREFIJO = re.compile(r"^[^\wÁÉÍÓÚÜÑáéíóúüñ¿¡]+")


def texto_opcion(v):
    """Limpia un texto de la fuente: '_x000D_', saltos, mojibake ('ANTIOQUÃ\\x8dA' → 'ANTIOQUÍA'). None si viene vacío."""
    if v is None or (isinstance(v, float) and pd.isna(v)):
        return None
    s = str(v).replace("_x000D_", " ")
    if "Ã" in s:  # UTF-8 leído como Latin-1 (o cp1252) en la carga
        for cod in ("latin-1", "cp1252"):
            try:
                s = s.encode(cod).decode("utf-8")
                break
            except (UnicodeEncodeError, UnicodeDecodeError):
                pass
    s = unicodedata.normalize("NFC", _PREFIJO.sub("", s))
    s = re.sub(r"\s+", " ", s).strip()
    return s or None


def a_entero(v, lo, hi):
    s = texto_opcion(v)
    if s is None or not re.fullmatch(r"-?\d+(\.0+)?", s):
        return None
    n = int(float(s))
    return n if lo <= n <= hi else None


def region(v, proceso):
    if proceso == "Cobranza":
        return NO_APLICA
    s = (texto_opcion(v) or "").upper()
    s = re.sub(r"^REGI[OÓ]N\s+", "", s).title()
    return s if s in REGIONES else SIN_DATO


def canal(v, proceso):
    if proceso != "Cobranza":
        return NO_APLICA
    s = texto_opcion(re.sub(r"[<>]", "", v) if isinstance(v, str) else v)
    if not s:
        return SIN_DATO
    if s.lower().startswith("otro"):
        return CANAL_OTRO
    if "IVR" in s:
        return "Mensaje de voz (IVR)"
    return s


def casa(v, proceso):
    if proceso != "Cobranza":
        return NO_APLICA
    s = (texto_opcion(v) or "").upper()
    return CASAS.get(s, SIN_DATO)


def si_no(v):
    s = (texto_opcion(v) or "").lower()
    return {"si": 1, "sí": 1, "no": 0}.get(s)


_SEP_MOTIVO = re.compile(r",\s*(?=[A-ZÁÉÍÓÚÑ])")


def motivos(v):
    """Opción múltiple: 'A, B' → ['A', 'B']. Hogar viene en código: '3' → ['Código 3 (sin catálogo)']."""
    s = texto_opcion(v)
    if not s:
        return []
    if re.fullmatch(r"[\d\s,;]+", s):
        return [f"Código {c} (sin catálogo)" for c in re.findall(r"\d+", s)]
    out = []
    for t in _SEP_MOTIVO.split(s):
        t = t.strip(" .")
        if t and t not in out:
            out.append(t)
    return out


def limpiar(crudo):
    d = pd.DataFrame(index=crudo.index)
    # Periodo = mes de FECHA_GESTION (día de la llamada). La columna MES no trae el año.
    fecha = pd.to_datetime(crudo.FECHA_GESTION, errors="coerce")
    d["fecha"] = fecha
    d["periodo"] = fecha.dt.strftime("%Y%m")
    d["semana"] = (fecha.dt.normalize() - pd.to_timedelta(fecha.dt.day_of_week, unit="D")).dt.strftime("%Y-%m-%d")
    d["estudio"] = crudo.ESTUDIO.map(texto_opcion)
    d["proceso"] = d.estudio.map(lambda e: ESTUDIOS.get(e, (None, None))[0])
    d["negocio"] = d.estudio.map(lambda e: ESTUDIOS.get(e, (None, None))[1])
    fp = d.proceso == "Factura y pago"

    d["nps"] = pd.to_numeric(crudo.NPS_NUM.map(lambda v: a_entero(v, 0, 10)), errors="coerce").where(fp)
    d["grupo"] = pd.cut(d.nps, [-1, 6, 8, 10], labels=["Detractor", "Pasivo", "Promotor"]).astype(object)
    d.loc[d.nps.isna(), "grupo"] = None
    for k, (col, proc, _) in ESCALAS.items():
        d[k] = pd.to_numeric(crudo[col].map(lambda v: a_entero(v, 1, 5)), errors="coerce").where(d.proceso == proc)
    for k, (col, _) in ESCALA_3.items():
        d[k] = pd.to_numeric(crudo[col].map(lambda v: a_entero(v, 1, 3)), errors="coerce").where(fp)
    d["va"] = pd.to_numeric(crudo.VALORES_ACORDES.map(si_no), errors="coerce").where(fp)

    d["region"] = [region(v, p) for v, p in zip(crudo.REGION, d.proceso)]
    d["ciudad"] = crudo.CIUDAD.map(lambda v: (texto_opcion(v) or "").title() or SIN_DATO)
    d["canal"] = [canal(v, p) for v, p in zip(crudo.CANAL_COMUNICACION, d.proceso)]
    d["casa"] = [casa(v, p) for v, p in zip(crudo.ENCUESTA, d.proceso)]
    d["ciclo"] = crudo.CIERRE_DE_CICLO.map(lambda v: {"SI": "Sí", "NO": "No"}.get((texto_opcion(v) or "").upper(), SIN_DATO))
    for k, col in MOTIVOS.items():
        d[f"mot_{k}"] = crudo[col].map(motivos).where(fp, None).map(lambda x: x if isinstance(x, list) else [])
    return d
