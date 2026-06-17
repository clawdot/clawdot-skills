import importlib.util
import io
import json
import sys
import unittest
from argparse import Namespace
from contextlib import redirect_stdout
from pathlib import Path


MODULE_PATH = Path(__file__).resolve().parents[1] / "skills" / "takeout" / "scripts" / "takeout.py"
spec = importlib.util.spec_from_file_location("takeout_script_order", MODULE_PATH)
takeout = importlib.util.module_from_spec(spec)
assert spec.loader is not None
sys.modules[spec.name] = takeout
spec.loader.exec_module(takeout)


class FakeOrderGateway:
    def __init__(self):
        self.calls = []

    def create_order(self, token, session_id):
        self.calls.append((token, session_id))
        return {"order_id": "order-1", "payment_link": "https://pay.example/order-1"}


class RecordingGateway(takeout.GatewayClient):
    def __init__(self):
        self.requests = []

    def _request(self, method, path, body=None, *, user_token=None, use_admin=False):
        self.requests.append(
            {
                "method": method,
                "path": path,
                "body": body,
                "user_token": user_token,
                "use_admin": use_admin,
            }
        )
        return {"ok": True}


class OrderPaymentChannelTests(unittest.TestCase):
    def test_action_order_ignores_legacy_channel_arg(self):
        gw = FakeOrderGateway()
        args = Namespace(session_id="session-1", channel="wechat")

        buf = io.StringIO()
        with redirect_stdout(buf):
            takeout.action_order(args, gw, None, None, "user-token", None)

        self.assertEqual(gw.calls, [("user-token", "session-1")])
        self.assertEqual(
            json.loads(buf.getvalue()),
            {"order_id": "order-1", "payment_link": "https://pay.example/order-1"},
        )

    def test_gateway_create_order_does_not_send_channel(self):
        gw = RecordingGateway()

        result = gw.create_order("user-token", "session-1")

        self.assertEqual(result, {"ok": True})
        self.assertEqual(
            gw.requests,
            [
                {
                    "method": "POST",
                    "path": "/api/v1/orders",
                    "body": {"session_id": "session-1"},
                    "user_token": "user-token",
                    "use_admin": False,
                }
            ],
        )


if __name__ == "__main__":
    unittest.main()
