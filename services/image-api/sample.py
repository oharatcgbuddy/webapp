"""Prova locale del disegno: scarica le immagini vere da Supabase Storage e scrive due PNG di esempio.

Uso:  .venv/bin/python sample.py <cartella-di-uscita>
Variabile facoltativa: SUPABASE_URL (di default il progetto dev).
"""

import os
import sys
import urllib.request
from pathlib import Path

from render import RenderRequest, render

BASE = os.environ.get("SUPABASE_URL", "https://kmbldqswzlmdapmmzbdl.supabase.co").rstrip("/")
OUT = Path(sys.argv[1] if len(sys.argv) > 1 else ".")
HERE = Path(__file__).parent

LEADER = {"code": "OP11-041", "name": "Nami", "colors": ["Blue", "Yellow"], "image_path": "onepiece/leaders/OP11-041"}
CARDS = [
    ("OP17-057", "Fullalead", 1, "Stage", ["Blue"], 0), ("OP12-103", "Seto", 5, "Character", ["Yellow"], 2000),
    ("OP10-108", "Scratchmen Apoo", 1, "Character", ["Yellow"], 1000), ("OP01-068", "Gecko Moria", 4, "Character", ["Blue"], 1000),
    ("OP10-059", "Follow Me and I Will Guide You", 1, "Event", ["Blue"], None), ("OP02-055", "Dracule Mihawk", 6, "Character", ["Blue"], 1000),
    ("ST28-004", "Kouzuki Momonosuke", 6, "Character", ["Yellow"], 0), ("EB03-027", "Marguerite", 6, "Character", ["Blue"], 1000),
    ("ST03-002", "Edward Weevil", 3, "Character", ["Blue"], 1000), ("OP15-053", "Rebecca", 1, "Character", ["Blue"], 1000),
    ("OP04-098", "Toko", 2, "Character", ["Yellow"], 1000), ("OP03-114", "Charlotte Linlin", 10, "Character", ["Yellow"], 0),
    ("OP08-056", "Moby Dick", 2, "Stage", ["Blue"], 0), ("OP17-116", "Fulgora", 1, "Event", ["Yellow"], 0),
    ("OP05-047", "Basil Hawkins", 4, "Character", ["Blue"], 1000), ("OP13-110", "Stussy", 7, "Character", ["Yellow"], 0),
    ("OP10-051", "Hack", 4, "Character", ["Blue"], 1000), ("OP05-059", "Let Us Begin the World of Violence!!", 5, "Event", ["Blue"], None),
]
QTY = [4, 4, 4, 1, 2, 3, 4, 1, 1, 2, 4, 4, 4, 2, 2, 2, 2, 4]
OPP = {
    "OP01-001": ("Roronoa Zoro", ["Red"]), "OP05-060": ("Monkey.D.Luffy", ["Purple"]), "OP09-001": ("Shanks", ["Red"]),
    "OP10-022": ("Trafalgar Law", ["Green", "Yellow"]), "OP13-002": ("Portgas.D.Ace", ["Blue", "Red"]),
}


def get(url: str) -> bytes | None:
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "ohara-image-sample/0.1"})
        with urllib.request.urlopen(req, timeout=20) as r:
            return r.read()
    except Exception as e:  # noqa: BLE001
        print("  non scaricata:", url, e)
        return None


def img(path: str, thumb: bool = False) -> bytes | None:
    return get(f"{BASE}/storage/v1/object/public/card-images/{path}{'.thumb' if thumb else ''}.webp")


total = 0
cards = []
for (code, name, cost, typ, colors, counter), q in zip(CARDS, QTY):
    q = min(q, 50 - total)
    if q <= 0:
        break
    total += q
    cards.append({"code": code, "qty": q, "name": name, "cost": cost, "type": typ, "colors": colors, "counter": counter, "image_path": f"onepiece/cards/{code}"})

images: dict[str, bytes | None] = {f"leader:{LEADER['code']}": img(LEADER["image_path"])}
for c in cards:
    images[f"card:{c['code']}"] = img(c["image_path"])
for code in OPP:
    images[f"opp:{code}"] = img(f"onepiece/leaders/{code}", thumb=True)
logo = (HERE / "assets" / "logo.png").read_bytes()

deck = RenderRequest.model_validate({"kind": "deck", "title": "Nami Control", "leader": LEADER, "cards": cards})
(OUT / "deck.png").write_bytes(render(deck, images, logo, None))

matchups = [
    {"round": i + 1, "opponent_code": code, "opponent_name": OPP[code][0], "opponent_colors": OPP[code][1], "dice_won": dice, "result": res}
    for i, (code, dice, res) in enumerate(
        [("OP01-001", True, "win"), ("OP05-060", False, "win"), ("OP09-001", True, "win"), ("OP10-022", False, "loss"),
         ("OP13-002", True, "win"), ("OP01-001", False, "win"), ("OP09-001", True, "win")]
    )
]
result = RenderRequest.model_validate(
    {"kind": "result", "title": "Marco Rossi", "leader": LEADER, "cards": cards, "result_label": "WINNER", "result_winner": True,
     "placement_text": "1° su 32", "tournament": "Locals di giovedì", "date": "18 nov 2026", "shop": {"name": "Magic Lair Torino"}, "matchups": matchups}
)
(OUT / "result.png").write_bytes(render(result, images, logo, None))
for fmt in ("story", "post"):
    r = result.model_copy(update={"format": fmt})
    (OUT / f"result_{fmt}.png").write_bytes(render(r, images, logo, None))
print("scritti:", OUT / "deck.png", OUT / "result.png", "| carte nel mazzo:", total)
