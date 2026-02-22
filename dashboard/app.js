/**
 * ninjaCompare Dashboard – client-side app (static GitHub Pages version)
 *
 * Loads price data directly from the data branch of the repository.
 * Includes basket-based price comparison feature.
 */

const DATA_URL =
    "https://raw.githubusercontent.com/stefan2904/ninjaCompare-experiment/data/data/latest-canonical.json";

const STORES = ["billa", "spar", "ninja", "velofood"];
const ITEMS_PER_PAGE = 100;
const CACHE_KEY = "ninjaCompare_data";
const CACHE_TS_KEY = "ninjaCompare_ts";
const CACHE_MAX_AGE_MS = 60 * 60 * 1000; // 1 hour
const BASKET_KEY = "ninjaCompare_basket";

let allItems = [];
let itemById = new Map();
let activeStores = new Set(STORES);
let currentPage = 1;
let cacheTimestamp = null;

// ─── Basket state ────────────────────────────────────────────────────────────
let basket = new Map(); // id -> product item
let pendingBasketIds = null; // IDs to resolve once data loads

// ─── DOM refs ────────────────────────────────────────────────────────────────
const searchInput = document.getElementById("search");
const sortSelect = document.getElementById("sort");
const storeFiltersEl = document.getElementById("store-filters");
const productBody = document.getElementById("product-body");
const statsEl = document.getElementById("stats");
const paginationEl = document.getElementById("pagination");
const reloadBtn = document.getElementById("reload-btn");
const basketFab = document.getElementById("basket-fab");
const basketCountEl = document.getElementById("basket-count");
const comparisonModal = document.getElementById("comparison-modal");
const comparisonBody = document.getElementById("comparison-body");

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
        productBody.innerHTML = `<tr><td colspan="6" class="no-results">No products found.</td></tr>`;
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

            const inBasket = basket.has(item.id);
            const basketBtn = inBasket
                ? `<button class="basket-btn in-basket" data-id="${escapeHtml(item.id)}" title="Remove from basket">✓</button>`
                : `<button class="basket-btn" data-id="${escapeHtml(item.id)}" title="Add to basket">+</button>`;

            return `<tr class="${inBasket ? 'row-in-basket' : ''}">
                <td class="product-name">${nameCell}</td>
                <td><span class="store-badge ${escapeHtml(item.store)}">${escapeHtml(item.store)}</span></td>
                <td>€${item.price.toFixed(2)}</td>
                <td>${formatUnit(item)}</td>
                <td>${item.bio ? '<span class="bio-badge">Bio</span>' : ""}</td>
                <td class="basket-cell">${basketBtn}</td>
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
    productBody.innerHTML = `<tr><td colspan="6" class="loading">Loading data…</td></tr>`;
    statsEl.textContent = "";
    reloadBtn.disabled = true;

    // Try cache first (unless force-reload)
    if (!forceReload) {
        const cached = getCachedData();
        if (cached) {
            allItems = cached.data;
            cacheTimestamp = cached.timestamp;
            onDataLoaded();
            reloadBtn.disabled = false;
            return;
        }
    }

    try {
        const response = await fetch(DATA_URL);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        allItems = await response.json();
        setCachedData(allItems);
        onDataLoaded();
    } catch (err) {
        productBody.innerHTML = `<tr><td colspan="6" class="error">Failed to load data: ${escapeHtml(err.message)}</td></tr>`;
        statsEl.textContent = "";
    } finally {
        reloadBtn.disabled = false;
    }
}

function onDataLoaded() {
    // Build ID index
    itemById = new Map(allItems.map(item => [item.id, item]));

    // Resolve pending basket IDs (from URL hash or localStorage)
    if (pendingBasketIds) {
        resolveBasketIds(pendingBasketIds);
        const shouldAutoOpen = window.location.hash.startsWith('#basket=') && basket.size > 0;
        pendingBasketIds = null;
        updateStoreFilterVisibility();
        renderTable();
        if (shouldAutoOpen) {
            openComparison();
        }
    } else {
        updateStoreFilterVisibility();
        renderTable();
    }
}

// ─── Basket Management ──────────────────────────────────────────────────────
function loadBasketIdsFromStorage() {
    try {
        const raw = localStorage.getItem(BASKET_KEY);
        if (raw) return JSON.parse(raw);
    } catch {}
    return [];
}

function saveBasketToStorage() {
    const ids = Array.from(basket.keys());
    try {
        localStorage.setItem(BASKET_KEY, JSON.stringify(ids));
    } catch {}
}

function resolveBasketIds(ids) {
    basket.clear();
    for (const id of ids) {
        const item = itemById.get(id);
        if (item) basket.set(id, item);
    }
    updateBasketUI();
}

function addToBasket(id) {
    const item = itemById.get(id);
    if (item) {
        basket.set(id, item);
        saveBasketToStorage();
        updateBasketUI();
    }
}

function removeFromBasket(id) {
    basket.delete(id);
    saveBasketToStorage();
    updateBasketUI();
}

function clearBasket() {
    basket.clear();
    saveBasketToStorage();
    updateBasketUI();
    // Clear URL hash if it had a basket
    if (window.location.hash.startsWith('#basket=')) {
        history.replaceState(null, '', window.location.pathname);
    }
    renderTable();
}

function updateBasketUI() {
    if (basket.size > 0) {
        basketFab.classList.remove('hidden');
        basketCountEl.textContent = basket.size;
    } else {
        basketFab.classList.add('hidden');
    }
}

// ─── Hash-based Sharing ─────────────────────────────────────────────────────
function parseHashBasket() {
    const hash = window.location.hash;
    if (!hash.startsWith('#basket=')) return null;
    const idsStr = decodeURIComponent(hash.slice(8));
    return idsStr.split(',').filter(Boolean);
}

function getShareUrl() {
    const ids = Array.from(basket.keys());
    const hash = `basket=${ids.map(encodeURIComponent).join(',')}`;
    return `${window.location.origin}${window.location.pathname}#${hash}`;
}

