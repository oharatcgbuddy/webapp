"""Disegno dell'immagine del mazzo e del risultato di un torneo (Pillow).

Funzione pura: riceve i dati già pronti e le immagini già scaricate, restituisce un'immagine PNG.
Il layout è pensato per la condivisione (1080 px di larghezza, altezza variabile). Si disegna al doppio della
risoluzione e poi si riduce, per avere bordi arrotondati e testo senza scalettature.
"""

from __future__ import annotations

import io
import math
from functools import lru_cache
from pathlib import Path
from typing import Literal

from PIL import Image, ImageDraw, ImageFont
from pydantic import BaseModel, Field

FONT_PATH = Path(__file__).parent / "fonts" / "SpaceGrotesk.ttf"

W = 1080  # larghezza in "pixel di progetto"
SS = 2  # supercampionamento
PAD = 72
COLS = 6
GAP = 12
CARD_W = (W - 2 * PAD - (COLS - 1) * GAP) // COLS
CARD_H = round(CARD_W * 1.4)

BG_TOP = (12, 27, 48)
BG_BOTTOM = (6, 14, 28)
PANEL = (16, 33, 58)
PANEL_LINE = (35, 62, 98)
TEXT = (240, 245, 255)
MUTED = (140, 160, 190)
GOLD = (255, 205, 60)
GOLD_DARK = (60, 40, 0)
BLUE = (52, 130, 220)
GREEN = (47, 164, 106)
RED = (228, 72, 60)
YELLOW = (255, 210, 63)

COLOR_RGB = {
    "Red": (228, 72, 60),
    "Green": (47, 164, 106),
    "Blue": (47, 141, 224),
    "Purple": (139, 92, 214),
    "Black": (70, 72, 82),
    "Yellow": (242, 194, 48),
}


class Card(BaseModel):
    code: str = Field(max_length=20)
    qty: int = Field(ge=1, le=4)
    name: str | None = Field(default=None, max_length=80)
    cost: int | None = Field(default=None, ge=0, le=20)
    type: str | None = Field(default=None, max_length=20)
    colors: list[str] = Field(default_factory=list, max_length=4)
    counter: int | None = Field(default=None, ge=0, le=5000)
    image_path: str | None = Field(default=None, max_length=100)


class Leader(BaseModel):
    code: str = Field(max_length=20)
    name: str = Field(max_length=80)
    colors: list[str] = Field(default_factory=list, max_length=4)
    image_path: str | None = Field(default=None, max_length=100)


class Matchup(BaseModel):
    round: int | None = Field(default=None, ge=1, le=40)
    opponent_code: str | None = Field(default=None, max_length=20)
    opponent_name: str | None = Field(default=None, max_length=80)
    opponent_colors: list[str] = Field(default_factory=list, max_length=4)
    opponent_image_path: str | None = Field(default=None, max_length=100)
    dice_won: bool | None = None
    result: Literal["win", "loss", "draw"]


class Shop(BaseModel):
    name: str = Field(max_length=80)
    logo_path: str | None = Field(default=None, max_length=100)


class RenderRequest(BaseModel):
    kind: Literal["deck", "result"] = "deck"
    title: str = Field(max_length=60)
    leader: Leader
    cards: list[Card] = Field(max_length=60)
    # Risultato (solo kind="result"): "WINNER" in oro oppure un record come "6-1".
    result_label: str | None = Field(default=None, max_length=20)
    result_winner: bool = False
    placement_text: str | None = Field(default=None, max_length=30)
    tournament: str | None = Field(default=None, max_length=80)
    date: str | None = Field(default=None, max_length=30)
    shop: Shop | None = None
    matchups: list[Matchup] = Field(default_factory=list, max_length=16)


# ---------- utilità di disegno ----------


def S(v: float) -> int:
    return int(round(v * SS))


@lru_cache(maxsize=64)
def font(size: int, weight: int = 700) -> ImageFont.FreeTypeFont:
    f = ImageFont.truetype(str(FONT_PATH), S(size))
    f.set_variation_by_axes([weight])
    return f


def text_w(draw: ImageDraw.ImageDraw, s: str, f: ImageFont.FreeTypeFont) -> float:
    return draw.textlength(s, font=f) / SS


def fit(draw: ImageDraw.ImageDraw, s: str, f: ImageFont.FreeTypeFont, max_w: float) -> str:
    if text_w(draw, s, f) <= max_w:
        return s
    while len(s) > 1 and text_w(draw, s + "…", f) > max_w:
        s = s[:-1]
    return s.rstrip() + "…"


