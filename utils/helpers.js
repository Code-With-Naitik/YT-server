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
  if (process.env.YT_DLP_PATH && fs.existsSync(process.env.YT_DLP_PATH)) {
    return process.env.YT_DLP_PATH;
  }

  // 1. Standalone compiled binary in YT-server/bin folder
  const standalonePath = path.resolve(__dirname, "../bin/yt-dlp" + (process.platform === "win32" ? ".exe" : ""));
  if (fs.existsSync(standalonePath)) {
    return standalonePath;
  }

  if (process.platform === "win32") {
    // 2a. Try local virtual environment path in parent workspace root (3 levels up)
    const venvPath3 = path.resolve(__dirname, "../../../.venv/Scripts/yt-dlp.exe");
    if (fs.existsSync(venvPath3)) return venvPath3;

    // 2b. Try local virtual environment path in subfolder root (2 levels up)
    const venvPath2 = path.resolve(__dirname, "../../.venv/Scripts/yt-dlp.exe");
    if (fs.existsSync(venvPath2)) return venvPath2;
  } else {
    // Linux/macOS: pip installs yt-dlp to these locations
    const linuxCandidates = [
      "/usr/local/bin/yt-dlp",
      "/usr/bin/yt-dlp",
      path.join(require("os").homedir(), ".local/bin/yt-dlp"),
    ];
    for (const c of linuxCandidates) {
      if (fs.existsSync(c)) return c;
    }
  }

  // Last resort: try shelling out to PATH
  const candidates = ["yt-dlp"];
  for (const c of candidates) {
    try {
      execSync(`${c} --version`, { stdio: "ignore" });
      return c;
    } catch {
      // not found
    }
  }
  throw new Error("yt-dlp not found. Install it via: pip install yt-dlp");
}

/**
 * Unified execution wrapper for yt-dlp.
 * Bypasses Windows wrapper/execution policy issues by invoking python.exe directly on the venv module if available.
 */
function runYtDlp(args, options, callback) {
  const { execFile } = require("child_process");

  let binary = "yt-dlp";
  let finalArgs = [...args];

  if (process.platform === "win32") {
    // 1. Standalone .exe in bin folder
    const standalonePath = path.resolve(__dirname, "../bin/yt-dlp.exe");
    if (fs.existsSync(standalonePath)) {
      binary = standalonePath;
    } else {
      // 2. Resolve python.exe inside venv
      const pythonPath3 = path.resolve(__dirname, "../../../.venv/Scripts/python.exe");
      const pythonPath2 = path.resolve(__dirname, "../../.venv/Scripts/python.exe");
      if (fs.existsSync(pythonPath3)) {
        binary = pythonPath3;
        finalArgs = ["-m", "yt_dlp", ...args];
      } else if (fs.existsSync(pythonPath2)) {
        binary = pythonPath2;
        finalArgs = ["-m", "yt_dlp", ...args];
      } else if (process.env.YT_DLP_PATH && fs.existsSync(process.env.YT_DLP_PATH)) {
        binary = process.env.YT_DLP_PATH;
      }
    }
  } else {
    // Linux/macOS (Vercel, Render, Railway, etc.)
    // 1. Bundled binary downloaded during build (Vercel vercel-build script)
    const bundledBin = path.resolve(__dirname, "../bin/yt-dlp");
    if (fs.existsSync(bundledBin)) {
      binary = bundledBin;
    } else {
      // 2. pip-installed locations (Render: pip install yt-dlp)
      const linuxCandidates = [
        "/usr/local/bin/yt-dlp",
        "/usr/bin/yt-dlp",
        path.join(require("os").homedir(), ".local/bin/yt-dlp"),
      ];
      for (const c of linuxCandidates) {
        if (fs.existsSync(c)) {
          binary = c;
          break;
        }
      }
      // 3. fallback: rely on PATH
    }
  }

  console.log(`[runYtDlp] Spawning: "${binary}" ${finalArgs.map(a => `"${a}"`).join(" ")}`);
  return execFile(binary, finalArgs, options, callback);
}

