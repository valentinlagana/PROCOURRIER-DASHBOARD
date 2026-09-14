# -*- coding: utf-8 -*-
"""Genera data/amba.geojson: los barrios de CABA y los partidos del GBA que
cubre la red de ProCourrier, con el punto de referencia de cada uno.

Fuentes: datos abiertos del GCBA (barrios) e IGN (departamentos).
"""
import json, os, unicodedata
from shapely.geometry import shape, mapping

SCRATCH = os.environ.get('PC_SCRATCH', '.')
OUT = os.path.join(os.path.dirname(__file__), '..', 'data')

# Partidos que la red alcanza, con su cordón. La red llega hasta Luján,
# Dique Luján (Tigre), Zárate, Campana y La Plata por el sur.
CORDON = {
    "Avellaneda": 1, "Lanús": 1, "Lomas de Zamora": 1, "La Matanza": 1, "Morón": 1,
    "Tres de Febrero": 1, "General San Martín": 1, "Vicente López": 1, "San Isidro": 1,
    "Hurlingham": 1, "Ituzaingó": 1,
    "Quilmes": 2, "Berazategui": 2, "Florencio Varela": 2, "Almirante Brown": 2,
    "Esteban Echeverría": 2, "Ezeiza": 2, "Merlo": 2, "Moreno": 2, "San Miguel": 2,
    "José C. Paz": 2, "Malvinas Argentinas": 2, "Tigre": 2, "San Fernando": 2,
    "Pilar": 3, "Escobar": 3, "General Rodríguez": 3, "Marcos Paz": 3, "Cañuelas": 3,
    "San Vicente": 3, "Presidente Perón": 3, "La Plata": 3, "Berisso": 3, "Ensenada": 3,
    "Campana": 3, "Zárate": 3, "Luján": 3,
}

# Partidos que se dibujan para dar contexto geográfico pero no tienen servicio.
FUERA_DE_RED = ["Exaltación de la Cruz", "Brandsen", "General Las Heras", "Navarro",
                "San Andrés de Giles"]

# El centroide geométrico de estos partidos cae en zona despoblada (el Delta,
# el sur rural de La Plata): el reparto se concentra en la cabecera.
CABECERA = {
    "San Fernando":      (-34.4472, -58.5702),
    "Tigre":             (-34.4235, -58.5818),
    "La Plata":          (-34.9207, -57.9538),
    "Campana":           (-34.1637, -58.9587),
    "San Vicente":       (-35.0249, -58.4241),
    "Marcos Paz":        (-34.7865, -58.8297),
    "Pilar":             (-34.4571, -58.9142),
}


def norm(s):
    return "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn").lower()

def redondear(o, nd=4):
    if isinstance(o, (list, tuple)): return [redondear(x, nd) for x in o]
    if isinstance(o, float): return round(o, nd)
    return o

# 0,0001° ~ 11 m: el borde queda fiel al oficial incluso con mucho zoom.
TOLERANCIA = 0.0001

def salida(nombre, g, region, cordon, en_red, ref=None, **extra):
    g = g.simplify(TOLERANCIA, preserve_topology=True)
    p = ref or (lambda c: (c.y, c.x))(g.representative_point())
    props = {"nombre": nombre, "region": region, "cordon": cordon, "enRed": en_red,
             "lat": round(p[0], 5), "lon": round(p[1], 5), **extra}
    return {"type": "Feature", "properties": props, "geometry": redondear(mapping(g), 5)}

def main():
    partidos = json.load(open(f"{SCRATCH}/ba_dptos.json"))
    barrios = json.load(open(f"{SCRATCH}/caba_barrios.geojson"))

    quiero = {norm(k): (k, v, True) for k, v in CORDON.items()}
    quiero.update({norm(k): (k, 3, False) for k in FUERA_DE_RED})
    feats, faltan = [], set(quiero)

    for f in partidos["features"]:
        k = norm(f["properties"]["nam"])
        if k not in quiero: continue
        faltan.discard(k)
        nombre, cordon, en_red = quiero[k]

        feats.append(salida(nombre, shape(f["geometry"]).buffer(0), "GBA", cordon, en_red,
                            ref=CABECERA.get(nombre)))

    if faltan:
        print("NO ENCONTRADOS:", faltan)

    for f in barrios["features"]:
        p = f["properties"]
        feats.append(salida(p["nombre"].title(), shape(f["geometry"]).buffer(0),
                            "CABA", 0, True, comuna=p["comuna"]))

    os.makedirs(OUT, exist_ok=True)
    ruta = os.path.join(OUT, "amba.geojson")
    with open(ruta, "w", encoding="utf-8") as fh:
        json.dump({"type": "FeatureCollection", "features": feats}, fh,
                  ensure_ascii=False, separators=(",", ":"))

    en_red = sum(1 for f in feats if f["properties"]["enRed"])
    print(f"zonas: {len(feats)} | en la red: {en_red} | fuera: {len(feats) - en_red}")
    print(f"bytes: {os.path.getsize(ruta)}")

main()
