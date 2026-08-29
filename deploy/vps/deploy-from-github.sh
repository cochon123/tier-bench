#!/usr/bin/env bash

set -Eeuo pipefail

PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
export PATH
umask 027

readonly APP_DIR="/opt/tier-bench"
readonly COMPOSE_FILE="docker-compose.production.yml"
readonly ENV_FILE=".env.production"
readonly CONTAINER_NAME="tier-bench-app-1"

git_repo() {
  runuser --user tierbench -- git -C "$APP_DIR" "$@"
}

compose() {
  local image_tag="$1"
  shift
  IMAGE_TAG="$image_tag" docker compose \
    --env-file "$APP_DIR/$ENV_FILE" \
    --file "$APP_DIR/$COMPOSE_FILE" \
    --project-directory "$APP_DIR" \
    "$@"
}

check_prerequisites() {
  test -d "$APP_DIR/.git"
  test -r "$APP_DIR/$ENV_FILE"
  test -x /usr/bin/docker
  test -x /usr/bin/git
  test -x /usr/bin/curl
  id tierbench >/dev/null
  docker compose version >/dev/null
}

if [[ "${1:-}" == "check" ]]; then
  check_prerequisites
  printf 'tier-bench deploy hook is ready\n'
  exit 0
fi

readonly RELEASE_SHA="${1:-}"
if [[ ! "$RELEASE_SHA" =~ ^[0-9a-f]{40}$ ]]; then
  printf 'Expected a full 40-character lowercase Git commit SHA.\n' >&2
  exit 64
fi

check_prerequisites

exec 9>/run/lock/tier-bench-deploy.lock
if ! flock --nonblock 9; then
  printf 'Another tier-bench deployment is already running.\n' >&2
  exit 75
fi

if [[ -n "$(git_repo status --porcelain=v1 --untracked-files=all)" ]]; then
  printf 'Refusing to deploy over a dirty VPS worktree.\n' >&2
  git_repo status --short >&2
  exit 65
fi

readonly PREVIOUS_SHA="$(git_repo rev-parse HEAD)"
readonly PREVIOUS_IMAGE="$(docker inspect --format '{{.Config.Image}}' "$CONTAINER_NAME" 2>/dev/null || true)"
readonly PREVIOUS_TAG="${PREVIOUS_IMAGE#tier-bench:}"
readonly RELEASE_TAG="${RELEASE_SHA:0:12}"

rollback_application() {
  printf 'Rolling the application back to %s.\n' "$PREVIOUS_SHA" >&2
  git_repo checkout --detach "$PREVIOUS_SHA"
  if [[ "$PREVIOUS_IMAGE" == tier-bench:* ]] && docker image inspect "$PREVIOUS_IMAGE" >/dev/null 2>&1; then
    compose "$PREVIOUS_TAG" up --detach --force-recreate
  else
    printf 'Previous image %s is unavailable; manual recovery is required.\n' "$PREVIOUS_IMAGE" >&2
  fi
}

git_repo fetch --prune origin main
git_repo cat-file -e "$RELEASE_SHA^{commit}"
if ! git_repo merge-base --is-ancestor "$RELEASE_SHA" origin/main; then
  printf 'Refusing to deploy a commit that is not on origin/main.\n' >&2
  exit 66
fi

git_repo checkout --detach "$RELEASE_SHA"

if ! compose "$RELEASE_TAG" build --pull; then
  git_repo checkout --detach "$PREVIOUS_SHA"
  exit 1
fi

if ! compose "$RELEASE_TAG" run --rm app npm run db:migrate; then
  git_repo checkout --detach "$PREVIOUS_SHA"
  exit 1
fi

if ! compose "$RELEASE_TAG" up --detach --force-recreate; then
  rollback_application
  exit 1
fi

health_status="starting"
for _attempt in {1..60}; do
  health_status="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$CONTAINER_NAME" 2>/dev/null || true)"
  if [[ "$health_status" == "healthy" ]]; then
    break
  fi
  sleep 2
done

if [[ "$health_status" != "healthy" ]]; then
  compose "$RELEASE_TAG" logs --since=10m app >&2 || true
  rollback_application
  exit 1
fi

app_port="$(docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' "$CONTAINER_NAME" | awk -F= '$1 == "PORT" { print $2; exit }')"
if [[ ! "$app_port" =~ ^[0-9]+$ ]]; then
  printf 'Could not determine the application health-check port.\n' >&2
  rollback_application
  exit 1
fi

host_health_ready="false"
for _attempt in {1..15}; do
  if curl --fail --silent --show-error --max-time 5 "http://127.0.0.1:${app_port}/api/health" >/dev/null; then
    host_health_ready="true"
    break
  fi
  sleep 2
done

if [[ "$host_health_ready" != "true" ]]; then
  compose "$RELEASE_TAG" logs --since=10m app >&2 || true
  rollback_application
  exit 1
fi

compose "$RELEASE_TAG" ps
printf 'deployed_sha=%s\n' "$RELEASE_SHA"
printf 'deployed_image=tier-bench:%s\n' "$RELEASE_TAG"
