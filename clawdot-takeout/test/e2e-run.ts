/**
 * Interactive E2E runner: create address → search → menu → preview → order
 *
 * Usage:
 *   GATEWAY_URL=... GATEWAY_API_KEY=... USER_TOKEN=... npx tsx test/e2e-run.ts
 */
import { createTakeoutTool } from "../src/tool.js";
import { GatewayClient } from "../src/gateway-client.js";
import { TtlCache } from "../src/cache.js";
import type { Address, TrimmedSearchResult, ShopDetailResponse } from "../src/types.js";

const GATEWAY_URL = process.env.GATEWAY_URL!;
const API_KEY = process.env.GATEWAY_API_KEY!;
const USER_TOKEN = process.env.USER_TOKEN!;
const DEFAULT_LAT = Number(process.env.DEFAULT_LAT) || 31.2304;
const DEFAULT_LNG = Number(process.env.DEFAULT_LNG) || 121.4737;

const gateway = new GatewayClient({ baseUrl: GATEWAY_URL, apiKey: API_KEY, timeoutMs: 30_000 });
const addressCache = new TtlCache<Address[]>(100);
const tool = createTakeoutTool({
  gateway,
  userToken: USER_TOKEN,
  searchCache: new TtlCache<TrimmedSearchResult>(100),
  menuCache: new TtlCache<ShopDetailResponse>(50),
  addressCache,
  config: { gatewayUrl: GATEWAY_URL, apiKey: API_KEY, userToken: USER_TOKEN, defaultLat: 31.2304, defaultLng: 121.4737, timeoutMs: 30_000 },
});

function exec(id: string, params: Record<string, unknown>) {
  return tool.execute(id, params);
}

function parse(r: { content: Array<{ text: string }> }) {
  return JSON.parse(r.content[0].text);
}

async function run() {
  // If ADDRESS_ID is set, skip address creation and jump straight to ordering
  if (process.env.ADDRESS_ID) {
    const id = Number(process.env.ADDRESS_ID);
    console.log(`Using pre-set ADDRESS_ID=${id}, skipping address creation`);
    return continueFlow(id, DEFAULT_LAT, DEFAULT_LNG);
  }

  console.log("=== Step 1: Search address ===");
  const addrSearch = parse(await exec("1", { action: "addresses", keyword: "南京西路", lat: 31.2304, lng: 121.4737 }));
  console.log(`Saved: ${addrSearch.saved?.length ?? 0}, Suggestions: ${addrSearch.suggestions?.length ?? 0}`);

  // Try eleme_history first (more reliable), fall back to POI
  const eleme = addrSearch.suggestions?.find((s: any) => s.source === "eleme_history");
  const poi = addrSearch.suggestions?.find((s: any) => s.source === "poi");
  const sources = [
    eleme && { label: "eleme_history", params: { select_source: "eleme_history", eleme_address_id: eleme.eleme_address_id, contact_name: "测试用户", contact_phone: "13800138000" }, info: `${eleme.name} - ${eleme.address}` },
    poi && { label: "poi", params: { select_source: "poi", poi_data: poi.poi_data, contact_name: "测试用户", contact_phone: "13800138000" }, info: `${poi.name} - ${poi.address}` },
  ].filter(Boolean) as Array<{ label: string; params: Record<string, unknown>; info: string }>;

  if (!sources.length) { console.error("No suggestions at all"); process.exit(1); }

  let selectResult: any;
  for (const src of sources) {
    console.log(`Trying ${src.label}: ${src.info}`);
    console.log("=== Step 1b: Select address ===");
    const selectRaw = await exec("1b", { action: "addresses", ...src.params });
    const raw = selectRaw.content[0].text;
    console.log("Raw response:", raw);
    try {
      selectResult = JSON.parse(raw);
      if (selectResult.id) {
        console.log(`Selected address #${selectResult.id}: ${selectResult.address}`);
        break;
      }
    } catch {
      console.log(`${src.label} failed, trying next...`);
    }
  }

  if (!selectResult?.id) { console.error("All address sources failed"); process.exit(1); }

  // Gateway may return null lat/lng for newly created addresses — use search coordinates as fallback
  const addrLat = Number.isFinite(selectResult.lat) ? selectResult.lat : DEFAULT_LAT;
  const addrLng = Number.isFinite(selectResult.lng) ? selectResult.lng : DEFAULT_LNG;
  await continueFlow(selectResult.id, addrLat, addrLng);
}

async function continueFlow(addressId: number, lat: number, lng: number) {
  // Seed address cache with correct coordinates (gateway may return null lat/lng for new addresses)
  addressCache.set("addr", [{ id: addressId, address: "e2e-test", lat, lng }], 600_000);

  console.log("\n=== Step 2: Search shops ===");
  const shops = parse(await exec("2", { action: "search", keyword: "咖啡", lat, lng }));
  console.log(`Found ${shops.count} shops`);
  if (shops.count === 0) { console.error("No shops found"); process.exit(1); }
  const shop = shops.shops[0];
  console.log(`Using: ${shop.name} (${shop.id})`);

  console.log("\n=== Step 3a: Menu overview ===");
  const menu = parse(await exec("3a", { action: "menu", shop_id: shop.id }));
  console.log(`${menu.categories.length} categories, hours: ${menu.business_hours}`);

  console.log("\n=== Step 3b: Category detail ===");
  const cat = parse(await exec("3b", { action: "menu", shop_id: shop.id, category: "0" }));
  console.log(`Category "${cat.category}": ${cat.items.length} items`);
  const item = cat.items.find((i: any) => i.in_stock);
  if (!item) { console.error("No in-stock items"); process.exit(1); }
  console.log(`Using: ${item.name} (${item.item_id}) ¥${item.price}`);

  console.log("\n=== Step 3c: Item detail ===");
  const detail = parse(await exec("3c", { action: "menu", shop_id: shop.id, item_id: item.item_id }));
  console.log(`sku_id: ${detail.sku_id}, ingredients: ${detail.ingredients_summary || "none"}`);

  // Order enough to meet minimum — pick a second item if available
  const items: Array<{ item_id: string; quantity: number }> = [{ item_id: item.item_id, quantity: 2 }];
  const item2 = cat.items.find((i: any) => i.in_stock && i.item_id !== item.item_id);
  if (item2) {
    items.push({ item_id: item2.item_id, quantity: 1 });
    console.log(`Also adding: ${item2.name} (${item2.item_id}) ¥${item2.price}`);
  }

  console.log("\n=== Step 4: Preview order ===");
  const preview = parse(await exec("4", {
    action: "preview",
    shop_id: shop.id,
    address_id: addressId,
    items,
  }));
  console.log(`${preview.shop_name}: ¥${preview.total} (delivery ${preview.estimated_delivery_time})`);
  console.log(`session_id: ${preview.session_id}`);

  console.log("\n=== Step 5: Confirm order ===");
  const order = parse(await exec("5", { action: "order", session_id: preview.session_id }));
  console.log(`Order: ${order.order_id}, status: ${order.status}, total: ¥${order.total_amount}`);

  if (order.payment_link) {
    console.log(`\n✅ SUCCESS — payment link: ${order.payment_link}`);
  } else {
    console.log(`\n⚠️  Order created but no payment_link in response`);
  }

  console.log("\n=== Step 6: Check order status ===");
  const status = parse(await exec("6", { action: "order_status", order_id: order.order_id }));
  console.log(`Status: ${status.status}`);
}

run().catch((err) => { console.error("E2E failed:", err); process.exit(1); });
