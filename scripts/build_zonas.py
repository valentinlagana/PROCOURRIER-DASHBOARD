# -*- coding: utf-8 -*-
"""Arma data/amba.geojson con las zonas tarifarias reales de ProCourrier.

Toma las localidades de build_localidades.py y las agrupa en las 47 zonas del
mapa de cobertura: algunas son un partido entero, otras una sola localidad
(Garín, Del Viso, Nordelta) y otras un pedazo de partido (La Plata Norte,
Centro y Oeste; La Matanza Norte y Sur).

El Delta queda fuera: no se circula en vehículo. Zárate y Campana se recortan
a tierra firme restando el Paraná y quedándose con la parte donde está la
ciudad, para no prometer las islas.
"""
import json, os
from shapely.geometry import shape, mapping
from shapely.ops import unary_union

AQUI = os.path.dirname(__file__)
DATA = os.path.join(AQUI, '..', 'data')

TODO = '*'   # todas las localidades del partido

# Cada zona del mapa de cobertura: partido -> localidades que la forman.
ZONAS = [
    ('Zárate',              'Zárate',               TODO),
    ('Campana',             'Campana',              TODO),
    ('Escobar',             'Escobar',              ['Belén de Escobar','Escobar','El Cazador','Loma Verde','Maquinista Savio','Matheu']),
    ('Garín',               'Escobar',              ['Garín']),
    ('Ingeniero Maschwitz', 'Escobar',              ['Ingeniero Maschwitz']),
    ('Pilar',               'Pilar',                ['Pilar','Pilar Sur','Champagnat','Fátima','La Lonja','Lagomarsino','Manuel Alberti','Manzanares','Manzone','San Francisco','Villa Astolfi','Zelaya']),
    ('Del Viso',            'Pilar',                ['Del Viso']),
    ('Derqui',              'Pilar',                ['Presidente Derqui']),
    ('Villa Rosa',          'Pilar',                ['Villa Rosa']),
    ('Tigre',               'Tigre',                ['Tigre','Benavídez','Dique Luján','Don Torcuato','El Talar','General Pacheco','Ricardo Rojas','Rincón de Milberg','Troncos del Talar']),
    ('Nordelta',            'Tigre',                ['Nordelta']),
    ('San Fernando',        'San Fernando',         ['San Fernando','Victoria','Virreyes']),
    ('San Isidro',          'San Isidro',           TODO),
    ('Vicente López',       'Vicente López',        TODO),
    ('San Martín',          'General San Martín',   TODO),
    ('Tres de Febrero',     'Tres de Febrero',      TODO),
    ('Malvinas Argentinas', 'Malvinas Argentinas',  TODO),
    ('José C Paz',          'José C. Paz',          TODO),
    ('San Miguel',          'San Miguel',           TODO),
    ('Moreno',              'Moreno',               TODO),
    ('General Rodríguez',   'General Rodríguez',    TODO),
    ('Luján',               'Luján',                TODO),
    ('Merlo',               'Merlo',                TODO),
    ('Marcos Paz',          'Marcos Paz',           TODO),
    ('Ituzaingó',           'Ituzaingó',            TODO),
    ('Morón',               'Morón',                TODO),
    ('Hurlingham',          'Hurlingham',           TODO),
    ('La Matanza Norte',    'La Matanza',           ['San Justo','Ramos Mejía','Villa Luzuriaga','Lomas del Mirador','La Tablada','Tapiales','Aldo Bonzi','Villa Madero','Villa Celina','Ciudad Evita']),
    ('La Matanza Sur',      'La Matanza',           ['Isidro Casanova','Rafael Castillo','Gregorio de Laferrere','González Catán','Veinte de Junio','Virrey Del Pino']),
    ('Avellaneda',          'Avellaneda',           TODO),
    ('Lanús',               'Lanús',                TODO),
    ('Lomas de Zamora',     'Lomas de Zamora',      TODO),
    ('Almirante Brown',     'Almirante Brown',      TODO),
    ('Esteban Echeverría',  'Esteban Echeverría',   TODO),
    ('Ezeiza',              'Ezeiza',               TODO),
    ('Quilmes',             'Quilmes',              TODO),
    ('Berazategui',         'Berazategui',          TODO),
    ('Florencio Varela',    'Florencio Varela',     TODO),
    ('Guernica',            'Presidente Perón',     TODO),
    ('San Vicente',         'San Vicente',          TODO),
    ('Cañuelas',            'Cañuelas',             TODO),
    ('Ensenada',            'Ensenada',             TODO),
    ('Berisso',             'Berisso',              TODO),
    ('La Plata Norte',      'La Plata',             ['Tolosa','Ringuelet','Manuel B. Gonnet','Joaquín Gorina','José Hernández','Villa Castells','City Bell','Villa Elisa','Arturo Seguí','El Rincón','Savoia','Los Porteños']),
    ('La Plata Centro',     'La Plata',             ['La Plata','Altos de San Lorenzo','Los Hornos','San Carlos','Villa Elvira','Eduardo Arana','Villa Garibaldi - Parque Sicardi']),
    ('La Plata Oeste',      'La Plata',             ['Melchor Romero','Lisandro Olmos','Abasto','Colonia Urquiza','Ángel Etcheverry','El Peligro','Malvinas Argentinas']),
]

# Zonas que se dibujan para dar contexto pero no tienen servicio.
SIN_SERVICIO = [
    ('Delta del Paraná', ['Primera Sección','Segunda Sección','Tercera Sección']),
    ('Exaltación de la Cruz', None), ('Brandsen', None),
    ('General Las Heras', None), ('Navarro', None), ('San Andrés de Giles', None),
]

