from urllib.parse import urlparse
import base64
import ipaddress
import re
import socket
import struct
from . import config as backend_config


def validate_packy_endpoint(endpoint):
    if not isinstance(endpoint, str):
        raise backend_config.ImageGatewayError("Invalid Packy image endpoint configuration.", status=503)
    endpoint = endpoint.strip()
    parsed = urlparse(endpoint)
    try:
        parsed_port = parsed.port
    except ValueError as error:
        raise backend_config.ImageGatewayError("Invalid Packy image endpoint configuration.", status=503) from error
    if (
        parsed.scheme != "https"
        or not parsed.hostname
        or parsed.username
        or parsed.password
        or parsed.query
        or parsed.fragment
        or (parsed_port is not None and (parsed_port < 1 or parsed_port > 65535))
    ):
        raise backend_config.ImageGatewayError("Invalid Packy image endpoint configuration.", status=503)
    return endpoint


def validate_packy_image_quality(quality):
    if quality not in ("low", "medium", "high", "auto"):
        raise backend_config.ImageGatewayError("Invalid Packy image quality configuration.", status=503)
    return quality


def validate_packy_image_url(image_url, resolve_hostname=False):
    if not isinstance(image_url, str):
        raise backend_config.ImageGatewayError("Packy returned an invalid image URL.")
    parsed = urlparse(image_url)
    hostname = (parsed.hostname or "").lower().rstrip(".")
    try:
        parsed_port = parsed.port
    except ValueError as error:
        raise backend_config.ImageGatewayError("Packy returned an invalid image URL.") from error
    if (
        parsed.scheme != "https"
        or not hostname
        or parsed.username
        or parsed.password
        or parsed.fragment
        or hostname == "localhost"
        or hostname.endswith(".localhost")
        or hostname.endswith(".local")
        or hostname not in backend_config.PACKY_IMAGE_URL_HOSTS
        or parsed_port not in (None, 443)
    ):
        raise backend_config.ImageGatewayError("Packy returned an invalid image URL.")

    try:
        literal_address = ipaddress.ip_address(hostname)
    except ValueError:
        literal_address = None
    if literal_address is not None and not literal_address.is_global:
        raise backend_config.ImageGatewayError("Packy returned an invalid image URL.")

    if resolve_hostname and literal_address is None:
        try:
            addresses = {
                item[4][0]
                for item in socket.getaddrinfo(
                    hostname,
                    parsed.port or 443,
                    0,
                    socket.SOCK_STREAM,
                )
            }
        except (OSError, socket.gaierror) as error:
            raise backend_config.ImageGatewayError("Packy returned an invalid image URL.") from error
        if not addresses:
            raise backend_config.ImageGatewayError("Packy returned an invalid image URL.")
        for address in addresses:
            try:
                if not ipaddress.ip_address(address).is_global:
                    raise backend_config.ImageGatewayError("Packy returned an invalid image URL.")
            except ValueError as error:
                raise backend_config.ImageGatewayError("Packy returned an invalid image URL.") from error
    return parsed


def get_image_asset_prefix_for_generate_path(request_path):
    if request_path == "/opentavern-image/generate":
        return backend_config.IMAGE_ASSET_COMPAT_PREFIX
    return backend_config.IMAGE_ASSET_PREFIX


def validate_image_generation_request(body):
    if not backend_config.is_plain_object(body):
        raise ValueError("Invalid image generation payload.")

    prompt = body.get("prompt")
    if not isinstance(prompt, str) or not prompt.strip():
        raise ValueError("Prompt is required.")
    prompt = prompt.strip()
    if len(prompt) > backend_config.MAX_PROMPT_CHARS:
        raise ValueError("Prompt is too long.")

    negative_prompt = body.get("negativePrompt", body.get("negative_prompt", ""))
    if negative_prompt is None:
        negative_prompt = ""
    if not isinstance(negative_prompt, str):
        raise ValueError("Negative prompt must be a string.")
    if len(negative_prompt) > backend_config.MAX_NEGATIVE_PROMPT_CHARS:
        raise ValueError("Negative prompt must not exceed 500 characters.")

    size = body.get("size", "2048*2048")
    if size not in backend_config.PACKY_IMAGE_SIZES:
        raise ValueError("Unsupported image size.")

    prompt_extend = body.get("promptExtend", body.get("prompt_extend", True))
    if not isinstance(prompt_extend, bool):
        raise ValueError("promptExtend must be a boolean.")

    seed = body.get("seed")
    if seed is not None:
        if isinstance(seed, bool) or not isinstance(seed, int):
            raise ValueError("Seed must be an integer.")
        if seed < 0 or seed > backend_config.MAX_IMAGE_SEED:
            raise ValueError("Seed must be between 0 and 2147483647.")

    reference_image = body.get("referenceImage", body.get("reference_image"))
    if reference_image in (None, ""):
        reference_image = None
    else:
        reference_image = validate_image_generation_reference_image(reference_image)

    return {
        "prompt": prompt,
        "reference_image": reference_image,
        "negative_prompt": negative_prompt,
        "size": size,
        "prompt_extend": prompt_extend,
        "seed": seed,
    }


