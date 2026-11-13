"""Pruebas del ETL: limpieza, contrato de calidad, tapado de datos personales, cubo y cifras contra Oracle."""
import json
import re

import pandas as pd
import pytest

from etl import agregar, calidad, cargar_brm, dolores, verbatims
from etl.config import ABIERTAS, COLUMNAS, COLUMNAS_SOLO_LIMPIEZA, RAIZ
from etl.limpiar import canal, limpiar, motivos, region, texto_opcion


def _crudo(n=40, **over):
    """Encuestas sintéticas: mitad factura y pago Fijo, mitad cobranza Móvil."""
    filas = []
    for i in range(n):
        fp = i % 2 == 0
        f = {c: None for c in COLUMNAS + COLUMNAS_SOLO_LIMPIEZA}
        f.update({"ID_GESTION": str(1000 + i), "ESTUDIO": "Factura y Pago Fijo" if fp else "Cobranza Móvil",
                  "NOMBRE_ESTUDIO": "Base_x", "MES": "OCT", "FECHA_GESTION": pd.Timestamp("2026-10-15"),
                  "FECHA_CARGA": pd.Timestamp("2026-11-12"), "CSAT_NUM": str(1 + i % 5), "CSAT1_NUM": "5",
                  "NOMBRE_CLIENTE": "MARIA PEREZ GOMEZ", "NOMBRE_ANALISTA": "LUIS TORRES"})
        if fp:
            f.update({"NPS_NUM": str(i % 11), "CES1_NUM": "4", "CES2_NUM": "2", "VALORES_ACORDES": "No" if i % 4 == 0 else "Si",
                      "SEGURIDAD": "1", "RAPIDEZ": "3", "REGION": "REGION COSTA", "CIERRE_DE_CICLO": "NO",
                      "CES2_PROFUNDIZACION1": "Es difícil encontrar dónde o cómo realizar el pago, Otro"})
        else:
            f.update({"CLARIDAD_NUM": "3", "CANAL_COMUNICACION": ">Mensaje de voz automatizado (IVR)", "ENCUESTA": "DIGEVO",
                      "CSAT_PROFUNDIZACION1": "Me llaman todo el día aunque ya pagué"})
        filas.append(f)
    df = pd.DataFrame(filas)
    for k, v in over.items():
        df[k] = v
    return df


def test_texto_opcion_mojibake_y_saltos():
    assert texto_opcion("ANTIOQUÃ\x8dA") == "ANTIOQUÍA"
    assert texto_opcion("hola_x000D_\nmundo") == "hola mundo"
    assert texto_opcion("   ") is None


def test_region_canal_motivos():
    assert region("REGION NOROCCIDENTE", "Factura y pago") == "Noroccidente"
    assert region(None, "Cobranza") == "No aplica"
    assert canal("Aplicación Mi Claro<", "Cobranza") == "Aplicación Mi Claro"
    assert canal(">Mensaje de voz automatizado (IVR)", "Cobranza") == "Mensaje de voz (IVR)"
    assert motivos("Los impuestos, recargos o descuentos aplicados no se entienden, Otro") == [
        "Los impuestos, recargos o descuentos aplicados no se entienden", "Otro"]
    assert motivos("94") == ["Código 94 (sin catálogo)"]


def test_limpiar_separa_procesos():
    d = limpiar(_crudo())
    fp = d.proceso == "Factura y pago"
    assert d.loc[fp, "cinf"].isna().all() and d.loc[~fp, "fsat"].isna().all()
    assert d.loc[~fp, "nps"].isna().all() and d.loc[fp, "nps"].notna().all()
    assert set(d.negocio) == {"Hogar", "Móvil"} and set(d.periodo) == {"202610"}
    assert d.loc[fp, "mot_ces2"].iloc[0] == ["Es difícil encontrar dónde o cómo realizar el pago", "Otro"]


def _errores(crudo):
    return [c["id"] for c in calidad.evaluar(crudo, limpiar(crudo)) if c["nivel"] == "error"]


def test_calidad_limpia_sin_errores():
    assert _errores(_crudo()) == []


def test_calidad_bloquea_ids_repetidos():
    assert "id_unico" in _errores(_crudo(ID_GESTION="1"))


def test_calidad_bloquea_escala_fuera():
    c = _crudo()
    c.loc[0, "CES1_NUM"] = "7"
    assert "escalas" in _errores(c)


def test_calidad_bloquea_estudio_desconocido():
    c = _crudo()
    c.loc[0, "ESTUDIO"] = "Otra cosa"
    assert "estudio" in _errores(c)


