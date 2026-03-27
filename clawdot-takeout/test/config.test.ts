import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseConfig } from "../src/config.js";

describe("parseConfig", () => {
  it("parses valid config with all fields", () => {
    const cfg = parseConfig({
      gatewayUrl: "http://localhost:3100",
      apiKey: "clw_abc123",
      adminSecret: "secret",
      profilesDataDir: "/tmp/profiles",
      defaultLat: 32.0,
      defaultLng: 118.7,
      timeoutMs: 15000,
    });
    assert.equal(cfg.gatewayUrl, "http://localhost:3100");
    assert.equal(cfg.apiKey, "clw_abc123");
    assert.equal(cfg.adminSecret, "secret");
    assert.equal(cfg.profilesDataDir, "/tmp/profiles");
    assert.equal(cfg.defaultLat, 32.0);
    assert.equal(cfg.defaultLng, 118.7);
    assert.equal(cfg.timeoutMs, 15000);
  });

  it("applies defaults for optional fields", () => {
    const cfg = parseConfig({
      apiKey: "clw_abc123",
      adminSecret: "secret",
    });
    assert.equal(cfg.gatewayUrl, "http://127.0.0.1:3100");
    assert.equal(cfg.timeoutMs, 30000);
    assert.equal(cfg.defaultLat, undefined);
    assert.equal(cfg.defaultLng, undefined);
    assert.equal(cfg.profilesDataDir, "");
  });

  it("resolves ${ENV} patterns in string values", () => {
    process.env.__TEST_KEY = "resolved_key";
    const cfg = parseConfig({
      apiKey: "${__TEST_KEY}",
      adminSecret: "plain",
    });
    assert.equal(cfg.apiKey, "resolved_key");
    delete process.env.__TEST_KEY;
  });

  it("clamps timeoutMs to minimum 1000", () => {
    const cfg = parseConfig({ apiKey: "k", adminSecret: "s", timeoutMs: 100 });
    assert.equal(cfg.timeoutMs, 1000);
  });

  it("strips trailing slash from gatewayUrl", () => {
    const cfg = parseConfig({ apiKey: "k", adminSecret: "s", gatewayUrl: "http://host:3100/" });
    assert.equal(cfg.gatewayUrl, "http://host:3100");
  });
});
