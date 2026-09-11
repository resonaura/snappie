# Changelog

All notable changes to Snappie will be documented in this file.

## [1.0.2] - 2026-09-04

### Fixed
- **Add-on Startup**: Removed redundant `bashio` source causing readonly collision on Home Assistant OS (`addon.sh`).
- **Documentation**: Updated asset URLs and cleaned up badge rendering for Home Assistant store.

## [1.0.1] - 2026-09-03

### Fixed
- **Add-on Startup**: Used `with-contenv bashio` shebang and robust bashio sourcing in `addon.sh`.

## [1.0.0] - 2026-09-03

### Added
- **RTSP Snapshot Server**: High-performance multi-camera RTSP snapshot engine with concurrent queue limits.
- **Hardware Acceleration**: Automatic detection and support for NVIDIA CUDA/NVDEC, Intel/AMD VA-API (`/dev/dri`), Apple VideoToolbox, Intel QuickSync, and CPU fallback.
- **Zero-Disk In-Memory Caching**: Serves latest snapshots instantly via HTTP endpoints without disk I/O bottlenecks.
- **Home Assistant Add-on**: Full Supervisor integration with configurable schema, options, and 1-click install.
- **Multi-Architecture Support**: Pre-built Docker images for `amd64`, `aarch64`, `armhf`, `armv7`, and `i386` via GHCR.
