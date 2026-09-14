# -*- coding: utf-8 -*-
"""Genera los datasets geográficos del AMBA (CABA + GBA) usados por el cotizador."""
import json, unicodedata
from shapely.geometry import shape, mapping

SCRATCH = "/tmp/claude-0/-home-user-PROCOURRIER-DASHBOARD/35f0bc56-7553-5506-9ab0-c60252d96ca0/scratchpad"
OUT = "/home/user/PROCOURRIER-DASHBOARD/data"

# Cordones del AMBA. 1 = primer cordón, 2 = segundo, 3 = tercer cordón / AMBA extendida.
CORDON = {
    # Primer cordón
    "Avellaneda": 1, "Lanús": 1, "Lomas de Zamora": 1, "La Matanza": 1, "Morón": 1,
    "Tres de Febrero": 1, "General San Martín": 1, "Vicente López": 1, "San Isidro": 1,
    "Hurlingham": 1, "Ituzaingó": 1,
    # Segundo cordón
    "Quilmes": 2, "Berazategui": 2, "Florencio Varela": 2, "Almirante Brown": 2,
    "Esteban Echeverría": 2, "Ezeiza": 2, "Merlo": 2, "Moreno": 2, "San Miguel": 2,
    "José C. Paz": 2, "Malvinas Argentinas": 2, "Tigre": 2, "San Fernando": 2,
    # Tercer cordón / AMBA extendida
    "Pilar": 3, "Escobar": 3, "General Rodríguez": 3, "Marcos Paz": 3, "Cañuelas": 3,
    "San Vicente": 3, "Presidente Perón": 3, "La Plata": 3, "Berisso": 3, "Ensenada": 3,
    "Campana": 3, "Zárate": 3, "Luján": 3, "Exaltación de la Cruz": 3, "Brandsen": 3,
    "General Las Heras": 3, "Navarro": 3, "San Andrés de Giles": 3,
}

def norm(s):
    return "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn").lower()

def simplify(geom, tol):
    g = shape(geom).buffer(0).simplify(tol, preserve_topology=True)
    return g

def round_coords(obj, nd=5):
    if isinstance(obj, (list, tuple)):
        return [round_coords(o, nd) for o in obj]
    if isinstance(obj, float):
        return round(obj, nd)
    return obj

partidos = json.load(open(f"{SCRATCH}/ba_dptos.json"))
by_norm = {norm(k): v for k, v in CORDON.items()}
feats, faltan = [], set(by_norm)

for f in partidos["features"]:
    nombre = f["properties"]["nam"]
    key = norm(nombre)
    if key not in by_norm:
        continue
    faltan.discard(key)
    g = simplify(f["geometry"], 0.0015)
    c = g.representative_point()
    feats.append({
        "type": "Feature",
        "properties": {
            "id": f["properties"]["in1"],
            "nombre": nombre,
            "region": "GBA",
            "cordon": by_norm[key],
            "lat": round(c.y, 5), "lon": round(c.x, 5),
        },
        "geometry": round_coords(mapping(g)),
    })

if faltan:
    print("NO ENCONTRADOS:", faltan)

barrios = json.load(open(f"{SCRATCH}/caba_barrios.geojson"))
for f in barrios["features"]:
    p = f["properties"]
    g = simplify(f["geometry"], 0.0006)
    c = g.representative_point()
    feats.append({
        "type": "Feature",
        "properties": {
            "id": f"caba-{p['id']}",
            "nombre": p["nombre"].title(),
            "region": "CABA",
            "comuna": p["comuna"],
            "cordon": 0,
            "lat": round(c.y, 5), "lon": round(c.x, 5),
        },
        "geometry": round_coords(mapping(g)),
    })

fc = {"type": "FeatureCollection", "features": feats}
import os; os.makedirs(OUT, exist_ok=True)
with open(f"{OUT}/amba.geojson", "w", encoding="utf-8") as fh:
    json.dump(fc, fh, ensure_ascii=False, separators=(",", ":"))
print("features:", len(feats), "| CABA:", sum(1 for f in feats if f["properties"]["region"] == "CABA"),
      "| GBA:", sum(1 for f in feats if f["properties"]["region"] == "GBA"))
print("bytes:", os.path.getsize(f"{OUT}/amba.geojson"))
