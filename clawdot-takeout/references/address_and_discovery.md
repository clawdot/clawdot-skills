# 地址与找店规则

## 地址匹配

- 当用户提到“家里”“公司”“学校”，或只给了楼盘名、商圈名、学校名、园区名这类模糊地点时，统一调用 `POST /api/v1/addresses/search`。
- `keyword=""` 时，只返回 `saved`，适合先看当前账号下已经能直接下单的地址。
- `keyword` 非空时，返回 `saved` 和 `suggestions`。
- 如果 `saved` 里能唯一命中，直接继续，不要先让用户手动补完整地址。
- 只有命中多个候选时，才问一句最关键的确认问题。
- 如果完全没有地址线索，再问“送到哪里”。

## 保存候选地址

- `suggestions` 里的候选地址不能直接用于下单，必须先 `POST /api/v1/addresses/select`。
- `select` 是当前网关里的最终保存动作；不要再调用旧的 `POST /api/v1/addresses`。
- `source=poi` 时：
  1. 从 `suggestions` 里选中一条 `source="poi"` 记录
  2. 原样传完整 `poi_data`
  3. 补齐 `contact_name`、`contact_phone`、`address`、`detail`、`tag`、`lat`、`lng`
- `source=eleme_history` 时：
  1. 从 `suggestions` 里选中一条 `source="eleme_history"` 记录
  2. 传 `eleme_address_id`
  3. 补齐 `contact_name`、`contact_phone`、`address`、`detail`、`tag`、`lat`、`lng`
- `select` 返回的是 gateway 地址对象；其中 `id` 是后续预览订单要传的地址 ID。

## 地址检查

- `select` 成功后，优先再次调用 `POST /api/v1/addresses/search` 做结果检查。
- 检查目标：
  - 目标地址是否出现在 `saved` 里
  - 地址文本是否与预期地点大致一致
  - 返回的 gateway `id` 是否和 `saved` 中对应得上
- 如果 `select` 成功但 `saved` 里没看到新地址，不要默认认为保存已经完全生效；应提示用户“保存接口已成功，但列表未立即确认到结果”，必要时稍后重查。
- 如果 `select` 失败，就不要再用旧假设继续下单；先确认地址是否真的保存成功，再决定是否重试或换 POI。

## 找店原则

- 用 `GET /api/v1/shops/search` 搜索候选门店。
- 搜索结果里的 `items` 只用于快速展示，不直接拿来下单。
- 真正下单前，必须调用 `GET /api/v1/shops/{shop_id}` 获取菜单明细。
- 搜店结果只代表“可检索到的候选门店”，不要把它表述成“肯定能下单”；实际以下单预览和创建结果为准。

## 下单地址语义

- `POST /api/v1/orders/preview` 里的 `address_id` 必须是 gateway 地址 ID。
- 这个 `address_id` 只能来自两处：
  - `saved[].id`
  - `POST /api/v1/addresses/select` 返回对象里的 `id`
- 不要直接传 Eleme 地址 ID。
- 不要直接传 POI ID。
- 不要直接传地址文本。

## 图片展示

- 图片主要用于帮助用户选店、选商品，不替代文字说明和订单摘要。
- 优先展示商品图，其次才是店铺图。
- 一次最多展示少量代表图：
  - 推荐店铺时，最多配 1-3 个代表商品图
  - 对比商品时，最多配 1-3 个候选商品图
- 当用户已经明确选定商品、进入预览或确认下单阶段后，默认不再重复发图。
- 图片只作辅助；商品名称、价格、规格、定制项始终以接口文字字段为准。
