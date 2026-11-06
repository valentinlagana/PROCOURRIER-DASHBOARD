# -*- coding: utf-8 -*-
"""Baja la planta urbana del IGN, que es el límite real de cada localidad.

La capa `areas_de_asentamientos_y_edificios_020105` trae el area efectivamente
edificada: el Gran Buenos Aires como una sola mancha, el Gran La Plata, y cada
ciudad del interior del AMBA por separado (Zárate - Campana, Luján, Cañuelas).
Es lo que separa la ciudad del campo, que los límites de partido no distinguen.
"""
import json, os, urllib.request

AQUI = os.path.dirname(__file__)
DESTINO = os.path.join(AQUI, '..', 'data', 'urbano.geojson')

URL = ('https://wms.ign.gob.ar/geoserver/wfs?service=WFS&version=1.0.0'
       '&request=GetFeature&typeName=ign:areas_de_asentamientos_y_edificios_020105'
       '&outputFormat=application/json&srsName=EPSG:4326'
       '&bbox=-60.1,-35.8,-57.5,-33.6,EPSG:4326')

def main():
    with urllib.request.urlopen(URL, timeout=300) as r:
        datos = json.load(r)
    # Del IGN sólo interesa la geometría y el nombre; el resto es ruido.
    datos['features'] = [{'type': 'Feature', 'geometry': f['geometry'],
                          'properties': {'nombre': f['properties'].get('fna')}}
                         for f in datos['features']]
    json.dump(datos, open(DESTINO, 'w', encoding='utf-8'),
              ensure_ascii=False, separators=(',', ':'))
    print(f'{len(datos["features"])} plantas urbanas | {os.path.getsize(DESTINO)} bytes')

main()
