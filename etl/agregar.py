"""Cubo de CONTEOS sumables. El navegador suma filas según los filtros y recién ahí calcula cada
indicador, así cualquier combinación de filtros da el valor ponderado correcto (nunca un promedio de %).
"""
import pandas as pd

from etl.config import ESCALA_3, ESCALAS, MOTIVOS

# Indicadores que se correlacionan con el NPS (solo factura y pago pregunta NPS). Se guardan sumas para la
# correlación de Pearson: n, Σx, Σy, Σx², Σy², Σxy; así se puede calcular con cualquier combinación de filtros.
CORR_NPS = ["fsat", "psat", "ces1", "ces2", "va", "seg", "rap"]

DIMS = ["periodo", "semana", "proceso", "negocio", "region", "casa", "canal"]

# Orden fijo de las medidas: el tablero las lee por nombre desde `medidas` en datos.js
MEDIDAS = (
    ["n", "nps_val", "prom", "det"]
    + [f"{k}_{i}" for k in ESCALAS for i in range(1, 6)]
    + ["va_si", "va_no", "prom_vasi", "det_vasi", "prom_vano", "det_vano"]
    + [f"{k}_{i}" for k in ESCALA_3 for i in range(1, 4)]
    + [f"mot_{k}" for k in MOTIVOS]          # encuestas con al menos un motivo registrado: base de los %
    + [f"r_{k}_{m}" for k in CORR_NPS for m in ("n", "x", "y", "xx", "yy", "xy")]
)


def _indicadoras(d):
    m = pd.DataFrame(index=d.index)
    m["n"] = 1
    m["nps_val"] = d.nps.notna().astype(int)
    m["prom"] = (d.nps >= 9).astype(int)
    m["det"] = (d.nps <= 6).astype(int)
    for k in ESCALAS:
        for i in range(1, 6):
            m[f"{k}_{i}"] = (d[k] == i).astype(int)
    m["va_si"] = (d.va == 1).astype(int)
    m["va_no"] = (d.va == 0).astype(int)
    m["prom_vasi"], m["det_vasi"] = m.prom * m.va_si, m.det * m.va_si
    m["prom_vano"], m["det_vano"] = m.prom * m.va_no, m.det * m.va_no
    for k in ESCALA_3:
        for i in range(1, 4):
            m[f"{k}_{i}"] = (d[k] == i).astype(int)
    for k in MOTIVOS:
        m[f"mot_{k}"] = d[f"mot_{k}"].map(bool).astype(int)
    for k in CORR_NPS:
        par = d.nps.notna() & d[k].notna()
        x, y = d[k].where(par, 0), d.nps.where(par, 0)
        m[f"r_{k}_n"], m[f"r_{k}_x"], m[f"r_{k}_y"] = par.astype(int), x, y
        m[f"r_{k}_xx"], m[f"r_{k}_yy"], m[f"r_{k}_xy"] = x * x, y * y, x * y
    return m[MEDIDAS].astype(int)


# Por dolor: encuestas, promotores, detractores, NPS válidas, satisfacción principal (fsat o cinf) top-2 y válidas,
# satisfacción secundaria (ctra en cobranza) top-2 y válidas. Las de «sin dolor» salen por resta en el tablero.
MEDIDAS_DOLOR = ["n", "prom", "det", "npsv", "a_ok", "a_val", "b_ok", "b_val"]


def _base_dolor(d):
    fp = d.proceso == "Factura y pago"
    a = d.fsat.where(fp, d.cinf)
    return pd.DataFrame({"n": 1, "prom": (d.nps >= 9).astype(int), "det": (d.nps <= 6).astype(int),
                         "npsv": d.nps.notna().astype(int), "a_ok": (a >= 4).astype(int), "a_val": a.notna().astype(int),
                         "b_ok": (d.ctra >= 4).astype(int), "b_val": d.ctra.notna().astype(int)}, index=d.index)


def _dolores(d, dl):
    """(DIMS) → {dolor: [conteos de MEDIDAS_DOLOR]}; solo combinaciones con al menos una encuesta."""
    base = _base_dolor(d)
    partes = []
    for k in dl.columns:
        sel = dl[k]
        if sel.any():
            partes.append(pd.concat([d.loc[sel, DIMS], base[sel]], axis=1).assign(dolor=k))
    if not partes:
        return {}
    g = pd.concat(partes).groupby(DIMS + ["dolor"], dropna=False, sort=False)[MEDIDAS_DOLOR].sum()
    out = {}
    for clave, fila in g.iterrows():
        out.setdefault(clave[:-1], {})[clave[-1]] = [int(v) for v in fila]
    return out


def cubo(d, dl=None):
    """Filas = combinaciones de DIMS presentes; medidas = conteos. Motivos (opción múltiple) y dolores en dicts aparte."""
    m = pd.concat([d[DIMS], _indicadoras(d)], axis=1)
    g = m.groupby(DIMS, dropna=False, sort=True)[MEDIDAS].sum().reset_index()

    partes = []
    for k in MOTIVOS:
        ex = d[DIMS + [f"mot_{k}"]].explode(f"mot_{k}").dropna(subset=[f"mot_{k}"])
        if len(ex):
            partes.append(ex.assign(mot=k + "|" + ex[f"mot_{k}"])[DIMS + ["mot"]])
    mot = pd.concat(partes).groupby(DIMS + ["mot"]).size() if partes else pd.Series(dtype=int)
    dol = _dolores(d, dl) if dl is not None else {}

    filas = []
    for r in g.itertuples(index=False):
        clave = tuple(getattr(r, k) for k in DIMS)
        fila = {"d": dict(zip(DIMS, clave)), "m": [int(getattr(r, k)) for k in MEDIDAS]}
        try:
            fila["mt"] = {str(k): int(v) for k, v in mot.loc[clave].items()}
        except KeyError:
            pass
        if clave in dol:
            fila["dl"] = dol[clave]
        filas.append(fila)
    return filas
