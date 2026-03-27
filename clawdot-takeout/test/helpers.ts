import type { GatewayClient } from "../src/gateway-client.js";
import type { TakeoutConfig } from "../src/config.js";
import { TtlCache } from "../src/cache.js";
import type { SearchShopsResponse, ShopDetailResponse, ListAddressesResponse, SearchAddressesResponse, SelectAddressResponse, Address } from "../src/types.js";

export function mockConfig(overrides: Partial<TakeoutConfig> = {}): TakeoutConfig {
  return {
    gatewayUrl: "http://localhost:3100",
    apiKey: "clw_test",
    userToken: "tok_user",
    defaultLat: 32.0356,
    defaultLng: 118.7621,
    timeoutMs: 5000,
    ...overrides,
  };
}

type MockGatewayOverrides = {
  searchShops?: (userToken: string, lat: number, lng: number, keyword?: string) => Promise<SearchShopsResponse>;
  getShopDetail?: (userToken: string, shopId: string, lat: number, lng: number) => Promise<ShopDetailResponse>;
  listAddresses?: (userToken: string) => Promise<ListAddressesResponse>;
  searchAddresses?: (...args: any[]) => Promise<SearchAddressesResponse>;
  selectAddress?: (...args: any[]) => Promise<SelectAddressResponse>;
};

export function mockGateway(overrides: MockGatewayOverrides = {}): GatewayClient {
  return {
    searchShops: overrides.searchShops ?? (async () => ({ shops: [] })),
    getShopDetail: overrides.getShopDetail ?? (async () => ({ shop: { id: "", name: "", address: "", business_hours: "" }, menu: [] })),
    listAddresses: overrides.listAddresses ?? (async () => ({ addresses: [] })),
    searchAddresses: overrides.searchAddresses ?? (async () => ({ saved: [] })),
    selectAddress: overrides.selectAddress ?? (async () => ({ id: 1, address: "", detail: "", lat: 0, lng: 0 })),
    previewOrder: async () => ({ session_id: "s1", shop_name: "", items: [], packing_fee: 0, delivery_fee: 0, discount: 0, total: 0, estimated_delivery_time: "" }),
    createOrder: async () => ({ order_id: "o1", status: "created", shop_name: "", total_amount: 0 }),
    getOrderStatus: async () => ({ order_id: "o1", status: "created", shop_name: "", total_amount: 0, created_at: null }),
  } as any;
}
