# velofood.at – API Exploration Notes

## Overview

**velofood** (https://www.velofood.at) is an Austrian online supermarket based in Graz that
delivers groceries by bicycle.  The online shop is built on **WordPress + WooCommerce**.

The most relevant section for price comparison is the **Supermarkt** category, which contains
everyday grocery products.

---

## Website / Platform

| Property | Value |
|---|---|
| Platform | WordPress + WooCommerce |
| Base URL | `https://www.velofood.at` |
| Supermarkt category | `https://www.velofood.at/produktkategorie/supermarkt/` |
| Pagination | WooCommerce default: `/page/2/`, `/page/3/`, … |

---

## WooCommerce REST API

WooCommerce exposes a standard REST API at `/wp-json/wc/v3/`.

### Key Endpoints

| Endpoint | Description |
|---|---|
| `GET /wp-json/wc/v3/products` | List all products |
| `GET /wp-json/wc/v3/products?category=<id>` | List products in a category |
| `GET /wp-json/wc/v3/products/categories` | List all product categories |
| `GET /wp-json/wc/v3/products/<id>` | Single product detail |

### Authentication

The WooCommerce REST API requires **HTTP Basic Auth** using a Consumer Key and Consumer Secret
generated in _WooCommerce → Settings → Advanced → REST API_.  Public (unauthenticated) access
returns `401 Unauthorized`.

Since no public API credentials are available for velofood.at, the implementation uses
**HTML scraping** of the product listing pages instead.

---

## HTML Scraping – Product Listing Pages

### Product Listing URL Pattern

```
Page 1: https://www.velofood.at/produktkategorie/supermarkt/
Page 2: https://www.velofood.at/produktkategorie/supermarkt/page/2/
Page N: https://www.velofood.at/produktkategorie/supermarkt/page/N/
```

### HTML Structure (WooCommerce standard)

```html
<ul class="products">
  <li class="product post-12345 type-product ...">

    <!-- Product link wraps image + title -->
    <a href="https://www.velofood.at/produkt/bio-vollmilch-1l/"
       class="woocommerce-LoopProduct-link woocommerce-loop-product__link">
      <img class="wp-post-image" src="..." alt="Bio Vollmilch 1l" />
      <h2 class="woocommerce-loop-product__title">Bio Vollmilch 1l</h2>
    </a>

    <!-- Price block -->
    <span class="price">
      <span class="woocommerce-Price-amount amount">
        <bdi>
          <span class="woocommerce-Price-currencySymbol">€</span>1,29
        </bdi>
      </span>
    </span>

    <!-- Add-to-cart button carries the numeric product ID -->
    <a href="/?add-to-cart=12345"
       data-product_id="12345"
       class="button product_type_simple add_to_cart_button ajax_add_to_cart">
      In den Warenkorb
    </a>

  </li>
  …
</ul>

<!-- Pagination -->
<nav class="woocommerce-pagination">
  <ul>
    <li><span class="page-numbers current">1</span></li>
    <li><a class="page-numbers" href=".../page/2/">2</a></li>
    <li><a class="next page-numbers" href=".../page/2/">→</a></li>
  </ul>
</nav>
```

### Key CSS Selectors

| Data | CSS Selector |
|---|---|
| Product container | `li.product` |
| Product ID | `a.add_to_cart_button[data-product_id]` |
| Product name | `.woocommerce-loop-product__title` |
| Price | `.price .woocommerce-Price-amount bdi` |
| Product URL | `a.woocommerce-LoopProduct-link[href]` |
| Next-page link | `.woocommerce-pagination a.next` |

### Price Format

Austrian WooCommerce stores use the European number format:

- Decimal separator: `,`  (comma)
- Example raw text: `€1,29`
- Parsed as: `1.29`

### Unit and Quantity

Product listing pages **do not** expose structured unit/quantity fields.  The
unit and quantity must be parsed from the product name when possible:

| Pattern in name | Parsed result |
|---|---|
| `500g`, `500 g` | quantity=500, unit=g |
| `1kg`, `1 kg` | quantity=1000, unit=g (after conversion) |
| `1l`, `1 L` | quantity=1000, unit=ml (after conversion) |
| `500ml`, `500 ml` | quantity=500, unit=ml |
| *(no match)* | quantity=1, unit=stk |

### Bio Detection

A product is marked as organic (`bio: true`) if the product name contains the
substring `bio` (case-insensitive).

---

## Supermarkt Category ID

The numeric WooCommerce category ID for _Supermarkt_ can be resolved via:

```
GET https://www.velofood.at/wp-json/wc/v3/products/categories?slug=supermarkt
```

This returns an array; the first element's `id` field is the category ID (requires auth).

---

## Implementation Notes

- The implementation scrapes the Supermarkt category page at the URL above.
- Pagination stops when a page returns HTTP 404 or contains no `li.product` elements.
- Product IDs are taken from `data-product_id` on the add-to-cart button; if absent,
  the product slug (last path segment of the product URL) is used as a fallback.
- Prices are parsed by stripping the `€` symbol and replacing `,` with `.`.
- Unit/quantity are extracted with a regex applied to the product name.
