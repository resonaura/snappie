#!/usr/bin/with-contenv bashio
set -e

# Sourcing bashio in case script was executed directly with bash instead of bashio interpreter
if [ -f /usr/lib/bashio/bashio.sh ]; then
    # shellcheck source=/dev/null
    source /usr/lib/bashio/bashio.sh
fi

if command -v bashio::log.info >/dev/null 2>&1; then
    bashio::log.info "Starting Snappie Multi-Camera Snapshot Server..."
else
    echo "🚀 Starting Snappie Multi-Camera Snapshot Server..."
fi

exec node index.js
