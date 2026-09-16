#!/usr/bin/env bash
# 테스트 서버 (재)시작: tests/server.sh [port] [datadir]
PORT=${1:-3000}; DATA=${2:-/tmp/claude-0/data-e2e}
PIDF=/tmp/claude-0/server-$PORT.pid
if [ -f "$PIDF" ]; then kill $(cat "$PIDF") 2>/dev/null; sleep 1; fi
if [ "$FRESH" = "1" ]; then rm -rf "$DATA"; fi
mkdir -p "$DATA"; [ -d "$DATA/scenarios" ] || cp -r data/scenarios "$DATA/"; [ -d "$DATA/uploads" ] || cp -r data/uploads "$DATA/"
DATA_DIR="$DATA" PORT=$PORT RECONNECT_GRACE_MS=${GRACE:-30000} nohup node --import tsx server/src/index.ts > /tmp/claude-0/server-$PORT.log 2>&1 &
echo $! > "$PIDF"
for i in $(seq 1 30); do curl -s localhost:$PORT/api/health >/dev/null && break; sleep 0.3; done
curl -s localhost:$PORT/api/health; echo
