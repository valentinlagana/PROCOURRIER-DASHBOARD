# -*- coding: utf-8 -*-
"""Arma data/amba.geojson con las zonas tarifarias reales de ProCourrier.

Toma las localidades de build_localidades.py y las agrupa en las 47 zonas del
mapa de cobertura: algunas son un partido entero, otras una sola localidad
(Garín, Del Viso, Nordelta) y otras un pedazo de partido (La Plata Norte,
Centro y Oeste; La Matanza Norte y Sur).

El Delta queda fuera: no se circula en vehículo. Zárate y Campana se recortan
a tierra firme restando el Paraná y quedándose con la parte donde está la
ciudad, para no prometer las islas.

Cada zona con servicio se recorta además contra la planta urbana del IGN
(data/urbano.geojson). Un partido como Zárate mide 1.168 km² y la ciudad es
una fracción de eso: pintarlo entero prometía reparto en el campo y dejaba
zonas que se estiraban treinta kilómetros más allá de la localidad.
"""
import json, os, unicodedata
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

# Banda de Mercado Envíos Flex a la que pertenece cada zona, leída del mapa
# oficial de cobertura: CABA (amarillo), AMBA 1 (verde), AMBA 2 (azul) y
# AMBA 3 (rosa). Es la clasificación que aparece en la liquidación, así que
# es la que manda sobre cualquier estimación por distancia.
BANDAS = {
    1: ['Vicente López', 'San Isidro', 'San Martín', 'Tres de Febrero', 'Hurlingham',
        'Ituzaingó', 'Morón', 'La Matanza Norte', 'Lanús', 'Avellaneda', 'Lomas de Zamora'],
    2: ['Nordelta', 'Tigre', 'San Fernando', 'Malvinas Argentinas', 'José C Paz',
        'San Miguel', 'Moreno', 'Merlo', 'La Matanza Sur', 'Ezeiza', 'Esteban Echeverría',
        'Almirante Brown', 'Quilmes', 'Florencio Varela', 'Berazategui'],
    3: ['Zárate', 'Campana', 'Escobar', 'Ingeniero Maschwitz', 'Garín', 'Villa Rosa',
        'Pilar', 'Del Viso', 'Derqui', 'Luján', 'General Rodríguez', 'Marcos Paz',
        'Cañuelas', 'San Vicente', 'Guernica', 'Ensenada', 'Berisso',
        'La Plata Norte', 'La Plata Centro', 'La Plata Oeste'],
}
BANDA = {n: b for b, zs in BANDAS.items() for n in zs}

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

# Margen alrededor de la planta urbana. El dato del IGN es el casco edificado;
# el reparto llega un poco más lejos (countries, parques industriales, barrios
# nuevos que todavía no figuran), así que se le da algo más de un kilómetro.
MARGEN_URBANO = 0.012

# Un pedazo suelto más chico que esto no es un pueblo, es ruido del recorte.
PUEBLO_MIN_KM2 = 0.4

# Punto de referencia de cada zona: el centro de su localidad cabecera, que es
# donde se concentra el reparto. No se usa el centro geométrico del polígono
# porque en partidos grandes cae lejos de la ciudad y cambia la tarifa.
REFERENCIAS = {
    "Almirante Brown": (-34.84043, -58.37078),
    "Avellaneda": (-34.67969, -58.33639),
    "Berazategui": (-34.84387, -58.14115),
    "Berisso": (-34.89825, -57.85219),
    "Campana": (-34.16366, -58.95868),
    "Cañuelas": (-35.05384, -58.76199),
    "Del Viso": (-34.45346, -58.79656),
    "Derqui": (-34.49099, -58.83846),
    "Ensenada": (-34.85336, -57.96544),
    "Escobar": (-34.32906, -58.78073),
    "Esteban Echeverría": (-34.82162, -58.47478),
    "Ezeiza": (-34.8751, -58.57387),
    "Florencio Varela": (-34.88163, -58.25268),
    "Garín": (-34.42869, -58.73592),
    "General Rodríguez": (-34.63928, -58.99347),
    "Guernica": (-34.94033, -58.41204),
    "Hurlingham": (-34.59849, -58.65324),
    "Ingeniero Maschwitz": (-34.38295, -58.73637),
    "Ituzaingó": (-34.66039, -58.67952),
    "José C Paz": (-34.50494, -58.77919),
    "La Matanza Norte": (-34.67742, -58.56078),
    "La Matanza Sur": (-34.83272, -58.70109),
    "La Plata Centro": (-34.92068, -57.95376),
    "La Plata Norte": (-34.87774, -58.05822),
    "La Plata Oeste": (-34.94778, -58.04788),
    "Lanús": (-34.70824, -58.39359),
    "Lomas de Zamora": (-34.74998, -58.41018),
    "Luján": (-34.58304, -59.14582),
    "Malvinas Argentinas": (-34.48227, -58.72366),
    "Marcos Paz": (-34.78651, -58.82968),
    "Merlo": (-34.70708, -58.74747),
    "Moreno": (-34.59273, -58.80609),
    "Morón": (-34.64628, -58.61926),
    "Nordelta": (-34.41548, -58.6487),
    "Pilar": (-34.45709, -58.91416),
    "Quilmes": (-34.75409, -58.28334),
    "San Fernando": (-34.44719, -58.57015),
    "San Isidro": (-34.4843, -58.53579),
    "San Martín": (-34.5436, -58.57611),
    "San Miguel": (-34.55438, -58.70386),
    "San Vicente": (-35.02485, -58.42411),
    "Tigre": (-34.42353, -58.58176),
    "Tres de Febrero": (-34.60183, -58.5625),
    "Vicente López": (-34.52899, -58.50636),
    "Villa Rosa": (-34.40755, -58.87013),
    "Zárate": (-34.0958, -59.0289),
}

