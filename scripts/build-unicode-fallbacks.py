"""Rebuild the bundled Unifont fallbacks from the originals in font-sources.json.

Usage: python scripts/build-unicode-fallbacks.py /path/to/original-fonts
Requires fonttools[woff]==4.67.0 and brotli==1.2.0. No glyphs are subsetted.
"""

import hashlib
import json
import sys
from io import BytesIO
from pathlib import Path
from urllib.parse import urlparse

from fontTools.fontBuilder import FontBuilder
from fontTools.pens.recordingPen import RecordingPen
from fontTools.pens.reverseContourPen import ReverseContourPen
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.ttLib import TTFont


def convert(source: bytes) -> bytes:
    font = TTFont(BytesIO(source), recalcTimestamp=False)
    glyph_set = font.getGlyphSet()
    glyphs = {}
    for name in font.getGlyphOrder():
        recording = RecordingPen()
        glyph_set[name].draw(recording)
        # Unifont contains only straight-line contours. Converting these to
        # TrueType avoids CFF FontMatrix width inconsistencies in PDF readers
        # without approximating the outlines or changing character coverage.
        if any(op not in ("moveTo", "lineTo", "closePath") for op, _ in recording.value):
            raise ValueError(f"Unexpected non-linear Unifont outline: {name}")
        pen = TTGlyphPen(None)
        # TrueType contours use the opposite winding to PostScript contours.
        recording.replay(ReverseContourPen(pen))
        glyphs[name] = pen.glyph()
    del font["CFF "]
    font.sfntVersion = "\x00\x01\x00\x00"
    builder = FontBuilder(font=font)
    builder.isTTF = True
    builder.setupGlyf(glyphs)
    builder.setupMaxp()
    font.flavor = "woff2"
    output = BytesIO()
    font.save(output)
    return output.getvalue()


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit(__doc__)
    source_dir = Path(sys.argv[1])
    root = Path(__file__).resolve().parent.parent
    manifest = json.loads((root / "licenses/font-sources.json").read_text())
    for entry in manifest:
        if entry["family"] not in ("Unifont", "Unifont Upper"):
            continue
        source_path = source_dir / Path(urlparse(entry["source"]).path).name
        source = source_path.read_bytes()
        if hashlib.sha256(source).hexdigest() != entry["sourceSha256"]:
            raise ValueError(f"Source checksum mismatch: {source_path}")
        result = convert(source)
        if hashlib.sha256(result).hexdigest() != entry["sha256"]:
            raise ValueError(f"Output checksum mismatch: {entry['path']}")
        (root / entry["path"]).write_bytes(result)
        print(f"Built {entry['path']} ({len(result)} bytes)", flush=True)


if __name__ == "__main__":
    main()
