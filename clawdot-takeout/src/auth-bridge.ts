import { TtlCache } from "./cache.js";
import { AuthError } from "./types.js";
import type { GatewayClient } from "./gateway-client.js";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export interface AuthBridgeOptions {
  gateway: Pick<GatewayClient, "trustedBind">;
  resolvePhone: (userId: string) => Promise<string | null>;
  maxTokens?: number;
}

export class AuthBridge {
  private tokenCache: TtlCache<string>;
  private gateway: Pick<GatewayClient, "trustedBind">;
  private resolvePhoneFn: (userId: string) => Promise<string | null>;

  constructor(opts: AuthBridgeOptions) {
    this.tokenCache = new TtlCache<string>(opts.maxTokens ?? 500);
    this.gateway = opts.gateway;
    this.resolvePhoneFn = opts.resolvePhone;
  }

  async requireToken(userId: string): Promise<string> {
    const cacheKey = `token:${userId}`;
    const cached = this.tokenCache.get(cacheKey);
    if (cached) return cached;

    const phone = await this.resolvePhoneFn(userId);
    if (!phone) {
      throw new AuthError("PHONE_REQUIRED", "请先完成手机验证");
    }

    const result = await this.gateway.trustedBind(phone);
    const expiresMs = new Date(result.expires_at).getTime() - Date.now();
    const ttl = Math.min(Math.max(expiresMs, 60_000), SEVEN_DAYS_MS);
    this.tokenCache.set(cacheKey, result.user_token, ttl);
    return result.user_token;
  }
}
