import type { HandlerDeps, ToolResult } from "./shared.js";
import { textResult } from "./shared.js";
import type { Address, ShopDetailResponse, MenuItem, PreviewOrderRequest } from "../types.js";

const MENU_TTL_MS = 10 * 60 * 1000;
const ADDRESS_TTL_MS = 30 * 60 * 1000;

export async function handlePreview(
  params: Record<string, unknown>,
  deps: HandlerDeps,
): Promise<ToolResult> {
  const shopId = params.shop_id as string | undefined;
  const addressId = params.address_id as number | undefined;
  const rawItems = params.items as Array<{
    item_id: string; quantity: number;
    specs?: Array<{ name: string; value: string }>;
    attrs?: Array<{ name: string; value: string }>;
  }> | undefined;

  if (!shopId || addressId == null || !rawItems?.length) {
    return textResult("缺少必要参数：shop_id、address_id、items。");
  }

  const note = params.note as string | undefined;
  const token = await deps.authBridge.requireToken(deps.userId);
  const addresses = await resolveAddresses(token, deps);
  const addr = addresses.find((a) => a.id === addressId);
  if (!addr) {
    return textResult(`未找到地址 ${addressId}。可用地址：${addresses.map(a => `${a.id}(${a.address})`).join("、") || "无"}`);
  }

  if (!Number.isFinite(addr.lat) || !Number.isFinite(addr.lng)) {
    return textResult("地址坐标无效");
  }

  // Resolve menu — fetch on cache miss instead of falling back to item_id as sku_id
  const cacheKey = `menu:${shopId}:${addr.lat},${addr.lng}`;
  let detail = deps.menuCache.get(cacheKey);
  if (!detail) {
    detail = await deps.gateway.getShopDetail(token, shopId, addr.lat, addr.lng);
    deps.menuCache.set(cacheKey, detail, MENU_TTL_MS);
  }

  const completedItems = rawItems.map((raw) => {
    const menuItem = findItem(detail!, raw.item_id);
    if (!menuItem) {
      return null;
    }
    return {
      item_id: raw.item_id,
      sku_id: menuItem.sku_id,
      quantity: raw.quantity,
      specs: raw.specs,
      attrs: raw.attrs,
      ingredients: menuItem.default_ingredients?.length ? menuItem.default_ingredients : undefined,
    };
  });

  const missing = rawItems.filter((_, i) => completedItems[i] === null);
  if (missing.length) {
    return textResult(`未在菜单中找到以下商品：${missing.map(m => m.item_id).join("、")}。请确认 shop_id 和 item_id 是否正确。`);
  }

  const body: PreviewOrderRequest = {
    shop_id: shopId,
    address_id: addressId,
    items: completedItems.filter((i): i is NonNullable<typeof i> => i !== null),
    lat: addr.lat,
    lng: addr.lng,
    note,
  };

  const result = await deps.gateway.previewOrder(token, body);
  return textResult(JSON.stringify(result));
}

async function resolveAddresses(token: string, deps: HandlerDeps): Promise<Address[]> {
  const cacheKey = `addr:${deps.userId}`;
  const cached = deps.addressCache.get(cacheKey);
  if (cached) return cached;
  const resp = await deps.gateway.listAddresses(token);
  deps.addressCache.set(cacheKey, resp.addresses, ADDRESS_TTL_MS);
  return resp.addresses;
}

function findItem(detail: ShopDetailResponse, itemId: string): MenuItem | null {
  for (const cat of detail.menu) {
    const item = cat.items.find((i) => i.item_id === itemId);
    if (item) return item;
  }
  return null;
}
