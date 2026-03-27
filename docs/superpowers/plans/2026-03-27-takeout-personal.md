# Takeout Personal Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a personal-agent version of the takeout skill that uses a direct user token instead of the superagent admin-secret authentication chain.

**Architecture:** Rename existing `clawdot-takeout/` to `clawdot-takeout-superagent/`, copy it back as `clawdot-takeout/`, then strip multi-user auth (AuthBridge, phone-resolver, admin-secret) from the copy, replacing with a single `userToken` config field. All business logic (search, menu, preview, order, address) stays identical.

**Tech Stack:** TypeScript, Node.js test runner, OpenClaw plugin SDK, TypeBox

---

## File Structure

**Renamed (no content changes):**
- `clawdot-takeout/` → `clawdot-takeout-superagent/` (entire directory, git mv)

**New directory (copy of superagent, then modified):**
- `clawdot-takeout/` — personal version with the following changes:

**Files to delete from personal copy:**
- `src/auth-bridge.ts`
- `src/phone-resolver.ts`
- `test/auth-bridge.test.ts`

**Files to modify in personal copy:**
- `src/config.ts` — remove adminSecret/profilesDataDir, add userToken
- `src/types.ts` — remove AuthError class
- `src/gateway-client.ts` — remove adminSecret, trustedBind, X-Admin-Secret header
- `src/handlers/shared.ts` — replace authBridge+userId with userToken in HandlerDeps
- `src/handlers/search.ts` — use deps.userToken, remove userId from cache keys
- `src/handlers/menu.ts` — use deps.userToken, remove userId from cache keys
- `src/handlers/address.ts` — use deps.userToken, remove userId from cache keys
- `src/handlers/preview.ts` — use deps.userToken, remove userId from cache keys
- `src/handlers/order.ts` — use deps.userToken
- `src/tool.ts` — remove authBridge/ctx from deps, add userToken
- `src/index.ts` — remove AuthBridge/resolvePhone, pass userToken
- `openclaw.plugin.json` — update config schema
- `package.json` — update test script
- `test/helpers.ts` — remove mockAuthBridge/mockToolCtx, update mockConfig
- `test/tool.test.ts` — use userToken instead of authBridge
- `test/gateway-client.test.ts` — remove trustedBind test, remove adminSecret
- `test/config.test.ts` — update assertions
- `test/handlers/address.test.ts` — use userToken instead of authBridge+userId
- `test/handlers/preview.test.ts` — use userToken instead of authBridge+userId

---

### Task 1: Rename existing directory to clawdot-takeout-superagent

**Files:**
- Rename: `clawdot-takeout/` → `clawdot-takeout-superagent/`

- [ ] **Step 1: Git mv the directory**

```bash
git mv clawdot-takeout clawdot-takeout-superagent
```

- [ ] **Step 2: Commit the rename**

```bash
git add -A
git commit -m "rename clawdot-takeout to clawdot-takeout-superagent"
```

---

### Task 2: Copy superagent as the personal version base

**Files:**
- Create: `clawdot-takeout/` (copy of clawdot-takeout-superagent)

- [ ] **Step 1: Copy the directory**

```bash
cp -r clawdot-takeout-superagent clawdot-takeout
```

- [ ] **Step 2: Install dependencies**

```bash
cd clawdot-takeout && npm install && cd ..
```

- [ ] **Step 3: Run tests to verify the copy works**

```bash
cd clawdot-takeout && npm test && cd ..
```

Expected: All tests pass (identical to superagent version).

- [ ] **Step 4: Commit**

```bash
git add clawdot-takeout
git commit -m "copy clawdot-takeout-superagent as personal version base"
```

---

### Task 3: Strip auth files and update config

**Files:**
- Delete: `clawdot-takeout/src/auth-bridge.ts`
- Delete: `clawdot-takeout/src/phone-resolver.ts`
- Delete: `clawdot-takeout/test/auth-bridge.test.ts`
- Modify: `clawdot-takeout/src/config.ts`
- Modify: `clawdot-takeout/src/types.ts`
- Modify: `clawdot-takeout/openclaw.plugin.json`

- [ ] **Step 1: Delete auth files**

```bash
rm clawdot-takeout/src/auth-bridge.ts clawdot-takeout/src/phone-resolver.ts clawdot-takeout/test/auth-bridge.test.ts
```

- [ ] **Step 2: Rewrite config.ts**

Replace `clawdot-takeout/src/config.ts` with:

```typescript
export type TakeoutConfig = {
  gatewayUrl: string;
  apiKey: string;
  userToken: string;
  defaultLat?: number;
  defaultLng?: number;
  timeoutMs: number;
};

function resolveEnvVars(value: string): string {
  return value.replace(/\$\{([^}]+)\}/g, (_, key) => process.env[key] ?? "");
}

function toNumber(val: unknown, fallback: number): number {
  const n = Number(val);
  return Number.isFinite(n) ? n : fallback;
}

export function parseConfig(raw: unknown): TakeoutConfig {
  const cfg = (raw && typeof raw === "object" && !Array.isArray(raw)
    ? raw : {}) as Record<string, unknown>;

  const gatewayUrl = resolveEnvVars(String(cfg.gatewayUrl ?? "http://127.0.0.1:3100"))
    .replace(/\/+$/, "");
  const timeoutMs = Math.max(1000, toNumber(cfg.timeoutMs, 30_000));

  return {
    gatewayUrl,
    apiKey: resolveEnvVars(String(cfg.apiKey ?? "")),
    userToken: resolveEnvVars(String(cfg.userToken ?? "")),
    defaultLat: typeof cfg.defaultLat === "number" ? cfg.defaultLat : undefined,
    defaultLng: typeof cfg.defaultLng === "number" ? cfg.defaultLng : undefined,
    timeoutMs,
  };
}

export const takeoutConfigSchema = {
  parse: parseConfig,
  uiHints: {
    gatewayUrl: { label: "Gateway URL", placeholder: "http://127.0.0.1:3100" },
    apiKey: { label: "Gateway API Key", sensitive: true, placeholder: "${XIADIAN_API_KEY}" },
    userToken: { label: "User Token", sensitive: true, placeholder: "${XIADIAN_USER_TOKEN}" },
    defaultLat: { label: "Default Latitude" },
    defaultLng: { label: "Default Longitude" },
  },
};
```

- [ ] **Step 3: Remove AuthError from types.ts**

In `clawdot-takeout/src/types.ts`, delete the `AuthError` class (lines 254-262):

```typescript
// DELETE this block:
export class AuthError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "AuthError";
  }
}
```

- [ ] **Step 4: Update openclaw.plugin.json**

Replace `clawdot-takeout/openclaw.plugin.json` with:

```json
{
  "id": "clawdot-takeout",
  "name": "Clawdot Takeout",
  "description": "Food ordering tools for 虾点 — search, menu, preview, order via Gateway + Eleme",
  "version": "0.1.0",
  "kind": "plugin",
  "configSchema": {
    "type": "object",
    "properties": {
      "gatewayUrl": { "type": "string", "default": "http://127.0.0.1:3100" },
      "apiKey": { "type": "string" },
      "userToken": { "type": "string" },
      "defaultLat": { "type": "number" },
      "defaultLng": { "type": "number" },
      "timeoutMs": { "type": "number", "default": 30000 }
    },
    "required": ["apiKey", "userToken"]
  },
  "uiHints": {
    "gatewayUrl": { "label": "Gateway URL", "placeholder": "http://127.0.0.1:3100" },
    "apiKey": { "label": "Gateway API Key", "sensitive": true, "placeholder": "${XIADIAN_API_KEY}" },
    "userToken": { "label": "User Token", "sensitive": true, "placeholder": "${XIADIAN_USER_TOKEN}" },
    "defaultLat": { "label": "Default Latitude" },
    "defaultLng": { "label": "Default Longitude" }
  }
}
```

