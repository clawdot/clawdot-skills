import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { TtlCache } from "../src/cache.js";

describe("TtlCache", () => {
  let cache: TtlCache<string>;

  beforeEach(() => {
    cache = new TtlCache<string>(3);
  });

  it("returns undefined for missing key", () => {
    assert.equal(cache.get("nope"), undefined);
  });

  it("stores and retrieves a value", () => {
    cache.set("k1", "v1", 60_000);
    assert.equal(cache.get("k1"), "v1");
  });

  it("returns undefined for expired entry", () => {
    cache.set("k1", "v1", 1); // 1ms TTL
    const start = Date.now();
    while (Date.now() - start < 5) { /* spin */ }
    assert.equal(cache.get("k1"), undefined);
  });

  it("evicts oldest entry when maxEntries exceeded", () => {
    cache.set("a", "1", 60_000);
    cache.set("b", "2", 60_000);
    cache.set("c", "3", 60_000);
    cache.set("d", "4", 60_000);
    assert.equal(cache.get("a"), undefined);
    assert.equal(cache.get("d"), "4");
    assert.equal(cache.size, 3);
  });

  it("refreshes LRU position on get", () => {
    cache.set("a", "1", 60_000);
    cache.set("b", "2", 60_000);
    cache.set("c", "3", 60_000);
    cache.get("a");
    cache.set("d", "4", 60_000);
    assert.equal(cache.get("a"), "1");
    assert.equal(cache.get("b"), undefined);
  });

  it("delete removes entry", () => {
    cache.set("k1", "v1", 60_000);
    assert.equal(cache.delete("k1"), true);
    assert.equal(cache.get("k1"), undefined);
    assert.equal(cache.delete("k1"), false);
  });

  it("clear removes all entries", () => {
    cache.set("a", "1", 60_000);
    cache.set("b", "2", 60_000);
    cache.clear();
    assert.equal(cache.size, 0);
  });
});
