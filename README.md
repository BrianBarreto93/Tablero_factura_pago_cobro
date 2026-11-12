# Tablero Factura, pago y cobro

Tablero HTML estático de la encuesta telefónica de experiencia de Factura y pago (Hogar y Móvil) y de Cobranza (Hogar y Móvil).
La fuente es una sola tabla de Oracle, `INVITADO_15.TBL_ENC_FACTURA_PAGO_COBRO`, que se lee en modo de solo lectura.

- Publicado: https://servidor.lan.qwertylab.dev/umm/FACTURACION-PAGOS-COBROS/tablero_Factura.html (reemplazó al tablero de NPS Factura de las encuestas 419/508).
- Para abrirlo en el equipo basta con doble clic en `tablero/tablero_Factura.html`. Funciona sin servidor y sin internet; la descarga de la base sí necesita servidor.

## Corrida mensual

```bash
cd /opt/apps/claro_tablero_focos/claro_tablero_facturacion
.venv/bin/python -m etl.construir          # Oracle → data/periodos/AAAAMM.json → tablero/datos.js
.venv/bin/python -m pytest -q              # limpieza, contrato de calidad, datos personales, cifras contra Oracle
.venv/bin/python -m etl.publicar           # SFTP LAN + verificación HTTP
```

`--periodo 202611` procesa un solo mes y `--solo-ensamblar` rehace `datos.js` con lo que ya está guardado, sin ir a Oracle.
Cada corrida reemplaza solo los meses que encuentra en Oracle. Si el proceso de origen vacía la tabla en un corte futuro,
el histórico sigue en `data/periodos/`, así que esa carpeta no se borra.
Un chequeo de calidad en «error» detiene la corrida sin escribir nada, y `etl.publicar` tampoco sube en ese caso.

## Cómo está hecho

| Paso | Archivo | Qué hace |
|---|---|---|
| Extraer | `etl/extraer.py` | `SELECT` con lista blanca de columnas (`etl/config.py`), nunca `SELECT *`. Los clientes repetidos se cuentan en SQL y la cédula no sale de Oracle. |
| Limpiar | `etl/limpiar.py` | Periodo = mes de `FECHA_GESTION`. Separa proceso (Factura y pago / Cobranza) y negocio (Fijo = Hogar). Arregla mojibake y `_x000D_`, quita «REGION», limpia `<` `>` del canal y parte los motivos de opción múltiple. |
| Calidad | `etl/calidad.py` | Contrato de datos. Bloquean: ID repetido, estudio desconocido, notas fuera de escala, grupo de la fuente distinto a la nota y datos personales en la salida. El resto son avisos que se ven en la pestaña Calidad. |
| Comentarios | `etl/verbatims.py` | Tapa correos, cifras de 5 o más dígitos y el nombre del cliente y del analista (se leen solo para eso). Quita las plantillas de los analistas («Nos comunicamos con…», «No se dejan notas en RR») y los comentarios vacíos («ninguna», «no tiene sugerencias»). |
| Dolores | `etl/dolores.py` | Ocho dolores de factura y pago y cinco de cobranza. Unos salen de la respuesta a la encuesta y otros de reglas de texto sobre los comentarios. |
| Agregar | `etl/agregar.py` | Cubo de conteos sumables por periodo × semana × proceso × negocio × región × casa de cobro × canal, con motivos y dolores en tablas dispersas. |
| Tablero | `tablero/app.js` | Suma las filas que pasan los filtros y calcula ahí cada indicador, así cualquier combinación da el valor ponderado correcto. |
| Base | `etl/base.py` → `tablero/base/AAAAMM.js` | Una fila por encuesta, sin nombre, cédula, teléfono ni analista. El botón «Descargar base» la filtra y la baja en Excel, CSV o Parquet (`tablero/exportar.js`, el mismo de los tableros CR y Soporte). |

### Diseño

