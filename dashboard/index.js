/**
 * Dashboard Service – ninjaCompare
 *
 * Serves the price-comparison dashboard frontend and proxies data requests
 * to the data-collector service.
 *
 * Endpoints:
 *   GET /          – dashboard HTML
 *   GET /api/data  – proxy to data-collector /data
 *   GET /health    – liveness probe
 */

const express = require("express");
const path = require("path");

const PORT = process.env.PORT || 3000;
const COLLECTOR_URL = process.env.COLLECTOR_URL || "http://data-collector:3001";

const app = express();

app.use(express.static(path.join(__dirname, "public")));

app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
});

// Proxy /api/data to the data-collector service
app.get("/api/data", async (req, res) => {
    try {
        const url = new URL("/data", COLLECTOR_URL);
        const response = await fetch(url.toString());
        if (!response.ok) {
            return res.status(response.status).json({ error: "Data collector error" });
        }
        const data = await response.json();
        res.json(data);
    } catch (err) {
        console.error("Error proxying to data collector:", err.message);
        res.status(502).json({ error: "Could not reach data collector" });
    }
});

// Proxy /api/data/:store to the data-collector service
app.get("/api/data/:store", async (req, res) => {
    try {
        const url = new URL(`/data/${encodeURIComponent(req.params.store)}`, COLLECTOR_URL);
        const response = await fetch(url.toString());
        if (!response.ok) {
            return res.status(response.status).json({ error: "Data collector error" });
        }
        const data = await response.json();
        res.json(data);
    } catch (err) {
        console.error("Error proxying to data collector:", err.message);
        res.status(502).json({ error: "Could not reach data collector" });
    }
});

app.listen(PORT, () => {
    console.log(`Dashboard listening on port ${PORT}`);
    console.log(`Proxying data requests to ${COLLECTOR_URL}`);
});
