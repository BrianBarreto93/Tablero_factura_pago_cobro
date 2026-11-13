"""Fuente BRM → tabla del tablero (pedido del usuario 2026-11-13).

El proveedor alimenta cada mes dos tablas de Oracle:
- TBL_ENCUESTAS_BRM: una fila por encuesta (UNIQUEID) y pregunta (AGRUPACION), con la nota en RESPUESTAS y el
  motivo o el comentario en PROFUNDIZACION. Se filtra por ESTUDIO_ESCRITO = los cuatro estudios de factura y pago
  (Fijo, Móvil, Fijo PYME y Móvil PYME).
- TBL_CLIENTES_BRM: una fila por encuesta con los datos del cliente. De aquí sale FECHA_REGISTRADA, que define el
  mes del tablero, además de región, ciudad, documento del cliente (REGISTROID = el ID_CLIENTE que ya traía la
  tabla; CUENTA viene vacía), teléfono, nombre, base y analista. El nombre y el analista solo sirven para taparlos
  en los comentarios; no salen del ETL.

Este módulo pasa las encuestas de formato largo a una fila por encuesta con el formato de
INVITADO_15.TBL_ENC_FACTURA_PAGO_COBRO (la tabla que lee el tablero) y la sincroniza:
- Encuesta que no está en la tabla → INSERT. Todas las filas del lote llevan el mismo FECHA_CARGA y
  ARCHIVO_ORIGEN = 'TBL_ENCUESTAS_BRM', así se identifican y se pueden revertir.
- Encuesta que ya está → se compara lo que trae BRM (notas, motivos, comentarios, fecha, región, ciudad, estudio).
  Si algo cambió, BRM manda: UPDATE de esas columnas, guardando antes el valor viejo en data/cargas/.
  Las columnas que BRM no trae (cédula, cierre de ciclo, el texto de «otro motivo») se conservan.
- Cobranza no se toca: no viene en el filtro de estudios.
Todo va en una transacción; si los conteos no cuadran, ROLLBACK.

Uso:
    .venv/bin/python -m etl.cargar_brm             # simula: arma, compara y cuenta; no escribe
    .venv/bin/python -m etl.cargar_brm --escribir  # escribe y hace COMMIT (etl.construir lo llama solo)
"""
import argparse
import json
import re
from datetime import datetime

import oracledb
import pandas as pd

from etl import extraer
from etl.config import (BRM_CLIENTES, BRM_ENCUESTAS, BRM_ESTUDIOS, BRM_ORIGEN, BRM_PREGUNTAS, BRM_VALORES_ACORDES,
                        GRUPOS_FUENTE, RAIZ, TABLA)

MESES = ["ENE", "FEB", "MAR", "ABR", "MAY", "JUN", "JUL", "AGO", "SEP", "OCT", "NOV", "DIC"]
DIR_CARGAS = RAIZ / "data" / "cargas"   # fuera de git: los valores viejos pueden traer comentarios con nombres

NOTAS = [v[0] for v in BRM_PREGUNTAS.values() if v[0]]
PROFUNDIZACIONES = [v[1] for v in BRM_PREGUNTAS.values() if v[1]]
GRUPOS = list(GRUPOS_FUENTE)   # NPS_GRUPO, CSAT_GRUPO… se derivan de la nota
# Lo que BRM trae y se compara contra la tabla (lo demás de la fila nueva solo se usa al insertar)
COMPARAR = ["ESTUDIO", "FECHA_GESTION", "REGION", "CIUDAD", "ID_CLIENTE"] + NOTAS + PROFUNDIZACIONES
# Columnas que escribe una fila nueva (FECHA_CARGA se agrega aparte)
INSERTAR = (["ID_GESTION", "ESTUDIO", "TIPO_ENCUESTA", "NOMBRE_ESTUDIO", "MES", "FECHA_GESTION", "HORA_GESTION",
             "NOMBRE_ANALISTA", "NOMBRE_CLIENTE", "TIPO_ID", "ID_CLIENTE", "NUMERO_CONTACTO", "REGION", "CIUDAD",
             "ARCHIVO_ORIGEN"] + NOTAS + [g for g in GRUPOS if GRUPOS_FUENTE[g][0] in NOTAS] + PROFUNDIZACIONES)


def llave_pregunta(s):
    """'CES – ENTENDER EL CONTENIDO…' → 'CES - ENTENDER EL CONTENIDO…' (guion largo, espacios y mayúsculas)."""
    s = re.sub(r"[‐-―−]", "-", str(s or ""))
    return re.sub(r"\s+", " ", s).strip().upper()


def _txt(v):
    if v is None or (isinstance(v, float) and pd.isna(v)):
        return None
    s = str(v)
    return s if s.strip() else None


