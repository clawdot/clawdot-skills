# clawdot.skills

ClawDot 对外输出的 AI Agent 技能集合。

## 技能列表

| 技能 | 说明 | Auth 模型 | 平台 |
|------|------|-----------|------|
| [takeout](skills/takeout/) | 外卖点餐（搜店、选菜、下单、查单） | personal | Claude Code, OpenClaw, Codex |
| [takeout-superagent](skills/takeout-superagent/) | 外卖点餐（超级 Agent，多用户） | superagent | OpenClaw |

## 目录结构

```
skills/
└── <skill-name>/
    ├── skill.yaml              # 技能元数据（名称、版本、依赖、能力声明）
    ├── GUIDE.md                # 交互指南（平台无关，技能的"灵魂"）
    ├── scripts/                # 执行脚本
    ├── evals/                  # 评测用例
    └── platforms/              # 平台适配层
        ├── claude-code/
        │   └── SKILL.md        # Claude Code 格式（frontmatter + {{GUIDE}} + 调用方式）
        ├── openclaw/
        │   └── SKILL.md        # OpenClaw 格式
        └── codex/
            └── AGENTS.md       # Codex 格式
```

### 关键文件说明

- **skill.yaml** — 技能的"身份证"。声明名称、版本、依赖、能力列表、支持的平台。CI 构建和安装工具读取此文件。
- **GUIDE.md** — 平台无关的交互指南。定义技能的人格、对话风格、工作流程。这是技能的核心，改交互逻辑只需改这一个文件。
- **platforms/\*/SKILL.md** — 平台适配模板。包含平台特定的 frontmatter 和调用语法，通过 `{{GUIDE}}` 标记引用 GUIDE.md 内容。构建时自动拼装。

## 构建

```bash
# 构建所有技能的所有平台变体
python3 build.py

# 构建指定技能
python3 build.py takeout

# 查看可用技能
python3 build.py --list
```

构建产物输出到 `dist/`，每个 `<skill>-<platform>/` 目录是一个自包含的可部署技能包。

## Auth 模型

| 模型 | 说明 | 典型配置 |
|------|------|----------|
| **personal** | 一个 agent 绑定一个用户，直接使用 user token | `GATEWAY_URL` + `API_KEY` + `USER_TOKEN` |
| **superagent** | 一个 agent 服务多个用户，通过 admin secret 动态绑定 | `GATEWAY_URL` + `API_KEY` + `ADMIN_SECRET` |

## 添加新技能

1. 在 `skills/` 下创建技能目录
2. 编写 `skill.yaml`（参考现有技能）
3. 编写 `GUIDE.md`（交互指南）
4. 在 `platforms/` 下为每个目标平台创建适配模板
5. 运行 `python3 build.py <name>` 验证构建
