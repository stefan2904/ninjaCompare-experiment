/**
 * Spar store scraper.
 * Based on heissepreise (https://github.com/badlogic/heissepreise).
 */

const axios = require("axios");
const { convertUnit } = require("./utils");

const STORE = "spar";
const URL_BASE = "https://www.interspar.at/shop/lebensmittel";

// Store-specific unit aliases
const units = {
    "100ml": { unit: "ml", factor: 100 },
    "500ml": { unit: "ml", factor: 500 },
    "100g": { unit: "g", factor: 100 },
};

// Slight jitter on the page size intentionally mimics organic traffic patterns
// and reduces the risk of the request being flagged by Spar's bot-detection.
const HITS = Math.floor(30000 + Math.random() * 2000);
const SPAR_SEARCH = `https://search-spar.spar-ics.com/fact-finder/rest/v4/search/products_lmos_at?query=*&q=*&page=1&hitsPerPage=${HITS}`;

/**
 * Parse a quantity/unit string of the form "500 ml", "1 kg", "3 stk." etc.
 * Returns [quantity, unit] or [1, "stk"] as fallback.
 */
function parseQuantityUnit(description) {
    if (!description) return [1, "stk"];
    const match = description.trim().match(/^([\d.,]+)\s*([a-züöäA-ZÜÖÄ.]+)$/);
    if (match) {
        const qty = parseFloat(match[1].replace(",", "."));
        return [isNaN(qty) ? 1 : qty, match[2].toLowerCase()];
    }
    if (description.toLowerCase().endsWith("per kg")) return [1, "kg"];
    return [1, "stk"];
}

/**
 * Convert a raw Spar API item to the canonical format.
 * @param {object} item  - raw hit from Spar Fact-Finder search API
 * @param {string} today - date string "YYYY-MM-DD"
 * @returns {object|null}
 */
function getCanonical(item, today) {
    const mv = item.masterValues;
    if (!mv) return null;

    const price = mv["quantity-selector"]
        ? parseFloat((mv["price-per-unit"] || "0").split("/")[0].replace("€", ""))
        : mv.price;

    if (!price) return null;

    const descRaw =
        mv["short-description-3"] ||
        mv["short-description-2"] ||
        mv["short-description"] ||
        mv.name ||
        "";

    const isWeighted = mv["item-type"] === "WeightProduct";
    let [quantity, unit] = parseQuantityUnit(descRaw.replace(/ EINWEG| MEHRWEG/gi, "").replace("per kg", "1 kg"));

    // Derive fallback from price-per-unit field when available
    let fallback;
    if (mv["price-per-unit"]) {
        const [unitPriceStr, unitStr] = mv["price-per-unit"].split("/");
        const unitPrice = parseFloat(unitPriceStr.replace("€", ""));
        if (unitPrice > 0) {
            fallback = {
                quantity: parseFloat((price / unitPrice).toFixed(3)),
                unit: (unitStr || "kg").toLowerCase().trim(),
            };
        }
    }

    if (isWeighted && fallback) {
        quantity = fallback.quantity;
        unit = fallback.unit;
    }

    const productId = mv["product-number"] || mv.id;
    if (!productId) return null;

    return convertUnit(
        {
            id: productId,
            store: STORE,
            name: `${mv.title || ""} ${mv["short-description"] || mv.name || ""}`.trim(),
            description: mv["marketing-text"] ?? "",
            price,
            priceHistory: [{ date: today, price }],
            isWeighted,
            unit,
            quantity,
            bio: mv.biolevel === "Bio",
            url: `${URL_BASE}/p/${productId}`,
        },
        units,
        STORE,
        fallback
    );
}

/**
 * Fetch all raw product items from the Spar search API.
 * @returns {Promise<object[]>}
 */
async function fetchData() {
    const { data } = await axios.get(SPAR_SEARCH);
    const hits = data.hits;
    return (hits && hits.hits) ? hits.hits : (hits || []);
}

module.exports = { fetchData, getCanonical, STORE };
