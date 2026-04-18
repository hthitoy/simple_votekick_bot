// src/services/verificationService.ts
type D1Database = any;

import { VerificationsRepo, DbVerification } from './verificationsRepo';
import { TelegramAPI } from './telegram';
import { RenderService } from './renderService';
import { Env } from './types';
import { BotMessageService } from './botMessageService';
import { PendingDeletionsRepo } from './pendingDeletionsRepo';

function generateVerificationId(): string {
  return `vrfy_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export class VerificationService {
  private verificationsRepo: VerificationsRepo;
  private renderService: RenderService;

  constructor(
    private db: D1Database,
    private tg: TelegramAPI,
    private env: Env,
    private botMessageService: BotMessageService,
    private pendingDeletionsRepo: PendingDeletionsRepo,
  ) {
    this.verificationsRepo = new VerificationsRepo(db);
    this.renderService = new RenderService();
    this.pendingDeletionsRepo = pendingDeletionsRepo;
  }

  private get verificationDurationSeconds(): number {
    return 60;
  }

  private get permanentMuteUntil(): number {
    return Math.floor(Date.now() / 1000) + 400 * 24 * 60 * 60;
  }

  /**
   * 当新成员加入群组时调用
   */
  async handleNewChatMember(chatId: string, userId: string, userName: string | null, firstName: string | null): Promise<void> {
    void userName;
    void firstName;

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

    // 创建待验证记录
    const verificationId = generateVerificationId();
    const expiresAt = 0;

    await this.verificationsRepo.createVerification(chatId, userId, verificationId, expiresAt);

    console.log(`[Verification] New member joined: ${userId} in chat ${chatId}`);
  }

  /**
   * 检查用户是否需要验证（第一次发送消息时）
   * 返回 true 表示用户需要验证，应该禁言并展示验证按钮
   */
  async shouldVerifyUser(chatId: string, userId: string): Promise<boolean> {
    // 检查是否已被ban
    const isBanned = await this.verificationsRepo.isBanned(chatId, userId);
    if (isBanned) {
      return false; // 已被ban，不处理
    }

    // 检查是否已验证
    const verified = await this.verificationsRepo.getVerifiedUser(chatId, userId);
    if (verified) {
      return false; // 已验证，无需再验证
    }

    // 检查是否有待验证的记录
    const pending = await this.verificationsRepo.getPendingVerification(chatId, userId);
    return !!pending;
  }

  /**
   * 发送验证提示消息
   */
  async sendVerificationPrompt(chatId: string, userId: string, triggerMessageId: number): Promise<void> {
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
    const expiresAt = Math.floor(Date.now() / 1000) + this.verificationDurationSeconds;

    const sent = await this.botMessageService.sendMessage(chatId, text, { reply_markup: keyboard });

    if (sent?.message_id) {
      await this.verificationsRepo.activateVerification(
        pending.verification_id,
        sent.message_id,
        triggerMessageId,
        expiresAt,
      );
    }
  }

  /**
   * 处理验证按钮点击
   */
  async handleVerificationCallback(
    verificationId: string,
    chatId: string,
    userId: string,
    callbackQueryId: string,
  ): Promise<boolean> {
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
      await this.tg.answerCallbackQuery(callbackQueryId, '❌ 只能验证你自己的账号', true);
      return false;
    }

    if (verification.status !== 'pending') {
      await this.tg.answerCallbackQuery(callbackQueryId);
      return false;
    }

    const now = Math.floor(Date.now() / 1000);
    if (now > verification.expires_at) {
      await this.handleVerificationExpired(verification);
      await this.tg.answerCallbackQuery(callbackQueryId);
      return false;
    }

    // 解除禁言
    const unrestricted = await this.tg.unrestrictChatMember(chatId, verification.user_id);
    if (!unrestricted) {
      await this.tg.answerCallbackQuery(callbackQueryId, '❌ 验证处理中，请稍后重试', true);
      return false;
    }

    // 验证成功
    await this.verificationsRepo.updateVerificationStatus(verificationId, 'verified', verification.message_id ?? undefined);
    await this.tg.answerCallbackQuery(callbackQueryId, '✅ 验证成功！');

    // 只删除验证消息，不删除用户首发消息
    if (verification.message_id) {
      try {
        await this.botMessageService.deleteMessage(chatId, verification.message_id);
      } catch (e) {
        console.error('Failed to delete verification message after success:', e);
      }
    }

    return true;
  }

  /**
   * 处理验证过期 - 踢出用户并删除消息
   */
  async handleVerificationExpired(verification: DbVerification): Promise<void> {
    const current = await this.verificationsRepo.getVerification(verification.verification_id);
    if (!current || current.status !== 'pending') {
      return;
    }

    const chatId = current.chat_id;
    const userId = current.user_id;

    // 从 pending_deletions 读取该用户所有消息并依次删除（最早的先删除）
    const pendingMessages = await this.pendingDeletionsRepo.getByUser(chatId, userId);
    for (const msg of pendingMessages) {
      try {
        await this.tg.deleteMessage(chatId, msg.message_id);
      } catch (e) {
        console.error('Failed to delete user message:', e);
      }
    }
    console.log(`[Verification] Deleted ${pendingMessages.length} user messages from pending_deletions`);

    // 更新验证状态为 banned
    await this.verificationsRepo.updateVerificationStatus(current.verification_id, 'banned', current.message_id ?? undefined);
    
    // 永久禁言用户
    await this.tg.restrictChatMember(chatId, userId, this.permanentMuteUntil);
    console.log(`[Verification] User ${userId} permanently muted in chat ${chatId}`);

    // 静默删除验证消息
    if (current.message_id) {
      try {
        await this.botMessageService.deleteMessage(chatId, current.message_id);
      } catch (e) {
        console.error('Failed to delete verification message:', e);
      }
    }
  }

  /**
   * Cron - 处理过期的验证
   */
  async processExpiredVerifications(): Promise<void> {
    const expired = await this.verificationsRepo.getExpiredPendingVerifications();
    for (const v of expired) {
      await this.handleVerificationExpired(v);
    }
  }
}
