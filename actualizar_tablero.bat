@echo off
rem ============================================================
rem  Actualiza y publica el tablero Factura, pago y cobro
rem   1. Fuente BRM -> tabla del tablero -> data\periodos -> tablero\datos.js   (etl.construir)
rem   2. Pruebas (limpieza, contrato de calidad, datos personales, cifras contra Oracle)
rem   3. Publicacion por SFTP LAN + verificacion HTTP                         (etl.publicar)
rem  Lo corre la tarea programada "Act_tab_Fact_pag_cobro" (lun, mie, vie 10:00). Tambien sirve doble clic.
rem  Detalle en logs\tablero_AAAAMMDD_HHMM.log
rem  Codigo de salida: 0 = publicado, 1 = fallo (no se publica lo que falto).
rem ============================================================
setlocal
title Tablero Factura, pago y cobro
chcp 65001 >nul
cd /d "%~dp0"
set "PYTHONIOENCODING=utf-8"
set "PYTHONUTF8=1"
set "PY=.venv\Scripts\python.exe"
if not exist logs mkdir logs
for /f %%i in ('powershell -NoProfile -Command "Get-Date -Format yyyyMMdd_HHmm"') do set "TS=%%i"
set "LOG=%~dp0logs\tablero_%TS%.log"
set "RC=1"

echo.
echo  =============================================================================
echo   TABLERO FACTURA, PAGO Y COBRO  ^|  %date% %time:~0,5%
echo  =============================================================================
if not exist "%PY%" (
    echo  [X] No existe el entorno virtual. Crear con:
    echo      python -m venv .venv ^&^& .venv\Scripts\pip install -r requirements.txt
    goto :fin
)
if not exist ".env" (
    echo  [X] Falta el archivo .env con las credenciales. Ver .env.example
    goto :fin
)

echo   [1/3] Sincronizando BRM y construyendo el tablero desde Oracle...
"%PY%" -u -m etl.construir >> "%LOG%" 2>&1 || goto :fallo
echo   [2/3] Pruebas...
"%PY%" -m pytest -q >> "%LOG%" 2>&1 || goto :fallo
echo   [3/3] Publicando por SFTP...
"%PY%" -u -m etl.publicar >> "%LOG%" 2>&1 || goto :fallo

powershell -NoProfile -Command "Get-Content -LiteralPath '%LOG%' -Tail 1 -Encoding UTF8"
echo   RESULTADO: OK. Log: %LOG%
set "RC=0"
goto :fin

:fallo
echo   RESULTADO: CON ERRORES. No se publico. Ultimas lineas del log:
echo  -----------------------------------------------------------------------------
powershell -NoProfile -Command "Get-Content -LiteralPath '%LOG%' -Tail 15 -Encoding UTF8"
echo  -----------------------------------------------------------------------------

:fin
echo.
rem Deja la ventana abierta 60 s para leer el resultado (no bloquea al Programador).
timeout /t 60
exit /b %RC%
