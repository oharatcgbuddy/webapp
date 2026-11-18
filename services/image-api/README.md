# Servizio immagini (FastAPI su Vercel)

Disegna l'immagine del mazzo e del risultato di un torneo (PNG, formati intera / storia 9:16 / post 4:5).
L'app Next.js lo chiama da server a server con una chiave condivisa; il servizio scarica solo immagini
pubbliche dal bucket di Supabase Storage e non ha database né stato.

## Pubblicazione su Vercel

Un progetto Vercel separato da quello dell'app, dallo stesso repository GitHub:

1. Vercel → Add New → Project → repository `webapp`.
2. **Root Directory**: `services/image-api`. Framework: FastAPI (rilevato da `main.py`). Python 3.12 (`.python-version`).
3. **Deployment Protection**: disattivala (Settings → Deployment Protection): l'accesso è già protetto dalla chiave
   `X-Api-Key`, e senza questo l'app non riesce a chiamare le anteprime.
4. Variabili d'ambiente (Settings → Environment Variables), diverse per ambiente:
   - `SUPABASE_URL`: Production = progetto di produzione, Preview = progetto di sviluppo (es. `https://<ref>.supabase.co`).
   - `IMAGE_API_KEY`: una chiave casuale di almeno 24 caratteri (es. `openssl rand -base64 36`), diversa per Production e Preview.
5. Nel progetto dell'app aggiungi `IMAGE_API_URL` (dominio del servizio, senza `/` finale) e `IMAGE_API_KEY`
   (la stessa del servizio, per lo stesso ambiente), poi rifai il deploy dell'app.

Controllo: `GET /health` risponde `{"ok": true}`.

## Provarlo in locale

```bash
cd services/image-api
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
SUPABASE_URL=https://<ref>.supabase.co IMAGE_API_KEY=<almeno 24 caratteri> .venv/bin/uvicorn main:app --port 8099
.venv/bin/python sample.py /tmp/immagini   # disegna le immagini di prova (senza rete)
```

`POST /render` con l'header `X-Api-Key`: il corpo è descritto da `RenderRequest` in `render.py`.
