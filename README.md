# snappie

Multi-camera RTSP snapshot server. Grabs a JPEG frame from each RTSP stream on a configurable interval and exposes them over HTTP.

---

## How it works

- Reads `config.yaml` to get the list of cameras and settings
- Runs FFmpeg in the background every `interval` seconds to capture a frame from each RTSP stream
- Serves each snapshot at `http://<host>:<port>/<slug>`

---

## Configuration

Create a `config.yaml` file on your host (e.g. `/opt/snappie/config.yaml`):

```/dev/null/config.yaml#L1-20
# Port the HTTP server listens on
port: 1985

# How often (in seconds) to grab a new frame from each camera
interval: 10

# List of RTSP cameras
# slug  — URL-friendly name used as the HTTP endpoint path (lowercase, digits, _ -)
# rtsp  — full RTSP stream URL
cameras:
  - slug: front-door
    rtsp: rtsp://user:pass@192.168.1.10:554/stream1

  - slug: backyard
    rtsp: rtsp://user:pass@192.168.1.11:554/stream1

  - slug: garage
    rtsp: rtsp://user:pass@192.168.1.12:554/stream1
```

---

## Run with Docker

This command starts the container, mounts your config, and makes it survive reboots automatically:

```/dev/null/run.sh#L1-8
docker run -d \
  --name snappie \
  --restart always \
  -p 1985:1985 \
  -v /opt/snappie/config.yaml:/config/config.yaml:ro \
  ghcr.io/resonaura/snappie:latest
```

> Replace `/opt/snappie/config.yaml` with the actual path to your config file.
>
> `--restart always` ensures the container starts automatically on system boot and restarts itself if it crashes.

---

## Run with Docker Compose

Create a `docker-compose.yml` alongside your config:

```/dev/null/docker-compose.yml#L1-16
services:
  snappie:
    image: ghcr.io/resonaura/snappie:latest
    container_name: snappie
    restart: always
    ports:
      - "1985:1985"
    volumes:
      - ./config.yaml:/config/config.yaml:ro
```

Then start it:

```/dev/null/start.sh#L1-2
docker compose up -d
```

To update to a newer image:

```/dev/null/update.sh#L1-3
docker compose pull
docker compose up -d
```

---

## Build locally

```/dev/null/build.sh#L1-5
git clone https://github.com/resonaura/snappie.git
cd snappie
docker build -t snappie .
docker run -d --name snappie --restart always -p 1985:1985 \
  -v /opt/snappie/config.yaml:/config/config.yaml:ro snappie
```

---

## Endpoints

| Endpoint | Description |
|---|---|
| `GET /<slug>` | Latest JPEG snapshot for that camera |
| `GET /health` | JSON status of all cameras (last success, last error, snapshot ready) |

### Examples

```/dev/null/examples.sh#L1-4
curl http://localhost:1985/front-door   # returns JPEG image
curl http://localhost:1985/health       # returns JSON status
```

---

## Health check response

```/dev/null/health.json#L1-18
{
  "status": "ok",
  "interval": 10,
  "cameras": [
    {
      "slug": "front-door",
      "lastSuccess": "2025-01-15T10:23:45.123Z",
      "lastError": null,
      "snapshotReady": true
    },
    {
      "slug": "backyard",
      "lastSuccess": "2025-01-15T10:23:46.456Z",
      "lastError": null,
      "snapshotReady": true
    }
  ]
}
```

---

## Notes

- Snapshots are stored inside the container at `/usr/src/app/snapshots/`. They are regenerated on each run, so no persistent volume is needed for them.
- If FFmpeg cannot connect to a camera, the previous snapshot is kept and the error is visible in `/health`.
- Slugs must be lowercase and contain only letters, digits, `-` and `_`.
