#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

if [ -n "${JAVA_HOME:-}" ]; then
  echo "Using JAVA_HOME=${JAVA_HOME}"
elif [ -d "$HOME/.jdks/jbr-21.0.11" ]; then
  export JAVA_HOME="$HOME/.jdks/jbr-21.0.11"
  export PATH="$JAVA_HOME/bin:$PATH"
  echo "JAVA_HOME set to $JAVA_HOME"
else
  echo "ERROR: No JDK found. Install one or set JAVA_HOME." >&2
  exit 1
fi

if command -v adb >/dev/null 2>&1; then
  ADB="adb"
else
  ADB="/home/prp/Android/Sdk/platform-tools/adb"
fi

echo "Starting Matey build & deployment pipeline..."
echo "Workspace: $SCRIPT_DIR"

echo "Building web assets with Vite..."
npm run build

echo "Syncing Capacitor project with Android..."
npx cap sync android

echo "Compiling Android debug APK via Gradle..."
(
  cd android
  ./gradlew assembleDebug
)

echo "Locating device via ADB..."
SERIAL="$("$ADB" devices | sed -n '2p' | awk '{print $1}')"
if [ -z "$SERIAL" ] || [ "$SERIAL" = "emulator" ]; then
  echo "ERROR: No device connected. Start wireless adb or plug in the phone." >&2
  exit 1
fi
echo "Found device: $SERIAL"

echo "Installing APK to device..."
"$ADB" -s "$SERIAL" install -r android/app/build/outputs/apk/debug/app-debug.apk

echo "Deployment successful! Matey is live on device."
