// ============================================================
// routes/admin.js — Admin authentication and dashboard APIs
// ============================================================
const express = require("express");
const fs = require("fs");
const path = require("path");
const os = require("os");
const router = express.Router();

const USERS_FILE = path.resolve(__dirname, "../users.json");
const TEMP_DIR = path.resolve(__dirname, "../temp");

// Load users from file
function loadUsers() {
  if (!fs.existsSync(USERS_FILE)) {
    // Default admin user if file doesn't exist
    const defaultUsers = [{ username: "admin", password: "password123" }];
    fs.writeFileSync(USERS_FILE, JSON.stringify(defaultUsers, null, 2), "utf8");
    return defaultUsers;
  }
  try {
    return JSON.parse(fs.readFileSync(USERS_FILE, "utf8"));
  } catch (e) {
    return [];
  }
}

// Save users to file
function saveUsers(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), "utf8");
}

// Helper to get cache directory details
function getCacheStats() {
  if (!fs.existsSync(TEMP_DIR)) return { count: 0, sizeMb: 0 };
  const files = fs.readdirSync(TEMP_DIR);
  let totalSize = 0;
  let fileCount = 0;
  
  for (const file of files) {
    const filePath = path.join(TEMP_DIR, file);
    try {
      const stat = fs.statSync(filePath);
      if (stat.isFile()) {
        totalSize += stat.size;
        fileCount++;
      }
    } catch (e) {}
  }
  
  return {
    count: fileCount,
    sizeMb: parseFloat((totalSize / (1024 * 1024)).toFixed(2))
  };
}

// ── Admin Register ───────────────────────────────────────────
router.post("/admin/register", (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: "Username and password are required." });
  }

  const users = loadUsers();
  const exists = users.find(u => u.username.toLowerCase() === username.toLowerCase());
  if (exists) {
    return res.status(400).json({ error: "Username already exists." });
  }

  users.push({ username, password });
  saveUsers(users);

  res.json({ message: "Registration successful! You can now log in." });
});

// ── Admin Login ──────────────────────────────────────────────
router.post("/admin/login", (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: "Username and password are required." });
  }

  const users = loadUsers();
  const user = users.find(
    u => u.username.toLowerCase() === username.toLowerCase() && u.password === password
  );

  if (!user) {
    return res.status(401).json({ error: "Invalid username or password." });
  }

  // Return a mock token for frontend state management
  res.json({
    token: `mock-jwt-token-for-${username}-${Date.now()}`,
    username: user.username
  });
});

// ── Admin Stats ──────────────────────────────────────────────
router.get("/admin/stats", (req, res) => {
  // Extract system information
  const freeMem = os.freemem();
  const totalMem = os.totalmem();
  const usedMem = totalMem - freeMem;
  const memoryUsage = parseFloat(((usedMem / totalMem) * 100).toFixed(1));

  const cpus = os.cpus();
  const cpuModel = cpus.length > 0 ? cpus[0].model : "Unknown CPU";

  const cache = getCacheStats();

  res.json({
    cacheCount: cache.count,
    cacheSizeMb: cache.sizeMb,
    system: {
      platform: os.platform() === "win32" ? "Windows" : os.platform(),
      arch: os.arch(),
      cpuModel,
      cpuCores: cpus.length,
      memoryUsage,
      uptime: Math.floor(os.uptime())
    }
  });
});

// ── Admin Clear Cache ────────────────────────────────────────
router.post("/admin/clear-cache", (req, res) => {
  if (!fs.existsSync(TEMP_DIR)) {
    return res.json({ message: "Cache directory is already empty." });
  }

  const files = fs.readdirSync(TEMP_DIR);
  let deletedCount = 0;

  for (const file of files) {
    const filePath = path.join(TEMP_DIR, file);
    try {
      fs.unlinkSync(filePath);
      deletedCount++;
    } catch (e) {
      console.error(`[Admin] Failed to delete cache file ${file}:`, e.message);
    }
  }

  res.json({ message: `Successfully cleared ${deletedCount} cached files from temp directory.` });
});

module.exports = router;