- [ ] **Step 5: Commit**

```bash
cd clawdot-takeout && git add -A && cd ..
git commit -m "strip auth files and update config for personal version"
```

---

### Task 4: Simplify GatewayClient

**Files:**
- Modify: `clawdot-takeout/src/gateway-client.ts`

- [ ] **Step 1: Rewrite gateway-client.ts**

Replace `clawdot-takeout/src/gateway-client.ts` with:

```typescript
import {
  GatewayError,
  type SearchShopsResponse,
  type ShopDetailResponse,
  type ListAddressesResponse,
  type PreviewOrderRequest,
  type PreviewOrderResponse,
  type CreateOrderResponse,
  type OrderStatusResponse,
  type SearchAddressesResponse,
  type SelectAddressRequest,
  type SelectAddressResponse,
} from "./types.js";

function normalizeAddress<T extends { lat: unknown; lng: unknown }>(addr: T): T & { lat: number; lng: number } {
  return { ...addr, lat: Number(addr.lat), lng: Number(addr.lng) };
}

export interface GatewayClientOptions {
  baseUrl: string;
  apiKey: string;
  timeoutMs?: number;
}

export class GatewayClient {
  private baseUrl: string;
  private apiKey: string;
  private timeoutMs: number;

  constructor(opts: GatewayClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/+$/, "");
    this.apiKey = opts.apiKey;
    this.timeoutMs = opts.timeoutMs ?? 30_000;
  }

  private async request<T>(
    path: string,
    opts: { method?: string; body?: unknown; userToken?: string } = {},
  ): Promise<T> {
    const headers: Record<string, string> = {
      "Authorization": `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
    };
    if (opts.userToken) headers["X-User-Token"] = opts.userToken;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await fetch(`${this.baseUrl}${path}`, {
        method: opts.method ?? "GET",
        headers,
        body: opts.body ? JSON.stringify(opts.body) : undefined,
        signal: controller.signal,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: { code?: string; message?: string } };
        throw new GatewayError(
          res.status,
          err.error?.code ?? "UNKNOWN",
          err.error?.message ?? res.statusText,
        );
      }
      return (await res.json()) as T;
    } finally {
      clearTimeout(timer);
    }
  }

  async searchShops(userToken: string, lat: number, lng: number, keyword?: string): Promise<SearchShopsResponse> {
    const params = new URLSearchParams({ lat: String(lat), lng: String(lng) });
    if (keyword) params.set("keyword", keyword);
    return this.request(`/api/v1/shops/search?${params}`, { userToken });
  }

  async getShopDetail(userToken: string, shopId: string, lat: number, lng: number): Promise<ShopDetailResponse> {
    const params = new URLSearchParams({ lat: String(lat), lng: String(lng) });
    return this.request(`/api/v1/shops/${encodeURIComponent(shopId)}?${params}`, { userToken });
  }

  async listAddresses(userToken: string): Promise<ListAddressesResponse> {
    const raw = await this.request<ListAddressesResponse>("/api/v1/addresses", { userToken });
    return { addresses: raw.addresses.map(normalizeAddress) };
  }

  async searchAddresses(
    userToken: string,
    keyword?: string,
    lat?: number,
    lng?: number,
  ): Promise<SearchAddressesResponse> {
    const body: Record<string, unknown> = {};
    if (keyword) body.keyword = keyword;
    if (lat != null) body.lat = lat;
    if (lng != null) body.lng = lng;
    const raw = await this.request<SearchAddressesResponse>("/api/v1/addresses/search", {
      method: "POST",
      body,
      userToken,
    });
    return {
      saved: raw.saved.map(normalizeAddress),
      suggestions: raw.suggestions?.map(normalizeAddress),
    };
  }

  async selectAddress(userToken: string, body: SelectAddressRequest): Promise<SelectAddressResponse> {
    const raw = await this.request<SelectAddressResponse>("/api/v1/addresses/select", {
      method: "POST",
      body,
      userToken,
    });
    return normalizeAddress(raw);
  }

  async previewOrder(userToken: string, body: PreviewOrderRequest): Promise<PreviewOrderResponse> {
    return this.request("/api/v1/orders/preview", { method: "POST", body, userToken });
  }

  async createOrder(userToken: string, sessionId: string): Promise<CreateOrderResponse> {
    return this.request("/api/v1/orders", { method: "POST", body: { session_id: sessionId }, userToken });
  }

  async getOrderStatus(userToken: string, orderId: string): Promise<OrderStatusResponse> {
    return this.request(`/api/v1/orders/${encodeURIComponent(orderId)}`, { userToken });
  }
}
```

- [ ] **Step 2: Commit**

```bash
cd clawdot-takeout && git add -A && cd ..
git commit -m "simplify GatewayClient: remove adminSecret and trustedBind"
```

---

### Task 5: Update HandlerDeps and all handlers

**Files:**
- Modify: `clawdot-takeout/src/handlers/shared.ts`
- Modify: `clawdot-takeout/src/handlers/search.ts`
- Modify: `clawdot-takeout/src/handlers/menu.ts`
- Modify: `clawdot-takeout/src/handlers/address.ts`
- Modify: `clawdot-takeout/src/handlers/preview.ts`
- Modify: `clawdot-takeout/src/handlers/order.ts`

- [ ] **Step 1: Rewrite shared.ts**

Replace `clawdot-takeout/src/handlers/shared.ts` with:

```typescript
import type { GatewayClient } from "../gateway-client.js";
import type { TakeoutConfig } from "../config.js";
import type { TtlCache } from "../cache.js";
import type { Address, TrimmedSearchResult, ShopDetailResponse } from "../types.js";

export interface HandlerDeps {
  gateway: GatewayClient;
  userToken: string;
  searchCache: TtlCache<TrimmedSearchResult>;
  menuCache: TtlCache<ShopDetailResponse>;
  addressCache: TtlCache<Address[]>;
  config: TakeoutConfig;
}

export type ToolResult = {
  content: Array<{ type: "text"; text: string }>;
  details: Record<string, unknown>;
};

export function textResult(text: string): ToolResult {
  return { content: [{ type: "text", text }], details: {} };
}
```

- [ ] **Step 2: Update search.ts**

Replace `clawdot-takeout/src/handlers/search.ts` with:

```typescript
import type { HandlerDeps, ToolResult } from "./shared.js";
import { textResult } from "./shared.js";
import { trimSearchResults } from "../trimmer.js";

const SEARCH_TTL_MS = 5 * 60 * 1000;

export async function handleSearch(
  params: Record<string, unknown>,
  deps: HandlerDeps,
): Promise<ToolResult> {
  const lat = (params.lat as number | undefined)
    ?? deps.addressCache.get("addr")?.[0]?.lat
    ?? deps.config.defaultLat;
  const lng = (params.lng as number | undefined)
    ?? deps.addressCache.get("addr")?.[0]?.lng
    ?? deps.config.defaultLng;

  if (lat == null || lng == null) {
    return textResult("无法确定配送位置，请提供地址。");
  }

  const keyword = params.keyword as string | undefined;
  const cacheKey = `search:${lat},${lng},${keyword ?? "default"}`;
  const cached = deps.searchCache.get(cacheKey);
  if (cached) return textResult(JSON.stringify(cached));

  const raw = await deps.gateway.searchShops(deps.userToken, lat, lng, keyword);
  const trimmed = trimSearchResults(raw);
  deps.searchCache.set(cacheKey, trimmed, SEARCH_TTL_MS);
  return textResult(JSON.stringify(trimmed));
}
```

- [ ] **Step 3: Update menu.ts**

Replace `clawdot-takeout/src/handlers/menu.ts` with:

```typescript
import type { HandlerDeps, ToolResult } from "./shared.js";
import { textResult } from "./shared.js";
import type { ShopDetailResponse, MenuItem } from "../types.js";
import { buildMenuOverview, resolveCategory, buildCategoryDetail, buildItemDetail } from "../trimmer.js";

