# velofood.at – API Exploration Notes

## Overview

**velofood** (https://velofood.at) is an Austrian online supermarket based in Graz that
delivers groceries by bicycle.  The online shop is built on **WordPress + WooCommerce** with
a custom theme ("velofood-theme") and **Alpine.js** for the frontend.

The shop has been rebranded to **Ninjas Market** and the primary product listing has moved
from the old WooCommerce `/produktkategorie/supermarkt/` category pages to a custom
single-page application at `/market`.

---

## Website / Platform

| Property | Value |
|---|---|
| Platform | WordPress + WooCommerce + Alpine.js |
| Base URL | `https://velofood.at` |
| Market page | `https://velofood.at/market` |
| Old Supermarkt category *(deprecated)* | `https://velofood.at/produktkategorie/supermarkt/` |

---

## Custom REST API (Primary – Recommended)

Products are loaded dynamically via a custom REST API.  Two equivalent endpoints exist:

| Endpoint | URL |
|---|---|
| **WP REST** | `GET https://velofood.at/wp-json/velofood/v1/market_get_products` |
| **Custom PHP** | `GET https://velofood.at/custom_api/vfapi.php?action=market_get_products` |

Both return identical JSON.  **No authentication required.**

### Query Parameters

| Parameter | Type | Description |
|---|---|---|
| `cat_id` | integer | WooCommerce category/subcategory ID (see category list below) |
| `level` | `0` or `1` | `0` = fetch all subcategories of a parent category; `1` = fetch a single subcategory |
| `sort` | string | Sort order: `default`, `price_asc`, `price_desc`, `name_asc`, `name_desc` |

### Example Requests

```
# All subcategories of "Obst & Gemüse" (parent cat_id=3884):
GET https://velofood.at/wp-json/velofood/v1/market_get_products?cat_id=3884&level=0&sort=default

# Single subcategory "Frisches Obst" (cat_id=3885):
GET https://velofood.at/wp-json/velofood/v1/market_get_products?cat_id=3885&level=1&sort=default
```

### Response Schema

```json
{
  "products": [
    {
      "subCategory": {
        "subCategoryName": "Frisches Obst",
        "subCategorySlug": "market-ninjas-frisches-obst",
        "subCategoryId": 3885
      },
      "product_count": 27,
      "items": [
        {
          "name": "Ananas Gold",
          "brand": null,
          "id": 1924549,
          "price": "3,69",
          "old_price": "",
          "discount_percente": "",
          "toplabel": [],
          "biolabel": [],
          "measure": "1stk",
          "price_per_measure": "3.29/1stk",
          "austrian_product": false,
          "in_stock": true,
          "productInfo": {
            "description": "...",
            "product_term": [
              { "name": "Frisches Obst", "slug": "market-ninjas-frisches-obst", "term_id": 3885 }
            ],
            "inhaltsstoffe": "",
            "durchschnittliche_nahrwerte": null,
            "brennwert": null,
            "fett": null,
            "davon_gesattigte_fettsauren": null,
            "kohlehydrate": null,
            "davon_zucker": null,
            "ballaststoffe": null,
            "eiweis": null,
            "salz": null
          },
          "image": {
            "small": "https://velofood.at/wp-content/uploads/...-300x300.jpg",
            "large": "https://velofood.at/wp-content/uploads/...-300x300.jpg"
          },
          "poz": 4,
          "popularity": 14,
          "datum": 1762516887,
          "menu_order": 10,
          "price_sort": 3.69,
          "sold": null,
          "allergens": [],
          "in_cart": 0,
          "market_product": true,
          "price_note": "",
          "stock": 1,
          "total_stock": 1,
          "allergens_notes": []
        }
      ]
    }
  ],
  "current_page": 1
}
```

### Product Item Fields

| Field | Type | Description |
|---|---|---|
| `id` | integer | Unique WooCommerce product ID |
| `name` | string | Product name (e.g. "Bio Wiesenmilch Vollmilch 3,5%") |
| `brand` | string\|null | Brand name (often null) |
| `price` | string | Price in European format with comma decimal (e.g. "3,69") |
| `old_price` | string | Previous price if on sale (empty string if not) |
| `discount_percente` | string | Discount percentage (empty string if not) |
| `price_sort` | float | Price as a float for sorting (e.g. 3.69) |
| `measure` | string | Quantity + unit combined (e.g. "1stk", "300g", "1l", "250ml", "6stk") |
| `price_per_measure` | string | Unit price (e.g. "3.29/1stk", "0.7/1stk") |
| `biolabel` | array | `["bio"]` if organic, empty `[]` otherwise |
| `toplabel` | array | Special labels (e.g. sale badges) |
| `austrian_product` | boolean | Whether the product is Austrian |
| `in_stock` | boolean | Stock availability |
| `stock` | integer | Current stock level |
| `market_product` | boolean | Always `true` for market products |
| `productInfo.description` | string | HTML product description |
| `productInfo.product_term` | array | Category terms with name/slug/term_id |
| `image.small` | string | Small product image URL |
| `image.large` | string | Large product image URL |
| `allergens` | array | Allergen information |

### Price Format

- `price` field: European format string with comma decimal (e.g. `"3,69"`)
- `price_sort` field: Float for sorting (e.g. `3.69`) — **use this for canonical price**
- `old_price`: Non-empty string when product is on sale

### Measure Field

The `measure` field contains quantity and unit concatenated without space:

| measure | Parsed quantity | Parsed unit |
|---|---|---|
| `"1stk"` | 1 | stk |
| `"300g"` | 300 | g |
| `"1l"` | 1 | l |
| `"250ml"` | 250 | ml |
| `"6stk"` | 6 | stk |
| `"1kg"` | 1 | kg |

Regex: `/^(\d+(?:[.,]\d+)?)\s*(g|kg|ml|cl|dl|l|stk)$/i`

### Bio Detection

A product is organic if `biolabel` array is non-empty (typically `["bio"]`).

---

## Category Structure

Categories are embedded in the `/market` page HTML as inline JSON.  There are **15 top-level
categories** with **~80 subcategories** total.

### Top-Level Categories

| CategoryId | CategoryName |
|---|---|
| 3882 | Aktionen |
| 3884 | Obst & Gemüse |
| 3890 | Bäckerei & Konditorei |
| 3895 | Kühlschrank |
| 3902 | Vorratsschrank |
| 3914 | Alkoholfreie Getränke |
| 3922 | Alkohol |
| 3932 | Tiefkühlung |
| 3941 | Süße Snacks |
| 3950 | Salzige Snacks |
| 3956 | Drogerie & Hygiene |
| 3962 | Baby |
| 3966 | Küche & Haushalt |
| 3970 | Hund & Katze |
| 3974 | Papes, Snus & mehr |

### Fetching Strategy

Use `level=0` with each top-level category ID to get all products across all subcategories
in a single request per category.  This returns the full product list grouped by subcategory.

---

## Old WooCommerce HTML Scraping *(Deprecated)*

The old scraper used paginated HTML pages at:

```
https://velofood.at/produktkategorie/supermarkt/page/N/
```

This approach is **deprecated** because:
1. The shop has moved to `/market` with AJAX-loaded products
2. The old category pages may no longer contain all products
3. The new JSON API provides structured data (price, measure, bio) without HTML parsing

---

## Implementation Notes

- Use the `custom_api/vfapi.php` endpoint (or `wp-json/velofood/v1`) with
  `action=market_get_products`.
- Iterate over all 15 top-level category IDs with `level=0` to fetch every product.
- Use `price_sort` (float) for the canonical price instead of parsing the `price` string.
- Parse `measure` for quantity and unit using a regex.
- Check `biolabel` array for organic detection (non-empty = bio).
- Deduplicate by product `id` since products may appear in multiple categories.
- All API requests are unauthenticated GET requests.
