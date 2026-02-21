/**
 * Velofood online shop scraper.
 *
 * TODO: Implement actual product fetching once the Velofood shop API / URL
 *       structure is confirmed.  The placeholder below demonstrates the expected
 *       canonical output format so the rest of the pipeline works end-to-end.
 *
 * Expected shop URL: https://www.velofood.at  (verify before going live)
 */

const STORE = "velofood";
const URL_BASE = "https://www.velofood.at";

/**
 * Convert a raw Velofood item to the canonical format.
 * @param {object} item  - raw item from Velofood API / scraper
 * @param {string} today - date string "YYYY-MM-DD"
 * @returns {object|null}
 */
function getCanonical(item, today) {
    if (!item || !item.price) return null;

    return {
        id: String(item.id),
        store: STORE,
        name: item.name || "",
        description: item.description || "",
        price: parseFloat(item.price),
        priceHistory: [{ date: today, price: parseFloat(item.price) }],
        unit: item.unit || "stk",
        quantity: parseFloat(item.quantity) || 1,
        bio: item.bio ?? false,
        url: item.url ? `${URL_BASE}${item.url}` : URL_BASE,
    };
}

/**
 * Fetch all raw product items from the Velofood shop.
 *
 * @returns {Promise<object[]>}
 */
async function fetchData() {
    // TODO: Replace with real HTTP requests to the Velofood shop once the
    //       API endpoint / scraping approach has been agreed on.
    console.warn(`[${STORE}] fetchData not yet implemented – returning empty list.`);
    return [];
}

module.exports = { fetchData, getCanonical, STORE };
