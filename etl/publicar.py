"""Sube el tablero al host estático por SFTP LAN (mismo mecanismo que claro_tablero_sop_fm/etl/publicar.py).

Reemplaza al tablero viejo de NPS Factura (encuestas 419/508) en la misma carpeta; la página es tablero_Factura.html. Antes de subir:
  1. no publica si el último datos.js trae algún chequeo de calidad en «error»;
  2. la primera vez respalda lo que haya en la carpeta remota en data/respaldo_publicado/AAAAMMDD_HHMMSS/;
  3. sube todo tablero/ y borra del remoto los archivos que ya no existen en el tablero nuevo;
  4. verifica HTTP 200.

Uso: .venv/bin/python -m etl.publicar     (después de etl.construir y pytest)
URL: https://servidor.lan.qwertylab.dev/umm/FACTURACION-PAGOS-COBROS/tablero_Factura.html
"""
import json
import ssl
import stat
import urllib.request
from datetime import datetime

import paramiko
from dotenv import dotenv_values

from etl.config import RAIZ

ORIGEN = RAIZ / "tablero"
BASE = "/incoming/compartido/proyectos_HTML/estaticos/UMM/FACTURACION-PAGOS-COBROS"
URL = "https://servidor.lan.qwertylab.dev/umm/FACTURACION-PAGOS-COBROS/tablero_Factura.html"
RESPALDO = RAIZ / "data" / "respaldo_publicado"
# Credenciales SFTP prestadas del .env de claro_vista_360 (igual que los tableros CR y Soporte-FM)
ENV = dotenv_values("/opt/apps/claro_vista_360/.env")


def _sin_errores():
    js = (ORIGEN / "datos.js").read_text(encoding="utf-8")
    datos = json.loads(js[len("window.DATOS="):].rstrip().rstrip(";"))
    malos = [c["titulo"] for p in datos["periodos"].values() for c in p["calidad"] if c["nivel"] == "error"]
    if malos:
        raise SystemExit(f"No se publica: chequeos en error {malos}")


def _remotos(s, d, pre=""):
    """{ruta relativa: tamaño} de todo lo que hay bajo d."""
    out = {}
    try:
        lista = s.listdir_attr(d)
    except IOError:
        return out
    for a in lista:
        if stat.S_ISDIR(a.st_mode):
            out.update(_remotos(s, f"{d}/{a.filename}", f"{pre}{a.filename}/"))
        else:
            out[pre + a.filename] = a.st_size
    return out


def main():
    _sin_errores()
    archivos = {p.relative_to(ORIGEN).as_posix(): p for p in ORIGEN.rglob("*") if p.is_file()}
    t = paramiko.Transport((ENV["SFTP_HOST_LAN"], int(ENV["SFTP_PORT_LAN"])))
    t.connect(username=ENV["SFTP_USER_LAN"], password=ENV["SFTP_PASS_LAN"])
    s = paramiko.SFTPClient.from_transport(t)

    remotos = _remotos(s, BASE)
    if remotos and not RESPALDO.exists():   # solo la primera vez: es el tablero viejo que se reemplaza
        dest = RESPALDO / datetime.now().strftime("%Y%m%d_%H%M%S")
        for r in remotos:
            (dest / r).parent.mkdir(parents=True, exist_ok=True)
            s.get(f"{BASE}/{r}", str(dest / r))
        print(f"Respaldo del remoto anterior ({len(remotos)} archivos) → {dest}")

    for d in sorted({BASE} | {f"{BASE}/{'/'.join(r.split('/')[:i])}" for r in archivos for i in range(1, r.count('/') + 1)}):
        try:
            s.stat(d)
        except IOError:
            s.mkdir(d)
    for r, p in archivos.items():
        s.put(str(p), f"{BASE}/{r}")
        assert s.stat(f"{BASE}/{r}").st_size == p.stat().st_size, r
    sobran = sorted(set(remotos) - set(archivos))
    for r in sobran:
        s.remove(f"{BASE}/{r}")
    s.close(); t.close()

    ctx = ssl.create_default_context(); ctx.check_hostname = False; ctx.verify_mode = ssl.CERT_NONE
    cod = urllib.request.urlopen(URL, context=ctx, timeout=20).status
    print(f"{len(archivos)} archivos subidos, {len(sobran)} viejos borrados {sobran} → {URL} (HTTP {cod})")


if __name__ == "__main__":
    main()