function shareBasket() {
    const url = getShareUrl();
    // Also update the current URL hash
    history.replaceState(null, '', `#basket=${Array.from(basket.keys()).map(encodeURIComponent).join(',')}`);

    if (navigator.clipboard) {
        navigator.clipboard.writeText(url).then(() => {
            showToast('Share link copied to clipboard!');
        }).catch(() => {
            prompt('Copy this share link:', url);
        });
    } else {
        prompt('Copy this share link:', url);
    }
}

function showToast(message) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    document.body.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 2500);
}

// ─── Comparison View ────────────────────────────────────────────────────────
let mainChart = null;
let productCharts = [];
let normalizeByWeight = false;

/**
 * Returns the normalized price for a product.
 * - unit "g": price per 1000g (per kg)
 * - unit "ml": price per 1000ml (per litre)
 * - unit "stk" or missing quantity: price as-is (cannot normalize)
 */
function getNormalizedPrice(item) {
    if (!normalizeByWeight) return item.price;
    if (!item.unit || !item.quantity || item.quantity <= 0) return item.price;
    if (item.unit === 'g')  return (item.price / item.quantity) * 1000;
    if (item.unit === 'ml') return (item.price / item.quantity) * 1000;
    return item.price; // stk – can't normalize
}

/**
 * Returns the normalized price for a historical price entry.
 */
function getNormalizedHistoryPrice(historyPrice, item) {
    if (!normalizeByWeight) return historyPrice;
    if (!item.unit || !item.quantity || item.quantity <= 0) return historyPrice;
    if (item.unit === 'g')  return (historyPrice / item.quantity) * 1000;
    if (item.unit === 'ml') return (historyPrice / item.quantity) * 1000;
    return historyPrice;
}

/**
 * Returns the unit label for display when normalizing.
 */
function getNormalizedUnitLabel(item) {
    if (!normalizeByWeight) return '';
    if (item.unit === 'g')  return '/kg';
    if (item.unit === 'ml') return '/l';
    return '';
}

/**
 * Returns whether an item can be weight-normalized.
 */
function canNormalize(item) {
    return item.unit && item.quantity > 0 && (item.unit === 'g' || item.unit === 'ml');
}

const STORE_COLORS = {
    billa:    { line: '#e63946', bg: 'rgba(230, 57, 70, 0.15)' },
    spar:     { line: '#2a9d8f', bg: 'rgba(42, 157, 143, 0.15)' },
    ninja:    { line: '#f4a261', bg: 'rgba(244, 162, 97, 0.15)' },
    velofood: { line: '#457b9d', bg: 'rgba(69, 123, 157, 0.15)' },
};

