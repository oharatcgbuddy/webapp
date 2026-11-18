"""API FastAPI che disegna l'immagine del mazzo o del risultato di un torneo.

L'app Next.js la chiama da server a server (con una chiave condivisa) passando i dati già controllati;
il servizio scarica solo le immagini pubbliche dal bucket di Supabase Storage (mai da indirizzi arbitrari)
e restituisce un PNG. Non ha database né stato.

Variabili d'ambiente:
  SUPABASE_URL    es. https://<progetto>.supabase.co (obbligatoria)
  IMAGE_API_KEY   chiave condivisa con l'app, almeno 24 caratteri (obbligatoria)
  MAX_RENDERS     disegni contemporanei (default 2)
"""

from __future__ import annotations

import asyncio
import hmac
import os
import re
from collections import OrderedDict
from pathlib import Path

import httpx
from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import JSONResponse, Response
from PIL import Image

from render import RenderRequest, render

Image.MAX_IMAGE_PIXELS = 20_000_000  # contro immagini "bomba"

SUPABASE_URL = os.environ["SUPABASE_URL"].rstrip("/")
API_KEY = os.environ["IMAGE_API_KEY"]
if len(API_KEY) < 24:
    raise RuntimeError("IMAGE_API_KEY deve avere almeno 24 caratteri")

APP_LOGO = (Path(__file__).parent / "assets" / "logo.png").read_bytes()
PATH_RE = re.compile(r"^[A-Za-z0-9_./-]{1,100}$")
MAX_IMAGE_BYTES = 2 * 1024 * 1024
MAX_BODY_BYTES = 64 * 1024
CACHE_ITEMS = 400

app = FastAPI(title="Ohara image API", docs_url=None, redoc_url=None, openapi_url=None)
_renders = asyncio.Semaphore(int(os.environ.get("MAX_RENDERS", "2")))
_cache: OrderedDict[str, bytes] = OrderedDict()


def check_key(x_api_key: str = Header(default="")) -> None:
    if not hmac.compare_digest(x_api_key.encode(), API_KEY.encode()):
        raise HTTPException(status_code=401, detail="Non autorizzato")


@app.middleware("http")
async def limit_body(request: Request, call_next):
    length = request.headers.get("content-length")
    if length and length.isdigit() and int(length) > MAX_BODY_BYTES:
        return JSONResponse({"detail": "Richiesta troppo grande"}, status_code=413)
    return await call_next(request)


async def fetch(client: httpx.AsyncClient, bucket: str, path: str | None, suffix: str = "") -> bytes | None:
    """Scarica un'immagine pubblica dal bucket indicato. Il percorso è validato: niente '..', niente URL esterni."""
    if not path or not PATH_RE.match(path) or ".." in path or path.startswith("/"):
        return None
    url = f"{SUPABASE_URL}/storage/v1/object/public/{bucket}/{path}{suffix}"
    if url in _cache:
        _cache.move_to_end(url)
        return _cache[url]
    try:
        r = await client.get(url, timeout=10.0)
    except httpx.HTTPError:
        return None
    if r.status_code != 200 or len(r.content) > MAX_IMAGE_BYTES:
        return None
    _cache[url] = r.content
    while len(_cache) > CACHE_ITEMS:
        _cache.popitem(last=False)
    return r.content


@app.get("/health")
async def health() -> dict[str, bool]:
    return {"ok": True}


@app.post("/render", dependencies=[Depends(check_key)])
async def render_image(req: RenderRequest) -> Response:
    async with httpx.AsyncClient(follow_redirects=False) as client:
        jobs: dict[str, asyncio.Future] = {}
        jobs[f"leader:{req.leader.code}"] = fetch(client, "card-images", req.leader.image_path, ".webp")
        for c in req.cards:
            jobs[f"card:{c.code}"] = fetch(client, "card-images", c.image_path, ".webp")
        for m in req.matchups:
            if m.opponent_code and f"opp:{m.opponent_code}" not in jobs:
                jobs[f"opp:{m.opponent_code}"] = fetch(client, "card-images", m.opponent_image_path, ".thumb.webp")
        logo_job = fetch(client, "shop-logos", req.shop.logo_path) if req.shop else asyncio.sleep(0, result=None)
        keys = list(jobs)
        results = await asyncio.gather(*jobs.values(), logo_job)
    images = dict(zip(keys, results[:-1]))
    shop_logo = results[-1]

    async with _renders:
        png = await run_in_threadpool(render, req, images, APP_LOGO, shop_logo)
    return Response(content=png, media_type="image/png", headers={"Cache-Control": "no-store"})
