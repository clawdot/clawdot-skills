# Changelog

## [0.2.0] - 2026-04-14

### Added

- `recommend` action：搜店 + 并行抓 top N 家菜单一步到位（默认 3 家、最多 5 家），省一次推理回合
- `build_menu_overview(compact=True)` 模式：跳过 ¥0 噪音分类、按销量取 top 5，专为 `recommend` 用
- `--top-n` CLI 参数（recommend 用）
- `INSTALL.md` 新增 `DEFAULT_LAT/LNG` 环境变量说明（避免账户无已存地址时首次调用 422）

### Changed

- **GUIDE.md 全量重写**：从骨架版升级为完整 playbook
  - 决策流 Step 1-6 + 后续消息决策树（"还有吗/别的看看"按上下文判断指代）
  - 推荐两段式气泡输出模板（信息块 + 决策块）+ 模板规则
  - 菜单单气泡分组模板（招牌/搭着吃）
  - Preview 朋友口吻一段话模板
  - 导购铁律：画像锚点 + 稳定维度轴 + 长对话不衰减
  - 并行 & 性能规则（addresses + recommend 并行、单轮 ≤8、menu 全程一次）
  - Checkpoint 显式列表（必停 vs 可默做）
  - 兜底场景表、时段感、语气规则（书面 → 口语对照）
  - 翻车实录 + Good/Bad case 对照
- 平台 SKILL.md（claude-code/codex/openclaw）action 表加 `recommend` 行，地址段落改为 token 流

### Fixed

- `addresses` 默认列表 + 关键词搜索分支：网关现在强制要求 lat/lng，加缓存 → DEFAULT 兜底
- `preview` 地址 hydrate 路径：同样的 lat/lng 兜底，避免 422
- `preview` 处理 saved 地址 lat/lng 为空的情况（eleme history hydrate 不带坐标），fallback 到 args/缓存/DEFAULT
- 删除死代码 `GatewayClient.list_addresses()`（端点 `/api/v1/addresses` 已不存在）

### Breaking

- `addresses --select-source poi/eleme_history` + `--poi-data` + `--eleme-address-id` 全部移除
  - 原因：网关 `/addresses/select` 已改为 token-based shape；旧路径本来就是 broken 状态
  - 替代：`addresses --select-token sug_xxx --contact-name X --contact-phone Y [--address-detail "..."] [--address-tag home]`
  - `--select-token` 来自上一次 `addresses --address-keyword` 返回的 suggestions[].token
  - 当 suggestion.requires_detail=true（POI 类）时，`--address-detail`（门牌/楼层）必填，否则后端 500

## [0.1.0] - 2026-04-10

### Added

- 初版 takeout 技能
- 6 actions：addresses, search, menu, preview, order, order_status
- 基于 urllib 的 GatewayClient（无第三方依赖）
- 文件缓存（addresses 30min / search 5min / menu 10min）
- Personal auth 模型（GATEWAY_URL + API_KEY + USER_TOKEN）
- 三平台支持：claude-code, openclaw, codex
