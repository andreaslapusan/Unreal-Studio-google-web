#!/usr/bin/env bash
# Compila el .aab firmado para Google Play. Uso: APP_FLAVOR=clientes|agencias|equipo|admin bash scripts/app-build-android.sh [versionCode] [versionName]
# Requiere: JDK 21 + Android SDK en ~/android-sdk y la upload key en ~/.config/android-keystore.env
set -euo pipefail
cd "$(dirname "$0")/.."
FLAVOR="${APP_FLAVOR:-clientes}"; VCODE="${1:-1}"; VNAME="${2:-1.0.0}"
export JAVA_HOME="${JAVA_HOME:-$HOME/android-sdk/jdk}" ANDROID_HOME="${ANDROID_HOME:-$HOME/android-sdk}"
avail=$(awk '/MemAvailable/{print int($2/1024)}' /proc/meminfo)
[ "$avail" -ge 2048 ] || { echo "ABORT: solo ${avail}MB RAM libre (<2GB), no compilo para no tumbar producción"; exit 1; }
set -a; . "$HOME/.config/android-keystore.env"; set +a
APP_FLAVOR="$FLAVOR" node scripts/app-assets.mjs >/dev/null  # icono/splash con la etiqueta del flavor
APP_FLAVOR="$FLAVOR" npx cap sync android >/dev/null
read -r APP_ID APP_NAME < <(node -e "const c=require('./android/app/src/main/assets/capacitor.config.json');console.log(c.appId, c.appName)")
cd android
nice -n 15 ionice -c3 ./gradlew --no-daemon -Dorg.gradle.jvmargs=-Xmx1536m -Dorg.gradle.workers.max=2 \
  -PappId="$APP_ID" -PappName="$APP_NAME" -PversionCode="$VCODE" -PversionName="$VNAME" bundleRelease
OUT="$HOME/jobs/apps/builds/${APP_ID}-${VNAME}-${VCODE}.aab"; mkdir -p "$(dirname "$OUT")"
cp app/build/outputs/bundle/release/app-release.aab "$OUT"
"$JAVA_HOME/bin/jarsigner" -verify "$OUT" >/dev/null && echo "OK firmado: $OUT ($(du -h "$OUT" | cut -f1))"
