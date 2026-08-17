# snappie 📷⚡

High-performance, resource-optimized multi-camera RTSP snapshot server with Hardware Acceleration (NVIDIA CUDA/NVDEC, Intel/AMD VA-API, Apple VideoToolbox) and Zero-Disk In-Memory Caching.

---

## Key Features

- **⚡ Hardware Acceleration (GPU):**
  - **NVIDIA GPU (CUDA / NVDEC):** Offloads H.264 / HEVC video decoding directly to NVIDIA graphics cards.
  - **Intel / AMD (VA-API / QSV):** Uses QuickSync and VA-API render devices (`/dev/dri/renderD128`).
  - **Apple Silicon (VideoToolbox):** Native hardware decoding on macOS.
  - **Graceful CPU Fallback:** If GPU memory or decoder is busy/unsupported, automatically falls back to CPU without failing client requests.
- **🚀 Zero-Disk In-Memory Pipe (RAM):**
  - Snapshots are streamed directly from FFmpeg stdout to Node.js `Buffer` in RAM.
  - No disk wear, no filesystem lag, response latency `< 1ms`.
  - Conditional HTTP caching (`304 Not Modified` via `ETag` and `Last-Modified`).
- **⏱️ Ultra-Fast RTSP Tuning:**
  - `nobuffer`, `low_delay`, and optimized `probesize` / `analyzeduration` (down from 5s to milliseconds).
- **🎛️ Staggered Scheduling & Concurrency Control:**
  - Distributes camera polling smoothly across the interval to prevent CPU/GPU spikes.
  - Built-in semaphore queue limits parallel FFmpeg processes (`max_concurrent`).
- **🎨 Beautiful Terminal Logging:**
  - Real-time ANSI color-coded logs with execution durations (`[120ms]`), image sizes, accelerator badges (`⚡ [CUDA]`, `🚀 [VAAPI]`, `⚙️ [CPU]`), and timestamps.
- **📊 Rich Diagnostics & Health API:**
  - Real-time monitoring of RAM usage, average latencies, success/failure counts, and system status via `/health`.

---

## Configuration (`config.yaml`)

```yaml
# Port the HTTP server listens on
port: 1985

# How often (in seconds) to grab a new frame from each camera
interval: 10

# Hardware acceleration engine:
# auto         — auto-detect best available (cuda -> vaapi -> qsv -> videotoolbox -> cpu)
# cuda         — NVIDIA GPU (NVDEC)
# vaapi        — Intel / AMD GPU via VA-API (/dev/dri/renderD128)
# qsv          — Intel Quick Sync Video
# videotoolbox — Apple Silicon (macOS)
# cpu          — Pure software decoding
hwaccel: auto

# JPEG image quality: 1 (highest) to 31 (lowest). Default: 2 (High)
quality: 2

# Timeout (seconds) before terminating FFmpeg capture
timeout: 15

# Max concurrent FFmpeg processes (smooths CPU / VRAM usage)
max_concurrent: 4

# Save snapshots to disk (snapshots/<slug>.jpg) in addition to memory
save_to_disk: false

# RTSP transport protocol: tcp (recommended) or udp
rtsp_transport: tcp

# List of cameras
cameras:
  - slug: front-door
    rtsp: rtsp://user:pass@192.168.1.10:554/stream1

  - slug: backyard
    rtsp: rtsp://user:pass@192.168.1.11:554/stream1
    # hwaccel: cuda  # (Optional: per-camera override)

  - slug: garage
    rtsp: rtsp://user:pass@192.168.1.12:554/stream1
```

---

## Quick Start with Docker

### 1. Standard / CPU / Auto
```bash
docker run -d \
  --name snappie \
  --restart always \
  --network host \
  -v /opt/snappie/config.yaml:/config/config.yaml:ro \
  ghcr.io/resonaura/snappie:latest
```

### 2. NVIDIA GPU Acceleration (CUDA / NVDEC)
Requires [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/install-guide.html) on the host.

```bash
docker run -d \
  --name snappie \
  --restart always \
  --network host \
  --gpus all \
  -v /opt/snappie/config.yaml:/config/config.yaml:ro \
  ghcr.io/resonaura/snappie:latest
```

### 3. Intel / AMD VA-API Acceleration
```bash
docker run -d \
  --name snappie \
  --restart always \
  --network host \
  --device /dev/dri:/dev/dri \
  -v /opt/snappie/config.yaml:/config/config.yaml:ro \
  ghcr.io/resonaura/snappie:latest
```

---

## Docker Compose

```yaml
services:
  snappie:
    image: ghcr.io/resonaura/snappie:latest
    container_name: snappie
    restart: always
    network_mode: host
    volumes:
      - ./config.yaml:/config/config.yaml:ro
    # For NVIDIA GPU, uncomment the block below:
    # deploy:
    #   resources:
    #     reservations:
    #       devices:
    #         - driver: nvidia
    #           count: all
    #           capabilities: [gpu, video]
```

Run with:
```bash
docker compose up -d
```

---

## HTTP Endpoints

| Endpoint | Method | Description |
|---|---|---|
| `/<slug>` | `GET` | Instant snapshot served directly from RAM (JPEG) |
| `/live/<slug>` | `GET` | Forces an immediate fresh frame capture on demand |
| `/health` | `GET` | Detailed JSON health, memory usage, accelerator status, latencies, and camera states |

### Health Check Example (`/health`)

```json
{
  "status": "ok",
  "uptime": "1420s",
  "interval": 10,
  "system": {
    "defaultHwaccel": "cuda",
    "availableHwaccels": ["cuda", "vaapi", "vdpau"],
    "configuredHwaccel": "auto",
    "memory": {
      "rss": "42.5 MB",
      "heapUsed": "18.2 MB"
    },
    "concurrency": {
      "active": 0,
      "queued": 0,
      "max": 4
    }
  },
  "cameras": [
    {
      "slug": "front-door",
      "source": "rtsp://user:****@192.168.1.10:554/stream1",
      "ready": true,
      "hwaccel": "cuda",
      "lastSuccess": "2026-08-17T09:05:00.123Z",
      "lastError": null,
      "lastDurationMs": 142,
      "avgDurationMs": 138,
      "sizeBytes": 284120,
      "successCount": 142,
      "errorCount": 0
    }
  ]
}
```

---

## Build & Run Locally

```bash
git clone https://github.com/resonaura/snappie.git
cd snappie
npm install
node index.js
```
