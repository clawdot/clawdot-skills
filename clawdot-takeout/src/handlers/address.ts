import type { HandlerDeps, ToolResult } from "./shared.js";
import { textResult } from "./shared.js";
import { GatewayError } from "../types.js";

const ADDRESS_TTL_MS = 30 * 60 * 1000;

export async function handleAddresses(
  params: Record<string, unknown>,
  deps: HandlerDeps,
): Promise<ToolResult> {
  const selectSource = params.select_source as string | undefined;

  if (selectSource) {
    return handleSelectAddress(params, deps);
  }

  const keyword = params.keyword as string | undefined;
  if (keyword) {
    const lat = params.lat as number | undefined;
    const lng = params.lng as number | undefined;
    if (lat == null || lng == null) {
      return textResult("搜索地址时需要提供 lat 和 lng");
    }
    try {
      const result = await deps.gateway.searchAddresses(deps.userToken, keyword, lat, lng);
      return textResult(JSON.stringify(result));
    } catch (err) {
      if (err instanceof GatewayError) return textResult(`地址搜索失败：${err.message}`);
      throw err;
    }
  }

  // List saved addresses
  try {
    const result = await deps.gateway.searchAddresses(deps.userToken);
    deps.addressCache.delete("addr");
    if (result.saved?.length) {
      const asAddresses = result.saved.map((s) => ({
        id: s.id,
        address: s.address,
        lat: s.lat,
        lng: s.lng,
      }));
      deps.addressCache.set("addr", asAddresses, ADDRESS_TTL_MS);
    }
    return textResult(JSON.stringify(result));
  } catch (err) {
    if (err instanceof GatewayError) return textResult(`获取地址失败：${err.message}`);
    throw err;
  }
}

async function handleSelectAddress(
  params: Record<string, unknown>,
  deps: HandlerDeps,
): Promise<ToolResult> {
  const source = params.select_source as "poi" | "eleme_history";

  try {
    const result = await deps.gateway.selectAddress(deps.userToken, {
      source,
      poi_data: params.poi_data as Record<string, unknown> | undefined,
      contact_name: params.contact_name as string | undefined,
      contact_phone: params.contact_phone as string | undefined,
      detail: params.address_detail as string | undefined,
      tag: params.address_tag as string | undefined,
      eleme_address_id: params.eleme_address_id as string | undefined,
    });

    // Invalidate address cache so subsequent operations pick up the new address
    deps.addressCache.delete("addr");

    return textResult(JSON.stringify(result));
  } catch (err) {
    if (err instanceof GatewayError) return textResult(`保存地址失败：${err.message}`);
    throw err;
  }
}