def test_tapar_nombres_y_plantillas():
    nombres = verbatims.tokens_nombre("MARIA PEREZ GOMEZ", "LUIS TORRES")
    t = verbatims.tapar("Nos comunicamos con MARIA PEREZ GOMEZ , se realiza encuesta. Llamar al 3001234567 o maria@x.com", nombres)
    assert "MARIA" not in t and "3001234567" not in t and "@" not in t
    t = verbatims.sin_plantilla(verbatims.tapar(
        "Nos comunicamos con ANA RUIZ, se realiza encuesta de satisfacción, Factura y pago fijo, el cliente menciona que "
        "no ha presentado fallas con el servicio. Que no suban el valor. Nota: No se dejan notas en AC por usuario no activo", []))
    assert t == "Que no suban el valor"
    assert "Dulce" not in verbatims.tapar("Ser más clara la información. Contesta encuesta: Dulce", [])
    # BRM pega renglones: el nombre queda pegado a la palabra anterior
    nombres = verbatims.tokens_nombre("ANGELA PATRICIA CASTRO ROBLES", "")
    t = verbatims.tapar("Titular : Evaluación factura y pago móvilANGELA PATRICIA CASTRO ROBLES Cliente manifiesta", nombres)
    assert "ANGELA" not in t and "CASTRO" not in t


def test_util_descarta_genericos():
    for g in ["ninguna", "No tiene sugerencias", "Cliente no brinda ninguna sugerencia respecto al servicio.", "94", "no tiene sugerencias AC BLOQUEADO"]:
        assert not verbatims.util(g), g
    assert verbatims.util("Que la factura llegue antes de la fecha de pago")


def test_dolores_reglas():
    cr = _crudo()
    d = limpiar(cr)
    m = dolores.marcar(cr, d)
    fp = d.proceso == "Factura y pago"
    assert (m.loc[fp, "pagar"]).all() and (m.loc[fp, "confianza"]).all() and not m.loc[fp, "lento"].any()
    assert (m.loc[~fp, "insisten"]).all() and (m.loc[~fp, "ya_pague"]).all() and (m.loc[~fp, "claridad"]).all()
    assert not m.loc[fp, "insisten"].any(), "las reglas de cobranza no se aplican a factura y pago"
    assert m.va_no.sum() == (d.va == 0).sum()


def test_cubo_suma_conteos():
    cr = _crudo()
    d = limpiar(cr)
    filas = agregar.cubo(d, dolores.marcar(cr, d))
    M = {m: sum(f["m"][i] for f in filas) for i, m in enumerate(agregar.MEDIDAS)}
    assert M["n"] == len(d) and M["nps_val"] == d.nps.notna().sum()
    assert M["prom"] == (d.nps >= 9).sum() and M["det"] == (d.nps <= 6).sum()
    assert sum(M[f"cinf_{i}"] for i in range(1, 6)) == d.cinf.notna().sum()
    assert M["va_no"] == (d.va == 0).sum() and M["seg_1"] == (d.seg == 1).sum()
    assert M["mot_ces2"] == d.mot_ces2.map(bool).sum()


def _brm():
    """Dos encuestas en formato largo de BRM (una Fijo PYME, una Móvil) y sus clientes."""
    preg = ["NPS", "CSAT - VALOR FACTURADO", "CSAT - PROCESO PAGO DE FACTURA", "CES – ENTENDER EL CONTENIDO DE LA FACTURA",
            "CES – REALIZAR EL PAGO DE LA FACTURA", "VALORES ACORDES AL PLAN", "EVALUACIÓN SEGURIDAD DEL PAGO",
            "EVALUACIÓN RAPIDEZ DEL PAGO", "SUGERENCIA"]
    resp = {1: ["10", "4", "3", "5", "2", "1", "3", "1", None], 2: ["6", "1", "5", "3", "4", "2", "2", "3", None]}
    prof = {1: [None, None, None, None, "94", None, None, "1", "Que la factura llegue antes"],
            2: ["caro", None, None, "Otro", None, "Existen cargos adicionales cuyo origen no es claro", None, None, "ninguna"]}
    est = {1: "Factura y Pago Fijo PYME", 2: "Factura y Pago Móvil"}
    enc = pd.DataFrame([{"UNIQUEID": u, "ESTUDIO_ESCRITO": est[u], "AGRUPACION": p, "RESPUESTAS": resp[u][i],
                         "PROFUNDIZACION": prof[u][i]} for u in (1, 2) for i, p in enumerate(preg)])
    cli = pd.DataFrame([{"UNIQUEID": u, "ESTUDIO": est[u], "BASE": "Base_x", "FECHA_REGISTRADA": {1: "2026-09-01 01:15:30", 2: "2026-10-02 02:15:30"}[u],
                         "REGION": "REGION COSTA", "CIUDAD": "CALI", "USUARIO_CONSULTOR": "LUIS TORRES",
                         "NOMBRE": "ANA RUIZ", "REGISTROID": 12345 + u, "TELEFONO_1": "3000000000"} for u in (1, 2)])
    return enc, cli


