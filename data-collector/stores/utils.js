/**
 * Shared utilities for store scrapers.
 * Unit conversion logic based on heissepreise (https://github.com/badlogic/heissepreise).
 */

const globalUnits = {
    "stk.": { unit: "stk", factor: 1 },
    stk: { unit: "stk", factor: 1 },
    st: { unit: "stk", factor: 1 },
    stück: { unit: "stk", factor: 1 },
    g: { unit: "g", factor: 1 },
    gr: { unit: "g", factor: 1 },
    gramm: { unit: "g", factor: 1 },
    dag: { unit: "g", factor: 10 },
    kg: { unit: "g", factor: 1000 },
    kilogramm: { unit: "g", factor: 1000 },
    ml: { unit: "ml", factor: 1 },
    dl: { unit: "ml", factor: 100 },
    cl: { unit: "ml", factor: 10 },
    l: { unit: "ml", factor: 1000 },
    lt: { unit: "ml", factor: 1000 },
    liter: { unit: "ml", factor: 1000 },
};

/**
 * Convert item units to a normalised canonical unit.
 * @param {object} item
 * @param {object} storeUnits  - store-specific unit aliases
 * @param {string} store       - store name (for error messages)
 * @param {object} [fallback]  - fallback { unit, quantity } when unit is unknown
 * @returns {object}
 */
function convertUnit(item, storeUnits, store, fallback) {
    if (typeof item.quantity === "string") {
        item.quantity = parseFloat(item.quantity.replace(",", "."));
    }

    let unit = item.unit;
    if (typeof unit === "string") unit = unit.toLowerCase();

    const conv = unit in globalUnits ? globalUnits[unit] : storeUnits[unit];
    if (conv === undefined) {
        if (fallback) {
            item.quantity = fallback.quantity;
            item.unit = fallback.unit;
        } else {
            console.error(`Unknown unit in ${store}: '${unit}' for item '${item.name}'`);
        }
        return item;
    }

    item.quantity = conv.factor * item.quantity;
    item.unit = conv.unit;
    return item;
}

/**
 * Return today's date as "YYYY-MM-DD".
 * @returns {string}
 */
function currentDate() {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

module.exports = { convertUnit, currentDate };
