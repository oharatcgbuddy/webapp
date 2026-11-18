# Servizio immagini (FastAPI, nello stesso progetto Vercel dell'app)

Disegna l'immagine del mazzo e del risultato di un torneo (PNG, formati intera / storia 9:16 / post 4:5).
L'app Next.js lo chiama da server a server; il servizio scarica solo immagini pubbliche dal bucket di
Supabase Storage e non ha database né stato.

## Come è collegato (Vercel Services, beta)

Un solo progetto Vercel, definito dal `vercel.json` nella radice del repository:

- servizio `web`: l'app Next.js, l'unico raggiungibile da internet (regola `rewrites` catch-all);
- servizio `images`: questa cartella (FastAPI, `main:app`), **privato**: nessun indirizzo pubblico.
  L'app lo raggiunge con un collegamento interno (`bindings`) che inietta `IMAGE_API_URL` nel servizio `web`.

Impostazioni nel progetto Vercel (una tantum):

1. Settings → Build & Development → **Framework Preset: Services**, Root Directory vuota (radice del repository).
2. Variabili d'ambiente, per ambiente (Production e Preview, sono condivise dai due servizi):
   - `IMAGE_API_KEY`: chiave casuale di almeno 24 caratteri (es. `openssl rand -base64 36`), diversa per Production e Preview.
   - `NEXT_PUBLIC_SUPABASE_URL`: già presente; il servizio la usa per sapere da quale bucket scaricare le immagini
     (Production = progetto di produzione, Preview = sviluppo). `IMAGE_API_URL` non va impostata: la inietta Vercel.

Controllo: `GET /health` del servizio risponde `{"ok": true}` (non è pubblico: si prova in locale).

## Provarlo in locale

```bash
cd services/image-api
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
SUPABASE_URL=https://<ref>.supabase.co IMAGE_API_KEY=<almeno 24 caratteri> .venv/bin/uvicorn main:app --port 8099
.venv/bin/python sample.py /tmp/immagini   # disegna le immagini di prova (senza rete)
```

Con l'app in locale, in `.env.local`: `IMAGE_API_URL=http://127.0.0.1:8099` e la stessa `IMAGE_API_KEY`.

`POST /render` con l'header `X-Api-Key`: il corpo è descritto da `RenderRequest` in `render.py`.
