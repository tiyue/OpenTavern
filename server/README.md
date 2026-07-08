# OpenTavern Sync Server

Standalone Python/SQLite backend for OpenTavern cloud sync. It mirrors the
Cloudflare Pages `/api/sync` protocol and is intended for small VPS deployments
that do not run Cloudflare Functions.

## Files

- `opentavern_sync_server.py`: stdlib-only HTTP sync API.
- `opentavern-sync.service`: systemd service template.
- `nginx-opentavern-sync-location.conf`: Nginx location template.

## Default Endpoint

The service listens on `127.0.0.1:8787`. With the Nginx location template, the
public endpoint becomes:

```text
http://<server>:8088/opentavern-sync
```

Use this full URL in OpenTavern's Cloud Sync endpoint field when the app is
opened from `file://` or from a different host.

## API

- `GET /opentavern-sync?health=1`: health check.
- `GET /opentavern-sync`: read current snapshot by token.
- `HEAD /opentavern-sync`: read snapshot metadata.
- `POST /opentavern-sync`: upload snapshot.
- `DELETE /opentavern-sync`: delete snapshot.

Authentication uses either `Authorization: Bearer <token>` or
`X-OpenTavern-Token: <token>`. Tokens are stored only as SHA-256 hashes.
