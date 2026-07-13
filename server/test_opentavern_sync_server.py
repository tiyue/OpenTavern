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


VALID_IMAGE_URL = "https://opentavern-test.oss-cn-beijing.aliyuncs.com/result/image.png"


def make_png(width, height):
    return b"\x89PNG\r\n\x1a\n" + b"\x00\x00\x00\rIHDR" + struct.pack(">II", width, height)


def make_jpeg(width, height):
    return (
        b"\xff\xd8\xff\xc0\x00\x11\x08"
        + struct.pack(">HH", height, width)
        + b"\x03\x01\x11\x00\x02\x11\x00\x03\x11\x00"
    )


def make_headers(content_type=None, content_length=None, request_id=None):
    headers = Message()
    if content_type is not None:
        headers["Content-Type"] = content_type
    if content_length is not None:
        headers["Content-Length"] = str(content_length)
    if request_id is not None:
        headers["X-DashScope-Request-Id"] = request_id
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
            ({"prompt": "ok", "size": "1024*1024"}, "Unsupported image size."),
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

    def test_reference_image_enforces_exact_decoded_10_mib_boundary(self):
        exact_data = make_png(1024, 1536).ljust(
            gateway.MAX_REFERENCE_IMAGE_BYTES,
            b"\x00",
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
                dashscope_api_key="upstream-key",
                dashscope_workspace_id="ws-test",
                image_dir=image_dir,
                qwen_image_model="qwen-image-2.0-pro",
                image_max_storage_bytes=123456,
            )
            health = gateway.get_image_gateway_health(server)
            self.assertTrue(health["configured"])
            self.assertTrue(health["storageWritable"])
            self.assertTrue(health["ready"])
            self.assertEqual(health["maxStorageBytes"], 123456)
            self.assertNotIn("gateway-token", repr(health))
            self.assertNotIn("upstream-key", repr(health))


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
            dashscope_api_key="upstream-key",
            dashscope_workspace_id="workspace_123",
            qwen_image_model="qwen-image-test",
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
        with mock.patch.object(gateway, "call_qwen_image_api") as qwen_api:
            handler.handle_image_generate()

        limiter.acquire.assert_called_once_with()
        limiter.release.assert_not_called()
        handler.read_json_body.assert_not_called()
        qwen_api.assert_not_called()
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
        with mock.patch.object(gateway, "call_qwen_image_api") as qwen_api:
            second_handler.handle_image_generate()
        second_handler.read_json_body.assert_not_called()
        qwen_api.assert_not_called()
        second_handler.send_json.assert_called_once_with(
            429,
            {"success": False, "error": "Image generation rate limit exceeded."},
        )

    def test_qwen_failure_details_are_returned_to_the_client(self):
        limiter = mock.Mock()
        handler = self.make_handler(
            {"X-OpenTavern-Image-Token": "gateway-token"},
            limiter,
        )
        handler.read_json_body.return_value = {"prompt": "test"}
        qwen_error = gateway.ImageGatewayError(
            "Qwen image generation failed.",
            status=502,
            request_id="request-123",
            provider="qwen",
            code="QWEN_UPSTREAM_FAILED",
            upstream_code="DataInspectionFailed",
            reason="Input data may contain inappropriate content.",
            upstream_status=400,
        )
        with mock.patch.object(gateway, "call_qwen_image_api", side_effect=qwen_error):
            handler.handle_image_generate()

        limiter.acquire.assert_called_once_with()
        limiter.release.assert_called_once_with()
        handler.send_json.assert_called_once_with(
            502,
            {
                "success": False,
                "error": "Qwen image generation failed.",
                "requestId": "request-123",
                "provider": "qwen",
                "code": "QWEN_UPSTREAM_FAILED",
                "upstreamCode": "DataInspectionFailed",
                "reason": "Input data may contain inappropriate content.",
                "upstreamStatus": 400,
            },
        )

    def test_download_failure_keeps_the_qwen_request_id(self):
        limiter = mock.Mock()
        handler = self.make_handler(
            {"X-OpenTavern-Image-Token": "gateway-token"},
            limiter,
        )
        handler.read_json_body.return_value = {"prompt": "test"}
        download_error = gateway.ImageGatewayError(
            "Generated image could not be downloaded.",
            provider="qwen",
            code="QWEN_IMAGE_DOWNLOAD_FAILED",
            upstream_code="HTTP_403",
            reason="The generated image URL returned HTTP 403.",
            upstream_status=403,
        )
        with mock.patch.object(
            gateway,
            "call_qwen_image_api",
            return_value=(VALID_IMAGE_URL, "request-download", "qwen-image-test"),
        ), mock.patch.object(gateway, "download_generated_image", side_effect=download_error):
            handler.handle_image_generate()

        handler.send_json.assert_called_once_with(
            502,
            {
                "success": False,
                "error": "Generated image could not be downloaded.",
                "requestId": "request-download",
                "provider": "qwen",
                "code": "QWEN_IMAGE_DOWNLOAD_FAILED",
                "upstreamCode": "HTTP_403",
                "reason": "The generated image URL returned HTTP 403.",
                "upstreamStatus": 403,
            },
        )


