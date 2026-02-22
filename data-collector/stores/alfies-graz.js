/**
 * Alfies Graz collector.
 *
 * Source:
 * - Public Algolia-backed product index used by alfies.shop
 * - No credentials/login required beyond public search keys embedded in frontend bundle
 *
 * Notes:
 * - We fetch leaf category slugs first and then query products per category.
 * - This avoids Algolia pagination limits on the full index query.
 * - Out-of-stock products are intentionally included.
 */

const axios = require("axios");
const { convertUnit } = require("./utils");

const STORE = "alfies-graz";
const SHOP_URL = "https://alfies.shop/de/at";

const ALGOLIA_APP_ID = "RNJAZYGUWW";
const ALGOLIA_API_KEY = "06c83e9e39cd1595f93c545ea64f6348";

const PRODUCT_INDEX = "products_graz_de_at";
const CATEGORY_INDEX = "product_categories_de_at";

const CATEGORY_BATCH_SIZE = 20;
const HITS_PER_CATEGORY = 1000;

const client = axios.create({
    baseURL: `https://${ALGOLIA_APP_ID}-dsn.algolia.net/1/indexes`,
    timeout: 30000,
    headers: {
        "X-Algolia-Application-Id": ALGOLIA_APP_ID,
        "X-Algolia-API-Key": ALGOLIA_API_KEY,
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0 (compatible; ninjaCompare/1.0)",
    },
});

const units = {
    stück: { unit: "stk", factor: 1 },
    stueck: { unit: "stk", factor: 1 },
    rolle: { unit: "stk", factor: 1 },
    packung: { unit: "stk", factor: 1 },
    paket: { unit: "stk", factor: 1 },
    dose: { unit: "stk", factor: 1 },
    flasche: { unit: "stk", factor: 1 },
    kiste: { unit: "stk", factor: 1 },
    waschgang: { unit: "wg", factor: 1 },
};

function chunk(list, size) {
    const out = [];
    for (let i = 0; i < list.length; i += size) {
        out.push(list.slice(i, i + size));
    }
    return out;
}

function buildParams(obj) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(obj)) {
        params.set(key, String(value));
    }
    return params.toString();
}

function isRateLimitOrBotError(err) {
    const status = err && err.response ? err.response.status : null;
    const payload = err && err.response ? JSON.stringify(err.response.data || {}) : "";
    if (status === 429) return true;
    if (status === 403 && /rate\s*limit|too\s*many|bot|blocked/i.test(payload)) {
        return true;
    }
    return false;
}

function logFetchError(scope, err) {
    if (isRateLimitOrBotError(err)) {
        console.warn(`[${STORE}] Possible rate-limit/anti-bot during ${scope}: ${err.message}`);
        return;
    }
    if (err && err.response) {
        const status = err.response.status;
        const body = typeof err.response.data === "string"
            ? err.response.data
            : JSON.stringify(err.response.data || {});
        console.warn(`[${STORE}] ${scope} failed (${status}): ${body}`);
        return;
    }
    console.warn(`[${STORE}] ${scope} failed: ${err.message}`);
}

async function queryIndex(indexName, params) {
    const { data } = await client.post(`/${indexName}/query`, {
        params: buildParams(params),
    });
    return data;
}

async function queryMulti(requests) {
    const { data } = await client.post("/*/queries", { requests });
    return data;
}

async function fetchLeafCategorySlugs() {
    const slugs = new Set();
    let page = 0;
    let totalPages = 1;

    while (page < totalPages) {
        let data;
        try {
            data = await queryIndex(CATEGORY_INDEX, {
                query: "",
                hitsPerPage: 1000,
                page,
            });
        } catch (err) {
            logFetchError("category fetch", err);
            break;
        }

        const hits = Array.isArray(data.hits) ? data.hits : [];
        for (const cat of hits) {
            if (cat && cat.depth === 3 && cat.slug) {
                slugs.add(cat.slug);
            }
        }

        totalPages = Number.isInteger(data.nbPages) ? data.nbPages : 1;
        page += 1;
    }

    return [...slugs];
}

async function fetchData() {
    const categorySlugs = await fetchLeafCategorySlugs();
    if (categorySlugs.length === 0) {
        console.warn(`[${STORE}] No category slugs found.`);
        return [];
    }

    const productsById = new Map();
    const slugBatches = chunk(categorySlugs, CATEGORY_BATCH_SIZE);

    for (const slugBatch of slugBatches) {
        const requests = slugBatch.map((slug) => ({
            indexName: PRODUCT_INDEX,
            params: buildParams({
                query: "",
                hitsPerPage: HITS_PER_CATEGORY,
                filters: `categories.slug:${slug}`,
            }),
        }));

        let batchData;
        try {
            batchData = await queryMulti(requests);
        } catch (err) {
            logFetchError("product batch fetch", err);
            continue;
        }

        const results = Array.isArray(batchData.results) ? batchData.results : [];
        for (let i = 0; i < results.length; i++) {
            const result = results[i] || {};
            const slug = slugBatch[i];

            if (typeof result.nbHits === "number" && result.nbHits > HITS_PER_CATEGORY) {
                console.warn(
                    `[${STORE}] Category '${slug}' has ${result.nbHits} hits ` +
                    `(>${HITS_PER_CATEGORY}); results may be truncated.`
                );
            }

            const hits = Array.isArray(result.hits) ? result.hits : [];
            for (const item of hits) {
                if (!item) continue;
                const id = item.id != null ? String(item.id) : String(item.objectID || "");
                if (!id) continue;
                productsById.set(id, item);
            }
        }
    }

    return [...productsById.values()];
}

function isBio(item) {
    const nutritionType = item && item.attributes ? item.attributes.nutritionType : null;
    const searchTags = item && item.attributes ? item.attributes.searchTags : null;

    const nutritionBio =
        Array.isArray(nutritionType) &&
        nutritionType.some((v) => typeof v === "string" && v.toLowerCase().includes("bio"));

    const tagsBio =
        Array.isArray(searchTags) &&
        searchTags.some((v) => typeof v === "string" && v.toLowerCase().includes("bio"));

    const titleBio =
        typeof item.title === "string" && /(^|\b)bio(\b|$)/i.test(item.title);

    return Boolean(nutritionBio || tagsBio || titleBio);
}

function getCanonical(item, today) {
    if (!item || item.id == null) return null;

    const wh = item.whs && item.whs.graz ? item.whs.graz : null;
    if (!wh) return null;

    const rawPrice =
        wh.displayPrice && typeof wh.displayPrice.priceInclTax === "number"
            ? wh.displayPrice.priceInclTax
            : wh.price;

    const price = Number(rawPrice);
    if (!Number.isFinite(price) || price <= 0) return null;

    const rawUnit =
        (typeof item.unit === "string" && item.unit.trim() !== ""
            ? item.unit
            : (item.unitName || "stk"))
            .toString()
            .trim()
            .toLowerCase();

    const quantity = Number.isFinite(Number(item.unitRecord)) && Number(item.unitRecord) > 0
        ? Number(item.unitRecord)
        : 1;

    return convertUnit(
        {
            id: String(item.id),
            store: STORE,
            name: item.title || "",
            description: "",
            price,
            priceHistory: [{ date: today, price }],
            unit: rawUnit,
            quantity,
            bio: isBio(item),
            url: item.slug ? `${SHOP_URL}/produkt/${item.slug}` : `${SHOP_URL}/shop`,
        },
        units,
        STORE,
        { unit: "stk", quantity: 1 }
    );
}

module.exports = { fetchData, getCanonical, STORE };
