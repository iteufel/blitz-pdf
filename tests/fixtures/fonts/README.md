# Unicode test fonts

These small, static font subsets are test fixtures, not bundled runtime fonts.
They retain OpenType shaping tables so the integration tests exercise real
font fallback, Indic reordering, combining clusters, Hangul composition, and
supplementary-plane CJK glyphs. No test downloads fonts.

| Fixture | Pinned upstream source | Original SHA-256 |
| --- | --- | --- |
| NotoSansDevanagari-Regular.ttf | [Noto fonts ffebf8c](https://github.com/notofonts/noto-fonts/blob/ffebf8c1ee449e544955a7e813c54f9b73848eac/hinted/ttf/NotoSansDevanagari/NotoSansDevanagari-Regular.ttf) | `385e78e6359a9d88a0f243d53b1209d7548361ba2194e2b9ec779bcaa7e8949d` |
| NotoSansCJKsc-Regular.otf | [Noto CJK f8d1575](https://github.com/notofonts/noto-cjk/blob/f8d157532fbfaeda587e826d4cd5b21a49186f7c/Sans/OTF/SimplifiedChinese/NotoSansCJKsc-Regular.otf) | `2c76254f6fc379fddfce0a7e84fb5385bb135d3e399294f6eeb6680d0365b74b` |

The accompanying `NotoFonts-LICENSE.txt` and `NotoCJK-LICENSE.txt` retain the
upstream SIL Open Font License 1.1 notices. The original copyright and license
name records also remain in each font.

Generated with FontTools 4.67.0, using the downloaded originals in `tmp/fonts`:

```python
from fontTools import subset

samples = [
    ("NotoSansDevanagari-Regular.ttf", "नमस्ते दुनिया क़ क़ हिन्दी क्षि 0123456789 /"),
    ("NotoSansCJKsc-Regular.otf", "中文 日本語 한국어 𠮷 한 한 0123456789 /"),
]
for name, text in samples:
    font = subset.load_font("tmp/fonts/" + name, subset.Options())
    options = subset.Options()
    options.name_IDs = ["*"]
    options.name_legacy = True
    options.name_languages = ["*"]
    options.layout_features = ["*"]
    subsetter = subset.Subsetter(options=options)
    subsetter.populate(text=text)
    subsetter.subset(font)
    font.save("tests/fixtures/fonts/" + name)
```
