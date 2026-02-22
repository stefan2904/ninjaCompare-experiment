/**
 * ninjaCompare Dashboard – client-side app (static GitHub Pages version)
 *
 * Loads price data directly from the data branch of the repository.
 */

const DATA_URL =
    "https://raw.githubusercontent.com/stefan2904/ninjaCompare-experiment/data/data/latest-canonical.json";

const STORES = ["billa", "spar", "ninja", "velofood"];
const ITEMS_PER_PAGE = 100;
const CACHE_KEY = "ninjaCompare_data";
const CACHE_TS_KEY = "ninjaCompare_ts";
const CACHE_MAX_AGE_MS = 60 * 60 * 1000; // 1 hour

let allItems = [];
let activeStores = new Set(STORES);
let currentPage = 1;
let cacheTimestamp = null; // when data was last fetched

// ─── DOM refs ────────────────────────────────────────────────────────────────
const searchInput = document.getElementById("search");
const sortSelect = document.getElementById("sort");
const storeFiltersEl = document.getElementById("store-filters");
const productBody = document.getElementById("product-body");
const statsEl = document.getElementById("stats");
const paginationEl = document.getElementById("pagination");
const reloadBtn = document.getElementById("reload-btn");

// ─── Build store filter checkboxes ──────────────────────────────────────────
function buildStoreFilters() {
    STORES.forEach((store) => {
        const label = document.createElement("label");
        label.className = store;
        label.htmlFor = `filter-${store}`;

        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.id = `filter-${store}`;
        checkbox.checked = true;
        checkbox.addEventListener("change", () => {
            if (checkbox.checked) activeStores.add(store);
            else activeStores.delete(store);
            currentPage = 1;
            renderTable();
        });

        label.appendChild(checkbox);
        label.appendChild(document.createTextNode(` ${store.charAt(0).toUpperCase() + store.slice(1)}`));
        storeFiltersEl.appendChild(label);
    });
}

// ─── Filtering & sorting ────────────────────────────────────────────────────
function getFilteredItems() {
    const query = searchInput.value.trim().toLowerCase();
    let items = allItems.filter(
        (item) =>
            activeStores.has(item.store) &&
            (query === "" || item.name.toLowerCase().includes(query))
    );

    const sortBy = sortSelect.value;
    if (sortBy === "price-asc") items.sort((a, b) => a.price - b.price);
    else if (sortBy === "price-desc") items.sort((a, b) => b.price - a.price);
    else items.sort((a, b) => a.name.localeCompare(b.name, "de"));

    return items;
}

// ─── Render ─────────────────────────────────────────────────────────────────
function formatUnit(item) {
    if (!item.unit || !item.quantity) return "";
    const qty = item.quantity >= 1000 && item.unit === "g"
        ? `${(item.quantity / 1000).toFixed(2).replace(/\.?0+$/, "")} kg`
        : item.unit === "ml" && item.quantity >= 1000
        ? `${(item.quantity / 1000).toFixed(2).replace(/\.?0+$/, "")} l`
        : `${item.quantity} ${item.unit}`;

    if (item.price && item.quantity > 0) {
        const baseQty = item.unit === "g" ? 100 : item.unit === "ml" ? 100 : 1;
        const baseUnit = item.unit === "g" ? "100g" : item.unit === "ml" ? "100ml" : item.unit;
        const perBase = (item.price / item.quantity) * baseQty;
        return `${qty} (€${perBase.toFixed(2)}/${baseUnit})`;
    }
    return qty;
}

function renderPagination(total) {
    const totalPages = Math.ceil(total / ITEMS_PER_PAGE);
    if (totalPages <= 1) {
        paginationEl.innerHTML = "";
        paginationEl.onclick = null;
        return;
    }
    const start = (currentPage - 1) * ITEMS_PER_PAGE + 1;
    const end = Math.min(currentPage * ITEMS_PER_PAGE, total);
    paginationEl.innerHTML = `
        <button data-page="prev" ${currentPage === 1 ? "disabled" : ""} aria-label="Previous page">&#8249; Prev</button>
        <span class="page-info">Page ${currentPage} of ${totalPages} (${start}–${end} of ${total.toLocaleString()})</span>
        <button data-page="next" ${currentPage === totalPages ? "disabled" : ""} aria-label="Next page">Next &#8250;</button>
    `;
    paginationEl.onclick = (e) => {
        const btn = e.target.closest("button");
        if (!btn || btn.disabled) return;
        if (btn.dataset.page === "prev" && currentPage > 1) { currentPage--; renderTable(); }
        if (btn.dataset.page === "next" && currentPage < totalPages) { currentPage++; renderTable(); }
    };
}

