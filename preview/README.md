# Versión autocontenida

Copia del cotizador que no pide nada a la red: el mapa base es una sola imagen
(`basemap.jpg`, tiles de Esri pegados por `scripts/build_basemap.py`) y las
zonas van embebidas en `amba.js`.

Se usa para publicarla como página estática donde no se pueden cargar tiles ni
consultar el buscador de direcciones. Ahí el depósito se elige de una lista de
barrios y partidos, o con un click en el mapa.

La versión de la raíz del repo es la buena: mapa base en vivo y buscador de
direcciones por calle y altura.

Para regenerar la imagen del mapa base:

```bash
pip install pillow requests
python3 scripts/build_basemap.py
```
