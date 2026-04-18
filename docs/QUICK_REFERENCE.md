# 🎯 快速参考卡片

## 功能速查

| 功能 | 触发条件 | 执行者 | 结果 |
|------|--------|--------|------|
| **新成员验证** | 成员加入群组 | Bot (自动) | 创建待验证记录 |
| **验证提示** | 新成员首次发消息 | Bot (自动) | 禁言用户+发送按钮 |
| **验证成功** | 用户点击"I am not robot" | 用户 | 解除禁言+更新状态 |
| **验证失败(1)** | 1分钟后未验证 | Cron (自动) | 踢出用户 |
| **验证失败(2)** | 二次加入还未验证 | Cron (自动) | 永久 Ban 用户 |
| **发起投票** | 用户回复消息+/kick | 用户 | 创建投票 |
| **投票** | 用户点击⬆️/⬇️ | 用户 | 记录票数 |
| **投票结束** | 达到阈值或超时 | Cron (自动) | 踢出或保留用户 |
| **查看指南** | 私聊/start | 用户 | Bot返回指南 |

---

## API 端点变化

### 新增回调数据格式

验证按钮回调：
```
callback_data: "verify:{verification_id}"
```

投票按钮回调：
```
callback_data: "vote:{vote_id}:yes"
callback_data: "vote:{vote_id}:no"
```

### 新增 Webhook 事件

```json
{
  "my_chat_member": {
    "chat": { "id": -1001234567890 },
    "from": { "id": 123456789, ... },
    "new_chat_member": { "status": "member" },
    "old_chat_member": { "status": "left" }
  }
}
```

```json
{
  "message": {
    "chat": { "id": -1001234567890 },
    "new_chat_members": [
      { "id": 987654321, "first_name": "New User", ... }
    ]
  }
}
```

---

## 数据库查询速查

### 查看待验证用户

```sql
SELECT * FROM user_verifications 
WHERE chat_id = '{chat_id}' AND status = 'pending'
ORDER BY expires_at ASC;
```

### 查看某个用户的验证状态

```sql
SELECT * FROM user_verifications 
WHERE chat_id = '{chat_id}' AND user_id = '{user_id}'
ORDER BY created_at DESC
LIMIT 1;
```

### 查看已被 Ban 的用户

```sql
SELECT * FROM user_verifications 
WHERE chat_id = '{chat_id}' AND status = 'banned';
```

### 查看过期的待验证用户（需要处理）

```sql
SELECT * FROM user_verifications 
WHERE status = 'pending' 
AND expires_at < unixepoch()
ORDER BY expires_at ASC;
```

### 查看验证成功的用户

```sql
SELECT * FROM user_verifications 
WHERE chat_id = '{chat_id}' AND status = 'verified'
ORDER BY verified_at DESC;
```

---

## 环境变量参考

### 验证相关

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `ENABLE_VERIFICATION` | `1` | 1=启用，0=禁用 |
| 验证时长 | 60秒 | 硬编码在代码中 |

### 投票相关

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `VOTE_THRESHOLD` | `20` | 踢人所需票力 |
| `VOTE_DURATION_SECONDS` | `300` | 投票持续时间 |
| `INITIATOR_COOLDOWN_SECONDS` | `60` | 发起人冷却 |
| `TARGET_COOLDOWN_SECONDS` | `180` | 目标冷却 |
| `MIN_WEIGHT_TO_INITIATE` | `1.0` | 最低权重 |

---

## 时间线图

```
新成员加入群组
    ↓ (记录)
用户在 user_verifications 中创建 pending 记录
    ↓
用户首次发消息 
    ↓ (检查)
bot 检查用户是否需要验证
    ↓
    ├─ 是 → 禁言 + 发送验证按钮 + 倒计时 60 秒开始
    │         ↓
    │    用户点击按钮 ✓
    │         ↓
    │    status = 'verified' + 解禁 + 编辑消息
    │
    └─ 否 → 允许发消息，继续处理其他逻辑

[Cron 每分钟执行一次]
检查过期的 pending 记录
    ↓
    ├─ 第一次失败 → status = 'failed' + 踢出用户
    │
    └─ 第二次失败 → status = 'banned' + 永久 Ban
```

---

## 常见错误排查

### 错误 1：Bot 不能禁言

```
❌ 表现：用户仍然能在验证时发消息
✅ 解决：检查 Bot 在群里是否有"Restrict Members"权限
```

### 错误 2：验证按钮没有反应

```
❌ 表现：点击按钮后没有任何反应
✅ 解决：
  1. 检查 callback_data 格式是否为 "verify:{verification_id}"
  2. 查看日志：npx wrangler tail
  3. 确认 verification_id 存在于数据库
```

### 错误 3：用户没有被踢出

```
❌ 表现：验证失败后用户仍在群里
✅ 解决：
  1. 检查 Bot 是否有"Ban Members"权限
  2. 查看数据库中 user_verifications 表的 status 是否更新
  3. 检查 Cron 是否执行：npx wrangler tail | grep "cron"
```

