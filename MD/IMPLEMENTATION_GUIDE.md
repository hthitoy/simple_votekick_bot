# 🚀 VoteKick Bot 新功能实现指南

## 📋 实现概览

本次更新添加了以下功能：

### ✨ 新功能

1. **群组人机验证系统** 
   - 新成员自动验证
   - 首次发消息时触发验证
   - 1分钟验证时限
   - 多次失败处理（第一次踢出，第二次永久ban）

2. **改进的命令处理**
   - `/kick` 命令无效请求直接无视（不报错）
   - `/start` 私聊命令返回使用指南

3. **更强的事件处理**
   - 支持 `my_chat_member` 事件
   - 支持 `new_chat_members` 事件
   - 更完善的消息过滤逻辑

---

## 📁 文件清单和替换说明

下面是所有需要修改/新增的文件。请按照目录结构放置它们：

### **必需替换的文件**

```
src/
├── index.ts                                    ✏️ 替换
├── types.ts                                    ✏️ 替换
├── telegram.ts                                 ✏️ 替换
├── renderService.ts                            ✏️ 替换
├── voteService.ts                              ✏️ 替换
├── weightService.ts                            ✏️ 替换
├── db/
│   ├── usersRepo.ts                           ✏️ 替换
│   ├── votesRepo.ts                           ✏️ 替换
│   ├── voteRecordsRepo.ts                     ✏️ 替换
│   └── verificationsRepo.ts                   ✨ 新增
└── services/
    ├── verificationService.ts                 ✨ 新增
    └── (其他 service 文件通过 imports 使用)

migrations/
├── 0001_init.sql                              ✅ 保留不变
└── 0002_add_verifications.sql                 ✨ 新增

wrangler.toml                                  ✏️ 替换
README.md                                      ✏️ 替换
```

---

## 🔧 安装步骤

### 1️⃣ 备份现有项目

```bash
cp -r telegram-votekick-bot telegram-votekick-bot.backup
```

### 2️⃣ 更新源代码文件

#### 替换这些文件：
- `src/index.ts`
- `src/types.ts`
- `src/telegram.ts`
- `src/renderService.ts`
- `src/voteService.ts`
- `src/weightService.ts`
- `src/db/usersRepo.ts`
- `src/db/votesRepo.ts`
- `src/db/voteRecordsRepo.ts`
- `wrangler.toml`
- `README.md`

#### 新增这些文件：
- `src/db/verificationsRepo.ts`
- `src/services/verificationService.ts`
- `migrations/0002_add_verifications.sql`

### 3️⃣ 更新数据库

```bash
# 执行新的迁移脚本（添加验证表）
npx wrangler d1 execute votekick-db --remote --file=migrations/0002_add_verifications.sql
```

### 4️⃣ 部署

```bash
npm run deploy
```

---

## 🎯 关键代码变更说明

### 入口文件 (`index.ts`)

**新增事件处理：**

```typescript
// 处理新成员加入
if (update.message?.new_chat_members && update.message.new_chat_members.length > 0) {
  await service.handleNewChatMember(update.message);
}

// 处理 my_chat_member 事件（可选）
else if (update.my_chat_member) {
  console.log('[my_chat_member]', { ... });
}
```

**新增 Cron 处理：**

```typescript
async scheduled(_event: ScheduledEvent, env: Env): Promise<void> {
  // 处理过期的验证
  await service.processExpiredVerifications();
  
  // 处理过期的投票
  await service.processExpiredVotes();
}
```

### 类型定义 (`types.ts`)

**新增类型：**

```typescript
interface TelegramUpdate {
  // ... 其他字段
  my_chat_member?: {
    chat: TelegramChat;
    from: TelegramUser;
    date: number;
    new_chat_member: TelegramChatMember;
    old_chat_member: TelegramChatMember;
  };
}

interface Env {
  // ... 其他字段
  ENABLE_VERIFICATION: string; // '1' 或 '0'
}
```

### Telegram API (`telegram.ts`)

**新增方法：**

```typescript
// 禁言用户
async restrictChatMember(chatId, userId, untilDate?)

// 解除禁言
async unrestrictChatMember(chatId, userId)

// Ban 用户
async banChatMember(chatId, userId, revokeMessages = true)
```

### 验证服务 (`verificationService.ts`)

核心方法：

```typescript
// 处理新成员
async handleNewChatMember(chatId, userId, userName, firstName)

// 检查是否需要验证
async shouldVerifyUser(chatId, userId): boolean

// 发送验证提示
async sendVerificationPrompt(chatId, userId)

// 处理验证回调
async handleVerificationCallback(verificationId, chatId, userId, callbackQueryId)

// 处理过期验证
async processExpiredVerifications()
```

### 投票服务 (`voteService.ts`)

**修改的 `handleMessage` 方法：**

