# -*- coding: utf-8 -*-
"""Arma data/amba.geojson a nivel localidad.

Toma los límites de localidad de OpenStreetMap (admin_level=8 en Argentina, que
es lo que Google Maps rotula: Garín, Del Viso, Don Torcuato…), los asigna a su
partido y completa con el resto del partido donde OSM no tiene localidades
mapeadas. Los barrios de CABA salen de los datos abiertos del GCBA.

Entrada:  localidades_raw.geojson (ver scripts/fetch_localidades.py)
          data/partidos.geojson  (salida de build_geo.py)
"""
import json, os, unicodedata
from shapely.geometry import shape, mapping
from shapely.ops import unary_union

AQUI = os.path.dirname(__file__)
DATA = os.path.join(AQUI, '..', 'data')
SCRATCH = os.environ.get('PC_SCRATCH', '.')

# El Delta no se reparte: son islas y se llega sólo por lancha.
FUERA_DE_RED = {'Primera Sección', 'Segunda Sección', 'Tercera Sección',
                'Isla Martín García', 'Delta del Paraná'}

# Localidad mínima para que valga la pena dibujarla aparte; lo más chico
# (countries, barrios cerrados) se absorbe en el resto del partido.
MIN_KM2 = 0.5
TOL_LOC = 0.0002      # ~22 m
TOL_PART = 0.0002
KM2 = 111.32 ** 2

def norm(s):
    return ''.join(c for c in unicodedata.normalize('NFD', s) if unicodedata.category(c) != 'Mn').lower()

def km2(g, lat):
    import math
    return g.area * KM2 * math.cos(math.radians(lat))

def redondear(o, nd=5):
    if isinstance(o, (list, tuple)): return [redondear(x, nd) for x in o]
    if isinstance(o, float): return round(o, nd)
    return o

def salida(nombre, g, region, cordon, en_red, partido=None, comuna=None, tol=TOL_LOC):
    g = g.simplify(tol, preserve_topology=True)
    r = g.representative_point()
    props = {'nombre': nombre, 'region': region, 'cordon': cordon, 'enRed': en_red,
             'lat': round(r.y, 5), 'lon': round(r.x, 5)}
    if partido: props['partido'] = partido
    if comuna is not None: props['comuna'] = comuna
    return {'type': 'Feature', 'properties': props, 'geometry': redondear(mapping(g))}

def main():
    base = json.load(open(os.path.join(DATA, 'partidos.geojson'), encoding='utf-8'))
    locs = json.load(open(os.path.join(SCRATCH, 'localidades_raw.geojson'), encoding='utf-8'))

    partidos = {f['properties']['nombre']: (shape(f['geometry']).buffer(0), f['properties'])
                for f in base['features'] if f['properties']['region'] == 'GBA'}

    # Cada localidad al partido que la contiene; lo que no cae en ninguno se
    # descarta (el bbox de la consulta llega hasta Uruguay).
    porPartido = {n: [] for n in partidos}
    for f in locs['features']:
        try: g = shape(f['geometry']).buffer(0)
        except Exception: continue
        if g.is_empty: continue
        r = g.representative_point()
        dueño = next((n for n, (pg, _) in partidos.items() if pg.contains(r)), None)
        if dueño is None: continue
        if km2(g, r.y) < MIN_KM2: continue
        porPartido[dueño].append((f['properties'].get('name') or dueño, g))

    feats = []
    for nombre, (pg, props) in partidos.items():
        piezas, usadas = [], []
        for nom, g in porPartido[nombre]:
            recorte = g.intersection(pg)          # la localidad no se sale del partido
            if recorte.is_empty: continue
            piezas.append([nom, recorte])
            usadas.append(recorte)

        # Lo que OSM no tiene mapeado va al resto del partido; si ya existe una
        # localidad que se llama igual que el partido, se le suma en vez de
        # quedar como una zona duplicada.
        resto = pg.difference(unary_union(usadas)) if usadas else pg
        if not resto.is_empty and km2(resto, props['lat']) > 1.5:
            misma = next((q for q in piezas if norm(q[0]) == norm(nombre)), None)
            if misma: misma[1] = unary_union([misma[1], resto])
            else: piezas.append([nombre, resto])

        for nom, g in piezas:
            en_red = props['enRed'] and nom not in FUERA_DE_RED
            feats.append(salida(nom, g, 'GBA', props['cordon'], en_red, partido=nombre))

    for f in base['features']:
        if f['properties']['region'] != 'CABA': continue
        p = f['properties']
        feats.append(salida(p['nombre'], shape(f['geometry']), 'CABA', 0, p['enRed'],
                            comuna=p.get('comuna')))

    ruta = os.path.join(DATA, 'amba.geojson')
    json.dump({'type': 'FeatureCollection', 'features': feats},
              open(ruta, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))

    red = sum(1 for f in feats if f['properties']['enRed'])
    caba = sum(1 for f in feats if f['properties']['region'] == 'CABA')
    print(f'zonas: {len(feats)} | CABA: {caba} | GBA: {len(feats)-caba}')
    print(f'con servicio: {red} | fuera: {len(feats)-red} | {os.path.getsize(ruta)} bytes')

main()
