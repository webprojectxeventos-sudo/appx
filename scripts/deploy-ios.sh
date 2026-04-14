#!/bin/bash
# Project X — iOS deploy script for TestFlight (fully automated via ASC API key)
#
# Usage:
#   scripts/deploy-ios.sh                    # full deploy (archive + export + upload)
#   scripts/deploy-ios.sh --archive-only     # stop after creating .xcarchive
#   scripts/deploy-ios.sh --no-upload        # archive + export IPA, skip upload
#
# Required env vars:
#   DEVELOPMENT_TEAM  — 10-char Team ID from https://developer.apple.com/account (Membership)
#   ASC_KEY_ID        — App Store Connect API Key ID (e.g. "ABC123XYZ")
#                       from https://appstoreconnect.apple.com/access/integrations/api
#   ASC_ISSUER_ID     — Issuer ID (UUID on same page, top of the Keys table)
#   ASC_KEY_PATH      — Path to the .p8 private key file
#                       (default: ~/.appstoreconnect/private_keys/AuthKey_${ASC_KEY_ID}.p8)

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PROJECT="ios/App/App.xcodeproj"
SCHEME="App"
CONFIG="Release"
ARCHIVE_PATH="/tmp/ProjectX.xcarchive"
EXPORT_DIR="/tmp/ProjectX-export"
EXPORT_OPTS="ios/ExportOptions.plist"

ARCHIVE_ONLY=false
NO_UPLOAD=false
for arg in "$@"; do
  case "$arg" in
    --archive-only) ARCHIVE_ONLY=true ;;
    --no-upload) NO_UPLOAD=true ;;
    -h|--help)
      sed -n '2,20p' "$0"
      exit 0
      ;;
  esac
done

# --- Required env vars ---
: "${DEVELOPMENT_TEAM:?Set DEVELOPMENT_TEAM env var (your 10-char Apple Team ID)}"

if [ "$NO_UPLOAD" = false ] && [ "$ARCHIVE_ONLY" = false ]; then
  : "${ASC_KEY_ID:?Set ASC_KEY_ID env var (App Store Connect API Key ID)}"
  : "${ASC_ISSUER_ID:?Set ASC_ISSUER_ID env var (App Store Connect Issuer ID)}"
fi

# Default API key location if not set
ASC_KEY_PATH="${ASC_KEY_PATH:-$HOME/.appstoreconnect/private_keys/AuthKey_${ASC_KEY_ID:-}.p8}"

# Archive also uses the API key (if provided) so xcodebuild can create certs/profiles
AUTH_ARGS=()
if [ -n "${ASC_KEY_ID:-}" ] && [ -n "${ASC_ISSUER_ID:-}" ] && [ -f "$ASC_KEY_PATH" ]; then
  AUTH_ARGS=(
    -authenticationKeyID "$ASC_KEY_ID"
    -authenticationKeyIssuerID "$ASC_ISSUER_ID"
    -authenticationKeyPath "$ASC_KEY_PATH"
  )
  echo "==> Using App Store Connect API key auth"
fi

echo "==> [1/5] Sync Capacitor web assets to iOS"
npx cap sync ios

echo "==> [2/5] Read current build number"
CURRENT_BUILD=$(grep -m1 "CURRENT_PROJECT_VERSION" "$PROJECT/project.pbxproj" | head -1 | sed -E 's/.*= ([0-9]+);/\1/')
NEW_BUILD=$((CURRENT_BUILD + 1))
echo "    old=$CURRENT_BUILD  new=$NEW_BUILD"

echo "==> [3/5] Bump CURRENT_PROJECT_VERSION to $NEW_BUILD"
sed -i '' -E "s/CURRENT_PROJECT_VERSION = [0-9]+;/CURRENT_PROJECT_VERSION = $NEW_BUILD;/g" "$PROJECT/project.pbxproj"

echo "==> [4/5] Archive ($CONFIG)  [team=$DEVELOPMENT_TEAM]"
rm -rf "$ARCHIVE_PATH"
xcodebuild \
  -project "$PROJECT" \
  -scheme "$SCHEME" \
  -configuration "$CONFIG" \
  -destination 'generic/platform=iOS' \
  -archivePath "$ARCHIVE_PATH" \
  -allowProvisioningUpdates \
  "${AUTH_ARGS[@]}" \
  DEVELOPMENT_TEAM="$DEVELOPMENT_TEAM" \
  archive

if [ "$ARCHIVE_ONLY" = true ]; then
  echo "==> Archive ready at $ARCHIVE_PATH (--archive-only, stopping)"
  exit 0
fi

echo "==> [5/5] Export + Upload via xcodebuild -exportArchive"
rm -rf "$EXPORT_DIR"
# With ExportOptions.plist method=app-store-connect + destination=upload,
# xcodebuild ships the IPA directly through Transporter. No on-disk .ipa is
# produced in that mode, so don't try to find one.
xcodebuild \
  -exportArchive \
  -archivePath "$ARCHIVE_PATH" \
  -exportPath "$EXPORT_DIR" \
  -exportOptionsPlist "$EXPORT_OPTS" \
  -allowProvisioningUpdates \
  "${AUTH_ARGS[@]}"

IPA_FILE=$(find "$EXPORT_DIR" -name "*.ipa" -maxdepth 2 2>/dev/null | head -1 || true)

if [ "$NO_UPLOAD" = true ]; then
  if [ -z "$IPA_FILE" ]; then
    echo "ERROR: --no-upload requires destination=export in ExportOptions.plist"
    exit 1
  fi
  echo "==> Skipping upload (--no-upload). IPA at $IPA_FILE"
  exit 0
fi

if [ -n "$IPA_FILE" ]; then
  if [ ! -f "$ASC_KEY_PATH" ]; then
    echo "ERROR: API key not found at $ASC_KEY_PATH"
    exit 1
  fi
  echo "==> Upload IPA to App Store Connect via altool"
  xcrun altool --upload-app \
    --type ios \
    --file "$IPA_FILE" \
    --apiKey "$ASC_KEY_ID" \
    --apiIssuer "$ASC_ISSUER_ID"
fi

echo ""
echo "Done. Check https://appstoreconnect.apple.com/apps in ~15 min."
echo "Build number: $NEW_BUILD"