# Cualquier pedazo de zona separado del continente por agua es una isla: no se
# llega en vehículo. Se recorta todo contra tierra firme y las piezas que caen
# se suman al Delta, para que el mapa las muestre marcadas como sin servicio.
ISLA_MIN_KM2 = 0.5

def redondear(o, nd=5):
    if isinstance(o, (list, tuple)): return [redondear(x, nd) for x in o]
    if isinstance(o, float): return round(o, nd)
    return o

def continente(zonas, barrera):
    """Tierra firme: todo el territorio menos la barrera del Delta (el Paraná de
    las Palmas, el Luján, el Río de la Plata y las tres Secciones), quedándose
    con la masa más grande. Las islas quedan afuera por definición."""
    seco = unary_union(zonas).buffer(0).difference(barrera)
    if seco.geom_type != 'MultiPolygon': return seco
    return max(seco.geoms, key=lambda q: q.area)

def solo_poligonos(g):
    """Una intersección puede devolver líneas o puntos sueltos; se descartan."""
    if g.geom_type in ('Polygon', 'MultiPolygon'): return g
    partes = [q for q in getattr(g, 'geoms', []) if q.geom_type in ('Polygon', 'MultiPolygon')]
    return unary_union(partes) if partes else g

def sin_astillas(g, minimo=0.02):
    """Recortar contra tierra deja esquirlas de metros: no valen como zona."""
    if g.geom_type != 'MultiPolygon': return g
    grandes = [q for q in g.geoms if km2(q, q.centroid.y) >= minimo]
    return unary_union(grandes) if grandes else max(g.geoms, key=lambda q: q.area)

def km2(g, lat):
    import math
    return g.area * (111.32 ** 2) * math.cos(math.radians(lat))

def main():
    src = json.load(open(os.path.join(DATA, 'localidades.geojson'), encoding='utf-8'))
    agua = shape(json.load(open(os.path.join(DATA, 'agua.geojson'), encoding='utf-8'))['features'][0]['geometry']).buffer(0)

    todas = [shape(f['geometry']).buffer(0) for f in src['features'] if f['properties']['region'] == 'GBA']
    # Las tres Secciones son el Delta propiamente dicho: cuentan como barrera,
    # porque las islas de San Fernando quedan del otro lado de ellas.
    secciones = unary_union([shape(f['geometry']).buffer(0) for f in src['features']
                             if f['properties']['nombre'] in
                             ('Primera Sección', 'Segunda Sección', 'Tercera Sección')])
    barrera = unary_union([agua, secciones])
    tierra = continente(todas, barrera)

    porPartido = {}
    caba = []
    for f in src['features']:
        p = f['properties']
        if p['region'] == 'CABA': caba.append(f); continue
        porPartido.setdefault(p['partido'], {})[p['nombre']] = f

    feats, usadas, islas = [], set(), []

    def agregar(nombre, geoms, en_red, cordon):
        g = unary_union([shape(x['geometry']).buffer(0) for x in geoms])
        if en_red:
            # La zona se queda con lo que está sobre tierra firme. Todo lo demás
            # es isla del Delta y pasa a dibujarse como sin servicio.
            firme = g.intersection(tierra)
            suelto = g.difference(tierra).difference(agua)
            if not suelto.is_empty and km2(suelto, g.centroid.y) > ISLA_MIN_KM2:
                islas.append(suelto)
                print(f'  {nombre}: -{km2(suelto, g.centroid.y):.0f} km² de islas')
            g = solo_poligonos(firme)
        g = sin_astillas(solo_poligonos(g))
        if g.is_empty: print(f'  OJO {nombre}: quedó vacía'); return
        g = g.simplify(0.0002, preserve_topology=True)
        r = g.representative_point()
        feats.append({'type': 'Feature', 'geometry': redondear(mapping(g)),
                      'properties': {'nombre': nombre, 'region': 'GBA', 'cordon': cordon,
                                     'enRed': en_red, 'lat': round(r.y, 5), 'lon': round(r.x, 5)}})

    for nombre, partido, cuales in ZONAS:
        locs = porPartido.get(partido, {})
        elegidas = list(locs.values()) if cuales == TODO else [locs[n] for n in cuales if n in locs]
        faltan = [] if cuales == TODO else [n for n in cuales if n not in locs]
        if faltan: print(f'  OJO {nombre}: no encontré {faltan}')
        if not elegidas: print(f'  OJO {nombre}: sin geometría'); continue
        for f in elegidas: usadas.add((partido, f['properties']['nombre']))
        agregar(nombre, elegidas, True, elegidas[0]['properties']['cordon'])

    for nombre, cuales in SIN_SERVICIO:
        if cuales is None:
            elegidas = list(porPartido.get(nombre, {}).values())
        else:
            elegidas = [f for locs in porPartido.values() for n, f in locs.items() if n in cuales]
        if not elegidas: print(f'  OJO {nombre}: sin geometría'); continue
        for f in elegidas: usadas.add((f['properties']['partido'], f['properties']['nombre']))
        extra = [{'geometry': mapping(unary_union(islas))}] if (nombre == 'Delta del Paraná' and islas) else []
        agregar(nombre, elegidas + extra, False, 3)

    # Lo que quedó sin asignar se avisa, para no perder territorio en silencio.
    sueltas = [(p, n) for p, locs in porPartido.items() for n in locs if (p, n) not in usadas]
    if sueltas: print(f'  sin asignar ({len(sueltas)}): {sueltas[:10]}')

    feats += caba
    ruta = os.path.join(DATA, 'amba.geojson')
    json.dump({'type': 'FeatureCollection', 'features': feats},
              open(ruta, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    red = sum(1 for f in feats if f['properties']['enRed'])
    print(f'zonas: {len(feats)} | con servicio: {red} | {os.path.getsize(ruta)} bytes')

main()
