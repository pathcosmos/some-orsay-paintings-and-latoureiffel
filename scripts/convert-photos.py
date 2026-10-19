#!/usr/bin/env python3
"""Decode HEIC without Apple decoder black frames, retain ICC, export three sizes.
Requires macOS sips and FFmpeg. PNG preserves decoded RGB samples; JPEG is lossy.
"""
import argparse
import json
from pathlib import Path
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('--reuse-png', action='store_true', help='Reuse existing decoded PNG files')
args = parser.parse_args()

def run(*command):
    subprocess.run(command, check=True, stdout=subprocess.DEVNULL)

for folder in ('lossless', 'jpg', 'web', 'thumbs'):
    (ROOT / folder).mkdir(exist_ok=True)
with tempfile.TemporaryDirectory(prefix='orsay-') as temp:
    for photo in sorted(ROOT.glob('IMG_*.heic')):
        stem = photo.stem
        png = ROOT / 'lossless' / f'{stem}.png'
        if not args.reuse_png or not png.exists():
            # HEIC is a tile grid. FFmpeg's automatic YUV420 crop rounds odd
            # dimensions down. Stack the main image tiles, convert to RGB first,
            # and crop with exact=1 to preserve every source row and column.
            groups = json.loads(subprocess.check_output([
                'ffprobe', '-v', 'error', '-show_stream_groups', '-of', 'json', str(photo)
            ]))['stream_groups']
            grid = groups[0]['components'][0]
            tiles = grid['subcomponents']
            inputs = ''.join(f"[0:{tile['stream_index']}]" for tile in tiles)
            layout = '|'.join(f"{tile['tile_horizontal_offset']}_{tile['tile_vertical_offset']}" for tile in tiles)
            graph = (f"{inputs}xstack=inputs={len(tiles)}:layout={layout},format=rgb24,"
                     f"crop={grid['width']}:{grid['height']}:{grid['horizontal_offset']}:{grid['vertical_offset']}:exact=1[out]")
            run('ffmpeg', '-loglevel', 'error', '-y', '-i', str(photo),
                '-filter_complex', graph, '-map', '[out]', '-frames:v', '1', '-update', '1', str(png))
        # PNG's FFmpeg encoder omits the input ICC. Reattach the actual source profile,
        # rather than incorrectly labelling Display P3 samples as sRGB.
        icc = Path(temp) / f'{stem}.icc'
        run('sips', '-x', str(icc), str(photo))
        if icc.exists():
            run('sips', '-e', str(icc), str(png))
        run('sips', '-s', 'format', 'jpeg', '-s', 'formatOptions', '100', str(png), '--out', str(ROOT / 'jpg' / f'{stem}.jpg'))
        # Convert only web derivatives to sRGB for broad browser compatibility.
        for folder, size, quality in [('web', '2000', '83'), ('thumbs', '600', '75')]:
            run('sips', '-m', '/System/Library/ColorSync/Profiles/sRGB Profile.icc', '-s', 'format', 'jpeg', '-s', 'formatOptions', quality, '-Z', size, str(png), '--out', str(ROOT / folder / f'{stem}.jpg'))
        print(f'{stem}: PNG + full-resolution JPEG + web + thumbnail', flush=True)
