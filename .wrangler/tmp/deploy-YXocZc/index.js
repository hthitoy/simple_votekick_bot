var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// telegram.ts
var TelegramAPI = class {
  constructor(token) {
    this.token = token;
    this.baseUrl = `https://api.telegram.org/bot${token}`;
  }
  baseUrl;
  async call(method, body) {
    try {
      const res = await fetch(`${this.baseUrl}/${method}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const json = await res.json();
      if (!json.ok) {
        console.error(`Telegram API error [${method}]`, json.description, body);
        return null;
      }
      return json.result ?? null;
    } catch (err) {
      console.error(`Telegram API network error [${method}]`, err);
      return null;
    }
  }
  // ─────────────────────────────────────────────
  async sendMessage(chatId, text, extra = {}) {
    return this.call("sendMessage", {
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      ...extra
    });
  }
  // ─────────────────────────────────────────────
  async editMessageText(chatId, messageId, text, extra = {}) {
    const res = await this.call("editMessageText", {
      chat_id: chatId,
      message_id: messageId,
      text,
      parse_mode: "HTML",
      ...extra
    });
    return !!res;
  }
  // ─────────────────────────────────────────────
  async answerCallbackQuery(callbackQueryId, text, showAlert = false) {
    await this.call("answerCallbackQuery", {
      callback_query_id: callbackQueryId,
      text,
      show_alert: showAlert
    });
  }
  // ─────────────────────────────────────────────
  async kickChatMember(chatId, userId) {
    const res = await this.call("banChatMember", {
      chat_id: chatId,
      user_id: userId,
      revoke_messages: false
    });
    return !!res;
  }
  async banChatMember(chatId, userId, revokeMessages = true) {
    const res = await this.call("banChatMember", {
      chat_id: chatId,
      user_id: userId,
      revoke_messages: revokeMessages
    });
    return !!res;
  }
  async unbanChatMember(chatId, userId) {
    const res = await this.call("unbanChatMember", {
      chat_id: chatId,
      user_id: userId,
      only_if_banned: true
    });
    return !!res;
  }
  /**
   * 禁言用户（不允许发送消息）
   * permissions: 用户权限对象，都设为 false 表示禁言
   */
  async restrictChatMember(chatId, userId, untilDate) {
    const res = await this.call("restrictChatMember", {
      chat_id: chatId,
      user_id: userId,
      permissions: {
        can_send_messages: false,
        can_send_media_messages: false,
        can_send_polls: false,
        can_send_other_messages: false,
        can_add_web_page_previews: false,
        can_change_info: false,
        can_invite_users: false,
        can_pin_messages: false
      },
      until_date: untilDate
    });
    return !!res;
  }
  /**
   * 解除禁言 - 恢复用户的所有权限
   */
  async unrestrictChatMember(chatId, userId) {
    const res = await this.call("restrictChatMember", {
      chat_id: chatId,
      user_id: userId,
      permissions: {
        can_send_messages: true,
        can_send_media_messages: true,
        can_send_polls: true,
        can_send_other_messages: true,
        can_add_web_page_previews: true,
        can_change_info: true,
        can_invite_users: true,
        can_pin_messages: true
      }
    });
    return !!res;
  }
  // ─────────────────────────────────────────────
  async getChatMember(chatId, userId) {
    return this.call("getChatMember", {
      chat_id: chatId,
      user_id: userId
    });
  }
  // ─────────────────────────────────────────────
  async deleteMessage(chatId, messageId) {
    const res = await this.call("deleteMessage", {
      chat_id: chatId,
      message_id: messageId
    });
    return !!res;
  }
};
__name(TelegramAPI, "TelegramAPI");

// votesRepo.ts
var VotesRepo = class {
  constructor(db) {
    this.db = db;
  }
  async getVote(voteId) {
    const result = await this.db.prepare("SELECT * FROM votes WHERE vote_id = ?").bind(voteId).first();
    return result ?? null;
  }
  async getActiveVoteForTarget(chatId, targetUserId) {
    const result = await this.db.prepare("SELECT * FROM votes WHERE chat_id = ? AND target_user_id = ? AND status = 'active'").bind(chatId, targetUserId).first();
    return result ?? null;
  }
  async getActiveVoteForChat(chatId) {
    const result = await this.db.prepare("SELECT * FROM votes WHERE chat_id = ? AND status = 'active' LIMIT 1").bind(chatId).first();
    return result ?? null;
  }
  async getLastVoteByInitiator(chatId, initiatorUserId) {
    const result = await this.db.prepare("SELECT * FROM votes WHERE chat_id = ? AND initiator_user_id = ? ORDER BY created_at DESC LIMIT 1").bind(chatId, initiatorUserId).first();
    return result ?? null;
  }
  async getLastVoteForTarget(chatId, targetUserId) {
    const result = await this.db.prepare("SELECT * FROM votes WHERE chat_id = ? AND target_user_id = ? ORDER BY created_at DESC LIMIT 1").bind(chatId, targetUserId).first();
    return result ?? null;
  }
  async createVote(vote) {
    const now = Math.floor(Date.now() / 1e3);
    await this.db.prepare(`
        INSERT INTO votes
          (vote_id, chat_id, target_user_id, target_username, target_first_name,
           initiator_user_id, initiator_username, initiator_message_id, target_message_id,
           yes_weight, no_weight, threshold, status, quoted_text, message_id, expires_at, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, 'active', ?, ?, ?, ?)
      `).bind(
      vote.vote_id,
      vote.chat_id,
      vote.target_user_id,
      vote.target_username,
      vote.target_first_name,
      vote.initiator_user_id,
      vote.initiator_username,
      vote.initiator_message_id ?? null,
      vote.target_message_id ?? null,
      vote.threshold,
      vote.quoted_text,
      vote.message_id,
      vote.expires_at,
      now
    ).run();
  }
  async updateVoteWeights(voteId, yesWeight, noWeight) {
    await this.db.prepare("UPDATE votes SET yes_weight = ?, no_weight = ? WHERE vote_id = ?").bind(yesWeight, noWeight, voteId).run();
  }
  async incrementVoteWeights(voteId, yesDelta, noDelta) {
    const result = await this.db.prepare(`
        UPDATE votes
        SET yes_weight = yes_weight + ?, no_weight = no_weight + ?
        WHERE vote_id = ? AND status = 'active'
      `).bind(yesDelta, noDelta, voteId).run();
    return (result?.meta?.changes ?? 0) > 0;
  }
  async updateVoteStatus(voteId, status) {
    await this.db.prepare("UPDATE votes SET status = ? WHERE vote_id = ?").bind(status, voteId).run();
  }
  async updateMessageId(voteId, messageId) {
    await this.db.prepare("UPDATE votes SET message_id = ? WHERE vote_id = ?").bind(messageId, voteId).run();
  }
  async getExpiredActiveVotes() {
    const now = Math.floor(Date.now() / 1e3);
    const result = await this.db.prepare("SELECT * FROM votes WHERE status = 'active' AND expires_at < ?").bind(now).all();
    return result?.results ?? [];
  }
};
__name(VotesRepo, "VotesRepo");

// voteRecordsRepo.ts
var VoteRecordsRepo = class {
  constructor(db) {
    this.db = db;
  }
  async getRecord(voteId, voterUserId) {
    const result = await this.db.prepare("SELECT * FROM vote_records WHERE vote_id = ? AND voter_user_id = ?").bind(voteId, voterUserId).first();
    return result ?? null;
  }
  async createRecord(voteId, chatId, voterUserId, choice, votePower) {
    const now = Math.floor(Date.now() / 1e3);
    const result = await this.db.prepare(`
        INSERT OR IGNORE INTO vote_records (vote_id, chat_id, voter_user_id, choice, vote_power, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).bind(voteId, chatId, voterUserId, choice, votePower, now).run();
    return (result?.meta?.changes ?? 0) > 0;
  }
  async getVoteCount(voteId) {
    const result = await this.db.prepare("SELECT COUNT(*) as count FROM vote_records WHERE vote_id = ?").bind(voteId).first();
    return result?.count ?? 0;
  }
};
__name(VoteRecordsRepo, "VoteRecordsRepo");

// usersRepo.ts
var UsersRepo = class {
  constructor(db) {
    this.db = db;
  }
  async getUser(chatId, userId) {
    const result = await this.db.prepare("SELECT * FROM users WHERE chat_id = ? AND user_id = ?").bind(chatId, userId).first();
    return result ?? null;
  }
  async upsertUser(chatId, userId, username, firstName) {
    const now = Math.floor(Date.now() / 1e3);
    await this.db.prepare(`
        INSERT INTO users (chat_id, user_id, username, first_name, weight, last_message_at, last_weight_update_at, joined_at)
        VALUES (?, ?, ?, ?, 1.0, ?, ?, ?)
        ON CONFLICT(chat_id, user_id) DO UPDATE SET
          username = excluded.username,
          first_name = excluded.first_name
      `).bind(chatId, userId, username, firstName, now, now, now).run();
    return await this.getUser(chatId, userId);
  }
  async updateWeight(chatId, userId, newWeight, lastMessageAt) {
    const now = Math.floor(Date.now() / 1e3);
    await this.db.prepare(`
        UPDATE users
        SET weight = ?, last_message_at = ?, last_weight_update_at = ?
        WHERE chat_id = ? AND user_id = ?
      `).bind(newWeight, lastMessageAt, now, chatId, userId).run();
  }
};
__name(UsersRepo, "UsersRepo");

// verificationsRepo.ts
var VerificationsRepo = class {
  constructor(db) {
    this.db = db;
  }
  async createVerification(chatId, userId, verificationId, expiresAt) {
    const now = Math.floor(Date.now() / 1e3);
    await this.db.prepare(`
        INSERT INTO user_verifications 
        (chat_id, user_id, verification_id, status, failure_count, created_at, expires_at)
        VALUES (?, ?, ?, 'pending', 0, ?, ?)
      `).bind(chatId, userId, verificationId, now, expiresAt).run();
    return await this.getVerification(verificationId);
  }
  async getVerification(verificationId) {
    const result = await this.db.prepare("SELECT * FROM user_verifications WHERE verification_id = ?").bind(verificationId).first();
    return result ?? null;
  }
  async getPendingVerification(chatId, userId) {
    const result = await this.db.prepare(`
        SELECT * FROM user_verifications
        WHERE chat_id = ? AND user_id = ? AND status = 'pending'
        ORDER BY created_at DESC
        LIMIT 1
      `).bind(chatId, userId).first();
    return result ?? null;
  }
  async updateVerificationStatus(verificationId, status, messageId) {
    const now = Math.floor(Date.now() / 1e3);
    const sets = ["status = ?"];
    const params = [status];
    if (status === "verified") {
      sets.push("verified_at = ?");
      params.push(now);
    }
    if (typeof messageId === "number") {
      sets.push("message_id = ?");
      params.push(messageId);
    }
    params.push(verificationId);
    await this.db.prepare(`UPDATE user_verifications SET ${sets.join(", ")} WHERE verification_id = ?`).bind(...params).run();
  }
  async setPromptMessage(verificationId, messageId, triggerMessageId) {
    await this.db.prepare(`
        UPDATE user_verifications
        SET message_id = ?, trigger_message_id = COALESCE(trigger_message_id, ?)
        WHERE verification_id = ?
      `).bind(messageId, triggerMessageId, verificationId).run();
  }
  async activateVerification(verificationId, messageId, triggerMessageId, expiresAt) {
    await this.db.prepare(`
        UPDATE user_verifications
        SET message_id = ?,
            trigger_message_id = COALESCE(trigger_message_id, ?),
            expires_at = ?
        WHERE verification_id = ?
      `).bind(messageId, triggerMessageId, expiresAt, verificationId).run();
  }
  async setTriggerMessageIdIfEmpty(verificationId, triggerMessageId) {
    await this.db.prepare(`
        UPDATE user_verifications
        SET trigger_message_id = COALESCE(trigger_message_id, ?)
        WHERE verification_id = ?
      `).bind(triggerMessageId, verificationId).run();
  }
  async incrementFailureCount(verificationId) {
    await this.db.prepare("UPDATE user_verifications SET failure_count = failure_count + 1 WHERE verification_id = ?").bind(verificationId).run();
  }
  async getExpiredPendingVerifications() {
    const now = Math.floor(Date.now() / 1e3);
    const result = await this.db.prepare(`
        SELECT * FROM user_verifications
        WHERE status = 'pending'
          AND message_id IS NOT NULL
          AND expires_at < ?
      `).bind(now).all();
    return result?.results ?? [];
  }
  async getFailedVerificationForUser(chatId, userId) {
    const result = await this.db.prepare(`
        SELECT * FROM user_verifications
        WHERE chat_id = ? AND user_id = ? AND status = 'failed'
        ORDER BY created_at DESC
        LIMIT 1
      `).bind(chatId, userId).first();
    return result ?? null;
  }
  async getVerifiedUser(chatId, userId) {
    const result = await this.db.prepare("SELECT * FROM user_verifications WHERE chat_id = ? AND user_id = ? AND status = 'verified' LIMIT 1").bind(chatId, userId).first();
    return result ?? null;
  }
  async banUser(chatId, userId) {
    const now = Math.floor(Date.now() / 1e3);
    await this.db.prepare("UPDATE user_verifications SET status = 'banned' WHERE chat_id = ? AND user_id = ?").bind(chatId, userId).run();
  }
  async isBanned(chatId, userId) {
    const result = await this.db.prepare("SELECT COUNT(*) as count FROM user_verifications WHERE chat_id = ? AND user_id = ? AND status = 'banned'").bind(chatId, userId).first();
    return (result?.count ?? 0) > 0;
  }
};
__name(VerificationsRepo, "VerificationsRepo");

// weightService.ts
var WeightService = class {
  constructor(usersRepo) {
    this.usersRepo = usersRepo;
  }
  /**
   * Update user weight using the decay + activity formula:
   * W_new = W_old * 0.98^d + log(1 + Δt)
   * d = days since last update
   * Δt = seconds since last message
   */
  async updateUserWeight(chatId, userId, username, firstName) {
    const now = Math.floor(Date.now() / 1e3);
    let user = await this.usersRepo.getUser(chatId, userId);
    if (!user) {
      user = await this.usersRepo.upsertUser(chatId, userId, username, firstName);
      return user;
    }
    const lastUpdate = user.last_weight_update_at ?? user.joined_at;
    const lastMessage = user.last_message_at ?? user.joined_at;
    const daysSinceUpdate = (now - lastUpdate) / 86400;
    const secondsSinceMessage = now - lastMessage;
    const decayFactor = Math.pow(0.98, daysSinceUpdate);
    const activityBonus = Math.log(1 + secondsSinceMessage);
    const newWeight = Math.max(0.1, user.weight * decayFactor + activityBonus);
    await this.usersRepo.upsertUser(chatId, userId, username, firstName);
    await this.usersRepo.updateWeight(chatId, userId, newWeight, now);
    return await this.usersRepo.getUser(chatId, userId);
  }
  /**
   * Calculate vote power from weight:
   * vote_power = sqrt(W)
   */
  calculateVotePower(weight) {
    return Math.sqrt(Math.max(0, weight));
  }
  /**
   * Get or initialize a user without updating their weight
   * (used when reading vote power for voting)
   */
  async getUserWeight(chatId, userId) {
    const user = await this.usersRepo.getUser(chatId, userId);
    return user?.weight ?? 1;
  }
};
__name(WeightService, "WeightService");

// renderService.ts
var RenderService = class {
  renderVoteMessage(vote) {
    const target = this.escape(
      vote.target_username ? `@${vote.target_username}` : vote.target_first_name ?? `User ${vote.target_user_id}`
    );
    const net = vote.yes_weight - vote.no_weight;
    const bar = this.buildNetBar(net, vote.threshold);
    const quoted = vote.quoted_text ? ` "${this.escape(vote.quoted_text.slice(0, 100))}"` : "";
    const startTime = this.formatTime(vote.created_at);
    const durationMin = Math.round((vote.expires_at - vote.created_at) / 60);
    return `\u{1F5F3} VoteKick ${target}${quoted}

\u{1F4CA} \u6295\u7968\u503E\u5411\uFF1A${bar}
\u2B06\uFE0F ${vote.yes_weight.toFixed(1)}  \u2B07\uFE0F ${vote.no_weight.toFixed(1)}  \u2696\uFE0F ${net >= 0 ? "+" : ""}${net.toFixed(1)}

\u{1F3AF} \u9608\u503C\uFF1A${vote.threshold}  \u23F1 \u53D1\u8D77\uFF1A${startTime}  \u23F3 \u6709\u6548\uFF1A${durationMin}\u5206\u949F`;
  }
  /**
   * 单轴净值进度条（避免 yes/no 假满问题）
   */
  buildNetBar(net, threshold) {
    const SIZE = 10;
    const ratio = Math.max(-1, Math.min(1, net / threshold));
    const filled = Math.round(Math.abs(ratio) * SIZE);
    const empty = SIZE - filled;
    if (ratio > 0) {
      return "\u{1F7E9}".repeat(filled) + "\u2B1C".repeat(empty);
    } else if (ratio < 0) {
      return "\u{1F7E5}".repeat(filled) + "\u2B1C".repeat(empty);
    } else {
      return "\u2B1C".repeat(SIZE);
    }
  }
  formatTime(timestamp) {
    const d = new Date(timestamp * 1e3);
    return d.toTimeString().slice(0, 5);
  }
  buildVoteKeyboard(voteId) {
    return {
      inline_keyboard: [
        [
          { text: "\u2B06\uFE0F \u8E22\u51FA", callback_data: `vote:${voteId}:yes` },
          { text: "\u2B07\uFE0F \u4E0D\u8E22\u51FA", callback_data: `vote:${voteId}:no` }
        ]
      ]
    };
  }
  renderResultMessage(vote) {
    const target = vote.target_username ? `@${vote.target_username}` : vote.target_first_name ?? `User ${vote.target_user_id}`;
    const result = vote.status === "passed" ? `\u2705 \u901A\u8FC7\uFF1A${target} \u5DF2\u88AB\u8E22\u51FA` : vote.status === "rejected" ? `\u274C \u672A\u901A\u8FC7\uFF1A${target} \u4FDD\u7559` : `\u23F0 \u7ED3\u675F\uFF1A${target} \u4FDD\u7559`;
    return `\u{1F5F3} VoteKick \u5DF2\u7ED3\u675F

${result}

\u2B06\uFE0F ${vote.yes_weight.toFixed(1)}  \u2B07\uFE0F ${vote.no_weight.toFixed(1)}
\u{1F3AF} \u9608\u503C\uFF1A${vote.threshold}`;
  }
  // ════════════════════════════════════════════════════════════════════════
  // 验证相关的渲染方法
  // ════════════════════════════════════════════════════════════════════════
  renderVerificationPrompt() {
    return `\u{1F916} <b>\u4EBA\u673A\u9A8C\u8BC1</b>

\u6B22\u8FCE\u6765\u5230\u6211\u4EEC\u7684\u7FA4\u7EC4\uFF01\u4E3A\u4E86\u9632\u6B62\u673A\u5668\u4EBA\u9A9A\u6270\uFF0C\u8BF7\u70B9\u51FB\u4E0B\u65B9\u6309\u94AE\u9A8C\u8BC1\uFF1A

<i>\u9650\u5236\u65F6\u95F4\uFF1A1\u5206\u949F</i>`;
  }
  buildVerificationKeyboard(verificationId) {
    return {
      inline_keyboard: [
        [
          { text: "\u2705 I am not robot", callback_data: `verify:${verificationId}` }
        ]
      ]
    };
  }
  renderVerificationSuccess() {
    return `\u2705 <b>\u9A8C\u8BC1\u6210\u529F\uFF01</b>

\u6B22\u8FCE\u52A0\u5165\u7FA4\u7EC4\u3002\u7981\u8A00\u5DF2\u89E3\u9664\u3002`;
  }
  renderStartGuide() {
    return `\u{1F44B} <b>\u6B22\u8FCE\u4F7F\u7528 VoteKick Bot</b>

\u{1F5F3} <b>\u4F7F\u7528\u65B9\u6CD5\uFF1A</b>

1\uFE0F\u20E3 <b>\u53D1\u8D77\u6295\u7968\uFF1A</b>
   \u2022 \u53F3\u952E\u70B9\u51FB\u67D0\u4E2A\u7528\u6237\u7684\u6D88\u606F \u2192 \u56DE\u590D
   \u2022 \u5728\u56DE\u590D\u4E2D\u53D1\u9001 <code>/kick</code>

2\uFE0F\u20E3 <b>\u7FA4\u6210\u5458\u6295\u7968\uFF1A</b>
   \u2022 \u70B9\u51FB \u2B06\uFE0F \u8E22\u51FA \u6216 \u2B07\uFE0F \u4E0D\u8E22\u51FA
   \u2022 \u8D5E\u6210\u7968\u529B\u8FBE\u5230\u9608\u503C\u540E\u81EA\u52A8\u8E22\u4EBA

\u2699\uFE0F <b>\u7CFB\u7EDF\u89C4\u5219\uFF1A</b>
   \u2022 \u6743\u91CD\u7CFB\u7EDF\uFF1A\u6D3B\u8DC3\u6210\u5458\u6295\u7968\u529B\u66F4\u5927
   \u2022 \u51B7\u5374\u65F6\u95F4\uFF1A\u9632\u6B62\u6EE5\u7528
   \u2022 \u7BA1\u7406\u5458/\u7FA4\u4E3B\u65E0\u6CD5\u88AB\u8E22
   \u2022 \u6743\u91CD\u516C\u5F0F\uFF1AW = W_old \xD7 0.98^d + log(1 + \u0394t)
   \u2022 \u6295\u7968\u529B\uFF1A\u221AW

\u2753 \u6709\u95EE\u9898\uFF1F\u8BF7\u8054\u7CFB\u7FA4\u7BA1\u7406\u5458\u3002`;
  }
  escape(text) {
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
};
__name(RenderService, "RenderService");

// verificationService.ts
function generateVerificationId() {
  return `vrfy_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}
__name(generateVerificationId, "generateVerificationId");
var VerificationService = class {
  constructor(db, tg, env, botMessageService) {
    this.db = db;
    this.tg = tg;
    this.env = env;
    this.botMessageService = botMessageService;
    this.verificationsRepo = new VerificationsRepo(db);
    this.renderService = new RenderService();
  }
  verificationsRepo;
  renderService;
  get verificationDurationSeconds() {
    return 60;
  }
  get permanentMuteUntil() {
    return Math.floor(Date.now() / 1e3) + 400 * 24 * 60 * 60;
  }
  /**
   * 当新成员加入群组时调用
   */
  async handleNewChatMember(chatId, userId, userName, firstName) {
    if (await this.verificationsRepo.isBanned(chatId, userId)) {
      await this.tg.restrictChatMember(chatId, userId, this.permanentMuteUntil);
      return;
    }
    const verified = await this.verificationsRepo.getVerifiedUser(chatId, userId);
    if (verified) {
      return;
    }
    const pending = await this.verificationsRepo.getPendingVerification(chatId, userId);
    if (pending) {
      return;
    }
    const verificationId = generateVerificationId();
    const expiresAt = 0;
    await this.verificationsRepo.createVerification(chatId, userId, verificationId, expiresAt);
    console.log(`[Verification] New member joined: ${userId} in chat ${chatId}`);
  }
  /**
   * 检查用户是否需要验证（第一次发送消息时）
   * 返回 true 表示用户需要验证，应该禁言并展示验证按钮
   */
  async shouldVerifyUser(chatId, userId) {
    const isBanned = await this.verificationsRepo.isBanned(chatId, userId);
    if (isBanned) {
      return false;
    }
    const verified = await this.verificationsRepo.getVerifiedUser(chatId, userId);
    if (verified) {
      return false;
    }
    const pending = await this.verificationsRepo.getPendingVerification(chatId, userId);
    return !!pending;
  }
  /**
   * 发送验证提示消息
   */
  async sendVerificationPrompt(chatId, userId, triggerMessageId) {
    const pending = await this.verificationsRepo.getPendingVerification(chatId, userId);
    if (!pending) {
      return;
    }
    if (!pending.trigger_message_id) {
      await this.verificationsRepo.setTriggerMessageIdIfEmpty(pending.verification_id, triggerMessageId);
    }
    if (pending.message_id) {
      return;
    }
    const text = this.renderService.renderVerificationPrompt();
    const keyboard = this.renderService.buildVerificationKeyboard(pending.verification_id);
    const expiresAt = Math.floor(Date.now() / 1e3) + this.verificationDurationSeconds;
    const sent = await this.botMessageService.sendMessage(chatId, text, { reply_markup: keyboard });
    if (sent?.message_id) {
      await this.verificationsRepo.activateVerification(
        pending.verification_id,
        sent.message_id,
        triggerMessageId,
        expiresAt
      );
    }
  }
  /**
   * 处理验证按钮点击
   */
  async handleVerificationCallback(verificationId, chatId, userId, callbackQueryId) {
    const verification = await this.verificationsRepo.getVerification(verificationId);
    if (!verification) {
      await this.tg.answerCallbackQuery(callbackQueryId);
      return false;
    }
    if (verification.chat_id !== chatId) {
      await this.tg.answerCallbackQuery(callbackQueryId);
      return false;
    }
    if (verification.user_id !== userId) {
      await this.tg.answerCallbackQuery(callbackQueryId, "\u274C \u53EA\u80FD\u9A8C\u8BC1\u4F60\u81EA\u5DF1\u7684\u8D26\u53F7", true);
      return false;
    }
    if (verification.status !== "pending") {
      await this.tg.answerCallbackQuery(callbackQueryId);
      return false;
    }
    const now = Math.floor(Date.now() / 1e3);
    if (now > verification.expires_at) {
      await this.handleVerificationExpired(verification);
      await this.tg.answerCallbackQuery(callbackQueryId);
      return false;
    }
    const unrestricted = await this.tg.unrestrictChatMember(chatId, verification.user_id);
    if (!unrestricted) {
      await this.tg.answerCallbackQuery(callbackQueryId, "\u274C \u9A8C\u8BC1\u5904\u7406\u4E2D\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5", true);
      return false;
    }
    await this.verificationsRepo.updateVerificationStatus(verificationId, "verified", verification.message_id ?? void 0);
    await this.tg.answerCallbackQuery(callbackQueryId, "\u2705 \u9A8C\u8BC1\u6210\u529F\uFF01");
    if (verification.message_id) {
      try {
        await this.botMessageService.deleteMessage(chatId, verification.message_id);
      } catch (e) {
        console.error("Failed to delete verification message after success:", e);
      }
    }
    return true;
  }
  /**
   * 处理验证过期 - 踢出用户并删除消息
   */
  async handleVerificationExpired(verification) {
    const current = await this.verificationsRepo.getVerification(verification.verification_id);
    if (!current || current.status !== "pending") {
      return;
    }
    const chatId = current.chat_id;
    const userId = current.user_id;
    await this.verificationsRepo.updateVerificationStatus(current.verification_id, "banned", current.message_id ?? void 0);
    await this.tg.restrictChatMember(chatId, userId, this.permanentMuteUntil);
    console.log(`[Verification] User ${userId} permanently muted in chat ${chatId}`);
    if (current.message_id) {
      try {
        await this.botMessageService.deleteMessage(chatId, current.message_id);
      } catch (e) {
        console.error("Failed to delete verification message:", e);
      }
    }
    if (current.trigger_message_id) {
      try {
        await this.tg.deleteMessage(chatId, current.trigger_message_id);
      } catch (e) {
        console.error("Failed to delete triggering user message:", e);
      }
    }
  }
  /**
   * Cron - 处理过期的验证
   */
  async processExpiredVerifications() {
    const expired = await this.verificationsRepo.getExpiredPendingVerifications();
    for (const v of expired) {
      await this.handleVerificationExpired(v);
    }
  }
};
__name(VerificationService, "VerificationService");

// botMessagesRepo.ts
var BotMessagesRepo = class {
  constructor(db) {
    this.db = db;
  }
  async upsertMessage(chatId, messageId, content) {
    const now = Math.floor(Date.now() / 1e3);
    await this.db.prepare(`
        INSERT INTO bot_messages (chat_id, message_id, content, status, created_at, updated_at)
        VALUES (?, ?, ?, 'in_progress', ?, ?)
        ON CONFLICT(chat_id, message_id) DO UPDATE SET
          content = excluded.content,
          status = 'in_progress',
          updated_at = excluded.updated_at
      `).bind(chatId, messageId, content, now, now).run();
  }
  async markDeleted(chatId, messageId) {
    const now = Math.floor(Date.now() / 1e3);
    await this.db.prepare(`
        UPDATE bot_messages
        SET status = 'deleted', updated_at = ?
        WHERE chat_id = ? AND message_id = ?
      `).bind(now, chatId, messageId).run();
  }
  async getMessage(chatId, messageId) {
    const result = await this.db.prepare("SELECT * FROM bot_messages WHERE chat_id = ? AND message_id = ?").bind(chatId, messageId).first();
    return result ?? null;
  }
};
__name(BotMessagesRepo, "BotMessagesRepo");

// botMessageService.ts
var BotMessageService = class {
  constructor(tg, botMessagesRepo) {
    this.tg = tg;
    this.botMessagesRepo = botMessagesRepo;
  }
  async sendMessage(chatId, text, extra = {}) {
    const sent = await this.tg.sendMessage(chatId, text, extra);
    if (sent?.message_id) {
      await this.botMessagesRepo.upsertMessage(chatId, sent.message_id, text);
    }
    return sent;
  }
  async editMessageText(chatId, messageId, text, extra = {}) {
    const updated = await this.tg.editMessageText(chatId, messageId, text, extra);
    if (updated) {
      await this.botMessagesRepo.upsertMessage(chatId, messageId, text);
    }
    return updated;
  }
  async deleteMessage(chatId, messageId) {
    const deleted = await this.tg.deleteMessage(chatId, messageId);
    if (deleted) {
      await this.botMessagesRepo.markDeleted(chatId, messageId);
    }
    return deleted;
  }
};
__name(BotMessageService, "BotMessageService");

// voteService.ts
function generateId() {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}
__name(generateId, "generateId");
var VoteService = class {
  constructor(db, tg, env) {
    this.db = db;
    this.tg = tg;
    this.env = env;
    this.votesRepo = new VotesRepo(db);
    this.recordsRepo = new VoteRecordsRepo(db);
    this.usersRepo = new UsersRepo(db);
    this.verificationsRepo = new VerificationsRepo(db);
    this.weightService = new WeightService(this.usersRepo);
    this.renderService = new RenderService();
    this.botMessageService = new BotMessageService(tg, new BotMessagesRepo(db));
    this.verificationService = new VerificationService(db, tg, env, this.botMessageService);
    this.enableVerification = (env.ENABLE_VERIFICATION ?? "1") === "1";
  }
  votesRepo;
  recordsRepo;
  usersRepo;
  verificationsRepo;
  weightService;
  renderService;
  verificationService;
  botMessageService;
  enableVerification;
  // ── Helpers ─────────────────────────────────────────────────────────────
  async reply(chatId, text) {
    await this.botMessageService.sendMessage(chatId, text);
  }
  get initiatorCooldown() {
    return Number(this.env.INITIATOR_COOLDOWN_SECONDS ?? 600);
  }
  get targetCooldown() {
    return Number(this.env.TARGET_COOLDOWN_SECONDS ?? 1800);
  }
  get minWeightToInitiate() {
    return Number(this.env.MIN_WEIGHT_TO_INITIATE ?? 1);
  }
  // ── Message handler ──────────────────────────────────────────────────────
  async handleMessage(msg) {
    const from = msg.from;
    const chat = msg.chat;
    if (!from || from.is_bot)
      return;
    if (msg.new_chat_members && msg.new_chat_members.length > 0) {
      return;
    }
    const chatId = String(chat.id);
    const userId = String(from.id);
    const rawText = String(msg.text ?? "").toLowerCase().trim();
    if (chat.type === "private" && rawText.startsWith("/start")) {
      const guide = this.renderService.renderStartGuide();
      await this.botMessageService.sendMessage(chatId, guide);
      return;
    }
    if (chat.type === "private")
      return;
    if (this.enableVerification) {
      const shouldVerify = await this.verificationService.shouldVerifyUser(chatId, userId);
      if (shouldVerify) {
        await this.tg.restrictChatMember(chatId, userId);
        await this.verificationService.sendVerificationPrompt(chatId, userId, msg.message_id);
        return;
      }
    }
    await this.weightService.updateUserWeight(chatId, userId, from.username ?? null, from.first_name);
    const isKick = rawText.startsWith("/kick") || rawText.includes("kick") && rawText.length < 50;
    if (!isKick)
      return;
    const replyMsg = msg.reply_to_message ?? null;
    await this.initiateVote(msg, replyMsg);
  }
  /**
   * 处理新成员加入
   */
  async handleNewChatMember(msg) {
    if (!this.enableVerification || !msg.new_chat_members)
      return;
    const chatId = String(msg.chat.id);
    for (const newMember of msg.new_chat_members) {
      if (newMember.is_bot)
        continue;
      const userId = String(newMember.id);
      await this.verificationService.handleNewChatMember(
        chatId,
        userId,
        newMember.username ?? null,
        newMember.first_name
      );
    }
  }
  // ── Initiate vote ────────────────────────────────────────────────────────
  async initiateVote(msg, replyMsg) {
    const from = msg.from;
    const chat = msg.chat;
    if (!from || !replyMsg?.from) {
      return;
    }
    const chatId = String(chat.id);
    const initiatorId = String(from.id);
    const now = Math.floor(Date.now() / 1e3);
    const initiatorWeight = await this.weightService.getUserWeight(chatId, initiatorId);
    if (initiatorWeight < this.minWeightToInitiate) {
      await this.reply(
        chatId,
        `\u274C \u4F60\u7684\u4FE1\u8A89\u6743\u91CD\u4E0D\u8DB3\uFF08\u5F53\u524D ${initiatorWeight.toFixed(2)}\uFF0C\u9700\u8981 ${this.minWeightToInitiate}\uFF09\uFF0C\u65E0\u6CD5\u53D1\u8D77\u6295\u7968`
      );
      return;
    }
    const lastByInitiator = await this.votesRepo.getLastVoteByInitiator(chatId, initiatorId);
    if (lastByInitiator) {
      const elapsed = now - lastByInitiator.created_at;
      const remaining = this.initiatorCooldown - elapsed;
      if (remaining > 0) {
        await this.reply(chatId, `\u274C \u53D1\u8D77\u51B7\u5374\u4E2D\uFF0C\u8BF7\u7B49\u5F85 ${remaining} \u79D2`);
        return;
      }
    }
    const target = replyMsg.from;
    const targetId = String(target.id);
    if (target.is_bot) {
      await this.reply(chatId, "\u274C \u4E0D\u80FD\u6295\u673A\u5668\u4EBA");
      return;
    }
    if (targetId === initiatorId) {
      await this.reply(chatId, "\u274C \u4E0D\u80FD\u6295\u81EA\u5DF1");
      return;
    }
    const member = await this.tg.getChatMember(chatId, targetId);
    if (member && (member.status === "administrator" || member.status === "creator")) {
      await this.reply(chatId, "\u274C \u4E0D\u80FD\u6295\u7BA1\u7406\u5458");
      return;
    }
    const existing = await this.votesRepo.getActiveVoteForTarget(chatId, targetId);
    if (existing) {
      await this.reply(chatId, "\u274C \u5DF2\u6709\u8FDB\u884C\u4E2D\u7684\u6295\u7968");
      return;
    }
    const lastForTarget = await this.votesRepo.getLastVoteForTarget(chatId, targetId);
    if (lastForTarget) {
      const elapsed = now - lastForTarget.created_at;
      const remaining = this.targetCooldown - elapsed;
      if (remaining > 0) {
        await this.reply(chatId, `\u274C \u8BE5\u7528\u6237\u51B7\u5374\u4E2D\uFF0C\u8BF7\u7B49\u5F85 ${remaining} \u79D2`);
        return;
      }
    }
    const voteId = generateId();
    const duration = Number(this.env.VOTE_DURATION_SECONDS ?? 300);
    const threshold = Number(this.env.VOTE_THRESHOLD ?? 20);
    const expiresAt = now + duration;
    await this.votesRepo.createVote({
      vote_id: voteId,
      chat_id: chatId,
      target_user_id: targetId,
      target_username: target.username ?? null,
      target_first_name: target.first_name,
      initiator_user_id: initiatorId,
      initiator_username: from.username ?? null,
      initiator_message_id: msg.message_id,
      target_message_id: replyMsg.message_id,
      yes_weight: 0,
      no_weight: 0,
      threshold,
      status: "active",
      quoted_text: replyMsg.text ?? null,
      message_id: null,
      expires_at: expiresAt
    });
    const vote = await this.votesRepo.getVote(voteId);
    if (!vote)
      return;
    const text = this.renderService.renderVoteMessage(vote);
    const keyboard = this.renderService.buildVoteKeyboard(voteId);
    const sent = await this.botMessageService.sendMessage(chatId, text, { reply_markup: keyboard });
    if (sent?.message_id) {
      await this.votesRepo.updateMessageId(voteId, sent.message_id);
    }
  }
  // ── Callback handler ─────────────────────────────────────────────────────
  async handleCallback(cb) {
    const data = cb.data;
    const from = cb.from;
    const message = cb.message;
    if (!data || !message)
      return;
    const parts = data.split(":");
    if (parts.length < 2)
      return;
    const [action, ...rest] = parts;
    if (action === "verify") {
      const verificationId = rest[0];
      const chatId = String(message.chat.id);
      const userId = String(from.id);
      await this.verificationService.handleVerificationCallback(
        verificationId,
        chatId,
        userId,
        cb.id
      );
      return;
    }
    if (action === "vote" && rest.length === 2) {
      const [voteId, rawChoice] = rest;
      if (rawChoice !== "yes" && rawChoice !== "no")
        return;
      const choice = rawChoice;
      const chatId = String(message.chat.id);
      const voterId = String(from.id);
      const vote = await this.votesRepo.getVote(voteId);
      if (!vote || vote.status !== "active") {
        await this.tg.answerCallbackQuery(cb.id, "\u274C \u5DF2\u7ED3\u675F", true);
        return;
      }
      let weight = await this.weightService.getUserWeight(chatId, voterId);
      if (weight < 0.1)
        weight = 1;
      const power = this.weightService.calculateVotePower(weight);
      const inserted = await this.recordsRepo.createRecord(voteId, chatId, voterId, choice, power);
      if (!inserted) {
        await this.tg.answerCallbackQuery(cb.id, "\u274C \u5DF2\u6295\u7968");
        return;
      }
      const yesDelta = choice === "yes" ? power : 0;
      const noDelta = choice === "no" ? power : 0;
      const updatedActive = await this.votesRepo.incrementVoteWeights(voteId, yesDelta, noDelta);
      if (!updatedActive) {
        await this.tg.answerCallbackQuery(cb.id, "\u274C \u5DF2\u7ED3\u675F", true);
        return;
      }
      const updated = await this.votesRepo.getVote(voteId);
      if (!updated)
        return;
      await this.tg.answerCallbackQuery(cb.id, `+${power.toFixed(2)}`);
      if (updated.yes_weight >= updated.threshold) {
        await this.settleVote(updated, "passed");
        return;
      }
      if (updated.no_weight >= updated.threshold) {
        await this.settleVote(updated, "rejected");
        return;
      }
      if (updated.message_id) {
        const text = this.renderService.renderVoteMessage(updated);
        const keyboard = this.renderService.buildVoteKeyboard(voteId);
        await this.botMessageService.editMessageText(chatId, updated.message_id, text, { reply_markup: keyboard });
      }
    }
  }
  // ── Settle ───────────────────────────────────────────────────────────────
  async settleVote(vote, status) {
    await this.votesRepo.updateVoteStatus(vote.vote_id, status);
    const updated = await this.votesRepo.getVote(vote.vote_id);
    if (!updated)
      return;
    if (status !== "passed") {
      if (updated.message_id) {
        try {
          await this.botMessageService.deleteMessage(vote.chat_id, updated.message_id);
        } catch {
        }
      }
      const userMessageIds = [updated.initiator_message_id, updated.target_message_id];
      for (const msgId of userMessageIds) {
        if (!msgId)
          continue;
        try {
          await this.tg.deleteMessage(vote.chat_id, msgId);
        } catch {
        }
      }
      return;
    }
    if (updated.message_id) {
      const text = this.renderService.renderResultMessage(updated);
      await this.botMessageService.editMessageText(
        vote.chat_id,
        updated.message_id,
        text,
        { reply_markup: { inline_keyboard: [] } }
      );
    }
    try {
      await this.tg.kickChatMember(vote.chat_id, vote.target_user_id);
      await this.tg.unbanChatMember(vote.chat_id, vote.target_user_id);
    } catch {
    }
  }
  // ── Cron: expire votes and verifications ───────────────────────────────
  async processExpiredVotes() {
    const list = await this.votesRepo.getExpiredActiveVotes();
    for (const v of list) {
      await this.settleVote(v, "expired");
    }
  }
  async processExpiredVerifications() {
    if (!this.enableVerification)
      return;
    await this.verificationService.processExpiredVerifications();
  }
};
__name(VoteService, "VoteService");

// index.ts
var votekick_default = {
  // ── Webhook handler ──────────────────────────────────────────────────
  async fetch(request, env) {
    if (request.method !== "POST") {
      return new Response("VoteKick Bot is running.", { status: 200 });
    }
    try {
      const update = await request.json();
      const tg = new TelegramAPI(env.BOT_TOKEN);
      const service = new VoteService(env.DB, tg, env);
      if (update.message) {
        if (update.message.new_chat_members && update.message.new_chat_members.length > 0) {
          await service.handleNewChatMember(update.message);
        }
        await service.handleMessage(update.message);
      } else if (update.callback_query) {
        await service.handleCallback(update.callback_query);
      } else if (update.my_chat_member) {
        console.log("[my_chat_member]", {
          chat_id: update.my_chat_member.chat.id,
          status: update.my_chat_member.new_chat_member.status,
          old_status: update.my_chat_member.old_chat_member.status
        });
      }
    } catch (err) {
      console.error("[fetch] Unhandled error:", err);
    }
    return new Response("OK", { status: 200 });
  },
  // ── Cron handler (process expired votes and verifications every minute) ─
  async scheduled(_event, env) {
    try {
      const tg = new TelegramAPI(env.BOT_TOKEN);
      const service = new VoteService(env.DB, tg, env);
      await service.processExpiredVotes();
      await service.processExpiredVerifications();
      console.log("[cron] Processed expired votes and verifications");
    } catch (err) {
      console.error("[scheduled] Unhandled error:", err);
    }
  }
};
export {
  votekick_default as default
};
//# sourceMappingURL=index.js.map
