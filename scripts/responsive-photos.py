#!/usr/bin/env python3
"""Generate sRGB WebP variants from decoded originals (requires sips and cwebp)."""
from pathlib import Path
import struct
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]
WIDTHS = (160, 320, 480, 800, 1200)


def generate():
    output = ROOT / 'responsive'
    output.mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='orsay-responsive-') as temp:
        for source in sorted((ROOT / 'lossless').glob('IMG_*.png')):
            with source.open('rb') as image:
                header = image.read(24)
            width = struct.unpack('>I', header[16:20])[0]
            if width < max(WIDTHS):
                raise ValueError(f'{source.name}: width must be at least {max(WIDTHS)}px')
            # Convert Display P3 samples before dropping metadata in cwebp.
            srgb = Path(temp) / 'srgb.png'
            subprocess.run(['sips', '-m', '/System/Library/ColorSync/Profiles/sRGB Profile.icc',
                            str(source), '--out', str(srgb)], check=True, stdout=subprocess.DEVNULL)
            for target in WIDTHS:
                subprocess.run(['cwebp', '-quiet', '-q', '78', '-m', '6', '-metadata', 'none',
                                '-resize', str(target), '0', str(srgb), '-o',
                                str(output / f'{source.stem}-{target}.webp')], check=True)
            print(f'{source.stem}: responsive WebP', flush=True)


if __name__ == '__main__':
    generate()