def _igual_texto(a, b):
    """Compara sin espacios, saltos ni '_x000D_': BRM pega los renglones que el Excel traía separados."""
    f = lambda v: re.sub(r"\s+", "", (_txt(v) or "").replace("_x000D_", ""))
    return f(a) == f(b)


def _igual(col, a, b):
    if col == "FECHA_GESTION":
        return pd.Timestamp(a).normalize() == pd.Timestamp(b).normalize() if pd.notna(a) and pd.notna(b) else pd.isna(a) and pd.isna(b)
    return _igual_texto(a, b)


def _grupo(gcol, nota):
    ncol, grupos = GRUPOS_FUENTE[gcol]
    try:
        n = int(float(nota))
    except (TypeError, ValueError):
        return None
    for nombre, (lo, hi) in grupos.items():
        if lo <= n <= hi:
            return nombre
    return None


def recortar(s, maximo=4000):
    """VARCHAR2(4000) cuenta bytes: recorta en UTF-8 sin partir caracteres."""
    if s is None or len(s.encode("utf-8")) <= maximo:
        return s
    return s.encode("utf-8")[:maximo - 3].decode("utf-8", "ignore") + "…"


# --------------------------------------------------------------------------- lectura
def _binds():
    return ", ".join(f":e{i}" for i in range(len(BRM_ESTUDIOS))), {f"e{i}": e for i, e in enumerate(BRM_ESTUDIOS)}


def leer(conn):
    """(encuestas en formato largo, clientes) de los cuatro estudios de factura y pago."""
    ph, b = _binds()
    enc = extraer._df(conn, f"""
        SELECT UNIQUEID, ESTUDIO_ESCRITO, AGRUPACION, RESPUESTAS, PROFUNDIZACION
          FROM {BRM_ENCUESTAS} WHERE ESTUDIO_ESCRITO IN ({ph})""", b)
    cli = extraer._df(conn, f"""
        SELECT UNIQUEID, ESTUDIO, BASE, FECHA_REGISTRADA, REGION, CIUDAD, USUARIO_CONSULTOR,
               NOMBRE, REGISTROID, TELEFONO_1
          FROM {BRM_CLIENTES}
         WHERE UNIQUEID IN (SELECT UNIQUEID FROM {BRM_ENCUESTAS} WHERE ESTUDIO_ESCRITO IN ({ph}))""", b)
    return enc, cli


def armar(enc, cli):
    """Una fila por encuesta con el formato de TABLA. Devuelve (filas, avisos)."""
    avisos = []
    enc = enc.assign(PREG=enc.AGRUPACION.map(llave_pregunta))
    raras = sorted(set(enc.PREG) - set(BRM_PREGUNTAS))
    if raras:
        raise SystemExit(f"Preguntas de BRM sin columna en la tabla: {raras}. Agregarlas a BRM_PREGUNTAS en etl/config.py")
    dup = enc.duplicated(["UNIQUEID", "PREG"])
    if dup.any():
        raise SystemExit(f"{int(dup.sum())} respuestas repetidas (misma encuesta y pregunta) en {BRM_ENCUESTAS}")
    est = enc.groupby("UNIQUEID").ESTUDIO_ESCRITO.agg(lambda s: s.unique().tolist())
    if (est.map(len) > 1).any():
        raise SystemExit("Hay encuestas con más de un ESTUDIO_ESCRITO")

    cli = cli.drop_duplicates()
    if cli.UNIQUEID.duplicated().any():
        raise SystemExit(f"{int(cli.UNIQUEID.duplicated().sum())} encuestas con más de una fila distinta en {BRM_CLIENTES}")
    cli = cli.set_index("UNIQUEID")
    sin_cliente = sorted(set(est.index) - set(cli.index))
    if sin_cliente:
        avisos.append(f"{len(sin_cliente)} encuestas sin fila en {BRM_CLIENTES} (sin fecha): no se cargan todavía")

    notas = enc.pivot(index="UNIQUEID", columns="PREG", values="RESPUESTAS")
    prof = enc.pivot(index="UNIQUEID", columns="PREG", values="PROFUNDIZACION")
    filas = []
    for uid in sorted(set(est.index) & set(cli.index)):
        c = cli.loc[uid]
        estudio = est[uid][0]
        if _txt(c.ESTUDIO) and c.ESTUDIO != estudio:
            avisos.append(f"{uid}: ESTUDIO del cliente «{c.ESTUDIO}» distinto al de la encuesta «{estudio}»")
        # Formato fijo: si el proveedor cambia a dd/mm, la fila cae en «ilegible» en vez de cambiar de mes sin aviso
        fecha = pd.to_datetime(c.FECHA_REGISTRADA, format="%Y-%m-%d %H:%M:%S", errors="coerce")
        if pd.isna(fecha):
            avisos.append(f"{uid}: FECHA_REGISTRADA ilegible ({c.FECHA_REGISTRADA!r}): no se carga")
            continue
        f = {"ID_GESTION": str(int(uid)), "ESTUDIO": estudio, "TIPO_ENCUESTA": estudio, "NOMBRE_ESTUDIO": _txt(c.BASE),
             "MES": MESES[fecha.month - 1], "FECHA_GESTION": fecha.normalize().to_pydatetime(),
             "HORA_GESTION": fecha.strftime("%H:%M:%S"), "NOMBRE_ANALISTA": _txt(c.USUARIO_CONSULTOR),
             "NOMBRE_CLIENTE": _txt(c.NOMBRE), "TIPO_ID": None,   # BRM no dice si es cédula o NIT
             "ID_CLIENTE": None if pd.isna(c.REGISTROID) else str(int(c.REGISTROID)), "NUMERO_CONTACTO": _txt(c.TELEFONO_1),
             "REGION": _txt(c.REGION), "CIUDAD": _txt(c.CIUDAD), "ARCHIVO_ORIGEN": BRM_ORIGEN}
        for preg, (ncol, pcol) in BRM_PREGUNTAS.items():
            if ncol:
                v = _txt(notas.at[uid, preg]) if preg in notas.columns else None
                if ncol == "VALORES_ACORDES" and v is not None:
                    v = BRM_VALORES_ACORDES.get(v.strip(), v)   # código raro → pasa tal cual y lo frena calidad.py
                f[ncol] = v.strip() if v else None
            if pcol:
                f[pcol] = recortar(_txt(prof.at[uid, preg]) if preg in prof.columns else None)
        for g in GRUPOS:
            if GRUPOS_FUENTE[g][0] in f:
                f[g] = _grupo(g, f[GRUPOS_FUENTE[g][0]])
        filas.append(f)
    return pd.DataFrame(filas, columns=INSERTAR), avisos


