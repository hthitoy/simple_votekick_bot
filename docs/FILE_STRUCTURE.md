# 📁 项目目录结构和文件映射

## 完整的项目结构

```
telegram-votekick-bot/
│
├── src/
│   ├── index.ts                    ✏️ 更新 - 处理新事件类型
│   ├── types.ts                    ✏️ 更新 - 添加新的类型定义
│   ├── telegram.ts                 ✏️ 更新 - 添加禁言/解禁 API
│   ├── renderService.ts            ✏️ 更新 - 添加验证相关 UI
│   ├── weightService.ts            ✏️ 更新 - 修复导入路径
│   ├── voteService.ts              ✏️ 更新 - 集成验证逻辑
│   │
│   ├── db/                         (数据库操作层)
│   │   ├── usersRepo.ts            ✏️ 更新 - 修复导入路径
│   │   ├── votesRepo.ts            ✏️ 更新 - 修复字段定义
│   │   ├── voteRecordsRepo.ts      ✏️ 更新 - 修复导入路径
│   │   └── verificationsRepo.ts    ✨ 新增 - 验证记录操作
│   │
│   └── services/                   (业务逻辑层)
│       ├── verificationService.ts  ✨ 新增 - 验证核心逻辑
│       ├── weightService.ts        ✏️ 更新 - 权重计算
│       └── (其他 service 通过主文件 import)
│
├── migrations/
│   ├── 0001_init.sql               ✅ 保留 - 初始表结构
│   └── 0002_add_verifications.sql  ✨ 新增 - 验证表结构
│
├── scripts/
│   └── set-webhook.js              ✅ 保留 - Webhook 配置脚本
│
├── wrangler.toml                   ✏️ 更新 - 添加验证配置开关
├── package.json                    ✅ 保留 - 无需修改
├── tsconfig.json                   ✅ 保留 - 无需修改
├── README.md                       ✏️ 更新 - 添加新功能说明
└── .gitignore (可选)               ✅ 保留


传说：
  ✨ 新增文件 (需要创建)
  ✏️  更新文件 (需要替换)
  ✅ 保留文件 (保持原样)
```

---

## 文件对应关系和导入链

### 核心流程

```
┌─ index.ts (入口)
│  ├─ TelegramAPI (telegram.ts)
│  └─ VoteService (voteService.ts)
│     ├─ VotesRepo (db/votesRepo.ts)
│     ├─ VoteRecordsRepo (db/voteRecordsRepo.ts)
│     ├─ UsersRepo (db/usersRepo.ts)
│     ├─ VerificationsRepo (db/verificationsRepo.ts) ✨ 新增
│     ├─ WeightService (services/weightService.ts)
│     ├─ RenderService (renderService.ts)
│     └─ VerificationService (services/verificationService.ts) ✨ 新增
│        ├─ VerificationsRepo (db/verificationsRepo.ts)
│        ├─ TelegramAPI (telegram.ts)
│        └─ RenderService (renderService.ts)
│
└─ types.ts (类型定义) - 被所有文件导入
```

---

## 数据库表关系

```sql
┌─────────────────────────────────────────────────────────┐
│                        users                            │
│  ─────────────────────────────────────────────────────  │
│  id, chat_id, user_id, username, first_name            │
│  weight, last_message_at, last_weight_update_at         │
│  joined_at                                              │
└─────────────────────────────────────────────────────────┘
           │
           │ user_id
           ├──────────┬──────────┐
           │          │          │
           ↓          ↓          ↓
┌──────────────────┐  │  ┌────────────────────┐
│  votes           │  │  │ user_verifications │ ✨
│ ──────────────   │  │  │ ──────────────────  │
│ vote_id          │  │  │ verification_id    │
│ target_user_id   │  │  │ chat_id            │
│ initiator_user_id│  │  │ user_id            │
│ message_id       │──┘  │ status (pending,   │
│ expires_at       │     │ verified, failed,  │
│ created_at       │     │ expired, banned)   │
│ yes_weight       │     │ message_id         │
│ no_weight        │     │ expires_at         │
│ threshold        │     │ verified_at        │
└──────────────────┘     └────────────────────┘
           │
           │ vote_id
           ↓
┌──────────────────────────┐
│  vote_records            │
│ ──────────────────────   │
│ id                       │
│ vote_id (FK→votes)       │
│ voter_user_id (FK→users) │
│ choice (yes/no)          │
│ vote_power               │
│ created_at               │
└──────────────────────────┘
```

---

## 关键文件对应的输出目录

在 `/mnt/user-data/outputs/` 中你会看到：

### 需要复制到 `src/` 的文件

```
src/ 目录：
  index.ts                      ← outputs/index.ts
  types.ts                      ← outputs/types.ts
  telegram.ts                   ← outputs/telegram.ts
  renderService.ts              ← outputs/renderService.ts
  voteService.ts                ← outputs/voteService.ts
  weightService.ts              ← outputs/weightService.ts
  
  db/:
    usersRepo.ts                ← outputs/usersRepo.ts
    votesRepo.ts                ← outputs/votesRepo.ts
    voteRecordsRepo.ts          ← outputs/voteRecordsRepo.ts
    verificationsRepo.ts        ← outputs/verificationsRepo.ts
  
  services/:
    verificationService.ts      ← outputs/verificationService.ts
```

