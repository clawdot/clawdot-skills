import { Type } from "@sinclair/typebox";
import type { GatewayClient } from "./gateway-client.js";
import type { TakeoutConfig } from "./config.js";
import type { TtlCache } from "./cache.js";
import type { Address, TrimmedSearchResult, ShopDetailResponse } from "./types.js";
import type { HandlerDeps } from "./handlers/shared.js";
import { textResult } from "./handlers/shared.js";
import { handleSearch } from "./handlers/search.js";
import { handleMenu } from "./handlers/menu.js";
import { handleAddresses } from "./handlers/address.js";
import { handlePreview } from "./handlers/preview.js";
import { handleOrder, handleOrderStatus } from "./handlers/order.js";

export interface TakeoutToolDeps {
  gateway: GatewayClient;
  userToken: string;
  searchCache: TtlCache<TrimmedSearchResult>;
  menuCache: TtlCache<ShopDetailResponse>;
  addressCache: TtlCache<Address[]>;
  config: TakeoutConfig;
}

export function createTakeoutTool(deps: TakeoutToolDeps) {
  const { gateway, userToken, searchCache, menuCache, addressCache, config } = deps;

  return {
    name: "takeout",
    label: "外卖点餐",
    description:
      "外卖点餐工具。通过 action 参数选择操作：search(搜索餐厅)、menu(查看菜单)、addresses(管理地址)、preview(预览订单)、order(确认下单)、order_status(查询订单状态)。",
    parameters: Type.Object({
      action: Type.Unsafe<string>({
        type: "string",
        enum: ["search", "menu", "addresses", "preview", "order", "order_status"],
        description: "操作类型",
      }),
      keyword: Type.Optional(Type.String({ description: "搜索关键词，如'咖啡'、'轻食'" })),
      lat: Type.Optional(Type.Number({ description: "纬度" })),
      lng: Type.Optional(Type.Number({ description: "经度" })),
      shop_id: Type.Optional(Type.String({ description: "店铺ID" })),
      category: Type.Optional(Type.String({ description: "分类名或索引编号" })),
      item_id: Type.Optional(Type.String({ description: "商品ID，查看详情" })),
      select_source: Type.Optional(Type.Unsafe<string>({
        type: "string",
        enum: ["poi", "eleme_history"],
        description: "地址来源：poi 或 eleme_history",
      })),
      poi_data: Type.Optional(Type.Object({}, { additionalProperties: true, description: "POI 数据对象（来自 search 结果的 suggestions）" })),
      contact_name: Type.Optional(Type.String({ description: "收件人姓名（poi 来源时必填）" })),
      contact_phone: Type.Optional(Type.String({ description: "收件人电话（poi 来源时必填）" })),
      address_detail: Type.Optional(Type.String({ description: "门牌号/楼层" })),
      address_tag: Type.Optional(Type.String({ description: "标签：home/work/school" })),
      eleme_address_id: Type.Optional(Type.String({ description: "饿了么历史地址ID（eleme_history 来源时必填）" })),
      address_id: Type.Optional(Type.Number({ description: "配送地址ID" })),
      items: Type.Optional(Type.Array(
        Type.Object({
          item_id: Type.String({ description: "商品ID" }),
          quantity: Type.Number({ description: "数量", minimum: 1 }),
          specs: Type.Optional(Type.Array(Type.Object({ name: Type.String(), value: Type.String() }))),
          attrs: Type.Optional(Type.Array(Type.Object({ name: Type.String(), value: Type.String() }))),
        }),
        { description: "商品列表" },
      )),
      note: Type.Optional(Type.String({ description: "备注" })),
      session_id: Type.Optional(Type.String({ description: "来自 preview 的 session_id" })),
      order_id: Type.Optional(Type.String({ description: "订单ID" })),
    }),
    async execute(_toolCallId: string, params: Record<string, unknown>) {
      const handlerDeps: HandlerDeps = { gateway, userToken, searchCache, menuCache, addressCache, config };
      switch (params.action) {
        case "search":        return handleSearch(params, handlerDeps);
        case "menu":          return handleMenu(params, handlerDeps);
        case "addresses":     return handleAddresses(params, handlerDeps);
        case "preview":       return handlePreview(params, handlerDeps);
        case "order":         return handleOrder(params, handlerDeps);
        case "order_status":  return handleOrderStatus(params, handlerDeps);
        default:              return textResult(`未知操作: ${params.action}`);
      }
    },
  };
}
