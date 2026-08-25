#!/bin/sh
set -eu

: "${APP_PORT:?APP_PORT must be set}"
: "${CRON_SECRET:?CRON_SECRET must be set}"

# Use curl's stdin config so the bearer token is not exposed in the process
# command line while the request is running.
printf 'header = "Authorization: Bearer %s"\n' "$CRON_SECRET" \
  | /usr/bin/curl --config - --fail-with-body --silent --show-error --retry 2 \
      --request POST "http://localhost:$APP_PORT/api/admin/models/sync" \
      --header "Accept: application/json"

