ARG BUILD_FROM=ghcr.io/home-assistant/amd64-base-debian:bookworm
FROM $BUILD_FROM

WORKDIR /usr/src/app

# Install Node.js 22.x, FFmpeg, and VA-API hardware acceleration drivers
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       curl \
       ca-certificates \
       gnupg \
       ffmpeg \
       va-driver-all \
       mesa-va-drivers \
       vainfo \
       jq \
    && curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

# Install dependencies first (layer cache)
COPY package.json ./
RUN npm install --omit=dev

# Copy app source & assets
COPY index.js ./
COPY icon.png ./

# Copy startup script and set permissions
COPY addon.sh /addon.sh
RUN chmod +x /addon.sh

EXPOSE 1985

CMD [ "/addon.sh" ]