function openComparison() {
    comparisonModal.classList.remove('hidden');
    document.body.classList.add('modal-open');
    renderComparison();
}

function closeComparison() {
    comparisonModal.classList.add('hidden');
    document.body.classList.remove('modal-open');
    destroyCharts();
}

function destroyCharts() {
    if (mainChart) { mainChart.destroy(); mainChart = null; }
    for (const c of productCharts) c.destroy();
    productCharts = [];
}

function renderComparison() {
    destroyCharts();

    if (basket.size === 0) {
        comparisonBody.innerHTML = `
            <div class="comparison-empty">
                <div class="comparison-empty-icon">🛒</div>
                <p>Your basket is empty.</p>
                <p class="comparison-empty-hint">Add products from the list to compare prices across stores.</p>
            </div>`;
        return;
    }

    // Group by store
    const storeGroups = {};
    for (const [id, item] of basket) {
        if (!storeGroups[item.store]) storeGroups[item.store] = [];
        storeGroups[item.store].push(item);
    }

    // Calculate totals (using normalized or absolute prices)
    const storeTotals = {};
    for (const [store, items] of Object.entries(storeGroups)) {
        storeTotals[store] = items.reduce((sum, item) => sum + getNormalizedPrice(item), 0);
    }

    // Sort stores by total price (cheapest first)
    const sortedStores = Object.entries(storeTotals).sort((a, b) => a[1] - b[1]);
    const cheapestStore = sortedStores.length > 1 ? sortedStores[0][0] : null;
    const mostExpensiveTotal = sortedStores[sortedStores.length - 1][1];

    // Check if any basket items can be normalized (for informational hint)
    const hasNormalizableItems = Array.from(basket.values()).some(canNormalize);
    const hasNonNormalizableItems = normalizeByWeight && Array.from(basket.values()).some(item => !canNormalize(item));

    // ── Summary bar ──
    let html = '<div class="comparison-summary">';
    html += `<div class="comparison-summary-count">${basket.size} product${basket.size !== 1 ? 's' : ''} across ${sortedStores.length} store${sortedStores.length !== 1 ? 's' : ''}</div>`;
    if (cheapestStore) {
        const savings = (mostExpensiveTotal - storeTotals[cheapestStore]);
        if (savings > 0.004) {
            html += `<div class="comparison-summary-savings">💰 Best deal at <strong>${ucfirst(cheapestStore)}</strong> — save <strong>€${savings.toFixed(2)}</strong>${normalizeByWeight ? ' (normalized)' : ''}</div>`;
        }
    }
    html += '</div>';

    // ── Normalization hint ──
    if (normalizeByWeight && hasNonNormalizableItems) {
        html += '<div class="normalize-hint">ℹ️ Items sold by piece (stk) cannot be normalized and show their absolute price.</div>';
    }

    // ── Store baskets ──
    html += '<div class="comparison-stores">';
    for (const [store, total] of sortedStores) {
        const items = storeGroups[store];
        const isCheapest = store === cheapestStore;
        html += `
        <div class="comparison-store ${isCheapest ? 'cheapest' : ''}">
            <div class="comparison-store-header">
                <div class="comparison-store-header-left">
                    <span class="store-badge ${escapeHtml(store)}">${escapeHtml(ucfirst(store))}</span>
                    ${isCheapest ? '<span class="cheapest-badge">★ Cheapest</span>' : ''}
                </div>
                <span class="comparison-store-total">€${total.toFixed(2)}${normalizeByWeight ? ' <span class="normalized-label">normalized</span>' : ''}</span>
            </div>
            <div class="comparison-products">
                ${items.map(item => {
                    const normPrice = getNormalizedPrice(item);
                    const unitLabel = getNormalizedUnitLabel(item);
                    return `
                    <div class="comparison-product">
                        <div class="comparison-product-info">
                            <span class="comparison-product-name">${escapeHtml(item.name)}</span>
                            <span class="comparison-product-detail">${formatUnit(item)}${item.bio ? ' · Bio' : ''}${normalizeByWeight && !canNormalize(item) ? ' · <em>not normalizable</em>' : ''}</span>
                        </div>
                        <span class="comparison-product-price">€${normPrice.toFixed(2)}${unitLabel ? `<span class="price-unit-label">${unitLabel}</span>` : ''}</span>
                        <button class="comparison-remove-btn" data-id="${escapeHtml(item.id)}" title="Remove from basket">✕</button>
                    </div>
                `}).join('')}
            </div>
            <div class="comparison-total-row">
                <span>Total (${items.length} item${items.length !== 1 ? 's' : ''})</span>
                <span class="comparison-total-price">€${total.toFixed(2)}</span>
            </div>
            ${isCheapest && sortedStores.length > 1 && (mostExpensiveTotal - total) > 0.004 ? `
                <div class="comparison-savings-note">
                    Save €${(mostExpensiveTotal - total).toFixed(2)} vs ${ucfirst(sortedStores[sortedStores.length - 1][0])}${normalizeByWeight ? ' (normalized)' : ''}
                </div>
            ` : ''}
        </div>`;
    }
    html += '</div>';

    // ── Price history section ──
    html += `
        <div class="comparison-history">
            <h3>📈 Price History${normalizeByWeight ? ' (normalized per kg/l)' : ''}</h3>
            <div class="main-chart-container">
                <canvas id="price-history-chart"></canvas>
            </div>
            <div id="product-charts-container" class="product-charts-container"></div>
        </div>
    `;

    comparisonBody.innerHTML = html;

    // Event: remove buttons within comparison
    comparisonBody.querySelectorAll('.comparison-remove-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            removeFromBasket(btn.dataset.id);
            renderComparison();
            renderTable();
        });
    });

    // Render charts
    renderMainChart(storeGroups);
    renderProductCharts(storeGroups);
}

