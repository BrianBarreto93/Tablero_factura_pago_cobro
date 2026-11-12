# Cambios

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
