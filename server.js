// ============================================================
// server.js — YouTube Downloader API (Express + yt-dlp)
// ============================================================
require("dotenv").config();
const fs = require("fs");
const path = require("path");

// Global error/crash logging
process.on("uncaughtException", (err) => {
  console.error("UNCAUGHT EXCEPTION:", err);
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  console.error("UNHANDLED REJECTION:", reason);
});

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");

// Server initialization

const downloadRoutes = require("./routes/download");
const infoRoutes = require("./routes/info");
const adminRoutes = require("./routes/admin");

const app = express();
const PORT = Number(process.env.PORT) || 3001;

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


// ── Auto-update yt-dlp and ensure FFmpeg on start ─────────────
const { updateYtDlp, ensureFfmpeg } = require("./utils/helpers");
try {
  updateYtDlp();
} catch (e) {
  console.error("[yt-dlp] Failed to run startup update check:", e.message);
}
try {
  ensureFfmpeg();
} catch (e) {
  console.error("[FFmpeg] Failed to run startup FFmpeg check:", e.message);
}


// ── Routes ────────────────────────────────────────────────────
app.use("/api", infoRoutes);
app.use("/api", downloadRoutes);
app.use("/api", adminRoutes);

// ── Serve temp files for download with proper name ─────────────────────────────
app.get("/files/:filename", (req, res) => {
  const { filename } = req.params;
  const { title } = req.query;
  const filePath = path.resolve(TEMP_DIR, filename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).send("File not found or link has expired.");
  }

  // Sanitise the download file name to have its proper title
  let downloadName = filename;
  if (title) {
    const ext = path.extname(filename);
    const cleanTitle = title
      .replace(/[^\w\s\-.()\[\]]/g, "") // remove special filesystem characters
      .replace(/\s+/g, "_")             // replace spaces with underscores
      .slice(0, 100);                   // limit length
    downloadName = `${cleanTitle}${ext}`;
  }

  console.log(`[Server] Serving file "${filename}" as "${downloadName}"`);
  res.download(filePath, downloadName, (err) => {
    if (err) {
      console.error("[Server] Error sending file:", err.message);
    }
  });
});

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

const startServer = (port) => {
  const server = app.listen(port, () => {
    console.log(`✅  YTDL API running on http://localhost:${port}`);
  });

  server.on("error", (err) => {
    if (err.code === "EADDRINUSE") {
      console.warn(`⚠️  Port ${port} is in use, trying ${port + 1}...`);
      setTimeout(() => startServer(port + 1), 1000);
    } else {
      console.error("[Error] Server failed to start:", err);
    }
  });
};

startServer(PORT);

module.exports = app;
// force reload nodemon 123
