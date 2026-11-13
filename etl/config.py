"""Constantes del tablero Factura, pago y cobro: tabla fuente, lista blanca de columnas, catálogos y umbrales.

Lo que cambie de un corte a otro (etiquetas de preguntas, nombres de casas de cobro…) se ajusta aquí, no en la lógica.
"""
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
TABLA = "INVITADO_15.TBL_ENC_FACTURA_PAGO_COBRO"
DIR_PERIODOS = RAIZ / "data" / "periodos"     # un JSON agregado por mes (histórico acumulado)
SALIDA_JS = RAIZ / "tablero" / "datos.js"

# Encuesta telefónica hecha por analistas. Nunca SELECT *: la tabla trae nombre, cédula y teléfono del cliente y el
# nombre del analista. NOMBRE_CLIENTE y NOMBRE_ANALISTA se leen SOLO para taparlos en los comentarios (los analistas
# los escriben en SUGERENCIA) y se descartan en memoria; no llegan a la salida.
ABIERTAS = {
    "NPS_PROFUNDIZACION1": "Por qué recomienda o no",
    "CES1_CLASIFICACION1": "Otro motivo: entender la factura",
    "VALORES_ACORDES_CLASIFICACION1": "Otro motivo: valores que no cuadran",
    "CES2_CLASIFICACION1": "Otro motivo: pagar",
    "SEGURIDAD_CLASIFICACION1": "Otro motivo: seguridad del pago",
    "RAPIDEZ_CLASIFICACION1": "Otro motivo: rapidez del pago",
    "CSAT_PROFUNDIZACION1": "Por qué esa satisfacción con la información",
    "CSAT1_PROFUNDIZACION1": "Por qué esa satisfacción con el trato",
    "CLARIDAD_PROFUNDIZACION1": "Por qué no fue clara",
    "SUGERENCIA": "Sugerencia u observación",
}
# Motivos cerrados (opción múltiple). Móvil los trae en texto; Hogar en código sin catálogo.
MOTIVOS = {
    "ces1": "CES1_PROFUNDIZACION1",
    "va": "VALORES_ACORDES_PROFUNDIZACION1",
    "ces2": "CES2_PROFUNDIZACION1",
    "seg": "SEGURIDAD_PROFUNDIZACION1",
    "rap": "RAPIDEZ_PROFUNDIZACION1",
}
COLUMNAS = (
    ["ID_GESTION", "ESTUDIO", "NOMBRE_ESTUDIO", "MES", "FECHA_GESTION", "FECHA_CARGA", "CIERRE_DE_CICLO",
     "NPS_NUM", "NPS_GRUPO", "CSAT_NUM", "CSAT_GRUPO", "CSAT1_NUM", "CSAT1_GRUPO", "CES1_NUM", "CES1_GRUPO",
     "CES2_NUM", "CES2_GRUPO", "CLARIDAD_NUM", "CLARIDAD_GRUPO", "VALORES_ACORDES", "SEGURIDAD", "RAPIDEZ",
     "CANAL_COMUNICACION", "ENCUESTA", "SEGMENTO", "REGION", "CIUDAD", "ARCHIVO_ORIGEN"]
    + list(MOTIVOS.values()) + list(ABIERTAS)
)
COLUMNAS_SOLO_LIMPIEZA = ["NOMBRE_CLIENTE", "NOMBRE_ANALISTA"]
CLAVE_CUENTA = "ID_CLIENTE"   # solo para contar en SQL encuestas repetidas por cliente; no sale de Oracle

# ESTUDIO → (proceso, negocio, segmento). Fijo = Hogar. Los estudios PYME llegan desde 2026-11-13 con la fuente BRM.
ESTUDIOS = {
    "Factura y Pago Fijo": ("Factura y pago", "Hogar", "Masivo"),
    "Factura y Pago Móvil": ("Factura y pago", "Móvil", "Masivo"),
    "Factura y Pago Fijo PYME": ("Factura y pago", "Hogar", "Corporativo"),
    "Factura y Pago Móvil PYME": ("Factura y pago", "Móvil", "Corporativo"),
    "Cobranza Fijo": ("Cobranza", "Hogar", "Masivo"),
    "Cobranza Móvil": ("Cobranza", "Móvil", "Masivo"),
}
PROCESOS = ["Factura y pago", "Cobranza"]
NEGOCIOS = ["Hogar", "Móvil"]
SEGMENTOS = ["Masivo", "Corporativo"]   # Corporativo = estudios PYME (pedido del usuario 2026-11-13)

