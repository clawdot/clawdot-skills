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
| addresses | 查询/搜索/新建地址 | keyword?, lat?, lng?, select_source?, poi_data?, contact_name?, contact_phone? |
| search | 搜索附近店铺 | keyword?, lat?, lng? |
| menu | 查看菜单（三级：概览→分类→商品） | shop_id, category?, item_id? |
| preview | 预览订单 | shop_id, address_id, items |
| order | 确认下单 | session_id |
| order_status | 查询订单 | order_id |

### 地址管理

- 无参数调用 `addresses` → 列出已保存地址
- 带 `keyword` + `lat` + `lng` → 搜索地址（返回 saved + suggestions）
- 带 `select_source=poi` + `poi_data` + `contact_name` + `contact_phone` → 从搜索结果保存新地址
- 带 `select_source=eleme_history` + `eleme_address_id` → 从饿了么历史地址导入

### 菜单三级钻取

1. `menu` + `shop_id` → 分类概览（各分类名 + 热门商品）
2. `menu` + `shop_id` + `category` → 分类下所有商品
3. `menu` + `shop_id` + `item_id` → 商品详情（规格、属性、加料）
