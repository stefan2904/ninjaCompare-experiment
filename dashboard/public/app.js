/**
 * ninjaCompare Dashboard – client-side app
 */

const STORES = ["billa", "spar", "ninja", "velofood"];

let allItems = [];
let activeStores = new Set(STORES);

// ─── DOM refs ────────────────────────────────────────────────────────────────
const searchInput = document.getElementById("search");
const sortSelect = document.getElementById("sort");
const storeFiltersEl = document.getElementById("store-filters");
const productBody = document.getElementById("product-body");
const statsEl = document.getElementById("stats");

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

function renderTable() {
    const items = getFilteredItems();

    // Stats
    const storeCounts = {};
    for (const item of items) storeCounts[item.store] = (storeCounts[item.store] || 0) + 1;
    statsEl.textContent =
        `Showing ${items.length.toLocaleString()} products – ` +
        STORES.filter((s) => storeCounts[s]).map((s) => `${s}: ${storeCounts[s]}`).join(", ");

    if (items.length === 0) {
        productBody.innerHTML = `<tr><td colspan="5" class="no-results">No products found.</td></tr>`;
        return;
    }

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
}

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// ─── Data loading ───────────────────────────────────────────────────────────
async function loadData() {
    productBody.innerHTML = `<tr><td colspan="5" class="loading">Loading data…</td></tr>`;
    statsEl.textContent = "";

    try {
        const response = await fetch("/api/data");
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        allItems = await response.json();
        renderTable();
    } catch (err) {
        productBody.innerHTML = `<tr><td colspan="5" class="error">Failed to load data: ${escapeHtml(err.message)}</td></tr>`;
        statsEl.textContent = "";
    }
}

// ─── Init ───────────────────────────────────────────────────────────────────
buildStoreFilters();
searchInput.addEventListener("input", renderTable);
sortSelect.addEventListener("change", renderTable);
loadData();
