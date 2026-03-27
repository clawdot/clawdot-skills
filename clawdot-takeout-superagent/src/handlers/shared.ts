import type { GatewayClient } from "../gateway-client.js";
import type { AuthBridge } from "../auth-bridge.js";
import type { TakeoutConfig } from "../config.js";
import type { TtlCache } from "../cache.js";
import type { Address, TrimmedSearchResult, ShopDetailResponse } from "../types.js";

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
