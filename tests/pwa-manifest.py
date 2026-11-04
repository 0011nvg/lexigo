#!/usr/bin/env python3
"""Check manifest deployment paths and icon dimensions/safe zone without device claims."""
import json
from pathlib import Path
from urllib.parse import urljoin, urlsplit
from PIL import Image

root = Path(__file__).resolve().parent.parent
manifest = json.loads((root / 'manifest.webmanifest').read_text())
base = 'https://0011nvg.github.io/lexigo/'
assert manifest['name'] == manifest['short_name'] == 'LEXI'
assert urljoin(base, manifest['start_url']) == base + 'index.html'
# Manifest id preserves the identity formerly derived from start_url.
assert urljoin(base, manifest['id']) == urljoin(base, manifest['start_url'])
assert urljoin(base, manifest['scope']) == base
assert manifest['display'] == 'standalone'
for entry in manifest['icons']:
    url = urljoin(base, entry['src'])
    assert url.startswith(base)
    path = root / urlsplit(url).path.removeprefix('/lexigo/')
    assert path.is_file(), path
    if entry['type'] == 'image/png':
        size = int(entry['sizes'].split('x')[0])
        im = Image.open(path).convert('RGBA')
        assert im.size == (size, size)
        if entry.get('purpose') == 'maskable':
            # Approved white face must fit the 80%-diameter Android safe circle.
            assert all(a == 255 for *_, a in im.getdata())
            face = [(i % size, i // size) for i, (r, g, b, a) in enumerate(im.getdata()) if min(r, g, b) > 220]
            assert face
            assert all((x + .5 - size / 2)**2 + (y + .5 - size / 2)**2 <= (size * .4)**2 for x, y in face)
assert {x['sizes'] for x in manifest['icons'] if x.get('purpose') == 'maskable'} == {'192x192', '512x512'}
im = Image.open(root / 'assets/apple-touch-icon.png').convert('RGBA')
assert im.size == (180, 180) and im.getpixel((0, 0))[3] == 255
for file in ['index.html', 'auth.html', 'me.html']:
    html = (root / file).read_text()
    assert 'apple-mobile-web-app-capable' in html and 'apple-touch-icon' in html and 'rel="manifest"' in html
print('PASS PWA manifest: scope, stable id, icons and maskable safe zone')
