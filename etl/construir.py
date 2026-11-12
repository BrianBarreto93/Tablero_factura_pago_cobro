"""Orquesta el ETL: Oracle → limpieza → contrato de calidad → cubo + verbatims → data/periodos/AAAAMM.json
→ tablero/datos.js (todos los periodos guardados, codificados por diccionario).

Idempotente por periodo: cada corrida reemplaza solo los meses que encuentra en Oracle y conserva los demás
(si la tabla fuente se recarga por corte, la historia queda en data/periodos/). Si algún chequeo de nivel
«error» falla, no se escribe nada.

Uso:
    .venv/bin/python -m etl.construir                   # todos los periodos que haya en Oracle
    .venv/bin/python -m etl.construir --periodo 202610  # uno solo
    .venv/bin/python -m etl.construir --solo-ensamblar  # rehace datos.js con lo ya guardado (sin Oracle)
"""
import argparse
import json
import sys
from collections import Counter
from datetime import datetime

from etl import agregar, base, calidad, dolores, extraer, verbatims
from etl.config import (ABIERTAS, DIR_PERIODOS, ESCALA_3, ESCALAS, MOTIVOS, N_MINIMO, NEGOCIOS, NO_APLICA, PROCESOS,
                        REGIONES, SALIDA_JS, SIN_DATO, TABLA)
from etl.limpiar import limpiar

# Notas que viajan con cada comentario (para elegir ejemplos por indicador)
NOTAS = ["nps"] + list(ESCALAS) + ["va"] + list(ESCALA_3)


def _ahora():
    return datetime.now().strftime("%Y-%m-%d %H:%M")


def _anterior(p):
    a, m = int(p[:4]), int(p[4:])
    return f"{a - 1}12" if m == 1 else f"{a}{m - 1:02d}"


