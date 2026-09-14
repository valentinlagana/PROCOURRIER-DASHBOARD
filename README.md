# ProCourrier · Cotizador de envíos AMBA

Cotizador por zonas para CABA y GBA. El vendedor ubica su depósito y el mapa
pinta las **4 tarifas**: la Tarifa 1 es la más cercana y el precio sube a
medida que el envío se aleja.

## Cómo correrlo

El mapa de zonas se carga por `fetch`, así que hace falta un servidor local
(abrir el `index.html` con doble click no alcanza):

```bash
python3 -m http.server 8000
# abrir http://localhost:8000
```

No hay build ni dependencias que instalar.

## El modelo de precios

Precios vigentes, iguales para toda la red:

| Tarifa | Alcance | Precio |
|---|---|---|
| T1 | hasta 9,5 km | $ 4.490 |
| T2 | 9,5 a 21,5 km | $ 6.490 |
| T3 | 21,5 a 43,5 km | $ 8.690 |
| T4 | todo el resto de la red | $ 9.990 |

Dos reglas de negocio se aplican **antes** que la distancia:

1. La zona del propio depósito es siempre Tarifa 1.
2. Para un depósito en CABA, toda la Capital es Tarifa 1 (verificado sobre los
   306 códigos postales porteños: el 100% se factura T1).

Fuera de esas reglas, la tarifa sale de la distancia en línea recta entre el
depósito y el punto de referencia de la zona de destino. Una dirección paga lo
que paga su barrio o partido, para que dos envíos a la misma localidad no
salgan distinto por unas cuadras.

### De dónde salen los cortes

Los radios están calibrados contra la facturación real (`TARIFAS_POR_CLIENTE_ZONADEST`
cruzado con `CLIENTE_PARTIDO`): **reproducen el tramo cobrado en el 91,7% de
62.933 envíos**. Los tramos son relativos al origen, lo que el dato confirma:
el mismo CP se cobra distinto según de dónde salga el paquete (CP 1407 es T1
desde CABA, T2 desde Lomas de Zamora y T3 desde Burzaco).

Comparado zona por zona desde un depósito en CABA, el modelo acierta 36 de 42
partidos. Las 6 diferencias conocidas:

| Zona | Real | Modelo |
|---|---|---|
| Ituzaingó | T2 | T3 |
| Escobar (y Garín, Ing. Maschwitz) | T4 | T3 |
| Guernica | T4 | T3 |
| Marcos Paz | T4 | T3 |

Son todas de borde: la red tiene excepciones puestas a mano que un corte por
distancia no puede capturar. Para eliminarlas habría que usar la tabla real
origen × zona donde existe, y la distancia sólo para depósitos nuevos.

## Área de cobertura

85 zonas con servicio: 48 barrios de CABA y 37 partidos del GBA. La red llega
hasta **Luján, Dique Luján (Tigre), Zárate, Campana y La Plata** por el sur.

La red cobra distinto el norte y el sur de La Matanza (desde CABA, T2 y T3),
pero el partido va entero: no existe un límite oficial entre ambas mitades y
dibujar uno inventado daría un mapa que no corresponde con la realidad. Para
separarlas hacen falta los límites de localidad, que ninguna fuente pública
publica como polígono para el conurbano.

Brandsen, Exaltación de la Cruz, General Las Heras, Navarro y San Andrés de
Giles se dibujan para dar contexto geográfico pero están marcados fuera de la
red: nunca reciben precio.

## Qué hace la app

| | |
|---|---|
| **Depósito de origen** | Buscador de direcciones de CABA/GBA, click en el mapa o arrastrar el marcador. |
| **Las 4 tarifas** | Radios de T1 a T3 y los 4 precios, editables. El mapa se repinta al instante. |
| **Cotizar un envío** | Dirección de destino → tarifa, precio y distancia. |
| **Cobertura por tarifa** | Qué barrios y partidos caen en cada zona, con exportación a CSV. |
| **Vistas** | `Anillos` (distancia pura), `Zonas` (barrios y partidos pintados) o `Ambas`. |

Lo último configurado queda guardado en el navegador (`localStorage`).

## Datos geográficos

`data/amba.geojson` (~306 KB, 90 polígonos):

- **48 barrios de CABA** — datos abiertos del Gobierno de la Ciudad.
- **37 partidos con servicio + 5 de contexto** — IGN (WFS de departamentos).

Los bordes se simplifican con una tolerancia de 0,0001° (~11 m), así que
coinciden con los límites oficiales incluso con mucho zoom.

El centroide geométrico de San Fernando y Tigre cae en las islas del Delta, y
el de La Plata en su sur rural; para esos partidos el punto de referencia es la
cabecera, que es donde se reparte.

Para regenerarlo, editá `scripts/build_geo.py` y corrélo (necesita `shapely`).

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
data/amba.geojson     Zonas de CABA y GBA
scripts/build_geo.py  Genera el geojson desde las fuentes oficiales
```
