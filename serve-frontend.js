// ============================================================
// backend/serve-frontend.js
// In production, Express serves the built React app as static files.
// Add this to server.js when running in production mode.
// ============================================================
const path = require("path");
const fs   = require("fs");

/**
 * Mount this AFTER all /api and /files routes in server.js.
 * Serves the Vite-built frontend from ../frontend/dist.
 */
module.exports = function serveFrontend(app) {
  const distPath = path.resolve(__dirname, "../frontend/dist");

  if (!fs.existsSync(distPath)) {
    console.warn("[Frontend] No dist folder found. Run: cd frontend && npm run build");
    return;
  }

  // Serve static assets (JS, CSS, images)
  app.use(require("express").static(distPath));

  // SPA fallback — all non-API routes → index.html
  app.get("*", (req, res) => {
    res.sendFile(path.join(distPath, "index.html"));
  });

  console.log("✅  Serving frontend from", distPath);
};
