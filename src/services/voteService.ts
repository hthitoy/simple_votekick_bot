// src/services/voteService.ts
type D1Database = any;

import { TelegramAPI } from '../telegram';
import { VotesRepo } from '../db/votesRepo';
import { VoteRecordsRepo } from '../db/voteRecordsRepo';
import { UsersRepo } from '../db/usersRepo';
import { VerificationsRepo } from '../db/verificationsRepo';
import { WeightService } from './weightService';
import { RenderService } from './renderService';
import { VerificationService } from './verificationService';
import { TelegramMessage, TelegramCallbackQuery, TelegramChatMemberUpdate, DbVote, Env } from '../types';
import { BotMessagesRepo } from '../db/botMessagesRepo';
import { BotMessageService } from './botMessageService';
import { PendingDeletionsRepo } from '../db/pendingDeletionsRepo';
import { GroupSettingsRepo } from '../db/groupSettingsRepo';

type VoteChoice = 'yes' | 'no';

function generateId(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export class VoteService {
  private votesRepo: VotesRepo;
  private recordsRepo: VoteRecordsRepo;
  private usersRepo: UsersRepo;
  private verificationsRepo: VerificationsRepo;
  private weightService: WeightService;
  private renderService: RenderService;
  private verificationService: VerificationService;
  private botMessageService: BotMessageService;
  private botMessagesRepo: BotMessagesRepo;
  private pendingDeletionsRepo: PendingDeletionsRepo;
  private enableVerification: boolean;

  constructor(
    private db: D1Database,
    private tg: TelegramAPI,
    private env: Env,
  ) {
    this.votesRepo = new VotesRepo(db);
    this.recordsRepo = new VoteRecordsRepo(db);
    this.usersRepo = new UsersRepo(db);
    this.verificationsRepo = new VerificationsRepo(db);
    this.weightService = new WeightService(this.usersRepo);
    this.renderService = new RenderService();
    this.botMessagesRepo = new BotMessagesRepo(db);
    this.botMessageService = new BotMessageService(tg, this.botMessagesRepo);
    this.pendingDeletionsRepo = new PendingDeletionsRepo(db);
    this.verificationService = new VerificationService(db, tg, env, this.botMessageService, this.pendingDeletionsRepo);
    this.groupSettingsRepo = new GroupSettingsRepo(db);
    this.enableVerification = (env.ENABLE_VERIFICATION ?? '1') === '1';
    this.verificationService.setBotUsername(env.BOT_USERNAME || 'votekick-bot');
  }

  // ── Helpers ──────────────────────────────────────────────────────

  private async isVoteKickEnabled(chatId: string): Promise<boolean> {
    const settings = await this.groupSettingsRepo.getSettings(chatId);
    return settings ? settings.vote_kick_enabled === 1 : true; // default enabled
  }

  private async isVerificationEnabled(chatId: string): Promise<boolean> {
    const settings = await this.groupSettingsRepo.getSettings(chatId);
    return settings ? settings.verification_enabled === 1 : true; // default enabled (入群验证)
  }

  private async isMessageVerificationEnabled(chatId: string): Promise<boolean> {
    const settings = await this.groupSettingsRepo.getSettings(chatId);
    return settings ? settings.message_verification_enabled === 1 : true; // default enabled (首次发消息验证)
  }

  private async isAutoCleanupEnabled(chatId: string): Promise<boolean> {
    const settings = await this.groupSettingsRepo.getSettings(chatId);
    return settings ? settings.auto_cleanup_enabled === 1 : true; // default enabled
  }

  // ── Helpers ─────────────────────────────────────────────────────────────

  private async reply(chatId: string, text: string): Promise<void> {
    await this.botMessageService.sendMessage(chatId, text);
  }

  private get initiatorCooldown(): number {
    return Number(this.env.INITIATOR_COOLDOWN_SECONDS ?? 600);
  }

  private get targetCooldown(): number {
    return Number(this.env.TARGET_COOLDOWN_SECONDS ?? 1800);
  }

  private async isAdminOrCreator(chatId: string, userId: string): Promise<boolean> {
    try {
      const member = await this.tg.getChatMember(chatId, userId);
      return member && (member.status === 'administrator' || member.status === 'creator');
    } catch {
      return false;
    }
  }

  private get minWeightToInitiate(): number {
    return Number(this.env.MIN_WEIGHT_TO_INITIATE ?? 1.0);
  }

  // ── Message handler ──────────────────────────────────────────────────────

  async handlePrivateStart(userId: string, triggerMessageId?: number): Promise<void> {
    if (!this.enableVerification) return;

    console.log('[私聊] /verify from user:', userId);

    await this.verificationService.sendPrivateVerificationPrompt(userId);

    if (triggerMessageId) {
      try {
        console.log(`[删除] 用户命令消息: ${triggerMessageId}`);
        await this.tg.deleteMessage(userId, triggerMessageId);
      } catch {}
    }
  }

  async sendHelpMessage(chatId: string): Promise<void> {
    const helpText = this.renderService.renderStartGuide();
    try {
      await this.botMessageService.sendEphemeralMessage(chatId, helpText, { parse_mode: 'HTML' });
    } catch (e) {
      console.error('Failed to send help message:', e);
    }
  }

  async handleMessage(msg: TelegramMessage): Promise<void> {
    const chatType = msg.chat.type;

    if (chatType === 'private') {
      return;
    }

    const from = msg.from;
    const chat = msg.chat;

    if (!from || from.is_bot) return;

    // Ignore Telegram service messages for new member joins.
    // Otherwise the join event itself is mistaken for the user's first message.
    if (msg.new_chat_members && msg.new_chat_members.length > 0) {
      return;
    }

    const chatId = String(chat.id);
    const userId = String(from.id);
    const rawText = String(msg.text ?? '').toLowerCase().trim();

    // 日志: 收到消息
    const msgPreview = msg.text ? msg.text.slice(0, 50) : '(无文字)';
    console.log(`[消息] 群: ${chat.title || 'Unknown'} (${chatId}) | 用户: ${from.username || from.first_name || 'Unknown'} (${userId}) | 内容: ${msgPreview}`);

    // ── Handle /start in private chat ────────────────────────────────────
    if (chat.type === 'private' && rawText.startsWith('/start')) {
      const guide = this.renderService.renderStartGuide();
      await this.botMessageService.sendMessage(chatId, guide);
      return;
    }

    if (chat.type === 'private') return;

    // ── Message verification flow (首次发消息验证) ─────────────────────
    const messageVerificationEnabled = await this.isMessageVerificationEnabled(chatId);
    if (this.enableVerification && messageVerificationEnabled) {
      const pending = await this.verificationService.ensurePendingForMessageVerification(chatId, userId);
      if (pending) {
        // 记录消息到 pending_deletions
        await this.pendingDeletionsRepo.create({
          chat_id: chatId,
          user_id: userId,
          message_id: msg.message_id,
          content: msg.text ?? undefined,
          reason: 'verification_pending',
        });
        // 禁言用户
        console.log(`[禁言] 用户: ${from.username || from.first_name} (${userId}) | 原因: 首次发消息验证`);
        await this.tg.restrictChatMember(chatId, userId);
        // 发送验证提示
        const userDisplay = from.username ? `@${from.username}` : (from.first_name || '新成员');
        await this.verificationService.sendVerificationPrompt(chatId, userId, msg.message_id, userDisplay);
        return; // 停止处理消息
      }
    }

    // Always update weight on every message
    await this.weightService.updateUserWeight(chatId, userId, from.username ?? null, from.first_name);

    const isKick = rawText.startsWith('/kick') || (rawText.includes('kick') && rawText.length < 50);

    if (!isKick) return;

    // Check if vote kick is enabled for this group
    const voteKickEnabled = await this.isVoteKickEnabled(chatId);
    if (!voteKickEnabled) {
      return; // Vote kick is disabled, ignore the command
    }

    const replyMsg = msg.reply_to_message ?? null;
    await this.initiateVote(msg, replyMsg);
  }

  /**
   * 处理新成员加入 (小群用 message.new_chat_members)
   */
  async handleNewChatMember(msg: TelegramMessage): Promise<void> {
    if (!msg.new_chat_members) return;

    const chatId = String(msg.chat.id);
    const verificationEnabled = await this.isVerificationEnabled(chatId);
    
    if (!this.enableVerification || !verificationEnabled) return;

    for (const newMember of msg.new_chat_members) {
      if (newMember.is_bot) continue; // 不跟踪机器人

      const userId = String(newMember.id);
      await this.verificationService.handleNewChatMember(
        chatId,
        userId,
        newMember.username ?? null,
        newMember.first_name,
      );
    }
  }

  /**
   * 处理chat_member更新 (大群用)
   */
  async handleChatMemberUpdate(update: TelegramChatMemberUpdate): Promise<void> {
    const chatId = String(update.chat.id);
    
    // 入群验证 - 受 verification_enabled 控制
    const verificationEnabled = await this.isVerificationEnabled(chatId);
    if (!this.enableVerification || !verificationEnabled) return;
    if (update.new_chat_member.user.is_bot) return; // 跳过机器人

    const user = update.new_chat_member.user;
    const userId = String(user.id);
    await this.verificationService.handleNewChatMember(
      chatId,
      userId,
      user.username ?? null,
      user.first_name,
    );
  }

  // ── Initiate vote ────────────────────────────────────────────────────────

  async initiateVote(msg: TelegramMessage, replyMsg: any): Promise<void> {
    const from = msg.from;
    const chat = msg.chat;

    // Check if vote kick is enabled for this group
    const voteKickEnabled = await this.isVoteKickEnabled(chat.id);
    if (!voteKickEnabled) {
      // Vote kick is disabled for this group, ignore the command
      return;
    }

    if (!from || !replyMsg?.from) {
      // 无效请求直接无视不报错
      return;
    }

    const chatId = String(chat.id);
    const initiatorId = String(from.id);
    const now = Math.floor(Date.now() / 1000);

    // ── Guard: minimum weight to initiate ──────────────────────────────────
    const initiatorWeight = await this.weightService.getUserWeight(chatId, initiatorId);
    if (initiatorWeight < this.minWeightToInitiate) {
      await this.reply(
        chatId,
        `❌ 你的信誉权重不足（当前 ${initiatorWeight.toFixed(2)}，需要 ${this.minWeightToInitiate}），无法发起投票`,
      );
      return;
    }

    // ── Guard: initiator cooldown ──────────────────────────────────────────
    const lastByInitiator = await this.votesRepo.getLastVoteByInitiator(chatId, initiatorId);
    if (lastByInitiator) {
      const elapsed = now - lastByInitiator.created_at;
      const remaining = this.initiatorCooldown - elapsed;
      if (remaining > 0) {
        await this.reply(chatId, `❌ 发起冷却中，请等待 ${remaining} 秒`);
        return;
      }
    }

    const target = replyMsg.from;
    const targetId = String(target.id);

    if (target.is_bot) {
      await this.reply(chatId, '❌ 不能投机器人');
      return;
    }

    if (targetId === initiatorId) {
      await this.reply(chatId, '❌ 不能投自己');
      return;
    }

    // ── Guard: cannot kick admins ──────────────────────────────────────────
    const member = await this.tg.getChatMember(chatId, targetId);
    if (member && (member.status === 'administrator' || member.status === 'creator')) {
      await this.reply(chatId, '❌ 不能投管理员');
      return;
    }

    // ── Guard: already active vote for this target ─────────────────────────
    const existing = await this.votesRepo.getActiveVoteForTarget(chatId, targetId);
    if (existing) {
      await this.reply(chatId, '❌ 已有进行中的投票');
      return;
    }

    // ── Guard: target cooldown ─────────────────────────────────────────────
    const lastForTarget = await this.votesRepo.getLastVoteForTarget(chatId, targetId);
    if (lastForTarget) {
      const elapsed = now - lastForTarget.created_at;
      const remaining = this.targetCooldown - elapsed;
      if (remaining > 0) {
        await this.reply(chatId, `❌ 该用户冷却中，请等待 ${remaining} 秒`);
        return;
      }
    }

    // ── Create vote ────────────────────────────────────────────────────────
    const voteId = generateId();
    const duration = Number(this.env.VOTE_DURATION_SECONDS ?? 300);
    const baseThreshold = Number(this.env.BASE_VOTE_THRESHOLD ?? 20);
    const targetWeight = await this.weightService.getUserWeight(chatId, targetId);
    // 新阈值公式：40 * (1 + sqrt(weight) / 5)
    const threshold = Math.round(40 * (1 + Math.sqrt(targetWeight) / 5));
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
      status: 'active',
      quoted_text: replyMsg.text ?? null,
      message_id: null,
      expires_at: expiresAt,
    });

    const vote = await this.votesRepo.getVote(voteId);
    if (!vote) return;

    const text = this.renderService.renderVoteMessage(vote);
    const keyboard = this.renderService.buildVoteKeyboard(voteId);

    const sent = await this.botMessageService.sendMessage(chatId, text, { reply_markup: keyboard }, 300);
    if (sent?.message_id) {
      await this.votesRepo.updateMessageId(voteId, sent.message_id);
    }

    // 日志: 投票发起
    console.log(`[投票] 发起: ${from.username || from.first_name} (${initiatorId}) → 目标: ${target.username || target.first_name} (${targetId}) | 阈值: ${threshold}`);
  }

  // ── Callback handler ─────────────────────────────────────────────────────

  async handleCallback(cb: TelegramCallbackQuery): Promise<void> {
    const data = cb.data;
    const from = cb.from;
    const message = cb.message;

    if (!data || !message) return;

    const parts = data.split(':');
    if (parts.length < 2) return;

    const [action, ...rest] = parts;

    // ── Handle verification callback ─────────────────────────────────────
    if (action === 'verify') {
      const verificationId = rest[0];
      const chatId = String(message.chat.id);
      const userId = String(from.id);
      await this.verificationService.handleVerificationCallback(
        verificationId,
        chatId,
        userId,
        cb.id,
      );
      return;
    }

    // ── Handle vote callback ────────────────────────────────────────────
    if (action === 'vote' && rest.length === 2) {
      const [voteId, rawChoice] = rest;
      if (rawChoice !== 'yes' && rawChoice !== 'no') return;

      const choice: VoteChoice = rawChoice;
      const chatId = String(message.chat.id);
      const voterId = String(from.id);

      const vote = await this.votesRepo.getVote(voteId);
      if (!vote || vote.status !== 'active') {
        await this.tg.answerCallbackQuery(cb.id, '❌ 已结束', true);
        return;
      }

      let weight = await this.weightService.getUserWeight(chatId, voterId);
      if (weight < 0.1) weight = 1;

      // 使用权重直接作为投票力度（不再取平方根）
      const power = weight;

      const inserted = await this.recordsRepo.createRecord(voteId, chatId, voterId, choice, power);
      if (!inserted) {
        const vote = await this.votesRepo.getVote(voteId);
        if (vote) {
          const now = Math.floor(Date.now() / 1000);
          const remaining = vote.expires_at - now;
          await this.tg.answerCallbackQuery(cb.id, `❌ 已投票，剩余 ${remaining} 秒`);
        } else {
          await this.tg.answerCallbackQuery(cb.id, '❌ 你已投票');
        }
        return;
      }

      const yesDelta = choice === 'yes' ? power : 0;
      const noDelta = choice === 'no' ? power : 0;
      const updatedActive = await this.votesRepo.incrementVoteWeights(voteId, yesDelta, noDelta);
      if (!updatedActive) {
        await this.tg.answerCallbackQuery(cb.id, '❌ 已结束', true);
        return;
      }

      const updated = await this.votesRepo.getVote(voteId);
      if (!updated) return;

      await this.tg.answerCallbackQuery(cb.id, `+${power.toFixed(2)}`);

      if (updated.yes_weight >= updated.threshold) {
        await this.settleVote(updated, 'passed');
        return;
      }

      if (updated.no_weight >= updated.threshold) {
        await this.settleVote(updated, 'rejected');
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

  async settleVote(
    vote: DbVote,
    status: 'passed' | 'rejected' | 'expired',
  ): Promise<void> {
    await this.votesRepo.updateVoteStatus(vote.vote_id, status);

    const updated = await this.votesRepo.getVote(vote.vote_id);
    if (!updated) return;

    if (status !== 'passed') {
      // 日志: 投票失败/过期，删除消息
      console.log(`[投票结束] 状态: ${status} | 目标: ${vote.target_username || vote.target_user_id}`);
      if (updated.message_id) {
        try {
          console.log(`[删除] 投票UI消息: ${updated.message_id}`);
          await this.botMessageService.deleteMessage(vote.chat_id, updated.message_id);
        } catch {}
      }

      const userMessageIds = [updated.initiator_message_id];
      for (const msgId of userMessageIds) {
        if (!msgId) continue;
        try {
          console.log(`[删除] 发起人消息: ${msgId}`);
          await this.tg.deleteMessage(vote.chat_id, msgId);
        } catch {}
      }
      return;
    }

    // Update vote message to show result
    let botMessageId = updated.message_id;
    if (botMessageId) {
      const text = this.renderService.renderResultMessage(updated);
      await this.botMessageService.editMessageText(
        vote.chat_id,
        botMessageId,
        text,
        { reply_markup: { inline_keyboard: [] } },
      );
      await this.votesRepo.updateBotMessageId(vote.vote_id, botMessageId);
    }

    // Delete target message
    if (updated.target_message_id) {
      try {
        console.log(`[删除] 目标消息: ${updated.target_message_id}`);
        await this.tg.deleteMessage(vote.chat_id, updated.target_message_id);
      } catch {}
    }

    // Delete initiator message
    if (updated.initiator_message_id) {
      try {
        console.log(`[删除] 发起人消息: ${updated.initiator_message_id}`);
        await this.tg.deleteMessage(vote.chat_id, updated.initiator_message_id);
      } catch {}
    }

    // Kick, unban (remove from group, can rejoin), then restrict (mute)
    console.log(`[踢出] 目标: ${vote.target_username || vote.target_first_name || vote.target_user_id} (${vote.target_user_id}) | 票力: ${vote.yes_weight} >= ${vote.threshold}`);
    try {
      await this.tg.kickChatMember(vote.chat_id, vote.target_user_id);
      await this.tg.unbanChatMember(vote.chat_id, vote.target_user_id);
      await this.tg.restrictChatMember(vote.chat_id, vote.target_user_id, Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60);
      console.log(`[禁言] 目标: ${vote.target_username || vote.target_first_name || vote.target_user_id} | 原因: 投票踢出 | 期限: 永久`);
    } catch (e) {
      console.error('[踢出] 失败:', e);
    }
  }

  // ── Cron: expire votes and verifications ───────────────────────────────

  async processExpiredVotes(): Promise<void> {
    const list = await this.votesRepo.getExpiredActiveVotes();
    for (const v of list) {
      await this.settleVote(v, 'expired');
    }
  }

  async processExpiredVerifications(): Promise<void> {
    if (!this.enableVerification) return;
    await this.verificationService.processExpiredVerifications();
  }

  async processOldKickFeedbackMessages(): Promise<void> {
    const passedVotes = await this.votesRepo.getPassedVotesWithBotMessage();
    const now = Math.floor(Date.now() / 1000);
    const deleteAfterSeconds = 30;
    
    for (const vote of passedVotes) {
      if (!vote.bot_message_id) continue;
      if (vote.created_at + deleteAfterSeconds > now) continue;
      
      try {
        console.log(`[删除] 踢出反馈消息: ${vote.bot_message_id}`);
        await this.tg.deleteMessage(vote.chat_id, vote.bot_message_id);
      } catch {}
      await this.votesRepo.updateBotMessageId(vote.vote_id, 0);
    }

    const expiredMessages = await this.botMessagesRepo.getExpiredMessages(now);
    for (const msg of expiredMessages) {
      try {
        console.log(`[删除] 提示消息: ${msg.message_id} (已过期)`);
        await this.tg.deleteMessage(msg.chat_id, msg.message_id);
      } catch {}
      await this.botMessagesRepo.markDeleted(msg.chat_id, msg.message_id);
    }
  }
}
