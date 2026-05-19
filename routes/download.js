// ============================================================
// routes/download.js — POST /api/download
// Downloads the requested YouTube video/audio via yt-dlp,
// optionally converts it with ffmpeg, then serves the file.
// ============================================================
const express = require("express");
const { execFile } = require("child_process");
const path = require("path");
const fs = require("fs");
const { v4: uuidv4 } = require("uuid");
const rateLimit = require("express-rate-limit");

const {
  isValidYouTubeUrl,
  runYtDlp,
  getFfmpegPath,
  isFfmpegAvailable,
  sanitiseFilename,
  scheduleDeletion,
} = require("../utils/helpers");

const router = express.Router();

// Download-specific rate limit (heavier operation)
const downloadLimiter = rateLimit({
  windowMs: 60 * 1000,    // 1 minute
  max: 5,                  // max 5 downloads per minute per IP
  message: { error: "Too many download requests. Please wait a moment." },
});

const TEMP_DIR   = path.resolve(process.env.TEMP_DIR || "./temp");
const MAX_MB     = Number(process.env.MAX_FILE_SIZE_MB) || 500;
const FILE_TTL   = Number(process.env.FILE_TTL_MS)      || 5 * 60 * 1000;

/**
 * POST /api/download
 * Body: { url, format, quality }
 *   format  : "mp4" | "mp3"
 *   quality : e.g. "1080" for mp4 or "192" for mp3
 */
router.post("/download", downloadLimiter, async (req, res) => {
  const { url, format = "mp4", quality = "720", title } = req.body;

  // ── Validate inputs ───────────────────────────────────────
  if (!url || !isValidYouTubeUrl(url.trim())) {
    return res.status(400).json({ error: "Invalid or missing YouTube URL." });
  }
  if (!["mp4", "mp3"].includes(format)) {
    return res.status(400).json({ error: "Format must be mp4 or mp3." });
  }

  const jobId    = uuidv4();
  const outName  = `${jobId}.${format}`;
  const outPath  = path.join(TEMP_DIR, outName);

  try {
    const ffmpeg = getFfmpegPath();
    const hasFfmpeg = isFfmpegAvailable();

    if (format === "mp3" && !hasFfmpeg) {
      return res.status(400).json({
        error: "FFmpeg is not installed on your system. Audio conversion (MP3) requires FFmpeg. Please download as MP4 instead.",
      });
    }

    // Build yt-dlp arguments based on format and ffmpeg presence
    const args = buildArgs({ url: url.trim(), format, quality, outPath, ffmpeg, hasFfmpeg });

    console.log(`[Download] Job ${jobId} — format=${format} quality=${quality}`);

    runYtDlp(args, { timeout: 3 * 60 * 1000 }, (err, stdout, stderr) => {
      if (err) {
        console.error(`[Download] Job ${jobId} failed:`, stderr || err.message);
        return res.status(500).json({
          error: "Download failed. The video may be unavailable or geo-restricted.",
        });
      }

      // ── Verify file exists and check size ─────────────────
      if (!fs.existsSync(outPath)) {
        return res.status(500).json({ error: "Output file not created." });
      }

      const { size } = fs.statSync(outPath);
      const sizeMb = size / (1024 * 1024);

      if (sizeMb > MAX_MB) {
        fs.unlinkSync(outPath);
        return res.status(413).json({
          error: `File exceeds the ${MAX_MB} MB limit.`,
        });
      }

      // Schedule auto-cleanup
      scheduleDeletion(outPath, FILE_TTL);

      console.log(`[Download] Job ${jobId} ready — ${sizeMb.toFixed(1)} MB`);

      // Return a download URL the client can hit
      res.json({
        downloadUrl: `/files/${outName}?title=${encodeURIComponent(title || "video")}`,
        filename: outName,
        sizeMb: sizeMb.toFixed(2),
        expiresIn: FILE_TTL / 1000,  // seconds
      });
    });
  } catch (e) {
    console.error("[Download] Setup error:", e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── Argument builder ──────────────────────────────────────────

function buildArgs({ url, format, quality, outPath, ffmpeg, hasFfmpeg }) {
  const numericQuality = String(quality).replace(/[^0-9]/g, "") || (format === "mp3" ? "192" : "1080");
  
  // Resolve directory and filename base to construct the proper dynamic extension template
  const outDir = path.dirname(outPath);
  const outBase = path.basename(outPath, path.extname(outPath));
  const templatePath = path.join(outDir, `${outBase}.%(ext)s`);

  if (format === "mp3") {
    // Extract audio and convert to MP3 at requested bitrate
    return [
      "--no-playlist",
      "--no-warnings",
      "--extract-audio",
      "--audio-format", "mp3",
      "--audio-quality", `${numericQuality}K`,   // e.g. "192K"
      "--ffmpeg-location", ffmpeg,
      "-o", templatePath,
      url,
    ];
  }

  // MP4: If FFmpeg is available, merge best video + best audio
  if (hasFfmpeg) {
    return [
      "--no-playlist",
      "--no-warnings",
      "-f", `bestvideo[height<=${numericQuality}]+bestaudio[ext=m4a]/bestvideo[height<=${numericQuality}]+bestaudio/best[height<=${numericQuality}]/best`,
      "--merge-output-format", "mp4",
      "--ffmpeg-location", ffmpeg,
      "-o", templatePath,
      url,
    ];
  }

  // MP4 Fallback: If FFmpeg is NOT available, download pre-merged combined format directly (no merge required)
  return [
    "--no-playlist",
    "--no-warnings",
    "-f", `best[height<=${numericQuality}][ext=mp4]/best`,
    "-o", templatePath,
    url,
  ];
}

module.exports = router;
