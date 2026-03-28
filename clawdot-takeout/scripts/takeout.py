#!/usr/bin/env python3
"""ClawDot takeout ordering script — single entry point for all actions."""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import HTTPError

# ── Config ──────────────────────────────────────────────────────────────────

@dataclass
class Config:
    gateway_url: str
    api_key: str
    user_token: str
    default_lat: float | None
    default_lng: float | None
    timeout_ms: int

def load_dotenv(path: Path) -> None:
    """Minimal .env loader — no dependency on python-dotenv."""
    if not path.is_file():
        return
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        value = value.strip().strip("'\"")
        if key and key not in os.environ:
            os.environ[key] = value

def load_config() -> Config:
    """Load config from env vars (populated by .env if present)."""
    base_dir = Path(__file__).resolve().parent.parent
    load_dotenv(base_dir / ".env")

    def to_float(key: str) -> float | None:
        v = os.environ.get(key)
        if v is None:
            return None
        try:
            return float(v)
        except ValueError:
            return None

    return Config(
        gateway_url=os.environ.get("GATEWAY_URL", "http://127.0.0.1:3100").rstrip("/"),
        api_key=os.environ.get("API_KEY", ""),
        user_token=os.environ.get("USER_TOKEN", ""),
        default_lat=to_float("DEFAULT_LAT"),
        default_lng=to_float("DEFAULT_LNG"),
        timeout_ms=int(os.environ.get("TIMEOUT_MS", "30000")),
    )


# ── Gateway Client ──────────────────────────────────────────────────────────

class GatewayError(Exception):
    def __init__(self, status: int, code: str, message: str):
        super().__init__(message)
        self.status = status
        self.code = code

class GatewayClient:
    def __init__(self, config: Config):
        self.base_url = config.gateway_url
        self.api_key = config.api_key
        self.user_token = config.user_token
        self.timeout = config.timeout_ms / 1000

    def _request(self, method: str, path: str, body: dict | None = None) -> dict:
        url = f"{self.base_url}{path}"
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "X-User-Token": self.user_token,
            "Content-Type": "application/json",
            "User-Agent": "ClawDot-Takeout/0.1",
        }
        data = json.dumps(body).encode() if body is not None else None
        req = Request(url, data=data, headers=headers, method=method)
        try:
            with urlopen(req, timeout=self.timeout) as resp:
                return json.loads(resp.read())
        except HTTPError as e:
            err_body = {}
            try:
                err_body = json.loads(e.read())
            except Exception:
                pass
            err = err_body.get("error", {})
            raise GatewayError(
                e.code,
                err.get("code", "UNKNOWN"),
                err.get("message", e.reason),
            ) from None

    def search_shops(self, lat: float, lng: float, keyword: str | None = None) -> dict:
        params = f"lat={lat}&lng={lng}"
        if keyword:
            from urllib.parse import quote
            params += f"&keyword={quote(keyword)}"
        return self._request("GET", f"/api/v1/shops/search?{params}")

    def get_shop_detail(self, shop_id: str, lat: float, lng: float) -> dict:
        from urllib.parse import quote
        params = f"lat={lat}&lng={lng}"
        return self._request("GET", f"/api/v1/shops/{quote(shop_id)}?{params}")

    def list_addresses(self) -> dict:
        return self._request("GET", "/api/v1/addresses")

    def search_addresses(self, keyword: str | None = None, lat: float | None = None, lng: float | None = None) -> dict:
        body: dict = {}
        if keyword:
            body["keyword"] = keyword
        if lat is not None:
            body["lat"] = lat
        if lng is not None:
            body["lng"] = lng
        return self._request("POST", "/api/v1/addresses/search", body)

    def select_address(self, body: dict) -> dict:
        return self._request("POST", "/api/v1/addresses/select", body)

    def preview_order(self, body: dict) -> dict:
        return self._request("POST", "/api/v1/orders/preview", body)

    def create_order(self, session_id: str) -> dict:
        return self._request("POST", "/api/v1/orders", {"session_id": session_id})

    def get_order_status(self, order_id: str) -> dict:
        from urllib.parse import quote
        return self._request("GET", f"/api/v1/orders/{quote(order_id)}")

