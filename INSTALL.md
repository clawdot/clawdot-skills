# ClawDot Skills — Installation Guide / 安装指引

## Quick Install (Shell)

```bash
curl -fsSL https://raw.githubusercontent.com/clawdot/clawdot-skills/main/install.sh | bash -s -- <skill> <platform>
```

**Available skills:**

| Skill | Platforms | Description |
|-------|-----------|-------------|
| takeout | claude-code, codex, openclaw | 外卖点餐（个人版） |
| takeout-superagent | openclaw | 外卖点餐（多用户超级 Agent） |

**Examples:**

```bash
# Install takeout for Claude Code
curl -fsSL https://raw.githubusercontent.com/clawdot/clawdot-skills/main/install.sh | bash -s -- takeout claude-code

# Install specific version
curl -fsSL https://raw.githubusercontent.com/clawdot/clawdot-skills/main/install.sh | bash -s -- takeout claude-code v0.1.0
```

---

## Manual Install (Agent Self-Execute / Agent 自执行)

If you are an AI agent, follow the steps for your platform below. All commands can be executed directly.

### Claude Code

```bash
# 1. Download the manifest to find the latest asset name, then download and extract
MANIFEST=$(curl -fsSL https://github.com/clawdot/clawdot-skills/releases/latest/download/manifest.json)
ASSET=$(echo "$MANIFEST" | python3 -c "import json,sys; print(json.load(sys.stdin)['skills']['takeout']['claude-code']['asset'])")
mkdir -p ~/.claude/skills/clawdot-takeout
curl -fsSL "https://github.com/clawdot/clawdot-skills/releases/latest/download/${ASSET}" | tar xz -C ~/.claude/skills/clawdot-takeout

# 2. Configure environment variables
# Add these to your shell profile or .env:
export GATEWAY_URL=<gateway-url>
export API_KEY=<api-key>
export USER_TOKEN=<user-token>

# 3. Verify installation
python3 ~/.claude/skills/clawdot-takeout/scripts/takeout.py --action addresses
```

### Codex

```bash
# 1. Download the manifest to find the latest asset name, then download and extract
MANIFEST=$(curl -fsSL https://github.com/clawdot/clawdot-skills/releases/latest/download/manifest.json)
ASSET=$(echo "$MANIFEST" | python3 -c "import json,sys; print(json.load(sys.stdin)['skills']['takeout']['codex']['asset'])")
curl -fsSL "https://github.com/clawdot/clawdot-skills/releases/latest/download/${ASSET}" | tar xz -C .

# 2. This creates AGENTS.md and scripts/ in your project
# 3. Configure environment variables before running Codex:
export GATEWAY_URL=<gateway-url>
export API_KEY=<api-key>
export USER_TOKEN=<user-token>
```

### OpenClaw

```bash
# 1. Download the manifest to find the latest asset name, then download and extract
MANIFEST=$(curl -fsSL https://github.com/clawdot/clawdot-skills/releases/latest/download/manifest.json)
ASSET=$(echo "$MANIFEST" | python3 -c "import json,sys; print(json.load(sys.stdin)['skills']['takeout']['openclaw']['asset'])")
mkdir -p ~/.openclaw/skills/clawdot-takeout
curl -fsSL "https://github.com/clawdot/clawdot-skills/releases/latest/download/${ASSET}" | tar xz -C ~/.openclaw/skills/clawdot-takeout

# 2. Configure environment variables in your OpenClaw workspace config
# Required: GATEWAY_URL, API_KEY, USER_TOKEN
```

---

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `GATEWAY_URL` | ClawDot Gateway API endpoint | Yes |
| `API_KEY` | ClawDot Gateway API key | Yes |
| `USER_TOKEN` | User authentication token (personal auth) | Yes (takeout) |
| `ADMIN_SECRET` | Admin secret for multi-user binding (superagent auth) | Yes (takeout-superagent) |

---

## Verifying Installation

After installation, verify by listing your saved addresses:

```bash
python3 <install-dir>/scripts/takeout.py --action addresses
```

A successful response returns JSON with your saved delivery addresses.
