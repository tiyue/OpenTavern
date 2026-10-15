import base64
import hashlib
import json
import re
from . import config as backend_config


def hash_token(token):
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def get_token(headers):
    auth = headers.get("Authorization", "")
    if auth.lower().startswith("bearer "):
        return auth[7:].strip()
    return headers.get("X-OpenTavern-Token", "").strip()


def validate_token(token):
    if not token or len(token) < 8:
        return "A sync token with at least 8 characters is required.", 401
    if len(token) > 512:
        return "Sync token is too long.", 400
    return None, None


def parse_v2_integer(value, name, minimum=0, maximum=9007199254740991):
    if isinstance(value, bool) or not isinstance(value, int):
        raise ValueError("%s must be an integer." % name)
    if value < minimum or value > maximum:
        raise ValueError("%s is out of range." % name)
    return value


def normalize_v2_hash(value, name):
    if not isinstance(value, str):
        raise ValueError("%s must be a SHA-256 hash." % name)
    value = value.strip().lower()
    if not backend_config.SYNC_V2_HASH_PATTERN.fullmatch(value):
        raise ValueError("%s must be a 64-character SHA-256 hash." % name)
    return value


def parse_v2_chunk_payload(body):
    if not backend_config.is_plain_object(body):
        raise ValueError("Invalid sync chunk payload.")
    object_hash = normalize_v2_hash(body.get("objectHash"), "objectHash")
    chunk_hash = normalize_v2_hash(body.get("chunkHash"), "chunkHash")
    index = parse_v2_integer(body.get("index"), "index")
    total = parse_v2_integer(body.get("total"), "total", minimum=1)
    if index >= total:
        raise ValueError("index must be smaller than total.")

    encoded = body.get("data")
    if not isinstance(encoded, str):
        raise ValueError("data must be a base64 string.")
    if len(encoded) > backend_config.SYNC_V2_MAX_BASE64_CHARS:
        raise OverflowError("Encoded sync chunk is too large.")
    try:
        raw = base64.b64decode(encoded, validate=True)
    except Exception as error:
        raise ValueError("data must be valid base64.") from error
    if not raw or len(raw) > backend_config.SYNC_V2_CHUNK_BYTES:
        raise OverflowError("Sync chunk is too large or empty.")
    if index < total - 1 and len(raw) != backend_config.SYNC_V2_CHUNK_BYTES:
        raise ValueError("Every non-final sync chunk must be exactly %s bytes." % backend_config.SYNC_V2_CHUNK_BYTES)
    if hashlib.sha256(raw).hexdigest() != chunk_hash:
        raise ValueError("chunkHash does not match the decoded chunk data.")
    return {
        "object_hash": object_hash,
        "chunk_hash": chunk_hash,
        "index": index,
        "total": total,
        "data": encoded,
        "bytes": len(raw),
    }


def parse_v2_commit_payload(body):
    if not backend_config.is_plain_object(body):
        raise ValueError("Invalid sync commit payload.")
    return {
        "expected_revision": parse_v2_integer(body.get("expectedRevision"), "expectedRevision"),
        "manifest_hash": normalize_v2_hash(body.get("manifestHash"), "manifestHash"),
        "manifest_chunks": parse_v2_integer(
            body.get("manifestChunks"),
            "manifestChunks",
            minimum=1,
        ),
        "manifest_bytes": parse_v2_integer(
            body.get("manifestBytes"),
            "manifestBytes",
            minimum=1,
        ),
        "last_saved": parse_v2_integer(body.get("lastSaved"), "lastSaved"),
    }


def parse_v2_if_match(headers):
    raw = headers.get("If-Match")
    if raw is None or raw.strip() == "":
        return None
    raw = raw.strip()
    if raw.startswith("W/"):
        raw = raw[2:].strip()
    if len(raw) >= 2 and raw[0] == '"' and raw[-1] == '"':
        raw = raw[1:-1]
    if not re.fullmatch(r"\d+", raw):
        raise ValueError("If-Match must contain a non-negative revision.")
    return parse_v2_integer(int(raw), "If-Match")


def v2_headers(meta=None, revision=None, extra=None):
    headers = dict(extra or {})
    headers["X-OpenTavern-Protocol"] = "2"
    if meta is not None:
        revision = int(meta["revision"])
        headers["X-OpenTavern-Updated-At"] = str(int(meta["updated_at"]))
        headers["ETag"] = '"%s"' % revision
    if revision is not None:
        revision = int(revision)
        headers["X-OpenTavern-Revision"] = str(revision)
    return headers


def normalize_encrypted_iterations(value):
    iterations = 210000 if value in (None, "") else value
    try:
        iterations = int(iterations)
    except (TypeError, ValueError):
        raise ValueError("Invalid encrypted sync payload.")
    if iterations < 1:
        raise ValueError("Invalid encrypted sync payload.")
    return iterations