# ── File Cache ──────────────────────────────────────────────────────────────

CACHE_DIR = Path.home() / ".cache" / "clawdot-takeout"
CACHE_FILE = CACHE_DIR / "cache.json"

class Cache:
    def __init__(self) -> None:
        self._data: dict[str, dict] = {}
        self._load()

    def _load(self) -> None:
        if not CACHE_FILE.is_file():
            return
        try:
            raw = json.loads(CACHE_FILE.read_text())
            if isinstance(raw, dict):
                self._data = raw
        except (json.JSONDecodeError, OSError):
            pass

    def _save(self) -> None:
        CACHE_DIR.mkdir(parents=True, exist_ok=True)
        CACHE_FILE.write_text(json.dumps(self._data, ensure_ascii=False))

    def get(self, key: str) -> dict | None:
        entry = self._data.get(key)
        if entry is None:
            return None
        if time.time() > entry.get("expires_at", 0):
            del self._data[key]
            self._save()
            return None
        return entry["data"]

    def set(self, key: str, data: object, ttl_seconds: float) -> None:
        self._data[key] = {"data": data, "expires_at": time.time() + ttl_seconds}
        self._prune()
        self._save()

    def delete(self, key: str) -> None:
        if key in self._data:
            del self._data[key]
            self._save()

    def _prune(self) -> None:
        """Remove expired entries."""
        now = time.time()
        expired = [k for k, v in self._data.items() if now > v.get("expires_at", 0)]
        for k in expired:
            del self._data[k]

# ── Response Trimmers ───────────────────────────────────────────────────────

def trim_search_results(raw: dict) -> dict:
    shops = []
    for s in raw.get("shops", []):
        shops.append({
            "id": s["id"],
            "name": s["name"],
            "rating": s.get("rating", ""),
            "delivery_fee": s.get("delivery_fee", 0),
            "delivery_time_minutes": s.get("delivery_time_minutes", 0),
            "min_order_amount": s.get("min_order_amount", 0),
            "distance": s.get("distance", ""),
            "highlights": [i["name"] for i in (s.get("items") or [])[:2]],
        })
    return {"shops": shops, "count": len(shops)}

def build_menu_overview(raw: dict) -> dict:
    shop = raw.get("shop", {})
    categories = []
    for i, cat in enumerate(raw.get("menu", [])):
        top_items = []
        for item in cat.get("items", [])[:3]:
            top_items.append({
                "name": item["name"],
                "price": item["price"],
                "sold": item.get("sold_count", ""),
            })
        categories.append({
            "name": cat["category"],
            "index": i,
            "item_count": len(cat.get("items", [])),
            "top_items": top_items,
        })
    return {
        "shop_name": shop.get("name", ""),
        "business_hours": shop.get("business_hours", ""),
        "categories": categories,
    }

def resolve_category(menu: list[dict], query: str) -> dict | None:
    for cat in menu:
        if cat["category"] == query:
            return cat
    try:
        idx = int(query)
        if 0 <= idx < len(menu):
            return menu[idx]
    except ValueError:
        pass
    for cat in menu:
        if query in cat["category"]:
            return cat
    return None

def build_category_detail(cat: dict) -> dict:
    items = []
    for item in cat.get("items", []):
        items.append({
            "item_id": item["item_id"],
            "name": item["name"],
            "price": item["price"],
            "original_price": item.get("original_price"),
            "sold": item.get("sold_count", ""),
            "in_stock": item.get("in_stock", True),
            "has_specs": len(item.get("specs") or []) > 0,
            "has_ingredients": len(item.get("ingredients") or []) > 0,
            "description": item.get("description"),
        })
    return {"category": cat["category"], "items": items}

