#!/bin/bash
# Builds "Hit My Limit.app" and a disk image for it into mac/dist, with a copy of the hitmylimit tool from cli/ inside it.
# Signs with Developer ID and notarizes when SIGN_IDENTITY and the notary variables are set;
# otherwise signs ad hoc, which runs on this Mac but warns on others.
set -euo pipefail
cd "$(dirname "$0")"

VERSION="${VERSION:-0.1.0}"
# The Node.js shipped inside the app, so nobody has to install it. Checked against nodejs.org's checksums.
NODE_VERSION="${NODE_VERSION:-v24.20.0}"
APP="dist/Hit My Limit.app"

swift build -c release --arch arm64 --arch x86_64
BIN="$(swift build -c release --arch arm64 --arch x86_64 --show-bin-path)/HitMyLimit"

rm -rf dist
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources/cli"
cp "$BIN" "$APP/Contents/MacOS/HitMyLimit"
sed "s/VERSION/$VERSION/g" Info.plist > "$APP/Contents/Info.plist"
cp -R ../cli/bin ../cli/src ../cli/package.json "$APP/Contents/Resources/cli/"
cp Resources/MenuBarIcon-*Template*.png "$APP/Contents/Resources/"

NODE_CACHE="dist-cache/node-$NODE_VERSION"
if [ ! -f "$NODE_CACHE/node" ]; then
  mkdir -p "$NODE_CACHE"
  curl -fsSL "https://nodejs.org/dist/$NODE_VERSION/SHASUMS256.txt" -o "$NODE_CACHE/SHASUMS256.txt"
  for arch in arm64 x64; do
    f="node-$NODE_VERSION-darwin-$arch.tar.gz"
    curl -fsSL "https://nodejs.org/dist/$NODE_VERSION/$f" -o "$NODE_CACHE/$f"
    (cd "$NODE_CACHE" && grep " $f\$" SHASUMS256.txt | shasum -a 256 -c -)
    tar -xzf "$NODE_CACHE/$f" -C "$NODE_CACHE" "node-$NODE_VERSION-darwin-$arch/bin/node" "node-$NODE_VERSION-darwin-$arch/LICENSE"
  done
  lipo -create "$NODE_CACHE/node-$NODE_VERSION-darwin-arm64/bin/node" "$NODE_CACHE/node-$NODE_VERSION-darwin-x64/bin/node" -output "$NODE_CACHE/node"
fi
mkdir -p "$APP/Contents/Resources/node"
cp "$NODE_CACHE/node" "$APP/Contents/Resources/node/node"
cp "$NODE_CACHE/node-$NODE_VERSION-darwin-arm64/LICENSE" "$APP/Contents/Resources/node/LICENSE"

# App icon: every size macOS asks for, made from the 1024px master.
ICONSET="dist/AppIcon.iconset"
mkdir -p "$ICONSET"
for s in 16 32 128 256 512; do
  sips -z $s $s Resources/AppIcon-1024.png --out "$ICONSET/icon_${s}x${s}.png" >/dev/null
  sips -z $((s * 2)) $((s * 2)) Resources/AppIcon-1024.png --out "$ICONSET/icon_${s}x${s}@2x.png" >/dev/null
done
iconutil -c icns "$ICONSET" -o "$APP/Contents/Resources/AppIcon.icns"
rm -rf "$ICONSET"

# Node is signed first, on its own: under the hardened runtime its JIT needs the entitlements in node.entitlements.
if [ -n "${SIGN_IDENTITY:-}" ]; then
  codesign --force --options runtime --timestamp --entitlements node.entitlements --sign "$SIGN_IDENTITY" "$APP/Contents/Resources/node/node"
  codesign --force --options runtime --timestamp --sign "$SIGN_IDENTITY" "$APP"
else
  codesign --force --sign - "$APP/Contents/Resources/node/node"
  codesign --force --sign - "$APP"
fi
codesign --verify --verbose "$APP"

# A disk image with the app next to a link to Applications, so installing is one drag.
DMG="dist/HitMyLimit-$VERSION.dmg"
STAGE="dist/dmg"
mkdir -p "$STAGE"
ditto "$APP" "$STAGE/Hit My Limit.app"
ln -s /Applications "$STAGE/Applications"
hdiutil create -volname "Hit My Limit" -srcfolder "$STAGE" -ov -format UDZO "$DMG" >/dev/null
rm -rf "$STAGE"

if [ -n "${SIGN_IDENTITY:-}" ]; then
  codesign --force --timestamp --sign "$SIGN_IDENTITY" "$DMG"
  if [ -n "${APPLE_ID:-}" ]; then
    xcrun notarytool submit "$DMG" --apple-id "$APPLE_ID" --team-id "$APPLE_TEAM_ID" --password "$APPLE_APP_PASSWORD" --wait
    xcrun stapler staple "$DMG"
  fi
fi
echo "$DMG"
