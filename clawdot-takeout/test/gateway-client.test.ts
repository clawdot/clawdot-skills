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
