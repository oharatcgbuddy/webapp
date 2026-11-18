"""Genera le immagini di avvio della PWA per iPhone (apple-touch-startup-image) in public/splash/.

iOS mostra una pagina bianca finché l'app non è pronta, a meno che per ogni schermo ci sia un'immagine con le
dimensioni esatte. Qui: fondo giallo del sito, logo al centro con ombra dura nera (come i riquadri dell'app).
Le stesse misure sono in src/lib/splash.ts (con le media query): se cambi l'elenco, cambialo in entrambi.

Uso (serve Pillow, per esempio quello di services/image-api):
    services/image-api/.venv/bin/python scripts/make-splash-images.py
"""

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
LOGO = ROOT / "public" / "logo.png"
OUT = ROOT / "public" / "splash"

YELLOW = (255, 210, 63)  # --yellow del sito
INK = (17, 17, 17)

# (larghezza, altezza) in punti CSS e rapporto di pixel: dimensione dell'immagine = punti × rapporto.
DEVICES = [
    (440, 956, 3),  # 16 Pro Max
    (402, 874, 3),  # 16 Pro
    (430, 932, 3),  # 16 Plus, 15 Pro Max, 15 Plus, 14 Pro Max
    (393, 852, 3),  # 16, 15, 15 Pro, 14 Pro
    (390, 844, 3),  # 14, 13, 13 Pro, 12, 12 Pro
    (375, 812, 3),  # 13 mini, 12 mini, 11 Pro, XS, X
    (414, 896, 3),  # 11 Pro Max, XS Max
    (414, 896, 2),  # 11, XR
    (414, 736, 3),  # 8 Plus
    (375, 667, 2),  # 8, SE (2ª e 3ª gen.)
    (320, 568, 2),  # SE (1ª gen.)
]


def render(w: int, h: int) -> Image.Image:
    canvas = Image.new("RGB", (w, h), YELLOW)
    logo = Image.open(LOGO).convert("RGBA")
    size = round(min(w, h) * 0.56)
    logo = logo.resize((size, size), Image.LANCZOS)
    x, y = (w - size) // 2, (h - size) // 2 - round(h * 0.02)
    # ombra dura: la forma del logo in nero, spostata in basso a destra
    off = max(6, round(size * 0.025))
    shadow = Image.new("RGBA", logo.size, INK + (255,))
    shadow.putalpha(logo.getchannel("A"))
    canvas.paste(shadow, (x + off, y + off), shadow)
    canvas.paste(logo, (x, y), logo)
    return canvas


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for pw, ph, ratio in DEVICES:
        w, h = pw * ratio, ph * ratio
        path = OUT / f"{w}x{h}.png"
        # Pochi colori piatti: con la palette ridotta il file pesa una frazione.
        render(w, h).quantize(colors=96, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).save(path, optimize=True)
        print(f"{path.relative_to(ROOT)}  {path.stat().st_size // 1024} KB")


if __name__ == "__main__":
    main()
