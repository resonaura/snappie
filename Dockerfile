FROM node:22-slim

# Install ffmpeg
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /usr/src/app

# Install dependencies first (layer cache)
COPY package.json ./
RUN npm install --omit=dev

# Copy app source
COPY index.js ./

# Snapshots will live here (mount a volume to persist across restarts)
RUN mkdir -p snapshots

# Config is expected at /config/config.yaml (mount it from host)
ENV CONFIG_PATH=/config/config.yaml

EXPOSE 1985

CMD ["node", "index.js"]
