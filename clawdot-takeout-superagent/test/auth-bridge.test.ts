import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { resolvePhone, _clearCache } from "../src/phone-resolver.js";
import { AuthBridge } from "../src/auth-bridge.js";
import { AuthError } from "../src/types.js";

describe("resolvePhone", () => {
  const tmpDir = join(tmpdir(), `takeout-test-${Date.now()}`);

  beforeEach(() => {
    _clearCache();
    rmSync(tmpDir, { recursive: true, force: true });
    mkdirSync(tmpDir, { recursive: true });
  });

  it("returns phone from profile linked identities", async () => {
    writeFileSync(join(tmpDir, "identity-map.json"), JSON.stringify({
      "feishu:user123": "canon_abc",
      "mobile:13800000000": "canon_abc",
    }));
    writeFileSync(join(tmpDir, "profiles.json"), JSON.stringify({
      canon_abc: {
        canonicalId: "canon_abc",
        linkedIdentities: [
          { provider: "mobile", externalId: "13800000000" },
          { provider: "feishu", externalId: "user123" },
        ],
      },
    }));
    assert.equal(await resolvePhone(tmpDir, "feishu", "user123"), "13800000000");
  });

  it("returns null when user not in identity map", async () => {
    writeFileSync(join(tmpDir, "identity-map.json"), JSON.stringify({}));
    writeFileSync(join(tmpDir, "profiles.json"), JSON.stringify({}));
    assert.equal(await resolvePhone(tmpDir, "feishu", "unknown"), null);
  });

  it("returns null when profiles dir does not exist", async () => {
    assert.equal(await resolvePhone("/nonexistent/path", "feishu", "user123"), null);
  });

  it("returns null when profile has no mobile identity", async () => {
    writeFileSync(join(tmpDir, "identity-map.json"), JSON.stringify({
      "feishu:user123": "canon_abc",
    }));
    writeFileSync(join(tmpDir, "profiles.json"), JSON.stringify({
      canon_abc: {
        canonicalId: "canon_abc",
        linkedIdentities: [{ provider: "feishu", externalId: "user123" }],
      },
    }));
    assert.equal(await resolvePhone(tmpDir, "feishu", "user123"), null);
  });
});

describe("AuthBridge", () => {
  it("returns cached token on second call", async () => {
    let bindCalls = 0;
    const bridge = new AuthBridge({
      gateway: {
        trustedBind: async () => {
          bindCalls++;
          return { user_token: "tok_1", expires_at: new Date(Date.now() + 86400_000).toISOString(), is_new: true };
        },
      } as any,
      resolvePhone: async () => "13800000000",
    });

    const t1 = await bridge.requireToken("user1");
    const t2 = await bridge.requireToken("user1");
    assert.equal(t1, "tok_1");
    assert.equal(t2, "tok_1");
    assert.equal(bindCalls, 1);
  });

  it("throws AuthError when phone not available", async () => {
    const bridge = new AuthBridge({
      gateway: { trustedBind: async () => ({ user_token: "", expires_at: "", is_new: false }) } as any,
      resolvePhone: async () => null,
    });

    await assert.rejects(
      () => bridge.requireToken("user1"),
      (err: unknown) => err instanceof AuthError && err.code === "PHONE_REQUIRED",
    );
  });

  it("refreshes token after cache eviction", async () => {
    let callCount = 0;
    const bridge = new AuthBridge({
      gateway: {
        trustedBind: async () => {
          callCount++;
          return { user_token: `tok_${callCount}`, expires_at: new Date(Date.now() + 86400_000).toISOString(), is_new: true };
        },
      } as any,
      resolvePhone: async () => "13800000000",
      maxTokens: 1,
    });

    await bridge.requireToken("user_a");
    await bridge.requireToken("user_b");
    const t = await bridge.requireToken("user_a");
    assert.equal(t, "tok_3");
    assert.equal(callCount, 3);
  });
});
