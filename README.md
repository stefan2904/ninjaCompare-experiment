# ninjaCompare-experiment

Compare 🛒 and 🚚🚲 – Austrian grocery & online-shop price comparison.

## Live Dashboard

👉 **<https://stefan2904.github.io/ninjaCompare-experiment/>**

The dashboard is a static site served via **GitHub Pages**. It loads price data directly from the [`data` branch](../../tree/data) and runs entirely in the browser – no server required.

## Architecture

```
main branch           data branch           GitHub Pages
───────────           ───────────           ────────────
source code  ──(CI)──▶ data/latest-         dashboard/ static
dashboard/ static      canonical.json       site served
                       (updated daily)      at /
```

Price data is collected automatically by a **GitHub Actions workflow** that runs daily at 06:00 UTC and commits to the `data` branch. The static dashboard is redeployed automatically after each data collection.

### Triggering a manual data collection

Go to **Actions → Collect Data → Run workflow** on GitHub.

## Local development (Docker Compose)

The `data-collector` service can still be run locally for development and testing.

| Service | Port | Description |
|---|---|---|
| `data-collector` | 3001 | Fetches product prices from Billa, Spar, Ninja, Velofood and exposes them via a JSON API |

```sh
docker compose up --build data-collector
```

## Data Collector API

| Endpoint | Description |
|---|---|
| `GET /health` | Liveness probe |
| `GET /data` | Full canonical product list (JSON) |
| `GET /data/:store` | Products for a single store (`billa`, `spar`, `ninja`, `velofood`) |
| `POST /fetch` | Trigger an immediate data refresh |

## Canonical Product Format

```json
{
  "id": "12345",
  "store": "billa",
  "name": "Bio Vollmilch 3,5% 1l",
  "description": "",
  "price": 1.29,
  "priceHistory": [{ "date": "2024-06-01", "price": 1.29 }],
  "unit": "ml",
  "quantity": 1000,
  "bio": true,
  "url": "https://shop.billa.at/..."
}
```

## Development

```sh
# Run the standalone data collector (one-shot, writes data/latest-canonical.json)
cd data-collector && npm install && npm run collect

# Run the HTTP server (with cron scheduling)
cd data-collector && npm install && npm start
```

The static dashboard in `dashboard/` can be opened directly in a browser (or served with any static file server). It fetches data from the `data` branch on GitHub, so a live internet connection is required.

## Store Implementation Status

| Store | Status |
|---|---|
| Billa | ✅ Implemented (via `shop.billa.at` API) |
| Spar | ✅ Implemented (via Spar Fact-Finder search API) |
| Ninja | 🚧 Placeholder – API to be confirmed |
| Velofood | ✅ Implemented (HTML scraping of WooCommerce Supermarkt category – see [dashboard/velofood-api.md](dashboard/velofood-api.md)) |

## Inspiration

Traditional supermarket scrapers are based on
[heissepreise](https://github.com/badlogic/heissepreise).
