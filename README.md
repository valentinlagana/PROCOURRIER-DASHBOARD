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

Tarifario vigente desde el **1 de septiembre de 2026**, en dos modalidades y
tres escalones por volumen semanal. El escalón se aplica solo sobre la
liquidación de la semana, sin avisar ni firmar nada.

**Factura A** — valores netos, el IVA se discrimina (entre paréntesis, el final):

| Envíos por semana | T1 domicilio | T2 cercana | T3 lejana | T4 muy lejana |
|---|---|---|---|---|
| Hasta 200 | 4.124 (4.990) | 5.777 (6.990) | 7.430 (8.990) | 8.669 (10.490) |
| Más de 200 | 3.917 (4.740) | 5.488 (6.640) | 7.058 (8.540) | 8.240 (9.970) |
| Más de 300 | 3.711 (4.490) | 5.198 (6.290) | 6.686 (8.090) | 7.802 (9.440) |

**Sin factura** — el valor de la tabla es el final, no se le suma nada:

| Envíos por semana | T1 | T2 | T3 | T4 |
|---|---|---|---|---|
| Hasta 200 | 4.590 | 6.430 | 8.270 | 9.650 |
| Más de 200 | 4.340 | 6.080 | 7.820 | 9.130 |
| Más de 300 | 4.090 | 5.730 | 7.370 | 8.600 |

Colecta bonificada desde 10 envíos diarios; por debajo, $6.000 + IVA por día.

### Quién define la zona

**Las zonas las define Mercado Envíos Flex, no ProCourrier**: se toman tal cual
figuran en la liquidación de Mercado Libre. El mapa es una *estimación* de qué
tarifa le va a tocar a cada barrio o partido, no la asignación oficial.

Tres reglas se aplican antes que la distancia:

1. La zona del propio depósito es siempre Tarifa 1.
2. Para un depósito en CABA, toda la Capital es Tarifa 1 (verificado sobre los
   306 códigos postales porteños: el 100% se factura T1).
3. **Toda CABA es una sola zona.** Los 306 códigos postales porteños reciben el
   mismo tramo desde un mismo origen, sin una sola excepción en la facturación.
   Por eso la distancia a la Capital se mide a su centro y no a cada barrio: de
   otro modo el mapa la partía en dos o tres tarifas desde 25 de los 37 partidos.
   Medida contra la facturación real, esta referencia acierta el 97% de los
   envíos a CABA, que es el destino más grande con 16.546 envíos.

Fuera de esas reglas, la tarifa sale de la distancia en línea recta entre el
depósito y el punto de referencia de la zona de destino. Una dirección paga lo
que paga su barrio o partido, para que dos envíos a la misma localidad no
salgan distinto por unas cuadras.

### Qué tan bien funciona

Auditado localidad por localidad contra la facturación real (43 zonas de destino
por 18 orígenes): **91,7% de 62.933 envíos quedan en el tramo correcto**.

Los radios 9,5 / 21,5 / 43,5 km son el techo de lo que puede dar un modelo por
distancia: una búsqueda exhaustiva con paso de 0,1 km llega a 92,3% y ese medio
punto sale de casos que caen justo sobre un corte, así que es sobreajuste.

El límite no es el modelo: **el 8,9% de las comparaciones contradice la
distancia**. Zárate se cobra T4 desde CABA (68 km) y T3 desde Burzaco (90 km);
Escobar es T4 desde CABA (44 km) y T3 desde Burzaco (66 km). Las zonas las
define Mercado Envíos Flex, y no son una función de la distancia.

Seis localidades fallan de forma sistemática:

| Localidad | Real | Modelo | Por qué |
|---|---|---|---|
| Ituzaingó | T2 | T3 | está a 21,6 km de CABA, 100 m más que el corte |
| Guernica, Marcos Paz | T4 | T3 | a 36-40 km de CABA, pero T3 desde orígenes más lejanos |
| Del Viso, Derqui | T4 | T3 | ídem; además son localidades dentro de Pilar |
| Ing. Maschwitz | T4 | T3 | ídem; es una localidad dentro de Escobar |

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

**47 zonas tarifarias**, las del mapa de cobertura de ProCourrier:

