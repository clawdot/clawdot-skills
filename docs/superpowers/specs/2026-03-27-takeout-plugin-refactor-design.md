# ClawDot Takeout Plugin Refactor Design

**Date**: 2026-03-27
**Status**: Draft
**Scope**: `clawdot-takeout` OpenClaw plugin + SKILL.md

## Problem Statement

The takeout plugin has three critical architecture issues:

1. **Triple access path**: SKILL.md teaches curl-based API calls, the plugin provides a structured `takeout` tool, and settings.json configures an MCP server — all hitting the same Gateway. LLM doesn't know which to use.
2. **Missing address management**: The plugin has no way to list or create delivery addresses. `preview` requires an `address_id` the LLM cannot obtain, breaking the order flow.
3. **Silent data corruption**: When menu cache misses during preview, `sku_id` falls back to `item_id` (a different ID space), causing guaranteed order failures.

Secondary issues: `address_id` type mismatch (string vs server's int), synchronous file I/O in phone-resolver, lat/lng may arrive as strings, limited error handling, SKILL.md wastes ~4K tokens on unused API docs.

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Gateway access path | OpenClaw plugin tool only | Eval-proven (100% pass rate), structured tool > raw curl |
| Menu drill-down | Keep 3-level (overview → category → item) | Token-efficient, already validated |
| Auth flow | Keep trusted_bind via phone-resolver | Working flow, just needs async + caching |
| Refactor approach | Modular refactor (option 2) | Solves all issues without over-engineering into 7 separate tools |

## Design

### 1. File Structure

```
src/
├── index.ts              # Plugin entry — minor changes to register service
├── config.ts             # Unchanged
├── types.ts              # Extended: address search/select types, address_id → number
├── cache.ts              # Unchanged
├── trimmer.ts            # Unchanged
├── gateway-client.ts     # Extended: +searchAddresses, +selectAddress methods
├── auth-bridge.ts        # Unchanged
├── phone-resolver.ts     # Refactored: async file reads + internal result cache
├── tool.ts               # Slimmed to ~50 lines: routing only, delegates to handlers
└── handlers/
    ├── shared.ts          # Shared types (HandlerDeps, textResult helper)
    ├── search.ts          # action=search
    ├── menu.ts            # action=menu (3-level drill-down)
    ├── address.ts         # action=addresses (NEW)
    ├── preview.ts         # action=preview (with bug fixes)
    └── order.ts           # action=order + action=order_status
```

### 2. New `addresses` Action

Mirrors Gateway's `POST /addresses/search` and `POST /addresses/select`.

**Important**: The `action` enum in the tool parameter schema must be updated to include `"addresses"`:
```typescript
enum: ["search", "menu", "addresses", "preview", "order", "order_status"]
```

**Sub-operation routing** (in `handlers/address.ts`):

```typescript
export async function handleAddresses(params, deps): Promise<ToolResult> {
  const token = await deps.authBridge.requireToken(deps.userId);
  const selectSource = params.select_source as string | undefined;

  // Route 1: select_source present → save address
  if (selectSource) {
    // For "poi": poi_data required, contact_name/contact_phone required
    // For "eleme_history": eleme_address_id required, contact info optional
    return handleSelectAddress(params, token, deps);
  }

  // Route 2: keyword present → search (saved + POI + history)
  const keyword = params.keyword as string | undefined;
  if (keyword) {
    // lat/lng required when keyword is provided
    const lat = params.lat as number | undefined;
    const lng = params.lng as number | undefined;
    if (lat == null || lng == null) {
      return textResult("搜索地址时需要提供 lat 和 lng");
    }
    const result = await deps.gateway.searchAddresses(token, keyword, lat, lng);
    return textResult(JSON.stringify(result));
  }

  // Route 3: no keyword, no select → list saved addresses
  const result = await deps.gateway.searchAddresses(token);
  // Invalidate address cache so subsequent operations use fresh data
  deps.addressCache.delete(`addr:${deps.userId}`);
  // Cache the saved addresses for location fallback in other handlers
  if (result.saved?.length) {
    deps.addressCache.set(`addr:${deps.userId}`, result.saved, ADDRESS_TTL_MS);
  }
  return textResult(JSON.stringify(result));
}
```

**Parameter requirements by select_source:**

| source | Required | Optional |
|--------|----------|----------|
| `poi` | `poi_data`, `contact_name`, `contact_phone` | `address_detail`, `address_tag` |
| `eleme_history` | `eleme_address_id` | `contact_name`, `contact_phone`, `address_detail`, `address_tag` |

**Cache invalidation**: After a successful `selectAddress`, invalidate the address cache for the user (`deps.addressCache.delete(\`addr:${deps.userId}\`)`), so subsequent operations pick up the new address.

**Tool parameter additions:**
```typescript
// address search
keyword: Type.Optional(Type.String({ description: "地址搜索关键词" })),
// address select
select_source: Type.Optional(Type.Unsafe<string>({
  type: "string", enum: ["poi", "eleme_history"],
  description: "地址来源：poi 或 eleme_history"
})),
poi_data: Type.Optional(Type.Object({}, { additionalProperties: true, description: "POI 数据对象（来自 search 结果的 suggestions）" })),
contact_name: Type.Optional(Type.String({ description: "收件人姓名（poi 来源时必填）" })),
contact_phone: Type.Optional(Type.String({ description: "收件人电话（poi 来源时必填）" })),
address_detail: Type.Optional(Type.String({ description: "门牌号/楼层" })),
address_tag: Type.Optional(Type.String({ description: "标签：home/work/school" })),
eleme_address_id: Type.Optional(Type.String({ description: "饿了么历史地址ID（eleme_history 来源时必填）" })),
```

### 3. Gateway Client Extensions

```typescript
// New methods
async searchAddresses(
  userToken: string,
  keyword?: string,
  lat?: number,
  lng?: number
): Promise<SearchAddressesResponse>

async selectAddress(
  userToken: string,
  body: SelectAddressRequest
): Promise<SelectAddressResponse>
```

Request format aligns with server's `POST /addresses/search` and `POST /addresses/select`.

**New types in `types.ts`:**

```typescript
// Gateway returns saved addresses + search suggestions
export interface SearchAddressesResponse {
  saved: Array<{
    id: number;           // gateway address ID — use this for ordering
    address: string;
    detail: string;
    contact_name: string;
    contact_phone: string;
    tag: string;
    lat: number;
    lng: number;
  }>;
  suggestions?: Array<{
    source: "poi" | "eleme_history";
    name: string;
    address: string;
    lat: number;
    lng: number;
    poi_data?: Record<string, unknown>;   // pass back to selectAddress for "poi" source
    eleme_address_id?: string;            // pass back to selectAddress for "eleme_history" source
  }>;
}

export interface SelectAddressRequest {
  source: "poi" | "eleme_history";
  poi_data?: Record<string, unknown>;
  contact_name?: string;
  contact_phone?: string;
  address?: string;
  detail?: string;
  tag?: string;
  lat?: number;
  lng?: number;
  eleme_address_id?: string;
}

export interface SelectAddressResponse {
  id: number;             // gateway address ID — use this for ordering
  address: string;
  detail: string;
  lat: number;
  lng: number;
}
```

**Note**: `Address.id` type changes from `string` to `number` throughout `types.ts` to align with the gateway's integer primary key.

### 4. Bug Fixes

#### 4.1 Preview: cache miss → fetch menu

Current behavior (broken):
```
menuCache miss → sku_id = raw.item_id → order fails
```

Fixed behavior:
```
menuCache miss → gateway.getShopDetail(token, shopId, addr.lat, addr.lng)
              → populate cache → resolve sku_id correctly
```

**Important**: Use `addr.lat` and `addr.lng` from the already-resolved address object (which is available at this point in the preview handler, after the address lookup). This ensures the menu data matches the delivery zone.

#### 4.2 address_id type: string → number

- `types.ts`: `PreviewOrderRequest.address_id` changes from `string` to `number`
- Tool parameter schema: `address_id` changes to `Type.Number()`
- Aligns with server's `address_id: int` (gateway DB primary key)

#### 4.3 lat/lng runtime coercion

Coerce lat/lng at the **gateway-client response parsing layer** rather than in each handler, to avoid fragile duplication across handlers:

```typescript
// In gateway-client.ts — add a response normalizer
function normalizeAddress<T extends { lat: unknown; lng: unknown }>(addr: T): T & { lat: number; lng: number } {
  return { ...addr, lat: Number(addr.lat), lng: Number(addr.lng) };
}
```

Apply this normalizer in `listAddresses`, `searchAddresses`, and `selectAddress` response parsing. Handlers then receive guaranteed `number` typed coordinates.

Additionally, each handler that uses lat/lng should validate the values:
```typescript
if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
  return textResult("地址坐标无效");
}
```

Also fix the menu handler's `lat: 0, lng: 0` fallback — when no address or default coordinates are available, return an error instead of sending invalid coordinates to the gateway:
```typescript
if (lat == null || lng == null) {
  return textResult("无法确定位置，请先查询地址。");
}
```

#### 4.4 Extended error handling in order handler

Match both English and Chinese error patterns from the gateway (Eleme errors may come in either language):

```typescript
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

**Address handler error handling**: Add similar friendly error mapping for address operations (search returns empty, select fails due to missing POI data, etc.). Pattern: catch `GatewayError` in address handler, return Chinese friendly message.

### 5. phone-resolver Refactor

Current: synchronous `readFileSync` on every call, no caching.

Refactored:
- Use `readFile` from `node:fs/promises`
- Cache parsed identity-map and profiles with a 5-minute TTL
- Signature stays the same: `resolvePhone(dir, channel, senderId): Promise<string | null>`

### 6. SKILL.md Rewrite

**Delete**: Lines 107-199 (API reference, headers, curl examples, data structures) — ~90 lines / ~4K tokens.

**Keep & refine**: Lines 6-103 (conversational style guide, 4-step ordering flow).

**Add**: Tool action reference table:

```markdown
## Tool 速查

所有操作通过 `takeout` tool 的 `action` 参数调用：

| action | 用途 | 关键参数 |
|--------|------|----------|
| addresses | 查询/新建地址 | keyword?, lat?, lng?, select_source? |
| search | 搜索附近店铺 | keyword?, lat?, lng? |
| menu | 查看菜单 | shop_id, category?, item_id? |
| preview | 预览订单 | shop_id, address_id, items |
| order | 确认下单 | session_id |
| order_status | 查询订单 | order_id |
```

**Add**: Address management flow guidance — how to search → select → use address for ordering.

**Delete**: Credential retrieval instructions (auth is automatic via plugin).

**Target**: ~120 lines / ~5KB (from 200 lines / 8.8KB), ~40% token reduction.

### 7. Handler Interface Contract

All handlers share a common signature.

**Note**: The current code uses `ctx: { requesterSenderId?: string }` in `TakeoutToolDeps`. The refactor narrows this to just `userId: string`, extracted at the router level via `ctx.requesterSenderId ?? "anonymous"`. This is a deliberate simplification — no handler currently needs other `ctx` fields.

```typescript
// handlers/shared.ts
export interface HandlerDeps {
  gateway: GatewayClient;
  authBridge: AuthBridge;
  searchCache: TtlCache<TrimmedSearchResult>;
  menuCache: TtlCache<ShopDetailResponse>;
  addressCache: TtlCache<Address[]>;
  config: TakeoutConfig;
  userId: string;
}

export type ToolResult = {
  content: Array<{ type: "text"; text: string }>;
  details: Record<string, unknown>;
};

export function textResult(text: string): ToolResult {
  return { content: [{ type: "text", text }], details: {} };
}
```

Each handler file exports a single async function:

```typescript
// Example: handlers/search.ts
export async function handleSearch(
  params: Record<string, unknown>,
  deps: HandlerDeps,
): Promise<ToolResult> { ... }
```

`tool.ts` becomes a thin router:

```typescript
async execute(_toolCallId: string, params: Record<string, unknown>) {
  const deps: HandlerDeps = { gateway, authBridge, searchCache, menuCache, addressCache, config, userId };
  switch (params.action) {
    case "search":        return handleSearch(params, deps);
    case "menu":          return handleMenu(params, deps);
    case "addresses":     return handleAddresses(params, deps);
    case "preview":       return handlePreview(params, deps);
    case "order":         return handleOrder(params, deps);
    case "order_status":  return handleOrderStatus(params, deps);
    default:              return textResult(`未知操作: ${params.action}`);
  }
}
```

### 8. Implementation Notes

- All imports in new `handlers/*.ts` files must use `.js` extensions (e.g., `import { textResult } from "./shared.js"`), consistent with the existing codebase's ESM conventions.
- The `ToolResult` type should match whatever the OpenClaw plugin SDK expects for tool return values. Currently the codebase uses `{ content: [{ type: "text", text }], details: {} }` — verify this matches the SDK's type definition during implementation.

### 9. Cleanup

- Remove MCP server config from `.claude/settings.json` (the `clawdot-gateway` entry)
- Remove SKILL.md references to curl, Headers, and `reference_clawdot_credentials.md`

## Testing

### New Tests

| File | Coverage |
|------|----------|
| `test/handlers/address.test.ts` | search returns saved addresses, search with keyword returns suggestions, select saves address, empty results handling |
| `test/handlers/preview.test.ts` | Cache miss triggers menu fetch, sku_id correctly resolved after fetch, lat/lng string coercion |
| `test/phone-resolver.test.ts` | Async read works, cache hit skips file read, cache expires correctly |

### Updated Tests

Existing tests in `test/tool.test.ts` split to match handler structure. Import paths change but assertions stay the same — this is a refactor, not a behavior change.

### New Eval Scenarios

| ID | Prompt | Validates |
|----|--------|-----------|
| 3 | "我不在公司，送到家里" | Address switching flow |
| 4 | "来两杯拿铁一杯美式" | Multi-item ordering |
| 5 | "我的外卖到哪了" | Order status query |
| 6 | "要个新地址，送到 XXX" | New address creation |

## What Does NOT Change

- `cache.ts` — LRU+TTL cache is working correctly
- `trimmer.ts` — 3-level menu drill-down logic stays as-is
- `auth-bridge.ts` — Token caching and trusted_bind flow unchanged
- `config.ts` — Config parsing and env var resolution unchanged
- `openclaw.plugin.json` — Plugin manifest unchanged
- Test fixtures (`shop-search.json`, `shop-detail.json`, `addresses.json`) — kept, extended with address fixtures

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| Handler split breaks existing behavior | All existing tests must pass after split (same assertions, new imports) |
| New address action untested against real Gateway | Unit tests with mocked gateway; manual E2E test before release |
| SKILL.md changes degrade eval scores | Re-run existing 3 evals after rewrite to verify no regression |
| phone-resolver async change introduces race conditions | TTL cache serializes access per key; no concurrent writes to same key |
| Address cache stale after select | Explicit cache invalidation after selectAddress in address handler |
| Gateway error messages in Chinese not matched | Error handler includes both English and Chinese patterns |
| Menu handler sends lat=0,lng=0 when no location | Changed to return error instead of sending invalid coordinates |
