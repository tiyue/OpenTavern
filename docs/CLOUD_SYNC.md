# OpenTavern Cloud Sync

Cloud Sync stores the same application snapshot used by local persistence:

- conversations
- settings
- character cards
- world books
- active conversation metadata

The browser keeps using local storage first. Cloud Sync is an additional backup and restore layer.

## Portable Settings

All ordinary application settings are portable by default. This includes model and generation
parameters, user personas, system and post-history prompts, summary and world-book controls,
interface and streaming behavior, language, card order, and image-generation behavior that does
not contain credentials.

The complete normalized SillyTavern preset is part of `settings`: prompt text, prompt order,
enablement, placement and depth, imported metadata, regular-expression scripts, and their consent
state all round-trip through cloud snapshots. Changes to any portable setting participate in the
automatic-upload signature.

The following values remain local and are omitted from uploaded settings:

- main and summary API keys, plus the local "save API key" preference;
- image-gateway endpoint and access token;
- cloud-sync enablement, auto-upload, endpoint, token, encryption flag, and passphrase;
- cloud-sync timestamps and status text;
- any future top-level setting whose name identifies an access token, API key, password,
  passphrase, credential, private key, or secret.

Main and summary API endpoints are portable when a device has no corresponding local key. If a
device already has a local key, applying a remote snapshot keeps the endpoint paired with that key,
so a downloaded endpoint cannot redirect an existing credential. Announcement dismissal,
onboarding completion, backup reminders, and storage-backend status are device lifecycle state,
not portable application settings.

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

Incremental encryption is reserved in the v2 manifest but is not implemented yet. New encrypted
uploads are disabled for every protocol: an enabled legacy setting is rejected before metadata,
snapshot, or upload requests, with no v1 fallback and no plaintext retry. Existing encrypted v1
AES-GCM snapshots remain readable for compatibility.

Plaintext v2 content addressing does not require a secure browser context. When `crypto.subtle`
is unavailable on an HTTP/IP page, the client uses an asynchronous JavaScript SHA-256 fallback.
WebCrypto is still required when decrypting an existing legacy AES-GCM snapshot.

## Cloudflare D1 Setup

### ChatGPT Sites

The Sites build declares the logical D1 binding `DB` in `.openai/hosting.json`. Its schema lives in
`db/schema.ts`, and generated migrations live in `drizzle/`. `npm run build:sites` packages those
migrations under `dist/.openai/drizzle/` and routes the same-origin `/api/sync` endpoint through the
Sites Worker.

The first Sites D1 database starts empty. It does not inherit browser storage or an existing
Cloudflare Pages D1 database. Export a v3 backup from the most complete old source, import it on the
Sites origin, then use Upload now to seed D1. Confirm restoration with Download now from another
browser or device before relying on the new database.

### Standalone Cloudflare Pages

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

The sync tables are also created idempotently by `functions/api/sync.js` for compatibility with
existing Pages deployments.

## Client Settings

Open Settings -> Cloud Sync.

- Endpoint: `/api/sync` for the bundled Cloudflare Pages Function.
- Sync Token: a long private token. The token identifies your personal cloud snapshot.
- Sync now: compares only the local and cloud `lastSaved` values, then downloads the newer cloud snapshot or uploads the newer local snapshot.
- Upload now: force-uploads the current local snapshot and overwrites the cloud snapshot for this token.
- Download now: restores the cloud snapshot for this token.
- Auto upload: uploads after local saves. It uses only `lastSaved` to compare local and cloud data, and skips the upload when the cloud snapshot is newer or cannot be verified.
- Encrypt payload: reserved and unavailable for new uploads. New users cannot enable it. If an old
  local setting is still enabled, use the explicit disable button; that action only saves the setting
  and cancels queued auto-upload, so a separate upload action is required before plaintext is sent.
- Encryption passphrase: required to restore existing encrypted v1 snapshots.

The sync token, encryption passphrase, API keys, and other local-only values listed above are not
uploaded inside the cloud snapshot.

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