CABA · Zárate · Campana · Escobar · Garín · Ingeniero Maschwitz · Pilar ·
Del Viso · Derqui · Villa Rosa · Tigre · Nordelta · San Fernando · San Isidro ·
Vicente López · San Martín · Tres de Febrero · Malvinas Argentinas ·
José C Paz · San Miguel · Moreno · General Rodríguez · Luján · Merlo ·
Marcos Paz · Ituzaingó · Morón · Hurlingham · La Matanza Norte ·
La Matanza Sur · Avellaneda · Lanús · Lomas de Zamora · Almirante Brown ·
Esteban Echeverría · Ezeiza · Quilmes · Berazategui · Florencio Varela ·
Guernica · San Vicente · Cañuelas · Ensenada · Berisso · La Plata Norte ·
La Plata Centro · La Plata Oeste.

Una zona no es siempre un partido. Algunas son una localidad suelta porque la
red las cobra aparte (Garín, Del Viso, Derqui, Villa Rosa, Ingeniero
Maschwitz, Nordelta) y otras son un pedazo de partido: La Plata se divide en
Norte, Centro y Oeste, y La Matanza en Norte y Sur.

### Lo que queda afuera

**El Delta.** Primera, Segunda y Tercera Sección —las islas de Tigre y San
Fernando— no se circulan en vehículo. Son 1.470 km² que el mapa marcaba como
cubiertos y ahora van en gris.

**Todas las islas.** No sólo el Delta: el build recorta cada zona a tierra
firme. Arma el continente restando la barrera del Delta —el Paraná de las
Palmas, el Río de la Plata y las tres Secciones, en `data/agua.geojson`— y se
queda con la masa de tierra más grande; lo que caiga afuera pasa a dibujarse
como Delta sin servicio.

El Río Luján **no** va en la barrera: la franja entre el Luján y el Paraná de
las Palmas (Dique Luján, Villa La Ñata, la costa de Tigre y San Fernando) es
tierra firme y tiene reparto. Ponerlo la dejaba afuera por error.

Hacía falta porque varias localidades de OpenStreetMap incluyen islas: la
localidad San Fernando venía con 44 piezas y sólo 24 de sus 67 km² eran la
ciudad. Después del recorte: San Fernando 24 km², Tigre 137, Escobar 259,
Campana 368 y Zárate 564.

**Cinco partidos sin servicio**, que se dibujan sólo para dar contexto:
Brandsen, Exaltación de la Cruz (con Capilla del Señor, Los Cardales y Parada
Orlando), General Las Heras, Navarro y San Andrés de Giles.

## Qué hace la app

| | |
|---|---|
| **Depósito de origen** | Buscador de direcciones de CABA/GBA, click en el mapa o arrastrar el marcador. |
| **Tu operación** | Envíos por semana y modalidad de facturación: de ahí sale el escalón. |
| **Tus tarifas** | Los 4 precios del escalón vigente, con el neto y el final. |
| **Cotizar un envío** | Dirección de destino → tarifa, precio y distancia. |
| **Cobertura por tarifa** | Qué barrios y partidos caen en cada zona, con exportación a CSV. |
| **Vistas** | `Anillos` (distancia pura), `Zonas` (barrios y partidos pintados) o `Ambas`. |

Lo último configurado queda guardado en el navegador (`localStorage`).

## Datos geográficos

`data/amba.geojson` (~317 KB, 100 polígonos: 47 zonas tarifarias más las de contexto):

- **48 barrios de CABA** — datos abiertos del Gobierno de la Ciudad.
- **263 localidades y partidos del GBA** — límites de partido del IGN (WFS de
  departamentos) subdivididos con los límites de localidad de OpenStreetMap
  (`admin_level=8`, el mismo nivel que rotula Google Maps).

Los bordes se simplifican con una tolerancia de 0,0001° (~11 m), así que
coinciden con los límites oficiales incluso con mucho zoom.

La Isla Martín García pertenece al partido de La Plata pero queda a 100 km, en
medio del río y sólo accesible por lancha: el build descarta las piezas
menores a 5 km² separadas más de 0,3° del resto del partido, para que no se
pinten como zona con servicio.

El centroide geométrico de San Fernando y Tigre cae en las islas del Delta, y
el de La Plata en su sur rural; para esos partidos el punto de referencia es la
cabecera, que es donde se reparte.

Para regenerarlo:

```bash
python3 scripts/build_geo.py          # partidos y barrios -> data/partidos.geojson
python3 scripts/fetch_localidades.py  # localidades desde OpenStreetMap
npx osmtogeojson localidades_osm.json > localidades_raw.geojson
python3 scripts/build_localidades.py  # las une -> data/localidades.geojson
python3 scripts/build_zonas.py        # las agrupa en las 47 zonas tarifarias
```

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
