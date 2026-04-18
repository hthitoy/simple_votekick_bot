# 🗳 Telegram VoteKick Bot

基于 Cloudflare Workers + D1 的群组加权投票踢人机器人。

---

## 📦 项目结构

```
telegram-votekick-bot/
├── src/
│   ├── index.ts                      # 入口文件（Webhook + Cron）
│   ├── telegram.ts                   # Telegram API 封装
│   ├── types.ts                      # TypeScript 类型定义
│   ├── renderService.ts              # UI 渲染
│   ├── db/
│   │   ├── usersRepo.ts              # 用户数据库操作
│   │   ├── votesRepo.ts              # 投票数据库操作
│   │   ├── voteRecordsRepo.ts        # 投票记录数据库操作
│   │   └── verificationsRepo.ts      # 验证记录数据库操作
│   └── services/
│       ├── voteService.ts            # 核心业务逻辑
│       ├── weightService.ts          # 权重计算
│       └── verificationService.ts    # 验证逻辑
├── migrations/
│   ├── 0001_init.sql                 # 初始数据库建表语句
│   └── 0002_add_verifications.sql    # 验证功能数据库扩展
├── scripts/
│   └── set-webhook.js                # 设置 Telegram Webhook 脚本
├── wrangler.toml                     # Cloudflare Workers 配置
├── package.json
└── tsconfig.json
```

---


## 部署步骤

### 第一步：准备工作

1. **注册 Cloudflare 账号**：https://cloudflare.com（免费）

2. **安装 Node.js**：https://nodejs.org（推荐 LTS 版本）

3. **创建 Telegram Bot**：
   * 在 Telegram 搜索 `@BotFather`
   * 发送 `/newbot`，按提示创建
   * 保存好 `Bot Token`（格式：`123456789:ABCdef...`）
   * 要在 `@BotFather`中给机器人群聊读取权限(Privacy)

4. **把 Bot 加入群组**，并给它管理员权限（需要踢人权限和禁言权限）

---

### 第二步：安装依赖

```bash
# 克隆或下载项目后进入目录
cd telegram-votekick-bot

# 安装依赖
npm install

# 登录 Cloudflare（会打开浏览器）
npx wrangler login
```

---

### 第三步：创建 D1 数据库

```bash
# 创建数据库（会输出 database_id）
npx wrangler d1 create votekick-db
```

复制输出的 `database_id`，填入 `wrangler.toml` 中：

```toml
[[d1_databases]]
binding = "DB"
database_name = "votekick-db"
database_id = "粘贴你的database_id到这里"
```

---

### 第四步：初始化数据库表

```bash
# 本地测试用（可选）
npm run db:init

# 线上正式环境（必须）
npm run db:init:remote

# 执行第二个迁移（添加验证表）
npx wrangler d1 execute votekick-db --remote --file=migrations/0002_add_verifications.sql
```

---

### 第五步：配置 Bot Token

```bash
# 设置 Bot Token（替换成你的真实 Token）
npx wrangler secret put BOT_TOKEN
# 输入你的 Token 后按回车
```

---

### 第六步：部署到 Cloudflare

```bash
npm run deploy
```

部署成功后会输出你的 Worker URL，格式：
`https://telegram-votekick-bot.你的用户名.workers.dev`

---

### 第七步：设置 Telegram Webhook

```bash
BOT_TOKEN=你的BotToken WORKER_URL=https://你的worker地址.workers.dev node scripts/set-webhook.js
```

---

## ✅ 使用方法

### 投票功能

在群里：

1. **右键点击**某个用户的消息 → **回复**
2. 在回复中发送 `/kick` 
3. 机器人会发起投票
4. 群成员点击按钮投票
5. 赞成票力达到阈值（默认20）自动踢人

### 私聊功能

私聊 Bot 发送 `/start` 获得使用指南

---

