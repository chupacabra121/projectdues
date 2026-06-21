# Deploying SimpleDues

SimpleDues stores everything (accounts, budgets, member rosters) in a single
SQLite file. Two environment variables make a production deploy safe.

## Required environment variables

| Variable | What | Notes |
|----------|------|-------|
| `SESSION_SECRET` | Signing key for session cookies | **Required in production.** The app refuses to start a session without it — there is no insecure fallback. Generate one with `openssl rand -base64 32`. |
| `DATABASE_PATH` | Absolute path to the SQLite database file | Point this at a **persistent volume** so data survives redeploys, e.g. `/data/simpledues.db`. Defaults to `./data/simpledues.db` for local dev. |

## Railway (the most important part)

By default a Railway container's filesystem is **ephemeral** — every redeploy
or restart starts from a fresh disk. Without a volume, a routine deploy wipes
every chapter's budget and roster, unrecoverably. To prevent that:

1. **Add a volume** — Service → *Settings → Volumes* → add one, mount path `/data`.
2. **Set variables** — Service → *Variables*:
   - `SESSION_SECRET` = output of `openssl rand -base64 32`
   - `DATABASE_PATH` = `/data/simpledues.db`
3. **Redeploy.** The database now lives on the volume and survives future deploys.

> Verify it worked: create an account, redeploy, and confirm you can still log in.

## Backups

On every boot — **before** running any migration — the app snapshots the
database to `<DATABASE_PATH dir>/backups/` (e.g. `/data/backups/`), keeping the
newest ~10. So a bad migration or a corrupted write is always recoverable: stop
the app, copy a snapshot set (`simpledues.db.<timestamp>` plus any `-wal`/`-shm`
companions) back over the live files, and restart.

These backups live on the **same volume** as the database — they protect
against software faults, not against losing the volume itself. For off-site
durability, periodically download the volume contents or add an external backup
to object storage.

## Local development

No setup needed: the DB defaults to `./data/simpledues.db` (gitignored) and a
dev-only session secret is used automatically. `npm run dev` and go.