class QwenUrlValidationTests(unittest.TestCase):
    def test_https_aliyuncs_subdomains_are_allowed(self):
        urls = [
            VALID_IMAGE_URL,
            "https://bucket.aliyuncs.com/image.jpg",
            "https://BUCKET.OSS-CN-SHANGHAI.ALIYUNCS.COM./image.jpg",
        ]
        for url in urls:
            with self.subTest(url=url):
                parsed = gateway.validate_qwen_image_url(url)
                self.assertEqual(parsed.scheme, "https")

    def test_non_aliyun_or_credentialed_urls_are_rejected(self):
        urls = [
            "http://bucket.aliyuncs.com/image.png",
            "https://aliyuncs.com/image.png",
            "https://bucket.aliyuncs.com.example.test/image.png",
            "https://user@bucket.aliyuncs.com/image.png",
            "https://user:password@bucket.aliyuncs.com/image.png",
            "not-a-url",
        ]
        for url in urls:
            with self.subTest(url=url):
                with self.assertRaises(gateway.ImageGatewayError):
                    gateway.validate_qwen_image_url(url)

    def test_redirect_handler_validates_every_redirect_target(self):
        handler = gateway.QwenImageRedirectHandler()
        original_request = Request(VALID_IMAGE_URL)
        redirect_headers = Message()
        sentinel = object()

        with mock.patch.object(
            gateway.HTTPRedirectHandler,
            "redirect_request",
            return_value=sentinel,
        ) as parent_redirect:
            result = handler.redirect_request(
                original_request,
                None,
                302,
                "Found",
                redirect_headers,
                "https://another-bucket.aliyuncs.com/final.png",
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
                    "https://example.test/stolen.png",
                )
            parent_redirect.assert_not_called()


