import importlib.util
import io
import json
import sys
import unittest
from argparse import Namespace
from contextlib import redirect_stdout
from pathlib import Path


MODULE_PATH = Path(__file__).resolve().parents[1] / "skills" / "takeout" / "scripts" / "takeout.py"
spec = importlib.util.spec_from_file_location("takeout_script", MODULE_PATH)
takeout = importlib.util.module_from_spec(spec)
assert spec.loader is not None
sys.modules[spec.name] = takeout
spec.loader.exec_module(takeout)


class FakeCache:
    def __init__(self):
        self.data = {}
        self.get_calls = []
        self.set_calls = []

    def get(self, key):
        self.get_calls.append(key)
        return self.data.get(key)

    def set(self, key, value, ttl_seconds):
        self.set_calls.append((key, value, ttl_seconds))
        self.data[key] = value


class FakeGateway:
    def __init__(self):
        self.detail_calls = []
        self.item_detail_calls = []

    def get_shop_detail(self, token, shop_id, lat, lng, specs="full"):
        self.detail_calls.append((token, shop_id, lat, lng, specs))
        return {
            "shop": {"name": "Test Shop", "business_hours": "10:00-22:00"},
            "menu": [
                {
                    "category": "饮品",
                    "items": [
                        {
                            "item_id": "item-1",
                            "sku_id": "sku-1",
                            "name": "拿铁",
                            "price": 18,
                            "sold_count": "月售10",
                            "in_stock": True,
                            "specs": [],
                            "attrs": [],
                            "ingredients": [],
                            "default_ingredients": [],
                        }
                    ],
                }
            ],
        }

    def get_shop_item_detail(self, token, shop_id, item_id, lat, lng):
        self.item_detail_calls.append((token, shop_id, item_id, lat, lng))
        return {
            "item": {
                "item_id": item_id,
                "sku_id": "sku-1",
                "name": "拿铁",
                "price": 18,
                "specs": [{"name": "规格", "options": ["中杯", "大杯"]}],
                "attrs": [{"name": "温度", "options": ["冰", "热"]}],
                "ingredients": [],
                "default_ingredients": [],
            }
        }


def _args(**overrides):
    defaults = {
        "shop_id": "shop-1",
        "item_id": None,
        "category": None,
        "shop_keyword": None,
        "lat": 31.23,
        "lng": 121.47,
    }
    defaults.update(overrides)
    return Namespace(**defaults)


def _run_menu(args, gw, cache):
    buf = io.StringIO()
    with redirect_stdout(buf):
        takeout.action_menu(
            args,
            gw,
            cache,
            Namespace(default_lat=None, default_lng=None),
            "user-token",
            None,
        )
    return json.loads(buf.getvalue())


class LazyMenuTests(unittest.TestCase):
    def test_menu_item_id_uses_item_detail_endpoint_without_full_menu(self):
        gw = FakeGateway()
        cache = FakeCache()

        result = _run_menu(_args(item_id="item-1"), gw, cache)

        self.assertEqual(gw.item_detail_calls, [("user-token", "shop-1", "item-1", 31.23, 121.47)])
        self.assertEqual(gw.detail_calls, [])
        self.assertEqual(cache.get_calls, [])
        self.assertEqual(result["item_id"], "item-1")
        self.assertEqual(result["specs"], [{"name": "规格", "options": ["中杯", "大杯"]}])

    def test_menu_browse_uses_lite_menu_and_marks_deferred_details(self):
        gw = FakeGateway()
        cache = FakeCache()

        result = _run_menu(_args(), gw, cache)

        self.assertEqual(gw.detail_calls, [("user-token", "shop-1", 31.23, 121.47, "none")])
        self.assertEqual(gw.item_detail_calls, [])
        self.assertEqual(cache.get_calls, ["menu:none:shop-1:31.23,121.47"])
        self.assertEqual(cache.set_calls[0][0], "menu:none:shop-1:31.23,121.47")
        self.assertIs(result["details_deferred"], True)