def procesar(periodos_pedidos=None):
    conn = extraer.conectar()
    calidad.esquema(extraer.columnas_tabla(conn))
    crudo = extraer.encuestas(conn)
    repetidas = extraer.cuentas_repetidas(conn)
    conn.close()

    d = limpiar(crudo)
    if d.periodo.isna().any():
        raise calidad.ErrorCalidad(f"{int(d.periodo.isna().sum())} encuestas sin FECHA_GESTION")
    carga = crudo.FECHA_CARGA.max()

    periodos = sorted(d.periodo.unique())
    if periodos_pedidos:
        faltan = set(periodos_pedidos) - set(periodos)
        if faltan:
            raise SystemExit(f"Oracle no tiene los periodos {sorted(faltan)}; tiene {periodos}")
        periodos = sorted(periodos_pedidos)

    DIR_PERIODOS.mkdir(parents=True, exist_ok=True)
    salidas, errores = {}, []
    for p in periodos:
        sel = d.periodo == p
        sub, crudo_p = d[sel], crudo[sel]
        prev = DIR_PERIODOS / f"{_anterior(p)}.json"
        n_ant = json.loads(prev.read_text())["n"] if prev.exists() else None
        rep = repetidas[repetidas.PERIODO == p]
        chk = calidad.evaluar(crudo_p, sub, rep, n_ant)

        actual = DIR_PERIODOS / f"{p}.json"
        if actual.exists():
            n_viejo = json.loads(actual.read_text())["n"]
            if n_viejo != len(sub):
                chk.append(calidad._chk("reemplazo", "aviso", "El corte reemplaza uno ya guardado",
                                        f"Antes {calidad.num(n_viejo)} encuestas, ahora {calidad.num(len(sub))}", len(sub)))

        vb, escaneo = verbatims.construir(crudo_p, sub, NOTAS)
        bf, esc_base = base.construir(crudo_p, sub)
        hall = calidad.escanear_pii(escaneo + esc_base)
        chk.append(calidad._chk("pii", "error" if hall else "ok", "Sin datos personales en los comentarios",
                                f"{len(hall)} hallazgos: {hall[:3]}" if hall else
                                f"{calidad.num(len(vb))} comentarios revisados: sin correos, cifras largas ni el nombre del cliente",
                                len(hall)))
        errores += [f"{p} · {c['titulo']}: {c['detalle']}" for c in chk if c["nivel"] == "error"]
        salidas[p] = {
            "periodo": p, "n": int(len(sub)), "generado": _ahora(),
            "fecha_carga": str(carga)[:16], "tabla": TABLA,
            "filas": agregar.cubo(sub, dolores.marcar(crudo_p, sub)), "verbatims": vb, "base": bf, "calidad": chk,
        }

    if errores:
        print("CORRIDA DETENIDA: el contrato de calidad falló. No se escribió nada.", file=sys.stderr)
        for e in errores:
            print("  ✗", e, file=sys.stderr)
        raise SystemExit(1)

    for p, s in salidas.items():
        (DIR_PERIODOS / f"{p}.json").write_text(json.dumps(s, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        avisos = [c["titulo"] for c in s["calidad"] if c["nivel"] == "aviso"]
        print(f"{p}: {s['n']} encuestas, {len(s['verbatims'])} comentarios, {len(avisos)} avisos")
    return list(salidas)


# --------------------------------------------------------------------------- ensamblado
def _orden(valores, peso, fijo=None):
    cola = [v for v in (SIN_DATO, NO_APLICA) if v in valores]
    vals = [v for v in valores if v not in cola]
    if fijo:
        vals = [v for v in fijo if v in vals] + sorted(v for v in vals if v not in fijo)
    else:
        vals = sorted(vals, key=lambda v: (-peso[v], v))
    return vals + cola


def ensamblar():
    archivos = sorted(DIR_PERIODOS.glob("*.json"))
    if not archivos:
        raise SystemExit("No hay periodos guardados en data/periodos/")
    per = [json.loads(a.read_text(encoding="utf-8")) for a in archivos]
    dims = agregar.DIMS

    peso = {k: Counter() for k in dims}
    for s in per:
        for f in s["filas"]:
            for k in dims:
                peso[k][f["d"][k]] += f["m"][0]
    fijos = {"proceso": PROCESOS, "negocio": NEGOCIOS, "region": REGIONES}
    dic = {}
    for k in dims:
        vals = list(peso[k])
        dic[k] = sorted(vals) if k in ("periodo", "semana") else _orden(vals, peso[k], fijos.get(k))
    idx = {k: {v: i for i, v in enumerate(dic[k])} for k in dims}

    # Motivos: «clave|texto», ordenados por frecuencia dentro de cada pregunta; los «Código n» y «Otro» al final
    pm = Counter()
    for s in per:
        for f in s["filas"]:
            for t, c in f.get("mt", {}).items():
                pm[t] += c
    mots = sorted(pm, key=lambda t: (list(MOTIVOS).index(t.split("|")[0]), t.split("|")[1].startswith("Código"),
                                     t.split("|")[1] == "Otro", -pm[t], t))
    midx = {t: i for i, t in enumerate(mots)}
    preguntas = list(ABIERTAS)

    cubo, mt, vb, dl = [], [], [], []
    dl_idx = {k: i for i, k in enumerate(dolores.CLAVES + ["alguno_fp", "alguno_cob"])}
    for s in per:
        for f in s["filas"]:
            r = len(cubo)
            cubo.append([idx[k][f["d"][k]] for k in dims] + f["m"])
            for t, c in f.get("mt", {}).items():
                mt.append([r, midx[t], c])
            for k, c in f.get("dl", {}).items():
                dl.append([r, dl_idx[k]] + c)
        for v in s["verbatims"]:
            vb.append([idx[k][v[k]] for k in dims] + [-1 if v[k] is None else v[k] for k in NOTAS]
                      + [preguntas.index(v["pregunta"]), v["texto"]])

    datos = {
        "generado": _ahora(), "tabla": per[-1]["tabla"], "n_minimo": N_MINIMO,
        "dims": dims, "valores": dic, "medidas": agregar.MEDIDAS,
        "escalas": {k: v[2] for k, v in ESCALAS.items()} | {k: v[1] for k, v in ESCALA_3.items()},
        "motivos": {"etiquetas": mots, "filas": mt},
        "preguntas": [ABIERTAS[q] for q in preguntas], "cod_preguntas": preguntas,
        "base": {"columnas": base.COLUMNAS, "filtro": base.FILTRO, "periodos": [s["periodo"] for s in per if s.get("base")]},
        "dolores": {"claves": list(dl_idx), "reglas": {k: list(v) for k, v in dolores.REGLAS.items()},
                    "medidas": agregar.MEDIDAS_DOLOR, "filas": dl},
        "cubo": cubo, "n_comentarios": len(vb),
        "periodos": {s["periodo"]: {"n": s["n"], "fecha_carga": s["fecha_carga"], "generado": s["generado"],
                                    "calidad": s["calidad"]} for s in per},
    }
    js = "window.DATOS=" + json.dumps(datos, ensure_ascii=False, separators=(",", ":")) + ";\n"
    SALIDA_JS.write_text(js, encoding="utf-8")
    # Los comentarios van aparte y el tablero los carga después de pintar
    vjs = ("window.COMENTARIOS={\"campos\":" + json.dumps(dims + NOTAS + ["pregunta", "texto"])
           + ",\"filas\":" + json.dumps(vb, ensure_ascii=False, separators=(",", ":")) + "};\n")
    (SALIDA_JS.parent / "comentarios.js").write_text(vjs, encoding="utf-8")
    # Base descargable: un archivo por mes; el tablero carga solo los meses que se van a descargar
    dir_base = SALIDA_JS.parent / "base"
    dir_base.mkdir(exist_ok=True)
    for f in dir_base.glob("*.js"):
        f.unlink()
    for s in per:
        (dir_base / f"{s['periodo']}.js").write_text(
            f"(window.BASE=window.BASE||{{}})[\"{s['periodo']}\"]=" + json.dumps(s.get("base", []), ensure_ascii=False, separators=(",", ":")) + ";\n",
            encoding="utf-8")
    print(f"datos.js: {len(cubo)} filas de cubo, {len(js) / 1024:.0f} KB · comentarios.js: {len(vb)} comentarios, "
          f"{len(vjs) / 1024:.0f} KB → {SALIDA_JS.parent}")
    return datos


def resumen(datos):
    """Indicadores por periodo y estudio, para cuadrar contra la fuente en consola."""
    M = {m: i + len(datos["dims"]) for i, m in enumerate(datos["medidas"])}
    D = {k: datos["dims"].index(k) for k in ("periodo", "proceso", "negocio")}
    acc = {}
    for r in datos["cubo"]:
        k = tuple(datos["valores"][d][r[i]] for d, i in D.items())
        a = acc.setdefault(k, Counter())
        for m, i in M.items():
            a[m] += r[i]
    t2 = lambda a, k: (a[f"{k}_4"] + a[f"{k}_5"]) / max(1, sum(a[f"{k}_{i}"] for i in range(1, 6))) * 100
    for (p, pr, ne), a in sorted(acc.items()):
        if pr == "Factura y pago":
            print(f"  {p} {pr} {ne:6s} n={a['n']:4d}  NPS={(a['prom'] - a['det']) / a['nps_val'] * 100:6.1f}  "
                  f"CSAT fact={t2(a, 'fsat'):5.1f}  CSAT pago={t2(a, 'psat'):5.1f}  CES fact={t2(a, 'ces1'):5.1f}  "
                  f"CES pago={t2(a, 'ces2'):5.1f}  Valores ok={a['va_si'] / (a['va_si'] + a['va_no']) * 100:5.1f}")
        else:
            print(f"  {p} {pr:14s} {ne:6s} n={a['n']:4d}  CSAT info={t2(a, 'cinf'):5.1f}  CSAT trato={t2(a, 'ctra'):5.1f}  "
                  f"Claridad={t2(a, 'clar'):5.1f}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--periodo", action="append", help="AAAAMM; se puede repetir")
    ap.add_argument("--solo-ensamblar", action="store_true")
    a = ap.parse_args()
    if not a.solo_ensamblar:
        try:
            procesar(a.periodo)
        except calidad.ErrorCalidad as e:
            print(f"CORRIDA DETENIDA: {e}", file=sys.stderr)
            raise SystemExit(1)
    resumen(ensamblar())


if __name__ == "__main__":
    main()
