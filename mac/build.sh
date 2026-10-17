#!/bin/bash
# Builds "Hit My Limit.app" into mac/dist, with a copy of the hitmylimit tool from cli/ inside it.
# Signs with Developer ID and notarizes when SIGN_IDENTITY and the notary variables are set;
# otherwise signs ad hoc, which runs on this Mac but warns on others.
set -euo pipefail
cd "$(dirname "$0")"

VERSION="${VERSION:-0.1.0}"
APP="dist/Hit My Limit.app"

swift build -c release --arch arm64 --arch x86_64
BIN="$(swift build -c release --arch arm64 --arch x86_64 --show-bin-path)/HitMyLimit"

rm -rf dist
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources/cli"
cp "$BIN" "$APP/Contents/MacOS/HitMyLimit"
sed "s/VERSION/$VERSION/g" Info.plist > "$APP/Contents/Info.plist"
cp -R ../cli/bin ../cli/src ../cli/package.json "$APP/Contents/Resources/cli/"
cp Resources/MenuBarIconTemplate.png Resources/MenuBarIconTemplate@2x.png "$APP/Contents/Resources/"

# App icon: every size macOS asks for, made from the 1024px master.
ICONSET="dist/AppIcon.iconset"
mkdir -p "$ICONSET"
for s in 16 32 128 256 512; do
  sips -z $s $s Resources/AppIcon-1024.png --out "$ICONSET/icon_${s}x${s}.png" >/dev/null
  sips -z $((s * 2)) $((s * 2)) Resources/AppIcon-1024.png --out "$ICONSET/icon_${s}x${s}@2x.png" >/dev/null
done
iconutil -c icns "$ICONSET" -o "$APP/Contents/Resources/AppIcon.icns"
rm -rf "$ICONSET"

if [ -n "${SIGN_IDENTITY:-}" ]; then
  codesign --force --options runtime --timestamp --sign "$SIGN_IDENTITY" "$APP"
else
  codesign --force --sign - "$APP"
fi
codesign --verify --verbose "$APP"

ZIP="dist/HitMyLimit-$VERSION.zip"
ditto -c -k --keepParent "$APP" "$ZIP"

if [ -n "${SIGN_IDENTITY:-}" ] && [ -n "${APPLE_ID:-}" ]; then
  xcrun notarytool submit "$ZIP" --apple-id "$APPLE_ID" --team-id "$APPLE_TEAM_ID" --password "$APPLE_APP_PASSWORD" --wait
  xcrun stapler staple "$APP"
  rm "$ZIP"
  ditto -c -k --keepParent "$APP" "$ZIP"
fi
echo "$ZIP"