const MENU_TTL_MS = 10 * 60 * 1000;

export async function handleMenu(
  params: Record<string, unknown>,
  deps: HandlerDeps,
): Promise<ToolResult> {
  const shopId = params.shop_id as string | undefined;
  if (!shopId) return textResult("缺少 shop_id 参数。");

  const categoryQuery = params.category as string | undefined;
  const itemId = params.item_id as string | undefined;

  const lat = deps.addressCache.get("addr")?.[0]?.lat ?? deps.config.defaultLat;
  const lng = deps.addressCache.get("addr")?.[0]?.lng ?? deps.config.defaultLng;

  if (lat == null || lng == null) {
    return textResult("无法确定位置，请先查询地址。");
  }

  const cacheKey = `menu:${shopId}:${lat},${lng}`;

  let detail = deps.menuCache.get(cacheKey);
  if (!detail) {
    detail = await deps.gateway.getShopDetail(deps.userToken, shopId, lat, lng);
    deps.menuCache.set(cacheKey, detail, MENU_TTL_MS);
  }

  if (itemId) {
    const item = findItem(detail, itemId);
    if (!item) return textResult(`未找到商品 ${itemId}`);
    return textResult(JSON.stringify(buildItemDetail(item)));
  }

  if (categoryQuery) {
    const cat = resolveCategory(detail.menu, categoryQuery);
    if (!cat) return textResult(`未找到分类"${categoryQuery}"，可用分类：${detail.menu.map(c => c.category).join("、")}`);
    return textResult(JSON.stringify(buildCategoryDetail(cat)));
  }

  return textResult(JSON.stringify(buildMenuOverview(detail)));
}

function findItem(detail: ShopDetailResponse, itemId: string): MenuItem | null {
  for (const cat of detail.menu) {
    const item = cat.items.find((i) => i.item_id === itemId);
    if (item) return item;
  }
  return null;
}
```

- [ ] **Step 4: Update address.ts**

Replace `clawdot-takeout/src/handlers/address.ts` with:

```typescript
import type { HandlerDeps, ToolResult } from "./shared.js";
import { textResult } from "./shared.js";
import { GatewayError } from "../types.js";

const ADDRESS_TTL_MS = 30 * 60 * 1000;

export async function handleAddresses(
  params: Record<string, unknown>,
  deps: HandlerDeps,
): Promise<ToolResult> {
  const selectSource = params.select_source as string | undefined;

  if (selectSource) {
    return handleSelectAddress(params, deps);
  }

  const keyword = params.keyword as string | undefined;
  if (keyword) {
    const lat = params.lat as number | undefined;
    const lng = params.lng as number | undefined;
    if (lat == null || lng == null) {
      return textResult("搜索地址时需要提供 lat 和 lng");
    }
    try {
      const result = await deps.gateway.searchAddresses(deps.userToken, keyword, lat, lng);
      return textResult(JSON.stringify(result));
    } catch (err) {
      if (err instanceof GatewayError) return textResult(`地址搜索失败：${err.message}`);
      throw err;
    }
  }

  // List saved addresses
  try {
    const result = await deps.gateway.searchAddresses(deps.userToken);
    deps.addressCache.delete("addr");
    if (result.saved?.length) {
      const asAddresses = result.saved.map((s) => ({
        id: s.id,
        address: s.address,
        lat: s.lat,
        lng: s.lng,
      }));
      deps.addressCache.set("addr", asAddresses, ADDRESS_TTL_MS);
    }
    return textResult(JSON.stringify(result));
  } catch (err) {
    if (err instanceof GatewayError) return textResult(`获取地址失败：${err.message}`);
    throw err;
  }
}

async function handleSelectAddress(
  params: Record<string, unknown>,
  deps: HandlerDeps,
): Promise<ToolResult> {
  const source = params.select_source as "poi" | "eleme_history";

  try {
    const result = await deps.gateway.selectAddress(deps.userToken, {
      source,
      poi_data: params.poi_data as Record<string, unknown> | undefined,
      contact_name: params.contact_name as string | undefined,
      contact_phone: params.contact_phone as string | undefined,
      detail: params.address_detail as string | undefined,
      tag: params.address_tag as string | undefined,
      eleme_address_id: params.eleme_address_id as string | undefined,
    });

    // Invalidate address cache so subsequent operations pick up the new address
    deps.addressCache.delete("addr");

    return textResult(JSON.stringify(result));
  } catch (err) {
    if (err instanceof GatewayError) return textResult(`保存地址失败：${err.message}`);
    throw err;
  }
}
```

- [ ] **Step 5: Update preview.ts**

Replace `clawdot-takeout/src/handlers/preview.ts` with:

```typescript
import type { HandlerDeps, ToolResult } from "./shared.js";
import { textResult } from "./shared.js";
import type { Address, ShopDetailResponse, MenuItem, PreviewOrderRequest } from "../types.js";

const MENU_TTL_MS = 10 * 60 * 1000;
const ADDRESS_TTL_MS = 30 * 60 * 1000;

export async function handlePreview(
  params: Record<string, unknown>,
  deps: HandlerDeps,
): Promise<ToolResult> {
  const shopId = params.shop_id as string | undefined;
  const addressId = params.address_id as number | undefined;
  const rawItems = params.items as Array<{
    item_id: string; quantity: number;
    specs?: Array<{ name: string; value: string }>;
    attrs?: Array<{ name: string; value: string }>;
  }> | undefined;

  if (!shopId || addressId == null || !rawItems?.length) {
    return textResult("缺少必要参数：shop_id、address_id、items。");
  }

  const note = params.note as string | undefined;
  const addresses = await resolveAddresses(deps);
  const addr = addresses.find((a) => a.id === addressId);
  if (!addr) {
    return textResult(`未找到地址 ${addressId}。可用地址：${addresses.map(a => `${a.id}(${a.address})`).join("、") || "无"}`);
  }

  if (!Number.isFinite(addr.lat) || !Number.isFinite(addr.lng)) {
    return textResult("地址坐标无效");
  }

  // Resolve menu — fetch on cache miss instead of falling back to item_id as sku_id
  const cacheKey = `menu:${shopId}:${addr.lat},${addr.lng}`;
  let detail = deps.menuCache.get(cacheKey);
  if (!detail) {
    detail = await deps.gateway.getShopDetail(deps.userToken, shopId, addr.lat, addr.lng);
    deps.menuCache.set(cacheKey, detail, MENU_TTL_MS);
  }

  const completedItems = rawItems.map((raw) => {
    const menuItem = findItem(detail!, raw.item_id);
    if (!menuItem) {
      return null;
    }
    return {
      item_id: raw.item_id,
      sku_id: menuItem.sku_id,
      quantity: raw.quantity,
      specs: raw.specs,
      attrs: raw.attrs,
      ingredients: menuItem.default_ingredients?.length ? menuItem.default_ingredients : undefined,
    };
  });

  const missing = rawItems.filter((_, i) => completedItems[i] === null);
  if (missing.length) {
    return textResult(`未在菜单中找到以下商品：${missing.map(m => m.item_id).join("、")}。请确认 shop_id 和 item_id 是否正确。`);
  }

  const body: PreviewOrderRequest = {
    shop_id: shopId,
    address_id: addressId,
    items: completedItems.filter((i): i is NonNullable<typeof i> => i !== null),
    lat: addr.lat,
    lng: addr.lng,
    note,
  };

  const result = await deps.gateway.previewOrder(deps.userToken, body);
  return textResult(JSON.stringify(result));
}

