# Cambios

## 2026-11-18 · v5

- Dolores del cliente: clic en un dolor para **resaltarlo** (los demás se apagan y en el recuadro de arriba aparece hasta
  dónde llegaría el NPS sin ese dolor). El **globo** junto a cada dolor abre «Lo que más repiten»: las palabras más
  frecuentes y los comentarios agrupados (los casi iguales juntos, con ×n), con los filtros y el periodo de la caja.
- Encabezado de la lista: el indicador en grande y debajo la clave (con el dolor, sin el dolor, total), todo centrado;
  «NPS que recupera» (en cobranza, «CSAT información que recupera») también centrado.
- `comentarios.js` trae la columna `dl` (máscara de dolores de cada comentario, `etl/dolores.py::marcar_comentario`) y
  `dl_claves`. Se rehízo con `--solo-ensamblar` (sin Oracle): las cifras no cambian.
  En factura y pago, los dolores de respuesta cerrada toman el «otro motivo» de su pregunta y el porqué/sugerencia de
  quien no es promotor (en cobranza, de quien calificó la información de 1 a 3); pesan doble los de la pregunta propia.
- Incluye lo que estaba sin commit de v4 y v4.1 (tabla Indicadores mes a mes, Alarmas junto a la serie, Tabla copiable)
  y `nube.js`/`nube.css`.
- Gráficos de líneas nuevos (`GRAF.lineas` en `graficos.js`, la misma copia en Factura, Soporte-FM y Digital): curva suave
  que no inventa picos entre meses, área en degradado y resplandor del color de la serie. Al entrar en pantalla la línea se
  traza con un cometa, cada punto aparece cuando la línea llega a él y la cifra final, en píldora, cuenta hasta su valor; el
  último punto late unos segundos. Mes elegido en píldora oscura. Redibujar con los mismos datos (tamaño, tema) no repite la
  animación; al imprimir o con «reducir movimiento» se ve quieto.
- Sparks de los KPI con curva suave, más color en el área y un punto final que late.

## 2026-11-13 · v3

- Gráficos animados con Motion (`tablero/vendor/motion.js`, copia local: funciona sin internet). La librería
  `tablero/graficos.js` + `graficos.css` es la misma en los tableros Factura y Soporte-FM; si se cambia una copia, copiar a la otra.
- Escala evaluativa de 9 tonos: rojo intenso (lo peor) → verde sobrio (lo mejor), en claro y oscuro. Los colores de serie
  (Hogar/Móvil) no cambian. Los tonos intermedios van en rosa/coral para no confundirse con el naranja de serie.
- Más variedad: anillo en cada KPI, cifras que cuentan, tendencias de área, barras divergentes 1–5 que crecen desde el centro,
  cuadrícula de 100 cuadritos para el NPS, donas sí/no, columnas apiladas, motivos como paletas, relojes, brecha en columnas
  y rankings coloreados según la diferencia contra el total.
- Cada panel se anima al entrar en pantalla; al imprimir, con «reducir movimiento» o sin motion.js todo se ve en su estado final.
- Ninguna cifra cambia: se comprobaron todos los números de tooltips y textos contra la versión anterior.

## 2026-11-13 · v2.1

- El filtro de segmento sale de las pastillas y queda junto al mes, como botones «Todos · Masivo · Corporativo» en violeta
  (un color que no usa ningún dato). Mientras está en «Todos» late suave tres veces al abrir, para recordar que las cifras
  mezclan los dos segmentos.
- Entre 1300 y 1500 px el botón «Descargar base» queda solo con el ícono, para que la barra quepa en una línea.

## 2026-11-13 · v2

- Factura y pago cambia de fuente: ahora llega cada mes desde `TBL_ENCUESTAS_BRM` (estudios Factura y Pago Fijo, Móvil,
  Fijo PYME y Móvil PYME) cruzada con `TBL_CLIENTES_BRM`, y se guarda en la misma tabla del tablero
  (`etl/cargar_brm.py`, que `etl.construir` corre primero). El mes sale de `FECHA_REGISTRADA`.
- Primera carga: 891 encuestas nuevas (PYME sep–oct y noviembre hasta el corte); las 1.620 de sep–oct que ya estaban
  coinciden con BRM en todas las notas, motivos, comentarios, fechas y regiones.
- Nuevo filtro «Segmento»: Masivo (Fijo y Móvil) y Corporativo (Fijo PYME y Móvil PYME), también en la base descargable.
- La pregunta CSAT de factura se llama «Satisfacción con el valor facturado», como viene en BRM.
- Tapado de nombres más estricto: separa los renglones que BRM pega («móvilANGELA») y tapa nombres de cualquier encuesta
  del corte, no solo los del propio cliente (en PYME el NOMBRE es la empresa y el comentario nombra a la persona).
  Esto quitó tres nombres de comentarios PYME de septiembre y uno que ya venía de la v1.
- La sincronización valida el contrato de calidad antes de escribir en Oracle: si BRM trae una nota fuera de escala,
  no se escribe nada.

## 2026-11-12 · v1.2

- La correlación con el NPS muestra solo el valor, en verde (fuerte), amarillo (moderada) o rojo (baja); la explicación va en el globo al pasar el cursor.

## 2026-11-12 · v1.1

- El recorrido del cliente muestra, junto al n, la correlación de cada indicador con el NPS (Pearson, encuesta por encuesta).
  En octubre la más alta es la satisfacción con la factura (0,63) y la más baja la seguridad al pagar (0,10).
- El filtro de mes pasa a casillas: se pueden elegir varios meses, con atajos «Solo el último» y «Todos». La URL guarda la selección.
- La página se llama `tablero_Factura.html` (antes `index.html`).

## 2026-11-12 · v1

- ETL desde Oracle `INVITADO_15.TBL_ENC_FACTURA_PAGO_COBRO` (sep y oct 2026, 2.854 encuestas) con contrato de calidad,
  tapado de datos personales y prueba que cuadra n, NPS, CSAT y CES por estudio y mes con un SQL directo a la tabla.
- Tablero con seis pestañas: Resumen (KPI, recorrido del cliente, tendencia, dolores y comentarios), Factura, Pago, Cobranza,
  Voces y Calidad. Tiene filtros de mes, proceso, negocio, región, casa de cobro y canal, que quedan en la URL.
- Descarga de la base filtrada en Excel, CSV o Parquet.
- Publicado en la carpeta del tablero de NPS Factura (419/508), que reemplaza; la página se llama tablero_Factura.html. El remoto anterior quedó respaldado en `data/respaldo_publicado/`.
- Octubre: NPS 35,1 (Hogar 29,7 y Móvil 40,5), CSAT factura 70,1 %, CSAT pago 86,5 %, CSAT información de cobranza 73,4 %.
