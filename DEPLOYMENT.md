# Hoon Store Deployment

## Requirements

- Node.js 22 or newer
- Persistent storage for SQLite and uploaded images
- Custom admin secrets before public launch

## Before you deploy

1. Copy `.env.example` to `.env` for local testing
2. Set a secret `ADMIN_PANEL_PATH`
3. Change `ADMIN_USERNAME`, `ADMIN_EMAIL`, and `ADMIN_PASSWORD`
4. Use an `ADMIN_PASSWORD` with at least 10 characters
5. Confirm where `DATA_DIR`, `UPLOADS_DIR`, and `DB_PATH` will live in production

The local SQLite database and uploaded files are runtime data. They do not automatically become part of a clean production deployment unless you move them onto persistent storage yourself.

## Important production guardrails

When `NODE_ENV=production`, the server now refuses to start if:

- `ADMIN_PANEL_PATH` is missing
- Any default admin credential is still active
- `ADMIN_PASSWORD` is shorter than 10 characters

This prevents accidental public deployment with insecure defaults.

## Admin bootstrap behavior

- `ADMIN_USERNAME`, `ADMIN_EMAIL`, and `ADMIN_PASSWORD` seed the initial admin account
- If the database only contains the original default bootstrap admin, startup can migrate that record to the configured `ADMIN_*` values
- If the database already contains real admin records, changing environment variables alone does not rewrite every admin account

If you already have production data, keep a record of the admin credentials stored in the database itself.

## Quick checks

Syntax:

```powershell
node --check server.js
node --check admin.js
node --check script.js
```

Health:

```text
GET /api/health
```

## Render

Use the included `render.yaml`.

The template now sets:

- `NODE_ENV=production`
- `DATA_DIR=/opt/render/project_data/data`
- `UPLOADS_DIR=/opt/render/project_data/uploads`
- `DB_PATH=/opt/render/project_data/data/souq-syria.db`

You still need to set these secret values in Render:

- `ADMIN_PANEL_PATH`
- `ADMIN_USERNAME`
- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`

Keep the mounted disk enabled or your database/uploads will not survive redeploys.

## Railway

Railway works well if you attach a persistent Volume and set production variables explicitly.

Recommended variables:

```text
NODE_ENV=production
ADMIN_PANEL_PATH=/your-secret-admin-path
ADMIN_USERNAME=change-admin-user
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=change-this-strong-password
DATA_DIR=/app/storage/data
UPLOADS_DIR=/app/storage/uploads
DB_PATH=/app/storage/data/souq-syria.db
```

Recommended mount path:

```text
/app/storage
```

Set the Railway health check path to `/api/health`.

## Generic VPS deployment

1. Install Node.js 22+
2. Copy the project to the server
3. Set `NODE_ENV=production`
4. Configure all `ADMIN_*` variables
5. Point storage paths at persistent disk
6. Start with `node server.js`
7. Put a reverse proxy in front of the app if needed

## Final pre-launch checklist

- Visit `/api/health`
- Open the public home page
- Open the admin page through the secret path
- Test member registration/login
- Test courier registration/login
- Create a listing with an uploaded image
- Confirm uploaded files persist after restart
- Confirm admin login and moderation actions work
