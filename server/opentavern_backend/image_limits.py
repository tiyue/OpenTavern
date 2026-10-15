from collections import deque
import hmac
import os
import threading
import time
from . import config as backend_config, image_validation


def parse_bounded_env_int(environ, name, default, minimum, maximum):
    raw_value = environ.get(name)
    if raw_value is None:
        return default
    try:
        value = int(raw_value.strip(), 10)
    except (AttributeError, TypeError, ValueError):
        return default
    if value < minimum or value > maximum:
        return default
    return value


def load_image_gateway_limits(environ=None):
    environ = os.environ if environ is None else environ
    return {
        "max_concurrent": parse_bounded_env_int(
            environ,
            backend_config.IMAGE_MAX_CONCURRENT_ENV,
            backend_config.DEFAULT_IMAGE_MAX_CONCURRENT,
            backend_config.MIN_IMAGE_MAX_CONCURRENT,
            backend_config.MAX_IMAGE_MAX_CONCURRENT,
        ),
        "requests_per_minute": parse_bounded_env_int(
            environ,
            backend_config.IMAGE_REQUESTS_PER_MINUTE_ENV,
            backend_config.DEFAULT_IMAGE_REQUESTS_PER_MINUTE,
            backend_config.MIN_IMAGE_REQUESTS_PER_MINUTE,
            backend_config.MAX_IMAGE_REQUESTS_PER_MINUTE,
        ),
    }


def load_image_storage_limit(environ=None):
    environ = os.environ if environ is None else environ
    return parse_bounded_env_int(
        environ,
        backend_config.IMAGE_MAX_STORAGE_BYTES_ENV,
        backend_config.DEFAULT_IMAGE_MAX_STORAGE_BYTES,
        backend_config.MIN_IMAGE_MAX_STORAGE_BYTES,
        backend_config.MAX_IMAGE_MAX_STORAGE_BYTES,
    )


class ImageGenerationLimiter:
    def __init__(self, max_concurrent, requests_per_minute, clock=None):
        if (
            isinstance(max_concurrent, bool)
            or not isinstance(max_concurrent, int)
            or max_concurrent < 1
            or isinstance(requests_per_minute, bool)
            or not isinstance(requests_per_minute, int)
            or requests_per_minute < 1
        ):
            raise ValueError("Image generation limits must be positive integers.")
        self.max_concurrent = max_concurrent
        self.requests_per_minute = requests_per_minute
        self._clock = clock or time.monotonic
        self._lock = threading.Lock()
        self._active_requests = 0
        self._request_times = deque()

    def acquire(self):
        with self._lock:
            now = self._clock()
            cutoff = now - backend_config.IMAGE_RATE_LIMIT_WINDOW_SECONDS
            while self._request_times and self._request_times[0] <= cutoff:
                self._request_times.popleft()
            if len(self._request_times) >= self.requests_per_minute:
                raise backend_config.ImageGatewayError("Image generation rate limit exceeded.", status=429)
            if self._active_requests >= self.max_concurrent:
                raise backend_config.ImageGatewayError(
                    "Too many concurrent image generation requests.",
                    status=429,
                )
            self._request_times.append(now)
            self._active_requests += 1

    def release(self):
        with self._lock:
            if self._active_requests < 1:
                raise RuntimeError("Image generation limiter released without an active request.")
            self._active_requests -= 1


def get_image_gateway_token(headers):
    token = headers.get("X-OpenTavern-Image-Token", "").strip()
    if token:
        return token
    auth = headers.get("Authorization", "")
    if auth.lower().startswith("bearer "):
        return auth[7:].strip()
    return ""


def validate_image_gateway_token(headers, configured_token, upstream_api_key):
    if not configured_token:
        raise backend_config.ImageGatewayError("Image generation is not configured.", status=503)
    if upstream_api_key and hmac.compare_digest(configured_token, upstream_api_key):
        raise backend_config.ImageGatewayError("Image gateway token must be different from the upstream API key.", status=503)
    supplied_token = get_image_gateway_token(headers)
    if not supplied_token or not hmac.compare_digest(supplied_token, configured_token):
        raise backend_config.ImageGatewayError("Invalid image gateway token.", status=401)


def get_image_gateway_health(server):
    configured = False
    if (
        server.image_gateway_token
        and server.packy_api_token
        and server.packy_image_model
        and server.packy_image_quality
        and not hmac.compare_digest(server.image_gateway_token, server.packy_api_token)
    ):
        try:
            image_validation.validate_packy_endpoint(server.packy_image_endpoint)
            image_validation.validate_packy_image_quality(server.packy_image_quality)
            configured = True
        except backend_config.ImageGatewayError:
            configured = False
    storage_writable = bool(
        os.path.isdir(server.image_dir)
        and os.access(server.image_dir, os.W_OK | os.X_OK)
    )
    return {
        "configured": configured,
        "storageWritable": storage_writable,
        "ready": configured and storage_writable,
        "model": server.packy_image_model,
        "quality": server.packy_image_quality,
        "maxStorageBytes": server.image_max_storage_bytes,
    }
