# Go-live checklist

Use this checklist for the first VPS release and repeat the release/smoke-test
items for every deployment.

- [ ] Production DNS resolves to the VPS.
- [ ] VPS firewall allows only SSH, HTTP, and HTTPS; PostgreSQL is private.
- [ ] SSH key-only access is configured and root/password login is disabled.
- [ ] `.env.production` exists only on the VPS, is mode 600, and has production
      Clerk/OpenRouter/database credentials.
- [ ] Credentials previously present in local files or Git history are rotated.
- [ ] PostgreSQL backup and restore test are complete.
- [ ] All schema migrations have been reviewed and run once before app startup.
- [ ] OpenRouter catalog sync has been tested, rate-limited, and leaves the
      existing default models as defaults.
- [ ] `npm run lint` and `npm run build` pass for the exact release commit.
- [ ] Image scan and `npm audit` have no unresolved release-blocking findings.
- [ ] Nginx `nginx -t` passes and TLS certificate renewal is configured.
- [ ] `/api/health` returns 200 through both localhost and HTTPS.
- [ ] Sign-in, vote submission, share-link loading, and API reads pass smoke
      tests in a fresh browser session.
- [ ] Logs, backup jobs, disk space, and container health are monitored.
- [ ] Previous image tag, release commit, and rollback procedure are recorded.
