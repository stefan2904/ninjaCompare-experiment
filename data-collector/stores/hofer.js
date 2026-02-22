/**
 * Hofer store scraper.
 *
 * Based on heissepreise (https://github.com/badlogic/heissepreise), adapted to
 * this repository's collector conventions.
 */

const axios = require("axios");
const { convertUnit } = require("./utils");
const CATEGORY_PROG_IDS = require("./hofer-prog-ids.json");

const STORE = "hofer";
const FAIL_ON_ERROR = true;
const URL_BASE = "https://www.roksh.at/hofer/produkte";
const API_BASE_URL = "https://shopservice.roksh.at";

const client = axios.create({
    baseURL: API_BASE_URL,
    timeout: 30000,
    headers: {
        "User-Agent": "Mozilla/5.0 (compatible; ninjaCompare/1.0)",
        Accept: "application/json",
    },
});

// Store-specific unit aliases.
const units = {
    "": { unit: "stk", factor: 1 },
    st: { unit: "stk", factor: 1 },
    stueck: { unit: "stk", factor: 1 },
    stück: { unit: "stk", factor: 1 },
    pack: { unit: "stk", factor: 1 },
    packung: { unit: "stk", factor: 1 },
    beutel: { unit: "stk", factor: 1 },
    rolle: { unit: "stk", factor: 1 },
    rollen: { unit: "stk", factor: 1 },
    teebeutel: { unit: "stk", factor: 1 },
    wg: { unit: "wg", factor: 1 },
    wl: { unit: "wg", factor: 1 },
    waschgang: { unit: "wg", factor: 1 },
    waschgänge: { unit: "wg", factor: 1 },
    m: { unit: "m", factor: 1 },
};

const TOKEN_DATA = {
    OwnWebshopProviderCode: "",
    SetUserSelectedShopsOnFirstSiteLoad: true,
    RedirectToDashboardNeeded: false,
    ShopsSelectedForRoot: "hofer",
    BrandProviderSelectedForRoot: null,
    UserSelectedShops: [],
};

function parseNumber(value) {
    if (value == null) return NaN;
    if (typeof value === "number") return value;
    return Number.parseFloat(String(value).replace(",", "."));
}

function parseUnitAndQuantityFromName(name) {
    if (!name) return null;
    const normalized = String(name).replace(/\u200b/g, "").trim();

    let match;
    let last = null;

    // Handles forms like "6x 0,5l" or "10 x 16,5 g".
    const multiPackRegex = /(\d+)\s*[x×]\s*(\d+(?:[.,]\d+)?)\s*(kg|g|ml|l|cl|dl|stk\.?|st\.?|stück|wg|wl|m)\b/gi;
    while ((match = multiPackRegex.exec(normalized)) !== null) {
        const packs = parseNumber(match[1]);
        const each = parseNumber(match[2]);
        if (Number.isFinite(packs) && packs > 0 && Number.isFinite(each) && each > 0) {
            last = { quantity: packs * each, unit: match[3].toLowerCase().replace(/\.$/, "") };
        }
    }
    if (last) return last;

    // Handles forms like "500g", "1 l", "10Stk.", "42WG".
    const singleRegex = /(\d+(?:[.,]\d+)?)\s*(kg|g|ml|l|cl|dl|stk\.?|st\.?|stück|wg|wl|m)\s*\.?$/i;
    match = normalized.match(singleRegex);
    if (match) {
        const quantity = parseNumber(match[1]);
        if (Number.isFinite(quantity) && quantity > 0) {
            return { quantity, unit: match[2].toLowerCase().replace(/\.$/, "") };
        }
    }

    // Handles forms like "4er Pack".
    const packRegex = /(\d+)\s*er\s*pack\b/i;
    match = normalized.match(packRegex);
    if (match) {
        const quantity = parseNumber(match[1]);
        if (Number.isFinite(quantity) && quantity > 0) {
            return { quantity, unit: "stk" };
        }
    }

    return null;
}

function parsePriceUnitType(rawPriceUnitType) {
    if (!rawPriceUnitType) return null;

    const type = String(rawPriceUnitType).toLowerCase().trim().replace(/\s+/g, " ");

    if (type === "kg" || type === "kg abtr.g." || type === "kg abtr.g") {
        return { quantity: 1, unit: "kg" };
    }
    if (type === "g") return { quantity: 1, unit: "g" };
    if (type === "l") return { quantity: 1, unit: "l" };
    if (type === "ml") return { quantity: 1, unit: "ml" };
    if (type === "stück" || type === "stk" || type === "st") {
        return { quantity: 1, unit: "stk" };
    }
    if (type === "wl") return { quantity: 1, unit: "wg" };
    if (type === "m") return { quantity: 1, unit: "m" };

    let match = type.match(/^(\d+(?:[.,]\d+)?)\s*(g|ml)$/);
    if (match) {
        const quantity = parseNumber(match[1]);
        if (Number.isFinite(quantity) && quantity > 0) {
            return { quantity, unit: match[2] };
        }
    }

    match = type.match(/^(\d+(?:[.,]\d+)?)\s*(stück|stk|st)$/);
    if (match) {
        const quantity = parseNumber(match[1]);
        if (Number.isFinite(quantity) && quantity > 0) {
            return { quantity, unit: "stk" };
        }
    }

    return null;
}