def norm(s):
    return ''.join(c for c in unicodedata.normalize('NFD', s) if unicodedata.category(c) != 'Mn').lower()

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

URBANO = None   # planta urbana del IGN, sin margen

def urbanizar(nombre, g):
    """Deja de la zona sólo lo que está urbanizado.

    El límite de partido no distingue la ciudad del campo: Cañuelas, Zárate o
    Luján son en su mayor parte rurales y pintarlos enteros promete reparto
    donde no hay a quién repartirle. Los pueblos del partido quedan, cada uno
    con su mancha; lo que se va es el campo entre medio.

    El margen se agrega alrededor del casco propio y recién después se recorta
    contra la zona. Al revés —recortar contra la planta ya engordada— entraba
    el margen del pueblo de al lado y dejaba manchas sueltas que no son de
    nadie."""
    if URBANO is None: return g
    nucleo = solo_poligonos(g.intersection(URBANO))
    if nucleo.is_empty:
        print(f'  OJO {nombre}: sin planta urbana, se deja entera')
        return g
    if nucleo.geom_type == 'MultiPolygon':
        piezas = [q for q in nucleo.geoms if km2(q, q.centroid.y) >= PUEBLO_MIN_KM2]
        if piezas: nucleo = unary_union(piezas)
    recortada = solo_poligonos(nucleo.buffer(MARGEN_URBANO).intersection(g))
    fuera = km2(g, g.centroid.y) - km2(recortada, g.centroid.y)
    if fuera > 20: print(f'  {nombre}: -{fuera:.0f} km² de campo')
    return recortada

def main():
    global URBANO
    src = json.load(open(os.path.join(DATA, 'localidades.geojson'), encoding='utf-8'))
    urb = json.load(open(os.path.join(DATA, 'urbano.geojson'), encoding='utf-8'))
    URBANO = unary_union([shape(f['geometry']).buffer(0) for f in urb['features']])
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

    def punto(nombre, g):
        """El precio lo define la cabecera, no el centro geométrico del polígono."""
        from shapely.geometry import Point
        if nombre in REFERENCIAS:
            lat, lon = REFERENCIAS[nombre]
            return Point(lon, lat)
        return g.representative_point()

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
            g = urbanizar(nombre, g)
        g = sin_astillas(solo_poligonos(g))
        if g.is_empty: print(f'  OJO {nombre}: quedó vacía'); return
        g = g.simplify(0.0002, preserve_topology=True)
        r = punto(nombre, g)
        feats.append({'type': 'Feature', 'geometry': redondear(mapping(g)),
                      'properties': {'nombre': nombre, 'region': 'GBA', 'cordon': cordon,
                                     'enRed': en_red, 'banda': BANDA.get(nombre),
                                     'lat': round(r.y, 5), 'lon': round(r.x, 5)}})

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

    for f in caba: f['properties']['banda'] = 0
    feats += caba

    sin_banda = [f['properties']['nombre'] for f in feats
                 if f['properties']['enRed'] and f['properties'].get('banda') is None]
    if sin_banda: print(f'  OJO sin banda de Flex: {sin_banda}')
    ruta = os.path.join(DATA, 'amba.geojson')
    json.dump({'type': 'FeatureCollection', 'features': feats},
              open(ruta, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    # El cotizador lee las zonas como script, no como fetch: así anda abierto
    # con doble click, sin servidor.
    js = os.path.join(AQUI, '..', 'preview', 'amba.js')
    open(js, 'w', encoding='utf-8').write('window.AMBA=' + open(ruta, encoding='utf-8').read())

    red = sum(1 for f in feats if f['properties']['enRed'])
    print(f'zonas: {len(feats)} | con servicio: {red} | {os.path.getsize(ruta)} bytes'
          f' | preview/amba.js {os.path.getsize(js)} bytes')

main()