## ⚙️ 配置项（wrangler.toml）

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `VOTE_THRESHOLD` | `20` | 踢人所需票力阈值 |
| `VOTE_DURATION_SECONDS` | `300` | 投票有效时间（秒），默认5分钟 |
| `INITIATOR_COOLDOWN_SECONDS` | `60` | 发起人冷却时间（秒），默认1分钟 |
| `TARGET_COOLDOWN_SECONDS` | `180` | 同一目标冷却时间（秒），默认3分钟 |
| `MIN_WEIGHT_TO_INITIATE` | `1.0` | 发起投票最低信誉权重 |
| `ENABLE_VERIFICATION` | `1` | 是否启用人机验证（1=启用，0=禁用） |

---

## 📊 权重系统说明

**信誉更新公式：**
```
Weight = Weight_old × 98%^Δd + log(1 + Δt)
```
- `Δd` = 距上次更新天数（时间衰减）
- `Δt` = 距上次发言秒数（活跃奖励）

**投票权力：**
```
vote_power = √W
```

---
## ✨ 额外功能：群组人机验证(非入群验证)

### 功能说明

新成员加入群组时，会自动触发验证流程：

1. **新成员记录**：用户加入时记录在案
2. **首次消息验证**：用户首次发送消息时被禁言
3. **验证提示**：Bot 发送验证按钮提示`"I am not robot"`限时 1 分钟验证
4. **失败处理**：踢出用户并且禁言

### 工作流程

```
新成员加入群组
    ↓
记录到 user_verifications 表（pending 状态）
    ↓
用户首次发消息
    ↓
检查是否需要验证 → 禁言用户，发送验证按钮
    ↓
用户点击 "I am not robot" 按钮
    ├─ 是 → 更新状态为 verified，解除禁言 ✅
    └─ 否
        ↓
    1分钟后过期（Cron 处理）
        ├─ 第一次失败 → 踢出用户
        └─ 第二次失败 → 永久封禁
```

### 配置

在 `wrangler.toml` 中：

```toml
[vars]
ENABLE_VERIFICATION = "1"    # 1 = 启用，0 = 禁用
```

---


## 🛡️ 防滥用机制

**投票相关：**
- ❌ 管理员/群主不能被踢，不能参与投票
- ❌ 不能对机器人发起投票
- ❌ 不能对自己发起投票
- ❌ 同一用户不能重复投票
- ❌ 发起人冷却时间保护
- ❌ 同一目标冷却时间保护

**验证相关：**
- ✅ 新成员自动验证（可关闭）
- ✅ 1分钟验证时限
- ✅ 首次失败自动踢出
- ✅ 二次失败永久封禁
- ✅ 已验证成员直接通过

---

## ❓ 常见问题

**Q: Bot 没反应？**
- 确认 Bot 有管理员权限
- 确认 Webhook 设置成功（`set-webhook.js` 返回 `ok: true`）
- 检查 Cloudflare Workers 日志：`npx wrangler tail`

**Q: 验证功能怎么关闭？**
在 `wrangler.toml` 中将 `ENABLE_VERIFICATION` 改为 `0`

**Q: 无法踢人？**
- 确认 Bot 在群里有"踢出用户"权限
- 确认 Bot 有"限制用户"权限（用于禁言）
- 群主无法被踢（Telegram 限制）

**Q: 怎么查看日志？**
```bash
npx wrangler tail
```

**Q: 验证消息没有删除怎么办？**
这是正常的。系统设计中，验证失败时只删除验证消息，用户的消息保留（这样可以追踪用户行为）。

---

## 许可证

本项目基于 **GNU 通用公共许可证 v2 (GPL-2.0)** 开源。详见 [LICENSE](./LICENSE)。

**要点：**
- 免费使用和修改
- 分发时必须提供源代码
- 衍生作品必须以相同许可证分发

---

## 写在后面

可以直接把仓库打包下来喂给 AI 让它部署(((
