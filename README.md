# Forseen

A personal workspace with room for new apps as tabs. The first app is **Feedback calls**. All app code lives in `call_4_feedback/`.

## Open locally

On your laptop, in this repository:

```powershell
cd call_4_feedback
npm run dev
```

Open **http://localhost:3010**. Node.js 22.13+ is required; there are no packages to install. The prepared local preview includes your 103 contacts. The sheet was used only to prepare the starting data; everyday use needs no spreadsheet.

## Deploy on your VPS

**Domain:** `forseen.haguma.com` · **Caddy upstream:** `frontend_forseen:80` · **VPS folder:** your chosen checkout directory.

First time only: upload the private `forseen-vps-setup.zip` from this laptop to the root of your VPS checkout, then extract it there:

```bash
unzip forseen-vps-setup.zip
```

It supplies `.env` and `private-data/initial-contacts.enc`. The `.env` contains the generated `APP_PASSWORD` for sign-in and `INITIAL_DATA_KEY` to unlock the 103 starting contacts. You may change `APP_PASSWORD` to your own password of at least 12 characters; keep `INITIAL_DATA_KEY` exactly as supplied. These private files stay out of Git and Docker images. Keep a private backup of the setup ZIP. You never need the spreadsheet again.

Add this block to your existing shared Caddyfile:

```caddyfile
forseen.haguma.com {
    reverse_proxy frontend_forseen:80
}
```

Validate that Caddyfile with your existing Caddy container and mounted file before restarting/reloading it. The actual container name and mount were not available in this checkout. The existing external network `caddy_network` must already exist.

Then, for the first start **and every update**, from the repository root in your VPS checkout:

```bash
git pull --ff-only origin main
RELEASE_TAG=$(git rev-parse --short HEAD) docker compose up -d --build
```

If your VPS uses standalone Compose, replace `docker compose` with `docker-compose`.

Open **https://forseen.haguma.com**, sign in using `APP_PASSWORD` from your `.env`. The 103 contacts and their original feedback load automatically on the first start. The app is the source of truth from then on; it does not read or update the sheet. The repository is public: all contact data (including the encrypted starter), decryption keys, passwords, source workbook and databases stay out of Git and Docker images. The private starter is mounted read-only into the backend. Later starts preserve the database and never overwrite your saved feedback with the starter data. No VPS rollout was performed from the laptop.

For a fresh VPS checkout, clone `https://github.com/FabHaguma/foreseable.git` into the folder you choose first. No host ports are published; Caddy connects to `frontend_forseen` on internal port **80**. Its API uses `backend_forseen:3010` on a private network.

## Use the call app

- Select a name, search by name/code/number, or filter by code and call status. Phones have a collapsible **Browse list**.
- **Call** saves the server's current date/time and opens your device's dialer. This logs an attempt, not an answered call. Laptops require a calling app; phones use the dialer.
- C/D codes followed by a number hide **Where they are & what to do**. Other codes show it when populated.
- Feedback uses the original sheet's fields and dropdown choices. Edits save automatically, or use **Save feedback** / **Save & next person**. A visible error keeps unsaved edits on screen. Conflicting edits require reloading; copy unsaved notes first.
- **Download CSV** exports the entire list with Code, Name, Number, Called on, Reached, Why they had not started, Result, Promised for, Notes and Opened Seen. It includes the latest saved feedback even when the list is filtered. UTF-8 supports names and multiline notes. Formula-like cells (including +phone numbers) are prefixed with an apostrophe for safe spreadsheet opening.
- Existing time-only entries stay as times with no invented date. New attempts have a full timestamp, displayed in your device's local time. The original workbook is never changed.

## Persistence and recovery

Production data lives in the `forseen_forseen_data` volume. Pulls, rebuilds and restarts preserve it. Do not run `docker compose down -v`.

Before upgrades, create a consistent SQLite snapshot on the VPS:

```bash
docker compose exec backend_forseen node backend/backup.js
```

It prints the snapshot path under `/data/backups/`. Download snapshots to separate storage using your usual VPS backup method. For a restore, stop `backend_forseen`, preserve the current data directory, restore a snapshot as `/data/forseen.sqlite` with ownership `node:node` (UID/GID 1000), and remove old WAL/SHM sidecars only while stopped. Restart and verify the count and a saved record. Test restoration on a separate copy first. A SQLite snapshot also preserves call history.

The recommended update command tags images by Git commit. Keep previous images for rollback. For a code rollback, temporarily set both Compose service images to the previous commit tag and run `docker compose up -d --no-build`; preserve the data volume. Schema version 1 is tracked in `schema_migrations`; future migrations require a backup and compatibility review.

VPS checks:

```bash
docker compose ps
docker compose logs --tail=60 backend_forseen frontend_forseen
curl -fsS https://forseen.haguma.com/api/v1/health
```

Native checks and browser verification run locally. Container builds and shared Caddy configuration need verification on the VPS.

## Add another app

Register a plain JS module in `call_4_feedback/frontend/assets/js/apps.js` with an ID, title, icon, description and `mount(main)` function. It appears as a tab and workspace card. Add endpoints/tables only when needed. Authentication and the app shell are shared.

## Development checks

From `call_4_feedback/`: `npm test`. Tests use fictional contacts and disposable databases. To prepare the local-only seed from the workbook: `python scripts/prepare-local-sheet.py` (used only when the local database is empty). The encrypted starter bundle is prepared once with `node scripts/prepare-initial-data.js`; it is never used to overwrite an existing database. Do not regenerate it for routine releases. To run a separate checkout without the local preview data, use `node --env-file=../.env backend/server.js` from the app directory.
