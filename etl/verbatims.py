"""Comentarios abiertos limpios. Se tapan: correos, cifras de 5+ dígitos (cuentas, teléfonos, cédulas), el nombre del
cliente (NOMBRE_CLIENTE, que los analistas copian en SUGERENCIA), los encabezados que escriben los analistas
(«Nos comunicamos con …», «NOMBRE DEL TITULAR …») y los nombres propios que siguen a «asesor», «señor»…
"""
import re
import unicodedata

import pandas as pd

from etl.config import ABIERTAS, MAX_VERBATIMS_PERIODO
from etl.limpiar import texto_opcion

_NO_NOMBRE = {"DE", "DEL", "LA", "LAS", "LOS", "Y", "SAN", "SANTA", "VDA", "VIUDA", "NULL"}
_CORREO = re.compile(r"[\w.+-]+@[\w-]+\.[\w.]+")
_CIFRA = re.compile(r"\d(?:[\d .-]{3,}\d)")  # 5+ caracteres empezando y terminando en dígito
_ROL = re.compile(
    r"\b((?i:(?:el|la|al|un|una)?\s*(?:asesor(?:a|es)?|se[ñn]or(?:a|ita)?|sr\.?|sra\.?|don|do[ñn]a|agente|"
    r"funcionari[oa]|de nombre|contesta(?: la)? encuesta\s*:?|responde(?: la)? encuesta\s*:?|atiende|hija|hijo|esposa|esposo))\s+)"
    r"([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+){0,2})")
# Encabezados de los analistas: «Nos comunicamos con JUAN PÉREZ , se realiza encuesta…», «NOMBRE DEL TITULAR: …»
_ENCABEZADO = re.compile(
    r"(?i:nos comunicamos con|me comunico con|se comunica con|nos comunicamos a)\s+[^,]*?(?=\s*,|\s+(?i:se realiza|quien|el cliente|cliente)\b|$)")
_TITULAR = re.compile(
    r"(?i:nombre del? (?:titular|cliente)|titular)\s*:?\s*((?i:evaluaci[oó]n cobranzas? m[oó]vil|zonas t[eé]cnicas m[oó]vil|observaciones)\s*)?"
    r"([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ?.]+(?:\s+[A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ?.]+){0,4})?")
_MAYUS = re.compile(r"\b[A-ZÁÉÍÓÚÑ]{3,}(?:\s+[A-ZÁÉÍÓÚÑ]{2,}){1,4}\b")
_MINIMO = 3  # letras útiles para considerar que hay comentario
# Comentarios que no dicen nada (el analista dejó constancia de que no hubo comentario)
_VACIO = re.compile(
    r"^(?:el |la )?(?:cliente|usuario)?\s*(?:manifiesta|indica|dice|refiere)?\s*(?:que )?"
    r"(?:no tiene|no brinda|no da|no aporta|no presenta|no deja|no hay|sin|ningun[ao]?|nada|no|n/?a|ok|todo (?:bien|claro)|no responde|no contesta)"
    r"(?:\s+(?:ninguna?|ningun|mas|más|otra|alguna?|tiene|deja|presenta|aporta))?"
    r"(?:\s+(?:sugerencias?|comentarios?|observaci[oó]n(?:es)?|informaci[oó]n|motivo|respuesta|que agregar|a agregar|nota)s?)?"
    r"[\s\w.,]{0,40}$", re.I)


def tokens_nombre(*partes):
    out = []
    for p in partes:
        for t in re.split(r"[\s,.-]+", str(p or "")):
            if len(t) >= 3 and t.upper() not in _NO_NOMBRE and not t.isdigit():
                out.append(t)
    return out


def _parece_nombre(m):
    """Bloque en mayúsculas que parece un nombre (no una frase gritada): sin verbos ni palabras frecuentes."""
    palabras = m.group().split()
    frecuentes = {"QUE", "LA", "EL", "LOS", "LAS", "DE", "DEL", "NO", "SE", "EN", "POR", "CON", "UN", "UNA", "ES", "SU",
                  "USUARIO", "CLIENTE", "MANIFIESTA", "INDICA", "FACTURA", "SERVICIO", "PAGO", "PLAN", "RR", "AC", "BLOQUEADO",
                  "MARCACIÓN", "MARCACION", "CLARO", "TITULAR", "NOMBRE", "YA", "ESTA", "ESTÁ", "LE", "LO", "MUY", "PARA"}
    return not any(p.strip(".,") in frecuentes for p in palabras)


# BRM pega los renglones que el analista escribió aparte: «pago móvilANGELA PÉREZ», «titularJAROLL». Sin el espacio,
# \b no separa el nombre y se escaparía del tapado. Corre después de tapar correos (para no partir «mariaGOMEZ@…»).
_PEGADO = re.compile(r"([a-záéíóúñ])([A-ZÁÉÍÓÚÑ]{2,})")

