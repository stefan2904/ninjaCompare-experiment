# ninjaCompare-experiment

Compare 🛒 and 🚚🚲 – Austrian grocery & online-shop price comparison.

## Architecture

Price data is collected automatically by a **GitHub Actions workflow** that runs daily at 06:00 UTC. The collected data is committed to the [`data` branch](../../tree/data) of this repository, keeping the `main` branch clean.

```
main branch          data branch
───────────          ───────────
source code   ──→    data/latest-canonical.json
                           (updated daily)
```

### Triggering a manual data collection

Go to **Actions → Collect Data → Run workflow** on GitHub.

## Services (local / Docker)

| Service | Port | Description |
|---|---|---|
| `data-collector` | 3001 | Fetches product prices from Billa, Spar, Ninja, Velofood and exposes them via a JSON API |
| `dashboard` | 3000 | Price-comparison web UI that reads data from the collector |

## Quick Start (Docker Compose)

```sh
docker compose up --build
```

Then open <http://localhost:3000> in your browser.

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

# Run the dashboard
cd dashboard && npm install && node index.js
```

## Store Implementation Status

| Store | Status |
|---|---|
| Billa | ✅ Implemented (via `shop.billa.at` API) |
| Spar | ✅ Implemented (via Spar Fact-Finder search API) |
| Ninja | 🚧 Placeholder – API to be confirmed |
| Velofood | ✅ Implemented (HTML scraping of WooCommerce Supermarkt category – see [docs/velofood-api.md](docs/velofood-api.md)) |

## Inspiration

Traditional supermarket scrapers are based on
[heissepreise](https://github.com/badlogic/heissepreise).
