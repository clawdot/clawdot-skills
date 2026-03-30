---
name: clawdot-takeout
description: 通过 ClawDot 外卖网关帮用户点外卖。当用户提到想吃什么、想喝什么、饿了、点外卖、叫外卖、午饭/晚饭吃什么、来杯咖啡、下午茶、夜宵等任何与饮食需求相关的表达时必须触发。即使用户只是随口提到食物或饮品名称（如"好想吃火锅"、"来杯奶茶"、"有点渴"），也要触发此技能来协助点餐。
metadata:
  openclaw:
    requires:
      bins: [python3]
      env: [GATEWAY_URL, API_KEY, ADMIN_SECRET]
---

{{GUIDE}}

## 调用方式

所有操作通过 `python3 {baseDir}/scripts/takeout_superagent.py --phone <phone> --action <action>` 调用：

| action | 用途 | 关键参数 |
|--------|------|----------|
| addresses | 查询/搜索/新建地址 | --search-keyword?, --select-source?, --poi-data?, --contact-name?, --contact-phone? |
| search | 搜索附近店铺 | --keyword?, --lat?, --lng? |
| menu | 查看菜单（三级：概览→分类→商品） | --shop-id, --category?, --item-id? |
| preview | 预览订单 | --shop-id, --address-id, --items (JSON array) |
| order | 确认下单 | --session-id |
| order_status | 查询订单 | --order-id |

### 认证

脚本通过 `--phone` 参数接收用户手机号，自动调用 trustedBind 获取用户 token（带缓存）。

### 地址管理

- 无参数 → 列出已保存地址
- `--search-keyword "浦东" --lat 31.23 --lng 121.47` → 搜索地址（返回 saved + suggestions）
- `--select-source poi --poi-data '{"name":"..."}' --contact-name 张三 --contact-phone 138xxx` → 保存新地址
- `--select-source eleme_history --eleme-address-id ADDR789` → 从饿了么历史导入

### 菜单三级钻取

1. `--shop-id E123` → 分类概览（各分类名 + 热门商品）
2. `--shop-id E123 --category "热饮"` → 分类下所有商品
3. `--shop-id E123 --item-id ITEM456` → 商品详情（规格、属性、加料）

### 输出格式

- 成功：JSON 输出到 stdout
- 失败：中文错误信息输出到 stderr，非零退出码