function ucfirst(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
}

function renderMainChart(storeGroups) {
    const canvas = document.getElementById('price-history-chart');
    if (!canvas || typeof Chart === 'undefined') return;

    // Collect all dates across all products in the basket
    const allDates = new Set();
    for (const items of Object.values(storeGroups)) {
        for (const item of items) {
            if (item.priceHistory) {
                for (const entry of item.priceHistory) allDates.add(entry.date);
            }
        }
    }

    const sortedDates = Array.from(allDates).sort();
    if (sortedDates.length < 2) {
        canvas.parentElement.innerHTML = '<p class="no-chart-data">Not enough price history data for a chart yet. Charts will appear as more daily price snapshots are collected.</p>';
        return;
    }

    // Build datasets: total basket price per store per date
    const datasets = [];
    for (const [store, items] of Object.entries(storeGroups)) {
        const totals = sortedDates.map(date => {
            let total = 0;
            for (const item of items) {
                let rawPrice;
                if (item.priceHistory && item.priceHistory.length > 0) {
                    const sorted = [...item.priceHistory].sort((a, b) => a.date.localeCompare(b.date));
                    rawPrice = sorted[0].price;
                    for (const entry of sorted) {
                        if (entry.date <= date) rawPrice = entry.price;
                        else break;
                    }
                } else {
                    rawPrice = item.price;
                }
                total += getNormalizedHistoryPrice(rawPrice, item);
            }
            return Math.round(total * 100) / 100;
        });

        const colors = STORE_COLORS[store] || { line: '#666', bg: 'rgba(102,102,102,0.15)' };
        datasets.push({
            label: ucfirst(store),
            data: totals,
            borderColor: colors.line,
            backgroundColor: colors.bg,
            fill: true,
            tension: 0.3,
            pointRadius: 4,
            pointHoverRadius: 6,
            borderWidth: 2,
        });
    }

    const yAxisLabel = normalizeByWeight ? 'Normalized Price (€/kg or €/l)' : 'Total Price (€)';
    const chartTitle = normalizeByWeight
        ? 'Normalized Basket Price per Store Over Time'
        : 'Total Basket Price per Store Over Time';

    mainChart = new Chart(canvas, {
        type: 'line',
        data: { labels: sortedDates, datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                title: { display: true, text: chartTitle, font: { size: 14, weight: '600' } },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    callbacks: { label: ctx => `${ctx.dataset.label}: €${ctx.parsed.y.toFixed(2)}` },
                },
                legend: { position: 'bottom' },
            },
            scales: {
                y: {
                    beginAtZero: false,
                    ticks: { callback: v => `€${Number(v).toFixed(2)}` },
                    title: { display: true, text: yAxisLabel },
                },
                x: { title: { display: true, text: 'Date' } },
            },
            interaction: { mode: 'nearest', axis: 'x', intersect: false },
        },
    });
}