/**
 * Auto-update helper for yt-dlp.
 */
function updateYtDlp() {
  runYtDlp(["-U"], {}, (err, stdout, stderr) => {
    if (err) {
      console.warn("[yt-dlp] Auto-update check complete (using cached/prebuilt version).");
    } else {
      console.log("[yt-dlp] Checked for updates:", stdout.trim());
    }
  });
}

function getFfmpegPath() {
  if (process.env.FFMPEG_PATH) return process.env.FFMPEG_PATH;

  const fs = require("fs");
  const path = require("path");
  const os = require("os");

  // 1. Check local dedicated binary in YT-server/bin folder (highest priority!)
  const localFfmpeg = path.resolve(__dirname, `../bin/ffmpeg${process.platform === "win32" ? ".exe" : ""}`);
  if (fs.existsSync(localFfmpeg)) {
    return localFfmpeg;
  }

  // 2. Try winget path on Windows with dynamic subfolder checking
  if (process.platform === "win32") {
    try {
      const wingetBase = path.join(
        os.homedir(),
        "AppData", "Local", "Microsoft", "WinGet", "Packages"
      );
      if (fs.existsSync(wingetBase)) {
        const pkgs = fs.readdirSync(wingetBase);
        const ffmpegPkg = pkgs.find(p => p.toLowerCase().includes("gyan.ffmpeg"));
        if (ffmpegPkg) {
          const pkgPath = path.join(wingetBase, ffmpegPkg);
          const subdirs = fs.readdirSync(pkgPath);
          const buildDir = subdirs.find(d => d.toLowerCase().includes("ffmpeg-"));
          if (buildDir) {
            const exePath = path.join(pkgPath, buildDir, "bin", "ffmpeg.exe");
            if (fs.existsSync(exePath)) {
              return exePath;
            }
          }
        }
      }
    } catch (e) {
      // ignore
    }
  }

  return "ffmpeg";
}

/**
 * Check if ffmpeg is available locally or globally in PATH.
 */
function isFfmpegAvailable() {
  const ffmpeg = getFfmpegPath();
  if (ffmpeg !== "ffmpeg" && ffmpeg.includes("bin")) {
    return true; // Local binary exists
  }
  try {
    const { execSync } = require("child_process");
    execSync("ffmpeg -version", { stdio: "ignore", timeout: 3000 });
    return true;
  } catch {
    // If global ffmpeg check fails, let's double check if getFfmpegPath returned a resolved path
    if (ffmpeg !== "ffmpeg" && require("fs").existsSync(ffmpeg)) {
      return true;
    }
    return false;
  }
}

/**
 * Auto-downloads and extracts a static FFmpeg build for the host operating system if not already present.
 */