### 需要复制到项目根目录的文件

```
项目根目录：
  wrangler.toml                 ← outputs/wrangler.toml
  README.md                     ← outputs/README.md
  
migrations/:
  0002_add_verifications.sql    ← outputs/0002_add_verifications.sql
```

---

## 导入路径速查表

### 在 `src/services/voteService.ts` 中

```typescript
// 来自同目录
import { WeightService } from './weightService';
import { RenderService } from './renderService';
import { VerificationService } from './verificationService';

// 来自 db 目录
import { VotesRepo } from '../db/votesRepo';
import { VoteRecordsRepo } from '../db/voteRecordsRepo';
import { UsersRepo } from '../db/usersRepo';
import { VerificationsRepo } from '../db/verificationsRepo';

// 来自上级目录
import { TelegramAPI } from '../telegram';
import { TelegramMessage, TelegramCallbackQuery, Env } from '../types';
```

### 在 `src/services/verificationService.ts` 中

```typescript
import { VerificationsRepo, DbVerification } from '../db/verificationsRepo';
import { TelegramAPI } from '../telegram';
import { RenderService } from './renderService';
import { Env } from '../types';
```

### 在 `src/db/verificationsRepo.ts` 中

```typescript
// 注意：DbVerification 定义在本文件中
export interface DbVerification { ... }

export class VerificationsRepo {
  constructor(private db: D1Database) {}
  // ...
}
```

---

## 类型定义位置

所有 TypeScript 接口和类型定义都在 `src/types.ts` 中：

```typescript
export interface Env { ... }
export interface TelegramUser { ... }
export interface TelegramChat { ... }
export interface TelegramMessage { ... }
export interface TelegramCallbackQuery { ... }
export interface TelegramUpdate { ... }
export interface DbUser { ... }
export interface DbVote { ... }
export interface DbVoteRecord { ... }
```

**例外**：`DbVerification` 定义在 `src/db/verificationsRepo.ts` 中（因为它只在那个文件用）

---

## 环境变量配置

在 `wrangler.toml` 的 `[vars]` 部分：

```toml
[vars]
VOTE_THRESHOLD = "20"
VOTE_DURATION_SECONDS = "300"
INITIATOR_COOLDOWN_SECONDS = "60"
TARGET_COOLDOWN_SECONDS = "180"
MIN_WEIGHT_TO_INITIATE = "1.0"
ENABLE_VERIFICATION = "1"                    # ✨ 新增
```

在代码中通过 `env.ENABLE_VERIFICATION` 访问

---

## 关键改动总结

### 删除的代码
- `prompt_message_id` 字段（不再使用）
- 某些不必要的日志语句

### 新增的代码
- `VerificationService` 类及其全部方法
- `VerificationsRepo` 类及其全部方法
- `my_chat_member` 事件处理
- `new_chat_members` 事件处理
- `/start` 私聊命令处理
- `/kick` 无效请求的静默处理（不报错）

### 修改的代码
- `handleMessage()` - 添加验证流程和 `/start` 处理
- `handleCallback()` - 添加验证回调处理
- `TelegramAPI` - 添加禁言/解禁方法
- `RenderService` - 添加验证相关渲染方法
- 所有 `Repository` - 修复导入路径

---

## 快速检查清单

部署前，确认以下内容：

- [ ] 所有文件都在正确的目录中
- [ ] 导入路径都指向正确的模块
- [ ] `types.ts` 中的所有接口都被正确导入
- [ ] `wrangler.toml` 中的数据库 ID 已填入
- [ ] 数据库迁移都已执行（包括新的 `0002_add_verifications.sql`）
- [ ] Bot Token 已通过 `npx wrangler secret put BOT_TOKEN` 设置
- [ ] 项目可以正常编译：`npx tsc --noEmit`

---

## 推荐的 IDE 设置

如果使用 VSCode，建议安装：

```json
{
  "extensions": [
    "esbenp.prettier-vscode",
    "dbaeumer.vscode-eslint",
    "ms-vscode.vscode-typescript-next"
  ],
  "typescript.enablePromptUseWorkspaceTsdk": true
}
```

---

## 调试技巧

### 查看实时日志

```bash
npx wrangler tail --follow
```

### 查看特定日期的日志

```bash
npx wrangler tail --start 2024-01-01T00:00:00Z
```

### 在本地测试

```bash
npm run dev
# 然后在另一个终端向 localhost 发送请求
curl -X POST http://localhost:8787 -H "Content-Type: application/json" -d '{...}'
```

### 查看数据库内容

```bash
# 查看所有待验证的用户
npx wrangler d1 execute votekick-db --remote \
  --command "SELECT * FROM user_verifications WHERE status='pending';"

# 查看某个用户的验证历史
npx wrangler d1 execute votekick-db --remote \
  --command "SELECT * FROM user_verifications WHERE user_id='123456789';"
```

---

好了！现在你已经拥有完整的实现指南。请按照 **IMPLEMENTATION_GUIDE.md** 中的步骤进行部署。
