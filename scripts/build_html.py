# -*- coding: utf-8 -*-
"""Arma un único archivo .html con todo adentro.

Toma preview/index.html y le mete el mapa base y las zonas embebidos, para que
el cotizador sea un solo archivo que se abre con doble click, sin servidor y
sin depender de nada externo salvo la tipografía.
"""
import base64, os, re

AQUI = os.path.dirname(__file__)
RAIZ = os.path.join(AQUI, '..')
SALIDA = os.path.join(RAIZ, 'dist', 'cotizador-procourrier.html')

html = open(os.path.join(RAIZ, 'preview', 'index.html'), encoding='utf-8').read()
zonas = open(os.path.join(RAIZ, 'preview', 'amba.js'), encoding='utf-8').read()
mapa = open(os.path.join(RAIZ, 'preview', 'basemap.jpg'), 'rb').read()

# Las zonas pasan de archivo aparte a script embebido.
assert '<script src="amba.js"></script>' in html
html = html.replace('<script src="amba.js"></script>', '<script>\n' + zonas + '\n</script>')

# jsPDF se inlinea también: el archivo tiene que armar la propuesta sin red.
js_pdf = os.path.join(RAIZ, 'preview', 'jspdf.umd.min.js')
tag = ('<script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/'
       'jspdf.umd.min.js"></script>')
assert tag in html
html = html.replace(tag, '<script>\n' + open(js_pdf, encoding='utf-8').read() + '\n</script>')

# El mapa base pasa a data URI.
uri = 'data:image/jpeg;base64,' + base64.b64encode(mapa).decode('ascii')
antes = html
html = html.replace("href: 'basemap.jpg'", "href: MAPA_BASE")
assert html != antes
html = html.replace("const MAPA = {", "const MAPA_BASE = '" + uri + "';\nconst MAPA = {")

# El wrapper de la página publicada agrega esto; acá hay que ponerlo a mano.
cabeza = ('<!DOCTYPE html>\n<html lang="es-AR">\n<head>\n<meta charset="utf-8">\n'
          '<meta name="viewport" content="width=device-width, initial-scale=1">\n'
          '<style>*{box-sizing:border-box}body{margin:0;font:14px system-ui,sans-serif}'
          'img{max-width:100%}[hidden]{display:none!important}</style>\n')
i = html.index('</style>') + len('</style>')
html = cabeza + html[:i] + '\n</head>\n<body>' + html[i:] + '\n</body>\n</html>\n'

os.makedirs(os.path.dirname(SALIDA), exist_ok=True)
open(SALIDA, 'w', encoding='utf-8').write(html)
print(f'{SALIDA}: {os.path.getsize(SALIDA)/1024:.0f} KB')

# ── Versión para montar en el sitio ──────────────────────────────────────
# El archivo único sirve para mandar por mail o abrir con doble click. Dentro
# de una web conviene lo contrario: las zonas, el mapa y jsPDF como archivos
# aparte, que el navegador cachea y no vuelve a bajar en cada visita.
import shutil

WEB = os.path.join(RAIZ, 'dist', 'web')
os.makedirs(WEB, exist_ok=True)

suelto = open(os.path.join(RAIZ, 'preview', 'index.html'), encoding='utf-8').read()
i = suelto.index('</style>') + len('</style>')
cabeza_web = ("""<!DOCTYPE html>
<html lang="es-AR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Cotizador de envíos · ProCourrier</title>
<meta name="description" content="Calculá tus tarifas de envío en CABA y el AMBA: elegí tu depósito, tu volumen y te mandamos la propuesta en PDF.">
<link rel="canonical" href="https://procourrier.com.ar/cotizador/">
<meta property="og:title" content="Cotizador de envíos · ProCourrier">
<meta property="og:description" content="Tus tarifas de última milla en CABA y AMBA, al instante.">
<meta property="og:type" content="website">
<style>*{box-sizing:border-box}body{margin:0;font:14px system-ui,sans-serif}"""
"""img{max-width:100%}[hidden]{display:none!important}</style>
""")
web = cabeza_web + suelto[:i] + '\n</head>\n<body>' + suelto[i:] + '\n</body>\n</html>\n'
open(os.path.join(WEB, 'index.html'), 'w', encoding='utf-8').write(web)
for f in ('amba.js', 'basemap.jpg'):
    shutil.copy(os.path.join(RAIZ, 'preview', f), os.path.join(WEB, f))
total = sum(os.path.getsize(os.path.join(WEB, f)) for f in os.listdir(WEB))
print(f'{WEB}/: {len(os.listdir(WEB))} archivos, {total/1024:.0f} KB')