# --------------------------------------------------------------------------- comparación y escritura
def _nulo(v):
    """NaN/NaT de pandas → None (Oracle no acepta NaN en un bind de texto). Timestamp → datetime."""
    if v is None or (not isinstance(v, (str, list)) and pd.isna(v)):
        return None
    return v.to_pydatetime() if isinstance(v, pd.Timestamp) else v


def comparar(nuevas, tabla):
    """(por insertar, cambios) — cambios = [(ID_GESTION, columna, valor en tabla, valor BRM)]."""
    t = tabla.set_index("ID_GESTION")
    ins = nuevas[~nuevas.ID_GESTION.isin(t.index)]
    cambios = []
    for r in nuevas[nuevas.ID_GESTION.isin(t.index)].itertuples(index=False):
        viejo = t.loc[r.ID_GESTION]
        for col in COMPARAR:
            a, b = _nulo(viejo[col]), _nulo(getattr(r, col))
            if not _igual(col, a, b):
                cambios.append((r.ID_GESTION, col, a, b))
    return ins, cambios


def validar(nuevas):
    """Contrato de calidad sobre lo que va a quedar en la tabla, ANTES de escribir: si una nota se sale de escala o
    llega un estudio raro, no se escribe nada (si no, la fila mala quedaría en Oracle y frenaría cada corrida)."""
    from etl import calidad
    from etl.config import COLUMNAS, COLUMNAS_SOLO_LIMPIEZA
    from etl.limpiar import limpiar
    crudo = nuevas.reindex(columns=COLUMNAS + COLUMNAS_SOLO_LIMPIEZA)
    malos = [f"{c['titulo']}: {c['detalle']}" for c in calidad.evaluar(crudo, limpiar(crudo)) if c["nivel"] == "error"]
    if malos:
        raise SystemExit("BRM trae datos que no pasan el contrato de calidad; no se escribió nada en la tabla:\n  "
                         + "\n  ".join(malos))


def _jsonable(v):
    if v is None or (isinstance(v, float) and pd.isna(v)):
        return None
    return str(v)


