# -*- coding: utf-8 -*-
"""Arma una sola imagen del mapa base del AMBA, pegando los tiles de Esri.
Se incrusta en la página publicada, que no puede pedir imágenes externas."""
import math, io, os, requests
from concurrent.futures import ThreadPoolExecutor
from PIL import Image

Z = 11
# Cubre todo lo que se dibuja, islas del Delta incluidas, con un margen.
LAT1, LON1, LAT2, LON2 = -33.76, -59.88, -35.48, -57.66
BASE = 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile'
REF  = 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile'

n = 2 ** Z
def a_xy(lat, lon):
    x = (lon + 180) / 360 * n
    y = (1 - math.log(math.tan(math.radians(lat)) + 1 / math.cos(math.radians(lat))) / math.pi) / 2 * n
    return x, y

def a_lonlat(x, y):
    lon = x / n * 360 - 180
    lat = math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * y / n))))
    return lon, lat

x0f, y0f = a_xy(LAT1, LON1); x1f, y1f = a_xy(LAT2, LON2)
X0, Y0, X1, Y1 = int(x0f), int(y0f), int(x1f), int(y1f)
NX, NY = X1 - X0 + 1, Y1 - Y0 + 1
print(f'{NX}x{NY} = {NX*NY} tiles')

ses = requests.Session()
ses.headers['User-Agent'] = 'ProCourrier/0.1'

def bajar(args):
    url, x, y = args
    for _ in range(3):
        try:
            r = ses.get(f'{url}/{Z}/{y}/{x}', timeout=30, verify='/root/.ccr/ca-bundle.crt')
            if r.ok: return x, y, Image.open(io.BytesIO(r.content)).convert('RGBA')
        except Exception: pass
    return x, y, None

lienzo = Image.new('RGBA', (NX * 256, NY * 256), (232, 236, 241, 255))
for url in (BASE, REF):
    trabajos = [(url, x, y) for x in range(X0, X1 + 1) for y in range(Y0, Y1 + 1)]
    fallos = 0
    with ThreadPoolExecutor(12) as pool:
        for x, y, im in pool.map(bajar, trabajos):
            if im is None: fallos += 1; continue
            lienzo.alpha_composite(im, ((x - X0) * 256, (y - Y0) * 256))
    print(('base' if url == BASE else 'etiquetas'), 'fallos:', fallos)

# Bordes exactos de la imagen, para ubicarla en el mapa.
lon_min, lat_max = a_lonlat(X0, Y0)
lon_max, lat_min = a_lonlat(X1 + 1, Y1 + 1)
print(f'bbox lon {lon_min:.6f}..{lon_max:.6f} lat {lat_min:.6f}..{lat_max:.6f}')
open('basemap_bbox.txt', 'w').write(f'{lon_min} {lon_max} {lat_min} {lat_max}')

lienzo.convert('RGB').save('basemap.jpg', quality=78, optimize=True, progressive=True)
print('basemap.jpg', os.path.getsize('basemap.jpg'), 'bytes', lienzo.size)
