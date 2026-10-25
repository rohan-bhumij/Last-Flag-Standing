#!/usr/bin/env bash
set -Eeuo pipefail

sha="${1:-}"
if [[ ! "$sha" =~ ^[0-9a-f]{40}$ ]]; then
  echo "Usage: lfs-queue-deploy <40-character-commit-sha>" >&2
  exit 2
fi

state_dir="${XDG_STATE_HOME:-$HOME/.local/state}/lfs-deploy"
install -d -m 700 "$state_dir"
tmp_file="$state_dir/pending-sha.tmp"
printf '%s\n' "$sha" > "$tmp_file"
chmod 600 "$tmp_file"
mv "$tmp_file" "$state_dir/pending-sha"

if ! systemctl --user is-enabled --quiet lfs-deploy-apply.timer; then
  echo "Deployment queued, but the Oracle deployment agent is not enabled yet." >&2
  echo "Run scripts/install-oracle-deploy-agent.sh once on the VM after this change is merged." >&2
  exit 3
fi

systemctl --user start lfs-deploy-apply.service
echo "Deployment request queued for commit $sha. It will apply only when streaming is inactive and the managed app services exist."
