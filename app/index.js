import express from "express";
import fs from "fs";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import yaml from "js-yaml";
import { fileURLToPath } from "url";
import http from "http";
import https from "https";

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// ANSI Terminal Colors & Beautiful Logger
// ---------------------------------------------------------------------------

const c = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
  gray: "\x1b[90m",
  bgBlue: "\x1b[44m\x1b[37m",
  bgCyan: "\x1b[46m\x1b[30m",
  bgMagenta: "\x1b[45m\x1b[37m",
  bgGreen: "\x1b[42m\x1b[30m",
  bgYellow: "\x1b[43m\x1b[30m",
  bgRed: "\x1b[41m\x1b[37m",
};

function getTimestamp() {
  const d = new Date();
  const pad = (n, l = 2) => String(n).padStart(l, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
}

function getHwaccelBadge(type) {
  switch (type?.toLowerCase()) {
    case "cuda":
      return `${c.magenta}${c.bold}⚡ [CUDA]${c.reset}`;
    case "vaapi":
      return `${c.cyan}${c.bold}🚀 [VAAPI]${c.reset}`;
    case "qsv":
      return `${c.blue}${c.bold}🔷 [QSV]${c.reset}`;
    case "videotoolbox":
      return `${c.yellow}${c.bold}🍎 [VTOOLBOX]${c.reset}`;
    case "http":
      return `${c.green}${c.bold}🌐 [HTTP]${c.reset}`;
    default:
      return `${c.gray}⚙️  [CPU]${c.reset}`;
  }
}

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

function maskUrl(urlStr) {
  if (!urlStr) return "";
  return urlStr.replace(/:\/\/([^:]+):([^@]+)@/, "://$1:****@");
}

const logger = {
  info: (msg) => console.log(`${c.dim}[${getTimestamp()}]${c.reset} ${c.blue}ℹ️ ${c.reset} ${msg}`),
  success: (slug, hwaccel, durationMs, sizeBytes) => {
    const badge = getHwaccelBadge(hwaccel);
    const dur = durationMs < 1000 ? `${c.green}${durationMs}ms${c.reset}` : `${c.yellow}${durationMs}ms${c.reset}`;
    const size = `${c.dim}(${formatBytes(sizeBytes)})${c.reset}`;
    console.log(
      `${c.dim}[${getTimestamp()}]${c.reset} ${c.green}✅${c.reset} ${c.bold}[${slug}]${c.reset} ${badge} ${dur} ${size}`
    );
  },
  warn: (slug, msg) => {
    console.log(`${c.dim}[${getTimestamp()}]${c.reset} ${c.yellow}⚠️  [${slug}]${c.reset} ${msg}`);
  },
  error: (slug, msg) => {
    console.log(`${c.dim}[${getTimestamp()}]${c.reset} ${c.red}❌ [${slug}]${c.reset} ${c.red}${msg}${c.reset}`);
  },
  sys: (msg) => console.log(`${c.dim}[${getTimestamp()}]${c.reset} ${c.cyan}⚙️ ${c.reset} ${msg}`),
};

// ---------------------------------------------------------------------------
// Hardware Acceleration Discovery & Testing
// ---------------------------------------------------------------------------

let availableHwaccels = [];
let systemDefaultHwaccel = "cpu";

async function detectHwaccels() {
  try {
    const { stdout } = await execFileAsync("ffmpeg", ["-hwaccels"]);
    const lines = stdout.split("\n").map((l) => l.trim().toLowerCase());
    const hwList = [];

    for (const hw of ["cuda", "vaapi", "qsv", "videotoolbox", "vdpau", "drm", "opencl", "vulkan"]) {
      if (lines.includes(hw)) {
        hwList.push(hw);
      }
    }
    availableHwaccels = hwList;

    // Check device / runtime availability
    if (hwList.includes("cuda")) {
      systemDefaultHwaccel = "cuda";
    } else if (hwList.includes("vaapi") && fs.existsSync("/dev/dri/renderD128")) {
      systemDefaultHwaccel = "vaapi";
    } else if (hwList.includes("videotoolbox")) {
      systemDefaultHwaccel = "videotoolbox";
    } else if (hwList.includes("qsv")) {
      systemDefaultHwaccel = "qsv";
    } else {
      systemDefaultHwaccel = "cpu";
    }
  } catch (err) {
    logger.warn("system", `FFmpeg probe warning: ${err.message}. Defaulting to CPU.`);
    availableHwaccels = [];
    systemDefaultHwaccel = "cpu";
  }
}

// ---------------------------------------------------------------------------
// Configuration Loader
// ---------------------------------------------------------------------------

const CONFIG_PATH = process.env.CONFIG_PATH || path.join(__dirname, "config.yaml");

function loadConfig() {
  let cfg = {};

  if (fs.existsSync("/data/options.json")) {
    try {
      cfg = JSON.parse(fs.readFileSync("/data/options.json", "utf8"));
      logger.sys("Loaded Home Assistant add-on options from /data/options.json");
    } catch (err) {
      console.error(`❌ Failed to parse /data/options.json: ${err.message}`);
      process.exit(1);
    }
  } else if (fs.existsSync(CONFIG_PATH)) {
    const raw = fs.readFileSync(CONFIG_PATH, "utf8");
    cfg = yaml.load(raw) || {};
  } else if (fs.existsSync(path.join(__dirname, "config.yaml"))) {
    const raw = fs.readFileSync(path.join(__dirname, "config.yaml"), "utf8");
    cfg = yaml.load(raw) || {};
  } else if (fs.existsSync(path.join(process.cwd(), "config.yaml"))) {
    const raw = fs.readFileSync(path.join(process.cwd(), "config.yaml"), "utf8");
    cfg = yaml.load(raw) || {};
  } else {
    console.error(`❌ Config file not found: checked /data/options.json, ${CONFIG_PATH}`);
    process.exit(1);
  }

  if (!Array.isArray(cfg.cameras) || cfg.cameras.length === 0) {
    console.error("❌ No cameras defined in config");
    process.exit(1);
  }

  for (const cam of cfg.cameras) {
    const rawSlug = cam.slug || cam.name || "";
    const slug = String(rawSlug).trim().toLowerCase().replace(/[^a-z0-9_-]/g, "-");
    const source = cam.rtsp || cam.url;

    if (!slug || !source) {
      console.error('❌ Each camera must have "slug" (or "name") and "rtsp" (or "url") fields');
      process.exit(1);
    }
    cam.slug = slug;
    cam.source = source;
  }

  return {
    port: parseInt(process.env.PORT || cfg.port || 1985, 10),
    interval: Math.max(1, parseInt(cfg.interval || 10, 10)),
    hwaccel: process.env.HWACCEL || cfg.hwaccel || "auto",
    quality: parseInt(cfg.quality || 2, 10),
    timeout: parseInt(cfg.timeout || 15, 10),
    probesize: parseInt(cfg.probesize || 32768, 10),
    analyzeduration: parseInt(cfg.analyzeduration || 1000000, 10),
    transport: cfg.rtsp_transport || "tcp",
    saveToDisk: Boolean(cfg.save_to_disk || false),
    maxConcurrent: Math.max(1, parseInt(cfg.max_concurrent || 4, 10)),
    cameras: cfg.cameras,
  };
}

const config = loadConfig();

// ---------------------------------------------------------------------------
// Snapshots Storage & Concurrency Queue
// ---------------------------------------------------------------------------

const SNAPSHOT_DIR = path.join(__dirname, "snapshots");
if (config.saveToDisk && !fs.existsSync(SNAPSHOT_DIR)) {
  fs.mkdirSync(SNAPSHOT_DIR, { recursive: true });
}

class ConcurrencyLimiter {
  constructor(max) {
    this.max = max;
    this.running = 0;
    this.queue = [];
  }

  async run(fn) {
    if (this.running >= this.max) {
      await new Promise((resolve) => this.queue.push(resolve));
    }
    this.running++;
    try {
      return await fn();
    } finally {
      this.running--;
      if (this.queue.length > 0) {
        const next = this.queue.shift();
        next();
      }
    }
  }
}

const limiter = new ConcurrencyLimiter(config.maxConcurrent);

// State per camera
const cameraState = {};
for (const cam of config.cameras) {
  cameraState[cam.slug] = {
    buffer: null,
    sizeBytes: 0,
    lastSuccess: null,
    lastError: null,
    lastDurationMs: null,
    capturing: false,
    successCount: 0,
    errorCount: 0,
    activeHwaccel: "cpu",
    cpuFallbackUntil: 0,
    totalDurationMs: 0,
  };
}

function resolveCameraHwaccel(cam) {
  const state = cameraState[cam.slug];
  // Check if camera is currently in CPU fallback cooldown
  if (state && state.cpuFallbackUntil > Date.now()) {
    return "cpu";
  }

  const requested = (cam.hwaccel || config.hwaccel || "auto").toLowerCase();
  if (requested === "auto") {
    return systemDefaultHwaccel;
  }
  if (requested === "off" || requested === "none" || requested === "cpu") {
    return "cpu";
  }
  if (availableHwaccels.includes(requested)) {
    return requested;
  }
  return "cpu";
}

// ---------------------------------------------------------------------------
// Native HTTP / Snapshot Direct Downloader
// ---------------------------------------------------------------------------

function fetchHttpSnapshot(urlStr, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const client = urlStr.startsWith("https") ? https : http;
    const req = client.get(urlStr, { timeout: timeoutMs }, (res) => {
      if (res.statusCode < 200 || res.statusCode >= 300) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`));
      }
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => resolve(Buffer.concat(chunks)));
    });

    req.on("timeout", () => {
      req.destroy();
      reject(new Error(`HTTP request timed out after ${timeoutMs}ms`));
    });

    req.on("error", (err) => reject(err));
  });
}

// ---------------------------------------------------------------------------
// FFmpeg Snapshot Pipeline (In-Memory Pipe & Zero Disk I/O)
// ---------------------------------------------------------------------------

function buildFfmpegArgs(sourceUrl, hwaccel, cam) {
  const quality = String(cam.quality || config.quality || 2);
  const probesize = String(cam.probesize || config.probesize || 32768);
  const analyzeduration = String(cam.analyzeduration || config.analyzeduration || 1000000);
  const transport = cam.transport || config.transport || "tcp";

  const args = ["-loglevel", "error"];

  // Hardware acceleration setup
  if (hwaccel === "cuda") {
    args.push("-hwaccel", "cuda");
  } else if (hwaccel === "vaapi") {
    args.push("-hwaccel", "vaapi");
    const device = cam.hwaccel_device || "/dev/dri/renderD128";
    if (fs.existsSync(device)) {
      args.push("-hwaccel_device", device);
    }
  } else if (hwaccel === "videotoolbox") {
    args.push("-hwaccel", "videotoolbox");
  } else if (hwaccel === "qsv") {
    args.push("-hwaccel", "qsv");
  }

  // Low latency & fast probe tuning
  args.push(
    "-rtsp_transport", transport,
    "-fflags", "nobuffer+discardcorrupt",
    "-flags", "low_delay",
    "-probesize", probesize,
    "-analyzeduration", analyzeduration,
    "-i", sourceUrl,
    "-vframes", "1",
    "-q:v", quality,
    "-f", "image2",
    "-c:v", "mjpeg",
    "pipe:1"
  );

  return args;
}

function isValidJpeg(buf) {
  return (
    buf &&
    buf.length > 100 &&
    buf[0] === 0xff &&
    buf[1] === 0xd8 &&
    buf[buf.length - 2] === 0xff &&
    buf[buf.length - 1] === 0xd9
  );
}

async function executeFfmpegCapture(sourceUrl, hwaccel, cam, timeoutMs) {
  const args = buildFfmpegArgs(sourceUrl, hwaccel, cam);

  return new Promise((resolve, reject) => {
    execFile(
      "ffmpeg",
      args,
      {
        timeout: timeoutMs,
        maxBuffer: 25 * 1024 * 1024,
        encoding: "buffer",
        windowsHide: true,
      },
      (err, stdout, stderr) => {
        if (err) {
          const errMsg = stderr ? stderr.toString("utf8").trim() : err.message;
          return reject(new Error(errMsg || err.message));
        }
        if (!stdout || stdout.length === 0) {
          return reject(new Error("FFmpeg returned empty stream buffer"));
        }
        if (!isValidJpeg(stdout)) {
          return reject(new Error("Received incomplete or corrupted JPEG frame"));
        }
        resolve(stdout);
      }
    );
  });
}

async function captureSnapshot(cam) {
  const state = cameraState[cam.slug];
  if (state.capturing) return; // Skip if previous capture for this camera is in-flight

  state.capturing = true;
  const startTime = Date.now();
  const timeoutMs = (cam.timeout || config.timeout || 15) * 1000;
  const isHttp = cam.source.startsWith("http://") || cam.source.startsWith("https://");

  await limiter.run(async () => {
    let hwaccelUsed = isHttp ? "http" : resolveCameraHwaccel(cam);

    try {
      let imageBuffer;

      if (isHttp) {
        imageBuffer = await fetchHttpSnapshot(cam.source, timeoutMs);
      } else {
        try {
          imageBuffer = await executeFfmpegCapture(cam.source, hwaccelUsed, cam, timeoutMs);
        } catch (hwErr) {
          // Graceful fallback to CPU if GPU acceleration fails
          if (hwaccelUsed !== "cpu") {
            logger.warn(
              cam.slug,
              `${hwaccelUsed.toUpperCase()} capture failed (${hwErr.message.slice(0, 80)}...). Retrying on CPU...`
            );
            state.cpuFallbackUntil = Date.now() + 60_000; // Cooldown 1 min
            hwaccelUsed = "cpu";
            imageBuffer = await executeFfmpegCapture(cam.source, "cpu", cam, timeoutMs);
          } else {
            throw hwErr;
          }
        }
      }

      const durationMs = Date.now() - startTime;

      // Update state in memory
      state.buffer = imageBuffer;
      state.sizeBytes = imageBuffer.length;
      state.lastSuccess = new Date().toISOString();
      state.lastError = null;
      state.lastDurationMs = durationMs;
      state.activeHwaccel = hwaccelUsed;
      state.successCount++;
      state.totalDurationMs += durationMs;

      // Optional disk persistence
      if (config.saveToDisk) {
        const outPath = path.join(SNAPSHOT_DIR, `${cam.slug}.jpg`);
        fs.writeFile(outPath, imageBuffer, (writeErr) => {
          if (writeErr) logger.warn(cam.slug, `Failed to write snapshot to disk: ${writeErr.message}`);
        });
      }

      logger.success(cam.slug, hwaccelUsed, durationMs, imageBuffer.length);
    } catch (err) {
      const durationMs = Date.now() - startTime;
      state.lastError = err.message || String(err);
      state.errorCount++;
      logger.error(cam.slug, `Snapshot failed (${durationMs}ms): ${state.lastError}`);
    } finally {
      state.capturing = false;
    }
  });
}

// ---------------------------------------------------------------------------
// Staggered Scheduling (Even Workload Distribution)
// ---------------------------------------------------------------------------

function scheduleSnapshots() {
  const totalCams = config.cameras.length;
  const intervalMs = config.interval * 1000;
  const stepMs = Math.min(1000, Math.floor(intervalMs / totalCams));

  config.cameras.forEach((cam, index) => {
    // Initial staggered launch
    const initialDelay = index * stepMs;
    setTimeout(() => {
      captureSnapshot(cam);

      // Recurring interval
      setInterval(() => {
        captureSnapshot(cam);
      }, intervalMs);
    }, initialDelay);
  });
}

// ---------------------------------------------------------------------------
// HTTP Server & High-Performance In-Memory Delivery
// ---------------------------------------------------------------------------

const app = express();
app.disable("x-powered-by");

// Snapshot endpoints
for (const cam of config.cameras) {
  app.get(`/${cam.slug}`, (req, res) => {
    const state = cameraState[cam.slug];

    if (state.buffer) {
      const etag = `W/"${state.lastSuccess}-${state.sizeBytes}"`;

      // Conditional HTTP Caching (304 Not Modified)
      if (req.headers["if-none-match"] === etag) {
        return res.status(304).end();
      }

      res.setHeader("Content-Type", "image/jpeg");
      res.setHeader("Content-Length", state.sizeBytes);
      res.setHeader("ETag", etag);
      res.setHeader("Last-Modified", new Date(state.lastSuccess).toUTCString());
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      res.setHeader("X-Snapshot-Time", state.lastSuccess);
      res.setHeader("X-Snapshot-Duration-Ms", state.lastDurationMs);
      res.setHeader("X-Snapshot-Hwaccel", state.activeHwaccel);
      return res.end(state.buffer);
    }

    res.status(503).json({
      error: "Snapshot not ready yet",
      slug: cam.slug,
      capturing: state.capturing,
      lastError: state.lastError,
    });
  });
}

// On-demand force-refresh endpoint
app.get("/live/:slug", async (req, res) => {
  const cam = config.cameras.find((c) => c.slug === req.params.slug);
  if (!cam) {
    return res.status(404).json({ error: `Camera "${req.params.slug}" not found` });
  }

  await captureSnapshot(cam);
  const state = cameraState[cam.slug];

  if (state.buffer) {
    res.setHeader("Content-Type", "image/jpeg");
    res.setHeader("Content-Length", state.sizeBytes);
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    return res.end(state.buffer);
  }

  res.status(502).json({
    error: "Failed to capture snapshot on demand",
    slug: cam.slug,
    lastError: state.lastError,
  });
});

// Health check with rich diagnostics
app.get("/health", (req, res) => {
  const memory = process.memoryUsage();
  const uptimeSeconds = Math.floor(process.uptime());

  const camerasReport = config.cameras.map((cam) => {
    const s = cameraState[cam.slug];
    const avgDuration = s.successCount > 0 ? Math.round(s.totalDurationMs / s.successCount) : null;

    return {
      slug: cam.slug,
      source: maskUrl(cam.source),
      ready: Boolean(s.buffer),
      hwaccel: s.activeHwaccel,
      lastSuccess: s.lastSuccess,
      lastError: s.lastError,
      lastDurationMs: s.lastDurationMs,
      avgDurationMs: avgDuration,
      sizeBytes: s.sizeBytes,
      successCount: s.successCount,
      errorCount: s.errorCount,
    };
  });

  const allHealthy = camerasReport.every((c) => c.ready && !c.lastError);

  res.json({
    status: allHealthy ? "ok" : "degraded",
    uptime: `${uptimeSeconds}s`,
    interval: config.interval,
    system: {
      defaultHwaccel: systemDefaultHwaccel,
      availableHwaccels,
      configuredHwaccel: config.hwaccel,
      memory: {
        rss: formatBytes(memory.rss),
        heapUsed: formatBytes(memory.heapUsed),
      },
      concurrency: {
        active: limiter.running,
        queued: limiter.queue.length,
        max: limiter.max,
      },
    },
    cameras: camerasReport,
  });
});

// 404 handler
app.use((req, res) => {
  const slugs = config.cameras.map((c) => `/${c.slug}`);
  res.status(404).json({
    error: "Not found",
    availableEndpoints: ["/health", ...slugs, ...slugs.map((s) => `/live${s}`)],
  });
});

// ---------------------------------------------------------------------------
// Server Bootstrap Banner & Startup
// ---------------------------------------------------------------------------

async function startServer() {
  await detectHwaccels();

  app.listen(config.port, () => {
    const hwDisplay = availableHwaccels.length > 0 ? availableHwaccels.join(", ") : "none (cpu)";

    console.log(`\n${c.cyan}${c.bold}┌──────────────────────────────────────────────────────────┐${c.reset}`);
    console.log(`${c.cyan}${c.bold}│                📷  SNAPPIE SNAPSHOT SERVER               │${c.reset}`);
    console.log(`${c.cyan}${c.bold}└──────────────────────────────────────────────────────────┘${c.reset}`);
    console.log(`  ${c.bold}HTTP Port${c.reset}       : ${c.green}${config.port}${c.reset}`);
    console.log(`  ${c.bold}Interval${c.reset}        : ${c.yellow}${config.interval}s${c.reset}`);
    console.log(`  ${c.bold}HW Acceleration${c.reset} : ${getHwaccelBadge(systemDefaultHwaccel)} ${c.dim}(Config: ${config.hwaccel}, Supported: [${hwDisplay}])${c.reset}`);
    console.log(`  ${c.bold}In-Memory Cache${c.reset} : ${c.green}Zero Disk I/O (RAM)${c.reset} ${config.saveToDisk ? c.dim + "[Disk sync: ON]" + c.reset : ""}`);
    console.log(`  ${c.bold}Concurrency Lim${c.reset} : ${c.cyan}${config.maxConcurrent} parallel ffmpeg workers${c.reset}`);
    console.log(`\n  ${c.bold}Configured Cameras:${c.reset}`);

    for (const cam of config.cameras) {
      const hw = cam.source.startsWith("http") ? "http" : resolveCameraHwaccel(cam);
      console.log(
        `    ${c.green}→${c.reset} ${c.bold}http://localhost:${config.port}/${cam.slug}${c.reset} ${getHwaccelBadge(hw)} ${c.dim}(${maskUrl(cam.source)})${c.reset}`
      );
    }

    console.log(`\n  ${c.bold}Health & Diagnostics:${c.reset}`);
    console.log(`    ${c.blue}→${c.reset} http://localhost:${config.port}/health\n`);

    scheduleSnapshots();
  });
}

startServer();