async function resolveAddresses(deps: HandlerDeps): Promise<Address[]> {
  const cached = deps.addressCache.get("addr");
  if (cached) return cached;
  const resp = await deps.gateway.listAddresses(deps.userToken);
  deps.addressCache.set("addr", resp.addresses, ADDRESS_TTL_MS);
  return resp.addresses;
}

function findItem(detail: ShopDetailResponse, itemId: string): MenuItem | null {
  for (const cat of detail.menu) {
    const item = cat.items.find((i) => i.item_id === itemId);
    if (item) return item;
  }
  return null;
}
```

- [ ] **Step 6: Update order.ts**

Replace `clawdot-takeout/src/handlers/order.ts` with:

```typescript
import type { HandlerDeps, ToolResult } from "./shared.js";
import { textResult } from "./shared.js";
import { GatewayError } from "../types.js";

export async function handleOrder(
  params: Record<string, unknown>,
  deps: HandlerDeps,
): Promise<ToolResult> {
  const sessionId = params.session_id as string | undefined;
  if (!sessionId) return textResult("缺少 session_id 参数。");

  try {
    const result = await deps.gateway.createOrder(deps.userToken, sessionId);
    return textResult(JSON.stringify(result));
  } catch (err) {
    if (err instanceof GatewayError) {
      return textResult(friendlyOrderError(err));
    }
    throw err;
  }
}

export async function handleOrderStatus(
  params: Record<string, unknown>,
  deps: HandlerDeps,
): Promise<ToolResult> {
  const orderId = params.order_id as string | undefined;
  if (!orderId) return textResult("缺少 order_id 参数。");

  const result = await deps.gateway.getOrderStatus(deps.userToken, orderId);
  return textResult(JSON.stringify(result));
}

function friendlyOrderError(err: GatewayError): string {
  const msg = err.message.toLowerCase();
  if (msg.includes("expired") || msg.includes("not found") || msg.includes("过期") || msg.includes("不存在"))
    return "订单会话已过期或已使用，请重新预览下单。";
  if (msg.includes("closed") || msg.includes("not open") || msg.includes("休息") || msg.includes("未营业"))
    return "店铺暂未营业，请稍后再试。";
  if (msg.includes("out of stock") || msg.includes("sold out") || msg.includes("售罄") || msg.includes("缺货"))
    return "部分商品已售罄，请调整后重试。";
  if (msg.includes("min order") || msg.includes("minimum") || msg.includes("起送"))
    return "未达起送价，请加点别的~";
  return `下单失败：${err.message}`;
}
```

- [ ] **Step 7: Commit**

```bash
cd clawdot-takeout && git add -A && cd ..
git commit -m "update HandlerDeps and all handlers to use direct userToken"
```

---

### Task 6: Update tool.ts and index.ts

**Files:**
- Modify: `clawdot-takeout/src/tool.ts`
- Modify: `clawdot-takeout/src/index.ts`

- [ ] **Step 1: Rewrite tool.ts**

Replace `clawdot-takeout/src/tool.ts` with:

```typescript
import { Type } from "@sinclair/typebox";
import type { GatewayClient } from "./gateway-client.js";
import type { TakeoutConfig } from "./config.js";
import type { TtlCache } from "./cache.js";
import type { Address, TrimmedSearchResult, ShopDetailResponse } from "./types.js";
import type { HandlerDeps } from "./handlers/shared.js";
import { textResult } from "./handlers/shared.js";
import { handleSearch } from "./handlers/search.js";
import { handleMenu } from "./handlers/menu.js";
import { handleAddresses } from "./handlers/address.js";
import { handlePreview } from "./handlers/preview.js";
import { handleOrder, handleOrderStatus } from "./handlers/order.js";

export interface TakeoutToolDeps {
  gateway: GatewayClient;
  userToken: string;
  searchCache: TtlCache<TrimmedSearchResult>;
  menuCache: TtlCache<ShopDetailResponse>;
  addressCache: TtlCache<Address[]>;
  config: TakeoutConfig;
}

export function createTakeoutTool(deps: TakeoutToolDeps) {
  const { gateway, userToken, searchCache, menuCache, addressCache, config } = deps;

  return {
    name: "takeout",
    label: "外卖点餐",
    description:
      "外卖点餐工具。通过 action 参数选择操作：search(搜索餐厅)、menu(查看菜单)、addresses(管理地址)、preview(预览订单)、order(确认下单)、order_status(查询订单状态)。",
    parameters: Type.Object({
      action: Type.Unsafe<string>({
        type: "string",
        enum: ["search", "menu", "addresses", "preview", "order", "order_status"],
        description: "操作类型",
      }),
      // search
      keyword: Type.Optional(Type.String({ description: "搜索关键词，如'咖啡'、'轻食'" })),
      lat: Type.Optional(Type.Number({ description: "纬度" })),
      lng: Type.Optional(Type.Number({ description: "经度" })),
      // menu
      shop_id: Type.Optional(Type.String({ description: "店铺ID" })),
      category: Type.Optional(Type.String({ description: "分类名或索引编号" })),
      item_id: Type.Optional(Type.String({ description: "商品ID，查看详情" })),
      // addresses
      select_source: Type.Optional(Type.Unsafe<string>({
        type: "string",
        enum: ["poi", "eleme_history"],
        description: "地址来源：poi 或 eleme_history",
      })),
      poi_data: Type.Optional(Type.Object({}, { additionalProperties: true, description: "POI 数据对象（来自 search 结果的 suggestions）" })),
      contact_name: Type.Optional(Type.String({ description: "收件人姓名（poi 来源时必填）" })),
      contact_phone: Type.Optional(Type.String({ description: "收件人电话（poi 来源时必填）" })),
      address_detail: Type.Optional(Type.String({ description: "门牌号/楼层" })),
      address_tag: Type.Optional(Type.String({ description: "标签：home/work/school" })),
      eleme_address_id: Type.Optional(Type.String({ description: "饿了么历史地址ID（eleme_history 来源时必填）" })),
      // preview
      address_id: Type.Optional(Type.Number({ description: "配送地址ID" })),
      items: Type.Optional(Type.Array(
        Type.Object({
          item_id: Type.String({ description: "商品ID" }),
          quantity: Type.Number({ description: "数量", minimum: 1 }),
          specs: Type.Optional(Type.Array(Type.Object({ name: Type.String(), value: Type.String() }))),
          attrs: Type.Optional(Type.Array(Type.Object({ name: Type.String(), value: Type.String() }))),
        }),
        { description: "商品列表" },
      )),
      note: Type.Optional(Type.String({ description: "备注" })),
      // order
      session_id: Type.Optional(Type.String({ description: "来自 preview 的 session_id" })),
      // order_status
      order_id: Type.Optional(Type.String({ description: "订单ID" })),
    }),
    async execute(_toolCallId: string, params: Record<string, unknown>) {
      const handlerDeps: HandlerDeps = { gateway, userToken, searchCache, menuCache, addressCache, config };
      switch (params.action) {
        case "search":        return handleSearch(params, handlerDeps);
        case "menu":          return handleMenu(params, handlerDeps);
        case "addresses":     return handleAddresses(params, handlerDeps);
        case "preview":       return handlePreview(params, handlerDeps);
        case "order":         return handleOrder(params, handlerDeps);
        case "order_status":  return handleOrderStatus(params, handlerDeps);
        default:              return textResult(`未知操作: ${params.action}`);
      }
    },
  };
}
```

- [ ] **Step 2: Rewrite index.ts**

Replace `clawdot-takeout/src/index.ts` with:

```typescript
import type { OpenClawPluginApi } from "openclaw/plugin-sdk/core";
import { definePluginEntry } from "openclaw/plugin-sdk/core";

