import type { HandlerDeps, ToolResult } from "./shared.js";
import { textResult } from "./shared.js";
import type { ShopDetailResponse, MenuItem } from "../types.js";
import { buildMenuOverview, resolveCategory, buildCategoryDetail, buildItemDetail } from "../trimmer.js";

const MENU_TTL_MS = 10 * 60 * 1000;

export async function handleMenu(
  params: Record<string, unknown>,
  deps: HandlerDeps,
): Promise<ToolResult> {
  const shopId = params.shop_id as string | undefined;
  if (!shopId) return textResult("缺少 shop_id 参数。");

  const categoryQuery = params.category as string | undefined;
  const itemId = params.item_id as string | undefined;

  const lat = deps.addressCache.get("addr")?.[0]?.lat ?? deps.config.defaultLat;
  const lng = deps.addressCache.get("addr")?.[0]?.lng ?? deps.config.defaultLng;

  if (lat == null || lng == null) {
    return textResult("无法确定位置，请先查询地址。");
  }

  const cacheKey = `menu:${shopId}:${lat},${lng}`;

  let detail = deps.menuCache.get(cacheKey);
  if (!detail) {
    detail = await deps.gateway.getShopDetail(deps.userToken, shopId, lat, lng);
    deps.menuCache.set(cacheKey, detail, MENU_TTL_MS);
  }

  if (itemId) {
    const item = findItem(detail, itemId);
    if (!item) return textResult(`未找到商品 ${itemId}`);
    return textResult(JSON.stringify(buildItemDetail(item)));
  }

  if (categoryQuery) {
    const cat = resolveCategory(detail.menu, categoryQuery);
    if (!cat) return textResult(`未找到分类"${categoryQuery}"，可用分类：${detail.menu.map(c => c.category).join("、")}`);
    return textResult(JSON.stringify(buildCategoryDetail(cat)));
  }

  return textResult(JSON.stringify(buildMenuOverview(detail)));
}

function findItem(detail: ShopDetailResponse, itemId: string): MenuItem | null {
  for (const cat of detail.menu) {
    const item = cat.items.find((i) => i.item_id === itemId);
    if (item) return item;
  }
  return null;
}