function fallbackFromUnitPrice(item, price) {
    const base = parsePriceUnitType(item.priceUnitType);
    if (!base) return null;

    const unitPrice = parseNumber(item.unitPrice ?? item.minUnitPrice);
    if (!Number.isFinite(unitPrice) || unitPrice <= 0) return null;

    const unitsPerProduct = price / unitPrice;
    if (!Number.isFinite(unitsPerProduct) || unitsPerProduct <= 0) return null;

    return {
        quantity: Number((unitsPerProduct * base.quantity).toFixed(3)),
        unit: base.unit,
    };
}

function isBio(item) {
    return /\bbio\b/i.test(item.productName || "");
}

function getCanonical(item, today) {
    if (!item || item.productID == null) return null;

    const price = Number(item.price);
    if (!Number.isFinite(price) || price <= 0) return null;

    const name = item.productName || "";
    const fromName = parseUnitAndQuantityFromName(name);
    const fallback = fallbackFromUnitPrice(item, price);

    let unit = fromName ? fromName.unit : (fallback ? fallback.unit : "stk");
    let quantity = fromName ? fromName.quantity : (fallback ? fallback.quantity : 1);

    if (item.isBulk && fallback) {
        unit = fallback.unit;
        quantity = fallback.quantity;
    }

    const category = item.categorySEOName ? `${item.categorySEOName}/` : "";
    const slug = item.sEOName || "";
    const url = slug ? `${URL_BASE}/${category}${slug}` : URL_BASE;

    return convertUnit(
        {
            id: String(item.productID),
            store: STORE,
            name,
            description: item.description || item.productDetails?.description || "",
            price,
            priceHistory: [{ date: today, price }],
            isWeighted: Boolean(item.isBulk),
            unit,
            quantity,
            bio: isBio(item),
            url,
        },
        units,
        STORE,
        fallback || { unit: "stk", quantity: 1 }
    );
}

async function fetchToken() {
    const { headers } = await client.post("/session/configure", TOKEN_DATA, {
        headers: { "Content-Type": "application/json" },
    });

    const token = headers["jwt-auth"];
    if (!token) {
        throw new Error("Missing jwt-auth token in /session/configure response");
    }
    return token;
}

async function fetchRootProgIds(authHeaders) {
    const { data } = await client.get("/category/GetFullCategoryList/", {
        headers: authHeaders,
    });

    if (!Array.isArray(data)) {
        throw new Error("Unexpected category response format for Hofer");
    }

    return data
        .map((category) => category && category.ProgID)
        .filter((progId) => typeof progId === "string" && progId.length > 0);
}

async function fetchData() {
    const token = await fetchToken();
    const authHeaders = { authorization: `Bearer ${token}` };

    const rootProgIds = await fetchRootProgIds(authHeaders);
    const progIds = [...new Set([...CATEGORY_PROG_IDS, ...rootProgIds])];

    if (progIds.length === 0) {
        throw new Error("No Hofer category progIds available");
    }

    const params = new URLSearchParams();
    for (const progId of progIds) {
        params.append("progIdList", progId);
    }
    params.set("listResultProductNum", "1000");
    params.set("providerCode", STORE);
    params.set("isOwnWebshop", "true");

    const { data } = await client.get(`/productlist/additionalCategoryProductList?${params.toString()}`, {
        headers: authHeaders,
    });

    const productListResults = Array.isArray(data?.ProductListResults)
        ? data.ProductListResults
        : [];

    if (productListResults.length === 0) {
        throw new Error("Hofer API returned no ProductListResults");
    }

    const deduped = new Map();

    for (const result of productListResults) {
        const list = Array.isArray(result?.ProductList) ? result.ProductList : [];
        const totalItems = Number(result?.ListContext?.TotalItems);

        if (Number.isFinite(totalItems) && totalItems > list.length) {
            console.warn(
                `[${STORE}] Product list truncated (${list.length}/${totalItems}).` +
                " Consider lowering category batch size or using paged fetches."
            );
        }

        for (const item of list) {
            if (!item || item.productID == null) continue;
            deduped.set(String(item.productID), item);
        }
    }

    if (deduped.size === 0) {
        throw new Error("Hofer API returned zero products after deduplication");
    }

    return [...deduped.values()];
}

module.exports = { fetchData, getCanonical, STORE, FAIL_ON_ERROR };