function ensureFfmpeg() {
  const fs = require("fs");
  const path = require("path");
  const os = require("os");

  const platform = process.platform;
  const arch = process.arch;

  // Define local target path
  const binDir = path.resolve(__dirname, "../bin");
  if (!fs.existsSync(binDir)) {
    fs.mkdirSync(binDir, { recursive: true });
  }

  const isWin = platform === "win32";
  const localFfmpeg = path.join(binDir, isWin ? "ffmpeg.exe" : "ffmpeg");
  const tempDownloadPath = `${localFfmpeg}.${process.pid}.downloading`;

  // Check if FFmpeg is already locally present and valid (at least 70MB)
  if (fs.existsSync(localFfmpeg)) {
    const stats = fs.statSync(localFfmpeg);
    if (stats.size < 70 * 1024 * 1024) {
      console.warn(`[FFmpeg] Local binary found but is too small (${stats.size} bytes). Likely corrupted. Deleting...`);
      try {
        fs.unlinkSync(localFfmpeg);
      } catch (e) {
        console.error("[FFmpeg] Failed to delete corrupted binary:", e.message);
      }
    } else {
      console.log("[FFmpeg] Dedicated FFmpeg binary is already present locally at:", localFfmpeg);
      return;
    }
  }

  // If there's already a global ffmpeg, we don't necessarily have to download
  try {
    const { execSync } = require("child_process");
    execSync("ffmpeg -version", { stdio: "ignore", timeout: 3000 });
    console.log("[FFmpeg] Global FFmpeg is already available in system PATH.");
    return;
  } catch (e) {
    // proceed to download
  }

  console.log(`[FFmpeg] Dedicated FFmpeg not found. Downloading static build for platform: ${platform}, arch: ${arch}...`);

  // Map platform to release asset filename from eugeneware/ffmpeg-static
  let filename = "";
  if (platform === "win32") {
    if (arch === "x64") filename = "ffmpeg-win32-x64.gz";
  } else if (platform === "linux") {
    if (arch === "x64") filename = "ffmpeg-linux-x64.gz";
    else if (arch === "arm64") filename = "ffmpeg-linux-arm64.gz";
    else if (arch === "arm") filename = "ffmpeg-linux-arm.gz";
    else if (arch === "ia32") filename = "ffmpeg-linux-ia32.gz";
  } else if (platform === "darwin") {
    if (arch === "x64") filename = "ffmpeg-darwin-x64.gz";
    else if (arch === "arm64") filename = "ffmpeg-darwin-arm64.gz";
  }

  if (!filename) {
    console.warn(`[FFmpeg] No prebuilt static binary mapped for platform "${platform}" and arch "${arch}". Please install FFmpeg manually.`);
    return;
  }

  const url = `https://github.com/eugeneware/ffmpeg-static/releases/download/b6.1.1/${filename}`;
  console.log(`[FFmpeg] Source URL: ${url}`);

  const https = require("https");
  const zlib = require("zlib");

  function download(targetUrl) {
    return new Promise((resolve, reject) => {
      function get(u) {
        https.get(u, (res) => {
          if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            return get(res.headers.location);
          }
          if (res.statusCode !== 200) {
            return reject(new Error(`Failed to download: Status ${res.statusCode}`));
          }

          console.log("[FFmpeg] Starting stream pipe with zlib Gunzip...");
          const gunzip = zlib.createGunzip();
          const fileStream = fs.createWriteStream(tempDownloadPath);

          res.pipe(gunzip).pipe(fileStream);

          fileStream.on("finish", () => {
            fileStream.close();
            // Rename temp download path to target path atomically
            try {
              if (fs.existsSync(localFfmpeg)) {
                const stats = fs.statSync(localFfmpeg);
                if (stats.size >= 70 * 1024 * 1024) {
                  console.log("[FFmpeg] Another process completed the download first. Deleting temp file.");
                  try { fs.unlinkSync(tempDownloadPath); } catch (e) {}
                  resolve();
                  return;
                }
                fs.unlinkSync(localFfmpeg);
              }
              fs.renameSync(tempDownloadPath, localFfmpeg);
              // Set executable permission
              fs.chmodSync(localFfmpeg, 0o755);
              resolve();
            } catch (renameErr) {
              reject(renameErr);
            }
          });

          fileStream.on("error", (err) => {
            fs.unlink(tempDownloadPath, () => {});
            reject(err);
          });

          gunzip.on("error", (err) => {
            fs.unlink(tempDownloadPath, () => {});
            reject(err);
          });
        }).on("error", reject);
      }
      get(targetUrl);
    });
  }

  download(url)
    .then(() => {
      console.log(`[FFmpeg] Successfully downloaded and extracted dedicated binary to: ${localFfmpeg}`);
    })
    .catch((err) => {
      console.error(`[FFmpeg] Failed to download/extract dedicated binary: ${err.message}`);
      try {
        fs.unlinkSync(tempDownloadPath);
      } catch (e) {}
    });
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
  runYtDlp,
  updateYtDlp,
  getFfmpegPath,
  isFfmpegAvailable,
  ensureFfmpeg,
  safeUnlink,
  scheduleDeletion,
  sanitiseFilename,
};