def build_item_detail(item: dict) -> dict:
    ingredients_parts = []
    for g in item.get("ingredients") or []:
        options = "/".join(o["name"] for o in g.get("options", []))
        ingredients_parts.append(f"{g['group_name']}({options})")
    return {
        "item_id": item["item_id"],
        "sku_id": item["sku_id"],
        "name": item["name"],
        "price": item["price"],
        "specs": item.get("specs") if item.get("specs") else None,
        "attrs": item.get("attrs") if item.get("attrs") else None,
        "ingredients_summary": " | ".join(ingredients_parts),
        "default_ingredients": item.get("default_ingredients", []),
    }

def find_menu_item(detail: dict, item_id: str) -> dict | None:
    for cat in detail.get("menu", []):
        for item in cat.get("items", []):
            if item["item_id"] == item_id:
                return item
    return None

# ── Error Handling ──────────────────────────────────────────────────────────

def friendly_error(err: GatewayError) -> str:
    if err.status == 401:
        return "用户 token 可能过期了，请更新 .env 里的 USER_TOKEN"
    msg = err.args[0].lower() if err.args else ""
    if any(w in msg for w in ("expired", "not found", "过期", "不存在")):
        return "订单会话已过期或已使用，请重新预览下单。"
    if any(w in msg for w in ("closed", "not open", "休息", "未营业")):
        return "店铺暂未营业，请稍后再试。"
    if any(w in msg for w in ("out of stock", "sold out", "售罄", "缺货")):
        return "部分商品已售罄，请调整后重试。"
    if any(w in msg for w in ("min order", "minimum", "起送")):
        return "未达起送价，请加点别的~"
    return f"请求失败：{err.args[0]}"

# ── Actions ─────────────────────────────────────────────────────────────────

SEARCH_TTL = 5 * 60      # 5 minutes
MENU_TTL = 10 * 60        # 10 minutes
ADDRESS_TTL = 30 * 60     # 30 minutes

def normalize_address(addr: dict) -> dict:
    """Ensure lat/lng are floats (Gateway sometimes returns strings or null)."""
    lat = addr.get("lat")
    lng = addr.get("lng")
    addr["lat"] = float(lat) if lat is not None else 0.0
    addr["lng"] = float(lng) if lng is not None else 0.0
    return addr

def get_cached_address_coords(cache: Cache) -> tuple[float | None, float | None]:
    """Get lat/lng from cached address list."""
    addrs = cache.get("addr:user")
    if addrs and len(addrs) > 0:
        return addrs[0].get("lat"), addrs[0].get("lng")
    return None, None

def action_search(args: argparse.Namespace, gw: GatewayClient, cache: Cache, config: Config) -> None:
    cached_lat, cached_lng = get_cached_address_coords(cache)
    lat = args.lat or cached_lat or config.default_lat
    lng = args.lng or cached_lng or config.default_lng

    if lat is None or lng is None:
        die("无法确定配送位置，请提供地址。")

    cache_key = f"search:{lat},{lng},{args.keyword or 'default'}"
    cached = cache.get(cache_key)
    if cached:
        output(cached)
        return

    raw = gw.search_shops(lat, lng, args.keyword)
    trimmed = trim_search_results(raw)
    cache.set(cache_key, trimmed, SEARCH_TTL)
    output(trimmed)

