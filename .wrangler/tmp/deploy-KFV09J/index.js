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
  async unbanChatMember(chatId, userId) {
    const res = await this.call("unbanChatMember", {
      chat_id: chatId,
      user_id: userId,
      only_if_banned: true
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
    return this.db.prepare("SELECT * FROM votes WHERE vote_id = ?").bind(voteId).first();
  }
  async getActiveVoteForTarget(chatId, targetUserId) {
    return this.db.prepare("SELECT * FROM votes WHERE chat_id = ? AND target_user_id = ? AND status = 'active'").bind(chatId, targetUserId).first();
  }
  async getActiveVoteForChat(chatId) {
    return this.db.prepare("SELECT * FROM votes WHERE chat_id = ? AND status = 'active' LIMIT 1").bind(chatId).first();
  }
  async getLastVoteByInitiator(chatId, initiatorUserId) {
    return this.db.prepare("SELECT * FROM votes WHERE chat_id = ? AND initiator_user_id = ? ORDER BY created_at DESC LIMIT 1").bind(chatId, initiatorUserId).first();
  }
  async getLastVoteForTarget(chatId, targetUserId) {
    return this.db.prepare("SELECT * FROM votes WHERE chat_id = ? AND target_user_id = ? ORDER BY created_at DESC LIMIT 1").bind(chatId, targetUserId).first();
  }
  async createVote(vote) {
    const now = Math.floor(Date.now() / 1e3);
    await this.db.prepare(`
        INSERT INTO votes
          (vote_id, chat_id, target_user_id, target_username, target_first_name,
           initiator_user_id, initiator_username, initiator_message_id, target_message_id,
           yes_weight, no_weight, threshold, status, quoted_text, message_id, expires_at, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, 'active', ?, ?, ?, ?)
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
  async updateVoteStatus(voteId, status) {
    await this.db.prepare("UPDATE votes SET status = ? WHERE vote_id = ?").bind(status, voteId).run();
  }
  async updateMessageId(voteId, messageId) {
    await this.db.prepare("UPDATE votes SET message_id = ? WHERE vote_id = ?").bind(messageId, voteId).run();
  }
  async getExpiredActiveVotes() {
    const now = Math.floor(Date.now() / 1e3);
    const result = await this.db.prepare("SELECT * FROM votes WHERE status = 'active' AND expires_at < ?").bind(now).all();
    return result.results;
  }
};
__name(VotesRepo, "VotesRepo");

// voteRecordsRepo.ts
var VoteRecordsRepo = class {
  constructor(db) {
    this.db = db;
  }
  async getRecord(voteId, voterUserId) {
    return this.db.prepare("SELECT * FROM vote_records WHERE vote_id = ? AND voter_user_id = ?").bind(voteId, voterUserId).first();
  }
  async createRecord(voteId, chatId, voterUserId, choice, votePower) {
    const now = Math.floor(Date.now() / 1e3);
    await this.db.prepare(`
        INSERT INTO vote_records (vote_id, chat_id, voter_user_id, choice, vote_power, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).bind(voteId, chatId, voterUserId, choice, votePower, now).run();
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
    return this.db.prepare("SELECT * FROM users WHERE chat_id = ? AND user_id = ?").bind(chatId, userId).first();
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
  escape(text) {
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
};
__name(RenderService, "RenderService");

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
    this.weightService = new WeightService(this.usersRepo);
    this.renderService = new RenderService();
  }
  votesRepo;
  recordsRepo;
  usersRepo;
  weightService;
  renderService;
  // ── Helpers ─────────────────────────────────────────────────────────────
  async reply(chatId, text) {
    await this.tg.sendMessage(chatId, text);
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
    if (chat.type === "private")
      return;
    const chatId = String(chat.id);
    const userId = String(from.id);
    const rawText = String(
      msg.text ?? msg.caption ?? ""
    ).toLowerCase().trim();
    const isKick = rawText.startsWith("/kick") || rawText.includes("kick");
    await this.weightService.updateUserWeight(chatId, userId, from.username ?? null, from.first_name);
    if (!isKick)
      return;
    const replyMsg = msg.reply_to_message ?? msg.message?.reply_to_message ?? null;
    await this.initiateVote(msg, replyMsg);
  }
  // ── Initiate vote ────────────────────────────────────────────────────────
  async initiateVote(msg, replyMsg) {
    const from = msg.from;
    const chat = msg.chat;
    if (!from || !replyMsg?.from) {
      await this.reply(String(chat.id), "\u274C \u8BF7\u56DE\u590D\u67D0\u6761\u6D88\u606F\u518D\u4F7F\u7528 /kick");
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
    const target = replyMsg.from;
    const targetId = String(target.id);
    let maxRemaining = 0;
    let reason = "";
    const lastForTarget = await this.votesRepo.getLastVoteForTarget(chatId, targetId);
    if (lastForTarget) {
      const remaining = this.targetCooldown - (now - lastForTarget.created_at);
      if (remaining > 0) {
        maxRemaining = remaining;
        reason = "\u8BE5\u7528\u6237";
      }
    }
    const lastByInitiator = await this.votesRepo.getLastVoteByInitiator(chatId, initiatorId);
    if (lastByInitiator) {
      const remaining = this.initiatorCooldown - (now - lastByInitiator.created_at);
      if (remaining > maxRemaining) {
        maxRemaining = remaining;
        reason = "\u53D1\u8D77";
      }
    }
    if (maxRemaining > 0) {
      await this.reply(chatId, `\u274C ${reason}\u51B7\u5374\u4E2D\uFF0C\u8BF7\u7B49\u5F85 ${maxRemaining} \u79D2`);
      return;
    }
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
    const sent = await this.tg.sendMessage(chatId, text, { reply_markup: keyboard });
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
    if (parts.length !== 3)
      return;
    const [, voteId, rawChoice] = parts;
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
    const existing = await this.recordsRepo.getRecord(voteId, voterId);
    if (existing) {
      const remaining = vote.expires_at - Math.floor(Date.now() / 1e3);
      await this.tg.answerCallbackQuery(cb.id, `\u274C \u5DF2\u6295\u7968\uFF0C\u5269\u4F59 ${remaining} \u79D2`);
      return;
    }
    let weight = await this.weightService.getUserWeight(chatId, voterId);
    if (weight < 0.1)
      weight = 1;
    const power = this.weightService.calculateVotePower(weight);
    await this.recordsRepo.createRecord(voteId, chatId, voterId, choice, power);
    const yes = choice === "yes" ? vote.yes_weight + power : vote.yes_weight;
    const no = choice === "no" ? vote.no_weight + power : vote.no_weight;
    await this.votesRepo.updateVoteWeights(voteId, yes, no);
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
      await this.tg.editMessageText(chatId, updated.message_id, text, { reply_markup: keyboard });
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
          await this.tg.deleteMessage(vote.chat_id, updated.message_id);
        } catch {
        }
      }
      return;
    }
    if (updated.message_id) {
      const text = this.renderService.renderResultMessage(updated);
      await this.tg.editMessageText(
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
  // ── Cron: expire votes ───────────────────────────────────────────────────
  async processExpiredVotes() {
    const list = await this.votesRepo.getExpiredActiveVotes();
    for (const v of list) {
      await this.settleVote(v, "expired");
    }
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
        await service.handleMessage(update.message);
      } else if (update.callback_query) {
        await service.handleCallback(update.callback_query);
      }
    } catch (err) {
      console.error("[fetch] Unhandled error:", err);
    }
    return new Response("OK", { status: 200 });
  },
  // ── Cron handler (process expired votes every minute) ─────────────────
  async scheduled(_event, env) {
    try {
      const tg = new TelegramAPI(env.BOT_TOKEN);
      const service = new VoteService(env.DB, tg, env);
      await service.processExpiredVotes();
    } catch (err) {
      console.error("[scheduled] Unhandled error:", err);
    }
  }
};
export {
  votekick_default as default
};
//# sourceMappingURL=index.js.map
