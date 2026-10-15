import base64
import json
import os
import struct
import tempfile
import threading
import unittest
from email.message import Message
from io import BytesIO
from types import SimpleNamespace
from unittest import mock
from urllib.error import HTTPError
from urllib.request import Request

try:
    from server import opentavern_sync_server as gateway
except ModuleNotFoundError:
    import opentavern_sync_server as gateway


if gateway.__package__:
    from server.opentavern_backend import config, image_assets, image_provider
else:
    from opentavern_backend import config, image_assets, image_provider


VALID_IMAGE_URL = "https://external-resources.packyapi.com/result/image.png"


def make_png(width, height):
    return (
        b"\x89PNG\r\n\x1a\n"
        + b"\x00\x00\x00\rIHDR"
        + struct.pack(">II", width, height)
        + b"\x08\x06\x00\x00\x00\x00\x00\x00\x00"
        + b"\x00\x00\x00\x00IEND\xaeB\x60\x82"
    )


def make_jpeg(width, height):
    return (
        b"\xff\xd8\xff\xc0\x00\x11\x08"
        + struct.pack(">HH", height, width)
        + b"\x03\x01\x11\x00\x02\x11\x00\x03\x11\x00\xff\xd9"
    )


def make_sized_png(width, height, total_bytes):
    base_png = make_png(width, height)
    if total_bytes < len(base_png):
        raise ValueError("total_bytes is too small")
    return base_png[:-12] + (b"\x00" * (total_bytes - len(base_png))) + base_png[-12:]


def make_reference_data_url(width=1024, height=1024):
    return "data:image/png;base64," + base64.b64encode(make_png(width, height)).decode("ascii")


def make_packy_image_request(prompt="test", size="2048*2048"):
    return gateway.validate_image_generation_request({
        "prompt": prompt,
        "size": size,
        "referenceImage": make_reference_data_url(),
    })


def make_headers(content_type=None, content_length=None, request_id=None):
    headers = Message()
    if content_type is not None:
        headers["Content-Type"] = content_type
    if content_length is not None:
        headers["Content-Length"] = str(content_length)
    if request_id is not None:
        headers["X-Request-Id"] = request_id
    return headers


def make_response(data, content_type="image/png", url=VALID_IMAGE_URL, content_length=None):
    response = mock.MagicMock()
    response.headers = make_headers(
        content_type=content_type,
        content_length=len(data) if content_length is None else content_length,
    )
    response.read.return_value = data
    response.geturl.return_value = url
    response.__enter__.return_value = response
    response.__exit__.return_value = False
    return response


