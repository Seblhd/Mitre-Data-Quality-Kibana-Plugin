#!/bin/bash
# Build script for MITRE Data Quality plugin
# Works around plugin-helpers optimizer bug

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_DIR="$(dirname "$SCRIPT_DIR")"

echo "=== MITRE Data Quality Plugin Build ==="

cd "$PLUGIN_DIR"

# Step 1: Run standard plugin-helpers build
echo ""
echo "Step 1: Running plugin-helpers build..."
yarn plugin-helpers build "$@"

# Step 2: Build browser bundles
echo ""
echo "Step 2: Building browser bundles..."
node --require=@kbn/babel-register/install scripts/build_bundles.js

# Step 3: Add bundles to the archive
echo ""
echo "Step 3: Adding bundles to archive..."
ZIP_FILE=$(ls "$PLUGIN_DIR/build/"*.zip 2>/dev/null | head -1)
if [ -z "$ZIP_FILE" ]; then
    echo "ERROR: Could not find zip file in build/"
    exit 1
fi

ZIP_NAME=$(basename "$ZIP_FILE")
TEMP_DIR=$(mktemp -d)

# Extract existing archive
unzip -q "$ZIP_FILE" -d "$TEMP_DIR"

# Copy bundles into extracted structure
mkdir -p "$TEMP_DIR/kibana/mitreDataQuality/target"
cp -r "$PLUGIN_DIR/target/public" "$TEMP_DIR/kibana/mitreDataQuality/target/"
echo "✓ Bundles added"

# Re-create archive
rm -f "$ZIP_FILE"
cd "$TEMP_DIR"
zip -r "$PLUGIN_DIR/build/$ZIP_NAME" kibana --quiet
cd "$PLUGIN_DIR"

# Cleanup
rm -rf "$TEMP_DIR"

echo "✓ Archive updated: build/$ZIP_NAME"
echo ""
echo "=== Build Complete ==="