def test_brm_arma_una_fila_por_encuesta():
    filas, avisos = cargar_brm.armar(*_brm())
    assert avisos == [] and list(filas.ID_GESTION) == ["1", "2"]
    a, b = filas.iloc[0], filas.iloc[1]
    assert (a.ESTUDIO, a.MES, a.HORA_GESTION, a.TIPO_ID, a.ID_CLIENTE) == ("Factura y Pago Fijo PYME", "SEP", "01:15:30", None, "12346")
    assert a.FECHA_GESTION == pd.Timestamp("2026-09-01") and b.FECHA_GESTION == pd.Timestamp("2026-10-02")
    assert (a.NPS_NUM, a.NPS_GRUPO, a.CSAT_NUM, a.CSAT_GRUPO, a.CES2_GRUPO, a.VALORES_ACORDES) == ("10", "Promotores", "4", "Satisfecho", "Uso Complicado", "Si")
    assert (b.NPS_GRUPO, b.VALORES_ACORDES, b.VALORES_ACORDES_PROFUNDIZACION1, b.CES1_PROFUNDIZACION1) == (
        "Detractores", "No", "Existen cargos adicionales cuyo origen no es claro", "Otro")
    assert (a.CES2_PROFUNDIZACION1, a.RAPIDEZ_PROFUNDIZACION1, a.SUGERENCIA) == ("94", "1", "Que la factura llegue antes")
    # Lo armado pasa por la misma limpieza y contrato que el resto de la tabla
    crudo = filas.reindex(columns=COLUMNAS + COLUMNAS_SOLO_LIMPIEZA)
    d = limpiar(crudo)
    assert list(d.segmento) == ["PYME", "Masivo"] and list(d.negocio) == ["Hogar", "Móvil"] and list(d.va) == [1, 0]
    assert [c["id"] for c in calidad.evaluar(crudo, d) if c["nivel"] == "error"] == []


def test_brm_nota_fuera_de_escala_no_escribe():
    enc, cli = _brm()
    enc.loc[(enc.UNIQUEID == 1) & (enc.AGRUPACION == "NPS"), "RESPUESTAS"] = "11"
    filas, _ = cargar_brm.armar(enc, cli)
    with pytest.raises(SystemExit, match="contrato de calidad"):
        cargar_brm.validar(filas)


def test_brm_vacio_en_brm_se_compara_como_none():
    filas, _ = cargar_brm.armar(*_brm())
    tabla = filas[["ID_GESTION"] + cargar_brm.COMPARAR].copy()
    tabla.loc[0, "NPS_PROFUNDIZACION1"] = "texto viejo"
    _, cambios = cargar_brm.comparar(filas, tabla)
    assert cambios == [("1", "NPS_PROFUNDIZACION1", "texto viejo", None)]


def test_tapar_nombres_de_otras_encuestas():
    verbatims.fijar_nombres_globales(["ADRIANA LOPEZ", "FREDI ARIZA"], ["INVERSIONES XYZ SAS"])
    try:
        assert "ADRIANA" not in verbatims.tapar("El cliente ADRIANA se encuentra satisfecho", [])
        assert "Ariza" not in verbatims.tapar("Fredi Ariza sacar telefonía", [])
        assert verbatims.tapar("Que Claro mejore la Factura", []) == "Que Claro mejore la Factura"
        assert "mariaGOMEZ" not in verbatims.tapar("escribir a mariaGOMEZ88@gmail.com", [])
    finally:
        verbatims.fijar_nombres_globales([], [])


def test_brm_pregunta_nueva_detiene():
    enc, cli = _brm()
    enc.loc[0, "AGRUPACION"] = "CSAT - ALGO NUEVO"
    with pytest.raises(SystemExit):
        cargar_brm.armar(enc, cli)


def test_brm_compara_sin_saltos_y_detecta_cambios():
    filas, _ = cargar_brm.armar(*_brm())
    tabla = filas[["ID_GESTION"] + cargar_brm.COMPARAR].copy()
    tabla.loc[0, "SUGERENCIA"] = "Que la factura_x000D_\n llegue antes "
    ins, cambios = cargar_brm.comparar(filas, tabla)
    assert len(ins) == 0 and cambios == []
    tabla.loc[1, "CSAT_NUM"] = "5"
    ins, cambios = cargar_brm.comparar(filas, tabla.iloc[1:])
    assert list(ins.ID_GESTION) == ["1"] and cambios == [("2", "CSAT_NUM", "5", "1")]


