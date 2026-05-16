// ============================================================
// server.js — YouTube Downloader API (Express + yt-dlp)
// ============================================================
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const path = require("path");
const fs = require("fs");

const downloadRoutes = require("./routes/download");
const infoRoutes = require("./routes/info");

const app = express();
const PORT = process.env.PORT || 3001;

// ── Security headers ─────────────────────────────────────────
app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));

// ── CORS ─────────────────────────────────────────────────────
app.use(
  cors({
    origin: process.env.FRONTEND_URL || "*",
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type"],
  })
);

// ── Body parsing ──────────────────────────────────────────────
app.use(express.json({ limit: "1mb" }));

app.use(cors({ origin: "*" }));
// ── Global rate limiter ───────────────────────────────────────
const limiter = rateLimit({
  windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max: Number(process.env.RATE_LIMIT_MAX) || 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Please try again later." },
});
app.use("/api", limiter);

// ── Ensure temp directory exists ──────────────────────────────
const TEMP_DIR = process.env.TEMP_DIR || "./temp";
if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });

// ── Routes ────────────────────────────────────────────────────
app.use("/api", infoRoutes);
app.use("/api", downloadRoutes);

// ── Serve temp files for download ─────────────────────────────
app.use("/files", express.static(path.resolve(TEMP_DIR)));

// ── Health check ──────────────────────────────────────────────
app.get("/health", (req, res) => res.json({ status: "ok", ts: Date.now() }));

// ── Serve built React frontend in production ───────────────────
if (process.env.NODE_ENV === "production") {
  require("./serve-frontend")(app);
}

// ── 404 handler (API routes only in dev) ──────────────────────
app.use((req, res) => res.status(404).json({ error: "Route not found" }));

// ── Global error handler ──────────────────────────────────────
app.use((err, req, res, next) => {
  console.error("[Error]", err.message);
  res.status(500).json({ error: err.message || "Internal server error" });
});

app.listen(PORT, () => {
  console.log(`✅  YTDL API running on http://localhost:${PORT}`);
});

module.exports = app;
