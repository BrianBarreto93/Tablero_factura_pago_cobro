"""Base descargable: una fila por encuesta, sin datos personales (sin nombre, cédula, teléfono ni analista).
Los comentarios van con los mismos tapados que los verbatims. El tablero la filtra con los filtros activos.
"""
import pandas as pd

from etl.config import ABIERTAS, ESCALA_3, ESCALAS, MOTIVOS, SIN_DATO
from etl.limpiar import texto_opcion
from etl.verbatims import sin_plantilla, tapar, tokens_nombre, util

NOMBRES_MOTIVO = {"ces1": "Motivos: entender la factura", "va": "Motivos: valores que no cuadran", "ces2": "Motivos: pagar",
                  "seg": "Motivos: seguridad", "rap": "Motivos: rapidez"}
COLUMNAS = (["ID gestión", "Fecha gestión", "Mes", "Estudio", "Proceso", "Negocio", "Segmento", "Región", "Ciudad", "Casa de cobro",
             "Canal de comunicación", "Cierre de ciclo", "Recomendación (0-10)", "Grupo NPS"]
            + [f"{ESCALAS[k][2]} (1-5)" for k in ESCALAS]
            + ["Valores acordes al plan"] + [f"{v[1]} (1-3)" for v in ESCALA_3.values()]
            + [NOMBRES_MOTIVO[k] for k in MOTIVOS] + list(ABIERTAS.values()))
# Columnas con las que el tablero filtra la base (dimensión del cubo → columna)
FILTRO = {"periodo": "Mes", "proceso": "Proceso", "negocio": "Negocio", "segmento": "Segmento", "region": "Región", "casa": "Casa de cobro",
          "canal": "Canal de comunicación"}


def _n(v):
    return "" if v is None or pd.isna(v) else str(int(v))


def construir(crudo, d):
    """Devuelve (filas, escaneo): filas en el orden de COLUMNAS; escaneo = [(texto, nombres)] para calidad.escanear_pii."""
    filas, escaneo = [], []
    for i in d.index:
        nombres = tokens_nombre(crudo.at[i, "NOMBRE_CLIENTE"], crudo.at[i, "NOMBRE_ANALISTA"])
        com = []
        for q in ABIERTAS:
            t = texto_opcion(crudo.at[i, q])
            t = sin_plantilla(tapar(t, nombres)) if util(t) else ""
            if t:
                escaneo.append((t, nombres))
            com.append(t)
        p = d.at[i, "periodo"]
        va = d.at[i, "va"]
        fila = [
            texto_opcion(crudo.at[i, "ID_GESTION"]) or "",
            d.at[i, "fecha"].strftime("%Y-%m-%d") if pd.notna(d.at[i, "fecha"]) else "",
            f"{p[:4]}-{p[4:]}", d.at[i, "estudio"] or "", d.at[i, "proceso"] or "", d.at[i, "negocio"] or "",
            d.at[i, "segmento"] or "",
            d.at[i, "region"], d.at[i, "ciudad"], d.at[i, "casa"], d.at[i, "canal"], d.at[i, "ciclo"],
            _n(d.at[i, "nps"]), d.at[i, "grupo"] if isinstance(d.at[i, "grupo"], str) else "",
            *[_n(d.at[i, k]) for k in ESCALAS],
            "" if pd.isna(va) else ("Sí" if va == 1 else "No"),
            *[_n(d.at[i, k]) for k in ESCALA_3],
            *[", ".join(d.at[i, f"mot_{k}"]) for k in MOTIVOS],
            *com,
        ]
        filas.append([SIN_DATO if v is None else v for v in fila])
    return filas, escaneo
