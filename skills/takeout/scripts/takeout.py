#!/usr/bin/env python3
"""ClawDot takeout ordering script — single entry point for all actions.

支持两种鉴权模式：

* **Personal mode**：在 ``.env`` 配置 ``USER_TOKEN``，单用户长期复用。
* **Agent mode**：CLI 传 ``--phone <11 位手机号>``，脚本内部按手机号缓存
  user_token；缓存缺失时调用网关的 ``trustedBind``（带 ``X-Admin-Secret``）
  动态拿 token，自动完成"agent + 手机号"绑定。两种模式可共存，agent 模式
  下不需要再配 ``USER_TOKEN``，但需要额外配置 ``ADMIN_SECRET``。
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import quote, urlparse
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

# ── Config ──────────────────────────────────────────────────────────────────

@dataclass
class Config:
    gateway_url: str
    api_key: str
    admin_secret: str
    user_token: str
    default_lat: float | None
    default_lng: float | None
    redis_url: str | None
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
        admin_secret=os.environ.get("ADMIN_SECRET", ""),
        user_token=os.environ.get("USER_TOKEN", ""),
        default_lat=to_float("DEFAULT_LAT"),
        default_lng=to_float("DEFAULT_LNG"),
        redis_url=os.environ.get("REDIS_URL") or None,
        timeout_ms=int(os.environ.get("TIMEOUT_MS", "30000")),
    )


def normalize_phone_for_trusted_bind(phone: str) -> str:
    """Normalize phone into the 11-digit form expected by trustedBind."""
    normalized = "".join(ch for ch in phone.strip() if ch.isdigit() or ch == "+")
    if normalized.startswith("+86") and len(normalized) == 14:
        return normalized[3:]
    return normalized


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
        self.admin_secret = config.admin_secret
        self.timeout = config.timeout_ms / 1000

    def _request(
        self,
        method: str,
        path: str,
        body: dict | None = None,
        *,
        user_token: str | None = None,
        use_admin: bool = False,
    ) -> dict:
        url = f"{self.base_url}{path}"
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            "User-Agent": "ClawDot-Takeout/0.3",
        }
        if user_token:
            headers["X-User-Token"] = user_token
        if use_admin:
            headers["X-Admin-Secret"] = self.admin_secret
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
        except URLError as e:
            raise GatewayError(0, "NETWORK", str(e.reason)) from None

    def trusted_bind(self, phone: str) -> dict:
        return self._request(
            "POST", "/api/v1/user/bind/trusted", {"phone": phone}, use_admin=True
        )

    def request_bind(self, phone: str) -> dict:
        """SMS 流程第 1 步：发验证码到 phone，返回 {"bind_id": "..."}。仅 Bearer 鉴权。"""
        return self._request(
            "POST", "/api/v1/user/bind/request", {"phone": phone}
        )

    def verify_bind(self, bind_id: str, code: str) -> dict:
        """SMS 流程第 2 步：验码，返回 {"user_token": "...", "expires_at": "..."}。仅 Bearer 鉴权。"""
        return self._request(
            "POST", "/api/v1/user/bind/verify",
            {"bind_id": bind_id, "code": code},
        )

    def search_shops(self, token: str, lat: float, lng: float, keyword: str | None = None) -> dict:
        params = f"lat={lat}&lng={lng}"
        if keyword:
            params += f"&keyword={quote(keyword)}"
        return self._request("GET", f"/api/v1/shops/search?{params}", user_token=token)

    def get_shop_detail(self, token: str, shop_id: str, lat: float, lng: float) -> dict:
        return self._request(
            "GET",
            f"/api/v1/shops/{quote(shop_id)}?lat={lat}&lng={lng}",
            user_token=token,
        )

    def search_addresses(
        self,
        token: str,
        keyword: str | None = None,
        lat: float | None = None,
        lng: float | None = None,
        city: str | None = None,
    ) -> dict:
        body: dict = {}
        if keyword:
            body["keyword"] = keyword
        if lat is not None:
            body["lat"] = lat
        if lng is not None:
            body["lng"] = lng
        if city:
            body["city"] = city
        return self._request("POST", "/api/v1/addresses/search", body, user_token=token)

    def select_address(self, token: str, body: dict) -> dict:
        return self._request("POST", "/api/v1/addresses/select", body, user_token=token)

    def preview_order(self, token: str, body: dict) -> dict:
        return self._request("POST", "/api/v1/orders/preview", body, user_token=token)

    def create_order(self, token: str, session_id: str, channel: str | None = None) -> dict:
        body: dict = {"session_id": session_id}
        if channel:
            body["channel"] = channel
        return self._request("POST", "/api/v1/orders", body, user_token=token)

    def get_order_status(self, token: str, order_id: str) -> dict:
        return self._request(
            "GET", f"/api/v1/orders/{quote(order_id)}", user_token=token
        )

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


# ── Redis Token Cache (optional, for cross-process sharing) ─────────────────

REDIS_TOKEN_PREFIX = "clawdot:user_token:"
TOKEN_TTL = 3600  # 1 hour


class RedisTokenCache:
    """Minimal Redis client via raw sockets — no redis-py dependency."""

    def __init__(self, url: str):
        parsed = urlparse(url)
        self._host = parsed.hostname or "127.0.0.1"
        self._port = parsed.port or 6379
        self._password = parsed.password
        self._db = int(parsed.path.lstrip("/") or "0")

    @staticmethod
    def _build_cmd(*args: str) -> bytes:
        parts = [f"*{len(args)}\r\n".encode()]
        for a in args:
            encoded = a.encode()
            parts.append(f"${len(encoded)}\r\n".encode() + encoded + b"\r\n")
        return b"".join(parts)

    @staticmethod
    def _read_reply(sock) -> bytes | None:
        buf = b""
        while b"\r\n" not in buf:
            chunk = sock.recv(4096)
            if not chunk:
                break
            buf += chunk
        if not buf:
            return None
        prefix = buf[0:1]
        line_end = buf.index(b"\r\n")
        line = buf[1:line_end]
        if prefix == b"+":
            return line
        if prefix == b"-":
            return None
        if prefix == b":":
            return line
        if prefix == b"$":
            length = int(line)
            if length == -1:
                return None
            data_start = line_end + 2
            total_needed = data_start + length + 2
            while len(buf) < total_needed:
                chunk = sock.recv(4096)
                if not chunk:
                    break
                buf += chunk
            return buf[data_start:data_start + length]
        return None

    def _command(self, *args: str) -> bytes | None:
        import socket
        raw = self._build_cmd(*args)
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(5)
        try:
            sock.connect((self._host, self._port))
            if self._password:
                sock.sendall(self._build_cmd("AUTH", self._password))
                self._read_reply(sock)
            if self._db != 0:
                sock.sendall(self._build_cmd("SELECT", str(self._db)))
                self._read_reply(sock)
            sock.sendall(raw)
            return self._read_reply(sock)
        finally:
            sock.close()

    def get(self, key: str) -> str | None:
        try:
            result = self._command("GET", key)
            return result.decode() if result else None
        except Exception:
            return None

    def setex(self, key: str, ttl: int, value: str) -> bool:
        try:
            self._command("SETEX", key, str(ttl), value)
            return True
        except Exception:
            return False


def _try_connect_redis(config: Config) -> RedisTokenCache | None:
    if not config.redis_url:
        return None
    try:
        return RedisTokenCache(config.redis_url)
    except Exception:
        return None


# ── Token Resolution ────────────────────────────────────────────────────────

def resolve_token(
    phone: str | None,
    gw: GatewayClient,
    cache: Cache,
    redis: RedisTokenCache | None,
    config: Config,
) -> str:
    """Return user_token.

    Personal 模式 (phone=None): 直接读 env USER_TOKEN。
    Agent / SMS 模式 (phone given): Redis → file cache → ADMIN_SECRET ? trustedBind : 提示走 SMS 流程。
    """
    if phone is None:
        return config.user_token

    bind_phone = normalize_phone_for_trusted_bind(phone)
    redis_key = f"{REDIS_TOKEN_PREFIX}{bind_phone}"
    file_key = f"token:{bind_phone}"

    if redis:
        token = redis.get(redis_key)
        if token:
            return token

    cached = cache.get(file_key)
    if cached:
        token = cached["user_token"]
        if redis:
            redis.setex(redis_key, TOKEN_TTL, token)
        return token

    # cache miss — 选 admin 还是 SMS 流程
    if config.admin_secret:
        result = gw.trusted_bind(bind_phone)
        token = result["user_token"]
        cache.set(file_key, result, TOKEN_TTL)
        if redis:
            redis.setex(redis_key, TOKEN_TTL, token)
        return token

    # 没 ADMIN_SECRET → 必须走 SMS 流程让用户输码
    die_with_hint(
        f"用户 {bind_phone} 还没绑定。先用 request_code 发短信验证码到这个手机号，"
        f"等用户回复 6 位码后用 verify_code 完成绑定。",
        "USER_NOT_BOUND_NEEDS_SMS",
        ctx={"phone": bind_phone},
    )


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

def build_menu_overview(raw: dict, compact: bool = False) -> dict:
    """Build menu overview. compact=True 用于 recommend：跳过 ¥0 噪音分类、按销量取 top 5。"""
    shop = raw.get("shop", {})
    categories = []
    for i, cat in enumerate(raw.get("menu", [])):
        items = cat.get("items", [])

        if compact:
            real_items = [it for it in items if it.get("price", 0) > 0]
            if not real_items:
                continue
            items = real_items

        top_items = []
        for item in items[:2 if compact else 3]:
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

    if compact:
        def _cat_score(c: dict) -> int:
            score = 0
            for it in c["top_items"]:
                s = str(it.get("sold", "")).replace("+", "")
                for part in s.split():
                    try:
                        score += int(part)
                    except ValueError:
                        pass
            return score
        categories.sort(key=_cat_score, reverse=True)
        categories = categories[:5]

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


def search_menu_items(detail: dict, keyword: str) -> dict:
    """Search across all categories for items whose name contains the keyword."""
    keyword_lower = keyword.lower()
    hits: list[dict] = []
    for cat in detail.get("menu", []):
        for item in cat.get("items", []):
            name = item.get("name", "")
            if keyword_lower in name.lower():
                hits.append({
                    "item_id": item["item_id"],
                    "name": name,
                    "price": item["price"],
                    "sold": item.get("sold_count", ""),
                    "category": cat["category"],
                    "in_stock": item.get("in_stock", True),
                    "has_specs": len(item.get("specs") or []) > 0,
                })
    return {"keyword": keyword, "matches": hits, "count": len(hits)}


def normalize_address(addr: dict) -> dict:
    """Ensure lat/lng are floats (Gateway sometimes returns strings or null)."""
    lat = addr.get("lat")
    lng = addr.get("lng")
    addr["lat"] = float(lat) if lat is not None else 0.0
    addr["lng"] = float(lng) if lng is not None else 0.0
    return addr


def _normalize_search_result(result: dict) -> dict:
    """Normalize search response: coerce lat/lng on saved/suggestions, drop empty saved rows.

    Preserves backend sort order for suggestions (eleme_history first, poi after) and
    keeps the new fields ``requires_detail`` and ``suggested_detail`` so the LLM can
    route on them downstream.
    """
    saved = [normalize_address(a) for a in result.get("saved", []) if a.get("address")]
    saved.sort(key=lambda a: a.get("last_used_at") or "", reverse=True)

    suggestions = [
        normalize_address(a) for a in result.get("suggestions", [])
        if a.get("address") or a.get("name")
    ]
    suggestions.sort(key=lambda a: 0 if a.get("source") == "eleme_history" else 1)

    # Rename "token" → "sug_ref" so the agent's secret-redaction layer (if any)
    # doesn't mask the suggestion handle by keyword. Mirror food-takeout.
    for s in suggestions:
        if "token" in s:
            s["sug_ref"] = s.pop("token")

    return {"saved": saved, "suggestions": suggestions}


# ── Error Handling ──────────────────────────────────────────────────────────
#
# Each entry: (regex, code, user_message, recovery_hint_template).
# friendly_error() emits two lines to stderr — a translation for the user and
# a RECOVERY[CODE]: line for the agent so it picks the next tool call without
# extra reasoning rounds. Templates may reference {shop_id}, {address_id},
# {phone_masked}, {keyword}; missing keys fall back to defaults.

ERROR_PLAYBOOK: list[tuple[str, str, str, str]] = [
    (r"店铺必须商品未点|必选商品未点|必须先购买",
     "MUST_PICK_REQUIRED",
     "店铺要求必选项未点。",
     "若上方有 required_categories JSON 块（preview 触发） → 直接用其中数据：\n"
     "  1) 偏好类（name 含'锅底/底料/糖度/温度/辣度/口味/咸淡'）→ 把 items[].name 列给用户问'想选哪个'，**不要自己选**。\n"
     "  2) 凑单类（name 含'凑单/打包/餐具/主食自选'）→ 取 items[0].item_id append 到 items 立即重 preview。\n"
     "  → **此分支禁止再调 menu，数据全在 required_categories**。\n"
     "若上方无 JSON 块（order 等场景）→ menu --shop-id {shop_id} 重拉菜单找 required:true 分类。\n"
     "**通用禁令：禁止替用户做主**——别给火锅自动选成都味、别给奶茶自动选全糖。"),

    (r"无法确定浏览位置|无法确定配送位置|无法确定位置",
     "ADDR_MISSING",
     "缺用户坐标。",
     "下一步：直接问用户'你这会儿在哪边呀？地址直接说就行～'，拿到地址后 "
     "addresses --address-keyword '<用户给的地址>' --city '<推断或问用户>'。禁止用任何默认坐标。"),

    (r"\[需要地址\]",
     "ADDR_MISSING",
     "缺用户坐标。",
     "下一步：直接问用户'你这会儿在哪边呀？'，不要把脚本报错原文转给用户。"),

    (r"DETAIL_REQUIRED|这个地址是新地点",
     "POI_DETAIL_REQUIRED",
     "POI 地址需要门牌号。",
     "下一步：问用户'几号楼几层几室？'，拿到具体内容后 "
     "addresses --select-token <sug_ref> --contact-name --contact-phone --address-detail '<具体内容>' 重 select。"
     "门牌不能传'无'/空格。"),

    (r"CONTACT_REQUIRED|缺少收件人",
     "CONTACT_REQUIRED",
     "缺收件人姓名/手机号。",
     "下一步：问'收件人写谁？手机就用你这个 {phone_masked} 行吗？'，"
     "拿到后 addresses --select-token --contact-name --contact-phone 重 select。"),

    (r"无法预览订单：先调用 addresses|先调.*addresses",
     "ADDR_CACHE_MISS",
     "preview 缺地址缓存。",
     "下一步：先调 addresses（无参）刷新缓存，再重 preview。"),

    (r"未在菜单中找到",
     "ITEM_NOT_IN_MENU",
     "item_id 不在当前 shop 菜单中。",
     "若上方有 needs_clarification JSON 块（preview 触发） → 直接用其中数据：\n"
     "  1) 某 entry 的 candidates 列表为 1 项 → 用其 item_id 重 preview，自动 recovery 已写在 auto_recovered。\n"
     "  2) candidates 列表为 0 项 → 给用户列出商品名让他确认想点啥（对应位置的菜单里没找到）。\n"
     "  3) candidates 列表 ≥2 项 → 列出 candidates[].name 给用户问'你要哪个'。\n"
     "  → **此分支禁止再调 menu，候选已附在 needs_clarification**。\n"
     "若上方无 JSON 块 → menu --shop-id {shop_id} --keyword <用户原话菜名> 重拉菜单。\n"
     "**通用禁令：禁止跨店复用 item_id；禁止把中文菜名当 item_id 字段传。**"),

    (r"未找到商品 \S+",
     "ITEM_NOT_FOUND",
     "item_id 不存在于当前店。",
     "下一步：menu --shop-id {shop_id} --keyword '<菜名>' 跨分类搜，或直接 menu --shop-id {shop_id} 看分类概览。"),

    (r'未找到分类',
     "CATEGORY_NOT_FOUND",
     "分类名错。",
     "下一步：错误信息已含'可用分类'列表，从中挑一个传给 --category。"),

    (r"地址超过.*配送范围|不在配送范围|请重新选择地址后下单",
     "OUT_OF_RANGE",
     "店铺不送当前地址。",
     "下一步：保留地址，recommend --shop-keyword '<同品类>' --lat --lng --top-n 4 推荐其他店；"
     "或告诉用户'这家不送你这边，换家行不'。禁止换地址重试，禁止用同 shop_id 重 preview。"),

    (r"min order|minimum|未达起送价|起送",
     "BELOW_MIN_ORDER",
     "未达起送价。",
     "下一步：menu --shop-id {shop_id} 翻菜单挑 1-2 个低价单品（饮料/小食），"
     "或告诉用户差多少让用户决定加什么。禁止自己挑加价高的菜塞进去——涉及花钱必须用户点头。"),

    (r"closed|not open|店铺.*打烊|休息|未营业",
     "SHOP_CLOSED",
     "店铺暂未营业。",
     "下一步：recommend --shop-keyword '<同品类>' --lat --lng 推同类其他店。不要重试同店。"),

    (r"out of stock|sold out|售罄|缺货",
     "ITEM_SOLD_OUT",
     "部分商品已售罄。",
     "下一步：menu --shop-id {shop_id} 找同款替代（同分类下其他 item），"
     "拿替代款给用户确认后再 preview。不要自动替换。"),

    (r"Order render failed|Order creation failed",
     "ORDER_GENERIC_FAIL",
     "订单创建/预览失败。",
     "下一步：menu --shop-id {shop_id} 重看商品状态（是否下架），逐项核对 item_id 后重 preview。"
     "如多次失败，告诉用户换家或调整组合。"),

    (r"订单会话已过期|session.*expired",
     "SESSION_EXPIRED",
     "订单会话已过期。",
     "下一步：用同样的 shop_id / address_id / items 重新 preview 拿新 session_id 再 order。"),

    (r"地址候选已过期|SUGGESTION_EXPIRED",
     "SUGGESTION_EXPIRED",
     "地址 sug_ref 已过期。",
     "下一步：addresses --address-keyword '<用户原话地址>' 重拿新 sug_ref，再 select。"),
]


_PLACEHOLDER_DEFAULTS = {
    "shop_id": "<shop_id>",
    "address_id": "<address_id>",
    "phone_masked": "<手机号>",
    "keyword": "<keyword>",
}


def _format_recovery(template: str, ctx: dict | None) -> str:
    merged = {**_PLACEHOLDER_DEFAULTS, **(ctx or {})}
    try:
        return template.format(**merged)
    except (KeyError, IndexError):
        return template


def _lookup_by_code(code: str) -> tuple[str, str, str] | None:
    for _pat, c, user_msg, hint in ERROR_PLAYBOOK:
        if c == code:
            return c, user_msg, hint
    return None


def _lookup_by_pattern(raw: str) -> tuple[str, str, str] | None:
    for pattern, code, user_msg, hint in ERROR_PLAYBOOK:
        if re.search(pattern, raw, re.IGNORECASE):
            return code, user_msg, hint
    return None


def friendly_error(err: GatewayError, ctx: dict | None = None) -> str:
    """Translate gateway error into user-facing message + RECOVERY hint for agent.

    stderr output:
      <user-facing translation>
      RECOVERY[<CODE>]: <concrete next tool call>
    """
    if err.status == 401:
        return "用户认证失败，请检查 API_KEY / ADMIN_SECRET / USER_TOKEN 配置（agent 模式必须 ADMIN_SECRET，personal 模式必须 USER_TOKEN）。"
    if err.status == 403:
        return "权限不足，请检查 ADMIN_SECRET 配置。"

    raw = err.args[0] if err.args else ""
    matched = _lookup_by_pattern(raw)
    if matched:
        code, user_msg, hint = matched
        return f"{user_msg}\nRECOVERY[{code}]: {_format_recovery(hint, ctx)}"
    return f"请求失败：{raw}"


def die_with_hint(user_msg: str, code: str, ctx: dict | None = None,
                  extra: dict | None = None) -> None:
    """Emit a die() with a RECOVERY hint appended, looked up by error code.

    ``extra`` (optional) is appended as a JSON block on its own line to give
    the LLM structured data alongside the error so it can act without an
    additional tool round-trip — e.g. embedding ``required_categories`` on
    MUST_PICK_REQUIRED so the LLM does not need to call ``menu --category 必选``.
    Order matters: ``extra`` goes BEFORE the RECOVERY line so the LLM reads
    actionable data first.
    """
    parts: list[str] = [user_msg]
    if extra is not None:
        parts.append(json.dumps(extra, ensure_ascii=False))
    found = _lookup_by_code(code)
    if found:
        _c, _u, hint = found
        parts.append(f"RECOVERY[{code}]: {_format_recovery(hint, ctx)}")
    die("\n".join(parts))


def _extract_required_categories(detail: dict) -> list[dict]:
    """Pull must-pick categories out of a shop_detail menu dict.

    Eleme gateway uses ``category`` (not ``name``) for category display name and
    has no explicit ``required`` flag, so we name-match heuristically.
    Returns trimmed list (top 6 items per category) safe to embed in errors.
    """
    out: list[dict] = []
    REQUIRED_MARKERS = ("必选", "必点", "选锅底", "凑单", "必加")
    for cat in detail.get("menu", []) or []:
        cat_name = (cat.get("category") or cat.get("name") or "")
        if not cat_name:
            continue
        is_required = (
            cat.get("required") is True
            or (isinstance(cat.get("min_select"), (int, float)) and cat.get("min_select", 0) >= 1)
            or any(marker in cat_name for marker in REQUIRED_MARKERS)
        )
        if not is_required:
            continue
        items = cat.get("items", []) or []
        out.append({
            "name": cat_name,
            "min_select": cat.get("min_select"),
            "items": [
                {
                    "item_id": it.get("item_id"),
                    "name": it.get("name"),
                    "price": it.get("price"),
                    "tag": it.get("tag"),
                }
                for it in items[:6]
            ],
        })
    return out


# ── Actions ─────────────────────────────────────────────────────────────────

SEARCH_TTL = 5 * 60       # 5 minutes
MENU_TTL = 10 * 60        # 10 minutes
ADDRESS_TTL = 30 * 60     # 30 minutes


def _addr_cache_key(phone: str | None) -> str:
    """Phone-scoped in agent mode; falls back to a single bucket in personal mode."""
    return f"addr:{phone}" if phone else "addr:user"


def get_cached_address_coords(cache: Cache, phone: str | None) -> tuple[float | None, float | None]:
    addrs = cache.get(_addr_cache_key(phone))
    if addrs and len(addrs) > 0:
        return addrs[0].get("lat"), addrs[0].get("lng")
    return None, None


def _resolve_lat_lng(
    args: argparse.Namespace, cache: Cache, config: Config, phone: str | None
) -> tuple[float | None, float | None]:
    """Resolve lat/lng from CLI args > address cache > DEFAULT_* (personal mode only)."""
    if args.lat is not None and args.lng is not None:
        return args.lat, args.lng
    cached_lat, cached_lng = get_cached_address_coords(cache, phone)
    if cached_lat is not None and cached_lng is not None:
        return cached_lat, cached_lng
    # Personal-mode escape hatch: a single user explicitly configured a default.
    # Agent mode never falls back here — it must ask the user instead.
    if phone is None:
        return config.default_lat, config.default_lng
    return None, None


def _refresh_saved_cache(cache: Cache, phone: str | None, saved: list[dict]) -> None:
    addr_cache_key = _addr_cache_key(phone)
    if saved:
        as_list = [
            {
                "id": a["id"],
                "address": a["address"],
                "detail": a.get("detail", ""),
                "lat": a["lat"],
                "lng": a["lng"],
                "contact_name": a.get("contact_name", ""),
                "contact_phone": a.get("contact_phone", ""),
                "tag": a.get("tag", ""),
                "last_used_at": a.get("last_used_at"),
                "use_count": a.get("use_count", 0),
            }
            for a in saved
        ]
        cache.set(addr_cache_key, as_list, ADDRESS_TTL)
    else:
        cache.delete(addr_cache_key)


def action_recommend(args: argparse.Namespace, gw: GatewayClient, cache: Cache,
                     config: Config, token: str, phone: str | None) -> None:
    """搜店 + 并行取 top N 家菜单一步到位，省一次推理。

    返回 {"shops": [...], "menus": [...]}：每条 menu 是 compact 概览（含 shop_id）。
    """
    lat, lng = _resolve_lat_lng(args, cache, config, phone)
    if lat is None or lng is None:
        die_with_hint(
            "[需要地址] 还没拿到用户位置——请直接问用户当前在哪个城市/地址（'你这会儿在哪边呀？地址直接说就行～'），不要把这句报错原文转给用户。",
            "ADDR_MISSING",
        )

    try:
        top_n = min(int(args.top_n or 3), 5)
    except (TypeError, ValueError):
        top_n = 3

    search_cache_key = f"search:{lat},{lng},{args.shop_keyword or 'default'}"
    cached_search = cache.get(search_cache_key)
    if cached_search:
        trimmed = cached_search
    else:
        raw = gw.search_shops(token, lat, lng, args.shop_keyword)
        trimmed = trim_search_results(raw)
        cache.set(search_cache_key, trimmed, SEARCH_TTL)

    top_shops = trimmed["shops"][:top_n]

    def _fetch_menu(shop: dict) -> dict:
        menu_cache_key = f"menu:{shop['id']}:{lat},{lng}"
        detail = cache.get(menu_cache_key)
        if not detail:
            try:
                detail = gw.get_shop_detail(token, shop["id"], lat, lng)
                cache.set(menu_cache_key, detail, MENU_TTL)
            except GatewayError:
                detail = None
        if detail:
            overview = build_menu_overview(detail, compact=True)
            overview["shop_id"] = shop["id"]
            return overview
        return {"shop_id": shop["id"], "shop_name": shop["name"], "error": "菜单获取失败"}

    from concurrent.futures import ThreadPoolExecutor
    if top_shops:
        with ThreadPoolExecutor(max_workers=max(1, len(top_shops))) as pool:
            menus = list(pool.map(_fetch_menu, top_shops))
    else:
        menus = []

    output({"shops": top_shops, "menus": menus})


def action_search(args: argparse.Namespace, gw: GatewayClient, cache: Cache,
                  config: Config, token: str, phone: str | None) -> None:
    lat, lng = _resolve_lat_lng(args, cache, config, phone)
    if lat is None or lng is None:
        die_with_hint(
            "[需要地址] 还没拿到用户位置——请直接问用户当前在哪个城市/地址，不要把这句报错原文转给用户。",
            "ADDR_MISSING",
        )

    cache_key = f"search:{lat},{lng},{args.shop_keyword or 'default'}"
    cached = cache.get(cache_key)
    if cached:
        output(cached)
        return

    raw = gw.search_shops(token, lat, lng, args.shop_keyword)
    trimmed = trim_search_results(raw)
    cache.set(cache_key, trimmed, SEARCH_TTL)
    output(trimmed)


def action_menu(args: argparse.Namespace, gw: GatewayClient, cache: Cache,
                config: Config, token: str, phone: str | None) -> None:
    if not args.shop_id:
        die("缺少 --shop-id 参数。")

    lat, lng = _resolve_lat_lng(args, cache, config, phone)
    if lat is None or lng is None:
        die_with_hint(
            "[需要地址] 还没拿到用户位置——请直接问用户当前在哪个城市/地址，不要把这句报错原文转给用户。",
            "ADDR_MISSING",
        )

    cache_key = f"menu:{args.shop_id}:{lat},{lng}"
    detail = cache.get(cache_key)
    if not detail:
        detail = gw.get_shop_detail(token, args.shop_id, lat, lng)
        cache.set(cache_key, detail, MENU_TTL)

    if args.item_id:
        item = find_menu_item(detail, args.item_id)
        if not item:
            die_with_hint(f"未找到商品 {args.item_id}", "ITEM_NOT_FOUND",
                          {"shop_id": args.shop_id})
        output(build_item_detail(item))
        return

    if args.shop_keyword:
        # In menu context, --shop-keyword (and its --keyword alias) cross-searches
        # menu items by name across categories. Reuses the same dest to avoid a
        # second flag the LLM has to learn.
        output(search_menu_items(detail, args.shop_keyword))
        return

    if args.category:
        cat = resolve_category(detail.get("menu", []), args.category)
        if not cat:
            names = "、".join(c["category"] for c in detail.get("menu", []))
            die_with_hint(f'未找到分类"{args.category}"，可用分类：{names}',
                          "CATEGORY_NOT_FOUND")
        output(build_category_detail(cat))
        return

    output(build_menu_overview(detail))


def action_addresses(args: argparse.Namespace, gw: GatewayClient, cache: Cache,
                     config: Config, token: str, phone: str | None) -> None:
    addr_cache_key = _addr_cache_key(phone)

    # ── Branch 1: Select (save) an address via suggestion token ──
    if args.select_token:
        if not args.contact_name or not args.contact_phone:
            die("保存地址需要 --contact-name 和 --contact-phone。")
        body: dict = {
            "token": args.select_token,
            "contact_name": args.contact_name,
            "contact_phone": args.contact_phone,
        }
        if args.address_detail:
            body["detail"] = args.address_detail
        if args.address_tag:
            body["tag"] = args.address_tag
        try:
            result = gw.select_address(token, body)
            # Insert the freshly-created address at cache HEAD so an immediately
            # following preview can resolve it without a 19 KB addresses(no-args)
            # refresh round-trip + extra LLM round.
            new_addr = normalize_address(result)
            existing = cache.get(addr_cache_key) or []
            existing = [a for a in existing if a.get("id") != new_addr.get("id")]
            existing.insert(0, new_addr)
            cache.set(addr_cache_key, existing, ADDRESS_TTL)
            output(new_addr)
        except GatewayError as e:
            if e.code == "CONTACT_REQUIRED":
                die_with_hint("缺少收件人姓名或手机号，请向用户确认后重试。", "CONTACT_REQUIRED",
                              {"phone_masked": phone or "<手机号>"})
            if e.code == "DETAIL_REQUIRED":
                die_with_hint("这个地址是新地点（POI），需要先跟用户问到具体门牌号/楼层/房间号，再带上 --address-detail 重试。",
                              "POI_DETAIL_REQUIRED")
            if e.code == "SUGGESTION_EXPIRED":
                die_with_hint("地址候选已过期或已使用。", "SUGGESTION_EXPIRED")
            die(f"保存地址失败：{friendly_error(e)}")
        return

    # ── Branch 2: Search (by keyword and/or coords/city) ──
    if args.address_keyword or args.lat is not None or args.lng is not None or args.city:
        # When --city is passed, let the gateway use cityId — drop coords so
        # they don't override (gateway rule: city beats historical coords).
        if args.city:
            call_lat, call_lng = None, None
        else:
            call_lat, call_lng = args.lat, args.lng
        try:
            result = gw.search_addresses(token, args.address_keyword, call_lat, call_lng, args.city)
            trimmed = _normalize_search_result(result)
            _refresh_saved_cache(cache, phone, trimmed["saved"])
            output(trimmed)
        except GatewayError as e:
            die(f"地址搜索失败：{friendly_error(e)}")
        return

    # ── Branch 3: Default — list all saved + history ──
    cached_lat, cached_lng = get_cached_address_coords(cache, phone)
    # Personal-mode default coords are a useful seed for cold-start; agent mode
    # leaves them None and lets the gateway / LLM ask the user.
    if cached_lat is None and cached_lng is None and phone is None:
        cached_lat, cached_lng = config.default_lat, config.default_lng

    try:
        result = gw.search_addresses(token, None, cached_lat, cached_lng)
        trimmed = _normalize_search_result(result)
    except GatewayError as e:
        die(f"获取地址失败：{friendly_error(e)}")
    if not trimmed["saved"] and not trimmed["suggestions"]:
        die_with_hint(
            "[需要地址] 后端没有 saved 地址也没有历史记录——请直接问用户当前位置（'你这会儿在哪边呀？地址直接说就行～'），不要把这句报错原文转给用户。",
            "ADDR_MISSING",
        )
    _refresh_saved_cache(cache, phone, trimmed["saved"])
    output(trimmed)


def action_preview(args: argparse.Namespace, gw: GatewayClient, cache: Cache,
                   config: Config, token: str, phone: str | None) -> None:
    if not args.shop_id or args.address_id is None or not args.items:
        die("缺少必要参数：--shop-id、--address-id、--items")

    addr_cache_key = _addr_cache_key(phone)
    raw_items = json.loads(args.items)

    # Resolve address coordinates
    addrs = cache.get(addr_cache_key)
    if not addrs:
        cached_lat, cached_lng = get_cached_address_coords(cache, phone)
        if cached_lat is None or cached_lng is None:
            if phone is None:
                cached_lat, cached_lng = config.default_lat, config.default_lng
        if cached_lat is None or cached_lng is None:
            die_with_hint(
                "[需要地址] preview 缺地址缓存且没有坐标——先把用户当前位置问出来再 preview，不要把这句报错原文转给用户。",
                "ADDR_CACHE_MISS",
            )
        try:
            resp = gw.search_addresses(token, None, cached_lat, cached_lng)
            trimmed = _normalize_search_result(resp)
            _refresh_saved_cache(cache, phone, trimmed["saved"])
            addrs = cache.get(addr_cache_key)
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

    lat = args.lat or addr.get("lat")
    lng = args.lng or addr.get("lng")
    # Guard against eleme history rows that come back without lat/lng.
    if not lat or not lng:
        cached_lat, cached_lng = get_cached_address_coords(cache, phone)
        lat = lat or cached_lat or (config.default_lat if phone is None else None)
        lng = lng or cached_lng or (config.default_lng if phone is None else None)
        if not lat or not lng:
            die_with_hint(
                f"地址 {args.address_id} 缺少坐标，请重新搜索地址。",
                "ADDR_MISSING",
            )

    # Resolve menu for sku_id / default_ingredients
    cache_key = f"menu:{args.shop_id}:{lat},{lng}"
    detail = cache.get(cache_key)
    if not detail:
        detail = gw.get_shop_detail(token, args.shop_id, lat, lng)
        cache.set(cache_key, detail, MENU_TTL)

    def _build_preview_entry(raw: dict, menu_item: dict) -> dict:
        """Convert raw {item_id, quantity, specs?, attrs?} into a gateway preview
        entry, normalising specs/attrs from dict→list shape and attaching
        default_ingredients from the resolved menu_item."""
        entry: dict = {
            "item_id": menu_item["item_id"],
            "sku_id": menu_item["sku_id"],
            "quantity": raw.get("quantity", 1),
        }
        if raw.get("specs"):
            specs = raw["specs"]
            if isinstance(specs, dict):
                specs = [{"name": k, "value": v} for k, v in specs.items()]
            entry["specs"] = specs
        if raw.get("attrs"):
            attrs = raw["attrs"]
            if isinstance(attrs, dict):
                attrs = [{"name": k, "value": v} for k, v in attrs.items()]
            entry["attrs"] = attrs
        if menu_item.get("default_ingredients"):
            entry["ingredients"] = menu_item["default_ingredients"]
        return entry

    completed: list[dict] = []
    missing_raws: list[dict] = []
    for raw in raw_items:
        menu_item = find_menu_item(detail, raw["item_id"])
        if not menu_item:
            missing_raws.append(raw)
            continue
        completed.append(_build_preview_entry(raw, menu_item))

    if missing_raws:
        # Fuzzy-match by name against the cached menu detail. Two failure modes:
        #   (A) LLM passed Chinese display-name as item_id ("牛肉胡辣汤") →
        #       fuzzy finds 1 unique hit → auto-recover, preserving qty/specs/attrs.
        #   (B) LLM hallucinated a fake id → fuzzy 0 matches → embed candidates
        #       so the LLM can ask the user without an extra menu round-trip.
        auto_recovered: list[dict] = []
        needs_clarification: list[dict] = []
        for raw in missing_raws:
            raw_id = raw["item_id"]
            raw_matches = search_menu_items(detail, raw_id).get("matches", [])
            # Dedup by item_id: gateway menus often list the same item across
            # categories ("推荐" + "实际分类"). Without dedup we'd lose auto-recovery.
            seen: set[str] = set()
            candidates: list[dict] = []
            for c in raw_matches:
                cid = c.get("item_id")
                if cid and cid not in seen:
                    seen.add(cid)
                    candidates.append(c)
            if len(candidates) == 1:
                only = candidates[0]
                cand_menu = find_menu_item(detail, only["item_id"])
                if cand_menu:
                    completed.append(_build_preview_entry(raw, cand_menu))
                    auto_recovered.append({
                        "was": raw_id,
                        "now": {"item_id": only["item_id"], "name": only["name"]},
                    })
                    continue
            needs_clarification.append({
                "raw_id_llm_passed": raw_id,
                "candidates": [
                    {"item_id": c["item_id"], "name": c["name"], "price": c.get("price")}
                    for c in candidates[:5]
                ],
            })

        if needs_clarification:
            still_missing = "、".join(c["raw_id_llm_passed"] for c in needs_clarification)
            recovered_note = (
                f"（已自动改正 {len(auto_recovered)} 项：" +
                ", ".join(ar["now"]["name"] for ar in auto_recovered) + "）"
                if auto_recovered else ""
            )
            die_with_hint(
                f"未在菜单中找到以下商品：{still_missing}。{recovered_note}",
                "ITEM_NOT_IN_MENU",
                {"shop_id": args.shop_id},
                extra={
                    "needs_clarification": needs_clarification,
                    "auto_recovered": auto_recovered,
                },
            )

    body = {
        "shop_id": args.shop_id,
        "address_id": args.address_id,
        "items": completed,
        "lat": lat,
        "lng": lng,
    }
    if args.note:
        body["note"] = args.note

    try:
        result = gw.preview_order(token, body)
    except GatewayError as e:
        # Embed required_categories on MUST_PICK_REQUIRED so the LLM can
        # offer choices to the user in the same response (no menu round-trip).
        raw = e.args[0] if e.args else ""
        matched = _lookup_by_pattern(raw)
        if matched and matched[0] == "MUST_PICK_REQUIRED":
            required_cats = _extract_required_categories(detail) if detail else []
            die_with_hint(
                "店铺要求必选项未点（如锅底/糖度/凑单主食）。",
                "MUST_PICK_REQUIRED",
                {"shop_id": args.shop_id},
                extra={"required_categories": required_cats} if required_cats else None,
            )
        die(friendly_error(e, {"shop_id": args.shop_id, "address_id": args.address_id}))
    output(result)


def action_order(args: argparse.Namespace, gw: GatewayClient, cache: Cache,
                 config: Config, token: str, phone: str | None) -> None:
    if not args.session_id:
        die("缺少 --session-id 参数。")
    try:
        result = gw.create_order(token, args.session_id, channel=args.channel)
        output(result)
    except GatewayError as e:
        die(friendly_error(e))


def action_order_status(args: argparse.Namespace, gw: GatewayClient, cache: Cache,
                        config: Config, token: str, phone: str | None) -> None:
    if not args.order_id:
        die("缺少 --order-id 参数。")
    result = gw.get_order_status(token, args.order_id)
    output(result)


# ── SMS bind actions（不需要 token，独立流程）─────────────────────────────────

def action_request_code(args: argparse.Namespace, gw: GatewayClient,
                        cache: Cache, config: Config) -> None:
    """SMS 流程第 1 步：发验证码到 --phone。返回 bind_id 给 LLM 记住，等用户输码。"""
    if not args.phone:
        die("缺少 --phone 参数（用户手机号，11 位数字）")
    bind_phone = normalize_phone_for_trusted_bind(args.phone)
    try:
        result = gw.request_bind(bind_phone)
    except GatewayError as e:
        die(f"发送验证码失败：{friendly_error(e)}")
    bind_id = result.get("bind_id")
    if not bind_id:
        die(f"发送成功但 gateway 未返回 bind_id：{result}")
    masked = f"{bind_phone[:3]}****{bind_phone[-4:]}" if len(bind_phone) >= 7 else "***"
    output({
        "bind_id": bind_id,
        "phone": bind_phone,
        "phone_masked": masked,
        "next_step": (
            f"已发短信到 {masked}，请告诉用户回复 6 位验证码。"
            f"用户回复后调用：verify_code --phone {bind_phone} "
            f"--bind-id {bind_id} --code <用户输的6位>"
        ),
    })


def action_verify_code(args: argparse.Namespace, gw: GatewayClient,
                       cache: Cache, config: Config) -> None:
    """SMS 流程第 2 步：验码并把 user_token 写进 cache，后续业务调用自动用上。"""
    if not args.phone:
        die("缺少 --phone 参数")
    if not args.bind_id:
        die("缺少 --bind-id 参数（来自 request_code 的返回）")
    if not args.code:
        die("缺少 --code 参数（用户输的 6 位短信验证码）")
    try:
        result = gw.verify_bind(args.bind_id, args.code)
    except GatewayError as e:
        die(f"验证失败：{friendly_error(e)}")
    user_token = result.get("user_token")
    if not user_token:
        die(f"验证通过但 gateway 未返回 user_token：{result}")
    bind_phone = normalize_phone_for_trusted_bind(args.phone)
    file_key = f"token:{bind_phone}"
    cache.set(file_key, result, TOKEN_TTL)
    redis = _try_connect_redis(config)
    if redis:
        redis_key = f"{REDIS_TOKEN_PREFIX}{bind_phone}"
        redis.setex(redis_key, TOKEN_TTL, user_token)
    output({
        "user_token": user_token,
        "expires_at": result.get("expires_at"),
        "phone": bind_phone,
        "message": "绑定成功，user_token 已缓存。后续 takeout 调用传 --phone 即可自动用此 token。",
    })


# ── Main ────────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(description="ClawDot takeout ordering")
    parser.add_argument(
        "--phone", default=None,
        help="（agent 模式）用户手机号；脚本内部 trustedBind 拿 user_token，按手机号分桶缓存。"
             "不传则退化到 personal 模式，使用 .env 里的 USER_TOKEN。",
    )
    parser.add_argument("--action", required=True,
                        choices=["search", "menu", "recommend", "addresses",
                                 "preview", "order", "order_status",
                                 "request_code", "verify_code"])
    # search / recommend / menu cross-search
    parser.add_argument(
        "--shop-keyword", "--keyword",
        dest="shop_keyword",
        default=None,
        help="搜索店铺时使用的关键词；兼容旧参数 --keyword。在 menu 上下文下用作菜品跨分类模糊搜。",
    )
    parser.add_argument("--lat", type=float, default=None)
    parser.add_argument("--lng", type=float, default=None)
    # menu
    parser.add_argument("--shop-id", default=None)
    parser.add_argument("--category", default=None)
    parser.add_argument("--item-id", default=None)
    # addresses
    parser.add_argument(
        "--address-keyword", "--search-keyword",
        dest="address_keyword",
        default=None,
        help="搜索地址时使用的关键词；兼容旧参数 --search-keyword。",
    )
    parser.add_argument(
        "--city", default=None,
        help="城市名（中文/拼音/缩写，如 北京/beijing/BJ）。传了就覆盖历史坐标走 cityId 搜索；用户首次提到城市或换城市时必传。",
    )
    parser.add_argument("--select-token", default=None,
                        help="suggestion 的 sug_ref（由 addresses search 返回的字段名 sug_ref；脚本内部 rename 回上游 token），"
                             "与 --contact-name/--contact-phone 配套使用")
    parser.add_argument("--contact-name", default=None, help="收件人姓名（select 必填）")
    parser.add_argument("--contact-phone", default=None, help="收件人手机号（select 必填）")
    parser.add_argument("--address-detail", default=None, help="门牌/楼层/室号；POI suggestion 必填")
    parser.add_argument("--address-tag", default=None, help="标签：home/work/school")
    # preview
    parser.add_argument("--address-id", type=int, default=None)
    parser.add_argument("--items", default=None, help="JSON array string")
    parser.add_argument("--note", default=None)
    # order
    parser.add_argument("--session-id", default=None)
    parser.add_argument(
        "--channel", default=None,
        help="Bot 渠道（wechat / feishu / sendblue / ...）。仅 'wechat' 时 gateway 返回桥页面 URL "
             "（拉淘宝闪购小程序付款）；其他渠道走饿了么 H5 收银台。",
    )
    # order_status
    parser.add_argument("--order-id", default=None)
    # recommend
    parser.add_argument("--top-n", default=None, help="recommend：拉菜单的店铺数，默认 3、最多 5")
    # SMS bind (request_code / verify_code)
    parser.add_argument("--bind-id", default=None,
                        help="（verify_code 必填）从 request_code 返回的 bind_id")
    parser.add_argument("--code", default=None,
                        help="（verify_code 必填）用户回复的 6 位短信验证码")

    args = parser.parse_args()
    config = load_config()

    if not config.api_key:
        die("API_KEY 必须在 .env 中配置")

    gw = GatewayClient(config)
    cache = Cache()

    # ── SMS bind 流程（不需要 user_token）─────────────────────────
    if args.action == "request_code":
        action_request_code(args, gw, cache, config)
        return
    if args.action == "verify_code":
        action_verify_code(args, gw, cache, config)
        return

    # ── 其他业务 action 必须先解析 user_token ─────────────────────
    if args.phone:
        # phone 模式：要么有 ADMIN_SECRET 走 trustedBind，要么走 SMS 流程拿 cache
        # （后者由 resolve_token 内部 die_with_hint 兜底，引导 LLM 调 request/verify_code）
        pass
    else:
        if not config.user_token:
            die("未传 --phone 时 USER_TOKEN 必须在 .env 中配置（personal 模式）；或者改用 SMS 模式：传 --phone <11 位> + 调用 request_code 让用户输码")

    redis = _try_connect_redis(config)

    try:
        token = resolve_token(args.phone, gw, cache, redis, config)
    except GatewayError as e:
        die(f"认证失败：{friendly_error(e)}")

    if not token:
        die("未能解析到 user_token，请检查 USER_TOKEN（personal 模式）或先走 SMS 流程（request_code → verify_code）")

    actions = {
        "search": action_search,
        "menu": action_menu,
        "recommend": action_recommend,
        "addresses": action_addresses,
        "preview": action_preview,
        "order": action_order,
        "order_status": action_order_status,
    }

    try:
        actions[args.action](args, gw, cache, config, token, args.phone)
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
