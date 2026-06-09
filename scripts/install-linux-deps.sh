#!/usr/bin/env bash
# Installs the Linux system libraries required to build the Tauri 2 desktop app.
# Needs sudo (will prompt for your password). Safe to re-run.
set -euo pipefail

echo "Installing Tauri Linux build dependencies (WebKitGTK 4.1 + GTK/SSL dev headers)..."
sudo apt update
sudo apt install -y \
  libwebkit2gtk-4.1-dev \
  build-essential \
  curl \
  wget \
  file \
  libxdo-dev \
  libssl-dev \
  libayatana-appindicator3-dev \
  librsvg2-dev \
  libudev-dev \
  pkg-config

echo
echo "Done. Verifying webkit2gtk-4.1..."
if pkg-config --exists webkit2gtk-4.1; then
  echo "  webkit2gtk-4.1: OK"
else
  echo "  webkit2gtk-4.1: STILL MISSING — check apt output above for errors."
  exit 1
fi
echo "System dependencies are ready."
