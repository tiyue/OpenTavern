# OpenTavern Cloud Sync

Cloud Sync stores the same application snapshot used by local persistence:

- conversations
- settings
- character cards
- world books
- active conversation metadata

The browser keeps using local storage first. Cloud Sync is an additional backup and restore layer.

## Incremental Sync Protocol

New clients prefer protocol v2. A snapshot is split into settings, individual conversations,
individual character cards, individual world books, and small metadata values. Each object is
addressed by its SHA-256 hash and transferred in fixed small chunks of 393216 bytes.

Only objects whose content hash changed are uploaded. A manifest references the complete object
set, and the backend switches to the new manifest with a revision precondition so another device
cannot be overwritten silently. V2 has no fixed application-layer upper bound on total synchronized
data. Practical capacity is constrained by the fixed per-chunk boundary, available memory,
database or platform storage, and request duration or timeout limits.

Content-addressed chunks are immutable. Re-uploading the same chunk is idempotent, while attempting
to replace the same object hash and chunk index with different data is rejected as a conflict.

Local-versus-cloud recency is determined solely by the snapshot's `lastSaved` value.

Protocol v1 remains available for existing deployments and old snapshots. When a v2-capable
backend has only a v1 snapshot, the client can still download it and a later forced upload migrates
the data to v2.

Incremental encryption is reserved in the v2 manifest but is not implemented yet. Enabling
encryption blocks v2 upload with a clear error instead of uploading plaintext. Existing encrypted
v1 AES-GCM snapshots remain readable for compatibility.

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
- Sync now: compares only the local and cloud `lastSaved` values, then downloads the newer cloud snapshot or uploads the newer local snapshot.
- Upload now: force-uploads the current local snapshot and overwrites the cloud snapshot for this token.
- Download now: restores the cloud snapshot for this token.
- Auto upload: uploads after local saves. It uses only `lastSaved` to compare local and cloud data, and skips the upload when the cloud snapshot is newer or cannot be verified.
- Encrypt payload: currently available only for legacy v1 uploads. Protocol v2 keeps the setting
  and manifest fields reserved but blocks encrypted upload until incremental encryption is implemented.
- Encryption passphrase: required to restore existing encrypted v1 snapshots.

The sync token, encryption passphrase, and API keys are not uploaded inside the cloud snapshot.

## API

### Protocol v2

- `GET /api/sync?v=2&op=meta`: read the current manifest revision and object reference.
- `GET /api/sync?v=2&op=chunk&hash=<sha256>&index=<n>`: download one object chunk.
- `POST /api/sync?v=2&op=chunk`: upload one content-addressed object chunk.
- `POST /api/sync?v=2&op=commit`: atomically commit a manifest using `expectedRevision`.
- `DELETE /api/sync?v=2`: delete the current manifest, optionally protected by `If-Match`.

`GET /api/sync?health=1` advertises supported protocols and the required chunk size.

### Protocol v1

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
