#!/usr/bin/env bash
set -e

if command -v bashio >/dev/null 2>&1; then
    bashio::log.info "Starting Snappie Multi-Camera Snapshot Server..."
else
    echo "🚀 Starting Snappie Multi-Camera Snapshot Server..."
fi

exec node index.js
