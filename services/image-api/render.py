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
PAD = 56
GAP = 12
TYPE_ORDER = {"Character": 0, "Event": 1, "Stage": 2}  # personaggi, poi eventi (spell), poi stage
TARGET_H = {"story": 1920, "post": 1350}

# Stile del sito (neo-brutalismo): carta, inchiostro, bordi spessi e ombre dure.
PAPER = (255, 244, 214)
INK = (17, 17, 17)
WHITE = (255, 255, 255)
MUTED = (96, 84, 60)
YELLOW = (255, 210, 63)
RED = (255, 90, 95)
BLUE = (77, 157, 224)
GREEN = (59, 178, 115)
PINK = (255, 143, 216)
TEXT = INK
BORDER = 4
SHADOW = 6

COLOR_RGB = {
    "Red": (233, 64, 58),
    "Green": (47, 164, 106),
    "Blue": (47, 141, 224),
    "Purple": (139, 92, 214),
    "Black": (50, 50, 56),
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
    result: Literal["win", "loss", "bye"]  # bye = turno di riposo: conta come vinto, senza dado


class Shop(BaseModel):
    name: str = Field(max_length=80)
    logo_path: str | None = Field(default=None, max_length=100)


class RenderRequest(BaseModel):
    kind: Literal["deck", "result"] = "deck"
    # full = altezza libera; story = 1080x1920 (9:16); post = 1080x1350 (4:5, Instagram)
    format: Literal["full", "story", "post"] = "full"
    title: str = Field(max_length=60)
    leader: Leader
    cards: list[Card] = Field(max_length=60)
    # Risultato (solo kind="result"): "WINNER" in oro (nessuna sconfitta) oppure "X-1", "X-2"… (il numero dopo la X sono le sconfitte).
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


def shrink(draw, s: str, size: int, weight: int, max_w: float, min_size: int):
    """Font e testo: si rimpicciolisce il carattere finché il testo sta nello spazio; sotto il minimo si accorcia con "…"."""
    f = font(size, weight)
    while size > min_size and text_w(draw, s, f) > max_w:
        size -= 1
        f = font(size, weight)
    return f, fit(draw, s, f, max_w)


def text(draw, xy, s, f, fill=TEXT, anchor="la"):
    draw.text((S(xy[0]), S(xy[1])), s, font=f, fill=fill, anchor=anchor)


def brutal(draw, box, fill=WHITE, bw=BORDER, sh=SHADOW):
    """Riquadro con bordo spesso e ombra dura, come .brutal-card del sito."""
    x0, y0, x1, y1 = box
    if sh:
        draw.rectangle((S(x0 + sh), S(y0 + sh), S(x1 + sh), S(y1 + sh)), fill=INK)
    draw.rectangle((S(x0), S(y0), S(x1), S(y1)), fill=fill, outline=INK, width=S(bw))


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
    tile = Image.new("RGBA", (w, h), (235, 225, 195, 255) if cover else (0, 0, 0, 0))
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
        draw.ellipse((S(cx), S(y), S(cx + r * 2), S(y + r * 2)), fill=COLOR_RGB.get(c, MUTED), outline=INK, width=S(2.5))
    return x + len(colors[:4]) * (r * 2 + 6)


def extruded(draw, box, fill, bw, depth):
    """Riquadro con profondità: un blocco nero pieno in basso a destra, nella stessa direzione dell'ombra della carta del
    leader e degli altri riquadri (la forma viene ripetuta spostandola un pixel alla volta, senza spazi)."""
    x0, y0, x1, y1 = box
    for k in range(depth, 0, -1):
        draw.rectangle((S(x0 + k), S(y0 + k), S(x1 + k), S(y1 + k)), fill=INK)
    draw.rectangle((S(x0), S(y0), S(x1), S(y1)), fill=fill, outline=INK, width=S(bw))


def pill(draw, x, y, label: str, f, fill, fg=INK, pad_x=18, h=44, min_w=0, bw=3, sh=3, depth=0) -> float:
    w = max(min_w, text_w(draw, label, f) + pad_x * 2)
    if depth:
        extruded(draw, (x, y, x + w, y + h), fill, bw, depth)
    else:
        brutal(draw, (x, y, x + w, y + h), fill=fill, bw=bw, sh=sh)
    text(draw, (x + w / 2, y + h / 2), label, f, fill=fg, anchor="mm")
    return x + w


def frame_image(canvas, d, img, box, placeholder="", bw=3):
    paste_rounded(canvas, img, box, 0, placeholder)
    x0, y0, x1, y1 = box
    d.rectangle((S(x0), S(y0), S(x1), S(y1)), outline=INK, width=S(bw))


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


def die(d, x, y, size, fill):
    """Dado a sei facce (stile del sito: bordo nero, ombra dura). Verde = dado vinto, rosso = dado perso."""
    brutal(d, (x, y, x + size, y + size), fill=fill, bw=3, sh=3)
    r = max(2.2, size * 0.075)
    for fx, fy in ((0.28, 0.28), (0.72, 0.28), (0.5, 0.5), (0.28, 0.72), (0.72, 0.72)):
        cx, cy = x + size * fx, y + size * fy
        d.ellipse((S(cx - r), S(cy - r), S(cx + r), S(cy + r)), fill=WHITE, outline=INK, width=S(1.2))


def draw_all(req, images, app_logo, shop_logo, total_h=None):
    compact = req.format == "post"
    n_unique = len(req.cards)
    cards = sorted(req.cards, key=lambda c: (TYPE_ORDER.get(c.type or "", 9), c.cost if c.cost is not None else 99, c.code))
    st = stats(req.cards)

    lw, lh = (140, 196) if compact else (168, 235)
    bar_h = 124  # il logo del locale (96) è il più grande, quello di Ohara (64) è più piccolo ma ben visibile
    top_gap = 34 if compact else 48
    content_h = 222 if compact else 252  # titolo, leader, risultato in evidenza, dettagli del torneo
    if req.kind == "result" and req.result_label:
        content_h += 11  # profondità del risultato: la riga del torneo scende di altrettanto
    head_h = bar_h + top_gap + max(lh, content_h) + (28 if compact else 40)
    stats_h = 0 if compact else (230 if cards else 0)
    row_h = 56 if compact else 62
    m_rows = math.ceil(len(req.matchups) / 2) if compact else len(req.matchups)
    match_h = (74 + m_rows * row_h + 20) if req.matchups else 0
    foot_h = 64
    gap = 24 if compact else 30
    fixed = head_h + (gap + stats_h if stats_h else 0) + (gap + 4 + match_h if match_h else 0) + 36 + foot_h

    def dims(c):
        w = (W - 2 * PAD - (c - 1) * GAP) // c
        h = round(w * 1.4)
        r = math.ceil(n_unique / c) if n_unique else 0
        return w, h, r, (r * (h + GAP) if r else 0)

    # Post: tra 5 e 9 colonne, quelle che fanno stare tutto nel formato; tra queste meno spazi vuoti nell'ultima
    # riga e, a parità, carte più grandi. Storia e intera: 6 colonne.
    if compact and n_unique:
        fits = [c for c in (5, 6, 7, 8, 9) if fixed + dims(c)[3] <= TARGET_H["post"]]
        cols = min(fits or [9], key=lambda c: (-n_unique % c, c))
    else:
        cols = 6
    card_w, card_h, rows, grid_h = dims(cols)
    natural = fixed + grid_h
    # Post: lo spazio avanzato va in buona parte all'intestazione (leader, logo del locale, testi), che si ingrandisce.
    hk = 1.0
    if compact and total_h and total_h > natural:
        hk = min(1.25, 1 + 0.7 * (total_h - natural) / max(lh, content_h))
        old_head = head_h
        lw, lh, content_h = round(lw * hk), round(lh * hk), round(content_h * hk)
        head_h = bar_h + top_gap + max(lh, content_h) + 28
        natural += head_h - old_head
        # Quello che resta si divide per metà tra gli spazi tra le sezioni (intestazione, mazzo, scontri) e il margine.
        n_gaps = 1 + (1 if req.matchups else 0)
        extra = round(max(0, total_h - natural) * 0.5 / n_gaps)
        head_h += extra
        if req.matchups:
            gap += extra
        natural += extra * n_gaps
    H = max(natural, total_h or 0)
    dy = (H - natural) / 2  # spazio in più: il contenuto resta centrato tra barra e piè di pagina

    canvas = Image.new("RGBA", (S(W), S(H)), PAPER + (255,))
    d = ImageDraw.Draw(canvas)

    # --- barra in alto: il locale in primo piano; Ohara compare una sola volta, più piccolo ---
    d.rectangle((0, 0, S(W), S(bar_h)), fill=YELLOW)
    d.rectangle((0, S(bar_h - BORDER), S(W), S(bar_h)), fill=INK)
    app = load_image(app_logo)
    shop_img = load_image(shop_logo) if req.shop else None
    cy = (bar_h - BORDER) / 2
    big, small = 96, 64

    if req.shop:
        left = PAD
        brand_f = font(24, 700)
        brand_w = text_w(d, "Ohara TCG Buddy", brand_f)
        right = W - PAD
        text(d, (right, cy), "Ohara TCG Buddy", brand_f, anchor="rm")
        if app is not None:
            paste_rounded(canvas, app, (right - brand_w - 12 - small, cy - small / 2, right - brand_w - 12, cy + small / 2), 0, "", cover=False)
        name_f, shop_name = shrink(d, req.shop.name, 36, 700, right - brand_w - 12 - small - left - 24, 24)
        text(d, (left, cy), shop_name, name_f, anchor="lm")
    else:
        left = PAD
        if app is not None:
            paste_rounded(canvas, app, (left, cy - big / 2, left + big, cy + big / 2), 0, "", cover=False)
            left += big + 20
        text(d, (left, cy), "Ohara TCG Buddy", font(40, 700), anchor="lm")

    # --- intestazione ---
    ly = bar_h + top_gap + dy
    d.rectangle((S(PAD + 8), S(ly + 8), S(PAD + lw + 8), S(ly + lh + 8)), fill=INK)
    frame_image(canvas, d, load_image(images.get(f"leader:{req.leader.code}")), (PAD, ly, PAD + lw, ly + lh), req.leader.code, bw=4)
    x = PAD + lw + 40
    # Logo del locale senza cornice, in alto a destra: il testo dell'intestazione si ferma prima.
    logo_sz = round((180 if compact else 210) * hk)
    right_limit = W - PAD - (logo_sz + 28 if shop_img is not None else 0)
    if shop_img is not None:
        paste_rounded(canvas, shop_img, (W - PAD - logo_sz, ly, W - PAD, ly + logo_sz), 0, "", cover=False)
    tsize = round((56 if compact else 64) * hk)
    title_f, title = shrink(d, req.title, tsize, 700, right_limit - x, 36)
    text(d, (x, ly - 4), title, title_f)
    off = round((74 if compact else 86) * hk)
    cx = color_dots(d, x, ly + off, req.leader.colors, r=12 * hk)
    sub = f"{req.leader.code} · {req.leader.name}"
    sub_f, sub = shrink(d, sub, round(28 * hk), 700, right_limit - cx - 20, 20)
    text(d, (cx + 8, ly + off + 12 * hk), sub, sub_f, anchor="lm")

    # Il risultato (WINNER, 6-1…) è l'elemento più importante dopo il nome: grande, con ombra marcata.
    ry = ly + round((106 if compact else 124) * hk)
    big_h = round((76 if compact else 84) * hk)
    info_y = ry
    if req.kind == "result" and req.result_label:
        fsz = round((50 if compact else 56) * hk)
        depth = round(11 * hk)
        # La profondità scende a destra e in basso: si lascia spazio al piazzamento e alla riga del torneo.
        cur = pill(d, x, ry, req.result_label, font(fsz, 700), YELLOW if req.result_winner else BLUE, pad_x=round(30 * hk), h=big_h, bw=5, depth=depth) + depth + 24
        if req.placement_text:
            ph = round(56 * hk)
            pad_p = round(22 * hk)
            # Il testo del piazzamento si rimpicciolisce se non starebbe prima del logo del locale.
            pf, ptxt = shrink(d, req.placement_text, round(30 * hk), 700, right_limit - cur - 2 * pad_p, 20)
            pill(d, cur, ry + (big_h - ph) / 2, ptxt, pf, WHITE, pad_x=pad_p, h=ph)
        info_y = ry + big_h + depth + 14
    # Torneo e data: una riga di testo semplice, secondaria.
    if req.tournament or req.date:
        tail = (" · " if req.tournament and req.date else "") + (req.date or "")
        size = round(24 * hk)
        f = font(size, 600)
        # Si rimpicciolisce tutta la riga (torneo e data insieme); solo sotto il minimo si accorcia il torneo.
        while size > 17 and text_w(d, (req.tournament or "") + tail, f) > right_limit - x:
            size -= 1
            f = font(size, 600)
        head = fit(d, req.tournament, f, right_limit - x - text_w(d, tail, f)) if req.tournament else ""
        text(d, (x, info_y + 14), head + tail, f, fill=MUTED, anchor="lm")  # si accorcia il torneo, mai la data

    # --- griglia del mazzo ---
    gy = head_h + dy
    for i, c in enumerate(cards):
        r, col = divmod(i, cols)
        x0 = PAD + col * (card_w + GAP)
        y1 = gy + r * (card_h + GAP)
        frame_image(canvas, d, load_image(images.get(f"card:{c.code}")), (x0, y1, x0 + card_w, y1 + card_h), c.code, bw=3)
        label = f"×{c.qty}"
        f = font(18 if compact else 24, 700)
        bw = text_w(d, label, f) + (14 if compact else 20)
        bh = 24 if compact else 32
        brutal(d, (x0 + card_w - bw - 4, y1 + card_h - bh - 6, x0 + card_w - 4, y1 + card_h - 6), fill=YELLOW, bw=3, sh=0)
        text(d, (x0 + card_w - bw / 2 - 4, y1 + card_h - 6 - bh / 2), label, f, anchor="mm")
    y = gy + grid_h

    # --- statistiche ---
    if stats_h:
        y += gap
        brutal(d, (PAD, y, W - PAD, y + stats_h), fill=WHITE)
        px = PAD + 28
        text(d, (px, y + 20), "Curva dei costi", font(22, 700), anchor="la")
        text(d, (PAD + 336, y + 22), f"Media {st['avg']:.1f}", font(20, 600), fill=MUTED, anchor="ra")
        mx = max(st["cost"]) or 1
        bar_w = 26
        base = y + stats_h - 50
        for i, v in enumerate(st["cost"]):
            bx0 = px + i * (bar_w + 4)
            if v:
                h = max(8, round(100 * v / mx))
                d.rectangle((S(bx0), S(base - h), S(bx0 + bar_w), S(base)), fill=BLUE, outline=INK, width=S(2.5))
                text(d, (bx0 + bar_w / 2, base - h - 4), str(v), font(18, 700), anchor="mb")
            text(d, (bx0 + bar_w / 2, base + 8), "10+" if i == 10 else str(i), font(16, 600), fill=MUTED, anchor="ma")

        cx0 = PAD + 386
        text(d, (cx0, y + 20), "Colori", font(22, 700), anchor="la")
        cmx = max(st["colors"].values() or [1])
        for i, (col, v) in enumerate(sorted(st["colors"].items(), key=lambda kv: -kv[1])[:4]):
            top = base - round(100 * v / cmx)
            d.rectangle((S(cx0 + i * 40), S(top), S(cx0 + i * 40 + 30), S(base)), fill=COLOR_RGB.get(col, MUTED), outline=INK, width=S(2.5))
            text(d, (cx0 + i * 40 + 15, top - 4), str(v), font(18, 700), anchor="mb")

        tx0 = PAD + 576
        text(d, (tx0, y + 20), "Tipi", font(22, 700), anchor="la")
        for i, (name, key) in enumerate((("Personaggi", "Character"), ("Eventi", "Event"), ("Stage", "Stage"))):
            text(d, (tx0, y + 70 + i * 40), str(st["types"][key]), font(28, 700), anchor="la")
            text(d, (tx0 + 52, y + 75 + i * 40), name, font(22, 600), fill=MUTED, anchor="la")

        kx0 = PAD + 770
        text(d, (kx0, y + 20), "Counter", font(22, 700), anchor="la")
        for i, key in enumerate(("+1000", "+2000", "Nessuno")):
            text(d, (kx0, y + 70 + i * 40), str(st["counter"][key]), font(28, 700), anchor="la")
            text(d, (kx0 + 52, y + 75 + i * 40), key, font(22, 600), fill=MUTED, anchor="la")
        y += stats_h

    # --- scontri ---
    if req.matchups:
        y += gap + 4
        brutal(d, (PAD, y, W - PAD, y + match_h), fill=WHITE)
        text(d, (PAD + 28, y + 24), "Scontri", font(26, 700), anchor="la")
        verdict = {"win": ("VINTO", GREEN), "loss": ("PERSO", RED), "bye": ("BYE", PINK)}
        colw = (W - 2 * PAD - 56 - 24) / 2
        for i, m in enumerate(req.matchups):
            if compact:
                # Si riempie prima la colonna di sinistra in verticale, poi quella di destra: 1 4 / 2 5 / 3.
                ccol, crow = divmod(i, m_rows)
                cx0 = PAD + 28 + ccol * (colw + 24)
                ry = y + 70 + crow * row_h
                if ccol == 0 and crow:
                    d.line([(S(PAD + 28), S(ry - 4)), (S(W - PAD - 28), S(ry - 4))], fill=INK, width=S(1.5))
                text(d, (cx0, ry + 24), f"R{m.round}" if m.round else "", font(20, 700), fill=MUTED, anchor="lm")
                thumb = load_image(images.get(f"opp:{m.opponent_code}")) if m.opponent_code and m.result != "bye" else None
                if m.result != "bye":
                    frame_image(canvas, d, thumb, (cx0 + 40, ry + 2, cx0 + 40 + 30, ry + 2 + 42), "", bw=2.5)
                name = "Nessun avversario" if m.result == "bye" else (m.opponent_name or m.opponent_code or "Avversario n/d")
                # Colori del leader avversario dopo il nome, come nelle altre versioni (il nome si accorcia per lasciare posto).
                dot_r = 7
                dots = m.opponent_colors[:4] if m.result != "bye" else []
                dots_w = len(dots) * (dot_r * 2 + 6) + (6 if dots else 0)
                name_f, name = shrink(d, name, 21, 700, colw - 82 - 36 - 12 - 96 - 8 - dots_w, 15)
                text(d, (cx0 + 82, ry + 24), name, name_f, anchor="lm")
                if dots:
                    color_dots(d, cx0 + 82 + text_w(d, name, name_f) + 10, ry + 24 - dot_r, dots, r=dot_r)
                if m.dice_won is not None and m.result != "bye":
                    die(d, cx0 + colw - 96 - 12 - 32, ry + 7, 32, GREEN if m.dice_won else RED)
                label, fill = verdict[m.result]
                pill(d, cx0 + colw - 96, ry + 4, label, font(20, 700), fill, INK, pad_x=10, h=38, min_w=96)
            else:
                ry = y + 70 + i * row_h
                if i:
                    d.line([(S(PAD + 28), S(ry - 4)), (S(W - PAD - 28), S(ry - 4))], fill=INK, width=S(1.5))
                text(d, (PAD + 28, ry + 26), f"R{m.round}" if m.round else "", font(22, 700), fill=MUTED, anchor="lm")
                thumb = load_image(images.get(f"opp:{m.opponent_code}")) if m.opponent_code and m.result != "bye" else None
                if m.result != "bye":
                    frame_image(canvas, d, thumb, (PAD + 86, ry + 2, PAD + 86 + 36, ry + 2 + 50), "", bw=2.5)
                nx = PAD + 140
                name = "Nessun avversario" if m.result == "bye" else (m.opponent_name or m.opponent_code or "Avversario n/d")
                name_f, shown = shrink(d, name, 26, 700, 380, 18)
                text(d, (nx, ry + 26), shown, name_f, anchor="lm")
                color_dots(d, nx + text_w(d, shown, name_f) + 14, ry + 16, m.opponent_colors, r=9)
                if m.dice_won is not None and m.result != "bye":
                    die(d, W - PAD - 28 - 118 - 24 - 40, ry + 5, 40, GREEN if m.dice_won else RED)
                label, fill = verdict[m.result]
                pill(d, W - PAD - 28 - 118, ry + 4, label, font(22, 700), fill, INK, pad_x=20, h=44, min_w=118)
        y += match_h

    # --- piè di pagina: sottile, senza ripetere il nome ---
    fy = H - foot_h
    d.rectangle((0, S(fy), S(W), S(H)), fill=YELLOW)
    d.rectangle((0, S(fy), S(W), S(fy + BORDER)), fill=INK)
    mid = fy + foot_h / 2 + 2
    text(d, (PAD, mid), "ONE PIECE CARD GAME", font(22, 700), anchor="lm")
    text(d, (W - PAD, mid), "ohara-tcg-buddy.vercel.app", font(22, 600), anchor="rm")
    return canvas, H, natural


def render(req: RenderRequest, images: dict[str, bytes | None], app_logo: bytes | None, shop_logo: bytes | None) -> bytes:
    target = TARGET_H.get(req.format)
    canvas, H, natural = draw_all(req, images, app_logo, shop_logo, target)
    out = canvas.convert("RGB")
    if target and H > target:
        # Troppo contenuto per il formato: si riduce tutto per farlo stare (margine color carta ai lati).
        s = target / H
        w2 = round(W * s)
        small = out.resize((w2, target), Image.LANCZOS)
        base = Image.new("RGB", (W, target), PAPER)
        base.paste(small, ((W - w2) // 2, 0))
        out = base
    else:
        out = out.resize((W, H), Image.LANCZOS)
    buf = io.BytesIO()
    out.save(buf, format="PNG", optimize=True)
    return buf.getvalue()