function renderTable() {
    const allFiltered = getFilteredItems();
    const total = allFiltered.length;

    if (total === 0) {
        currentPage = 1;
        statsEl.textContent = "Showing 0 products";
        productBody.innerHTML = `<tr><td colspan="5" class="no-results">No products found.</td></tr>`;
        paginationEl.innerHTML = "";
        paginationEl.onclick = null;
        return;
    }

    const totalPages = Math.ceil(total / ITEMS_PER_PAGE);
    if (currentPage > totalPages) currentPage = totalPages;

    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    const items = allFiltered.slice(start, start + ITEMS_PER_PAGE);

    // Stats
    const storeCounts = {};
    for (const item of allFiltered) storeCounts[item.store] = (storeCounts[item.store] || 0) + 1;
    const cacheInfo = cacheTimestamp ? ` · loaded ${formatCacheAge()}` : "";
    statsEl.textContent =
        `Showing ${total.toLocaleString()} products – ` +
        STORES.filter((s) => storeCounts[s]).map((s) => `${s}: ${storeCounts[s]}`).join(", ") +
        cacheInfo;

    productBody.innerHTML = items
        .map((item) => {
            const nameCell = item.url
                ? `<a href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.name)}</a>`
                : escapeHtml(item.name);

            return `<tr>
                <td class="product-name">${nameCell}</td>
                <td><span class="store-badge ${escapeHtml(item.store)}">${escapeHtml(item.store)}</span></td>
                <td>€${item.price.toFixed(2)}</td>
                <td>${formatUnit(item)}</td>
                <td>${item.bio ? '<span class="bio-badge">Bio</span>' : ""}</td>
            </tr>`;
        })
        .join("");

    renderPagination(total);
}

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// ─── Store filter visibility ────────────────────────────────────────────────
function updateStoreFilterVisibility() {
    const storeCounts = {};
    for (const item of allItems) storeCounts[item.store] = (storeCounts[item.store] || 0) + 1;

    STORES.forEach((store) => {
        const label = document.querySelector(`label[for="filter-${store}"]`);
        if (label) {
            if (storeCounts[store]) {
                label.style.display = "";
            } else {
                label.style.display = "none";
                activeStores.delete(store);
            }
        }
    });
}

// ─── Data loading & caching ──────────────────────────────────────────────────
function getCachedData() {
    try {
        const ts = localStorage.getItem(CACHE_TS_KEY);
        if (!ts) return null;
        const age = Date.now() - Number(ts);
        if (age > CACHE_MAX_AGE_MS) return null;
        const raw = localStorage.getItem(CACHE_KEY);
        if (!raw) return null;
        return { data: JSON.parse(raw), timestamp: Number(ts) };
    } catch {
        return null;
    }
}

function setCachedData(data) {
    try {
        const now = Date.now();
        localStorage.setItem(CACHE_KEY, JSON.stringify(data));
        localStorage.setItem(CACHE_TS_KEY, String(now));
        cacheTimestamp = now;
    } catch {
        // localStorage full or unavailable – silently ignore
    }
}

function formatCacheAge() {
    if (!cacheTimestamp) return "";
    const secs = Math.round((Date.now() - cacheTimestamp) / 1000);
    if (secs < 5) return "just now";
    if (secs < 60) return `${secs}s ago`;
    const mins = Math.round(secs / 60);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.round(mins / 60);
    return `${hrs}h ago`;
}

async function loadData(forceReload = false) {
    productBody.innerHTML = `<tr><td colspan="5" class="loading">Loading data…</td></tr>`;
    statsEl.textContent = "";
    reloadBtn.disabled = true;

    // Try cache first (unless force-reload)
    if (!forceReload) {
        const cached = getCachedData();
        if (cached) {
            allItems = cached.data;
            cacheTimestamp = cached.timestamp;
            updateStoreFilterVisibility();
            renderTable();
            reloadBtn.disabled = false;
            return;
        }
    }

    try {
        const response = await fetch(DATA_URL);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        allItems = await response.json();
        setCachedData(allItems);
        updateStoreFilterVisibility();
        renderTable();
    } catch (err) {
        productBody.innerHTML = `<tr><td colspan="5" class="error">Failed to load data: ${escapeHtml(err.message)}</td></tr>`;
        statsEl.textContent = "";
    } finally {
        reloadBtn.disabled = false;
    }
}

// ─── Init ───────────────────────────────────────────────────────────────────
buildStoreFilters();

// Debounced search – avoids re-rendering on every keystroke
let searchTimer = null;
searchInput.addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { currentPage = 1; renderTable(); }, 300);
});

sortSelect.addEventListener("change", () => { currentPage = 1; renderTable(); });

reloadBtn.addEventListener("click", () => loadData(true));

loadData();
