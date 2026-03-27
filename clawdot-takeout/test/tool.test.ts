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
    assert.equal(fetches, 0);
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
