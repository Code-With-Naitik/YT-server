// ============================================================
// utils/helpers.js — Shared utilities for URL validation,
//                    cleanup, and yt-dlp path resolution
// ============================================================
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

/**
 * Validate whether a given string is a supported YouTube URL.
 * Supports: youtube.com/watch, youtu.be short links, shorts, live, etc.
 */
function isValidYouTubeUrl(url) {
  try {
    const parsed = new URL(url);
    const validHosts = ["www.youtube.com", "youtube.com", "youtu.be", "m.youtube.com"];
    if (!validHosts.includes(parsed.hostname)) return false;

    // youtu.be/<id>
    if (parsed.hostname === "youtu.be") return parsed.pathname.length > 1;

    // youtube.com/watch?v=<id> | /shorts/<id> | /live/<id> | /embed/<id>
    const validPaths = ["/watch", "/shorts/", "/live/", "/embed/", "/v/"];
    return validPaths.some((p) => parsed.pathname.startsWith(p));
  } catch {
    return false;
  }
}

/**
 * Resolve the yt-dlp binary.
 * Priority: $YT_DLP_PATH env var → PATH → common install locations.
 */
function getYtDlpPath() {
  if (process.env.YT_DLP_PATH) return process.env.YT_DLP_PATH;

  const candidates = ["yt-dlp", "/usr/local/bin/yt-dlp", "/usr/bin/yt-dlp"];
  for (const c of candidates) {
    try {
      execSync(`${c} --version`, { stdio: "ignore" });
      return c;
    } catch {
      // not found, try next
    }
  }
  throw new Error("yt-dlp not found. Install it via: pip install yt-dlp");
}

/**
 * Resolve the ffmpeg binary.
 */
function getFfmpegPath() {
  if (process.env.FFMPEG_PATH) return process.env.FFMPEG_PATH;

  const fs = require("fs");
  const path = require("path");
  const os = require("os");

  // Try winget path on Windows
  if (process.platform === "win32") {
    const wingetPath = path.join(
      os.homedir(),
      "AppData", "Local", "Microsoft", "WinGet", "Packages",
      "Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe",
      "ffmpeg-8.1-full_build", "bin", "ffmpeg.exe"
    );
    if (fs.existsSync(wingetPath)) {
      return wingetPath;
    }
  }

  return "ffmpeg";
}

/**
 * Delete a file safely (no-throw).
 */
function safeUnlink(filePath) {
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch (e) {
    console.warn("[Cleanup] Could not delete", filePath, e.message);
  }
}

/**
 * Schedule a file for deletion after `ttlMs` milliseconds.
 */
function scheduleDeletion(filePath, ttlMs = 5 * 60 * 1000) {
  setTimeout(() => {
    safeUnlink(filePath);
    console.log(`[Cleanup] Deleted temp file: ${path.basename(filePath)}`);
  }, ttlMs);
}

/**
 * Sanitise a video title to a safe filename (no shell-special chars).
 */
function sanitiseFilename(name = "video") {
  return name
    .replace(/[^\w\s\-.()\[\]]/g, "")
    .replace(/\s+/g, "_")
    .slice(0, 120);
}

module.exports = {
  isValidYouTubeUrl,
  getYtDlpPath,
  getFfmpegPath,
  safeUnlink,
  scheduleDeletion,
  sanitiseFilename,
};