def validate_image_generation_reference_image(value):
    if not isinstance(value, str):
        raise ValueError("referenceImage must be a Base64 image data URL.")
    if len(value) > (backend_config.MAX_REFERENCE_IMAGE_BYTES * 4 // 3) + 1024:
        raise OverflowError("Reference image exceeds 10 MiB.")
    try:
        prefix, encoded = value.split(",", 1)
    except ValueError as error:
        raise ValueError("referenceImage must be a Base64 image data URL.") from error
    mime_by_prefix = {
        "data:image/png;base64": "image/png",
        "data:image/jpeg;base64": "image/jpeg",
        "data:image/jpg;base64": "image/jpeg",
    }
    mime = mime_by_prefix.get(prefix.strip().lower())
    if not mime or not encoded or not re.fullmatch(r"[A-Za-z0-9+/]+={0,2}", encoded):
        raise ValueError("referenceImage must be a PNG or JPEG Base64 data URL.")
    try:
        data = base64.b64decode(encoded, validate=True)
    except Exception as error:
        raise ValueError("referenceImage contains invalid Base64 data.") from error
    if not data:
        raise ValueError("referenceImage is empty.")
    if len(data) > backend_config.MAX_REFERENCE_IMAGE_BYTES:
        raise OverflowError("Reference image exceeds 10 MiB.")
    try:
        detected_mime, width, height = inspect_image(data)
    except backend_config.ImageGatewayError as error:
        raise ValueError("referenceImage is not a supported PNG or JPEG image.") from error
    if detected_mime != mime:
        raise ValueError("referenceImage MIME type does not match its image data.")
    if width > backend_config.MAX_REFERENCE_IMAGE_DIMENSION or height > backend_config.MAX_REFERENCE_IMAGE_DIMENSION:
        raise ValueError("referenceImage width and height must not exceed 3072 pixels.")
    canonical_prefix = "data:%s;base64" % mime
    if prefix == canonical_prefix:
        return value
    return "%s,%s" % (canonical_prefix, encoded)


def decode_reference_image_data_url(reference_image):
    prefix, encoded = reference_image.split(",", 1)
    mime = "image/png" if prefix.lower() == "data:image/png;base64" else "image/jpeg"
    extension = "png" if mime == "image/png" else "jpg"
    try:
        data = base64.b64decode(encoded, validate=True)
    except Exception as error:
        raise ValueError("referenceImage contains invalid Base64 data.") from error
    return data, mime, extension


def inspect_image(data):
    if (
        len(data) >= 36
        and data.startswith(b"\x89PNG\r\n\x1a\n")
        and data.endswith(b"\x00\x00\x00\x00IEND\xaeB\x60\x82")
    ):
        width, height = struct.unpack(">II", data[16:24])
        if width > 0 and height > 0:
            return "image/png", width, height

    if len(data) >= 6 and data.startswith(b"\xff\xd8") and data.endswith(b"\xff\xd9"):
        offset = 2
        sof_markers = {
            0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7,
            0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF,
        }
        while offset + 4 <= len(data):
            if data[offset] != 0xFF:
                offset += 1
                continue
            while offset < len(data) and data[offset] == 0xFF:
                offset += 1
            if offset >= len(data):
                break
            marker = data[offset]
            offset += 1
            if marker in {0x01, 0xD8, 0xD9} or 0xD0 <= marker <= 0xD7:
                continue
            if offset + 2 > len(data):
                break
            segment_length = struct.unpack(">H", data[offset:offset + 2])[0]
            if segment_length < 2 or offset + segment_length > len(data):
                break
            if marker in sof_markers and segment_length >= 7:
                height = struct.unpack(">H", data[offset + 3:offset + 5])[0]
                width = struct.unpack(">H", data[offset + 5:offset + 7])[0]
                if width > 0 and height > 0:
                    return "image/jpeg", width, height
            offset += segment_length

    raise backend_config.ImageGatewayError("Downloaded file is not a supported image.")
