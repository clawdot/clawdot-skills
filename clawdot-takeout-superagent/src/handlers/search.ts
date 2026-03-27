import type { HandlerDeps, ToolResult } from "./shared.js";
import { textResult } from "./shared.js";
import { trimSearchResults } from "../trimmer.js";

const SEARCH_TTL_MS = 5 * 60 * 1000;

export async function handleSearch(
  params: Record<string, unknown>,
  deps: HandlerDeps,
): Promise<ToolResult> {
  const lat = (params.lat as number | undefined)
    ?? deps.addressCache.get(`addr:${deps.userId}`)?.[0]?.lat
    ?? deps.config.defaultLat;
  const lng = (params.lng as number | undefined)
    ?? deps.addressCache.get(`addr:${deps.userId}`)?.[0]?.lng
    ?? deps.config.defaultLng;

  if (lat == null || lng == null) {
    return textResult("无法确定配送位置，请提供地址。");
  }

  const keyword = params.keyword as string | undefined;
  const cacheKey = `search:${lat},${lng},${keyword ?? "default"}`;
  const cached = deps.searchCache.get(cacheKey);
  if (cached) return textResult(JSON.stringify(cached));

  const token = await deps.authBridge.requireToken(deps.userId);
  const raw = await deps.gateway.searchShops(token, lat, lng, keyword);
  const trimmed = trimSearchResults(raw);
  deps.searchCache.set(cacheKey, trimmed, SEARCH_TTL_MS);
  return textResult(JSON.stringify(trimmed));
}