import { parseConfig, takeoutConfigSchema } from "./config.js";
import { TtlCache } from "./cache.js";
import { GatewayClient } from "./gateway-client.js";
import { createTakeoutTool } from "./tool.js";
import type { ShopDetailResponse, Address, TrimmedSearchResult } from "./types.js";

function register(api: OpenClawPluginApi) {
  const config = parseConfig(api.pluginConfig);

  if (!config.apiKey) {
    api.logger.warn("clawdot-takeout: apiKey not configured — tools will fail");
  }
  if (!config.userToken) {
    api.logger.warn("clawdot-takeout: userToken not configured — tools will fail");
  }

  const gateway = new GatewayClient({
    baseUrl: config.gatewayUrl,
    apiKey: config.apiKey,
    timeoutMs: config.timeoutMs,
  });

  const searchCache = new TtlCache<TrimmedSearchResult>(100);
  const menuCache = new TtlCache<ShopDetailResponse>(50);
  const addressCache = new TtlCache<Address[]>(500);

  api.registerTool(
    () => [
      createTakeoutTool({ gateway, userToken: config.userToken, searchCache, menuCache, addressCache, config }),
    ],
    { names: ["takeout"] },
  );

  api.registerService({
    id: "clawdot-takeout",
    start: async () => {
      api.logger.info(`clawdot-takeout: started (gateway=${config.gatewayUrl})`);
    },
    stop: () => {
      searchCache.clear();
      menuCache.clear();
      addressCache.clear();
      api.logger.info("clawdot-takeout: stopped, caches cleared");
    },
  });

  api.logger.info("clawdot-takeout: registered takeout tool");
}

export default definePluginEntry({
  id: "clawdot-takeout",
  name: "Clawdot Takeout",
  description: "Food ordering tool for 虾点 — search, menu, preview, order",
  configSchema: takeoutConfigSchema,
  register,
});
```

- [ ] **Step 3: Commit**

```bash
cd clawdot-takeout && git add -A && cd ..
git commit -m "update tool.ts and index.ts for direct userToken"
```

---

### Task 7: Update all test files

**Files:**
- Modify: `clawdot-takeout/test/helpers.ts`
- Modify: `clawdot-takeout/test/config.test.ts`
- Modify: `clawdot-takeout/test/gateway-client.test.ts`
- Modify: `clawdot-takeout/test/tool.test.ts`
- Modify: `clawdot-takeout/test/handlers/address.test.ts`
- Modify: `clawdot-takeout/test/handlers/preview.test.ts`
- Modify: `clawdot-takeout/package.json`

- [ ] **Step 1: Rewrite test/helpers.ts**

Replace `clawdot-takeout/test/helpers.ts` with:

```typescript
import type { GatewayClient } from "../src/gateway-client.js";
import type { TakeoutConfig } from "../src/config.js";
import { TtlCache } from "../src/cache.js";
import type { SearchShopsResponse, ShopDetailResponse, ListAddressesResponse, SearchAddressesResponse, SelectAddressResponse, Address } from "../src/types.js";

export function mockConfig(overrides: Partial<TakeoutConfig> = {}): TakeoutConfig {
  return {
    gatewayUrl: "http://localhost:3100",
    apiKey: "clw_test",
    userToken: "tok_user",
    defaultLat: 32.0356,
    defaultLng: 118.7621,
    timeoutMs: 5000,
    ...overrides,
  };
}

type MockGatewayOverrides = {
  searchShops?: (userToken: string, lat: number, lng: number, keyword?: string) => Promise<SearchShopsResponse>;
  getShopDetail?: (userToken: string, shopId: string, lat: number, lng: number) => Promise<ShopDetailResponse>;
  listAddresses?: (userToken: string) => Promise<ListAddressesResponse>;
  searchAddresses?: (...args: any[]) => Promise<SearchAddressesResponse>;
  selectAddress?: (...args: any[]) => Promise<SelectAddressResponse>;
};

export function mockGateway(overrides: MockGatewayOverrides = {}): GatewayClient {
  return {
    searchShops: overrides.searchShops ?? (async () => ({ shops: [] })),
    getShopDetail: overrides.getShopDetail ?? (async () => ({ shop: { id: "", name: "", address: "", business_hours: "" }, menu: [] })),
    listAddresses: overrides.listAddresses ?? (async () => ({ addresses: [] })),
    searchAddresses: overrides.searchAddresses ?? (async () => ({ saved: [] })),
    selectAddress: overrides.selectAddress ?? (async () => ({ id: 1, address: "", detail: "", lat: 0, lng: 0 })),
    previewOrder: async () => ({ session_id: "s1", shop_name: "", items: [], packing_fee: 0, delivery_fee: 0, discount: 0, total: 0, estimated_delivery_time: "" }),
    createOrder: async () => ({ order_id: "o1", status: "created", shop_name: "", total_amount: 0 }),
    getOrderStatus: async () => ({ order_id: "o1", status: "created", shop_name: "", total_amount: 0, created_at: null }),
  } as any;
}
```

- [ ] **Step 2: Rewrite test/config.test.ts**

Replace `clawdot-takeout/test/config.test.ts` with:

```typescript
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseConfig } from "../src/config.js";

describe("parseConfig", () => {
  it("parses valid config with all fields", () => {
    const cfg = parseConfig({
      gatewayUrl: "http://localhost:3100",
      apiKey: "clw_abc123",
      userToken: "tok_user",
      defaultLat: 32.0,
      defaultLng: 118.7,
      timeoutMs: 15000,
    });
    assert.equal(cfg.gatewayUrl, "http://localhost:3100");
    assert.equal(cfg.apiKey, "clw_abc123");
    assert.equal(cfg.userToken, "tok_user");
    assert.equal(cfg.defaultLat, 32.0);
    assert.equal(cfg.defaultLng, 118.7);
    assert.equal(cfg.timeoutMs, 15000);
  });

  it("applies defaults for optional fields", () => {
    const cfg = parseConfig({
      apiKey: "clw_abc123",
      userToken: "tok",
    });
    assert.equal(cfg.gatewayUrl, "http://127.0.0.1:3100");
    assert.equal(cfg.timeoutMs, 30000);
    assert.equal(cfg.defaultLat, undefined);
    assert.equal(cfg.defaultLng, undefined);
  });

  it("resolves ${ENV} patterns in string values", () => {
    process.env.__TEST_KEY = "resolved_key";
    const cfg = parseConfig({
      apiKey: "${__TEST_KEY}",
      userToken: "tok",
    });
    assert.equal(cfg.apiKey, "resolved_key");
    delete process.env.__TEST_KEY;
  });

  it("clamps timeoutMs to minimum 1000", () => {
    const cfg = parseConfig({ apiKey: "k", userToken: "t", timeoutMs: 100 });
    assert.equal(cfg.timeoutMs, 1000);
  });

  it("strips trailing slash from gatewayUrl", () => {
    const cfg = parseConfig({ apiKey: "k", userToken: "t", gatewayUrl: "http://host:3100/" });
    assert.equal(cfg.gatewayUrl, "http://host:3100");
  });
});
```

- [ ] **Step 3: Rewrite test/gateway-client.test.ts**

Replace `clawdot-takeout/test/gateway-client.test.ts` with:

```typescript
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { GatewayClient } from "../src/gateway-client.js";
import { GatewayError } from "../src/types.js";

