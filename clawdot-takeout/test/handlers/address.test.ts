import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { handleAddresses } from "../../src/handlers/address.js";
import type { HandlerDeps } from "../../src/handlers/shared.js";
import { TtlCache } from "../../src/cache.js";
import { mockConfig, mockAuthBridge } from "../helpers.js";
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
    authBridge: mockAuthBridge(),
    searchCache: new TtlCache<TrimmedSearchResult>(100),
    menuCache: new TtlCache<ShopDetailResponse>(50),
    addressCache: new TtlCache<Address[]>(100),
    config: mockConfig(),
    userId: "user123",
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
    const cached = deps.addressCache.get("addr:user123");
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
    deps.addressCache.set("addr:user123", [{ id: 1, address: "old", lat: 0, lng: 0 }], 600_000);

    const result = await handleAddresses({
      select_source: "poi",
      poi_data: { id: "poi_1" },
      contact_name: "张三",
      contact_phone: "13800000000",
    }, deps);

    const parsed = JSON.parse(result.content[0].text);
    assert.equal(parsed.id, 2);
    // Cache should be invalidated
    assert.equal(deps.addressCache.get("addr:user123"), undefined);
  });

  it("returns friendly error on gateway failure", async () => {
    const deps = makeDeps({
      searchAddresses: async () => { throw new GatewayError(500, "ERR", "internal error"); },
    });
    const result = await handleAddresses({}, deps);
    assert.ok(result.content[0].text.includes("获取地址失败"));
  });
});
