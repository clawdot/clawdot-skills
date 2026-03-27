// ─── Gateway Response Types ───

export interface ShopSearchItem {
  id: string;
  name: string;
  brand_name?: string;
  image?: string;
  distance: string;
  rating: string;
  delivery_fee: number;
  delivery_time_minutes: number;
  min_order_amount: number;
  is_ad?: boolean;
  items?: Array<{ name: string; price: number }>;
}

export interface SearchShopsResponse {
  shops: ShopSearchItem[];
}

export interface IngredientOption {
  id: string;
  name: string;
  price: number;
  item_id: string;
  sku_id: string;
  package_id: string;
  excludes?: string[];
}

export interface IngredientGroup {
  group_name: string;
  required: boolean;
  options: IngredientOption[];
  default_id?: string;
}

export interface DefaultIngredient {
  item_id: string;
  sku_id: string;
  package_id: string;
  buy_amount: number;
}

export interface MenuItem {
  item_id: string;
  sku_id: string;
  name: string;
  description?: string;
  image?: string;
  price: number;
  original_price?: number | null;
  sold_count?: string;
  in_stock: boolean;
  specs?: Array<{ name: string; options: string[] }>;
  attrs?: Array<{ name: string; options: string[] }>;
  ingredients?: IngredientGroup[];
  default_ingredients?: DefaultIngredient[];
}

export interface MenuCategory {
  category: string;
  items: MenuItem[];
}

export interface ShopDetail {
  id: string;
  name: string;
  address: string;
  business_hours: string;
  announcement?: string;
}

export interface ShopDetailResponse {
  shop: ShopDetail;
  menu: MenuCategory[];
}

export interface Address {
  id: number;
  address: string;
  lat: number;
  lng: number;
}

export interface ListAddressesResponse {
  addresses: Address[];
}

export interface PreviewOrderRequest {
  shop_id: string;
  address_id: number;
  items: Array<{
    item_id: string;
    sku_id: string;
    quantity: number;
    specs?: Array<{ name: string; value: string }>;
    attrs?: Array<{ name: string; value: string }>;
    ingredients?: DefaultIngredient[];
  }>;
  lat: number;
  lng: number;
  note?: string;
}

export interface PreviewOrderResponse {
  session_id: string;
  shop_name: string;
  items: Array<{ name: string; price: number; quantity: number; description?: string }>;
  packing_fee: number;
  delivery_fee: number;
  discount: number;
  total: number;
  estimated_delivery_time: string;
}

export interface CreateOrderResponse {
  order_id: string;
  status: string;
  shop_name: string;
  total_amount: number;
  payment_link?: string;
}

export interface OrderStatusResponse {
  order_id: string;
  status: string;
  shop_name: string;
  total_amount: number;
  created_at: string | null;
}

// ─── Trimmed Output Types (for LLM context) ───

export interface TrimmedShop {
  id: string;
  name: string;
  rating: string;
  delivery_fee: number;
  delivery_time_minutes: number;
  min_order_amount: number;
  distance: string;
  highlights: string[];
}

export interface TrimmedSearchResult {
  shops: TrimmedShop[];
  count: number;
}

export interface MenuOverviewCategory {
  name: string;
  index: number;
  item_count: number;
  top_items: Array<{ name: string; price: number; sold: string }>;
}

export interface MenuOverview {
  shop_name: string;
  business_hours: string;
  categories: MenuOverviewCategory[];
}

export interface CategoryDetailItem {
  item_id: string;
  name: string;
  price: number;
  original_price?: number | null;
  sold: string;
  in_stock: boolean;
  has_specs: boolean;
  has_ingredients: boolean;
  description?: string;
}

export interface CategoryDetail {
  category: string;
  items: CategoryDetailItem[];
}

export interface ItemDetail {
  item_id: string;
  sku_id: string;
  name: string;
  price: number;
  specs?: Array<{ name: string; options: string[] }>;
  attrs?: Array<{ name: string; options: string[] }>;
  ingredients_summary: string;
  default_ingredients: DefaultIngredient[];
}

// ─── Address Search/Select Types ───

export interface SavedAddress {
  id: number;
  address: string;
  detail: string;
  contact_name: string;
  contact_phone: string;
  tag: string;
  lat: number;
  lng: number;
}

export interface AddressSuggestion {
  source: "poi" | "eleme_history";
  name: string;
  address: string;
  lat: number;
  lng: number;
  poi_data?: Record<string, unknown>;
  eleme_address_id?: string;
}

export interface SearchAddressesResponse {
  saved: SavedAddress[];
  suggestions?: AddressSuggestion[];
}

export interface SelectAddressRequest {
  source: "poi" | "eleme_history";
  poi_data?: Record<string, unknown>;
  contact_name?: string;
  contact_phone?: string;
  address?: string;
  detail?: string;
  tag?: string;
  lat?: number;
  lng?: number;
  eleme_address_id?: string;
}

export interface SelectAddressResponse {
  id: number;
  address: string;
  detail: string;
  lat: number;
  lng: number;
}

// ─── Error Types ───

export class GatewayError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "GatewayError";
  }
}