Usa el mismo sistema visual que el tablero de Soporte y Fallas masivas: banner de Claro fijo arriba, riel lateral, barra de filtros fija,
tema claro por defecto con botón para el oscuro, 13 px de base y cifras que escalan con el ancho. Los cortes están en 1300 px
(barra compacta), 1100 px (Tableau 1250 × 750: KPI de a dos y paneles en una columna), 900 px (el recorrido se apila) y 760 px
(celular, menú abajo). No usa `.at()`, `||=` ni `replaceAll` porque Tableau incrusta un Chromium viejo.

El Resumen abre con el recorrido del cliente: factura, luego pago y, si no paga a tiempo, cobranza. Cada indicador aparece con su
valor, Hogar y Móvil en un mismo riel y el cambio contra el mes anterior, y una raya roja marca el más bajo de cada etapa.
Hogar va en azul y Móvil en naranja; la paleta pasó el validador de color (separación para daltonismo y contraste) en los dos temas.

### Definiciones

- NPS (solo factura y pago) = % promotores (9 y 10) − % detractores (0 a 6). Se lee en puntos.
- CSAT, CES y claridad = % que califica 4 o 5 en la escala de 1 a 5. Más alto = mejor.
- Valores acordes al plan = % que responde Sí sobre Sí + No.
- Seguridad y rapidez al pagar = % que responde 2 o 3 en la escala de 1 a 3. El 1 es la respuesta mala.
- Unidad = encuesta (`ID_GESTION`). Una muestra se marca baja cuando n < 30.
- r NPS (en el recorrido, junto al n) = correlación de Pearson entre la nota del indicador y la recomendación de 0 a 10,
  encuesta por encuesta, con los filtros activos. El cubo guarda n, Σx, Σy, Σx², Σy² y Σxy para poder calcularla con cualquier filtro.
  Se muestra solo el valor, con color: verde si es fuerte (0,50 o más), amarillo si es moderada (0,30 a 0,49) y rojo si es baja
  (menos de 0,30). La explicación sale al pasar el cursor. Cobranza no pregunta NPS, así que ahí aparece «—».
- Meses: el filtro deja marcar uno o varios. Con varios, las cifras suman todas sus encuestas y la variación se compara contra
  los mismos N meses justo antes (si la selección es continua y existen esos meses).

Qué es cada campo:

| Campo | Factura y pago | Cobranza |
|---|---|---|
| `CSAT_NUM` | Satisfacción con la factura | Satisfacción con la información del cobro |
| `CSAT1_NUM` | Satisfacción con el pago | Satisfacción con el trato en la gestión |
| `CES1_NUM` / `CES2_NUM` | Facilidad para entender la factura / para pagar | (no aplica) |
| `CLARIDAD_NUM` | (no aplica) | Claridad de la información |

La tabla no dice qué pregunta es cada campo. Estas etiquetas se dedujeron de los motivos que acompañan cada campo y el usuario
las aceptó el 2026-11-12 como supuesto de trabajo. Si llega el cuestionario, se cambian en `ESCALAS` de `etl/config.py`.

### Trampas conocidas de la fuente (sep–oct 2026)

1. Hogar entrega los motivos cerrados en código (1 a 7 y 94) y Móvil en texto. Sin el catálogo, el tablero muestra los de Hogar
   aparte, plegados y en gris como «Código n».
2. Factura y pago Móvil usa cuatro regiones: Bogotá y Cundinamarca vienen en Oriente y no hay Centro.
3. `ENCUESTA` (casa de cobro) solo viene llena en las bases de cobranza de septiembre.
4. `MES` trae solo el mes (SEP, OCT), sin año. El tablero usa `FECHA_GESTION`.
5. `SUGERENCIA` mezcla la voz del cliente con notas del analista (nombre del titular, «AC BLOQUEADO», «No se dejan notas en RR»).
   El ETL las quita, y si se escapa una cifra larga o un nombre del cliente, la corrida se detiene.

### Supuestos sin confirmar

- Las etiquetas de CSAT, CSAT1, CES1 y CES2, y el umbral 2–3 de seguridad y rapidez.
- El catálogo de códigos de los motivos de Hogar.
- Las reglas de texto de los dolores: «me llaman demasiado», «me cobran aunque ya pagué», «pago por un servicio que falla», etc.