class QwenApiTests(unittest.TestCase):
    def test_qwen_error_helpers_support_scalar_errors_and_safe_request_ids(self):
        code, reason = gateway.extract_qwen_error_details(
            {"code": "BadRequest", "error": "plain upstream reason"}
        )
        self.assertEqual(code, "BadRequest")
        self.assertEqual(reason, "plain upstream reason")
        self.assertEqual(
            gateway.get_qwen_request_id(
                make_headers(request_id="header-request-123"),
                {"request_id": {"invalid": True}},
            ),
            "header-request-123",
        )
        sanitized = gateway.sanitize_qwen_error_text(
            "Signature=signature-secret AccessKeyId=access-secret "
            "SecurityToken=security-secret Credential=credential-secret"
        )
        for secret in ("signature-secret", "access-secret", "security-secret", "credential-secret"):
            self.assertNotIn(secret, sanitized)
        image_error = gateway.sanitize_qwen_error_text(
            "upstream echoed data:image/jpeg;base64,QUJDREVGR0g="
        )
        self.assertNotIn("QUJDREVGR0g", image_error)
        self.assertIn("[REDACTED]", image_error)
        folded_image_error = gateway.sanitize_qwen_error_text(
            "upstream echoed data:image/jpeg;base64,QUJD\r\n"
            "REVGR0hJSktMTU5PUA=="
        )
        for fragment in ("QUJD", "REVGR0hJSktMTU5PUA"):
            self.assertNotIn(fragment, folded_image_error)
        self.assertIn("[REDACTED]", folded_image_error)

    def test_qwen_request_is_built_without_real_network_access(self):
        response_payload = {
            "output": {
                "choices": [
                    {
                        "message": {
                            "content": [{"image": "  %s  " % VALID_IMAGE_URL}]
                        }
                    }
                ]
            }
        }
        raw_response = json.dumps(response_payload).encode("utf-8")
        response = make_response(raw_response, content_type="application/json")
        response.headers["X-DashScope-Request-Id"] = "request-123"

        reference_image = "data:image/png;base64," + base64.b64encode(
            make_png(1024, 1536)
        ).decode("ascii")
        image_request = gateway.validate_image_generation_request(
            {
                "prompt": "paint a tavern",
                "referenceImage": reference_image,
                "negativePrompt": "text",
                "size": "1536*2688",
                "promptExtend": False,
                "seed": 42,
            }
        )
        with mock.patch.object(gateway, "urlopen", return_value=response) as urlopen:
            result = gateway.call_qwen_image_api(
                {
                    "api_key": "dashscope-secret",
                    "workspace_id": "workspace_123",
                    "model": "qwen-image-test",
                },
                image_request,
            )

        self.assertEqual(result, (VALID_IMAGE_URL, "request-123", "qwen-image-test"))
        request = urlopen.call_args.args[0]
        self.assertEqual(request.get_method(), "POST")
        self.assertEqual(
            request.full_url,
            "https://workspace_123.cn-beijing.maas.aliyuncs.com/api/v1/services/"
            "aigc/multimodal-generation/generation",
        )
        self.assertEqual(request.get_header("Authorization"), "Bearer dashscope-secret")
        self.assertEqual(urlopen.call_args.kwargs["timeout"], gateway.QWEN_REQUEST_TIMEOUT_SECONDS)
        payload = json.loads(request.data.decode("utf-8"))
        self.assertEqual(payload["model"], "qwen-image-test")
        self.assertEqual(
            payload["input"]["messages"][0]["content"],
            [{"image": reference_image}, {"text": "paint a tavern"}],
        )
        self.assertEqual(
            payload["parameters"],
            {
                "negative_prompt": "text",
                "prompt_extend": False,
                "watermark": False,
                "size": "1536*2688",
                "n": 1,
                "seed": 42,
            },
        )

    def test_invalid_qwen_configuration_is_rejected_before_network_access(self):
        image_request = gateway.validate_image_generation_request({"prompt": "test"})
        configs = [
            {"api_key": "", "workspace_id": "workspace"},
            {"api_key": "secret", "workspace_id": ""},
            {"api_key": "secret", "workspace_id": "bad.workspace"},
        ]
        with mock.patch.object(gateway, "urlopen") as urlopen:
            for config in configs:
                with self.subTest(config=config):
                    with self.assertRaises(gateway.ImageGatewayError) as raised:
                        gateway.call_qwen_image_api(config, image_request)
                    self.assertEqual(raised.exception.status, 503)
            urlopen.assert_not_called()

    def test_qwen_http_error_preserves_safe_failure_reason(self):
        image_request = gateway.validate_image_generation_request({"prompt": "test"})
        error_payload = {
            "code": "DataInspectionFailed",
            "message": (
                "Input data may contain inappropriate content.\n"
                "Authorization: Bearer dashscope-secret "
                "https://example.test/private?token=signed-value"
            ),
            "request_id": "request-filtered",
        }
        http_error = HTTPError(
            "https://workspace_123.cn-beijing.maas.aliyuncs.com/generate",
            400,
            "Bad Request",
            make_headers(request_id="request-header"),
            BytesIO(json.dumps(error_payload).encode("utf-8")),
        )
        with mock.patch.object(gateway, "urlopen", side_effect=http_error):
            with self.assertRaises(gateway.ImageGatewayError) as raised:
                gateway.call_qwen_image_api(
                    {
                        "api_key": "dashscope-secret",
                        "workspace_id": "workspace_123",
                        "model": "qwen-image-test",
                    },
                    image_request,
                )

        error = raised.exception
        self.assertEqual(error.status, 502)
        self.assertEqual(error.provider, "qwen")
        self.assertEqual(error.code, "QWEN_UPSTREAM_FAILED")
        self.assertEqual(error.upstream_code, "DataInspectionFailed")
        self.assertEqual(error.request_id, "request-filtered")
        self.assertEqual(error.upstream_status, 400)
        self.assertIn("Input data may contain inappropriate content.", error.reason)
        self.assertNotIn("dashscope-secret", error.reason)
        self.assertNotIn("signed-value", error.reason)
        self.assertNotIn("https://", error.reason)

    def test_qwen_upstream_401_stays_gateway_502_and_429_is_preserved(self):
        image_request = gateway.validate_image_generation_request({"prompt": "test"})
        for upstream_status, expected_status in ((401, 502), (403, 502), (429, 429)):
            with self.subTest(upstream_status=upstream_status):
                payload = {
                    "code": "UpstreamCode%s" % upstream_status,
                    "message": "Upstream reason %s" % upstream_status,
                }
                http_error = HTTPError(
                    "https://workspace_123.cn-beijing.maas.aliyuncs.com/generate",
                    upstream_status,
                    "Upstream Error",
                    make_headers(),
                    BytesIO(json.dumps(payload).encode("utf-8")),
                )
                with mock.patch.object(gateway, "urlopen", side_effect=http_error):
                    with self.assertRaises(gateway.ImageGatewayError) as raised:
                        gateway.call_qwen_image_api(
                            {
                                "api_key": "secret",
                                "workspace_id": "workspace_123",
                                "model": "qwen-image-test",
                            },
                            image_request,
                        )
                self.assertEqual(raised.exception.status, expected_status)
                self.assertEqual(raised.exception.upstream_status, upstream_status)

    def test_qwen_success_status_without_image_preserves_failure_details(self):
        response_payload = {
            "request_id": "request-no-image",
            "output": {
                "task_status": "FAILED",
                "code": "DataInspectionFailed",
                "message": "The prompt was rejected by the content policy.",
                "choices": [],
            },
        }
        response = make_response(
            json.dumps(response_payload).encode("utf-8"),
            content_type="application/json",
        )
        image_request = gateway.validate_image_generation_request({"prompt": "test"})
        with mock.patch.object(gateway, "urlopen", return_value=response):
            with self.assertRaises(gateway.ImageGatewayError) as raised:
                gateway.call_qwen_image_api(
                    {
                        "api_key": "secret",
                        "workspace_id": "workspace_123",
                        "model": "qwen-image-test",
                    },
                    image_request,
                )

        error = raised.exception
        self.assertEqual(error.code, "QWEN_UPSTREAM_FAILED")
        self.assertEqual(error.upstream_code, "DataInspectionFailed")
        self.assertEqual(error.reason, "The prompt was rejected by the content policy.")
        self.assertEqual(error.request_id, "request-no-image")

    def test_explicit_failure_status_is_not_accepted_even_when_an_image_is_present(self):
        cases = [
            {
                "request_id": "request-failed-task",
                "output": {
                    "task_status": "FAILED",
                    "message": "The task failed after validation.",
                    "choices": [{"message": {"content": [{"image": VALID_IMAGE_URL}]}}],
                },
            },
            {
                "request_id": "request-filtered-choice",
                "output": {
                    "choices": [
                        {
                            "finish_reason": "content_filter",
                            "message": {"content": [{"image": VALID_IMAGE_URL}]},
                        }
                    ]
                },
            },
        ]
        image_request = gateway.validate_image_generation_request({"prompt": "test"})
        for response_payload in cases:
            with self.subTest(request_id=response_payload["request_id"]):
                response = make_response(
                    json.dumps(response_payload).encode("utf-8"),
                    content_type="application/json",
                )
                with mock.patch.object(gateway, "urlopen", return_value=response):
                    with self.assertRaises(gateway.ImageGatewayError) as raised:
                        gateway.call_qwen_image_api(
                            {
                                "api_key": "secret",
                                "workspace_id": "workspace_123",
                                "model": "qwen-image-test",
                            },
                            image_request,
                        )
                self.assertEqual(raised.exception.code, "QWEN_UPSTREAM_FAILED")
                self.assertEqual(raised.exception.request_id, response_payload["request_id"])

    def test_invalid_json_preserves_request_id_from_response_headers(self):
        response = make_response(b"<html>not json</html>", content_type="text/html")
        response.headers["X-DashScope-Request-Id"] = "request-invalid-json"
        image_request = gateway.validate_image_generation_request({"prompt": "test"})
        with mock.patch.object(gateway, "urlopen", return_value=response):
            with self.assertRaises(gateway.ImageGatewayError) as raised:
                gateway.call_qwen_image_api(
                    {
                        "api_key": "secret",
                        "workspace_id": "workspace_123",
                        "model": "qwen-image-test",
                    },
                    image_request,
                )
        self.assertEqual(raised.exception.code, "QWEN_INVALID_RESPONSE")
        self.assertEqual(raised.exception.request_id, "request-invalid-json")

    def test_non_object_json_is_rejected_with_request_id(self):
        response = make_response(b"[]", content_type="application/json")
        response.headers["X-DashScope-Request-Id"] = "request-json-array"
        image_request = gateway.validate_image_generation_request({"prompt": "test"})
        with mock.patch.object(gateway, "urlopen", return_value=response):
            with self.assertRaises(gateway.ImageGatewayError) as raised:
                gateway.call_qwen_image_api(
                    {
                        "api_key": "secret",
                        "workspace_id": "workspace_123",
                        "model": "qwen-image-test",
                    },
                    image_request,
                )
        self.assertEqual(raised.exception.code, "QWEN_INVALID_RESPONSE")
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
        with mock.patch.object(gateway, "build_opener", return_value=opener) as build_opener:
            result = gateway.download_generated_image(VALID_IMAGE_URL, expected_size)
        redirect_handler = build_opener.call_args.args[0]
        self.assertIsInstance(redirect_handler, gateway.QwenImageRedirectHandler)
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
        with mock.patch.object(gateway, "MAX_IMAGE_BYTES", 8):
            with self.assertRaises(gateway.ImageGatewayError) as raised:
                self.download_with_response(response, (2, 2))
        self.assertEqual(str(raised.exception), "Generated image exceeds 20 MiB.")
        response.read.assert_called_once_with(9)

    def test_final_response_url_is_revalidated_after_redirects(self):
        response = make_response(
            make_png(2, 2),
            url="https://example.test/final.png",
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
        with mock.patch.object(gateway, "build_opener", return_value=opener):
            with self.assertRaises(gateway.ImageGatewayError) as raised:
                gateway.download_generated_image(VALID_IMAGE_URL, (2, 2))

        error = raised.exception
        self.assertEqual(error.code, "QWEN_IMAGE_DOWNLOAD_FAILED")
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