def sincronizar(conn=None, escribir=False):
    """Arma las filas desde BRM y las deja en TABLA. Devuelve un resumen (dict)."""
    propia = conn is None
    conn = conn or extraer.conectar()
    enc, cli = leer(conn)
    nuevas, avisos = armar(enc, cli)
    validar(nuevas)
    ph, b = _binds()
    tabla = extraer._df(conn, f"SELECT ID_GESTION, {', '.join(COMPARAR)} FROM {TABLA} WHERE ESTUDIO IN ({ph})", b)
    if tabla.ID_GESTION.duplicated().any():
        raise SystemExit(f"{TABLA} tiene ID_GESTION repetidos en factura y pago; revisar antes de sincronizar")
    ins, cambios = comparar(nuevas, tabla)
    solo_tabla = sorted(set(tabla.ID_GESTION) - set(nuevas.ID_GESTION))
    if solo_tabla:
        avisos.append(f"{len(solo_tabla)} encuestas de factura y pago están en la tabla y no en BRM (se conservan)")

    por_mes = (ins.assign(m=pd.to_datetime(ins.FECHA_GESTION).dt.strftime("%Y%m"))
               .groupby(["m", "ESTUDIO"]).size().rename("n").reset_index().values.tolist())
    res = {"brm_encuestas": int(len(nuevas)), "ya_en_tabla": int(len(nuevas) - len(ins)), "insertar": int(len(ins)),
           "insertar_por_mes": [[m, e, int(n)] for m, e, n in por_mes],
           "actualizar": len({c[0] for c in cambios}), "celdas_cambiadas": len(cambios), "avisos": avisos}
    print(f"BRM: {res['brm_encuestas']} encuestas de factura y pago · ya en la tabla: {res['ya_en_tabla']} · "
          f"por insertar: {res['insertar']} · por actualizar: {res['actualizar']} ({len(cambios)} celdas)")
    for m, e, n in res["insertar_por_mes"]:
        print(f"   + {m} {e}: {n}")
    for a in avisos:
        print("   ! " + a)
    if not escribir or (not len(ins) and not cambios):
        if not escribir:
            print("Simulación: no se escribió nada. Agrega --escribir para cargar.")
        if propia:
            conn.close()
        return res

    lote = datetime.now().replace(microsecond=0)
    antes = int(extraer._df(conn, f"SELECT COUNT(*) N FROM {TABLA}").N[0])
    try:
        with conn.cursor() as cur:
            if len(ins):
                cols = INSERTAR + ["FECHA_CARGA"]
                sql = f"INSERT INTO {TABLA} ({', '.join(cols)}) VALUES ({', '.join(':' + str(i + 1) for i in range(len(cols)))})"
                cur.setinputsizes(*[oracledb.DB_TYPE_DATE if c in ("FECHA_GESTION", "FECHA_CARGA") else 4000 for c in cols])
                datos = [[None if (v is None or (isinstance(v, float) and pd.isna(v))) else v for v in fila] + [lote]
                         for fila in ins[INSERTAR].itertuples(index=False, name=None)]
                for i in range(0, len(datos), 1000):
                    cur.executemany(sql, datos[i:i + 1000])
            por_id = {}
            for i, col, _, nuevo in cambios:
                por_id.setdefault(i, {})[col] = _nulo(nuevo)
            fila_brm = nuevas.set_index("ID_GESTION")
            for i, cols in por_id.items():
                # Si cambia una nota, su grupo se recalcula; MES, hora y tipo de encuesta siguen a la fecha y al estudio
                for g, (ncol, _) in GRUPOS_FUENTE.items():
                    if ncol in cols:
                        cols[g] = _grupo(g, cols[ncol])
                for c in ("MES", "HORA_GESTION", "TIPO_ENCUESTA"):
                    cols[c] = _nulo(fila_brm.at[i, c])
                sets = ", ".join(f"{c} = :{c}" for c in cols)
                cur.execute(f"UPDATE {TABLA} SET {sets} WHERE ID_GESTION = :id_ AND ESTUDIO IN ({ph})",
                            {**cols, "id_": i, **b})
        despues = int(extraer._df(conn, f"SELECT COUNT(*) N FROM {TABLA}").N[0])
        if despues - antes != len(ins):
            raise RuntimeError(f"Conteo inesperado ({antes} → {despues}, se esperaban {len(ins)} nuevas)")
    except Exception:
        conn.rollback()
        raise
    conn.commit()

    DIR_CARGAS.mkdir(parents=True, exist_ok=True)
    reg = DIR_CARGAS / f"brm_{lote:%Y%m%d_%H%M%S}.json"
    res.update({"lote_fecha_carga": str(lote), "tabla": TABLA, "antes": antes, "despues": despues,
                "ids_insertados": ins.ID_GESTION.tolist(),
                "cambios": [[i, c, _jsonable(a), _jsonable(n)] for i, c, a, n in cambios],
                "revertir_insertados": f"DELETE FROM {TABLA} WHERE ARCHIVO_ORIGEN = '{BRM_ORIGEN}' AND "
                                       f"FECHA_CARGA = TO_DATE('{lote}', 'YYYY-MM-DD HH24:MI:SS')",
                "revertir_cambios": "UPDATE de cada [ID_GESTION, columna, valor viejo] de «cambios»"})
    reg.write_text(json.dumps(res, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"COMMIT: {antes} → {despues} filas en {TABLA}. Lote FECHA_CARGA = {lote}. Registro: {reg.relative_to(RAIZ)}")
    if propia:
        conn.close()
    return res


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--escribir", action="store_true")
    sincronizar(escribir=ap.parse_args().escribir)


if __name__ == "__main__":
    main()
