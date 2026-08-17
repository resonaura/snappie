FROM node:22-slim

# Install ffmpeg and VA-API hardware acceleration drivers for Intel/AMD
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       ffmpeg \
       va-driver-all \
       mesa-va-drivers \
       vainfo \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /usr/src/app

# Install dependencies first (layer cache)
COPY package.json ./
RUN npm install --omit=dev

# Copy app source
COPY index.js ./

# Create snapshots dir (used if save_to_disk: true)
RUN mkdir -p snapshots

# Default config path
ENV CONFIG_PATH=/config/config.yaml

EXPOSE 1985

CMD ["node", "index.js"]
