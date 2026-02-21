# ninjaCompare-experiment

Compare 🛒 and 🚚🚲 – Austrian grocery & online-shop price comparison.

## Services

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
cd data-collector && npm install && node index.js
cd dashboard       && npm install && node index.js
```

## Store Implementation Status

| Store | Status |
|---|---|
| Billa | ✅ Implemented (via `shop.billa.at` API) |
| Spar | ✅ Implemented (via Spar Fact-Finder search API) |
| Ninja | 🚧 Placeholder – API to be confirmed |
| Velofood | 🚧 Placeholder – API to be confirmed |

## Inspiration

Traditional supermarket scrapers are based on
[heissepreise](https://github.com/badlogic/heissepreise).
