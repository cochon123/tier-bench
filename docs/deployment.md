# Production deployment

The supported production shape is a Next.js standalone container bound to
`127.0.0.1:3000`, with Nginx terminating TLS and proxying to it. PostgreSQL is
external to the application container; use the VPS PostgreSQL service or a
managed database and set `DATABASE_URL` in the production environment file.

## One-time VPS setup

1. Point the production DNS A/AAAA record at the VPS and confirm that ports 80
   and 443 are reachable.
2. Install Docker Compose v2, Nginx, and Certbot. Create a deploy directory
   owned by the release user (do not run the application as root).
3. Copy `.env.example` to `.env.production` on the VPS. Replace every
   placeholder with production values, including production Clerk keys and a
   least-privilege PostgreSQL user. Set permissions to `chmod 600
   .env.production`.
4. Apply the database migrations from the release before starting the app.
   Migrations must be run once, from a controlled release shell, and should be
   backward-compatible with the currently running version.
5. Copy `deploy/nginx/tier-bench.conf` to the Nginx sites directory, replace
   the hostname and certificate paths, run `nginx -t`, then obtain the TLS
   certificate with Certbot and reload Nginx.

## Release

From the release directory on the VPS:

```sh
set -eu
git fetch --tags origin
git checkout <release-commit-or-tag>
npm ci --ignore-scripts
npm run lint
docker compose -f docker-compose.production.yml build --pull
docker compose -f docker-compose.production.yml run --rm app npm run db:migrate
docker compose -f docker-compose.production.yml up -d
curl --fail --silent --show-error http://127.0.0.1:3000/api/health
docker compose -f docker-compose.production.yml ps
```

The migration command is intentionally explicit: the persistence layer should
provide the `db:migrate` script before the first production release. Do not
silently start a release if migrations fail. If a release has no migrations,
replace that line with the project's documented no-op check.

`docker-compose.production.yml` publishes only loopback, runs as the image's
unprivileged `nextjs` user, uses a read-only root filesystem, and restarts a
failed process. Nginx remains the only public application listener.

## Rollback

Keep the previous image tag and database backup until the new release has
passed smoke tests. To roll back the application:

```sh
docker compose -f docker-compose.production.yml down
IMAGE_TAG=<previous-tag> docker compose -f docker-compose.production.yml up -d
curl --fail --silent --show-error http://127.0.0.1:3000/api/health
```

Only roll back database migrations with a tested down migration or a verified
backup restore. Never improvise a destructive schema rollback on the live
database. Capture logs before replacing a failed release:

```sh
docker compose -f docker-compose.production.yml logs --since=30m app > /tmp/tier-bench-release.log
```

## Backups and operations

- Enable daily PostgreSQL backups with an off-host copy and periodically test
  restoration. A backup that has not been restored is not a recovery plan.
- Keep at least one previous image and release manifest. Review `docker compose
  ps`, application logs, disk space, and PostgreSQL health after each release.
- Restrict SSH to keys, disable password authentication, and allow only 22, 80,
  and 443 through the VPS firewall. PostgreSQL should listen on localhost or a
  private network, never the public interface.
- Rotate Clerk, OpenRouter, database, Turnstile, and deploy credentials if they
  are exposed. The historical `.env.local` file was tracked in this repository;
  remove it from Git and rotate any keys that were ever stored in it.
- Keep `OPENROUTER_CATALOG_SYNC_ENABLED=false` until the catalog sync job has
  been reviewed and given a protected scheduler endpoint. The existing model
  rows remain the defaults; importing the OpenRouter catalog must not replace
  or demote those defaults.

## Smoke checks

After Nginx is reloaded, verify:

```sh
curl --fail --silent --show-error https://rankings.example.com/api/health
curl --head --fail https://rankings.example.com/
```

Confirm the health response is `200`, the site redirects HTTP to HTTPS, Clerk
sign-in works with production keys, authenticated ranking writes persist after
a fresh browser session, and the public API returns database-backed values.