# Nombres de TODAS las encuestas del corte (no solo el del propio cliente): en PYME el NOMBRE es la empresa y el
# analista escribe el nombre de la persona de contacto («El cliente ADRIANA se encuentra…»). etl.construir los fija
# con fijar_nombres_globales(). Palabras en mayúsculas que estén aquí se tapan; en tipo título, solo pares de palabras
# con mayúscula inicial donde alguna es nombre de persona («Fredi Ariza»), para no tapar frases normales. En sep–nov
# eso tapa 14 pares: casi todos nombres y algunos lugares («Santa Helena»), que se pierden sin daño.
_GLOBAL = {"todos": set(), "personas": set()}
_NO_GLOBAL = {"CLARO", "MOVIL", "MÓVIL", "HOGAR", "PYME", "FIBRA", "NEQUI", "DAVIPLATA", "BANCOLOMBIA", "FACTURA", "PAGO",
              "SERVICIO", "SERVICIOS", "CLIENTE", "TODO", "BIEN", "PLAN", "INTERNET", "TELEFONIA", "TELEFONÍA", "COLOMBIA"}


def _clave(t):
    return unicodedata.normalize("NFD", t.upper()).encode("ascii", "ignore").decode()


def fijar_nombres_globales(personas, empresas=()):
    """personas/empresas = textos de nombres (cliente Masivo y analista / razón social PYME)."""
    per = {_clave(t) for t in tokens_nombre(*personas) if len(t) >= 3}
    emp = {_clave(t) for t in tokens_nombre(*empresas) if len(t) >= 3}
    no = {_clave(w) for w in _NO_GLOBAL}
    _GLOBAL["personas"], _GLOBAL["todos"] = per - no, (per | emp) - no


_PALABRA_MAYUS = re.compile(r"\b[A-ZÁÉÍÓÚÑÜ]{3,}\b")
_PAR_TITULO = re.compile(r"\b([A-ZÁÉÍÓÚÑ][a-záéíóúñü]{2,})\s+([A-ZÁÉÍÓÚÑ][a-záéíóúñü]{2,})\b")


def _tapar_globales(s):
    if not _GLOBAL["todos"]:
        return s
    s = _PALABRA_MAYUS.sub(lambda m: "[nombre]" if _clave(m.group()) in _GLOBAL["todos"] else m.group(), s)
    return _PAR_TITULO.sub(lambda m: "[nombre]" if any(_clave(g) in _GLOBAL["personas"] for g in m.groups()) else m.group(), s)


def tapar(texto, nombres=()):
    s = _CORREO.sub("[correo]", texto)
    s = _PEGADO.sub(r"\1 \2", s)
    s = _CIFRA.sub(lambda m: "[#]" if sum(c.isdigit() for c in m.group()) >= 5 else m.group(), s)
    s = _ENCABEZADO.sub(lambda m: m.group().split(" con ")[0] + " con [nombre]" if " con " in m.group() else "[nombre]", s)
    s = _TITULAR.sub(lambda m: "[nombre]" if m.group(2) else m.group(), s)
    for nom in sorted(set(nombres), key=len, reverse=True):
        s = re.sub(rf"\b{re.escape(nom)}\b", "[nombre]", s, flags=re.I)
        # pegado en tipo título o mayúsculas a la palabra anterior: «móvilAngela»
        s = re.sub(rf"(?<=[a-záéíóúñ])(?:{re.escape(nom.upper())}|{re.escape(nom.title())})\b", " [nombre]", s)
    s = _tapar_globales(s)
    s = _ROL.sub(lambda m: m.group(1) + "[nombre]", s)
    s = _MAYUS.sub(lambda m: "[nombre]" if _parece_nombre(m) else m.group(), s)
    s = re.sub(r"(\[nombre\][\s,]*){2,}", "[nombre] ", s)
    return re.sub(r"\s+", " ", s).strip()