```typescript
// 支持 /start 私聊命令
if (chat.type === 'private' && rawText.startsWith('/start')) {
  const guide = this.renderService.renderStartGuide();
  await this.tg.sendMessage(chatId, guide);
  return;
}

// 验证流程
if (this.enableVerification) {
  const shouldVerify = await this.verificationService.shouldVerifyUser(chatId, userId);
  if (shouldVerify) {
    await this.tg.restrictChatMember(chatId, userId);
    await this.verificationService.sendVerificationPrompt(chatId, userId);
    return;
  }
}

// 无效的 /kick 请求直接无视
if (!replyMsg?.from) {
  return; // 不报错，直接返回
}
```

**修改的 `handleCallback` 方法：**

```typescript
// 支持验证回调
if (action === 'verify') {
  const verificationId = rest[0];
  await this.verificationService.handleVerificationCallback(...);
  return;
}

// 支持投票回调
if (action === 'vote' && rest.length === 2) {
  // 原有的投票逻辑
}
```

### 渲染服务 (`renderService.ts`)

**新增方法：**

```typescript
// 验证提示消息
renderVerificationPrompt(): string

// 验证成功消息
renderVerificationSuccess(): string

// 验证按钮
buildVerificationKeyboard(verificationId)

// 使用指南
renderStartGuide(): string
```

---

## ⚙️ 配置项

在 `wrangler.toml` 中添加：

```toml
[vars]
ENABLE_VERIFICATION = "1"          # 1 = 启用，0 = 禁用
```

验证相关的其他配置（在代码中硬编码）：

```typescript
const verificationDuration = 60;   // 1 分钟
```

---

## 🧪 测试清单

部署后请测试以下场景：

### 验证系统
- [ ] 新成员加入群组时是否被记录
- [ ] 新成员首次发消息时是否被禁言并收到验证按钮
- [ ] 点击验证按钮后是否成功解除禁言
- [ ] 1分钟后未验证的用户是否被踢出
- [ ] 第二次加入群组未验证是否被永久ban
- [ ] 已验证的成员是否不需要再验证

### 投票系统
- [ ] 无效的 `/kick` 请求是否直接无视（不报错）
- [ ] 有效的 `/kick` 请求是否正常发起投票
- [ ] 投票流程是否正常

### 私聊功能
- [ ] 私聊发送 `/start` 是否返回使用指南
- [ ] 指南中的格式和信息是否正确

---

## 📊 数据库模式

### 新增表：`user_verifications`

```sql
CREATE TABLE user_verifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  verification_id TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending',  -- 'pending','verified','failed','expired','banned'
  failure_count INTEGER NOT NULL DEFAULT 0,
  message_id INTEGER,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  verified_at INTEGER,
  UNIQUE(chat_id, user_id, status) WHERE status = 'pending'
);
```

**索引：**
- `chat_id, status`
- `chat_id, user_id`
- `expires_at`

---

## 🐛 故障排除

### 问题：验证消息没有删除

**预期行为**：
- 验证失败时，验证消息被删除
- 用户原本的消息保留（用于追踪）

这是设计的一部分。

### 问题：某些用户无法验证

**可能原因**：
- Bot 缺少禁言权限
- Bot 缺少删除消息权限
- 网络问题导致权限更新失败

**解决**：
1. 检查 Bot 在群里是否有足够的管理员权限
2. 查看 Cloudflare Workers 日志：`npx wrangler tail`
3. 尝试重新邀请 Bot 并重新授予权限

### 问题：Cron 任务没有执行

**可能原因**：
- Cloudflare Workers 的 Cron 触发器未正确配置
- 数据库连接错误

**解决**：
1. 确认 `wrangler.toml` 中的 Cron 配置：`crons = ["*/1 * * * *"]`
2. 查看日志确认 Cron 是否执行

---

## 📈 性能优化建议

1. **验证过期检查频率**：
   - 当前：每分钟检查一次
   - 可调整为：`*/5 * * * *`（5分钟）来减少数据库查询

2. **批量处理**：
   - 目前是逐个处理过期验证
   - 可优化为批量更新

3. **缓存**：
   - 可添加 Redis 缓存已验证用户的信息

---

## 🔐 安全性考虑

1. **防刷屏**：
   - 新成员被禁言期间无法发送消息
   - 已被 ban 的用户无法重新加入

2. **隐私**：
   - 验证信息只在 D1 数据库中存储
   - 不会泄露到第三方

3. **权限管理**：
   - 只有 Bot 本身可以修改自己的权限
   - 不会影响其他用户或管理员

---

## 📞 获得帮助

如果遇到问题：

1. 查看 Cloudflare Workers 日志：
   ```bash
   npx wrangler tail
   ```

2. 检查数据库内容：
   ```bash
   npx wrangler d1 execute votekick-db --remote --command "SELECT * FROM user_verifications LIMIT 5;"
   ```

3. 验证 Webhook 设置：
   ```bash
   BOT_TOKEN=你的token node scripts/set-webhook.js
   ```

---

## ✅ 完成清单

- [ ] 所有文件已复制到正确的目录
- [ ] 数据库迁移已执行
- [ ] Bot Token 已设置
- [ ] Worker 已部署
- [ ] Webhook 已配置
- [ ] 测试场景已验证
- [ ] 所有功能正常工作