def text(draw, xy, s, f, fill=TEXT, anchor="la"):
    draw.text((S(xy[0]), S(xy[1])), s, font=f, fill=fill, anchor=anchor)


def rrect(draw, box, radius, fill=None, outline=None, width=1):
    x0, y0, x1, y1 = box
    draw.rounded_rectangle(
        (S(x0), S(y0), S(x1), S(y1)), radius=S(radius), fill=fill, outline=outline, width=S(width) if outline else 0
    )


def load_image(data: bytes | None) -> Image.Image | None:
    if not data:
        return None
    try:
        return Image.open(io.BytesIO(data)).convert("RGBA")
    except Exception:
        return None


def paste_rounded(canvas: Image.Image, img: Image.Image | None, box, radius, placeholder: str = "", cover: bool = True):
    x0, y0, x1, y1 = box
    w, h = S(x1 - x0), S(y1 - y0)
    tile = Image.new("RGBA", (w, h), (30, 50, 80, 255) if cover else (0, 0, 0, 0))
    if img is not None:
        iw, ih = img.size
        scale = max(w / iw, h / ih) if cover else min(w / iw, h / ih)
        resized = img.resize((max(1, round(iw * scale)), max(1, round(ih * scale))), Image.LANCZOS)
        tile.paste(resized, ((w - resized.width) // 2, (h - resized.height) // 2), resized)
    elif placeholder:
        ImageDraw.Draw(tile).text((w // 2, h // 2), placeholder, font=font(14, 700), fill=MUTED, anchor="mm")
    mask = Image.new("L", (w, h), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, w - 1, h - 1), radius=S(radius), fill=255)
    canvas.paste(tile, (S(x0), S(y0)), Image.composite(tile.getchannel("A"), Image.new("L", (w, h), 0), mask))


def color_dots(draw, x, y, colors: list[str], r: float = 9) -> float:
    for i, c in enumerate(colors[:4]):
        cx = x + i * (r * 2 + 6)
        rgb = COLOR_RGB.get(c, MUTED)
        draw.ellipse(
            (S(cx), S(y), S(cx + r * 2), S(y + r * 2)),
            fill=rgb,
            outline=(255, 255, 255, 90) if c == "Black" else None,
            width=S(1.5),
        )
    return x + len(colors[:4]) * (r * 2 + 6)


def pill(draw, x, y, label: str, f, fill, fg, pad_x=18, h=40, min_w=0) -> float:
    w = max(min_w, text_w(draw, label, f) + pad_x * 2)
    rrect(draw, (x, y, x + w, y + h), h / 2, fill=fill)
    text(draw, (x + w / 2, y + h / 2), label, f, fill=fg, anchor="mm")
    return x + w


# ---------- statistiche ----------


def stats(cards: list[Card]):
    cost = [0] * 11
    colors: dict[str, int] = {}
    types = {"Character": 0, "Event": 0, "Stage": 0}
    counter = {"+1000": 0, "+2000": 0, "Nessuno": 0}
    total = 0
    cost_sum = 0
    cost_n = 0
    for c in cards:
        total += c.qty
        if c.cost is not None:
            cost[min(c.cost, 10)] += c.qty
            cost_sum += c.cost * c.qty
            cost_n += c.qty
        for col in c.colors:
            colors[col] = colors.get(col, 0) + c.qty
        if c.type in types:
            types[c.type] += c.qty
        if c.counter == 1000:
            counter["+1000"] += c.qty
        elif c.counter == 2000:
            counter["+2000"] += c.qty
        else:
            counter["Nessuno"] += c.qty
    return {
        "cost": cost,
        "avg": (cost_sum / cost_n) if cost_n else 0,
        "colors": colors,
        "types": types,
        "counter": counter,
        "total": total,
    }


# ---------- rendering ----------


def render(req: RenderRequest, images: dict[str, bytes | None], app_logo: bytes | None, shop_logo: bytes | None) -> bytes:
    cards = sorted(req.cards, key=lambda c: (c.cost if c.cost is not None else 99, c.code))
    rows = math.ceil(len(cards) / COLS) if cards else 0
    st = stats(req.cards)

    head_h = 330
    grid_h = rows * (CARD_H + GAP) if rows else 0
    stats_h = 210 if cards else 0
    match_h = (70 + len(req.matchups) * 62 + 24) if req.matchups else 0
    foot_h = 130
    H = head_h + grid_h + (24 + stats_h if stats_h else 0) + (28 + match_h if match_h else 0) + foot_h

    canvas = Image.new("RGBA", (S(W), S(H)), BG_BOTTOM + (255,))
    bg = ImageDraw.Draw(canvas)
    for y in range(S(H)):
        t = y / max(1, S(H) - 1)
        bg.line([(0, y), (S(W), y)], fill=tuple(round(a + (b - a) * t) for a, b in zip(BG_TOP, BG_BOTTOM)) + (255,))
    d = ImageDraw.Draw(canvas)
    rrect(d, (22, 22, W - 22, H - 22), 30, outline=PANEL_LINE, width=2)

    # --- intestazione ---
    lw, lh = 168, 235
    paste_rounded(canvas, load_image(images.get(f"leader:{req.leader.code}")), (PAD, 64, PAD + lw, 64 + lh), 12, req.leader.code)
    x = PAD + lw + 36
    d.line([(S(x), S(78)), (S(x + 26), S(78))], fill=(80, 140, 220), width=S(3))
    text(d, (x + 38, 78), "One Piece Card Game", font(24, 600), fill=MUTED, anchor="lm")
    title = fit(d, req.title, font(66, 700), W - x - PAD - 10)
    text(d, (x, 98), title, font(66, 700))
    cx = color_dots(d, x, 190, req.leader.colors)
    sub = f"{req.leader.code} · {req.leader.name}"
    text(d, (cx + 10, 189), fit(d, sub, font(28, 500), W - cx - PAD - 20), font(28, 500), fill=MUTED)
    text(d, (x, 226), f"{st['total']} carte", font(26, 600), fill=MUTED)

    bx = x
    by = 268
    if req.kind == "result" and req.result_label:
        if req.result_winner:
            bx = pill(d, bx, by, req.result_label, font(26, 700), GOLD, GOLD_DARK) + 12
        else:
            bx = pill(d, bx, by, req.result_label, font(26, 700), BLUE, (255, 255, 255)) + 12
        if req.placement_text:
            bx = pill(d, bx, by, req.placement_text, font(24, 600), PANEL, TEXT) + 12
    for label in (req.tournament, req.date):
        if label and bx < W - PAD - 150:
            label = fit(d, label, font(24, 500), W - PAD - bx - 40)
            bx = pill(d, bx, by, label, font(24, 500), PANEL, MUTED) + 12

    d.line([(S(PAD), S(head_h - 18)), (S(W - PAD), S(head_h - 18))], fill=PANEL_LINE, width=S(2))

    # --- griglia del mazzo ---
    for i, c in enumerate(cards):
        r, col = divmod(i, COLS)
        x0 = PAD + col * (CARD_W + GAP)
        y1 = head_h + r * (CARD_H + GAP)
        paste_rounded(canvas, load_image(images.get(f"card:{c.code}")), (x0, y1, x0 + CARD_W, y1 + CARD_H), 8, c.code)
        label = f"×{c.qty}"
        f = font(24, 700)
        bw = text_w(d, label, f) + 22
        rrect(d, (x0 + CARD_W - bw - 6, y1 + CARD_H - 38, x0 + CARD_W - 6, y1 + CARD_H - 8), 8, fill=(8, 18, 34, 235), outline=(255, 255, 255, 70), width=1.5)
        text(d, (x0 + CARD_W - bw / 2 - 6, y1 + CARD_H - 23), label, f, anchor="mm")
    y = head_h + grid_h

    # --- statistiche ---
    if cards:
        y += 24
        rrect(d, (PAD, y, W - PAD, y + stats_h), 18, fill=PANEL, outline=PANEL_LINE, width=1.5)
        px = PAD + 28
        text(d, (px, y + 22), "Curva dei costi", font(22, 700), fill=TEXT, anchor="la")
        text(d, (PAD + 330, y + 24), f"Media {st['avg']:.1f}", font(20, 500), fill=MUTED, anchor="ra")
        mx = max(st["cost"]) or 1
        bar_w = 26
        base = y + stats_h - 46
        for i, v in enumerate(st["cost"]):
            bx0 = px + i * (bar_w + 4)
            if v:
                h = max(6, round(90 * v / mx))
                rrect(d, (bx0, base - h, bx0 + bar_w, base), 4, fill=BLUE)
                text(d, (bx0 + bar_w / 2, base - h - 4), str(v), font(18, 600), anchor="mb")
            text(d, (bx0 + bar_w / 2, base + 8), "10+" if i == 10 else str(i), font(16, 500), fill=MUTED, anchor="ma")

        cx0 = PAD + 380
        text(d, (cx0, y + 22), "Colori", font(22, 700), anchor="la")
        cmx = max(st["colors"].values() or [1])
        for i, (col, v) in enumerate(sorted(st["colors"].items(), key=lambda kv: -kv[1])[:4]):
            top = base - round(90 * v / cmx)
            rrect(d, (cx0 + i * 40, top, cx0 + i * 40 + 30, base), 4, fill=COLOR_RGB.get(col, MUTED))
            text(d, (cx0 + i * 40 + 15, top - 4), str(v), font(18, 600), anchor="mb")
            d.ellipse((S(cx0 + i * 40 + 6), S(base + 10), S(cx0 + i * 40 + 24), S(base + 28)), fill=COLOR_RGB.get(col, MUTED))

        tx0 = PAD + 580
        text(d, (tx0, y + 22), "Tipi", font(22, 700), anchor="la")
        for i, (name, key) in enumerate((("Personaggi", "Character"), ("Eventi", "Event"), ("Stage", "Stage"))):
            text(d, (tx0, y + 70 + i * 36), str(st["types"][key]), font(26, 700), anchor="la")
            text(d, (tx0 + 52, y + 74 + i * 36), name, font(22, 500), fill=MUTED, anchor="la")

        kx0 = PAD + 770
        text(d, (kx0, y + 22), "Counter", font(22, 700), anchor="la")
        for i, key in enumerate(("+1000", "+2000", "Nessuno")):
            text(d, (kx0, y + 70 + i * 36), str(st["counter"][key]), font(26, 700), anchor="la")
            text(d, (kx0 + 52, y + 74 + i * 36), key, font(22, 500), fill=MUTED, anchor="la")
        y += stats_h

    # --- scontri ---
    if req.matchups:
        y += 28
        rrect(d, (PAD, y, W - PAD, y + match_h), 18, fill=PANEL, outline=PANEL_LINE, width=1.5)
        text(d, (PAD + 28, y + 22), "Scontri", font(24, 700), anchor="la")
        ry = y + 64
        for m in req.matchups:
            text(d, (PAD + 28, ry + 26), f"R{m.round}" if m.round else "", font(22, 700), fill=MUTED, anchor="lm")
            thumb = load_image(images.get(f"opp:{m.opponent_code}")) if m.opponent_code else None
            paste_rounded(canvas, thumb, (PAD + 86, ry + 2, PAD + 86 + 36, ry + 2 + 50), 5, "")
            nx = PAD + 140
            name = m.opponent_name or m.opponent_code or "Avversario n/d"
            shown = fit(d, name, font(26, 600), 380)
            text(d, (nx, ry + 26), shown, font(26, 600), anchor="lm")
            color_dots(d, nx + text_w(d, shown, font(26, 600)) + 14, ry + 17, m.opponent_colors, r=8)
            if m.dice_won is not None:
                text(d, (W - PAD - 28 - 118 - 24, ry + 26), "Dado vinto" if m.dice_won else "Dado perso", font(22, 500), fill=MUTED, anchor="rm")
            label, fill, fg = {
                "win": ("VINTO", GREEN, (255, 255, 255)),
                "loss": ("PERSO", RED, (255, 255, 255)),
                "draw": ("PARI", YELLOW, (40, 30, 0)),
            }[m.result]
            pill(d, W - PAD - 28 - 118, ry + 6, label, font(22, 700), fill, fg, pad_x=20, h=40, min_w=118)
            ry += 62
        y += match_h

    # --- piè di pagina ---
    fy = H - foot_h + 24
    d.line([(S(PAD), S(fy - 14)), (S(W - PAD), S(fy - 14))], fill=PANEL_LINE, width=S(2))
    logo = load_image(app_logo)
    if logo is not None:
        paste_rounded(canvas, logo, (PAD, fy + 6, PAD + 70, fy + 76), 10, "", cover=False)
    text(d, (PAD + 86, fy + 41), "Ohara TCG Buddy", font(30, 700), anchor="lm")
    if req.shop:
        sl = load_image(shop_logo)
        right = W - PAD
        name = fit(d, req.shop.name, font(26, 600), 300)
        if sl is not None:
            paste_rounded(canvas, sl, (right - 70, fy + 6, right, fy + 76), 10, "", cover=False)
            right -= 86
        text(d, (right, fy + 41), name, font(26, 600), fill=TEXT, anchor="rm")
    else:
        text(d, (W - PAD, fy + 41), "ohara-tcg-buddy.vercel.app", font(24, 500), fill=MUTED, anchor="rm")

    out = canvas.convert("RGB").resize((W, H), Image.LANCZOS)
    buf = io.BytesIO()
    out.save(buf, format="PNG", optimize=True)
    return buf.getvalue()
