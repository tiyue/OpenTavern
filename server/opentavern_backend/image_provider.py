from urllib.error import HTTPError, URLError
from urllib.request import HTTPRedirectHandler, Request, build_opener
import base64
import json
import re
import secrets
import socket
from . import config as backend_config, image_validation


class PackyApiNoRedirectHandler(HTTPRedirectHandler):
    """Never forward the Packy bearer token through an HTTP redirect."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def sanitize_packy_error_text(value, secrets_to_redact=()):
    if not isinstance(value, (str, int, float)):
        return ""
    raw_text = str(value)[:4096]
    raw_text = re.sub(
        r"(?i)data:image/[A-Za-z0-9.+-]+;base64,(?:[A-Za-z0-9+/=]+[ \t\r\n]*)+",
        "data:image/[REDACTED];base64,[REDACTED]",
        raw_text,
    )
    text = " ".join(raw_text.split()).strip()
    if not text:
        return ""
    for secret in secrets_to_redact:
        secret = str(secret or "").strip()
        if secret:
            text = text.replace(secret, "[REDACTED]")
    text = re.sub(
        r"(?i)\b(authorization|api[-_ ]?key|access[-_ ]?token|token|signature|access[-_ ]?key(?:id)?|security[-_ ]?token|credential)\b\s*[:=]\s*(?:bearer\s+)?[^\s,;]+",
        lambda match: "%s=[REDACTED]" % match.group(1),
        text,
    )
    text = re.sub(
        r"(?i)\bbearer\s+[A-Za-z0-9._~+/=-]{8,}",
        "Bearer [REDACTED]",
        text,
    )
    text = re.sub(r"\bsk-[A-Za-z0-9_-]{8,}\b", "[REDACTED]", text)
    text = re.sub(
        r"(?i)data:image/[A-Za-z0-9.+-]+;base64,[A-Za-z0-9+/=]+",
        "data:image/[REDACTED];base64,[REDACTED]",
        text,
    )
    text = re.sub(
        r"(?i)([?&](?:api_key|access_token|token|signature|x-oss-signature|x-amz-signature|accesskeyid|securitytoken|credential)=)[^&\s]+",
        r"\1[REDACTED]",
        text,
    )
    text = re.sub(r"(?i)https?://[^\s]+", "[URL]", text)
    text = re.sub(r"<[^>]{1,200}>", " ", text)
    text = " ".join(text.split())
    return text[:backend_config.PACKY_ERROR_TEXT_MAX_CHARS]


def sanitize_packy_error_code(value, secrets_to_redact=()):
    text = sanitize_packy_error_text(value, secrets_to_redact)
    text = re.sub(r"[^A-Za-z0-9_.:-]+", "_", text).strip("_")
    return text[:backend_config.PACKY_ERROR_CODE_MAX_CHARS]


def sanitize_packy_request_id(value, secrets_to_redact=()):
    text = sanitize_packy_error_text(value, secrets_to_redact)
    text = re.sub(r"[^A-Za-z0-9_.:-]+", "", text)
    return text[:backend_config.PACKY_REQUEST_ID_MAX_CHARS]


def extract_packy_error_details(payload, secrets_to_redact=()):
    if not isinstance(payload, dict):
        return "", ""

    containers = [payload]
    error_value = payload.get("error")
    if isinstance(error_value, dict):
        containers.append(error_value)

    code = ""
    reason = ""
    if isinstance(error_value, (str, int, float)):
        reason = sanitize_packy_error_text(error_value, secrets_to_redact)
    for container in containers:
        if not code:
            for key in ("code", "type", "error_code", "errorCode", "status"):
                candidate = container.get(key)
                if isinstance(candidate, (str, int, float)):
                    code = sanitize_packy_error_code(candidate, secrets_to_redact)
                    if code:
                        break
        if not reason:
            for key in ("message", "msg", "detail", "reason"):
                candidate = container.get(key)
                if isinstance(candidate, (str, int, float)):
                    reason = sanitize_packy_error_text(candidate, secrets_to_redact)
                    if reason:
                        break
    return code, reason


def packy_response_has_explicit_failure(payload):
    if not isinstance(payload, dict):
        return False
    error_value = payload.get("error")
    if isinstance(error_value, dict):
        return bool(error_value)
    if isinstance(error_value, (str, int, float)):
        return bool(str(error_value).strip())
    return False


def get_packy_request_id(headers, payload=None, secrets_to_redact=()):
    headers = headers or {}
    payload = payload if isinstance(payload, dict) else {}
    error_payload = payload.get("error") if isinstance(payload.get("error"), dict) else {}
    candidates = (
        payload.get("request_id"),
        payload.get("requestId"),
        error_payload.get("request_id"),
        error_payload.get("requestId"),
        headers.get("X-Packy-Request-Id"),
        headers.get("X-Request-Id"),
        headers.get("Request-Id"),
        headers.get("CF-Ray"),
    )
    for candidate in candidates:
        request_id = sanitize_packy_request_id(candidate, secrets_to_redact)
        if request_id:
            return request_id
    for container in (error_payload, payload):
        for key in ("message", "detail", "reason"):
            value = container.get(key)
            if not isinstance(value, str):
                continue
            match = re.search(
                r"(?i)\brequest[ _-]*id\s*[:=]\s*([A-Za-z0-9._:-]{1,128})",
                value,
            )
            if match:
                request_id = sanitize_packy_request_id(
                    match.group(1),
                    secrets_to_redact,
                )
                if request_id:
                    return request_id
    return ""


def read_limited_response(response, max_bytes, error_message):
    content_length = response.headers.get("Content-Length")
    if content_length:
        try:
            if int(content_length) > max_bytes:
                raise backend_config.ImageGatewayError(error_message)
        except ValueError:
            pass
    data = response.read(max_bytes + 1)
    if len(data) > max_bytes:
        raise backend_config.ImageGatewayError(error_message)
    return data


def build_packy_multipart_body(image_request, model, quality=backend_config.DEFAULT_PACKY_IMAGE_QUALITY):
    image_validation.validate_packy_image_quality(quality)
    if not image_request.get("reference_image"):
        raise ValueError("referenceImage is required.")
    packy_size = backend_config.PACKY_IMAGE_SIZES[image_request["size"]][0]
    boundary = "----OpenTavern%s" % secrets.token_hex(16)
    boundary_bytes = boundary.encode("ascii")
    parts = []

    def add_field(name, value):
        parts.extend([
            b"--" + boundary_bytes + b"\r\n",
            ('Content-Disposition: form-data; name="%s"\r\n\r\n' % name).encode("ascii"),
            str(value).encode("utf-8"),
            b"\r\n",
        ])

    add_field("model", model)
    add_field("prompt", image_request["prompt"])
    reference_image = image_request["reference_image"]
    image_data, mime, extension = image_validation.decode_reference_image_data_url(reference_image)
    parts.extend([
        b"--" + boundary_bytes + b"\r\n",
        (
            'Content-Disposition: form-data; name="image"; filename="reference.%s"\r\n'
            "Content-Type: %s\r\n\r\n" % (extension, mime)
        ).encode("ascii"),
        image_data,
        b"\r\n",
    ])
    add_field("size", packy_size)
    add_field("quality", quality)
    add_field("output_format", "png")
    parts.extend([b"--" + boundary_bytes + b"--\r\n"])
    return b"".join(parts), boundary


def open_packy_api_request(request, timeout):
    opener = build_opener(PackyApiNoRedirectHandler())
    return opener.open(request, timeout=timeout)


def call_packy_image_api(config, image_request):
    api_token_value = config.get("api_token", "")
    endpoint_value = config.get("endpoint", "")
    model_value = config.get("model", "")
    quality_value = config.get("quality", "")
    api_token = api_token_value.strip() if isinstance(api_token_value, str) else ""
    endpoint = image_validation.validate_packy_endpoint(
        (endpoint_value.strip() if isinstance(endpoint_value, str) else "")
        or backend_config.DEFAULT_PACKY_IMAGE_ENDPOINT
    )
    model = (model_value.strip() if isinstance(model_value, str) else "") or backend_config.DEFAULT_PACKY_IMAGE_MODEL
    quality = (
        (quality_value.strip() if isinstance(quality_value, str) else "")
        or backend_config.DEFAULT_PACKY_IMAGE_QUALITY
    )
    if not api_token or not re.fullmatch(r"[A-Za-z0-9._:-]{1,128}", model):
        raise backend_config.ImageGatewayError("Packy image generation is not configured.", status=503)

    # negativePrompt, promptExtend, and seed remain accepted by the browser
    # contract, but Packy's verified GPT Image endpoint does not support them.
    request_body, boundary = build_packy_multipart_body(
        image_request,
        model,
        quality=quality,
    )
    request = Request(
        endpoint,
        data=request_body,
        headers={
            "Authorization": "Bearer %s" % api_token,
            "Content-Type": "multipart/form-data; boundary=%s" % boundary,
            "Accept": "application/json",
            "User-Agent": "OpenTavernImageGateway/1.0",
        },
        method="POST",
    )

    try:
        with open_packy_api_request(request, backend_config.PACKY_REQUEST_TIMEOUT_SECONDS) as response:
            response_headers = response.headers
            try:
                raw = read_limited_response(
                    response,
                    backend_config.MAX_PACKY_RESPONSE_BYTES,
                    "Packy response is too large.",
                )
            except backend_config.ImageGatewayError as error:
                error.request_id = error.request_id or get_packy_request_id(
                    response_headers,
                    secrets_to_redact=(api_token,),
                )
                error.provider = error.provider or "packy"
                error.code = error.code or "PACKY_INVALID_RESPONSE"
                error.reason = error.reason or str(error)
                raise
    except HTTPError as error:
        request_id = get_packy_request_id(error.headers, secrets_to_redact=(api_token,))
        error_payload = None
        raw_error = b""
        try:
            raw_error = error.read((64 * 1024) + 1)[:64 * 1024]
            error_payload = json.loads(raw_error.decode("utf-8"))
            request_id = get_packy_request_id(
                error.headers,
                error_payload,
                secrets_to_redact=(api_token,),
            )
        except Exception:
            pass
        finally:
            try:
                error.close()
            except Exception:
                pass
        error_code, error_reason = extract_packy_error_details(
            error_payload,
            secrets_to_redact=(api_token,),
        )
        if not error_code:
            error_code = "HTTP_%s" % error.code
        if not error_reason:
            error_reason = sanitize_packy_error_text(
                raw_error.decode("utf-8", errors="replace"),
                secrets_to_redact=(api_token,),
            )
        if not error_reason:
            error_reason = "Packy rejected the request with HTTP %s." % error.code
        status = 429 if error.code == 429 else 502
        raise backend_config.ImageGatewayError(
            "Packy image generation failed.",
            status=status,
            request_id=request_id,
            provider="packy",
            code="PACKY_UPSTREAM_FAILED",
            upstream_code=error_code,
            reason=error_reason,
            upstream_status=error.code,
        ) from error
    except (URLError, socket.timeout, TimeoutError) as error:
        raise backend_config.ImageGatewayError(
            "Packy image generation timed out or is unavailable.",
            status=504,
            provider="packy",
            code="PACKY_UPSTREAM_UNAVAILABLE",
            reason="Packy did not respond before the gateway timeout or could not be reached.",
        ) from error

    request_id = get_packy_request_id(response_headers, secrets_to_redact=(api_token,))
    try:
        response_payload = json.loads(raw.decode("utf-8"))
    except Exception as error:
        raise backend_config.ImageGatewayError(
            "Packy returned an invalid response.",
            request_id=request_id,
            provider="packy",
            code="PACKY_INVALID_RESPONSE",
            reason="Packy returned a response that was not valid JSON.",
        ) from error
    if not isinstance(response_payload, dict):
        raise backend_config.ImageGatewayError(
            "Packy returned an invalid response.",
            request_id=request_id,
            provider="packy",
            code="PACKY_INVALID_RESPONSE",
            reason="Packy returned JSON with an unexpected structure.",
        )

    request_id = get_packy_request_id(
        response_headers,
        response_payload,
        secrets_to_redact=(api_token,),
    )
    error_code, error_reason = extract_packy_error_details(
        response_payload,
        secrets_to_redact=(api_token,),
    )
    if packy_response_has_explicit_failure(response_payload):
        raise backend_config.ImageGatewayError(
            "Packy image generation failed.",
            request_id=request_id,
            provider="packy",
            code="PACKY_UPSTREAM_FAILED",
            upstream_code=error_code,
            reason=error_reason or "Packy reported an explicit failure status.",
        )

    data = response_payload.get("data")
    first_image = data[0] if isinstance(data, list) and data else None
    if isinstance(first_image, dict):
        encoded_image = first_image.get("b64_json")
        if isinstance(encoded_image, str) and encoded_image.strip():
            encoded_image = encoded_image.strip()
            if len(encoded_image) > ((backend_config.MAX_IMAGE_BYTES + 2) // 3 * 4) + 4:
                raise backend_config.ImageGatewayError(
                    "Packy returned an oversized image.",
                    request_id=request_id,
                    provider="packy",
                    code="PACKY_INVALID_RESPONSE",
                    reason="The Base64 image exceeds 20 MiB.",
                )
            try:
                image_data = base64.b64decode(encoded_image, validate=True)
            except Exception as error:
                raise backend_config.ImageGatewayError(
                    "Packy returned an invalid response.",
                    request_id=request_id,
                    provider="packy",
                    code="PACKY_INVALID_RESPONSE",
                    reason="Packy returned invalid Base64 image data.",
                ) from error
            if not image_data or len(image_data) > backend_config.MAX_IMAGE_BYTES:
                raise backend_config.ImageGatewayError(
                    "Packy returned an invalid response.",
                    request_id=request_id,
                    provider="packy",
                    code="PACKY_INVALID_RESPONSE",
                    reason="Packy returned an empty or oversized Base64 image.",
                )
            return {"data": image_data}, request_id, model

        image_url = first_image.get("url")
        if isinstance(image_url, str) and image_url.strip():
            image_url = image_url.strip()
            image_validation.validate_packy_image_url(image_url)
            return {"url": image_url}, request_id, model
    raise backend_config.ImageGatewayError(
        "Packy image generation failed.",
        request_id=request_id,
        provider="packy",
        code="PACKY_NO_IMAGE",
        upstream_code=error_code,
        reason=error_reason or "Packy completed the request without returning a generated image.",
    )
