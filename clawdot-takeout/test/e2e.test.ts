/**
 * E2E test — runs against a live Gateway.
 *
 * Required env vars:
 *   GATEWAY_URL     — e.g. http://118.196.141.172:1024
 *   GATEWAY_API_KEY — e.g. clw_xxxx
 *   USER_TOKEN      — a valid X-User-Token
 *
 * Optional:
 *   LIVE_ORDER=1    — actually submit the order (costs money!)
 *   DEFAULT_LAT     — fallback latitude  (default: 31.2304, Shanghai)
 *   DEFAULT_LNG     — fallback longitude (default: 121.4737, Shanghai)
 *
 * Run:
 *   npm run test:e2e
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createTakeoutTool } from "../src/tool.js";
import { GatewayClient } from "../src/gateway-client.js";
import { TtlCache } from "../src/cache.js";
import type { Address, TrimmedSearchResult, ShopDetailResponse } from "../src/types.js";

const GATEWAY_URL = process.env.GATEWAY_URL;
const API_KEY = process.env.GATEWAY_API_KEY;
const USER_TOKEN = process.env.USER_TOKEN;
const LIVE_ORDER = process.env.LIVE_ORDER === "1";
const DEFAULT_LAT = Number(process.env.DEFAULT_LAT) || 31.2304;
const DEFAULT_LNG = Number(process.env.DEFAULT_LNG) || 121.4737;

function skip(reason: string) {
  console.log(`⏭  Skipping E2E: ${reason}`);
  process.exit(0);
}

if (!GATEWAY_URL || !API_KEY || !USER_TOKEN) {
  skip("Missing GATEWAY_URL, GATEWAY_API_KEY, or USER_TOKEN");
}

const gateway = new GatewayClient({
  baseUrl: GATEWAY_URL!,
  apiKey: API_KEY!,
  adminSecret: "",
  timeoutMs: 30_000,
});

// Bypass AuthBridge — use the token directly
const authBridge = { requireToken: async () => USER_TOKEN! } as any;

const tool = createTakeoutTool({
  gateway,
  authBridge,
  searchCache: new TtlCache<TrimmedSearchResult>(100),
  menuCache: new TtlCache<ShopDetailResponse>(50),
  addressCache: new TtlCache<Address[]>(100),
  config: {
    gatewayUrl: GATEWAY_URL!,
    apiKey: API_KEY!,
    adminSecret: "",
    profilesDataDir: "",
    defaultLat: DEFAULT_LAT,
    defaultLng: DEFAULT_LNG,
    timeoutMs: 30_000,
  },
  ctx: { requesterSenderId: "e2e-test" },
});

function parse(result: { content: Array<{ text: string }> }): any {
  return JSON.parse(result.content[0].text);
}

function text(result: { content: Array<{ text: string }> }): string {
  return result.content[0].text;
}

// State carried across steps
let addressId: number | undefined;
let lat: number = DEFAULT_LAT;
let lng: number = DEFAULT_LNG;
let shopId: string;
let itemId: string;
let sessionId: string;

// { concurrency: 1 } forces serial execution — each step depends on the previous
describe("E2E: full ordering flow", { concurrency: 1 }, () => {

  // ─── Step 1: addresses ───

  it("1a. list saved addresses", async () => {
    const result = await tool.execute("e2e-1a", { action: "addresses" });
    const data = parse(result);
    console.log(`  → ${data.saved?.length ?? 0} saved addresses`);
    assert.ok(data.saved, "response should have saved array");

    if (data.saved.length > 0) {
      const addr = data.saved[0];
      addressId = addr.id;
      lat = addr.lat;
      lng = addr.lng;
      assert.equal(typeof addressId, "number", "address_id should be number");
      assert.ok(Number.isFinite(lat), "lat should be finite number");
      assert.ok(Number.isFinite(lng), "lng should be finite number");
      console.log(`  → Using address #${addressId}: ${addr.address} (${lat}, ${lng})`);
    } else {
      console.log(`  → No saved addresses, using default coords (${lat}, ${lng})`);
      console.log(`  → Preview/order steps will be skipped (no address_id)`);
    }
  });

  it("1b. search addresses by keyword", async () => {
    const result = await tool.execute("e2e-1b", {
      action: "addresses", keyword: "咖啡", lat, lng,
    });
    const data = parse(result);
    console.log(`  → ${data.saved?.length ?? 0} saved, ${data.suggestions?.length ?? 0} suggestions`);
    assert.ok(data.saved !== undefined, "should have saved field");
  });

  // ─── Step 2: search shops ───

  it("2. search nearby shops", async () => {
    const result = await tool.execute("e2e-2", {
      action: "search", keyword: "咖啡", lat, lng,
    });
    const data = parse(result);
    console.log(`  → Found ${data.count} shops`);
    assert.ok(data.count > 0, "should find at least one shop");
    assert.ok(data.shops[0].id, "shop should have id");
    assert.ok(data.shops[0].name, "shop should have name");
    assert.ok(typeof data.shops[0].delivery_fee === "number", "delivery_fee should be number");

    shopId = data.shops[0].id;
    console.log(`  → Using shop: ${data.shops[0].name} (${shopId})`);
  });

  // ─── Step 3: menu drill-down ───

  it("3a. menu overview", async () => {
    const result = await tool.execute("e2e-3a", {
      action: "menu", shop_id: shopId,
    });
    const data = parse(result);
    console.log(`  → ${data.categories?.length ?? 0} categories, shop: ${data.shop_name}`);
    assert.ok(data.categories.length > 0, "should have at least one category");
    assert.ok(data.business_hours, "should have business_hours");
  });

  it("3b. category detail (index 0)", async () => {
    const result = await tool.execute("e2e-3b", {
      action: "menu", shop_id: shopId, category: "0",
    });
    const data = parse(result);
    console.log(`  → Category "${data.category}": ${data.items?.length ?? 0} items`);
    assert.ok(data.items.length > 0, "category should have items");

    // Pick first in-stock item
    const inStock = data.items.find((i: any) => i.in_stock);
    assert.ok(inStock, "should have at least one in-stock item");
    itemId = inStock.item_id;
    console.log(`  → Using item: ${inStock.name} (${itemId}) ¥${inStock.price}`);
  });

  it("3c. item detail", async () => {
    const result = await tool.execute("e2e-3c", {
      action: "menu", shop_id: shopId, item_id: itemId,
    });
    const data = parse(result);
    console.log(`  → Item: ${data.name}, sku_id: ${data.sku_id}`);
    assert.ok(data.sku_id, "item should have sku_id");
    assert.ok(data.default_ingredients !== undefined, "should have default_ingredients field");
  });

  // ─── Step 4: preview order ───

  it("4. preview order", { skip: addressId === undefined && "No saved address — cannot preview" }, async () => {
    const result = await tool.execute("e2e-4", {
      action: "preview",
      shop_id: shopId,
      address_id: addressId,
      items: [{ item_id: itemId, quantity: 1 }],
    });

    // Preview may fail if shop is closed — that's OK, check structure
    const raw = text(result);
    if (raw.includes("未营业") || raw.includes("休息") || raw.includes("closed")) {
      console.log(`  → Shop closed: ${raw}`);
      return; // pass — the error handling works
    }

    const data = parse(result);
    console.log(`  → Preview: ${data.shop_name}, total ¥${data.total}, delivery ${data.estimated_delivery_time}`);
    assert.ok(data.session_id, "should have session_id");
    assert.ok(typeof data.total === "number", "total should be number");
    assert.ok(data.total > 0, "total should be positive");
    assert.ok(data.items.length > 0, "should have items in preview");

    sessionId = data.session_id;
    console.log(`  → session_id: ${sessionId}`);
  });

  // ─── Step 5: confirm order (only with LIVE_ORDER=1) ───

  it("5. confirm order", { skip: !LIVE_ORDER && "Set LIVE_ORDER=1 to actually place an order" }, async () => {
    assert.ok(sessionId, "need session_id from preview step");

    const result = await tool.execute("e2e-5", {
      action: "order", session_id: sessionId,
    });
    const data = parse(result);
    console.log(`  → Order: ${data.order_id}, status: ${data.status}, total ¥${data.total_amount}`);
    assert.ok(data.order_id, "should have order_id");
    assert.ok(data.payment_link, "should have payment_link");
    console.log(`  → Payment: ${data.payment_link}`);

    // Check status
    const statusResult = await tool.execute("e2e-6", {
      action: "order_status", order_id: data.order_id,
    });
    const statusData = parse(statusResult);
    console.log(`  → Status: ${statusData.status}`);
    assert.ok(statusData.order_id, "status should have order_id");
  });
});
