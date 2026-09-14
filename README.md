# ProCourrier · Cotizador de envíos AMBA

Cotizador por zonas para CABA y GBA. El vendedor ubica su depósito y el mapa
pinta las **4 tarifas**: la Tarifa 1 es la más cercana y el precio sube a
medida que el envío se aleja.

> Estado: **borrador de diseño**. Los radios y precios cargados son de muestra
> y están pensados para que los reemplaces con los números reales.

## Cómo correrlo

El mapa de zonas se carga por `fetch`, así que hace falta un servidor local
(abrir el `index.html` con doble click no alcanza):

```bash
python3 -m http.server 8000
# abrir http://localhost:8000
```

No hay build ni dependencias que instalar.

## Qué hace

| | |
|---|---|
| **Depósito de origen** | Buscador de direcciones de CABA/GBA, click en el mapa o arrastrar el marcador. |
| **Las 4 tarifas** | Radio (km) y precio de cada una, editables. El mapa se repinta al instante. |
| **Cotizar un envío** | Dirección de destino → tarifa, precio y distancia. |
| **Cobertura por tarifa** | Qué barrios y partidos cae en cada zona, con exportación a CSV. |
| **Vistas** | `Anillos` (distancia pura), `Zonas` (barrios y partidos pintados) o `Ambas`. |

Lo último configurado queda guardado en el navegador (`localStorage`).

## Cómo se calcula el precio

1. Se mide la distancia en línea recta entre el depósito y el destino.
2. Se multiplica por el **factor de recorrido** (1,30 por defecto) para
   aproximar los km reales de calle, que siempre son más que la línea recta.
3. Esa distancia cae en una de las 4 tarifas. Si supera el radio de la
   Tarifa 4, el envío queda **fuera de cobertura**.

**Una dirección paga lo que paga su barrio.** Cuando el destino cae dentro de
un barrio de CABA o un partido del GBA, la tarifa sale del color de esa zona en
el mapa (calculado sobre el punto representativo del polígono) y no de los
metros exactos de la dirección. Así dos envíos a la misma localidad nunca salen
distinto por estar a unas cuadras uno del otro.

## Datos geográficos

`data/amba.geojson` (~94 KB) trae 90 polígonos simplificados:

- **48 barrios de CABA** — datos abiertos del Gobierno de la Ciudad.
- **42 partidos del GBA** — IGN (WFS de departamentos), primer, segundo y
  tercer cordón, cada uno etiquetado con su `cordon`.

Para regenerarlo o cambiar qué partidos entran, editá el diccionario `CORDON`
en `scripts/build_geo.py` y corré el script (necesita `shapely`).

## Servicios externos

- **Mapa base**: Esri World Light Gray, sin API key.
- **Buscador de direcciones**: Nominatim (OpenStreetMap), acotado al AMBA.
  Es gratis pero tiene límite de ~1 consulta por segundo y no está pensado
  para producción; si el volumen crece conviene pasar a Google Geocoding,
  HERE o Mapbox.

## Estructura

```
index.html            Estructura de la página
assets/styles.css     Diseño
assets/app.js         Mapa, tarifas y cotización
data/amba.geojson     Barrios de CABA + partidos del GBA
scripts/build_geo.py  Genera el geojson desde las fuentes oficiales
```