function renderProductCharts(storeGroups) {
    const container = document.getElementById('product-charts-container');
    if (!container || typeof Chart === 'undefined') return;

    // Only show individual charts for products with 2+ history entries
    const chartsData = [];
    for (const [store, items] of Object.entries(storeGroups)) {
        for (const item of items) {
            if (item.priceHistory && item.priceHistory.length >= 2) {
                chartsData.push({ store, item });
            }
        }
    }

    if (chartsData.length === 0) {
        container.innerHTML = '';
        return;
    }

    let html = '<h4>Individual Product Price Trends</h4><div class="product-charts-grid">';
    for (const { store, item } of chartsData) {
        const unitLabel = getNormalizedUnitLabel(item);
        html += `
            <div class="product-chart-card">
                <div class="product-chart-title">
                    <span>${escapeHtml(item.name)}${normalizeByWeight && unitLabel ? ` <span class="price-unit-label">${unitLabel}</span>` : ''}</span>
                    <span class="store-badge ${escapeHtml(store)}">${escapeHtml(store)}</span>
                </div>
                <div class="product-chart-canvas-wrap">
                    <canvas id="pchart-${escapeHtml(item.id)}"></canvas>
                </div>
            </div>`;
    }
    html += '</div>';
    container.innerHTML = html;

    // Render each mini chart
    for (const { store, item } of chartsData) {
        const canvas = document.getElementById(`pchart-${item.id}`);
        if (!canvas) continue;

        const sorted = [...item.priceHistory].sort((a, b) => a.date.localeCompare(b.date));
        const colors = STORE_COLORS[store] || { line: '#666', bg: 'rgba(102,102,102,0.15)' };

        const chart = new Chart(canvas, {
            type: 'line',
            data: {
                labels: sorted.map(e => e.date),
                datasets: [{
                    data: sorted.map(e => getNormalizedHistoryPrice(e.price, item)),
                    borderColor: colors.line,
                    backgroundColor: colors.bg,
                    fill: true,
                    tension: 0.3,
                    pointRadius: 3,
                    borderWidth: 2,
                }],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    y: { ticks: { callback: v => `€${Number(v).toFixed(2)}` } },
                    x: { display: true },
                },
            },
        });
        productCharts.push(chart);
    }
}

// ─── Init ───────────────────────────────────────────────────────────────────
buildStoreFilters();

// Parse basket from URL hash first, then fall back to localStorage
pendingBasketIds = parseHashBasket() || loadBasketIdsFromStorage();

// Debounced search – avoids re-rendering on every keystroke
let searchTimer = null;
searchInput.addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { currentPage = 1; renderTable(); }, 300);
});

sortSelect.addEventListener("change", () => { currentPage = 1; renderTable(); });

reloadBtn.addEventListener("click", () => loadData(true));

// Basket button clicks (event delegation on the product table)
document.getElementById("products").addEventListener("click", (e) => {
    const btn = e.target.closest(".basket-btn");
    if (!btn) return;
    e.preventDefault();
    const id = btn.dataset.id;
    if (btn.classList.contains("in-basket")) {
        removeFromBasket(id);
    } else {
        addToBasket(id);
    }
    renderTable();
});

// Basket FAB → open comparison
document.getElementById("compare-btn").addEventListener("click", openComparison);

// Comparison modal buttons
document.getElementById("close-comparison-btn").addEventListener("click", closeComparison);
document.getElementById("share-basket-btn").addEventListener("click", shareBasket);
document.getElementById("clear-basket-btn").addEventListener("click", () => {
    if (basket.size === 0 || confirm("Clear all items from your basket?")) {
        clearBasket();
        renderComparison();
    }
});

// Normalize-by-weight toggle
document.getElementById("normalize-toggle").addEventListener("change", (e) => {
    normalizeByWeight = e.target.checked;
    renderComparison();
});

// Close modal on backdrop click
comparisonModal.addEventListener("click", (e) => {
    if (e.target === comparisonModal) closeComparison();
});

// Close modal on Escape
document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !comparisonModal.classList.contains("hidden")) {
        closeComparison();
    }
});

// Hash change listener (for shared links opened in same tab)
window.addEventListener("hashchange", () => {
    const hashIds = parseHashBasket();
    if (hashIds) {
        resolveBasketIds(hashIds);
        renderTable();
        openComparison();
    }
});

loadData();
