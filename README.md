<img src="icon.png" width="64" height="64" alt="Snappie Icon" />

# snappie 📷⚡

[![Version](https://img.shields.io/badge/Version-1.0.2-blue.svg)](package.json)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Build & Publish](https://github.com/resonaura/snappie/actions/workflows/publish.yaml/badge.svg)](https://github.com/resonaura/snappie/actions/workflows/publish.yaml)
[![Home Assistant](https://img.shields.io/badge/Home%20Assistant-Add--on-orange.svg)](https://www.home-assistant.io/)
[![HW-Accel](https://img.shields.io/badge/HW--Accel-CUDA%20%7C%20VA--API%20%7C%20QSV%20%7C%20VT-blueviolet.svg)](#-key-features)
[![Docker GHCR](https://img.shields.io/badge/Docker-GHCR-2496ED?logo=docker&logoColor=white)](https://github.com/resonaura/snappie/pkgs/container/snappie)

High-performance, resource-optimized multi-camera RTSP snapshot server with **Hardware Acceleration** (NVIDIA CUDA/NVDEC, Intel/AMD VA-API, Apple VideoToolbox, Intel QuickSync) and **Zero-Disk In-Memory Caching** for Home Assistant, go2rtc, and Standalone Docker.

---

## 🚀 Installation & Quick Start

### Option 1: Home Assistant Add-on (Recommended)

#### 1-Click Install

[![Open your Home Assistant instance and show the add add-on repository dialog with a specific repository URL pre-filled.](https://my.home-assistant.io/badges/supervisor_add_addon_repository.svg)](https://my.home-assistant.io/redirect/supervisor_add_addon_repository/?repository_url=https%3A%2F%2Fgithub.com%2Fresonaura%2Fsnappie)

#### Manual Install (Home Assistant)

1. Navigate to **Settings → Add-ons → Add-on Store → ⋮ → Repositories** in Home Assistant.
2. Add the repository:
   ```text
   https://github.com/resonaura/snappie
   ```
3. Find and select **Snappie** in the store and click **Install**.
4. Configure your cameras and hardware acceleration in the **Configuration** tab.
5. Click **Start**!

---

### Option 2: Docker Compose (Standalone)

Create a `docker-compose.yml`:

```yaml
services:
  snappie:
    image: ghcr.io/resonaura/snappie:latest
    container_name: snappie
    restart: always
    network_mode: host
    volumes:
      - ./config.yaml:/config/config.yaml:ro
    # For Intel / AMD VA-API GPU acceleration:
    # devices:
    #   - /dev/dri:/dev/dri
    # For NVIDIA GPU, uncomment below:
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

### Option 3: Standard Docker Run

#### Standard / CPU / Auto:
```bash
docker run -d \
  --name snappie \
  --restart always \
  --network host \
  -v /opt/snappie/config.yaml:/config/config.yaml:ro \
  ghcr.io/resonaura/snappie:latest
```

#### Intel / AMD VA-API Hardware Acceleration:
```bash
docker run -d \
  --name snappie \
  --restart always \
  --network host \
  --device /dev/dri:/dev/dri \
  -v /opt/snappie/config.yaml:/config/config.yaml:ro \
  ghcr.io/resonaura/snappie:latest
```

#### NVIDIA GPU Acceleration (CUDA / NVDEC):
```bash
docker run -d \
  --name snappie \
  --restart always \
  --network host \
  --gpus all \
  -v /opt/snappie/config.yaml:/config/config.yaml:ro \
  ghcr.io/resonaura/snappie:latest
```

---

## ✨ Key Features

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

## ⚙️ Configuration (`config.yaml`)

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

## 🌐 HTTP Endpoints

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

## 🛠️ Build & Run Locally

```bash
git clone https://github.com/resonaura/snappie.git
cd snappie
npm install
node index.js
```
