import type { OpenClawPluginApi } from "openclaw/plugin-sdk/core";
import { definePluginEntry } from "openclaw/plugin-sdk/core";

import { parseConfig, takeoutConfigSchema } from "./config.js";
import { TtlCache } from "./cache.js";
import { GatewayClient } from "./gateway-client.js";
import { createTakeoutTool } from "./tool.js";
import type { ShopDetailResponse, Address, TrimmedSearchResult } from "./types.js";

function register(api: OpenClawPluginApi) {
  const config = parseConfig(api.pluginConfig);

  if (!config.apiKey) {
    api.logger.warn("clawdot-takeout: apiKey not configured — tools will fail");
  }
  if (!config.userToken) {
    api.logger.warn("clawdot-takeout: userToken not configured — tools will fail");
  }

  const gateway = new GatewayClient({
    baseUrl: config.gatewayUrl,
    apiKey: config.apiKey,
    timeoutMs: config.timeoutMs,
  });

  const searchCache = new TtlCache<TrimmedSearchResult>(100);
  const menuCache = new TtlCache<ShopDetailResponse>(50);
  const addressCache = new TtlCache<Address[]>(500);

  api.registerTool(
    () => [
      createTakeoutTool({ gateway, userToken: config.userToken, searchCache, menuCache, addressCache, config }),
    ],
    { names: ["takeout"] },
  );

  api.registerService({
    id: "clawdot-takeout",
    start: async () => {
      api.logger.info(`clawdot-takeout: started (gateway=${config.gatewayUrl})`);
    },
    stop: () => {
      searchCache.clear();
      menuCache.clear();
      addressCache.clear();
      api.logger.info("clawdot-takeout: stopped, caches cleared");
    },
  });

  api.logger.info("clawdot-takeout: registered takeout tool");
}

export default definePluginEntry({
  id: "clawdot-takeout",
  name: "Clawdot Takeout",
  description: "Food ordering tool for 虾点 — search, menu, preview, order",
  configSchema: takeoutConfigSchema,
  register,
});
