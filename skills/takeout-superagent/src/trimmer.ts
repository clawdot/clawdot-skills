import type {
  SearchShopsResponse,
  ShopDetailResponse,
  MenuCategory,
  MenuItem,
  IngredientGroup,
  TrimmedSearchResult,
  TrimmedShop,
  MenuOverview,
  CategoryDetail,
  CategoryDetailItem,
  ItemDetail,
} from "./types.js";

export function trimSearchResults(raw: SearchShopsResponse): TrimmedSearchResult {
  const shops: TrimmedShop[] = raw.shops.map((s) => ({
    id: s.id,
    name: s.name,
    rating: s.rating,
    delivery_fee: s.delivery_fee,
    delivery_time_minutes: s.delivery_time_minutes,
    min_order_amount: s.min_order_amount,
    distance: s.distance,
    highlights: (s.items ?? []).slice(0, 2).map((i) => i.name),
  }));
  return { shops, count: shops.length };
}

export function buildMenuOverview(raw: ShopDetailResponse): MenuOverview {
  return {
    shop_name: raw.shop.name,
    business_hours: raw.shop.business_hours,
    categories: raw.menu.map((cat, index) => ({
      name: cat.category,
      index,
      item_count: cat.items.length,
      top_items: cat.items.slice(0, 3).map((item) => ({
        name: item.name,
        price: item.price,
        sold: item.sold_count ?? "",
      })),
    })),
  };
}

export function resolveCategory(
  categories: MenuCategory[],
  query: string,
): MenuCategory | null {
  const exact = categories.find((c) => c.category === query);
  if (exact) return exact;
  const idx = parseInt(query, 10);
  if (!isNaN(idx) && idx >= 0 && idx < categories.length) {
    return categories[idx];
  }
  const fuzzy = categories.find((c) => c.category.includes(query));
  return fuzzy ?? null;
}

export function buildCategoryDetail(cat: MenuCategory): CategoryDetail {
  const items: CategoryDetailItem[] = cat.items.map((item) => ({
    item_id: item.item_id,
    name: item.name,
    price: item.price,
    original_price: item.original_price,
    sold: item.sold_count ?? "",
    in_stock: item.in_stock,
    has_specs: (item.specs?.length ?? 0) > 0,
    has_ingredients: (item.ingredients?.length ?? 0) > 0,
    description: item.description,
  }));
  return { category: cat.category, items };
}

export function buildItemDetail(item: MenuItem): ItemDetail {
  return {
    item_id: item.item_id,
    sku_id: item.sku_id,
    name: item.name,
    price: item.price,
    specs: item.specs?.length ? item.specs : undefined,
    attrs: item.attrs?.length ? item.attrs : undefined,
    ingredients_summary: buildIngredientsSummary(item.ingredients),
    default_ingredients: item.default_ingredients ?? [],
  };
}

export function buildIngredientsSummary(groups: IngredientGroup[] | undefined): string {
  if (!groups?.length) return "";
  return groups
    .map((g) => `${g.group_name}(${g.options.map((o) => o.name).join("/")})`)
    .join(" | ");
}
