// ============================================================
// routes/info.js — POST /api/info
// Fetches video metadata (title, thumbnail, formats) via yt-dlp
// without downloading the actual media file.
// ============================================================
const express = require("express");
const rateLimit = require("express-rate-limit");
const { isValidYouTubeUrl, runYtDlp } = require("../utils/helpers");

const router = express.Router();

// Stricter rate limit for info endpoint (cheaper but still abusable)
const infoLimiter = rateLimit({
  windowMs: 60 * 1000,     // 1 minute
  max: 30,
  message: { error: "Too many info requests. Slow down." },
});

/**
 * POST /api/info
 * Body: { url: string }
 * Returns video title, thumbnail, duration, and available formats.
 */
router.post("/info", infoLimiter, async (req, res) => {
  const { url } = req.body;

  // ── Validate ──────────────────────────────────────────────
  if (!url || typeof url !== "string") {
    return res.status(400).json({ error: "URL is required." });
  }
  if (!isValidYouTubeUrl(url.trim())) {
    return res.status(400).json({ error: "Invalid or unsupported YouTube URL." });
  }

  try {
    // Fetch JSON metadata only — no download
    const args = [
      "--dump-json",
      "--no-playlist",
      "--no-warnings",
      "--skip-download",
      url.trim(),
    ];

    runYtDlp(args, { timeout: 20000 }, (err, stdout, stderr) => {
      if (err) {
        console.error("[Info] yt-dlp error:", stderr || err.message);
        const msg =
          stderr.includes("Video unavailable") || stderr.includes("Private video")
            ? "Video is unavailable or private."
            : "Could not fetch video info. Check the URL and try again.";
        return res.status(400).json({ error: msg });
      }

      try {
        const meta = JSON.parse(stdout);

        // The frontend expects the raw format array to build its UI
        const formats = meta.formats || [];

        res.json({
          title: meta.title,
          thumbnail: meta.thumbnail,
          duration: meta.duration,         // seconds
          channel: meta.uploader,
          viewCount: meta.view_count,
          uploadDate: meta.upload_date,    // YYYYMMDD
          formats,
        });
      } catch (parseErr) {
        console.error("[Info] JSON parse error:", parseErr.message);
        res.status(500).json({ error: "Failed to parse video metadata." });
      }
    });
  } catch (e) {
    console.error("[Info] Setup error:", e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── Helpers ───────────────────────────────────────────────────

/**
 * Extract a clean, deduplicated list of available qualities.
 * Returns separate mp4 video and audio-only (mp3) entries.
 */
function buildFormatList(rawFormats) {
  // Video qualities to surface. Included 1024 and 1080 to satisfy user request.
  const videoHeights = [2160, 1440, 1080, 1024, 720, 480, 360, 240, 144];

  // We only check for vcodec !== "none" because yt-dlp will merge video and audio via ffmpeg
  const videoFormats = videoHeights
    .filter((h) =>
      rawFormats.some(
        (f) => f.height === h && f.vcodec !== "none"
      )
    )
    .map((h) => ({ label: `${h}p`, value: `${h}`, type: "mp4" }));

  // Always offer MP3 audio extraction
  const audioFormats = [
    { label: "MP3 128kbps", value: "128", type: "mp3" },
    { label: "MP3 192kbps", value: "192", type: "mp3" },
    { label: "MP3 320kbps", value: "320", type: "mp3" },
  ];

  return { video: videoFormats, audio: audioFormats };
}

router.get("/test-ffmpeg", async (req, res) => {
  const { execSync } = require("child_process");
  const { getFfmpegPath } = require("../utils/helpers");
  try {
    const ffmpegPath = getFfmpegPath();
    const output = execSync(`"${ffmpegPath}" -version`, { encoding: "utf8", timeout: 3000 });
    res.json({ status: "success", ffmpegPath, output: output.split("\n")[0] });
  } catch (err) {
    res.json({ status: "error", message: err.message, stderr: err.stderr, stack: err.stack });
  }
});

router.get("/check-disk", async (req, res) => {
  const { execSync } = require("child_process");
  try {
    const output = execSync("wmic logicaldisk get caption,size,freespace", { encoding: "utf8" });
    res.json({ status: "success", output });
  } catch (err) {
    res.json({ status: "error", message: err.message, stack: err.stack });
  }
});
module.exports = router;
