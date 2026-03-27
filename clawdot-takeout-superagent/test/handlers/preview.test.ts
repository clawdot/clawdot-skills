import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { handlePreview } from "../../src/handlers/preview.js";
import type { HandlerDeps } from "../../src/handlers/shared.js";
import { TtlCache } from "../../src/cache.js";
import { mockConfig, mockAuthBridge } from "../helpers.js";
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
  addressCache.set("addr:user123", addressFixture, 600_000);

  const gateway = {
    getShopDetail: async () => detailFixture,
    listAddresses: async () => ({ addresses: addressFixture }),
    previewOrder: async () => previewResponse,
    ...gatewayOverrides,
  } as any;

  return {
    gateway,
    authBridge: mockAuthBridge(),
    searchCache: new TtlCache<TrimmedSearchResult>(100),
    menuCache: new TtlCache<ShopDetailResponse>(50),
    addressCache,
    config: mockConfig(),
    userId: "user123",
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
    deps.addressCache.set("addr:user123", [{ id: 1, address: "bad", lat: NaN, lng: NaN }], 600_000);

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