# ---------------------------------------------------------------- salida real (después de etl.construir)
TAB = RAIZ / "tablero"


def _datos():
    js = (TAB / "datos.js").read_text(encoding="utf-8")
    return json.loads(js[len("window.DATOS="):].rstrip().rstrip(";"))


def _textos_salida():
    """Comentarios de comentarios.js y columnas de texto abierto de la base descargable."""
    js = (TAB / "comentarios.js").read_text(encoding="utf-8")
    com = json.loads(js[len("window.COMENTARIOS="):].rstrip().rstrip(";"))
    out = [f[-1] for f in com["filas"]]
    cols = _datos()["base"]["columnas"]
    abiertas = [cols.index(c) for c in ABIERTAS.values()]
    for p in (TAB / "base").glob("*.js"):
        t = p.read_text(encoding="utf-8")
        filas = json.loads(t[t.index("=", t.index("]")) + 1:].rstrip().rstrip(";"))
        out += [f[i] for f in filas for i in abiertas if f[i]]
    return out


def test_salida_sin_datos_personales():
    textos = _textos_salida()
    assert len(textos) > 1000
    hall = calidad.escanear_pii([(t, []) for t in textos])
    assert hall == [], hall[:3]
    base = _datos()["base"]["columnas"]
    assert not any(re.search(r"nombre|c[eé]dula|tel[eé]fono|analista|contacto", c, re.I) for c in base)


def test_calidad_sin_errores_en_salida():
    for p, inf in _datos()["periodos"].items():
        assert not [c for c in inf["calidad"] if c["nivel"] == "error"], p


@pytest.fixture(scope="module")
def oracle():
    try:
        from etl import extraer
        conn = extraer.conectar()
    except Exception as e:  # sin red o sin credenciales: se salta
        pytest.skip(f"Sin Oracle: {e}")
    yield conn
    conn.close()


def test_tabla_al_dia_con_brm(oracle):
    """Después de etl.construir, toda encuesta de factura y pago de BRM está en la tabla y con los mismos valores."""
    res = cargar_brm.sincronizar(oracle, escribir=False)
    assert res["brm_encuestas"] > 2000
    assert (res["insertar"], res["celdas_cambiadas"]) == (0, 0), res


def test_cifras_cuadran_con_oracle(oracle):
    """NPS, CSAT, CES y n por estudio y mes del tablero = SQL directo sobre la tabla."""
    from etl.extraer import _df
    from etl.config import TABLA
    ref = _df(oracle, f"""
        SELECT TO_CHAR(FECHA_GESTION, 'YYYYMM') P, ESTUDIO E, COUNT(*) N,
               SUM(CASE WHEN TO_NUMBER(NPS_NUM) >= 9 THEN 1 ELSE 0 END) PROM,
               SUM(CASE WHEN TO_NUMBER(NPS_NUM) <= 6 THEN 1 ELSE 0 END) DET, COUNT(NPS_NUM) NPSV,
               SUM(CASE WHEN TO_NUMBER(CSAT_NUM) >= 4 THEN 1 ELSE 0 END) CSAT_OK, COUNT(CSAT_NUM) CSAT_V,
               SUM(CASE WHEN TO_NUMBER(CES1_NUM) >= 4 THEN 1 ELSE 0 END) CES1_OK, COUNT(CES1_NUM) CES1_V
          FROM {TABLA} GROUP BY TO_CHAR(FECHA_GESTION, 'YYYYMM'), ESTUDIO""")
    D = _datos()
    nd = len(D["dims"])
    M = {m: nd + i for i, m in enumerate(D["medidas"])}
    from etl.config import ESTUDIOS
    val = lambda f, k: D["valores"][k][f[D["dims"].index(k)]]
    for r in ref.itertuples():
        proc, neg, seg = ESTUDIOS[r.E]
        sel = [f for f in D["cubo"] if val(f, "periodo") == r.P and val(f, "proceso") == proc
               and val(f, "negocio") == neg and val(f, "segmento") == seg]
        s = lambda m: sum(f[M[m]] for f in sel)
        assert s("n") == r.N, (r.P, r.E)
        clave = "fsat" if proc == "Factura y pago" else "cinf"
        assert s(f"{clave}_4") + s(f"{clave}_5") == r.CSAT_OK and sum(s(f"{clave}_{i}") for i in range(1, 6)) == r.CSAT_V
        if proc == "Factura y pago":
            assert (s("prom"), s("det"), s("nps_val")) == (r.PROM, r.DET, r.NPSV)
            assert (s("ces1_4") + s("ces1_5"), sum(s(f"ces1_{i}") for i in range(1, 6))) == (r.CES1_OK, r.CES1_V)
