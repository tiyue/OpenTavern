# OpenTavern Cloud Sync

Cloud Sync stores the same application snapshot used by local persistence:

- conversations
- settings
- character cards
- world books
- active conversation metadata

The browser keeps using local storage first. Cloud Sync is an additional backup and restore layer.

## Cloudflare D1 Setup

Create a D1 database:

```bash
wrangler d1 create opentavern-sync
```

Then update `wrangler.toml`:

```toml
[[d1_databases]]
binding = "SYNC_DB"
database_name = "opentavern-sync"
database_id = "your-d1-database-id"
```

The sync table is created automatically by `functions/api/sync.js`.

## Client Settings

Open Settings -> Cloud Sync.

- Endpoint: `/api/sync` for the bundled Cloudflare Pages Function.
- Sync Token: a long private token. The token identifies your personal cloud snapshot.
- Sync now: compares local and cloud timestamps, then downloads the newer cloud snapshot or uploads the newer local snapshot.
- Upload now: force-uploads the current local snapshot and overwrites the cloud snapshot for this token.
- Download now: restores the cloud snapshot for this token.
- Auto upload: uploads after local saves. It first checks the remote timestamp and skips the upload when the cloud snapshot is newer or cannot be verified.
- Encrypt payload: encrypts the snapshot in the browser before upload.
- Encryption passphrase: required to restore encrypted snapshots.

The sync token, encryption passphrase, and API keys are not uploaded inside the cloud snapshot.

## API

`POST /api/sync`

Uploads a snapshot. Authentication can use either:

```http
Authorization: Bearer <token>
```

or:

```http
X-OpenTavern-Token: <token>
```

`GET /api/sync`

Downloads the snapshot for the same token.

Different tokens map to isolated snapshots.
