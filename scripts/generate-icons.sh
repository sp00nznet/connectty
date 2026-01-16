#!/bin/bash
# Generate application icons from gfx/screen.png
# This script should be run whenever the source icon is updated

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
SOURCE_ICON="$PROJECT_ROOT/gfx/screen.png"
ASSETS_DIR="$PROJECT_ROOT/packages/desktop/assets"

echo "=== Icon Generation Script ==="
echo "Source: $SOURCE_ICON"
echo "Target: $ASSETS_DIR"

# Check if source exists
if [ ! -f "$SOURCE_ICON" ]; then
    echo "Error: Source icon not found at $SOURCE_ICON"
    exit 1
fi

# Create assets directory if it doesn't exist
mkdir -p "$ASSETS_DIR"

# Copy source to icon.png
echo "Copying source icon to icon.png..."
cp "$SOURCE_ICON" "$ASSETS_DIR/icon.png"
echo "  Created: $ASSETS_DIR/icon.png"

# Check if ImageMagick is available for ICO generation
if command -v convert &> /dev/null; then
    echo "Generating icon.ico using ImageMagick..."
    # Generate multi-resolution ICO file
    convert "$SOURCE_ICON" \
        -define icon:auto-resize=256,128,96,64,48,32,24,16 \
        "$ASSETS_DIR/icon.ico"
    echo "  Created: $ASSETS_DIR/icon.ico"
elif command -v magick &> /dev/null; then
    echo "Generating icon.ico using ImageMagick 7..."
    magick "$SOURCE_ICON" \
        -define icon:auto-resize=256,128,96,64,48,32,24,16 \
        "$ASSETS_DIR/icon.ico"
    echo "  Created: $ASSETS_DIR/icon.ico"
else
    echo "Warning: ImageMagick not found. Skipping ICO generation."
    echo "  Install with: sudo apt install imagemagick (Linux) or brew install imagemagick (macOS)"
    # Just copy PNG as fallback
    cp "$SOURCE_ICON" "$ASSETS_DIR/icon.ico"
    echo "  Copied PNG as icon.ico (not a real ICO file)"
fi

# Generate ICNS for macOS if iconutil is available
if command -v iconutil &> /dev/null && command -v sips &> /dev/null; then
    echo "Generating icon.icns for macOS..."
    ICONSET_DIR="$ASSETS_DIR/icon.iconset"
    mkdir -p "$ICONSET_DIR"

    # Generate required sizes
    sips -z 16 16     "$SOURCE_ICON" --out "$ICONSET_DIR/icon_16x16.png" > /dev/null 2>&1
    sips -z 32 32     "$SOURCE_ICON" --out "$ICONSET_DIR/icon_16x16@2x.png" > /dev/null 2>&1
    sips -z 32 32     "$SOURCE_ICON" --out "$ICONSET_DIR/icon_32x32.png" > /dev/null 2>&1
    sips -z 64 64     "$SOURCE_ICON" --out "$ICONSET_DIR/icon_32x32@2x.png" > /dev/null 2>&1
    sips -z 128 128   "$SOURCE_ICON" --out "$ICONSET_DIR/icon_128x128.png" > /dev/null 2>&1
    sips -z 256 256   "$SOURCE_ICON" --out "$ICONSET_DIR/icon_128x128@2x.png" > /dev/null 2>&1
    sips -z 256 256   "$SOURCE_ICON" --out "$ICONSET_DIR/icon_256x256.png" > /dev/null 2>&1
    sips -z 512 512   "$SOURCE_ICON" --out "$ICONSET_DIR/icon_256x256@2x.png" > /dev/null 2>&1
    sips -z 512 512   "$SOURCE_ICON" --out "$ICONSET_DIR/icon_512x512.png" > /dev/null 2>&1
    sips -z 1024 1024 "$SOURCE_ICON" --out "$ICONSET_DIR/icon_512x512@2x.png" > /dev/null 2>&1

    iconutil -c icns "$ICONSET_DIR" -o "$ASSETS_DIR/icon.icns"
    rm -rf "$ICONSET_DIR"
    echo "  Created: $ASSETS_DIR/icon.icns"
fi

echo ""
echo "=== Icon Generation Complete ==="
echo "Generated icons:"
ls -la "$ASSETS_DIR"/icon.*