def is_non_empty_string(value):
    return isinstance(value, str) and value.strip() != ""


def validate_encrypted_snapshot(snapshot):
    if not (
        is_non_empty_string(snapshot.get("payload"))
        and is_non_empty_string(snapshot.get("iv"))
        and is_non_empty_string(snapshot.get("salt"))
    ):
        raise ValueError("Invalid encrypted sync payload.")
    if snapshot.get("algorithm") != "AES-GCM":
        raise ValueError("Unsupported encrypted sync payload algorithm.")
    if snapshot.get("kdf") not in (None, "PBKDF2-SHA256"):
        raise ValueError("Unsupported encrypted sync payload key derivation.")
    snapshot["iterations"] = normalize_encrypted_iterations(snapshot.get("iterations"))


def normalize_conversation_order(snapshot):
    conversations = snapshot.get("conversations", {})
    known = set(conversations.keys())
    seen = set()
    order = []
    if isinstance(snapshot.get("conversationOrder"), list):
        for conv_id in snapshot["conversationOrder"]:
            if conv_id in known and conv_id not in seen:
                seen.add(conv_id)
                order.append(conv_id)
    for conv_id in conversations.keys():
        if conv_id not in seen:
            seen.add(conv_id)
            order.append(conv_id)
    snapshot["conversationOrder"] = order


def normalize_active_conversation(snapshot):
    conversations = snapshot.get("conversations", {})
    active = snapshot.get("activeConvId")
    if active not in conversations:
        snapshot["activeConvId"] = snapshot.get("conversationOrder", [None])[0] if snapshot.get("conversationOrder") else None


def extract_snapshot(body):
    snapshot = body.get("data") if isinstance(body, dict) and "data" in body else body
    if not backend_config.is_plain_object(snapshot):
        raise ValueError("Invalid sync payload.")
    if isinstance(body, dict) and body.get("encrypted") is True:
        snapshot["encrypted"] = True
    if snapshot.get("encrypted") is True:
        validate_encrypted_snapshot(snapshot)
        snapshot["lastSaved"] = backend_config.normalize_timestamp(snapshot.get("lastSaved") or body.get("updatedAt") if isinstance(body, dict) else None)
        return snapshot

    snapshot["conversations"] = backend_config.normalize_object_map(snapshot.get("conversations"))
    snapshot["settings"] = backend_config.normalize_object_map(snapshot.get("settings"))
    snapshot["characters"] = backend_config.normalize_object_map(snapshot.get("characters"))
    snapshot["worldBooks"] = backend_config.normalize_object_map(snapshot.get("worldBooks"))
    normalize_conversation_order(snapshot)
    normalize_active_conversation(snapshot)
    snapshot["charactersMigrated"] = backend_config.normalize_boolean(snapshot.get("charactersMigrated"))
    snapshot["lastSaved"] = backend_config.normalize_timestamp(snapshot.get("lastSaved"))
    return snapshot


def parse_expected_updated_at(headers):
    raw = headers.get("X-OpenTavern-If-Match-Updated-At") or headers.get("If-Match")
    if not raw:
        return None
    value = raw.strip()
    if value.startswith("W/"):
        value = value[2:]
    value = value.strip('"')
    if value == "*":
        return "*"
    try:
        timestamp = int(float(value))
    except ValueError:
        raise ValueError("Invalid sync precondition timestamp.")
    if timestamp < 0:
        raise ValueError("Invalid sync precondition timestamp.")
    return timestamp


def assert_precondition(expected_updated_at, current_row):
    if expected_updated_at is None:
        return
    if expected_updated_at == "*":
        if not current_row:
            error = RuntimeError("Cloud snapshot does not exist.")
            error.status = 412
            error.current_updated_at = None
            raise error
        return
    current = int(current_row["updated_at"]) if current_row else 0
    if current != expected_updated_at:
        error = RuntimeError("Cloud snapshot was modified by another client.")
        error.status = 409
        error.current_updated_at = current if current_row else None
        raise error


def next_updated_at(current_row):
    current = int(current_row["updated_at"]) if current_row else 0
    return max(backend_config.now_ms(), current + 1)


def metadata_headers(row, data=None, extra=None):
    headers = dict(extra or {})
    if not row:
        return headers
    data_text = row["data"] if data is None else data
    headers["ETag"] = '"{}"'.format(int(row["updated_at"]))
    headers["X-OpenTavern-Updated-At"] = str(int(row["updated_at"]))
    headers["X-OpenTavern-Data-Bytes"] = str(backend_config.byte_length(data_text or ""))
    try:
        parsed = json.loads(data_text)
        headers["X-OpenTavern-Encrypted"] = "true" if parsed.get("encrypted") is True else "false"
    except Exception:
        pass
    return headers
