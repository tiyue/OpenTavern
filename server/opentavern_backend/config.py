import re
import time


MAX_IMAGE_REQUEST_BYTES = 16 * 1024 * 1024


MAX_IMAGE_BYTES = 20 * 1024 * 1024


MAX_REFERENCE_IMAGE_BYTES = 10 * 1024 * 1024


MAX_REFERENCE_IMAGE_DIMENSION = 3072


SYNC_V2_CHUNK_BYTES = 384 * 1024


SYNC_V2_MAX_BASE64_CHARS = 600000


MAX_PROMPT_CHARS = 5000


MAX_NEGATIVE_PROMPT_CHARS = 500


MAX_IMAGE_SEED = 2147483647


DEFAULT_IMAGE_MAX_CONCURRENT = 2


MIN_IMAGE_MAX_CONCURRENT = 1


MAX_IMAGE_MAX_CONCURRENT = 32


DEFAULT_IMAGE_REQUESTS_PER_MINUTE = 10


MIN_IMAGE_REQUESTS_PER_MINUTE = 1


MAX_IMAGE_REQUESTS_PER_MINUTE = 600


DEFAULT_IMAGE_MAX_STORAGE_BYTES = 5 * 1024 * 1024 * 1024


MIN_IMAGE_MAX_STORAGE_BYTES = 100 * 1024 * 1024


MAX_IMAGE_MAX_STORAGE_BYTES = 1024 * 1024 * 1024 * 1024


IMAGE_RATE_LIMIT_WINDOW_SECONDS = 60.0


PACKY_REQUEST_TIMEOUT_SECONDS = 300


IMAGE_DOWNLOAD_TIMEOUT_SECONDS = 60


DEFAULT_DB_PATH = "/var/lib/opentavern-sync/sync.sqlite3"


DEFAULT_IMAGE_DIR = "/var/lib/opentavern-sync/images"


DEFAULT_PACKY_IMAGE_ENDPOINT = "https://www.packyapi.com/v1/images/edits"


DEFAULT_PACKY_IMAGE_MODEL = "gpt-image-2"


DEFAULT_PACKY_IMAGE_QUALITY = "high"


PACKY_IMAGE_URL_HOSTS = {"external-resources.packyapi.com"}


IMAGE_MAX_CONCURRENT_ENV = "IMAGE_GATEWAY_MAX_CONCURRENT"


IMAGE_REQUESTS_PER_MINUTE_ENV = "IMAGE_GATEWAY_REQUESTS_PER_MINUTE"


IMAGE_MAX_STORAGE_BYTES_ENV = "IMAGE_GATEWAY_MAX_STORAGE_BYTES"


SYNC_PATHS = {"/api/sync", "/opentavern-sync", "/opentavern-sync/"}


IMAGE_GENERATE_PATHS = {"/api/image/generate", "/opentavern-image/generate"}


IMAGE_ASSET_PREFIX = "/api/image/assets/"


IMAGE_ASSET_COMPAT_PREFIX = "/opentavern-image/assets/"


IMAGE_ASSET_PREFIXES = (IMAGE_ASSET_PREFIX, IMAGE_ASSET_COMPAT_PREFIX)


IMAGE_ASSET_ID_PATTERN = re.compile(r"^[a-f0-9]{48}$")


SYNC_V2_HASH_PATTERN = re.compile(r"^[a-f0-9]{64}$")


PACKY_ERROR_TEXT_MAX_CHARS = 500


PACKY_ERROR_CODE_MAX_CHARS = 128


PACKY_REQUEST_ID_MAX_CHARS = 128


MAX_PACKY_RESPONSE_BYTES = 32 * 1024 * 1024


PACKY_IMAGE_SIZES = {
    # Packy-native sizes accepted by the new UI. The x-delimited aliases are
    # accepted as a defensive convenience for direct API callers.
    "1024*1024": ("1024x1024", (1024, 1024)),
    "1536*1024": ("1536x1024", (1536, 1024)),
    "1024*1536": ("1024x1536", (1024, 1536)),
    "1024x1024": ("1024x1024", (1024, 1024)),
    "1536x1024": ("1536x1024", (1536, 1024)),
    "1024x1536": ("1024x1536", (1024, 1536)),
    # Preserve the previous browser contract and dimensions verbatim.
    "2048*2048": ("2048x2048", (2048, 2048)),
    "2688*1536": ("2688x1536", (2688, 1536)),
    "2368*1728": ("2368x1728", (2368, 1728)),
    "1536*2688": ("1536x2688", (1536, 2688)),
    "1728*2368": ("1728x2368", (1728, 2368)),
}


IMAGE_MIME_EXTENSIONS = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
}


class ImageGatewayError(Exception):
    def __init__(
        self,
        message,
        status=502,
        request_id=None,
        provider=None,
        code=None,
        upstream_code=None,
        reason=None,
        upstream_status=None,
    ):
        super().__init__(message)
        self.status = status
        self.request_id = request_id
        self.provider = provider
        self.code = code
        self.upstream_code = upstream_code
        self.reason = reason
        self.upstream_status = upstream_status


class SyncV2ChunkConflictError(ValueError):
    pass


def now_ms():
    return int(time.time() * 1000)


def byte_length(text):
    return len(text.encode("utf-8"))


def is_plain_object(value):
    return isinstance(value, dict)


def normalize_object_map(value):
    return value if is_plain_object(value) else {}


def normalize_timestamp(value, fallback=None):
    if fallback is None:
        fallback = now_ms()
    try:
        timestamp = float(value)
        if timestamp == timestamp:
            return int(timestamp)
    except (TypeError, ValueError):
        pass
    return fallback


def normalize_boolean(value):
    if value is True or value == 1:
        return True
    if isinstance(value, str):
        return value.strip().lower() in {"true", "yes", "1"}
    return False
