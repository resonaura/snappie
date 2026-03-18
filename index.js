import express from "express";
import fs from "fs";
import path from "path";
import { execFile } from "child_process";
import yaml from "js-yaml";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const CONFIG_PATH =
  process.env.CONFIG_PATH || path.join(__dirname, "config.yaml");

function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    console.error(`❌ Config file not found: ${CONFIG_PATH}`);
    process.exit(1);
  }
  const raw = fs.readFileSync(CONFIG_PATH, "utf8");
  const cfg = yaml.load(raw);

  if (!Array.isArray(cfg.cameras) || cfg.cameras.length === 0) {
    console.error("❌ No cameras defined in config.yaml");
    process.exit(1);
  }

  for (const cam of cfg.cameras) {
    if (!cam.slug || !cam.rtsp) {
      console.error('❌ Each camera must have "slug" and "rtsp" fields');
      process.exit(1);
    }
    if (!/^[a-z0-9_-]+$/.test(cam.slug)) {
      console.error(
        `❌ Invalid slug "${cam.slug}". Use only lowercase letters, digits, _ and -`,
      );
      process.exit(1);
    }
  }

  return {
    port: cfg.port || 1985,
    interval: Math.max(1, cfg.interval || 10),
    cameras: cfg.cameras,
  };
}

const config = loadConfig();

// ---------------------------------------------------------------------------
// Snapshots directory
// ---------------------------------------------------------------------------

const SNAPSHOT_DIR = path.join(__dirname, "snapshots");
if (!fs.existsSync(SNAPSHOT_DIR)) {
  fs.mkdirSync(SNAPSHOT_DIR, { recursive: true });
}

// ---------------------------------------------------------------------------
// FFmpeg snapshot capture
// ---------------------------------------------------------------------------

// State per camera: last success timestamp + last error message
const cameraState = {};
for (const cam of config.cameras) {
  cameraState[cam.slug] = {
    lastSuccess: null,
    lastError: null,
    capturing: false,
  };
}

function captureSnapshot(cam) {
  const state = cameraState[cam.slug];
  if (state.capturing) return; // skip if previous ffmpeg is still running

  state.capturing = true;
  const outPath = path.join(SNAPSHOT_DIR, `${cam.slug}.jpg`);
  const tmpPath = `${outPath}.tmp`;

  // ffmpeg args:
  //   -rtsp_transport tcp   — more reliable over TCP
  //   -frames:v 1           — grab exactly one frame
  //   -q:v 2                — JPEG quality (2 = high)
  //   -y                    — overwrite tmp file
  const args = [
    "-loglevel",
    "error",
    "-rtsp_transport",
    "tcp",
    "-i",
    cam.rtsp,
    "-frames:v",
    "1",
    "-q:v",
    "2",
    "-f",
    "image2",
    "-y",
    tmpPath,
  ];

  execFile("ffmpeg", args, { timeout: 30_000 }, (err) => {
    state.capturing = false;
    if (err) {
      state.lastError = err.message || String(err);
      console.error(`❌ [${cam.slug}] FFmpeg error: ${state.lastError}`);
      return;
    }
    try {
      fs.renameSync(tmpPath, outPath);
      state.lastSuccess = new Date().toISOString();
      state.lastError = null;
      console.log(`✅ [${cam.slug}] Snapshot updated at ${state.lastSuccess}`);
    } catch (renameErr) {
      state.lastError = renameErr.message;
      console.error(
        `❌ [${cam.slug}] Failed to save snapshot: ${state.lastError}`,
      );
    }
  });
}

function scheduleSnapshots() {
  // Immediate capture on startup
  for (const cam of config.cameras) {
    captureSnapshot(cam);
  }

  setInterval(() => {
    for (const cam of config.cameras) {
      captureSnapshot(cam);
    }
  }, config.interval * 1000);
}

scheduleSnapshots();

// ---------------------------------------------------------------------------
// HTTP server
// ---------------------------------------------------------------------------

const app = express();

// GET /:slug — serve latest snapshot
for (const cam of config.cameras) {
  app.get(`/${cam.slug}`, (req, res) => {
    const filePath = path.join(SNAPSHOT_DIR, `${cam.slug}.jpg`);
    if (fs.existsSync(filePath)) {
      res.setHeader("Content-Type", "image/jpeg");
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      res.sendFile(filePath);
    } else {
      res.status(503).json({
        error: "Snapshot not ready yet",
        slug: cam.slug,
        lastError: cameraState[cam.slug].lastError,
      });
    }
  });
}

// GET /health — status of all cameras
app.get("/health", (req, res) => {
  const result = config.cameras.map((cam) => ({
    slug: cam.slug,
    lastSuccess: cameraState[cam.slug].lastSuccess,
    lastError: cameraState[cam.slug].lastError,
    snapshotReady: fs.existsSync(path.join(SNAPSHOT_DIR, `${cam.slug}.jpg`)),
  }));
  res.json({ status: "ok", interval: config.interval, cameras: result });
});

// 404 for anything else
app.use((req, res) => {
  const slugs = config.cameras.map((c) => `/${c.slug}`);
  res
    .status(404)
    .json({ error: "Not found", availableEndpoints: ["/health", ...slugs] });
});

app.listen(config.port, () => {
  console.log(`\n🚀 snappie running on http://0.0.0.0:${config.port}`);
  console.log(`   interval : ${config.interval}s`);
  console.log("   cameras  :");
  for (const cam of config.cameras) {
    console.log(
      `     → http://localhost:${config.port}/${cam.slug}  (${cam.rtsp})`,
    );
  }
  console.log(`   health   : http://localhost:${config.port}/health\n`);
});
