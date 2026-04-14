# ClawDot Skills — Agent 安装指引

> 本文件面向 AI Agent。如果你是 Agent，直接按下方步骤执行即可完成技能安装。
> 人类用户请参考 README.md 中的安装说明。

## 安装步骤

### 1. 确定你的平台

| 平台 | 安装位置 | 技能文件 |
|------|----------|----------|
| Claude Code | `~/.claude/skills/clawdot-<skill>/` | SKILL.md |
| Codex | 项目根目录 | AGENTS.md |
| OpenClaw | `~/.openclaw/skills/clawdot-<skill>/` | SKILL.md |

### 2. 执行安装

运行以下命令（以 `takeout` 技能为例，替换 `<skill>` 和平台路径即可安装其他技能）：

**Claude Code:**

```bash
curl -fsSL https://raw.githubusercontent.com/clawdot/clawdot-skills/main/install.sh | bash -s -- takeout claude-code
```

**Codex（在项目根目录执行）:**

```bash
curl -fsSL https://raw.githubusercontent.com/clawdot/clawdot-skills/main/install.sh | bash -s -- takeout codex
```

**OpenClaw:**

```bash
curl -fsSL https://raw.githubusercontent.com/clawdot/clawdot-skills/main/install.sh | bash -s -- takeout openclaw
```

安装脚本会自动从最新 Release 下载对应平台的技能包，校验 sha256 后解压到正确位置。

### 3. 配置环境变量

安装完成后需要配置以下环境变量：

| 变量 | 说明 | 必需 |
|------|------|------|
| `GATEWAY_URL` | ClawDot Gateway API 地址 | 是 |
| `API_KEY` | ClawDot Gateway API 密钥 | 是 |
| `USER_TOKEN` | 用户鉴权令牌（personal 模式） | takeout |
| `DEFAULT_LAT` | 默认配送纬度（无已存地址且未传 --lat 时使用） | 推荐 |
| `DEFAULT_LNG` | 默认配送经度（无已存地址且未传 --lng 时使用） | 推荐 |

环境变量也可以放在 `<安装目录>/.env` 文件里，脚本会自动加载。

### 4. 验证安装

```bash
python3 <安装目录>/scripts/takeout.py --action addresses
```

返回 JSON 格式的地址列表（含 saved + suggestions）即安装成功。
如果返回"无法确定浏览位置"错误，说明 `DEFAULT_LAT/LNG` 没配置且账户下还没有任何已保存地址。

## 可用技能

| 技能 | 平台 | 说明 |
|------|------|------|
| `takeout` | claude-code, codex, openclaw | 外卖点餐（个人版） |

## 安装指定版本

```bash
curl -fsSL https://raw.githubusercontent.com/clawdot/clawdot-skills/main/install.sh | bash -s -- takeout claude-code v0.1.0
```

## 手动安装（不使用安装脚本）

如果无法执行 install.sh，可以手动操作：

```bash
# 1. 获取 manifest 找到最新包名
MANIFEST=$(curl -fsSL https://github.com/clawdot/clawdot-skills/releases/latest/download/manifest.json)
ASSET=$(echo "$MANIFEST" | python3 -c "import json,sys; print(json.load(sys.stdin)['skills']['takeout']['claude-code']['asset'])")

# 2. 下载并解压（以 Claude Code 为例）
mkdir -p ~/.claude/skills/clawdot-takeout
curl -fsSL "https://github.com/clawdot/clawdot-skills/releases/latest/download/${ASSET}" | tar xz -C ~/.claude/skills/clawdot-takeout

# 3. 配置环境变量后验证
python3 ~/.claude/skills/clawdot-takeout/scripts/takeout.py --action addresses
```
