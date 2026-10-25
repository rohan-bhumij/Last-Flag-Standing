#!/usr/bin/env bash
set -Eeuo pipefail

REPO_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
BIN_DIR="$HOME/.local/bin"
UNIT_DIR="$HOME/.config/systemd/user"

install -d -m 700 "$BIN_DIR"
install -d -m 700 "$UNIT_DIR"
install -d -m 700 "${XDG_STATE_HOME:-$HOME/.local/state}/lfs-deploy"
install -m 700 "$REPO_DIR/scripts/oracle-queue-deploy.sh" "$BIN_DIR/lfs-queue-deploy"
install -m 700 "$REPO_DIR/scripts/oracle-apply-deploy.sh" "$BIN_DIR/lfs-apply-deploy"

cat > "$UNIT_DIR/lfs-deploy-apply.service" <<'UNIT'
[Unit]
Description=Apply queued Last Flag Standing deployment when streaming is inactive

[Service]
Type=oneshot
ExecStart=%h/.local/bin/lfs-apply-deploy
UNIT

cat > "$UNIT_DIR/lfs-deploy-apply.timer" <<'UNIT'
[Unit]
Description=Check for queued Last Flag Standing deployments

[Timer]
OnBootSec=45s
OnUnitActiveSec=60s
AccuracySec=10s
Unit=lfs-deploy-apply.service

[Install]
WantedBy=timers.target
UNIT

systemctl --user daemon-reload
systemctl --user enable --now lfs-deploy-apply.timer

echo "Deployment agent installed and enabled."
echo "Actual deployment remains queued until last-flag-standing.service and lfs-renderer.service exist and streaming is inactive."
