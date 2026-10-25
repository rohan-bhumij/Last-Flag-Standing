#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="${LFS_APP_DIR:-$HOME/Last-Flag-Standing}"
STATE_DIR="${XDG_STATE_HOME:-$HOME/.local/state}/lfs-deploy"
PENDING="$STATE_DIR/pending-sha"

[[ -f "$PENDING" ]] || exit 0

install -d -m 700 "$STATE_DIR"
exec 9>"$STATE_DIR/apply.lock"
flock -n 9 || exit 0
[[ -f "$PENDING" ]] || exit 0

# Never update source files or restart the app while an encoder may be live.
if pgrep -x ffmpeg >/dev/null 2>&1; then
  echo "Deployment remains queued: FFmpeg is running."
  exit 0
fi
if systemctl --user is-active --quiet lfs-stream.service; then
  echo "Deployment remains queued: lfs-stream.service is active."
  exit 0
fi

# Do not update the running project until the managed services are installed.
for unit in last-flag-standing.service lfs-renderer.service; do
  if ! systemctl --user cat "$unit" >/dev/null 2>&1; then
    echo "Deployment remains queued: $unit is not installed."
    exit 0
  fi
done

cd "$APP_DIR"
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "Deployment refused: tracked local edits exist in $APP_DIR." >&2
  exit 1
fi

git fetch origin main
if ! git merge-base --is-ancestor HEAD origin/main; then
  echo "Deployment refused: local branch cannot fast-forward to origin/main." >&2
  exit 1
fi
git merge --ff-only origin/main

npm install --no-audit --no-fund --legacy-peer-deps
npm test
npm run build

systemctl --user restart last-flag-standing.service
for attempt in $(seq 1 15); do
  if curl --fail --silent --show-error http://127.0.0.1:3000/ >/dev/null; then
    break
  fi
  sleep 2
done
curl --fail --silent --show-error http://127.0.0.1:3000/ >/dev/null

# Reload Chromium only while FFmpeg is confirmed stopped.
systemctl --user restart lfs-renderer.service

rm -f "$PENDING"
echo "Deployment applied and health check passed at $(git rev-parse --short HEAD)."