const originalFetch = globalThis.fetch;
let lastFetchArgs: { url: string; init: RequestInit } | null = null;

function mockFetch(responseBody: unknown, status = 200) {
  lastFetchArgs = null;
  globalThis.fetch = async (input: string | URL | Request, init?: RequestInit) => {
    lastFetchArgs = { url: String(input), init: init ?? {} };
    return new Response(JSON.stringify(responseBody), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  };
}

describe("GatewayClient", () => {
  let client: GatewayClient;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  beforeEach(() => {
    client = new GatewayClient({
      baseUrl: "http://localhost:3100",
      apiKey: "clw_test123",
      timeoutMs: 5000,
    });
  });

  it("searchShops sends correct GET with headers", async () => {
    mockFetch({ shops: [] });
    await client.searchShops("tok_user", 32.0, 118.7, "咖啡");
    assert.ok(lastFetchArgs);
    assert.ok(lastFetchArgs.url.includes("/api/v1/shops/search?"));
    assert.ok(lastFetchArgs.url.includes("lat=32"));
    assert.ok(lastFetchArgs.url.includes("lng=118.7"));
    assert.ok(lastFetchArgs.url.includes("keyword="));
    const headers = lastFetchArgs.init.headers as Record<string, string>;
    assert.equal(headers["Authorization"], "Bearer clw_test123");
    assert.equal(headers["X-User-Token"], "tok_user");
  });

  it("does not send X-Admin-Secret header", async () => {
    mockFetch({ shops: [] });
    await client.searchShops("tok_user", 32.0, 118.7);
    const headers = lastFetchArgs!.init.headers as Record<string, string>;
    assert.equal(headers["X-Admin-Secret"], undefined);
  });

  it("getShopDetail sends correct GET", async () => {
    mockFetch({ shop: {}, menu: [] });
    await client.getShopDetail("tok_user", "E12345", 32.0, 118.7);
    assert.ok(lastFetchArgs);
    assert.ok(lastFetchArgs.url.includes("/api/v1/shops/E12345?"));
  });

  it("previewOrder sends POST with body", async () => {
    mockFetch({ session_id: "s1", total: 28 });
    await client.previewOrder("tok_user", {
      shop_id: "E12345", address_id: "addr_1",
      items: [{ item_id: "1", sku_id: "2", quantity: 1 }],
      lat: 32.0, lng: 118.7,
    });
    assert.ok(lastFetchArgs);
    assert.equal(lastFetchArgs.init.method, "POST");
    const body = JSON.parse(lastFetchArgs.init.body as string);
    assert.equal(body.shop_id, "E12345");
  });

  it("throws GatewayError on non-ok response", async () => {
    mockFetch({ error: { code: "AUTH_INVALID", message: "bad key" } }, 401);
    await assert.rejects(
      () => client.searchShops("tok", 32, 118),
      (err: unknown) => err instanceof GatewayError && err.status === 401 && err.code === "AUTH_INVALID",
    );
  });
});
```

- [ ] **Step 4: Rewrite test/tool.test.ts**

Replace `clawdot-takeout/test/tool.test.ts` with:

```typescript
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createTakeoutTool } from "../src/tool.js";
import { TtlCache } from "../src/cache.js";
import { mockConfig } from "./helpers.js";
import type { SearchShopsResponse, ShopDetailResponse, Address, PreviewOrderResponse } from "../src/types.js";
import { GatewayError } from "../src/types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const searchFixture: SearchShopsResponse = JSON.parse(
  readFileSync(join(__dirname, "fixtures/shop-search.json"), "utf-8"),
);
const detailFixture: ShopDetailResponse = JSON.parse(
  readFileSync(join(__dirname, "fixtures/shop-detail.json"), "utf-8"),
);
const addressFixture: Address[] = JSON.parse(
  readFileSync(join(__dirname, "fixtures/addresses.json"), "utf-8"),
).addresses;

const previewResponse: PreviewOrderResponse = {
  session_id: "sess_abc",
  shop_name: "瑞幸咖啡(新街口店)",
  items: [{ name: "生椰拿铁(大杯/冰)", price: 29.0, quantity: 1 }],
  packing_fee: 1.0, delivery_fee: 3.0, discount: 5.0, total: 28.0,
  estimated_delivery_time: "25分钟",
};

function makeTool(gatewayOverrides: Record<string, any> = {}) {
  const searchCache = new TtlCache<any>(100);
  const menuCache = new TtlCache<ShopDetailResponse>(50);
  const addressCache = new TtlCache<Address[]>(100);
  menuCache.set("menu:E12345:32.0356,118.7621", detailFixture, 600_000);
  addressCache.set("addr", addressFixture, 600_000);

  const gateway = {
    searchShops: async () => searchFixture,
    getShopDetail: async () => detailFixture,
    listAddresses: async () => ({ addresses: addressFixture }),
    searchAddresses: async () => ({ saved: addressFixture.map((a: any) => ({ ...a, detail: "", contact_name: "", contact_phone: "", tag: "" })) }),
    selectAddress: async () => ({ id: 1, address: "", detail: "", lat: 0, lng: 0 }),
    previewOrder: async () => previewResponse,
    createOrder: async () => ({ order_id: "ord_123", status: "created", shop_name: "瑞幸", total_amount: 28 }),
    getOrderStatus: async () => ({ order_id: "ord_123", status: "created", shop_name: "瑞幸", total_amount: 28, created_at: "2026-03-27T12:00:00" }),
    ...gatewayOverrides,
  } as any;

  return createTakeoutTool({
    gateway,
    userToken: "tok_user",
    searchCache, menuCache, addressCache,
    config: mockConfig(),
  });
}

// ─── search ───

describe("takeout action=search", () => {
  it("returns trimmed search results with highlights", async () => {
    const tool = makeTool();
    const result = await tool.execute("c1", { action: "search" });
    const parsed = JSON.parse(result.content[0].text);
    assert.equal(parsed.count, 2);
    assert.equal(parsed.shops[0].name, "瑞幸咖啡(新街口店)");
    assert.deepEqual(parsed.shops[0].highlights, ["生椰拿铁", "美式咖啡"]);
    assert.ok(!("image" in parsed.shops[0]));
  });

  it("passes keyword to gateway", async () => {
    let capturedKeyword: string | undefined;
    const tool = makeTool({
      searchShops: async (_t: any, _la: any, _ln: any, kw: any) => { capturedKeyword = kw; return searchFixture; },
    });
    await tool.execute("c1", { action: "search", keyword: "咖啡" });
    assert.equal(capturedKeyword, "咖啡");
  });

  it("uses cached results on second call", async () => {
    let calls = 0;
    const tool = makeTool({ searchShops: async () => { calls++; return searchFixture; } });
    await tool.execute("c1", { action: "search" });
    await tool.execute("c2", { action: "search" });
    assert.equal(calls, 1);
  });

  it("uses address cache for location fallback", async () => {
    let capturedLat: number | undefined;
    const searchCache = new TtlCache<any>(100);
    const menuCache = new TtlCache<ShopDetailResponse>(50);
    const addressCache = new TtlCache<Address[]>(100);
    addressCache.set("addr", [{ id: 1, address: "test", lat: 31.5, lng: 117.2 }], 600_000);

    const tool = createTakeoutTool({
      gateway: {
        searchShops: async (_t: any, lat: any) => { capturedLat = lat; return searchFixture; },
      } as any,
      userToken: "tok_user",
      searchCache, menuCache, addressCache,
      config: mockConfig({ defaultLat: undefined, defaultLng: undefined }),
    });
    await tool.execute("c1", { action: "search" });
    assert.equal(capturedLat, 31.5);
  });

  it("returns error when no location available", async () => {
    const tool = createTakeoutTool({
      gateway: { searchShops: async () => searchFixture } as any,
      userToken: "tok_user",
      searchCache: new TtlCache(100), menuCache: new TtlCache(50), addressCache: new TtlCache(100),
      config: mockConfig({ defaultLat: undefined, defaultLng: undefined }),
    });
    const result = await tool.execute("c1", { action: "search" });
    assert.ok(result.content[0].text.includes("无法确定配送位置"));
  });
});

