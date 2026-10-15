from urllib.parse import urlparse
import os
from . import config as backend_config, image_assets, image_limits, image_provider, image_validation


class ImageHandlerMixin:
    def handle_image_generate(self):
        limiter_acquired = False
        request_id = None
        try:
            image_limits.validate_image_gateway_token(
                self.headers,
                self.server.image_gateway_token,
                self.server.packy_api_token,
            )
            self.server.image_generation_limiter.acquire()
            limiter_acquired = True
            body = self.read_json_body(
                max_bytes=backend_config.MAX_IMAGE_REQUEST_BYTES,
                too_large_message="Image generation payload is too large.",
            )
            image_request = image_validation.validate_image_generation_request(body)
            image_source, request_id, model = image_provider.call_packy_image_api(
                {
                    "api_token": self.server.packy_api_token,
                    "endpoint": self.server.packy_image_endpoint,
                    "model": self.server.packy_image_model,
                    "quality": self.server.packy_image_quality,
                },
                image_request,
            )
            image_data, mime, width, height = image_assets.materialize_packy_image(
                image_source,
                backend_config.PACKY_IMAGE_SIZES[image_request["size"]][1],
            )
            with self.server.image_storage_lock:
                asset_id = image_assets.save_image_asset(
                    self.server.image_dir,
                    image_data,
                    mime,
                    self.server.image_max_storage_bytes,
                )
        except OverflowError as error:
            self.send_json(413, {"success": False, "error": str(error)})
            return
        except ValueError as error:
            self.send_json(400, {"success": False, "error": str(error)})
            return
        except backend_config.ImageGatewayError as error:
            payload = {"success": False, "error": str(error)}
            response_request_id = error.request_id or request_id
            if response_request_id:
                payload["requestId"] = response_request_id
            if error.provider:
                payload["provider"] = error.provider
            if error.code:
                payload["code"] = error.code
            if error.upstream_code:
                payload["upstreamCode"] = error.upstream_code
            if error.reason:
                payload["reason"] = error.reason
            if error.upstream_status is not None:
                payload["upstreamStatus"] = error.upstream_status
            self.send_json(error.status, payload)
            return
        except OSError:
            payload = {"success": False, "error": "Generated image could not be stored."}
            if request_id:
                payload["requestId"] = request_id
            self.send_json(500, payload)
            return
        finally:
            if limiter_acquired:
                self.server.image_generation_limiter.release()

        self.send_json(200, {
            "success": True,
            "asset": {
                "id": asset_id,
                "url": image_validation.get_image_asset_prefix_for_generate_path(urlparse(self.path).path) + asset_id,
                "mime": mime,
                "width": width,
                "height": height,
            },
            "requestId": request_id,
            "model": model,
        })


    def handle_image_asset(self, asset_id):
        asset_path, mime = image_assets.find_image_asset(self.server.image_dir, asset_id)
        if not asset_path:
            self.send_json(404, {"success": False, "error": "Image asset not found."})
            return
        try:
            content_length = os.path.getsize(asset_path)
            handle = open(asset_path, "rb")
        except OSError:
            self.send_json(404, {"success": False, "error": "Image asset not found."})
            return

        with handle:
            self.send_headers(200, {
                "Content-Length": str(content_length),
                "Content-Disposition": "inline",
                "Cache-Control": "private, max-age=31536000, immutable",
                "Cross-Origin-Resource-Policy": "cross-origin",
                "X-Robots-Tag": "noindex, nofollow, noarchive",
                "ETag": '"%s"' % asset_id,
            }, content_type=mime)
            while True:
                chunk = handle.read(64 * 1024)
                if not chunk:
                    break
                self.wfile.write(chunk)
