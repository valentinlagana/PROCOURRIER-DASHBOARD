# -*- coding: utf-8 -*-
"""Baja los límites de localidad del AMBA desde OpenStreetMap.

En Argentina admin_level=8 es la localidad: Garín, Del Viso, Don Torcuato,
Villa Ballester. Es el mismo nivel que rotula Google Maps.

Consulta partido por partido porque el bbox entero del AMBA da 504, guarda el
avance en disco para poder retomar, y deja el resultado en localidades_osm.json.
Después, convertirlo a geojson con osmtogeojson y correr build_localidades.py.
"""
import json, subprocess, time, os, threading
from concurrent.futures import ThreadPoolExecutor
geo=json.load(open('/home/user/PROCOURRIER-DASHBOARD/data/amba.geojson',encoding='utf-8'))
MIRRORS=["https://overpass.kumi.systems/api/interpreter","https://overpass-api.de/api/interpreter"]
todo = json.load(open('loc_parcial.json')) if os.path.exists('loc_parcial.json') else {}
hechos = set(json.load(open('loc_hechos.json'))) if os.path.exists('loc_hechos.json') else set()
lock = threading.Lock()

cajas=[]
for f in geo['features']:
    p=f['properties']
    if p['region']!='GBA' or p['nombre'] in hechos: continue
    g=f['geometry']; polis=[g['coordinates']] if g['type']=='Polygon' else g['coordinates']
    lo=[c[0] for q in polis for a in q for c in a]; la=[c[1] for q in polis for a in q for c in a]
    cajas.append((p['nombre'], min(la)-.02, min(lo)-.02, max(la)+.02, max(lo)+.02))
print(f'faltan {len(cajas)} partidos (ya hay {len(todo)} localidades)', flush=True)

def uno(arg):
    i,(nom,s,w,n,e)=arg
    q=(f'[out:json][timeout:150];rel["boundary"="administrative"]["admin_level"="8"]'
       f'({s:.3f},{w:.3f},{n:.3f},{e:.3f});out geom;')
    for intento in range(4):
        r=subprocess.run(['curl','-sS','--max-time','200','-G',MIRRORS[(i+intento)%2],
                          '--data-urlencode','data='+q],capture_output=True,text=True)
        try:
            d=json.loads(r.stdout)
            if 'elements' in d:
                with lock:
                    for el in d['elements']: todo[str(el['id'])]=el
                    hechos.add(nom)
                    json.dump(todo,open('loc_parcial.json','w'))
                    json.dump(sorted(hechos),open('loc_hechos.json','w'))
                    print(f'  {nom}: ok (+{len(d["elements"])}) | acumulado {len(todo)}', flush=True)
                return
        except Exception: pass
        time.sleep(4)
    with lock:
        hechos.add(nom); print(f'  {nom}: FALLO', flush=True)

with ThreadPoolExecutor(3) as pool:
    list(pool.map(uno, enumerate(cajas)))

json.dump({'version':0.6,'elements':list(todo.values())},open('localidades_osm.json','w'))
print('LISTO:',len(todo),'localidades |',os.path.getsize('localidades_osm.json'),'bytes',flush=True)