// ─── menu ───

describe("takeout action=menu", () => {
  it("Level 1: returns overview", async () => {
    const tool = makeTool();
    const result = await tool.execute("c1", { action: "menu", shop_id: "E12345" });
    const parsed = JSON.parse(result.content[0].text);
    assert.equal(parsed.shop_name, "瑞幸咖啡(新街口店)");
    assert.equal(parsed.categories.length, 2);
  });

  it("Level 2: returns category detail", async () => {
    const tool = makeTool();
    const result = await tool.execute("c1", { action: "menu", shop_id: "E12345", category: "经典咖啡" });
    const parsed = JSON.parse(result.content[0].text);
    assert.equal(parsed.category, "经典咖啡");
    assert.equal(parsed.items[0].has_specs, true);
  });

  it("Level 2: resolves by index", async () => {
    const tool = makeTool();
    const result = await tool.execute("c1", { action: "menu", shop_id: "E12345", category: "1" });
    const parsed = JSON.parse(result.content[0].text);
    assert.equal(parsed.category, "轻食");
  });

  it("Level 3: returns item detail", async () => {
    const tool = makeTool();
    const result = await tool.execute("c1", { action: "menu", shop_id: "E12345", item_id: "670685166551" });
    const parsed = JSON.parse(result.content[0].text);
    assert.equal(parsed.sku_id, "5014584502270");
    assert.ok(parsed.ingredients_summary.includes("浓缩"));
  });

  it("returns error for missing shop_id", async () => {
    const tool = makeTool();
    const result = await tool.execute("c1", { action: "menu" });
    assert.ok(result.content[0].text.includes("shop_id"));
  });

  it("caches menu across calls", async () => {
    let fetches = 0;
    const tool = makeTool({ getShopDetail: async () => { fetches++; return detailFixture; } });
    await tool.execute("c1", { action: "menu", shop_id: "E12345" });
    await tool.execute("c2", { action: "menu", shop_id: "E12345", category: "经典咖啡" });
    assert.equal(fetches, 0); // served from pre-populated cache
  });
});

// ─── preview ───

describe("takeout action=preview", () => {
  it("completes sku_id and default_ingredients", async () => {
    let capturedBody: any;
    const tool = makeTool({
      previewOrder: async (_t: any, body: any) => { capturedBody = body; return previewResponse; },
    });
    await tool.execute("c1", {
      action: "preview", shop_id: "E12345", address_id: 1,
      items: [{ item_id: "670685166551", quantity: 1 }],
    });
    assert.equal(capturedBody.items[0].sku_id, "5014584502270");
    assert.equal(capturedBody.items[0].ingredients.length, 2);
    assert.equal(capturedBody.lat, 32.0356);
  });

  it("preserves user specs/attrs", async () => {
    let capturedBody: any;
    const tool = makeTool({
      previewOrder: async (_t: any, body: any) => { capturedBody = body; return previewResponse; },
    });
    await tool.execute("c1", {
      action: "preview", shop_id: "E12345", address_id: 1,
      items: [{ item_id: "670685166551", quantity: 2, specs: [{ name: "规格", value: "大杯" }] }],
    });
    assert.equal(capturedBody.items[0].quantity, 2);
    assert.deepEqual(capturedBody.items[0].specs, [{ name: "规格", value: "大杯" }]);
  });

  it("returns error for missing params", async () => {
    const tool = makeTool();
    const result = await tool.execute("c1", { action: "preview" });
    assert.ok(result.content[0].text.includes("缺少"));
  });
});

// ─── order ───

describe("takeout action=order", () => {
  it("passes session_id and returns result", async () => {
    let capturedSid: string | undefined;
    const tool = makeTool({
      createOrder: async (_t: any, sid: any) => {
        capturedSid = sid;
        return { order_id: "ord_123", status: "created", shop_name: "瑞幸", total_amount: 28, payment_link: "https://h5.ele.me/pay" };
      },
    });
    const result = await tool.execute("c1", { action: "order", session_id: "sess_abc" });
    assert.equal(capturedSid, "sess_abc");
    const parsed = JSON.parse(result.content[0].text);
    assert.equal(parsed.order_id, "ord_123");
  });

  it("returns friendly error on session expiry", async () => {
    const tool = makeTool({
      createOrder: async () => { throw new GatewayError(500, "ORDER_FAILED", "session expired"); },
    });
    const result = await tool.execute("c1", { action: "order", session_id: "expired" });
    assert.ok(result.content[0].text.includes("过期") || result.content[0].text.includes("重新预览"));
  });
});

// ─── order_status ───

describe("takeout action=order_status", () => {
  it("returns order status", async () => {
    const tool = makeTool();
    const result = await tool.execute("c1", { action: "order_status", order_id: "ord_123" });
    const parsed = JSON.parse(result.content[0].text);
    assert.equal(parsed.order_id, "ord_123");
    assert.equal(parsed.status, "created");
  });
});
```

- [ ] **Step 5: Rewrite test/handlers/address.test.ts**

Replace `clawdot-takeout/test/handlers/address.test.ts` with:

```typescript
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { handleAddresses } from "../../src/handlers/address.js";
import type { HandlerDeps } from "../../src/handlers/shared.js";
import { TtlCache } from "../../src/cache.js";
import { mockConfig } from "../helpers.js";
import type { Address, ShopDetailResponse, TrimmedSearchResult, SearchAddressesResponse, SelectAddressResponse } from "../../src/types.js";
import { GatewayError } from "../../src/types.js";

function makeDeps(gatewayOverrides: Record<string, any> = {}): HandlerDeps {
  const gateway = {
    searchAddresses: async () => ({
      saved: [
        { id: 1, address: "南京市新街口", detail: "1号楼", contact_name: "张三", contact_phone: "138", tag: "work", lat: 32.0, lng: 118.7 },
      ],
    } as SearchAddressesResponse),
    selectAddress: async () => ({
      id: 2, address: "南京市鼓楼", detail: "3楼", lat: 32.1, lng: 118.8,
    } as SelectAddressResponse),
    ...gatewayOverrides,
  } as any;

  return {
    gateway,
    userToken: "tok_user",
    searchCache: new TtlCache<TrimmedSearchResult>(100),
    menuCache: new TtlCache<ShopDetailResponse>(50),
    addressCache: new TtlCache<Address[]>(100),
    config: mockConfig(),
  };
}