def action_menu(args: argparse.Namespace, gw: GatewayClient, cache: Cache, config: Config) -> None:
    if not args.shop_id:
        die("缺少 --shop-id 参数。")

    cached_lat, cached_lng = get_cached_address_coords(cache)
    lat = args.lat or cached_lat or config.default_lat
    lng = args.lng or cached_lng or config.default_lng

    if lat is None or lng is None:
        die("无法确定位置，请先查询地址。")

    cache_key = f"menu:{args.shop_id}:{lat},{lng}"
    detail = cache.get(cache_key)
    if not detail:
        detail = gw.get_shop_detail(args.shop_id, lat, lng)
        cache.set(cache_key, detail, MENU_TTL)

    if args.item_id:
        item = find_menu_item(detail, args.item_id)
        if not item:
            die(f"未找到商品 {args.item_id}")
        output(build_item_detail(item))
        return

    if args.category:
        cat = resolve_category(detail.get("menu", []), args.category)
        if not cat:
            names = "、".join(c["category"] for c in detail.get("menu", []))
            die(f'未找到分类"{args.category}"，可用分类：{names}')
        output(build_category_detail(cat))
        return

    output(build_menu_overview(detail))

def action_addresses(args: argparse.Namespace, gw: GatewayClient, cache: Cache, config: Config) -> None:
    # Select (save) an address
    if args.select_source:
        body: dict = {"source": args.select_source}
        if args.poi_data:
            body["poi_data"] = json.loads(args.poi_data)
        if args.contact_name:
            body["contact_name"] = args.contact_name
        if args.contact_phone:
            body["contact_phone"] = args.contact_phone
        if args.address_detail:
            body["detail"] = args.address_detail
        if args.address_tag:
            body["tag"] = args.address_tag
        if args.eleme_address_id:
            body["eleme_address_id"] = args.eleme_address_id
        try:
            result = gw.select_address(body)
            cache.delete("addr:user")
            output(normalize_address(result))
        except GatewayError as e:
            die(f"保存地址失败：{friendly_error(e)}")
        return

    # Search addresses by keyword
    if args.search_keyword:
        lat = args.lat or config.default_lat
        lng = args.lng or config.default_lng
        if lat is None or lng is None:
            die("搜索地址时需要提供 --lat 和 --lng")
        try:
            result = gw.search_addresses(args.search_keyword, lat, lng)
            result["saved"] = [normalize_address(a) for a in result.get("saved", [])]
            if result.get("suggestions"):
                result["suggestions"] = [normalize_address(a) for a in result["suggestions"]]
            output(result)
        except GatewayError as e:
            die(f"地址搜索失败：{friendly_error(e)}")
        return

    # List saved addresses (default)
    try:
        result = gw.search_addresses()
        saved = [normalize_address(a) for a in result.get("saved", [])]
        result["saved"] = saved
        if saved:
            as_addresses = [{"id": a["id"], "address": a["address"], "lat": a["lat"], "lng": a["lng"]} for a in saved]
            cache.set("addr:user", as_addresses, ADDRESS_TTL)
        else:
            cache.delete("addr:user")
        output(result)
    except GatewayError as e:
        die(f"获取地址失败：{friendly_error(e)}")

def action_preview(args: argparse.Namespace, gw: GatewayClient, cache: Cache, config: Config) -> None:
    if not args.shop_id or args.address_id is None or not args.items:
        die("缺少必要参数：--shop-id、--address-id、--items")

    raw_items = json.loads(args.items)

    # Resolve address coordinates
    addrs = cache.get("addr:user")
    if not addrs:
        try:
            resp = gw.search_addresses()
            saved = [normalize_address(a) for a in resp.get("saved", [])]
            if saved:
                addrs = [{"id": a["id"], "address": a["address"], "lat": a["lat"], "lng": a["lng"]} for a in saved]
                cache.set("addr:user", addrs, ADDRESS_TTL)
        except GatewayError as e:
            die(f"获取地址失败：{friendly_error(e)}")

    addr = None
    for a in (addrs or []):
        if a.get("id") == args.address_id:
            addr = a
            break
    if not addr:
        names = "、".join(f'{a["id"]}({a["address"]})' for a in (addrs or []))
        die(f"未找到地址 {args.address_id}。可用地址：{names or '无'}")

    lat, lng = addr["lat"], addr["lng"]

    # Resolve menu to get sku_id for each item
    cache_key = f"menu:{args.shop_id}:{lat},{lng}"
    detail = cache.get(cache_key)
    if not detail:
        detail = gw.get_shop_detail(args.shop_id, lat, lng)
        cache.set(cache_key, detail, MENU_TTL)

    completed = []
    missing = []
    for raw in raw_items:
        menu_item = find_menu_item(detail, raw["item_id"])
        if not menu_item:
            missing.append(raw["item_id"])
            continue
        entry: dict = {
            "item_id": raw["item_id"],
            "sku_id": menu_item["sku_id"],
            "quantity": raw["quantity"],
        }
        if raw.get("specs"):
            entry["specs"] = raw["specs"]
        if raw.get("attrs"):
            entry["attrs"] = raw["attrs"]
        if menu_item.get("default_ingredients"):
            entry["ingredients"] = menu_item["default_ingredients"]
        completed.append(entry)

    if missing:
        die(f"未在菜单中找到以下商品：{'、'.join(missing)}。请确认 shop_id 和 item_id 是否正确。")

    body = {
        "shop_id": args.shop_id,
        "address_id": args.address_id,
        "items": completed,
        "lat": lat,
        "lng": lng,
    }
    if args.note:
        body["note"] = args.note

    result = gw.preview_order(body)
    output(result)

