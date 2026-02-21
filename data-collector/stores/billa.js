/**
 * Billa store scraper.
 * Based on heissepreise (https://github.com/badlogic/heissepreise).
 */

const axios = require("axios");
const { convertUnit } = require("./utils");

const STORE = "billa";
const URL_BASE = "https://shop.billa.at";

// Store-specific unit aliases
const units = {
    beutel: { unit: "stk", factor: 1 },
    bund: { unit: "stk", factor: 1 },
    packung: { unit: "stk", factor: 1 },
    pa: { unit: "stk", factor: 1 },
    fl: { unit: "stk", factor: 1 },
    portion: { unit: "stk", factor: 1 },
    rollen: { unit: "stk", factor: 1 },
    teebeutel: { unit: "stk", factor: 1 },
    waschgang: { unit: "wg", factor: 1 },
};

// Top-level category slugs from the Billa online shop
const baseCategorySlugs = [
    "obst-und-gemuese-13751",
    "brot-und-gebaeck-15520",
    "getraenke-13784",
    "kuehlwaren-15416",
    "tiefkuehl-15415",
    "vorratsschrank-15012",
    "suesses-und-salziges-15159",
    "fleisch-15571",
    "wurst-schinken-und-speck-15572",
    "fisch-und-meeresfruechte-15573",
];

/**
 * Convert a raw Billa API item to the canonical format.
 * @param {object} item  - raw item from Billa API
 * @param {string} today - date string "YYYY-MM-DD"
 * @returns {object|null}
 */
function getCanonical(item, today) {
    if (!item.price || !item.price.regular || !item.price.regular.value) {
        return null;
    }

    const price = item.price.regular.value / 100;

    let unit = item.volumeLabelShort;
    if (!unit || unit === "") {
        unit = item.price.baseUnitShort || "stk";
    }

    return convertUnit(
        {
            id: item.sku,
            store: STORE,
            name: item.name,
            description: item.descriptionShort ?? "",
            price,
            priceHistory: [{ date: today, price }],
            isWeighted: item.weightArticle ?? false,
            unit,
            quantity: parseFloat(item.amount) || 1,
            bio: item.badges && item.badges.includes("pp-bio"),
            url: `${URL_BASE}/produkt/${item.slug}`,
        },
        units,
        STORE
    );
}

/**
 * Fetch all category slugs from the Billa API.
 * @returns {Promise<string[]>}
 */
async function fetchCategories() {
    const categories = [];
    for (const baseSlug of baseCategorySlugs) {
        try {
            const { data } = await axios.get(
                `${URL_BASE}/api/product-discovery/categories/${baseSlug}/child-properties`
            );
            for (const value of data) {
                categories.push(value.slug);
            }
        } catch (err) {
            console.warn(`Could not fetch Billa category ${baseSlug}: ${err.message}`);
        }
    }
    return categories;
}

/**
 * Fetch all raw product items from the Billa API.
 * @returns {Promise<object[]>}
 */
async function fetchData() {
    const categories = await fetchCategories();
    const rawItems = [];
    const seen = new Set();

    for (const categorySlug of categories) {
        let page = 0;
        while (true) {
            try {
                const { data } = await axios.get(
                    `${URL_BASE}/api/product-discovery/categories/${categorySlug}/products?pageSize=500&page=${page}`
                );
                if (!data.count || data.count === 0) break;
                for (const item of data.results) {
                    if (!seen.has(item.sku)) {
                        seen.add(item.sku);
                        rawItems.push(item);
                    }
                }
                page++;
            } catch (err) {
                console.warn(`Could not fetch Billa category page ${categorySlug}/${page}: ${err.message}`);
                break;
            }
        }
    }

    return rawItems;
}

module.exports = { fetchData, getCanonical, STORE };
