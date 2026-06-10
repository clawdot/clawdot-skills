---
name: clawdot-takeout
description: 通过 ClawDot 外卖网关帮用户点外卖。当用户提到想吃什么、想喝什么、饿了、点外卖、叫外卖、午饭/晚饭吃什么、来杯咖啡、下午茶、夜宵等任何与饮食需求相关的表达时必须触发。即使用户只是随口提到食物或饮品名称（如"好想吃火锅"、"来杯奶茶"、"有点渴"），也要触发此技能来协助点餐。
metadata:
  openclaw:
    requires:
      bins: [python3]
      env: []
      env_optional: [GATEWAY_URL, API_KEY, USER_TOKEN, ADMIN_SECRET, REDIS_URL, CLAWDOT_SETUP_URL, DEFAULT_LAT, DEFAULT_LNG]
---

{{GUIDE}}

## 调用方式

所有操作通过 `takeout` tool 的 `action` 参数调用（agent 模式必带 `phone` 参数）：

| action | 用途 | 关键参数 |
|--------|------|----------|
| addresses | 查询/搜索/新建地址 | address_keyword?, city?, select_token?, contact_name?, contact_phone?, address_detail?, address_tag? |
| search | 搜索附近店铺 | shop_keyword?, lat?, lng? |
| recommend | **搜店+取菜单一步到位** | shop_keyword?, lat?, lng?, top_n?（默认3，最多5）|
| menu | 查看菜单（三级：概览→分类→商品；shop_keyword 跨分类搜菜） | shop_id, category?, item_id?, shop_keyword? |
| preview | 预览订单（缺 item_id 自动模糊匹配） | shop_id, address_id, items (JSON array), note? |
| order | 确认下单 | session_id, channel? |
| order_status | 查询订单 | order_id |
| request_code | 用户绑定第 1 步：默认发短信验证码；`auth_type=h5` 返回授权链接 | phone, auth_type?（sms/h5，默认 sms） |
| verify_code | 用户绑定第 2 步：短信验码 / H5 轮询授权结果，成功后缓存 token | phone + bind_id + code（sms）；phone + auth_type=h5 + request_id（h5） |

### 鉴权三种模式

| 模式 | 触发 | 必须 env | 说明 |
|------|------|---------|------|
| Personal | **不**传 `phone` | `USER_TOKEN` | 单用户长期复用 |
| Agent | 传 `phone`（11 位手机号） | `ADMIN_SECRET` | 脚本内部 trustedBind 拿 token，按手机号缓存 1h；可选 `REDIS_URL` |
| 用户绑定 | 以上都没配 | 仅 `API_KEY` | 用户自己授权：短信验证码（默认）或 H5 链接，按脚本 RECOVERY 指引一句话问齐手机号+方式 |

`API_KEY` 也没配时脚本返回 `RECOVERY[API_KEY_MISSING]`，按指引引导用户去注册页拿 key 并写入 `.env`。

### 地址管理

- 无参数 → 列出已保存地址（saved）；不透出饿了么历史地址簿，新绑定用户为空时报 `[需要地址]`
- 带 `address_keyword [+ city]` → 关键词搜索（POI 必须坐标或城市，二选一）
- 带 `select_token` + `contact_name` + `contact_phone` [+ `address_detail`] [+ `address_tag`] → 保存地址
  - suggestion.`requires_detail=true` 时必须传 `address_detail`，否则 400 DETAIL_REQUIRED

### 菜单三级钻取

1. `menu` + `shop_id` → 分类概览
2. `menu` + `shop_id` + `category` → 分类下所有商品
3. `menu` + `shop_id` + `item_id` → 商品详情（规格、属性、加料）
4. `menu` + `shop_id` + `shop_keyword` → 跨分类按菜名模糊搜