### 错误 4：Cron 没有执行

```
❌ 表现：日志中看不到 [cron] 消息
✅ 解决：
  1. 确认 wrangler.toml 中有 [triggers] 部分
  2. 检查 crons = ["*/1 * * * *"]
  3. 重新部署：npm run deploy
  4. 等待 1-2 分钟后查看日志
```

### 错误 5：导入错误 - Module not found

```
❌ 错误信息：Cannot find module './verificationsRepo'
✅ 解决：
  1. 检查文件是否在正确的目录
  2. 检查导入路径是否正确
  3. 检查文件名大小写是否匹配
  4. 运行 npx tsc --noEmit 检查编译错误
```

---

## 权限检查清单

部署前，确保 Bot 在群里拥有以下权限：

- [ ] **Send Messages** (发送消息)
- [ ] **Edit Messages** (编辑消息)
- [ ] **Delete Messages** (删除消息)
- [ ] **Restrict Members** (限制成员 - 用于禁言)
- [ ] **Ban Members** (封禁成员)
- [ ] **Manage Group** (管理群组)

在群里对话：
```
/setpermissions @bot_username

然后授予上述所有权限
```

---

## 命令速查

### 部署相关

```bash
# 检查项目编译错误
npx tsc --noEmit

# 本地开发
npm run dev

# 部署到线上
npm run deploy

# 设置 Webhook
BOT_TOKEN=xxx WORKER_URL=https://xxx.workers.dev node scripts/set-webhook.js
```

### 数据库相关

```bash
# 列出所有数据库
npx wrangler d1 list

# 执行迁移
npx wrangler d1 execute votekick-db --remote --file=migrations/0002_add_verifications.sql

# 执行查询
npx wrangler d1 execute votekick-db --remote --command "SELECT * FROM users LIMIT 1;"

# 导出数据
npx wrangler d1 execute votekick-db --remote --json > backup.json
```

### 日志相关

```bash
# 实时日志
npx wrangler tail

# 带时间戳的日志
npx wrangler tail --format pretty

# 特定时间段的日志
npx wrangler tail --start 2024-01-01T00:00:00Z --end 2024-01-01T01:00:00Z
```

---

## 测试脚本示例

### 测试 Webhook 接收

```bash
curl -X POST https://your-worker.workers.dev \
  -H "Content-Type: application/json" \
  -d '{
    "update_id": 123456789,
    "message": {
      "message_id": 1,
      "from": {
        "id": 987654321,
        "is_bot": false,
        "first_name": "Test User",
        "username": "testuser"
      },
      "chat": {
        "id": -1001234567890,
        "type": "group"
      },
      "text": "/start"
    }
  }'
```

### 测试新成员加入

```bash
curl -X POST https://your-worker.workers.dev \
  -H "Content-Type: application/json" \
  -d '{
    "update_id": 123456790,
    "message": {
      "message_id": 2,
      "chat": {
        "id": -1001234567890,
        "type": "group"
      },
      "new_chat_members": [
        {
          "id": 111111111,
          "is_bot": false,
          "first_name": "New Member",
          "username": "newmember"
        }
      ]
    }
  }'
```

### 测试回调查询

```bash
curl -X POST https://your-worker.workers.dev \
  -H "Content-Type: application/json" \
  -d '{
    "update_id": 123456791,
    "callback_query": {
      "id": "callback_id_123",
      "from": {
        "id": 987654321,
        "is_bot": false,
        "first_name": "Test User"
      },
      "message": {
        "message_id": 10,
        "chat": {
          "id": -1001234567890,
          "type": "group"
        }
      },
      "data": "verify:vrfy_1234567890_abc123def"
    }
  }'
```

---

## 监控和告警建议

建议监控以下指标：

1. **Cron 执行频率**
   - 预期：每分钟执行一次
   - 告警：如果 5 分钟内没有执行

2. **验证成功率**
   - 计算：verified / (verified + failed + banned)
   - 告警：如果低于 50%

3. **错误日志**
   - 关键词：ERROR, Failed, Exception
   - 告警：出现任何错误

4. **数据库查询延迟**
   - 预期：< 100ms
   - 告警：> 500ms

---

## 性能优化建议

### 短期 (马上可以做)

1. **增加数据库索引**
   ```sql
   CREATE INDEX idx_verifications_pending ON user_verifications(status, expires_at)
   WHERE status = 'pending';
   ```

2. **调整 Cron 频率**（如果查询量大）
   ```toml
   # 从每分钟改为每 5 分钟
   crons = ["*/5 * * * *"]
   ```

3. **批量处理过期记录**（而不是逐个处理）

### 长期 (需要重构)

1. **添加 Redis 缓存**已验证用户
2. **使用消息队列**处理异步任务
3. **分库分表**支持更大的群组
4. **添加告警系统**监控异常

---

好的，所有的参考资料都已生成！请查看输出目录中的所有文件。
