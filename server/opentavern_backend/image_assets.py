from urllib.error import HTTPError, URLError
from urllib.request import HTTPRedirectHandler, Request, build_opener
import os
import secrets
import socket
import tempfile
from . import config as backend_config, image_provider, image_validation


class PackyImageRedirectHandler(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        image_validation.validate_packy_image_url(newurl, resolve_hostname=True)
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def download_generated_image(image_url, expected_size):
    try:
        image_validation.validate_packy_image_url(image_url, resolve_hostname=True)
        request = Request(
            image_url,
            headers={"Accept": "image/png,image/jpeg", "User-Agent": "OpenTavernImageGateway/1.0"},
            method="GET",
        )
        opener = build_opener(PackyImageRedirectHandler())
        with opener.open(request, timeout=backend_config.IMAGE_DOWNLOAD_TIMEOUT_SECONDS) as response:
            image_validation.validate_packy_image_url(response.geturl(), resolve_hostname=True)
            content_type = response.headers.get_content_type().lower()
            data = image_provider.read_limited_response(response, backend_config.MAX_IMAGE_BYTES, "Generated image exceeds 20 MiB.")
    except backend_config.ImageGatewayError as error:
        error.provider = error.provider or "packy"
        error.code = error.code or "PACKY_IMAGE_DOWNLOAD_FAILED"
        error.reason = error.reason or str(error)
        raise
    except HTTPError as error:
        try:
            error.close()
        except Exception:
            pass
        raise backend_config.ImageGatewayError(
            "Generated image could not be downloaded.",
            provider="packy",
            code="PACKY_IMAGE_DOWNLOAD_FAILED",
            upstream_code="HTTP_%s" % error.code,
            reason="The generated image URL returned HTTP %s." % error.code,
            upstream_status=error.code,
        ) from error
    except (URLError, socket.timeout, TimeoutError) as error:
        raise backend_config.ImageGatewayError(
            "Generated image download timed out or is unavailable.",
            status=504,
            provider="packy",
            code="PACKY_IMAGE_DOWNLOAD_FAILED",
            upstream_code="UPSTREAM_UNAVAILABLE",
            reason="The generated image could not be downloaded before the gateway timeout.",
        ) from error

    return validate_generated_image(data, expected_size, content_type=content_type)


def validate_generated_image(data, expected_size, content_type=None):
    if not isinstance(data, bytes) or not data or len(data) > backend_config.MAX_IMAGE_BYTES:
        raise backend_config.ImageGatewayError(
            "Generated image is empty or exceeds 20 MiB.",
            provider="packy",
            code="PACKY_INVALID_IMAGE",
        )
    try:
        detected_mime, width, height = image_validation.inspect_image(data)
    except backend_config.ImageGatewayError as error:
        error.provider = error.provider or "packy"
        error.code = error.code or "PACKY_INVALID_IMAGE"
        error.reason = error.reason or str(error)
        raise
    if (width, height) != expected_size:
        raise backend_config.ImageGatewayError(
            "Generated image dimensions do not match the requested size.",
            provider="packy",
            code="PACKY_INVALID_IMAGE",
        )
    if content_type is not None:
        content_type = content_type.lower()
        if content_type == "image/jpg":
            content_type = "image/jpeg"
        if content_type not in backend_config.IMAGE_MIME_EXTENSIONS or content_type != detected_mime:
            raise backend_config.ImageGatewayError(
                "Generated image MIME type is invalid.",
                provider="packy",
                code="PACKY_INVALID_IMAGE",
            )
    return data, detected_mime, width, height


def materialize_packy_image(image_source, expected_size):
    if not isinstance(image_source, dict):
        raise backend_config.ImageGatewayError(
            "Packy returned an invalid response.",
            provider="packy",
            code="PACKY_INVALID_RESPONSE",
        )
    image_data = image_source.get("data")
    if isinstance(image_data, bytes):
        return validate_generated_image(image_data, expected_size)
    image_url = image_source.get("url")
    if isinstance(image_url, str):
        return download_generated_image(image_url, expected_size)
    raise backend_config.ImageGatewayError(
        "Packy returned an invalid response.",
        provider="packy",
        code="PACKY_INVALID_RESPONSE",
    )


def get_image_asset_storage_bytes(image_dir):
    total = 0
    try:
        entries = os.scandir(image_dir)
    except FileNotFoundError:
        return 0
    with entries:
        for entry in entries:
            if not entry.is_file(follow_symlinks=False):
                continue
            stem, extension = os.path.splitext(entry.name)
            if extension not in backend_config.IMAGE_MIME_EXTENSIONS.values() or not backend_config.IMAGE_ASSET_ID_PATTERN.fullmatch(stem):
                continue
            total += entry.stat(follow_symlinks=False).st_size
    return total


def save_image_asset(image_dir, data, mime, max_storage_bytes=None):
    extension = backend_config.IMAGE_MIME_EXTENSIONS[mime]
    os.makedirs(image_dir, mode=0o750, exist_ok=True)
    if max_storage_bytes is not None:
        current_bytes = get_image_asset_storage_bytes(image_dir)
        if len(data) > max_storage_bytes or current_bytes > max_storage_bytes - len(data):
            raise backend_config.ImageGatewayError("Image storage capacity has been reached.", status=507)
    asset_id = secrets.token_hex(24)
    final_path = os.path.join(image_dir, asset_id + extension)
    fd, temporary_path = tempfile.mkstemp(prefix=".image-", dir=image_dir)
    try:
        with os.fdopen(fd, "wb") as handle:
            handle.write(data)
            handle.flush()
            os.fsync(handle.fileno())
        os.chmod(temporary_path, 0o640)
        os.replace(temporary_path, final_path)
    except Exception:
        try:
            os.unlink(temporary_path)
        except FileNotFoundError:
            pass
        raise
    return asset_id


def find_image_asset(image_dir, asset_id):
    if not backend_config.IMAGE_ASSET_ID_PATTERN.fullmatch(asset_id):
        return None, None
    image_root = os.path.realpath(image_dir)
    for mime, extension in backend_config.IMAGE_MIME_EXTENSIONS.items():
        candidate = os.path.realpath(os.path.join(image_root, asset_id + extension))
        try:
            if os.path.commonpath([image_root, candidate]) != image_root:
                continue
        except ValueError:
            continue
        if os.path.isfile(candidate):
            return candidate, mime
    return None, None
