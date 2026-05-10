# Changelog

## [0.3.0] - 2026-05-10

### Added

- **Agent 模式**：CLI 新增 `--phone <11 位手机号>` 参数。脚本内部 `resolve_token(phone)` 走 Redis → 文件缓存 → `trustedBind`（`POST /api/v1/user/bind/trusted`，带 `X-Admin-Secret`），自动完成 agent + 手机号绑定，token 按手机号分桶缓存 1 小时。
  - 不传 `--phone` 退化到原有 personal 模式（`USER_TOKEN` 环境变量），向后兼容
  - 新增 env：`ADMIN_SECRET`（agent 必须）、`REDIS_URL`（可选，跨进程共享 token）
  - `normalize_phone_for_trusted_bind` 自动剥掉 `+86` 前缀
  - 内置极简 `RedisTokenCache`（裸 socket，无 redis-py 依赖）
- **`addresses --city`**：城市参数支持（中文/拼音/缩写）；传了就覆盖历史坐标走 cityId 搜索，解决冷启动 + 跨城场景搜不到 POI 的问题
- **`order --channel`**：按 bot 渠道分发付款链路。`wechat` 走桥页面 URL（拉淘宝闪购小程序原生支付，避开微信封锁）；其他渠道走饿了么 H5 收银台
- **`menu --shop-keyword <菜名>`**：跨分类菜品模糊搜（复用 `--shop-keyword` dest，避免增加新参数）
- **结构化错误 playbook**（`ERROR_PLAYBOOK`）：stderr 现在输出"用户向翻译 + `RECOVERY[CODE]: <下一步具体调用>`"两行格式，覆盖 16 类常见错误（缺地址/起送/打烊/售罄/POI 无门牌/凑单未点等），让 LLM 一轮推理选好下一个 tool call
- **preview 模糊菜名自动恢复**：LLM 把中文菜名当 item_id 传时，脚本按名字模糊匹配；唯一命中静默 recovery，多候选则把 `needs_clarification` JSON 块附在 stderr 里，**不需要再 menu 一次**
- **MUST_PICK_REQUIRED 嵌入候选**：preview 触发"必选项未点"时，把 `required_categories`（带 item_id）一并嵌进 stderr，LLM 直接读这个块给用户选项即可
- **suggestions 字段 `token` → `sug_ref` 重命名**：避免被某些 agent 平台的密钥屏蔽器按关键字打码

### Changed

- `auth_model: personal` → `auth_model: personal_or_agent`，`USER_TOKEN` 改为可选
- `GatewayClient` 不再在构造时锁定 `user_token`，改为每次请求按需注入 `X-User-Token` / `X-Admin-Secret` header
- `addresses` 缓存键由全局 `addr:user` 改为 `addr:{phone or 'user'}`（personal 模式键不变；agent 模式按手机号分桶）
- `addresses select` 不再 `cache.delete + 强制重拉` 而是把新地址插到缓存头部，省掉 ~25s 的二次 round-trip
- `addresses` saved 列表加上 `last_used_at`、`use_count`、`detail`、`contact_*`、`tag` 字段，支持"上次送过 XX"对话路径
- `version` 0.2.0 → 0.3.0
- 三平台 SKILL.md 同步更新调用示例、环境变量列表
- GUIDE.md 增加 Step 0（token 解析）、🏙️ city 铁律、Step 4.5（饮品规格确认）、Step 6 channel 路由、preview 内置错误回收说明

### Backwards-compatible

- 旧用户的 `.env`（`GATEWAY_URL/API_KEY/USER_TOKEN/DEFAULT_LAT/LNG`）不动直接用：personal 模式不传 `--phone` 时行为与 0.2.0 一致
- `--shop-keyword` / `--keyword` / `--address-keyword` / `--search-keyword` 旧别名继续可用
- `DEFAULT_LAT/LNG` 仍是 personal 模式的冷启动兜底；agent 模式忽略

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
