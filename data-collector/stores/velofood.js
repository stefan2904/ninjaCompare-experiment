/**
 * Velofood online shop scraper.
 *
 * velofood.at is an Austrian online supermarket that delivers groceries by
 * bicycle.  The shop runs on WordPress + WooCommerce.
 *
 * The WooCommerce REST API (/wp-json/wc/v3/products) requires authentication,
 * so this module scrapes the public product-listing HTML pages of the
 * "Supermarkt" category instead.
 *
 * See docs/velofood-api.md for full API exploration notes.
 */

const axios = require("axios");
const HTMLParser = require("node-html-parser");
const { convertUnit } = require("./utils");

const STORE = "velofood";
const URL_BASE = "https://www.velofood.at";

// WooCommerce category page for the Supermarkt section.
const SUPERMARKT_URL = `${URL_BASE}/produktkategorie/supermarkt/`;

// Store-specific unit aliases (none needed beyond the global set).
const units = {};

/**
 * Parse quantity and unit from a product name.
 * Handles patterns like "500g", "1 kg", "500 ml", "1 l", etc.
 *
 * @param {string} name - product name
 * @returns {[number, string]} [quantity, unit]
 */
function parseQuantityUnit(name) {
    if (!name) return [1, "stk"];
    const match = name.match(/(\d+(?:[.,]\d+)?)\s*(g|kg|ml|cl|dl|l)\b/i);
    if (match) {
        const qty = parseFloat(match[1].replace(",", "."));
        return [isNaN(qty) ? 1 : qty, match[2].toLowerCase()];
    }
    return [1, "stk"];
}

/**
 * Convert a raw Velofood item (scraped from the product listing HTML) to the
 * canonical format.
 *
 * @param {object} item  - raw item with { id, name, price, url }
 * @param {string} today - date string "YYYY-MM-DD"
 * @returns {object|null}
 */
function getCanonical(item, today) {
    if (!item || !item.price) return null;

    const [quantity, unit] = parseQuantityUnit(item.name);

    return convertUnit(
        {
            id: String(item.id),
            store: STORE,
            name: item.name || "",
            description: "",
            price: item.price,
            priceHistory: [{ date: today, price: item.price }],
            unit,
            quantity,
            bio: item.name ? item.name.toLowerCase().includes("bio") : false,
            url: item.url || URL_BASE,
        },
        units,
        STORE,
        { unit: "stk", quantity: 1 }
    );
}

/**
 * Fetch and parse a single product-listing page.
 *
 * @param {string} url
 * @returns {Promise<{ items: object[], hasNext: boolean }>}
 */
async function fetchPage(url) {
    const { data } = await axios.get(url, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; ninjaCompare/1.0)" },
        timeout: 15000,
    });

    const root = HTMLParser.parse(data);
    const items = [];

    for (const product of root.querySelectorAll("li.product")) {
        // Numeric product ID from the add-to-cart button attribute.
        const cartBtn = product.querySelector("a.add_to_cart_button");
        let id = cartBtn ? cartBtn.getAttribute("data-product_id") : null;

        // Fallback: extract slug from the product URL.
        const linkEl = product.querySelector("a.woocommerce-LoopProduct-link");
        const productUrl = linkEl ? linkEl.getAttribute("href") : URL_BASE;
        if (!id) {
            id = productUrl.replace(/\/$/, "").split("/").pop();
        }

        const titleEl = product.querySelector(".woocommerce-loop-product__title");
        const name = titleEl ? titleEl.text.trim() : "";

        // Price text is in European format, e.g. "€1,29" or "1.234,56 €".
        // Strip € and whitespace, remove thousands-separator periods, then
        // convert the decimal comma to a period.
        const priceEl = product.querySelector(".price .woocommerce-Price-amount");
        if (!priceEl) continue;
        const priceText = priceEl.text
            .replace(/[€\s\u00a0]/g, "")
            .replace(/\./g, "")
            .replace(",", ".");
        const price = parseFloat(priceText);
        if (isNaN(price) || price <= 0) continue;

        items.push({ id, name, price, url: productUrl });
    }

    const hasNext = !!root.querySelector(".woocommerce-pagination a.next");
    return { items, hasNext };
}

/**
 * Fetch all raw product items from the Velofood Supermarkt category.
 * Paginates through all WooCommerce listing pages.
 *
 * @returns {Promise<object[]>}
 */
async function fetchData() {
    const allItems = [];
    let page = 1;

    while (true) {
        const url =
            page === 1
                ? SUPERMARKT_URL
                : `${SUPERMARKT_URL}page/${page}/`;

        try {
            const { items, hasNext } = await fetchPage(url);

            if (items.length === 0) break;
            allItems.push(...items);

            if (!hasNext) break;
            page++;
        } catch (err) {
            if (err.response && err.response.status === 404) break;
            console.warn(`[${STORE}] Error fetching page ${page}: ${err.message}`);
            break;
        }
    }

    return allItems;
}

module.exports = { fetchData, getCanonical, STORE };