class ImageRequestValidationTests(unittest.TestCase):
    def test_valid_request_is_normalized_and_defaults_are_applied(self):
        self.assertEqual(
            gateway.validate_image_generation_request({"prompt": "  lantern-lit tavern  "}),
            {
                "prompt": "lantern-lit tavern",
                "negative_prompt": "",
                "size": "2048*2048",
                "prompt_extend": True,
                "seed": None,
                "reference_image": None,
            },
        )

        self.assertEqual(
            gateway.validate_image_generation_request(
                {
                    "prompt": "portrait",
                    "negative_prompt": "blur",
                    "size": "2688*1536",
                    "prompt_extend": False,
                    "seed": 0,
                }
            ),
            {
                "prompt": "portrait",
                "negative_prompt": "blur",
                "size": "2688*1536",
                "prompt_extend": False,
                "seed": 0,
                "reference_image": None,
            },
        )

    def test_invalid_request_parameters_are_rejected(self):
        cases = [
            (None, "Invalid image generation payload."),
            ([], "Invalid image generation payload."),
            ({}, "Prompt is required."),
            ({"prompt": "   "}, "Prompt is required."),
            ({"prompt": "x" * (gateway.MAX_PROMPT_CHARS + 1)}, "Prompt is too long."),
            ({"prompt": "ok", "negativePrompt": 3}, "Negative prompt must be a string."),
            (
                {"prompt": "ok", "negativePrompt": "x" * (gateway.MAX_NEGATIVE_PROMPT_CHARS + 1)},
                "Negative prompt must not exceed 500 characters.",
            ),
            ({"prompt": "ok", "size": "512*512"}, "Unsupported image size."),
            ({"prompt": "ok", "promptExtend": 1}, "promptExtend must be a boolean."),
            ({"prompt": "ok", "seed": True}, "Seed must be an integer."),
            ({"prompt": "ok", "seed": 1.5}, "Seed must be an integer."),
            ({"prompt": "ok", "seed": -1}, "Seed must be between 0 and 2147483647."),
            (
                {"prompt": "ok", "seed": gateway.MAX_IMAGE_SEED + 1},
                "Seed must be between 0 and 2147483647.",
            ),
        ]

        for body, expected_message in cases:
            with self.subTest(body=body, expected_message=expected_message):
                with self.assertRaises(ValueError) as raised:
                    gateway.validate_image_generation_request(body)
                self.assertEqual(str(raised.exception), expected_message)

    def test_new_and_legacy_sizes_map_to_packy_dimensions(self):
        expected = {
            "1024*1024": ("1024x1024", (1024, 1024)),
            "1536*1024": ("1536x1024", (1536, 1024)),
            "1024*1536": ("1024x1536", (1024, 1536)),
            "2048*2048": ("2048x2048", (2048, 2048)),
            "2688*1536": ("2688x1536", (2688, 1536)),
            "1536*2688": ("1536x2688", (1536, 2688)),
        }
        for requested_size, mapped_size in expected.items():
            with self.subTest(requested_size=requested_size):
                validated = gateway.validate_image_generation_request(
                    {"prompt": "test", "size": requested_size}
                )
                self.assertEqual(validated["size"], requested_size)
                self.assertEqual(gateway.PACKY_IMAGE_SIZES[requested_size], mapped_size)

    def test_reference_image_is_validated_and_normalized(self):
        png_data = make_png(1024, 1536)
        data_url = "data:image/png;base64," + base64.b64encode(png_data).decode("ascii")
        validated = gateway.validate_image_generation_request(
            {"prompt": "test", "referenceImage": data_url}
        )
        self.assertEqual(validated["reference_image"], data_url)

        invalid_values = [
            "not-a-data-url",
            "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=",
            "data:image/png;base64,%%%",
            "data:image/jpeg;base64," + base64.b64encode(png_data).decode("ascii"),
        ]
        for value in invalid_values:
            with self.subTest(value=value[:40]):
                with self.assertRaises((ValueError, OverflowError)):
                    gateway.validate_image_generation_request(
                        {"prompt": "test", "referenceImage": value}
                    )

        too_wide = "data:image/png;base64," + base64.b64encode(
            make_png(gateway.MAX_REFERENCE_IMAGE_DIMENSION + 1, 512)
        ).decode("ascii")
        with self.assertRaises(ValueError) as raised:
            gateway.validate_image_generation_request(
                {"prompt": "test", "referenceImage": too_wide}
            )
        self.assertIn("3072", str(raised.exception))

        oversized = "data:image/png;base64," + (
            "A" * ((gateway.MAX_REFERENCE_IMAGE_BYTES * 4 // 3) + 1025)
        )
        with self.assertRaises(OverflowError):
            gateway.validate_image_generation_request(
                {"prompt": "test", "referenceImage": oversized}
            )

    def test_reference_image_reuses_canonical_base64_without_reencoding(self):
        png_data = make_png(1024, 1536)
        encoded = base64.b64encode(png_data).decode("ascii")
        data_url = "data:image/png;base64," + encoded
        with mock.patch.object(
            gateway.base64,
            "b64encode",
            side_effect=AssertionError("canonical data URL should not be re-encoded"),
        ):
            self.assertEqual(
                gateway.validate_image_generation_reference_image(data_url),
                data_url,
            )

        jpeg_data = make_jpeg(1024, 1536)
        jpeg_encoded = base64.b64encode(jpeg_data).decode("ascii")
        self.assertEqual(
            gateway.validate_image_generation_reference_image(
                "data:image/jpg;base64," + jpeg_encoded
            ),
            "data:image/jpeg;base64," + jpeg_encoded,
        )

    def test_reference_image_enforces_exact_decoded_10_mib_boundary(self):
        base_png = make_png(1024, 1536)
        trailer = base_png[-12:]
        exact_data = (
            base_png[:-12]
            + (b"\x00" * (gateway.MAX_REFERENCE_IMAGE_BYTES - len(base_png)))
            + trailer
        )
        exact_url = "data:image/png;base64," + base64.b64encode(exact_data).decode("ascii")
        validated = gateway.validate_image_generation_reference_image(exact_url)
        self.assertEqual(
            len(base64.b64decode(validated.split(",", 1)[1], validate=True)),
            gateway.MAX_REFERENCE_IMAGE_BYTES,
        )

        oversized_data = exact_data + b"\x00"
        oversized_url = "data:image/png;base64," + base64.b64encode(oversized_data).decode("ascii")
        with self.assertRaises(OverflowError) as raised:
            gateway.validate_image_generation_reference_image(oversized_url)
        self.assertEqual(str(raised.exception), "Reference image exceeds 10 MiB.")

    def test_generate_paths_select_matching_asset_prefixes(self):
        self.assertEqual(
            gateway.get_image_asset_prefix_for_generate_path("/api/image/generate"),
            gateway.IMAGE_ASSET_PREFIX,
        )
        self.assertEqual(
            gateway.get_image_asset_prefix_for_generate_path("/opentavern-image/generate"),
            gateway.IMAGE_ASSET_COMPAT_PREFIX,
        )


class StoragePermissionTests(unittest.TestCase):
    def test_private_storage_permissions_cover_database_sidecars_and_images(self):
        db_path = os.path.join("storage", "sync.sqlite3")
        image_dir = os.path.join("storage", "images")
        with mock.patch.object(gateway.os.path, "exists", return_value=True), mock.patch.object(
            gateway.os,
            "chmod",
        ) as chmod:
            gateway.enforce_private_storage_permissions(db_path, image_dir)

        chmod.assert_any_call(os.path.dirname(os.path.abspath(db_path)), 0o750)
        chmod.assert_any_call(image_dir, 0o750)
        for suffix in ("", "-wal", "-shm", "-journal"):
            chmod.assert_any_call(db_path + suffix, 0o640)


class ImageGatewayTokenTests(unittest.TestCase):
    def test_image_token_header_and_bearer_token_are_accepted(self):
        gateway.validate_image_gateway_token(
            {"X-OpenTavern-Image-Token": " gateway-token "},
            "gateway-token",
            "upstream-api-key",
        )
        gateway.validate_image_gateway_token(
            {"Authorization": "Bearer gateway-token"},
            "gateway-token",
            "upstream-api-key",
        )

    def test_missing_wrong_and_upstream_tokens_are_rejected(self):
        for headers in (
            {},
            {"X-OpenTavern-Image-Token": "wrong-token"},
            {"Authorization": "Bearer upstream-api-key"},
        ):
            with self.subTest(headers=headers):
                with self.assertRaises(gateway.ImageGatewayError) as raised:
                    gateway.validate_image_gateway_token(
                        headers,
                        "gateway-token",
                        "upstream-api-key",
                    )
                self.assertEqual(raised.exception.status, 401)
                self.assertEqual(str(raised.exception), "Invalid image gateway token.")

    def test_gateway_token_must_be_configured_and_independent(self):
        cases = [
            ("", "upstream-api-key", "Image generation is not configured."),
            (
                "same-secret",
                "same-secret",
                "Image gateway token must be different from the upstream API key.",
            ),
        ]
        for configured_token, upstream_key, message in cases:
            with self.subTest(configured_token=configured_token):
                with self.assertRaises(gateway.ImageGatewayError) as raised:
                    gateway.validate_image_gateway_token(
                        {"X-OpenTavern-Image-Token": configured_token},
                        configured_token,
                        upstream_key,
                    )
                self.assertEqual(raised.exception.status, 503)
                self.assertEqual(str(raised.exception), message)


class ImageGatewayLimitConfigTests(unittest.TestCase):
    def test_missing_invalid_and_out_of_range_values_use_safe_defaults(self):
        invalid_values = ["", "   ", "not-a-number", "1.5", "0", "-1"]
        for name, key, default, maximum in (
            (
                gateway.IMAGE_MAX_CONCURRENT_ENV,
                "max_concurrent",
                gateway.DEFAULT_IMAGE_MAX_CONCURRENT,
                gateway.MAX_IMAGE_MAX_CONCURRENT,
            ),
            (
                gateway.IMAGE_REQUESTS_PER_MINUTE_ENV,
                "requests_per_minute",
                gateway.DEFAULT_IMAGE_REQUESTS_PER_MINUTE,
                gateway.MAX_IMAGE_REQUESTS_PER_MINUTE,
            ),
        ):
            with self.subTest(name=name, value="missing"):
                limits = gateway.load_image_gateway_limits({})
                self.assertEqual(limits[key], default)
            for value in invalid_values + [str(maximum + 1)]:
                with self.subTest(name=name, value=value):
                    limits = gateway.load_image_gateway_limits({name: value})
                    self.assertEqual(limits[key], default)

    def test_boundary_values_are_accepted(self):
        cases = [
            (gateway.MIN_IMAGE_MAX_CONCURRENT, gateway.MIN_IMAGE_REQUESTS_PER_MINUTE),
            (gateway.MAX_IMAGE_MAX_CONCURRENT, gateway.MAX_IMAGE_REQUESTS_PER_MINUTE),
        ]
        for max_concurrent, requests_per_minute in cases:
            with self.subTest(
                max_concurrent=max_concurrent,
                requests_per_minute=requests_per_minute,
            ):
                limits = gateway.load_image_gateway_limits(
                    {
                        gateway.IMAGE_MAX_CONCURRENT_ENV: " %s " % max_concurrent,
                        gateway.IMAGE_REQUESTS_PER_MINUTE_ENV: str(requests_per_minute),
                    }
                )
                self.assertEqual(limits["max_concurrent"], max_concurrent)
                self.assertEqual(limits["requests_per_minute"], requests_per_minute)

    def test_image_storage_limit_uses_bounded_environment_value(self):
        self.assertEqual(
            gateway.load_image_storage_limit({}),
            gateway.DEFAULT_IMAGE_MAX_STORAGE_BYTES,
        )
        self.assertEqual(
            gateway.load_image_storage_limit({
                gateway.IMAGE_MAX_STORAGE_BYTES_ENV: str(gateway.MIN_IMAGE_MAX_STORAGE_BYTES),
            }),
            gateway.MIN_IMAGE_MAX_STORAGE_BYTES,
        )
        self.assertEqual(
            gateway.load_image_storage_limit({
                gateway.IMAGE_MAX_STORAGE_BYTES_ENV: str(gateway.MAX_IMAGE_MAX_STORAGE_BYTES + 1),
            }),
            gateway.DEFAULT_IMAGE_MAX_STORAGE_BYTES,
        )

    def test_image_health_reports_configuration_without_exposing_secrets(self):
        with tempfile.TemporaryDirectory() as image_dir:
            server = SimpleNamespace(
                image_gateway_token="gateway-token",
                packy_api_token="upstream-key",
                packy_image_endpoint="https://www.packyapi.com/v1/images/edits",
                image_dir=image_dir,
                packy_image_model="gpt-image-2",
                packy_image_quality="high",
                image_max_storage_bytes=123456,
            )
            health = gateway.get_image_gateway_health(server)
            self.assertTrue(health["configured"])
            self.assertTrue(health["storageWritable"])
            self.assertTrue(health["ready"])
            self.assertEqual(health["maxStorageBytes"], 123456)
            self.assertEqual(health["quality"], "high")
            self.assertNotIn("gateway-token", repr(health))
            self.assertNotIn("upstream-key", repr(health))

    def test_packy_quality_accepts_documented_values_and_rejects_invalid_values(self):
        for quality in ("low", "medium", "high", "auto"):
            self.assertEqual(gateway.validate_packy_image_quality(quality), quality)
        with self.assertRaises(gateway.ImageGatewayError) as raised:
            gateway.validate_packy_image_quality("ultra")
        self.assertEqual(raised.exception.status, 503)


class ImageGenerationLimiterTests(unittest.TestCase):
    def test_concurrency_limit_returns_429_and_release_restores_capacity(self):
        limiter = gateway.ImageGenerationLimiter(max_concurrent=2, requests_per_minute=10)
        limiter.acquire()
        limiter.acquire()
        with self.assertRaises(gateway.ImageGatewayError) as raised:
            limiter.acquire()
        self.assertEqual(raised.exception.status, 429)
        self.assertEqual(str(raised.exception), "Too many concurrent image generation requests.")

        limiter.release()
        limiter.acquire()
        limiter.release()
        limiter.release()

    def test_limits_must_be_positive_integers(self):
        for max_concurrent, requests_per_minute in (
            (0, 1),
            (1, 0),
            (True, 1),
            (1, 1.5),
        ):
            with self.subTest(
                max_concurrent=max_concurrent,
                requests_per_minute=requests_per_minute,
            ):
                with self.assertRaises(ValueError):
                    gateway.ImageGenerationLimiter(max_concurrent, requests_per_minute)

    def test_sliding_minute_limit_expires_old_requests(self):
        current_time = [100.0]
        limiter = gateway.ImageGenerationLimiter(
            max_concurrent=2,
            requests_per_minute=2,
            clock=lambda: current_time[0],
        )
        for _ in range(2):
            limiter.acquire()
            limiter.release()

        with self.assertRaises(gateway.ImageGatewayError) as raised:
            limiter.acquire()
        self.assertEqual(raised.exception.status, 429)
        self.assertEqual(str(raised.exception), "Image generation rate limit exceeded.")

        current_time[0] += gateway.IMAGE_RATE_LIMIT_WINDOW_SECONDS
        limiter.acquire()
        limiter.release()

    def test_parallel_acquire_never_exceeds_global_limit(self):
        worker_count = 16
        limiter = gateway.ImageGenerationLimiter(
            max_concurrent=3,
            requests_per_minute=worker_count,
        )
        start = threading.Barrier(worker_count + 1)
        release_workers = threading.Event()
        attempts_finished = threading.Event()
        result_lock = threading.Lock()
        accepted = []
        rejected = []
        attempt_count = 0

        def worker():
            nonlocal attempt_count
            start.wait()
            acquired = False
            try:
                limiter.acquire()
                acquired = True
                with result_lock:
                    accepted.append(threading.get_ident())
            except gateway.ImageGatewayError as error:
                with result_lock:
                    rejected.append(error.status)
            finally:
                with result_lock:
                    attempt_count += 1
                    if attempt_count == worker_count:
                        attempts_finished.set()
            if acquired:
                release_workers.wait(5)
                limiter.release()

        threads = [threading.Thread(target=worker) for _ in range(worker_count)]
        for thread in threads:
            thread.start()
        start.wait()
        finished = attempts_finished.wait(5)
        release_workers.set()
        for thread in threads:
            thread.join(5)

        self.assertTrue(finished)
        self.assertEqual(len(accepted), 3)
        self.assertEqual(rejected, [429] * (worker_count - 3))
        for thread in threads:
            self.assertFalse(thread.is_alive())


class ImageGatewayLimitHandlerTests(unittest.TestCase):
    def make_handler(self, headers, limiter):
        handler = object.__new__(gateway.SyncHandler)
        handler.headers = headers
        handler.server = SimpleNamespace(
            image_gateway_token="gateway-token",
            packy_api_token="upstream-key",
            packy_image_endpoint="https://www.packyapi.com/v1/images/edits",
            packy_image_model="gpt-image-test",
            packy_image_quality="high",
            image_generation_limiter=limiter,
        )
        handler.read_json_body = mock.Mock(return_value=None)
        handler.send_json = mock.Mock()
        return handler

    def test_unauthorized_requests_do_not_touch_limits(self):
        limiter = mock.Mock()
        handler = self.make_handler({}, limiter)
        handler.handle_image_generate()

        limiter.acquire.assert_not_called()
        limiter.release.assert_not_called()
        handler.read_json_body.assert_not_called()
        handler.send_json.assert_called_once_with(
            401,
            {"success": False, "error": "Invalid image gateway token."},
        )

    def test_limiter_429_stops_before_body_or_network_work(self):
        limiter = mock.Mock()
        limiter.acquire.side_effect = gateway.ImageGatewayError(
            "Image generation rate limit exceeded.",
            status=429,
        )
        handler = self.make_handler(
            {"X-OpenTavern-Image-Token": "gateway-token"},
            limiter,
        )
        with mock.patch.object(image_provider, "call_packy_image_api") as packy_api:
            handler.handle_image_generate()

        limiter.acquire.assert_called_once_with()
        limiter.release.assert_not_called()
        handler.read_json_body.assert_not_called()
        packy_api.assert_not_called()
        handler.send_json.assert_called_once_with(
            429,
            {"success": False, "error": "Image generation rate limit exceeded."},
        )

    def test_acquired_limit_is_released_on_validation_error(self):
        limiter = mock.Mock()
        handler = self.make_handler(
            {"Authorization": "Bearer gateway-token"},
            limiter,
        )
        handler.handle_image_generate()

        limiter.acquire.assert_called_once_with()
        limiter.release.assert_called_once_with()
        handler.send_json.assert_called_once_with(
            400,
            {"success": False, "error": "Invalid image generation payload."},
        )

    def test_missing_reference_image_is_rejected_locally_before_packy_request(self):
        limiter = mock.Mock()
        handler = self.make_handler(
            {"X-OpenTavern-Image-Token": "gateway-token"},
            limiter,
        )
        handler.read_json_body.return_value = {"prompt": "test"}
        with mock.patch.object(image_provider, "open_packy_api_request") as api_open:
            handler.handle_image_generate()
        api_open.assert_not_called()
        limiter.release.assert_called_once_with()
        handler.send_json.assert_called_once_with(
            400,
            {"success": False, "error": "referenceImage is required."},
        )

    def test_handler_uses_16_mib_image_request_limit(self):
        limiter = mock.Mock()
        handler = self.make_handler(
            {"X-OpenTavern-Image-Token": "gateway-token"},
            limiter,
        )
        handler.handle_image_generate()

        self.assertEqual(gateway.MAX_IMAGE_REQUEST_BYTES, 16 * 1024 * 1024)
        handler.read_json_body.assert_called_once_with(
            max_bytes=gateway.MAX_IMAGE_REQUEST_BYTES,
            too_large_message="Image generation payload is too large.",
        )

    def test_authenticated_request_is_counted_before_payload_validation(self):
        limiter = gateway.ImageGenerationLimiter(max_concurrent=1, requests_per_minute=1)
        headers = {"X-OpenTavern-Image-Token": "gateway-token"}
        first_handler = self.make_handler(headers, limiter)
        first_handler.handle_image_generate()
        first_handler.send_json.assert_called_once_with(
            400,
            {"success": False, "error": "Invalid image generation payload."},
        )

        second_handler = self.make_handler(headers, limiter)
        with mock.patch.object(image_provider, "call_packy_image_api") as packy_api:
            second_handler.handle_image_generate()
        second_handler.read_json_body.assert_not_called()
        packy_api.assert_not_called()
        second_handler.send_json.assert_called_once_with(
            429,
            {"success": False, "error": "Image generation rate limit exceeded."},
        )

    def test_packy_failure_details_are_returned_to_the_client(self):
        limiter = mock.Mock()
        handler = self.make_handler(
            {"X-OpenTavern-Image-Token": "gateway-token"},
            limiter,
        )
        handler.read_json_body.return_value = {"prompt": "test"}
        packy_error = gateway.ImageGatewayError(
            "Packy image generation failed.",
            status=502,
            request_id="request-123",
            provider="packy",
            code="PACKY_UPSTREAM_FAILED",
            upstream_code="DataInspectionFailed",
            reason="Input data may contain inappropriate content.",
            upstream_status=400,
        )
        with mock.patch.object(image_provider, "call_packy_image_api", side_effect=packy_error):
            handler.handle_image_generate()

        limiter.acquire.assert_called_once_with()
        limiter.release.assert_called_once_with()
        handler.send_json.assert_called_once_with(
            502,
            {
                "success": False,
                "error": "Packy image generation failed.",
                "requestId": "request-123",
                "provider": "packy",
                "code": "PACKY_UPSTREAM_FAILED",
                "upstreamCode": "DataInspectionFailed",
                "reason": "Input data may contain inappropriate content.",
                "upstreamStatus": 400,
            },
        )

    def test_download_failure_keeps_the_packy_request_id(self):
        limiter = mock.Mock()
        handler = self.make_handler(
            {"X-OpenTavern-Image-Token": "gateway-token"},
            limiter,
        )
        handler.read_json_body.return_value = {"prompt": "test"}
        download_error = gateway.ImageGatewayError(
            "Generated image could not be downloaded.",
            provider="packy",
            code="PACKY_IMAGE_DOWNLOAD_FAILED",
            upstream_code="HTTP_403",
            reason="The generated image URL returned HTTP 403.",
            upstream_status=403,
        )
        with mock.patch.object(
            image_provider,
            "call_packy_image_api",
            return_value=({"url": VALID_IMAGE_URL}, "request-download", "gpt-image-test"),
        ), mock.patch.object(image_assets, "materialize_packy_image", side_effect=download_error):
            handler.handle_image_generate()

        handler.send_json.assert_called_once_with(
            502,
            {
                "success": False,
                "error": "Generated image could not be downloaded.",
                "requestId": "request-download",
                "provider": "packy",
                "code": "PACKY_IMAGE_DOWNLOAD_FAILED",
                "upstreamCode": "HTTP_403",
                "reason": "The generated image URL returned HTTP 403.",
                "upstreamStatus": 403,
            },
        )


class PackyUrlValidationTests(unittest.TestCase):
    def test_documented_packy_resource_host_is_allowed(self):
        parsed = gateway.validate_packy_image_url(VALID_IMAGE_URL)
        self.assertEqual(parsed.scheme, "https")

    def test_non_https_private_or_credentialed_urls_are_rejected(self):
        urls = [
            "http://cdn.packyapi.com/image.png",
            "https://localhost/image.png",
            "https://127.0.0.1/image.png",
            "https://169.254.169.254/latest/meta-data",
            "https://evil.example/image.png",
            "https://user@external-resources.packyapi.com/image.png",
            "https://user:password@external-resources.packyapi.com/image.png",
            "https://external-resources.packyapi.com/image.png#fragment",
            "https://external-resources.packyapi.com:444/image.png",
            "https://external-resources.packyapi.com:bad/image.png",
            "not-a-url",
        ]
        for url in urls:
            with self.subTest(url=url):
                with self.assertRaises(gateway.ImageGatewayError):
                    gateway.validate_packy_image_url(url)

    def test_hostname_resolution_rejects_private_addresses(self):
        with mock.patch.object(
            gateway.socket,
            "getaddrinfo",
            return_value=[(2, 1, 6, "", ("10.0.0.5", 443))],
        ):
            with self.assertRaises(gateway.ImageGatewayError):
                gateway.validate_packy_image_url(VALID_IMAGE_URL, resolve_hostname=True)

    def test_redirect_handler_validates_every_redirect_target(self):
        handler = gateway.PackyImageRedirectHandler()
        original_request = Request(VALID_IMAGE_URL)
        redirect_headers = Message()
        sentinel = object()

        with mock.patch.object(gateway.socket, "getaddrinfo", return_value=[
            (2, 1, 6, "", ("8.8.8.8", 443)),
        ]), mock.patch.object(
            gateway.HTTPRedirectHandler, "redirect_request", return_value=sentinel
        ) as parent_redirect:
            result = handler.redirect_request(
                original_request, None, 302, "Found", redirect_headers,
                "https://external-resources.packyapi.com/final.png",
            )
            self.assertIs(result, sentinel)
            parent_redirect.assert_called_once()

        with mock.patch.object(
            gateway.HTTPRedirectHandler,
            "redirect_request",
        ) as parent_redirect:
            with self.assertRaises(gateway.ImageGatewayError):
                handler.redirect_request(
                    original_request,
                    None,
                    302,
                    "Found",
                    redirect_headers,
                    "https://127.0.0.1/stolen.png",
                )
            parent_redirect.assert_not_called()

    def test_packy_api_post_never_follows_redirects_with_the_bearer_token(self):
        handler = gateway.PackyApiNoRedirectHandler()
        request = Request(
            "https://www.packyapi.com/v1/images/edits",
            headers={"Authorization": "Bearer secret"},
        )
        for target in (
            "https://www.packyapi.com/v1/images/other",
            "https://evil.example/steal-token",
        ):
            with self.subTest(target=target):
                self.assertIsNone(
                    handler.redirect_request(request, None, 302, "Found", Message(), target)
                )

        opener = mock.Mock()
        sentinel = object()
        opener.open.return_value = sentinel
        with mock.patch.object(image_provider, "build_opener", return_value=opener) as build_opener:
            result = gateway.open_packy_api_request(request, 123)
        self.assertIs(result, sentinel)
        self.assertIsInstance(build_opener.call_args.args[0], gateway.PackyApiNoRedirectHandler)
        opener.open.assert_called_once_with(request, timeout=123)


class PackyApiTests(unittest.TestCase):
    def test_packy_error_helpers_support_scalar_errors_and_safe_request_ids(self):
        code, reason = gateway.extract_packy_error_details(
            {"code": "BadRequest", "error": "plain upstream reason"}
        )
        self.assertEqual(code, "BadRequest")
        self.assertEqual(reason, "plain upstream reason")
        self.assertEqual(
            gateway.get_packy_request_id(
                make_headers(request_id="header-request-123"),
                {"request_id": {"invalid": True}},
            ),
            "header-request-123",
        )
        self.assertEqual(
            gateway.get_packy_request_id(
                {},
                {"error": {"message": "Rejected (request id: 01JZ9ABC_DEF-123)."}},
            ),
            "01JZ9ABC_DEF-123",
        )
        sanitized = gateway.sanitize_packy_error_text(
            "Signature=signature-secret AccessKeyId=access-secret "
            "SecurityToken=security-secret Credential=credential-secret"
        )
        for secret in ("signature-secret", "access-secret", "security-secret", "credential-secret"):
            self.assertNotIn(secret, sanitized)
        image_error = gateway.sanitize_packy_error_text(
            "upstream echoed data:image/jpeg;base64,QUJDREVGR0g="
        )
        self.assertNotIn("QUJDREVGR0g", image_error)
        self.assertIn("[REDACTED]", image_error)
        folded_image_error = gateway.sanitize_packy_error_text(
            "upstream echoed data:image/jpeg;base64,QUJD\r\n"
            "REVGR0hJSktMTU5PUA=="
        )
        for fragment in ("QUJD", "REVGR0hJSktMTU5PUA"):
            self.assertNotIn(fragment, folded_image_error)
        self.assertIn("[REDACTED]", folded_image_error)

    def test_packy_multipart_request_and_base64_response(self):
        generated_image = make_png(1024, 1536)
        response_payload = {
            "data": [{"b64_json": base64.b64encode(generated_image).decode("ascii")}]
        }
        raw_response = json.dumps(response_payload).encode("utf-8")
        response = make_response(raw_response, content_type="application/json")
        response.headers["X-Request-Id"] = "request-123"

        reference_bytes = make_png(1024, 1536)
        reference_image = "data:image/png;base64," + base64.b64encode(reference_bytes).decode("ascii")
        image_request = gateway.validate_image_generation_request(
            {
                "prompt": "paint a tavern",
                "referenceImage": reference_image,
                "negativePrompt": "text",
                "size": "1024*1536",
                "promptExtend": False,
                "seed": 42,
            }
        )
        with mock.patch.object(image_provider, "open_packy_api_request", return_value=response) as api_open:
            result = gateway.call_packy_image_api(
                {
                    "api_token": "packy-secret",
                    "endpoint": "https://www.packyapi.com/v1/images/edits",
                    "model": "gpt-image-test",
                },
                image_request,
            )

        self.assertEqual(result, ({"data": generated_image}, "request-123", "gpt-image-test"))
        request = api_open.call_args.args[0]
        self.assertEqual(request.get_method(), "POST")
        self.assertEqual(request.full_url, "https://www.packyapi.com/v1/images/edits")
        self.assertEqual(request.get_header("Authorization"), "Bearer packy-secret")
        self.assertEqual(api_open.call_args.args[1], gateway.PACKY_REQUEST_TIMEOUT_SECONDS)
        content_type = request.get_header("Content-type")
        self.assertTrue(content_type.startswith("multipart/form-data; boundary="))
        body = request.data
        for fragment in (
            b'name="model"\r\n\r\ngpt-image-test',
            b'name="prompt"\r\n\r\npaint a tavern',
            b'name="image"; filename="reference.png"',
            b"Content-Type: image/png",
            b'name="size"\r\n\r\n1024x1536',
            b'name="quality"\r\n\r\nhigh',
            b'name="output_format"\r\n\r\npng',
            reference_bytes,
        ):
            self.assertIn(fragment, body)
        for unsupported in (
            b"response_format",
            b"input_fidelity",
            b"negative_prompt",
            b"prompt_extend",
            b"seed",
        ):
            self.assertNotIn(unsupported, body)

    def test_packy_url_response_is_supported_without_revised_prompt(self):
        response = make_response(
            json.dumps({"data": [{"url": "  %s  " % VALID_IMAGE_URL}]}).encode("utf-8"),
            content_type="application/json",
        )
        image_request = make_packy_image_request()
        with mock.patch.object(image_provider, "open_packy_api_request", return_value=response):
            result = gateway.call_packy_image_api(
                {"api_token": "secret", "model": "gpt-image-2"},
                image_request,
            )
        self.assertEqual(result, ({"url": VALID_IMAGE_URL}, "", "gpt-image-2"))

    def test_packy_json_limit_allows_a_20_mib_base64_image_but_rejects_larger_json(self):
        self.assertEqual(gateway.MAX_PACKY_RESPONSE_BYTES, 32 * 1024 * 1024)
        generated_image = make_sized_png(1024, 1024, gateway.MAX_IMAGE_BYTES)
        raw_response = json.dumps({
            "data": [{"b64_json": base64.b64encode(generated_image).decode("ascii")}]
        }).encode("utf-8")
        self.assertLess(len(raw_response), gateway.MAX_PACKY_RESPONSE_BYTES)
        response = make_response(raw_response, content_type="application/json")
        image_request = make_packy_image_request(size="1024*1024")
        with mock.patch.object(image_provider, "open_packy_api_request", return_value=response):
            image_source, _, _ = gateway.call_packy_image_api(
                {"api_token": "secret", "model": "gpt-image-2"},
                image_request,
            )
        self.assertEqual(len(image_source["data"]), gateway.MAX_IMAGE_BYTES)
        self.assertEqual(
            gateway.materialize_packy_image(image_source, (1024, 1024))[1:],
            ("image/png", 1024, 1024),
        )

        oversized_response = make_response(
            b"{}",
            content_type="application/json",
            content_length=gateway.MAX_PACKY_RESPONSE_BYTES + 1,
        )
        with mock.patch.object(image_provider, "open_packy_api_request", return_value=oversized_response):
            with self.assertRaises(gateway.ImageGatewayError) as raised:
                gateway.call_packy_image_api(
                    {"api_token": "secret", "model": "gpt-image-2"},
                    image_request,
                )
        self.assertEqual(raised.exception.code, "PACKY_INVALID_RESPONSE")
        oversized_response.read.assert_not_called()

    def test_invalid_packy_configuration_is_rejected_before_network_access(self):
        image_request = make_packy_image_request()
        configs = [
            {"api_token": "", "endpoint": "https://www.packyapi.com/v1/images/edits"},
            {"api_token": "secret", "endpoint": "http://www.packyapi.com/v1/images/edits"},
            {"api_token": "secret", "endpoint": "https://user@www.packyapi.com/v1/images/edits"},
            {"api_token": "secret", "endpoint": "https://www.packyapi.com/v1/images/edits?token=x"},
        ]
        with mock.patch.object(image_provider, "open_packy_api_request") as api_open:
            for config in configs:
                with self.subTest(config=config):
                    with self.assertRaises(gateway.ImageGatewayError) as raised:
                        gateway.call_packy_image_api(config, image_request)
                    self.assertEqual(raised.exception.status, 503)
            api_open.assert_not_called()

    def test_packy_http_error_preserves_safe_failure_reason(self):
        image_request = make_packy_image_request()
        error_payload = {"error": {
            "code": "content_policy_violation",
            "type": "packy_invalid_request_error",
            "message": (
                "Input data may contain inappropriate content.\n"
                "Authorization: Bearer packy-secret "
                "https://example.test/private?token=signed-value"
            ),
            "request_id": "request-filtered",
        }, "request_id": "request-filtered"}
        http_error = HTTPError(
            "https://www.packyapi.com/v1/images/edits",
            400,
            "Bad Request",
            make_headers(request_id="request-header"),
            BytesIO(json.dumps(error_payload).encode("utf-8")),
        )
        with mock.patch.object(image_provider, "open_packy_api_request", side_effect=http_error):
            with self.assertRaises(gateway.ImageGatewayError) as raised:
                gateway.call_packy_image_api(
                    {
                        "api_token": "packy-secret",
                        "model": "gpt-image-test",
                    },
                    image_request,
                )

        error = raised.exception
        self.assertEqual(error.status, 502)
        self.assertEqual(error.provider, "packy")
        self.assertEqual(error.code, "PACKY_UPSTREAM_FAILED")
        self.assertEqual(error.upstream_code, "content_policy_violation")
        self.assertEqual(error.request_id, "request-filtered")
        self.assertEqual(error.upstream_status, 400)
        self.assertIn("Input data may contain inappropriate content.", error.reason)
        self.assertNotIn("packy-secret", error.reason)
        self.assertNotIn("signed-value", error.reason)
        self.assertNotIn("https://", error.reason)

    def test_packy_upstream_401_stays_gateway_502_and_429_is_preserved(self):
        image_request = make_packy_image_request()
        for upstream_status, expected_status in ((401, 502), (403, 502), (429, 429)):
            with self.subTest(upstream_status=upstream_status):
                payload = {
                    "code": "UpstreamCode%s" % upstream_status,
                    "message": "Upstream reason %s" % upstream_status,
                }
                http_error = HTTPError(
                    "https://www.packyapi.com/v1/images/edits",
                    upstream_status,
                    "Upstream Error",
                    make_headers(),
                    BytesIO(json.dumps(payload).encode("utf-8")),
                )
                with mock.patch.object(image_provider, "open_packy_api_request", side_effect=http_error):
                    with self.assertRaises(gateway.ImageGatewayError) as raised:
                        gateway.call_packy_image_api(
                            {
                                "api_token": "secret",
                                "model": "gpt-image-test",
                            },
                            image_request,
                        )
                self.assertEqual(raised.exception.status, expected_status)
                self.assertEqual(raised.exception.upstream_status, upstream_status)

    def test_packy_success_status_with_error_preserves_failure_details(self):
        response_payload = {
            "request_id": "request-no-image",
            "error": {
                "code": "DataInspectionFailed",
                "message": "The prompt was rejected by the content policy.",
            },
            "data": [],
        }
        response = make_response(
            json.dumps(response_payload).encode("utf-8"),
            content_type="application/json",
        )
        image_request = make_packy_image_request()
        with mock.patch.object(image_provider, "open_packy_api_request", return_value=response):
            with self.assertRaises(gateway.ImageGatewayError) as raised:
                gateway.call_packy_image_api(
                    {
                        "api_token": "secret",
                        "model": "gpt-image-test",
                    },
                    image_request,
                )

        error = raised.exception
        self.assertEqual(error.code, "PACKY_UPSTREAM_FAILED")
        self.assertEqual(error.upstream_code, "DataInspectionFailed")
        self.assertEqual(error.reason, "The prompt was rejected by the content policy.")
        self.assertEqual(error.request_id, "request-no-image")

    def test_explicit_packy_error_is_not_accepted_even_when_an_image_is_present(self):
        cases = [{
            "request_id": "request-filtered",
            "error": {"code": "content_filter", "message": "blocked"},
            "data": [{"url": VALID_IMAGE_URL}],
        }]
        image_request = make_packy_image_request()
        for response_payload in cases:
            with self.subTest(request_id=response_payload["request_id"]):
                response = make_response(
                    json.dumps(response_payload).encode("utf-8"),
                    content_type="application/json",
                )
                with mock.patch.object(image_provider, "open_packy_api_request", return_value=response):
                    with self.assertRaises(gateway.ImageGatewayError) as raised:
                        gateway.call_packy_image_api(
                            {
                                "api_token": "secret",
                                "model": "gpt-image-test",
                            },
                            image_request,
                        )
                self.assertEqual(raised.exception.code, "PACKY_UPSTREAM_FAILED")
                self.assertEqual(raised.exception.request_id, response_payload["request_id"])

    def test_invalid_json_preserves_request_id_from_response_headers(self):
        response = make_response(b"<html>not json</html>", content_type="text/html")
        response.headers["X-Request-Id"] = "request-invalid-json"
        image_request = make_packy_image_request()
        with mock.patch.object(image_provider, "open_packy_api_request", return_value=response):
            with self.assertRaises(gateway.ImageGatewayError) as raised:
                gateway.call_packy_image_api(
                    {
                        "api_token": "secret",
                        "model": "gpt-image-test",
                    },
                    image_request,
                )
        self.assertEqual(raised.exception.code, "PACKY_INVALID_RESPONSE")
        self.assertEqual(raised.exception.request_id, "request-invalid-json")

    def test_non_object_json_is_rejected_with_request_id(self):
        response = make_response(b"[]", content_type="application/json")
        response.headers["X-Request-Id"] = "request-json-array"
        image_request = make_packy_image_request()
        with mock.patch.object(image_provider, "open_packy_api_request", return_value=response):
            with self.assertRaises(gateway.ImageGatewayError) as raised:
                gateway.call_packy_image_api(
                    {
                        "api_token": "secret",
                        "model": "gpt-image-test",
                    },
                    image_request,
                )
        self.assertEqual(raised.exception.code, "PACKY_INVALID_RESPONSE")
        self.assertEqual(raised.exception.request_id, "request-json-array")
        self.assertIn("unexpected structure", raised.exception.reason)


class ImageInspectionTests(unittest.TestCase):
    def test_png_dimensions_are_detected(self):
        self.assertEqual(gateway.inspect_image(make_png(2688, 1536)), ("image/png", 2688, 1536))

    def test_jpeg_dimensions_are_detected(self):
        self.assertEqual(gateway.inspect_image(make_jpeg(1728, 2368)), ("image/jpeg", 1728, 2368))

    def test_unsupported_or_malformed_images_are_rejected(self):
        for data in (b"GIF89a", b"\x89PNG\r\n\x1a\n", b"\xff\xd8\xff\xd9"):
            with self.subTest(data=data):
                with self.assertRaises(gateway.ImageGatewayError) as raised:
                    gateway.inspect_image(data)
                self.assertEqual(str(raised.exception), "Downloaded file is not a supported image.")


class ImageDownloadTests(unittest.TestCase):
    def download_with_response(self, response, expected_size):
        opener = mock.MagicMock()
        opener.open.return_value = response
        with mock.patch.object(
            gateway.socket,
            "getaddrinfo",
            return_value=[(2, 1, 6, "", ("8.8.8.8", 443))],
        ), mock.patch.object(image_assets, "build_opener", return_value=opener) as build_opener:
            result = gateway.download_generated_image(VALID_IMAGE_URL, expected_size)
        redirect_handler = build_opener.call_args.args[0]
        self.assertIsInstance(redirect_handler, gateway.PackyImageRedirectHandler)
        opener.open.assert_called_once()
        return result

    def test_valid_png_and_jpeg_downloads_are_accepted(self):
        cases = [
            (make_png(4, 3), "image/png", (4, 3), "image/png"),
            (make_jpeg(3, 4), "image/jpg", (3, 4), "image/jpeg"),
        ]
        for data, content_type, size, expected_mime in cases:
            with self.subTest(content_type=content_type):
                response = make_response(data, content_type=content_type)
                self.assertEqual(
                    self.download_with_response(response, size),
                    (data, expected_mime, size[0], size[1]),
                )

    def test_dimension_mismatch_is_rejected(self):
        response = make_response(make_png(4, 3))
        with self.assertRaises(gateway.ImageGatewayError) as raised:
            self.download_with_response(response, (3, 4))
        self.assertEqual(
            str(raised.exception),
            "Generated image dimensions do not match the requested size.",
        )

    def test_mime_mismatch_and_unsupported_mime_are_rejected(self):
        for content_type in ("image/jpeg", "application/octet-stream"):
            with self.subTest(content_type=content_type):
                response = make_response(make_png(2, 2), content_type=content_type)
                with self.assertRaises(gateway.ImageGatewayError) as raised:
                    self.download_with_response(response, (2, 2))
                self.assertEqual(str(raised.exception), "Generated image MIME type is invalid.")

    def test_oversized_image_is_rejected_from_content_length(self):
        response = make_response(
            make_png(2, 2),
            content_length=gateway.MAX_IMAGE_BYTES + 1,
        )
        with self.assertRaises(gateway.ImageGatewayError) as raised:
            self.download_with_response(response, (2, 2))
        self.assertEqual(str(raised.exception), "Generated image exceeds 20 MiB.")
        response.read.assert_not_called()

    def test_oversized_image_is_rejected_from_streamed_body(self):
        response = make_response(b"x" * 9)
        del response.headers["Content-Length"]
        with mock.patch.object(config, "MAX_IMAGE_BYTES", 8):
            with self.assertRaises(gateway.ImageGatewayError) as raised:
                self.download_with_response(response, (2, 2))
        self.assertEqual(str(raised.exception), "Generated image exceeds 20 MiB.")
        response.read.assert_called_once_with(9)

    def test_final_response_url_is_revalidated_after_redirects(self):
        response = make_response(
            make_png(2, 2),
            url="https://127.0.0.1/final.png",
        )
        with self.assertRaises(gateway.ImageGatewayError):
            self.download_with_response(response, (2, 2))
        response.read.assert_not_called()

    def test_download_http_error_returns_only_safe_status_details(self):
        opener = mock.MagicMock()
        opener.open.side_effect = HTTPError(
            VALID_IMAGE_URL + "?Signature=secret-signature",
            403,
            "Forbidden",
            make_headers(content_type="application/xml"),
            BytesIO(b"<Error><Signature>secret-signature</Signature></Error>"),
        )
        with mock.patch.object(
            gateway.socket,
            "getaddrinfo",
            return_value=[(2, 1, 6, "", ("8.8.8.8", 443))],
        ), mock.patch.object(image_assets, "build_opener", return_value=opener):
            with self.assertRaises(gateway.ImageGatewayError) as raised:
                gateway.download_generated_image(VALID_IMAGE_URL, (2, 2))

        error = raised.exception
        self.assertEqual(error.code, "PACKY_IMAGE_DOWNLOAD_FAILED")
        self.assertEqual(error.upstream_code, "HTTP_403")
        self.assertEqual(error.reason, "The generated image URL returned HTTP 403.")
        self.assertNotIn("secret-signature", error.reason)


class ImageAssetTests(unittest.TestCase):
    def test_png_and_jpeg_assets_are_saved_and_found(self):
        with tempfile.TemporaryDirectory() as image_dir:
            png_data = make_png(2, 3)
            jpeg_data = make_jpeg(3, 2)
            png_id = "a" * 48
            jpeg_id = "b" * 48

            with mock.patch.object(gateway.secrets, "token_hex", side_effect=[png_id, jpeg_id]):
                self.assertEqual(
                    gateway.save_image_asset(image_dir, png_data, "image/png"),
                    png_id,
                )
                self.assertEqual(
                    gateway.save_image_asset(image_dir, jpeg_data, "image/jpeg"),
                    jpeg_id,
                )

            png_path, png_mime = gateway.find_image_asset(image_dir, png_id)
            jpeg_path, jpeg_mime = gateway.find_image_asset(image_dir, jpeg_id)
            self.assertEqual((png_path, png_mime), (os.path.join(image_dir, png_id + ".png"), "image/png"))
            self.assertEqual((jpeg_path, jpeg_mime), (os.path.join(image_dir, jpeg_id + ".jpg"), "image/jpeg"))
            with open(png_path, "rb") as handle:
                self.assertEqual(handle.read(), png_data)
            with open(jpeg_path, "rb") as handle:
                self.assertEqual(handle.read(), jpeg_data)
            self.assertFalse(any(name.startswith(".image-") for name in os.listdir(image_dir)))

    def test_storage_capacity_rejects_new_assets_before_writing(self):
        with tempfile.TemporaryDirectory() as image_dir:
            data = make_png(2, 3)
            with self.assertRaises(gateway.ImageGatewayError) as raised:
                gateway.save_image_asset(
                    image_dir,
                    data,
                    "image/png",
                    max_storage_bytes=len(data) - 1,
                )
            self.assertEqual(raised.exception.status, 507)
            self.assertEqual(os.listdir(image_dir), [])

    def test_invalid_and_missing_asset_ids_are_not_found(self):
        with tempfile.TemporaryDirectory() as image_dir:
            invalid_ids = ["", "a" * 47, "A" * 48, "../" + "a" * 48]
            for asset_id in invalid_ids:
                with self.subTest(asset_id=asset_id):
                    self.assertEqual(gateway.find_image_asset(image_dir, asset_id), (None, None))
            self.assertEqual(gateway.find_image_asset(image_dir, "c" * 48), (None, None))


if __name__ == "__main__":
    unittest.main()
