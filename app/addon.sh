#!/usr/bin/with-contenv bashio
set -e

bashio::log.info "Starting Snappie Multi-Camera Snapshot Server..."

exec node index.js
