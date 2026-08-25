# Production deployment

The supported production shape is a Next.js standalone container bound to
`127.0.0.1:3000`, with Nginx terminating TLS and proxying to it. The container
uses host networking on the Linux VPS: this keeps a PostgreSQL service bound to
`127.0.0.1:5432` reachable without exposing PostgreSQL on a Docker bridge or the
public interface. A managed database URL works as well.

## One-time VPS setup

1. Point the production DNS A/AAAA record at the VPS and confirm that ports 80
   and 443 are reachable.
2. Install Docker Compose v2, Nginx, and Certbot. Create a deploy directory
   owned by the release user (do not run the application as root).
3. Copy `.env.example` to `.env.production` on the VPS. Replace every
   placeholder with production values, including production Clerk keys and a
   least-privilege PostgreSQL user. Set permissions to `chmod 600
   .env.production`.
4. Confirm PostgreSQL accepts the least-privilege application user at the
   `DATABASE_URL` in `.env.production`. The supplied local-VPS example uses
   `127.0.0.1`; do not change PostgreSQL to listen on a public interface.
   Migrations run from the release image before the application starts.
5. Create Certbot's webroot with `sudo mkdir -p /var/www/certbot`. Copy
   `deploy/nginx/tier-bench-http.conf` to the Nginx sites directory, replace
   the hostname, enable that site, then run `sudo nginx -t && sudo systemctl
   reload nginx`. This bootstrap configuration has no certificate references,
   so Nginx can start before a certificate exists.
6. Issue the initial certificate over HTTP, replacing the example hostname:

   ```sh
   sudo certbot certonly --webroot --webroot-path /var/www/certbot \
     --domain rankings.example.com
   ```

7. Only after Certbot succeeds, replace the bootstrap site with
   `deploy/nginx/tier-bench.conf`. Replace its hostname and certificate paths,
   then run `sudo nginx -t && sudo systemctl reload nginx`. Finally, verify
   renewal with `sudo certbot renew --dry-run`. The TLS configuration keeps the
   HTTP challenge path reachable while redirecting every other HTTP request.

## Release

From the release directory on the VPS:

```sh
set -eu
git fetch --tags origin
git checkout <release-commit-or-tag>
npm ci --ignore-scripts
npm run lint
docker compose --env-file .env.production -f docker-compose.production.yml build --pull
docker compose --env-file .env.production -f docker-compose.production.yml run --rm app npm run db:migrate
docker compose --env-file .env.production -f docker-compose.production.yml up -d
curl --fail --silent --show-error http://127.0.0.1:3000/api/health
docker compose --env-file .env.production -f docker-compose.production.yml ps
```

On a VPS, install the supplied catalog-sync timer so new OpenRouter text
models are imported every ten minutes:

```sh
sudo cp deploy/systemd/tier-bench-catalog-sync.* /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now tier-bench-catalog-sync.timer
sudo systemctl start tier-bench-catalog-sync.service
```

Set `OPENROUTER_CATALOG_SYNC_ENABLED=true` and a strong `CRON_SECRET` in
`.env.production` before enabling the timer. Check the last run with
`systemctl status tier-bench-catalog-sync.service` and `journalctl -u
tier-bench-catalog-sync.service`.

The migration command is intentionally explicit and runs the migration code
and SQL shipped in the same immutable image as the application. Do not silently
start a release if migrations fail. Re-running it is safe: applied versions are
recorded in `schema_migrations` and are not executed twice.

Always pass `--env-file .env.production` to Compose. `env_file` supplies the
running container, while this CLI flag also supplies Compose interpolation for
the Docker build arguments. Clerk's publishable key and route settings, plus the
Turnstile site key, are `NEXT_PUBLIC_*` values and must be present during
`next build`; server-side secret keys remain runtime-only and are never Docker
build arguments.
The Turnstile site key is public and is embedded at build time as well; its
secret is supplied only through the runtime environment.

If port 3000 is already occupied on a shared VPS, set `APP_PORT` in
`.env.production` to another unused loopback port and update the Nginx
`proxy_pass` target to match. The container health check follows the same
setting automatically.

Keep `APP_HOSTNAME=localhost` (the default). Although `127.0.0.1` is also a
loopback address, Next.js 16 can misclassify middleware rewrites when that
literal is used behind TLS termination and proxy them back to its HTTP listener
as HTTPS.

`docker-compose.production.yml` uses Linux host networking, binds the Next.js
listener to `localhost`, runs as the image's unprivileged `nextjs` user, uses a
read-only root filesystem, and restarts a failed process. Nginx remains the only
public application listener. Host networking is intentional for the supported
VPS deployment and is not portable to Docker Desktop in the same way.

## Rollback

Keep the previous image tag and database backup until the new release has
passed smoke tests. To roll back the application:

```sh
docker compose --env-file .env.production -f docker-compose.production.yml down
IMAGE_TAG=<previous-tag> docker compose --env-file .env.production -f docker-compose.production.yml up -d
curl --fail --silent --show-error http://127.0.0.1:3000/api/health
```

Only roll back database migrations with a tested down migration or a verified
backup restore. Never improvise a destructive schema rollback on the live
database. Capture logs before replacing a failed release:

```sh
docker compose --env-file .env.production -f docker-compose.production.yml logs --since=30m app > /tmp/tier-bench-release.log
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
