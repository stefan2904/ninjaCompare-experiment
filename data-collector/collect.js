/**
 * Standalone Data Collector – ninjaCompare
 *
 * Fetches product prices from all stores, merges price history with any
 * previously stored data, writes the result to DATA_FILE, and exits.
 *
 * Intended to be run as a one-shot script (e.g. inside a GitHub Action):
 *
 *   node collect.js
 *
 * The output path can be overridden via the DATA_FILE env variable.
 */

const fs = require("fs");
const path = require("path");

const billa = require("./stores/billa");
const spar = require("./stores/spar");
const ninja = require("./stores/ninja");
const velofood = require("./stores/velofood");
const { currentDate } = require("./stores/utils");

const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, "data", "latest-canonical.json");

/** Ensure the directory for DATA_FILE exists. */
function ensureDir(filePath) {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

/**
 * Fetch data from a single store module and return canonical items.
 * @param {{ fetchData: Function, getCanonical: Function, STORE: string }} storeModule
 * @returns {Promise<object[]>}
 */
async function fetchStore(storeModule) {
    const { fetchData, getCanonical, STORE } = storeModule;
    const today = currentDate();
    const start = Date.now();
    try {
        const rawItems = await fetchData();
        const items = rawItems.map((raw) => getCanonical(raw, today)).filter(Boolean);
        console.log(`Fetched ${STORE}: ${items.length} items in ${((Date.now() - start) / 1000).toFixed(2)}s`);
        return items;
    } catch (err) {
        console.error(`Error fetching ${STORE}: ${err.message}`);
        return [];
    }
}

/** Fetch all stores, merge price history, persist to DATA_FILE, and exit. */
async function main() {
    console.log(`Starting data collection – ${currentDate()}`);

    const results = await Promise.all([
        fetchStore(billa),
        fetchStore(spar),
        fetchStore(ninja),
        fetchStore(velofood),
    ]);

    const newItems = results.flat();

    // Merge price history from the previously stored file (if available)
    if (fs.existsSync(DATA_FILE)) {
        try {
            const previous = JSON.parse(fs.readFileSync(DATA_FILE, "utf-8"));
            const prevLookup = {};
            for (const item of previous) {
                prevLookup[`${item.store}:${item.id}`] = item;
            }
            for (const item of newItems) {
                const key = `${item.store}:${item.id}`;
                const prev = prevLookup[key];
                if (prev && Array.isArray(prev.priceHistory) && item.priceHistory.length > 0) {
                    const history = [
                        ...item.priceHistory,
                        ...prev.priceHistory.filter((h) => h.date !== item.priceHistory[0].date),
                    ];
                    history.sort((a, b) => (a.date < b.date ? 1 : -1));
                    item.priceHistory = history;
                }
            }
        } catch (err) {
            console.warn(`Could not merge price history: ${err.message}`);
        }
    }

    ensureDir(DATA_FILE);
    fs.writeFileSync(DATA_FILE, JSON.stringify(newItems, null, 2));
    console.log(`Data collection complete – ${newItems.length} total items written to ${DATA_FILE}`);
}

main().catch((err) => {
    console.error(`Fatal error: ${err.message}`);
    process.exit(1);
});
