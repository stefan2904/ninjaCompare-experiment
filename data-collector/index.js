/**
 * Data Collector Service – ninjaCompare
 *
 * Fetches product prices from Austrian supermarkets (Billa, Spar, Hofer) and
 * online shops (Ninja, Velofood), merges them into a canonical JSON format,
 * and exposes the result via a simple HTTP API.
 *
 * Endpoints:
 *   GET /health          – liveness probe
 *   GET /data            – full canonical product list (JSON)
 *   GET /data/:store     – canonical products for a single store
 *   POST /fetch          – trigger an immediate data refresh
 */

const express = require("express");
const cron = require("node-cron");
const fs = require("fs");
const path = require("path");

const billa = require("./stores/billa");
const spar = require("./stores/spar");
const ninja = require("./stores/ninja");
const velofood = require("./stores/velofood");
const alfiesGraz = require("./stores/alfies-graz");
const hofer = require("./stores/hofer");
const { currentDate } = require("./stores/utils");

const PORT = process.env.PORT || 3001;
const DATA_DIR = path.join(__dirname, "data");
const CANONICAL_FILE = path.join(DATA_DIR, "latest-canonical.json");

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

/** In-memory canonical product list. */
let canonicalItems = [];

/**
 * Fetch data from a single store module and return canonical items.
 * @param {object} storeModule  - module with { fetchData, getCanonical, STORE }
 * @returns {Promise<object[]>}
 */
async function fetchStore(storeModule) {
    const { fetchData, getCanonical, STORE } = storeModule;
    const today = currentDate();
    const start = Date.now();

    try {
        const rawItems = await fetchData();
        const items = rawItems
            .map((raw) => getCanonical(raw, today))
            .filter(Boolean);
        console.log(
            `Fetched ${STORE}: ${items.length} items in ${((Date.now() - start) / 1000).toFixed(2)}s`
        );
        return items;
    } catch (err) {
        console.error(`Error fetching ${STORE}: ${err.message}`);
        if (storeModule.FAIL_ON_ERROR) {
            throw err;
        }
        return [];
    }
}

/**
 * Fetch data from all stores, merge into a single list, persist to disk,
 * and update the in-memory cache.
 */
async function fetchAll() {
    console.log(`Starting data fetch – ${currentDate()}`);

    const results = await Promise.all([
        fetchStore(billa),
        fetchStore(spar),
        fetchStore(ninja),
        fetchStore(velofood),
        fetchStore(alfiesGraz),
        fetchStore(hofer),
    ]);

    // Flatten and merge results
    const newItems = results.flat();

    // Merge price history with previous run (if available)
    if (fs.existsSync(CANONICAL_FILE)) {
        try {
            const previous = JSON.parse(fs.readFileSync(CANONICAL_FILE, "utf-8"));
            const prevLookup = {};
            for (const item of previous) {
                prevLookup[`${item.store}:${item.id}`] = item;
            }
            for (const item of newItems) {
                const key = `${item.store}:${item.id}`;
                const prev = prevLookup[key];
                if (prev && Array.isArray(prev.priceHistory)) {
                    // Prepend today's price, keep history sorted descending
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

    canonicalItems = newItems;
    fs.writeFileSync(CANONICAL_FILE, JSON.stringify(canonicalItems, null, 2));
    console.log(`Data fetch complete – ${canonicalItems.length} total items`);
}

// --- Express app -----------------------------------------------------------

const app = express();
app.use(express.json());

app.get("/health", (_req, res) => {
    res.json({ status: "ok", items: canonicalItems.length });
});

app.get("/data", (_req, res) => {
    res.json(canonicalItems);
});

app.get("/data/:store", (req, res) => {
    const store = req.params.store.toLowerCase();
    const items = canonicalItems.filter((i) => i.store === store);
    if (items.length === 0) {
        return res.status(404).json({ error: `No data for store '${store}'` });
    }
    res.json(items);
});

app.post("/fetch", async (_req, res) => {
    res.json({ message: "Fetch triggered" });
    // Run asynchronously so the response is returned immediately
    fetchAll().catch((err) => console.error("fetchAll error:", err.message));
});

// --- Startup ---------------------------------------------------------------

app.listen(PORT, async () => {
    console.log(`Data collector listening on port ${PORT}`);

    // Load previously persisted data if available
    if (fs.existsSync(CANONICAL_FILE)) {
        try {
            canonicalItems = JSON.parse(fs.readFileSync(CANONICAL_FILE, "utf-8"));
            console.log(`Loaded ${canonicalItems.length} items from cache`);
        } catch (err) {
            console.warn(`Could not load cache: ${err.message}`);
        }
    }

    // Initial fetch on startup
    await fetchAll().catch((err) => console.error("Initial fetchAll error:", err.message));

    // Schedule daily fetch at 06:00 (Vienna time offset handled by TZ env var)
    cron.schedule("0 6 * * *", () => {
        fetchAll().catch((err) => console.error("Scheduled fetchAll error:", err.message));
    });
    console.log("Scheduled daily fetch at 06:00");
});
