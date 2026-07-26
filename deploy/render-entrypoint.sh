#!/usr/bin/env bash
set -euo pipefail

api_pid=
nginx_pid=

shutdown() {
  if [[ -n "${nginx_pid}" ]]; then
    kill -TERM "${nginx_pid}" 2>/dev/null || true
  fi

  if [[ -n "${api_pid}" ]]; then
    kill -TERM "${api_pid}" 2>/dev/null || true
  fi

  wait || true
}

trap shutdown EXIT INT TERM

PORT=3000 npm run start:hosted &
api_pid=$!

nginx -g 'daemon off;' &
nginx_pid=$!

wait -n "${api_pid}" "${nginx_pid}"
