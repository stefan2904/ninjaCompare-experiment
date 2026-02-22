/**
 * Velofood / Ninjas Market scraper.
 *
 * velofood.at is an Austrian online supermarket based in Graz that delivers
 * groceries by bicycle.  The shop runs on WordPress + WooCommerce with a
 * custom Alpine.js frontend at https://velofood.at/market.
 *
 * Products are fetched via a public JSON API at:
 *   GET https://velofood.at/wp-json/velofood/v1/market_get_products
 *       ?cat_id=<categoryId>&level=0&sort=default
 *
 * See dashboard/velofood-api.md for full API exploration notes.
 */

const axios = require("axios");
const { convertUnit } = require("./utils");

const STORE = "velofood";
const URL_BASE = "https://velofood.at";

// Custom REST API endpoint for market products.
const API_URL = `${URL_BASE}/wp-json/velofood/v1/market_get_products`;

// Top-level category IDs from the /market page.
// Using level=0 with each fetches all subcategories in one request.
const TOP_CATEGORY_IDS = [
    3882, // Aktionen
    3884, // Obst & Gemüse
    3890, // Bäckerei & Konditorei
    3895, // Kühlschrank
    3902, // Vorratsschrank
    3914, // Alkoholfreie Getränke
    3922, // Alkohol
    3932, // Tiefkühlung
    3941, // Süße Snacks
    3950, // Salzige Snacks
    3956, // Drogerie & Hygiene
    3962, // Baby
    3966, // Küche & Haushalt
    3970, // Hund & Katze
    3974, // Papes, Snus & mehr
];

// Store-specific unit aliases (none needed beyond the global set).
const units = {};

/**
 * Parse quantity and unit from the `measure` field.
 * The API returns values like "1stk", "300g", "1l", "250ml", "1kg".
 *
 * @param {string} measure - combined quantity+unit string
 * @returns {[number, string]} [quantity, unit]
 */
function parseMeasure(measure) {
    if (!measure) return [1, "stk"];
    const match = measure.match(/^(\d+(?:[.,]\d+)?)\s*(g|kg|ml|cl|dl|l|stk)$/i);
    if (match) {
        const qty = parseFloat(match[1].replace(",", "."));
        return [isNaN(qty) ? 1 : qty, match[2].toLowerCase()];
    }
    return [1, "stk"];
}

/**
 * Convert a raw Velofood API item to the canonical format.
 *
 * @param {object} item  - raw item from the API
 * @param {string} today - date string "YYYY-MM-DD"
 * @returns {object|null}
 */
function getCanonical(item, today) {
    // Use the float price_sort field; fall back to parsing the price string.
    let price = item.price_sort;
    if (typeof price !== "number" || isNaN(price) || price <= 0) {
        if (!item.price) return null;
        price = parseFloat(
            String(item.price).replace(/[€\s\u00a0]/g, "").replace(/\./g, "").replace(",", ".")
        );
        if (isNaN(price) || price <= 0) return null;
    }

    const [quantity, unit] = parseMeasure(item.measure);
    const bio =
        (Array.isArray(item.biolabel) && item.biolabel.length > 0) ||
        (item.name && item.name.toLowerCase().includes("bio"));

    const description =
        item.productInfo && item.productInfo.description
            ? item.productInfo.description.replace(/<[^>]+>/g, " ").trim()
            : "";

    return convertUnit(
        {
            id: String(item.id),
            store: STORE,
            name: item.name || "",
            description,
            price,
            priceHistory: [{ date: today, price }],
            unit,
            quantity,
            bio,
            url: `${URL_BASE}/market`,
        },
        units,
        STORE,
        { unit: "stk", quantity: 1 }
    );
}

/**
 * Fetch all raw product items from the Velofood Ninjas Market API.
 * Iterates over all top-level categories with level=0.
 *
 * @returns {Promise<object[]>}
 */
async function fetchData() {
    const allItems = [];
    const seen = new Set();

    for (const catId of TOP_CATEGORY_IDS) {
        try {
            const { data } = await axios.get(API_URL, {
                params: {
                    cat_id: catId,
                    level: 0,
                    sort: "default",
                },
                headers: {
                    "User-Agent": "Mozilla/5.0 (compatible; ninjaCompare/1.0)",
                },
                timeout: 30000,
            });

            if (!data || !Array.isArray(data.products)) continue;

            for (const subCat of data.products) {
                if (!Array.isArray(subCat.items)) continue;
                for (const item of subCat.items) {
                    if (!item.id || seen.has(item.id)) continue;
                    // Skip out-of-stock items.
                    if (item.in_stock === false) continue;
                    seen.add(item.id);
                    allItems.push(item);
                }
            }
        } catch (err) {
            console.warn(
                `[${STORE}] Error fetching category ${catId}: ${err.message}`
            );
        }
    }

    return allItems;
}

module.exports = { fetchData, getCanonical, STORE };
