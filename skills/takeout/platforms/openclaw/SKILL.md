---
name: clawdot-takeout
description: 通过 ClawDot 外卖网关帮用户点外卖。当用户提到想吃什么、想喝什么、饿了、点外卖、叫外卖、午饭/晚饭吃什么、来杯咖啡、下午茶、夜宵等任何与饮食需求相关的表达时必须触发。即使用户只是随口提到食物或饮品名称（如"好想吃火锅"、"来杯奶茶"、"有点渴"），也要触发此技能来协助点餐。
metadata:
  openclaw:
    requires:
      bins: [python3]
      env: [GATEWAY_URL, API_KEY, USER_TOKEN]
---

{{GUIDE}}

## 调用方式

所有操作通过 `takeout` tool 的 `action` 参数调用：

| action | 用途 | 关键参数 |
|--------|------|----------|
| addresses | 查询/搜索/新建地址 | address_keyword?, select_token?, contact_name?, contact_phone?, address_detail?, address_tag? |
| search | 搜索附近店铺 | --shop-keyword?, --lat?, --lng? |
| recommend | **搜店+取菜单一步到位** | --shop-keyword?, --lat?, --lng?, --top-n?（默认3，最多5）|
| menu | 查看菜单（三级：概览→分类→商品） | --shop-id, --category?, --item-id? |
| preview | 预览订单 | --shop-id, --address-id, --items (JSON array) |
| order | 确认下单 | --session-id |
| order_status | 查询订单 | --order-id |

### 地址管理

- 无参数 → 列出已保存地址 + 历史 suggestions（需 lat/lng，从缓存或 DEFAULT 兜底）
- 带 `address_keyword` → 关键词搜索（返回 saved + suggestions，每条带 `token`）
- 带 `select_token` + `contact_name` + `contact_phone` [+ `address_detail`] [+ `address_tag`] → 保存地址
  - suggestion.`requires_detail=true` 时必须传 `address_detail`，否则后端 500

### 菜单三级钻取

1. `menu` + `shop_id` → 分类概览（各分类名 + 热门商品）
2. `menu` + `shop_id` + `category` → 分类下所有商品
3. `menu` + `shop_id` + `item_id` → 商品详情（规格、属性、加料）