# Notas operativas y plantillas de los analistas: no son voz del cliente
_PLANTILLA = [
    (re.compile(r"(?i:nos comunicamos con|me comunico con|se comunica con)\s+[^,]*?,?\s*se realiza encuesta\s+(?:de satisfacci[oó]n|sobre)"
                r"[^,]*?(?:,|(?=\s(?:el |la )?cliente\b))\s*", re.I), ""),
    (re.compile(r"(?i:nombre del? (?:titular|cliente)|titular|usuario)\s*:\s*", re.I), ""),
    (re.compile(r"^\s*se realiza encuesta (?:de satisfacci[oó]n|sobre)[^,]*?(?:,|(?=\s(?:el |la )?cliente\b))\s*(?:factura_\w+\s*)?", re.I), ""),
    (re.compile(r"(?i:nombre del? titular)\s*(?:evaluaci[oó]n [a-záéíóú ]+?(?:hogar|m[oó]vil|fijo))?\s*", re.I), ""),
    (re.compile(r"\b(?:evaluaci[oó]n cobranzas? (?:m[oó]vil|fijo)|zonas t[eé]cnicas m[oó]vil)\b", re.I), ""),
    (re.compile(r"\bobservaciones\b\s*:?", re.I), ""),
    (re.compile(r"\(?\s*(?:sin permisos de usuario de rr\s*)?(?:nota\s*:\s*)?no se deja[n]? (?:notas?|marcaci[oó]n)[^.)]*[.)]?", re.I), ""),
    (re.compile(r"\bnota\s*:\s*", re.I), ""),
    (re.compile(r"novedades\s*:\s*(?:bloqueo general de aplicativos de claro|n/?a|ninguna?)\.?", re.I), ""),
    (re.compile(r"bloqueo general de aplicativos de claro\.?", re.I), ""),
    (re.compile(r"(?:cobranza general\s*\([^)]*\)|factura y pago (?:fijo|m[oó]vil|hogar))\s*,?\s*", re.I), ""),
    (re.compile(r"(?:el |la )?(?:cliente|usuario) (?:menciona|indica|manifiesta) que no ha (?:presentado|tenido) "
                r"(?:ninguna?s? )?(?:fallas?|inconvenientes?|problemas?)(?: con el (?:servicio|proceso(?: de [a-zé ]+)?))?\s*[.,]?", re.I), ""),
    (re.compile(r"no tengo acceso (?:a )?(?:ac|rr)[^.)]*", re.I), ""),
    (re.compile(r"\b(?:ac|rr)\s*(?:/\s*rr)?\s*bloquead[oa]\b", re.I), ""),
    (re.compile(r"\(?\s*no tengo acceso a rr\s*\)?|no aparece n[uú]mero en ac|por usuario no activo", re.I), ""),
    (re.compile(r"se realiza encuesta (?:de satisfacci[oó]n|sobre)\s*,?", re.I), ""),
    (re.compile(r"\b\w*_\w*\b"), ""),          # códigos de base (Factura_Pago_Cobro_…)
    (re.compile(r"\S*Ã\S*"), ""),                # restos de nombres con mojibake
]


def sin_plantilla(texto):
    s = texto
    for rx, rep in _PLANTILLA:
        s = rx.sub(rep, s)
    s = re.sub(r"\s+([.,])", r"\1", re.sub(r"\s+", " ", s)).strip(" .,-:")
    s = re.sub(r"^\[nombre\][\s.,:]*", "", s)
    return s[:1].upper() + s[1:] if s else s


def util(texto):
    """True si el comentario dice algo (no es «ninguna», «no tiene sugerencias», un código o un número)."""
    if not texto or sum(c.isalpha() for c in texto) < _MINIMO:
        return False
    t = re.sub(r"\b(ac|rr) bloqueado\b|no se deja marcaci[oó]n en rr ya que esta bloqueado", "", texto, flags=re.I).strip(" .,")
    return bool(t) and not (len(t) < 70 and _VACIO.match(t))


def construir(crudo, d, escalas):
    """Lista de comentarios del periodo con sus dimensiones y notas. También devuelve (texto, nombres) para el
    escaneo de datos personales. `escalas` = claves de las notas que se guardan con cada comentario."""
    from etl.agregar import DIMS
    filas, escaneo = [], []
    for i in d.index:
        nombres = tokens_nombre(crudo.at[i, "NOMBRE_CLIENTE"], crudo.at[i, "NOMBRE_ANALISTA"])
        for q in ABIERTAS:
            t = texto_opcion(crudo.at[i, q])
            if not util(t):
                continue
            limpio = sin_plantilla(tapar(t, nombres))
            if not util(limpio.replace("[nombre]", "")):
                continue
            escaneo.append((limpio, nombres))
            fila = {k: d.at[i, k] for k in DIMS}
            fila.update({k: None if pd.isna(d.at[i, k]) else int(d.at[i, k]) for k in escalas})
            fila.update({"pregunta": q, "texto": limpio})
            filas.append(fila)
    # Si algún mes trae muchísimos, muestra aleatoria fija (semilla) para no sesgar hacia ningún tipo de comentario
    if len(filas) > MAX_VERBATIMS_PERIODO:
        import random
        filas = random.Random(20261112).sample(filas, MAX_VERBATIMS_PERIODO)
    return filas, escaneo
