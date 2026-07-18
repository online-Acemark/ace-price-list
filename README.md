# ACEMARK Price List — React app (live ERP prices)

Same UI/UX as the original HTML price list, rebuilt as a real React + Vite app
that pulls **live prices from the ERP** instead of hard-coded data files.

## Run

```bash
npm install
cp .env.example .env   # ERP API config (already present in this project)
npm run dev            # http://localhost:5180
```

## Configuration (`.env`)

All ERP endpoint config lives in `.env` (git-ignored; `.env.example` is the template):

| Variable | Used by | Purpose |
|---|---|---|
| `VITE_ERP_API_URL` | client (`src/api.js`) | full ERP URL for production / static builds |
| `VITE_ERP_PROXY_PATH` | client | dev-proxy path (same-origin) |
| `ERP_API_ORIGIN` | `vite.config.js` | origin the dev proxy forwards `/erp-api` to |
| `VITE_ERP_API_KEY` | client | optional — sent as `Bearer` / `x-api-key`. The current ERP needs none. |

Code keeps hardcoded fallbacks, so the app still runs if `.env` is missing.
Restart `npm run dev` after changing `.env`.

Build a static bundle:

```bash
npm run build    # output in dist/
npm run preview
```

## What it does

- **A4 Document view** — the print/PDF layout (cover, category pages, order form). Use the **Print / PDF** button.
- **Mobile view** — the WhatsApp-style card list with division tabs, search, and category chips.
- **Live sync** — on load it fetches the ERP price list and overlays current prices onto the catalog. The top bar shows `Live · N/739 rows from ERP` (green) or `Offline — showing saved prices` (amber) if the ERP can't be reached. **Refresh** re-syncs.

## How the data works

**The whole catalogue is built live from the ERP** (`buildCatalogFromApi` in
`src/api.js`). On load the app fetches the ERP and constructs:

- **Divisions** (the tabs) from the ERP `ProdDivision` field — ALL of them
  (School Stationery, Office Stationery, Corporate, Others).
- **Categories** from `BaseCat` (falling back to `ProdGroup`).
- **Families** from `SubCat`, with the family code derived from the products'
  common `ProductCode` prefix.
- **Rows** from the products in each family — one row per page, collapsing
  rulling/variety duplicates. MRP/DP/PKT/CRT/BLD come straight from the ERP, and
  a ▲/▼ arrow marks DP up/down vs `OldDP`.

Only **sizes and tags** are overlaid from the curated `src/catalog.js` (matched by
family code) — because the ERP has no size field. If the ERP is unreachable, the
app falls back to the saved curated `catalog.js` (offline mode).

> Note: because divisions/categories/families now come from raw ERP text, their
> names read as the ERP stores them (e.g. "Ace Crown Note Book 032p To 192p")
> rather than the hand-curated labels. Sizes/notes/tags exist only where the ERP
> family code matches a curated entry.

### Dev proxy / production note

The ERP is plain **HTTP**. In dev, `vite.config.js` proxies `/erp-api` → the ERP
host so the browser request stays same-origin. Over **HTTPS** a direct HTTP fetch
is blocked as mixed content, so the app calls the same-origin `/erp-api` path and
the host proxies it. On Vercel that proxy is `vercel.json`; on nginx/other hosts
add an equivalent reverse-proxy rewrite.

## Deploy to GitHub + Vercel

1. **Push to GitHub** (run inside `acemark-pricelist-react/`):
   ```bash
   git init
   git add .
   git commit -m "ACEMARK price list — live ERP React app"
   git branch -M main
   git remote add origin https://github.com/<you>/acemark-pricelist.git
   git push -u origin main
   ```
   `.env`, `node_modules/` and `dist/` are git-ignored; `package-lock.json` is committed.

2. **Import into Vercel** — "Add New → Project" → pick the repo. Vercel auto-detects
   Vite (build `vite build`, output `dist`). If the repo root is the parent folder,
   set **Root Directory = acemark-pricelist-react**.

3. **`vercel.json` (already included)** rewrites `/erp-api/*` → the HTTP ERP so the
   browser only ever talks HTTPS to your own domain. No env vars are required (the
   code has fallbacks) — optionally set `VITE_ERP_API_URL` etc. in Vercel → Settings
   → Environment Variables to override.

> If Vercel's rewrite to an HTTP origin is ever blocked, swap it for a serverless
> function (`api/pricelist.js`) that fetches the ERP server-side and returns JSON,
> and point `VITE_ERP_PROXY_PATH` at it.

> The ERP is a dynamic-DNS host — if it's unreachable from Vercel, the app loads
> fine and shows the saved (offline) catalogue.

## Not from the ERP (kept in the catalogue / still to do)

- **Sizes, notes, colour tags** — only in `catalog.js` (ERP has no size field).
- **General & Diaries prices** — the ERP "Corporate" division is stale (old
  effective dates, many with DP = MRP), so those rows stay blank until the ERP is
  refreshed with proper dealer prices.
- **Product photos** — placeholder bands; the photo catalogues are separate PDFs.