describe("handleAddresses", () => {
  it("lists saved addresses when no params", async () => {
    const deps = makeDeps();
    const result = await handleAddresses({}, deps);
    const parsed = JSON.parse(result.content[0].text);
    assert.equal(parsed.saved.length, 1);
    assert.equal(parsed.saved[0].address, "南京市新街口");
  });

  it("caches addresses after listing", async () => {
    const deps = makeDeps();
    await handleAddresses({}, deps);
    const cached = deps.addressCache.get("addr");
    assert.ok(cached);
    assert.equal(cached!.length, 1);
    assert.equal(cached![0].id, 1);
  });

  it("searches with keyword and lat/lng", async () => {
    let capturedArgs: any;
    const deps = makeDeps({
      searchAddresses: async (_t: any, kw: any, lat: any, lng: any) => {
        capturedArgs = { kw, lat, lng };
        return { saved: [], suggestions: [{ source: "poi", name: "测试", address: "test", lat: 32.0, lng: 118.0 }] };
      },
    });
    const result = await handleAddresses({ keyword: "新街口", lat: 32.0, lng: 118.7 }, deps);
    assert.equal(capturedArgs.kw, "新街口");
    const parsed = JSON.parse(result.content[0].text);
    assert.equal(parsed.suggestions.length, 1);
  });

  it("returns error when keyword provided without lat/lng", async () => {
    const deps = makeDeps();
    const result = await handleAddresses({ keyword: "新街口" }, deps);
    assert.ok(result.content[0].text.includes("lat"));
  });

  it("selects address and invalidates cache", async () => {
    const deps = makeDeps();
    deps.addressCache.set("addr", [{ id: 1, address: "old", lat: 0, lng: 0 }], 600_000);

    const result = await handleAddresses({
      select_source: "poi",
      poi_data: { id: "poi_1" },
      contact_name: "张三",
      contact_phone: "13800000000",
    }, deps);

    const parsed = JSON.parse(result.content[0].text);
    assert.equal(parsed.id, 2);
    // Cache should be invalidated
    assert.equal(deps.addressCache.get("addr"), undefined);
  });

  it("returns friendly error on gateway failure", async () => {
    const deps = makeDeps({
      searchAddresses: async () => { throw new GatewayError(500, "ERR", "internal error"); },
    });
    const result = await handleAddresses({}, deps);
    assert.ok(result.content[0].text.includes("获取地址失败"));
  });
});
```

- [ ] **Step 6: Rewrite test/handlers/preview.test.ts**

Replace `clawdot-takeout/test/handlers/preview.test.ts` with:

```typescript
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { handlePreview } from "../../src/handlers/preview.js";
import type { HandlerDeps } from "../../src/handlers/shared.js";
import { TtlCache } from "../../src/cache.js";
import { mockConfig } from "../helpers.js";
import type { Address, ShopDetailResponse, TrimmedSearchResult, PreviewOrderResponse } from "../../src/types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const detailFixture: ShopDetailResponse = JSON.parse(
  readFileSync(join(__dirname, "../fixtures/shop-detail.json"), "utf-8"),
);
const addressFixture: Address[] = JSON.parse(
  readFileSync(join(__dirname, "../fixtures/addresses.json"), "utf-8"),
).addresses;

const previewResponse: PreviewOrderResponse = {
  session_id: "sess_abc",
  shop_name: "瑞幸咖啡(新街口店)",
  items: [{ name: "生椰拿铁(大杯/冰)", price: 29.0, quantity: 1 }],
  packing_fee: 1.0, delivery_fee: 3.0, discount: 5.0, total: 28.0,
  estimated_delivery_time: "25分钟",
};

function makeDeps(gatewayOverrides: Record<string, any> = {}): HandlerDeps {
  const addressCache = new TtlCache<Address[]>(100);
  addressCache.set("addr", addressFixture, 600_000);

  const gateway = {
    getShopDetail: async () => detailFixture,
    listAddresses: async () => ({ addresses: addressFixture }),
    previewOrder: async () => previewResponse,
    ...gatewayOverrides,
  } as any;

  return {
    gateway,
    userToken: "tok_user",
    searchCache: new TtlCache<TrimmedSearchResult>(100),
    menuCache: new TtlCache<ShopDetailResponse>(50),
    addressCache,
    config: mockConfig(),
  };
}

describe("handlePreview", () => {
  it("fetches menu on cache miss and resolves sku_id correctly", async () => {
    let fetchCalled = false;
    let capturedBody: any;
    const deps = makeDeps({
      getShopDetail: async () => { fetchCalled = true; return detailFixture; },
      previewOrder: async (_t: any, body: any) => { capturedBody = body; return previewResponse; },
    });
    // No menu in cache — should trigger fetch
    const result = await handlePreview({
      action: "preview", shop_id: "E12345", address_id: 1,
      items: [{ item_id: "670685166551", quantity: 1 }],
    }, deps);

    assert.ok(fetchCalled, "should have fetched menu on cache miss");
    assert.equal(capturedBody.items[0].sku_id, "5014584502270");
    assert.ok(capturedBody.items[0].ingredients.length > 0);
  });

  it("returns error for item not found in menu", async () => {
    const deps = makeDeps();
    const result = await handlePreview({
      action: "preview", shop_id: "E12345", address_id: 1,
      items: [{ item_id: "nonexistent_item", quantity: 1 }],
    }, deps);
    assert.ok(result.content[0].text.includes("未在菜单中找到"));
  });

  it("validates lat/lng are finite", async () => {
    const deps = makeDeps();
    deps.addressCache.set("addr", [{ id: 1, address: "bad", lat: NaN, lng: NaN }], 600_000);

    const result = await handlePreview({
      action: "preview", shop_id: "E12345", address_id: 1,
      items: [{ item_id: "670685166551", quantity: 1 }],
    }, deps);
    assert.ok(result.content[0].text.includes("坐标无效"));
  });

  it("populates menu cache after fetch", async () => {
    const deps = makeDeps();
    await handlePreview({
      action: "preview", shop_id: "E12345", address_id: 1,
      items: [{ item_id: "670685166551", quantity: 1 }],
    }, deps);
    // Should be cached now
    const cached = deps.menuCache.get("menu:E12345:32.0356,118.7621");
    assert.ok(cached, "menu should be cached after fetch");
  });
});
```

- [ ] **Step 7: Update package.json test script**

In `clawdot-takeout/package.json`, change the `test` script from:

```json
"test": "npx tsx --test test/auth-bridge.test.ts test/cache.test.ts test/config.test.ts test/gateway-client.test.ts test/tool.test.ts test/trimmer.test.ts test/handlers/*.test.ts"
```

to:

```json
"test": "npx tsx --test test/cache.test.ts test/config.test.ts test/gateway-client.test.ts test/tool.test.ts test/trimmer.test.ts test/handlers/*.test.ts"
```

- [ ] **Step 8: Run tests**

```bash
cd clawdot-takeout && npm test
```

Expected: All tests pass.

- [ ] **Step 9: Commit**

```bash
cd clawdot-takeout && git add -A && cd ..
git commit -m "update all tests for personal version with direct userToken"
```

---

### Task 8: Final verification and cleanup

- [ ] **Step 1: Verify superagent version still works**

```bash
cd clawdot-takeout-superagent && npm test && cd ..
```

Expected: All tests pass (unchanged).

- [ ] **Step 2: Verify personal version tests pass**

```bash
cd clawdot-takeout && npm test && cd ..
```

Expected: All tests pass.

- [ ] **Step 3: Verify no leftover auth imports in personal version**

```bash
grep -r "auth-bridge\|phone-resolver\|AuthBridge\|AuthError\|resolvePhone\|adminSecret\|trustedBind\|requesterSenderId" clawdot-takeout/src/ clawdot-takeout/test/
```

Expected: No output (no leftover references).

- [ ] **Step 4: Commit any final cleanup if needed**

If step 3 found anything, fix and commit. Otherwise skip.
