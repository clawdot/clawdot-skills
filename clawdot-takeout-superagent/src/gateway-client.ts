import {
  GatewayError,
  type SearchShopsResponse,
  type ShopDetailResponse,
  type ListAddressesResponse,
  type PreviewOrderRequest,
  type PreviewOrderResponse,
  type CreateOrderResponse,
  type OrderStatusResponse,
  type SearchAddressesResponse,
  type SelectAddressRequest,
  type SelectAddressResponse,
} from "./types.js";

function normalizeAddress<T extends { lat: unknown; lng: unknown }>(addr: T): T & { lat: number; lng: number } {
  return { ...addr, lat: Number(addr.lat), lng: Number(addr.lng) };
}

export interface GatewayClientOptions {
  baseUrl: string;
  apiKey: string;
  adminSecret: string;
  timeoutMs?: number;
}

export class GatewayClient {
  private baseUrl: string;
  private apiKey: string;
  private adminSecret: string;
  private timeoutMs: number;

  constructor(opts: GatewayClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/+$/, "");
    this.apiKey = opts.apiKey;
    this.adminSecret = opts.adminSecret;
    this.timeoutMs = opts.timeoutMs ?? 30_000;
  }

  private async request<T>(
    path: string,
    opts: { method?: string; body?: unknown; userToken?: string; admin?: boolean } = {},
  ): Promise<T> {
    const headers: Record<string, string> = {
      "Authorization": `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
    };
    if (opts.userToken) headers["X-User-Token"] = opts.userToken;
    if (opts.admin) headers["X-Admin-Secret"] = this.adminSecret;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await fetch(`${this.baseUrl}${path}`, {
        method: opts.method ?? "GET",
        headers,
        body: opts.body ? JSON.stringify(opts.body) : undefined,
        signal: controller.signal,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: { code?: string; message?: string } };
        throw new GatewayError(
          res.status,
          err.error?.code ?? "UNKNOWN",
          err.error?.message ?? res.statusText,
        );
      }
      return (await res.json()) as T;
    } finally {
      clearTimeout(timer);
    }
  }

  async trustedBind(phone: string): Promise<{ user_token: string; expires_at: string; is_new: boolean }> {
    return this.request("/api/v1/user/bind/trusted", {
      method: "POST",
      body: { phone },
      admin: true,
    });
  }

  async searchShops(userToken: string, lat: number, lng: number, keyword?: string): Promise<SearchShopsResponse> {
    const params = new URLSearchParams({ lat: String(lat), lng: String(lng) });
    if (keyword) params.set("keyword", keyword);
    return this.request(`/api/v1/shops/search?${params}`, { userToken });
  }

  async getShopDetail(userToken: string, shopId: string, lat: number, lng: number): Promise<ShopDetailResponse> {
    const params = new URLSearchParams({ lat: String(lat), lng: String(lng) });
    return this.request(`/api/v1/shops/${encodeURIComponent(shopId)}?${params}`, { userToken });
  }

  async listAddresses(userToken: string): Promise<ListAddressesResponse> {
    const raw = await this.request<ListAddressesResponse>("/api/v1/addresses", { userToken });
    return { addresses: raw.addresses.map(normalizeAddress) };
  }

  async searchAddresses(
    userToken: string,
    keyword?: string,
    lat?: number,
    lng?: number,
  ): Promise<SearchAddressesResponse> {
    const body: Record<string, unknown> = {};
    if (keyword) body.keyword = keyword;
    if (lat != null) body.lat = lat;
    if (lng != null) body.lng = lng;
    const raw = await this.request<SearchAddressesResponse>("/api/v1/addresses/search", {
      method: "POST",
      body,
      userToken,
    });
    return {
      saved: raw.saved.map(normalizeAddress),
      suggestions: raw.suggestions?.map(normalizeAddress),
    };
  }

  async selectAddress(userToken: string, body: SelectAddressRequest): Promise<SelectAddressResponse> {
    const raw = await this.request<SelectAddressResponse>("/api/v1/addresses/select", {
      method: "POST",
      body,
      userToken,
    });
    return normalizeAddress(raw);
  }

  async previewOrder(userToken: string, body: PreviewOrderRequest): Promise<PreviewOrderResponse> {
    return this.request("/api/v1/orders/preview", { method: "POST", body, userToken });
  }

  async createOrder(userToken: string, sessionId: string): Promise<CreateOrderResponse> {
    return this.request("/api/v1/orders", { method: "POST", body: { session_id: sessionId }, userToken });
  }

  async getOrderStatus(userToken: string, orderId: string): Promise<OrderStatusResponse> {
    return this.request(`/api/v1/orders/${encodeURIComponent(orderId)}`, { userToken });
  }
}