def action_order(args: argparse.Namespace, gw: GatewayClient, cache: Cache, config: Config) -> None:
    if not args.session_id:
        die("缺少 --session-id 参数。")
    try:
        result = gw.create_order(args.session_id)
        output(result)
    except GatewayError as e:
        die(friendly_error(e))

def action_order_status(args: argparse.Namespace, gw: GatewayClient, cache: Cache, config: Config) -> None:
    if not args.order_id:
        die("缺少 --order-id 参数。")
    result = gw.get_order_status(args.order_id)
    output(result)

# ── Main ────────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(description="ClawDot takeout ordering")
    parser.add_argument("--action", required=True,
                        choices=["search", "menu", "addresses", "preview", "order", "order_status"])
    # search
    parser.add_argument("--keyword", default=None)
    parser.add_argument("--lat", type=float, default=None)
    parser.add_argument("--lng", type=float, default=None)
    # menu
    parser.add_argument("--shop-id", default=None)
    parser.add_argument("--category", default=None)
    parser.add_argument("--item-id", default=None)
    # addresses
    parser.add_argument("--search-keyword", default=None)
    parser.add_argument("--select-source", default=None, choices=["poi", "eleme_history"])
    parser.add_argument("--poi-data", default=None, help="JSON string")
    parser.add_argument("--contact-name", default=None)
    parser.add_argument("--contact-phone", default=None)
    parser.add_argument("--address-detail", default=None)
    parser.add_argument("--address-tag", default=None)
    parser.add_argument("--eleme-address-id", default=None)
    # preview
    parser.add_argument("--address-id", type=int, default=None)
    parser.add_argument("--items", default=None, help="JSON array string")
    parser.add_argument("--note", default=None)
    # order
    parser.add_argument("--session-id", default=None)
    # order_status
    parser.add_argument("--order-id", default=None)

    args = parser.parse_args()
    config = load_config()

    if not config.api_key or not config.user_token:
        die("API_KEY 和 USER_TOKEN 必须在 .env 中配置")

    gw = GatewayClient(config)
    cache = Cache()

    actions = {
        "search": action_search,
        "menu": action_menu,
        "addresses": action_addresses,
        "preview": action_preview,
        "order": action_order,
        "order_status": action_order_status,
    }

    try:
        actions[args.action](args, gw, cache, config)
    except GatewayError as e:
        die(friendly_error(e))
    except json.JSONDecodeError as e:
        die(f"JSON 解析失败：{e}")


def die(msg: str) -> None:
    print(msg, file=sys.stderr)
    sys.exit(1)

def output(data: object) -> None:
    json.dump(data, sys.stdout, ensure_ascii=False)
    print()

if __name__ == "__main__":
    main()