# ------------------------------------------------------------------ fuente BRM (desde 2026-11-13)
# El proveedor alimenta cada mes INVITADO_15.TBL_ENCUESTAS_BRM (una fila por encuesta × pregunta) y
# TBL_CLIENTES_BRM (una fila por encuesta con los datos del cliente, misma llave UNIQUEID = ID_GESTION).
# etl/cargar_brm.py las cruza y deja las encuestas de factura y pago en TABLA, que sigue siendo la que lee el tablero.
BRM_ENCUESTAS = "INVITADO_15.TBL_ENCUESTAS_BRM"
BRM_CLIENTES = "INVITADO_15.TBL_CLIENTES_BRM"
BRM_ESTUDIOS = ["Factura y Pago Fijo", "Factura y Pago Móvil", "Factura y Pago Fijo PYME", "Factura y Pago Móvil PYME"]
BRM_ORIGEN = "TBL_ENCUESTAS_BRM"   # valor de ARCHIVO_ORIGEN en las filas que carga etl/cargar_brm.py
# AGRUPACION (pregunta) → (columna de la nota, columna de PROFUNDIZACION). La llave se compara normalizada
# (mayúsculas, guiones largos como «-», espacios simples). Cuadra 1.620 de 1.620 con lo que ya traía la tabla.
BRM_PREGUNTAS = {
    "NPS": ("NPS_NUM", "NPS_PROFUNDIZACION1"),
    "CSAT - VALOR FACTURADO": ("CSAT_NUM", None),
    "CSAT - PROCESO PAGO DE FACTURA": ("CSAT1_NUM", None),
    "CES - ENTENDER EL CONTENIDO DE LA FACTURA": ("CES1_NUM", "CES1_PROFUNDIZACION1"),
    "CES - REALIZAR EL PAGO DE LA FACTURA": ("CES2_NUM", "CES2_PROFUNDIZACION1"),
    "VALORES ACORDES AL PLAN": ("VALORES_ACORDES", "VALORES_ACORDES_PROFUNDIZACION1"),
    "EVALUACIÓN SEGURIDAD DEL PAGO": ("SEGURIDAD", "SEGURIDAD_PROFUNDIZACION1"),
    "EVALUACIÓN RAPIDEZ DEL PAGO": ("RAPIDEZ", "RAPIDEZ_PROFUNDIZACION1"),
    "SUGERENCIA": (None, "SUGERENCIA"),
}
BRM_VALORES_ACORDES = {"1": "Si", "2": "No"}   # BRM trae código; la tabla, texto

# Escalas 1–5. Desde la fuente BRM el nombre de cada pregunta viene en AGRUPACION (factura y pago confirmado:
# CSAT = «valor facturado», CSAT1 = «proceso pago de factura»). Las de cobranza siguen deducidas por los motivos.
ESCALAS = {
    #  clave: (columna, proceso, nombre)
    "fsat": ("CSAT_NUM", "Factura y pago", "Satisfacción con el valor facturado"),
    "psat": ("CSAT1_NUM", "Factura y pago", "Satisfacción con el pago"),
    "ces1": ("CES1_NUM", "Factura y pago", "Facilidad para entender la factura"),
    "ces2": ("CES2_NUM", "Factura y pago", "Facilidad para pagar"),
    "cinf": ("CSAT_NUM", "Cobranza", "Satisfacción con la información del cobro"),
    "ctra": ("CSAT1_NUM", "Cobranza", "Satisfacción con el trato en la gestión"),
    "clar": ("CLARIDAD_NUM", "Cobranza", "Claridad de la información"),
}
# Grupo que trae la fuente para cada escala y qué notas lo forman (para el contrato de calidad)
GRUPOS_FUENTE = {
    "CSAT_GRUPO": ("CSAT_NUM", {"Satisfecho": (4, 5), "Insatisfecho": (1, 3)}),
    "CSAT1_GRUPO": ("CSAT1_NUM", {"Satisfecho": (4, 5), "Insatisfecho": (1, 3)}),
    "CES1_GRUPO": ("CES1_NUM", {"Uso Fácil": (4, 5), "Uso Complicado": (1, 3)}),
    "CES2_GRUPO": ("CES2_NUM", {"Uso Fácil": (4, 5), "Uso Complicado": (1, 3)}),
    "CLARIDAD_GRUPO": ("CLARIDAD_NUM", {"Muy clara": (4, 5), "Nada clara": (1, 3)}),
    "NPS_GRUPO": ("NPS_NUM", {"Promotores": (9, 10), "Neutros": (7, 8), "Detractores": (0, 6)}),
}
# Qué debe traer cada proceso (si falta en más del 2 % de las filas, aviso)
REQUERIDOS = {
    "Factura y pago": ["NPS_NUM", "CSAT_NUM", "CSAT1_NUM", "CES1_NUM", "CES2_NUM", "VALORES_ACORDES", "SEGURIDAD", "RAPIDEZ"],
    "Cobranza": ["CSAT_NUM", "CSAT1_NUM", "CLARIDAD_NUM"],
}
# Seguridad y rapidez del pago: escala 1–3. El 1 es la respuesta mala (NPS medio 4,4 frente a ~8 en 2 y 3).
ESCALA_3 = {"seg": ("SEGURIDAD", "Seguridad al pagar"), "rap": ("RAPIDEZ", "Rapidez al pagar")}

CASAS = {"CASA_COBRO": "Casa de cobro", "DIGEVO": "Digevo", "GROWTH": "Growth"}
CANAL_OTRO = "Otro"
REGIONES = ["Centro", "Costa", "Noroccidente", "Occidente", "Oriente"]

SIN_DATO = "Sin dato"
NO_APLICA = "No aplica"
N_MINIMO = 30                 # cortes con menos encuestas se marcan «muestra baja» en el tablero
VARIACION_N_AVISO = 0.40      # aviso si el n del mes cambia más de ±40 % frente al anterior
MAX_VERBATIMS_PERIODO = 6000  # tope de comentarios por mes en la salida
