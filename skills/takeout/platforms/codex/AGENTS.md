---
name: clawdot-takeout
description: 通过 ClawDot 外卖网关帮用户点外卖。当用户提到想吃什么、想喝什么、饿了、点外卖、叫外卖、午饭/晚饭吃什么、来杯咖啡、下午茶、夜宵等任何与饮食需求相关的表达时必须触发。即使用户只是随口提到食物或饮品名称（如"好想吃火锅"、"来杯奶茶"、"有点渴"），也要触发此技能来协助点餐。
---

{{GUIDE}}

## 调用方式

所有操作通过 `python3 scripts/takeout.py [--phone <手机号>] --action <action>` 调用：

| action | 用途 | 关键参数 |
|--------|------|----------|
| addresses | 查询/搜索/新建地址 | --address-keyword?, --city?, --select-token?, --contact-name?, --contact-phone?, --address-detail?, --address-tag? |
| search | 搜索附近店铺 | --shop-keyword?, --lat?, --lng? |
| recommend | **搜店+取菜单一步到位** | --shop-keyword?, --lat?, --lng?, --top-n?（默认3，最多5）|
| menu | 查看菜单（三级：概览→分类→商品；--shop-keyword 跨分类搜菜） | --shop-id, --category?, --item-id?, --shop-keyword? |
| preview | 预览订单（缺 item_id 自动模糊匹配） | --shop-id, --address-id, --items (JSON array), --note? |
| order | 确认下单 | --session-id, --channel? |
| order_status | 查询订单 | --order-id |

### 鉴权两种模式

| 模式 | 触发 | 必须 env | 说明 |
|------|------|---------|------|
| Personal | **不**传 `--phone` | `USER_TOKEN` | 单用户长期复用 |
| Agent | 传 `--phone <11 位手机号>` | `ADMIN_SECRET` | 脚本内部 trustedBind 拿 token，按手机号缓存 1h；可选 `REDIS_URL` |

### 地址管理

- 无参数 → 列出已保存地址 + 历史 suggestions
- 带 `--address-keyword [--city ...]` → 关键词搜索（POI 必须坐标或城市，二选一）
- `--select-token sug_xxx --contact-name 张三 --contact-phone 138xxx [--address-detail "1栋502"] [--address-tag home]` → 保存地址
  - suggestion.`requires_detail=true` 时必须传 `--address-detail`，否则 400 DETAIL_REQUIRED

### 菜单三级钻取

1. `--shop-id E123` → 分类概览
2. `--shop-id E123 --category "热饮"` → 分类下所有商品
3. `--shop-id E123 --item-id ITEM456` → 商品详情（规格、属性、加料）
4. `--shop-id E123 --shop-keyword "苕皮"` → 跨分类按菜名模糊搜

### 环境变量

| 变量 | 必须？ | 用途 |
|------|--------|------|
| GATEWAY_URL | ✅ | ClawDot Gateway API 地址 |
| API_KEY | ✅ | Gateway API 密钥 |
| USER_TOKEN | personal 模式 ✅ | 用户鉴权令牌 |
| ADMIN_SECRET | agent 模式 ✅ | trustedBind 用的 admin 密钥 |
| REDIS_URL | 可选 | 跨进程共享 user_token |
| DEFAULT_LAT/LNG | 可选 | personal 模式冷启动兜底坐标 |

### 输出格式

- 成功：JSON 输出到 stdout
- 失败：中文错误 + `RECOVERY[CODE]: <下一步>` 输出到 stderr，非零退出码
