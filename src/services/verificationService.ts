// src/services/verificationService.ts
type D1Database = any;

import { VerificationsRepo, DbVerification } from '../db/verificationsRepo';
import { TelegramAPI } from '../telegram';
import { RenderService } from './renderService';
import { Env } from '../types';
import { BotMessageService } from './botMessageService';
import { PendingDeletionsRepo } from '../db/pendingDeletionsRepo';

function generateVerificationId(): string {
  return `vrfy_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export class VerificationService {
  private verificationsRepo: VerificationsRepo;
  private renderService: RenderService;
  private botUsername: string = '';

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

    // 检查是否已通过入群验证
    const verified = await this.verificationsRepo.getVerifiedUser(chatId, userId);
    if (verified) {
      return;
    }

    // 检查是否已通过首次发消息验证
    const messageVerified = await this.verificationsRepo.getMessageVerifiedUser(chatId, userId);
    if (messageVerified) {
      return;
    }

    const pending = await this.verificationsRepo.getPendingVerification(chatId, userId);
    if (pending) {
      return;
    }

    // 创建待验证记录
    const verificationId = generateVerificationId();
    const expiresAt = 0;

    await this.verificationsRepo.createVerification(chatId, userId, verificationId, expiresAt, 'group');

    // 禁言新成员
    await this.tg.restrictChatMember(chatId, userId, Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60);
    console.log(`[禁言] 用户: ${userId} | 原因: 新成员验证`);

    // 发送带 deep link 的验证提示到群里
    let userDisplay: string;
    if (userName && userName.length > 0) {
      userDisplay = `@${userName}`;
    } else if (firstName && firstName.length > 0) {
      userDisplay = `(${firstName})`;
    } else {
      userDisplay = '新用户';
    }
    
    const text = `🤖 <b>新成员验证：</b> ${userDisplay} (ID: ${userId})\n请点击下方按钮添加机器人进行验证`;
    const keyboard = {
      inline_keyboard: [
        [{ text: '🤖 点击此处添加机器人验证', url: `https://t.me/${this.botUsername}?start=verify_${verificationId}` }]
      ]
    };

    const sent = await this.botMessageService.sendMessage(chatId, text, { reply_markup: keyboard, parse_mode: 'HTML' }, 60);

    if (sent?.message_id) {
      await this.verificationsRepo.setPromptMessage(verificationId, sent.message_id, 0);
    }

    console.log(`[Verification] New member joined: ${userId} in chat ${chatId}`);
  }

  async handleNewChatMemberFromPrivate(chatId: string, userId: string, userName: string | null, firstName: string | null): Promise<string | null> {
    void userName;
    void firstName;

    if (await this.verificationsRepo.isBanned(chatId, userId)) {
      return null;
    }

    const verified = await this.verificationsRepo.getVerifiedUser(chatId, userId);
    if (verified) {
      return 'verified';
    }

    const pending = await this.verificationsRepo.getPendingVerification(chatId, userId);
    if (pending) {
      return pending.verification_id;
    }

    const verificationId = generateVerificationId();
    const expiresAt = 0;

    await this.verificationsRepo.createVerification(chatId, userId, verificationId, expiresAt, 'private');

    console.log(`[Verification] Private verification: ${userId} in chat ${chatId}`);

    return verificationId;
  }

  /**
   * 检查用户是否有待处理的验证（首次发消息时）。
   * 只返回已有的 pending 记录，不创建新记录。
   * pending 由 handleNewChatMember（入群验证）负责创建。
   */
  async ensurePendingForMessageVerification(chatId: string, userId: string): Promise<DbVerification | null> {
    const isBanned = await this.verificationsRepo.isBanned(chatId, userId);
    if (isBanned) {
      return null;
    }

    const verified = await this.verificationsRepo.getVerifiedUser(chatId, userId);
    if (verified) {
      return null;
    }

    const messageVerified = await this.verificationsRepo.getMessageVerifiedUser(chatId, userId);
    if (messageVerified) {
      return null;
    }

    return await this.verificationsRepo.getPendingVerification(chatId, userId) ?? null;
  }

  /**
   * 发送验证提示消息
   */
  async sendVerificationPrompt(chatId: string, userId: string, triggerMessageId: number, userDisplay: string): Promise<void> {
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

    const text = this.renderService.renderVerificationPrompt(userDisplay, userId);
    const keyboard = this.renderService.buildVerificationKeyboard(pending.verification_id);
    const expiresAt = Math.floor(Date.now() / 1000) + this.verificationDurationSeconds;

    const sent = await this.botMessageService.sendMessage(chatId, text, { reply_markup: keyboard }, 60);

    if (sent?.message_id) {
      await this.verificationsRepo.activateVerification(
        pending.verification_id,
        sent.message_id,
        triggerMessageId,
        expiresAt,
      );
    }
  }

  setBotUsername(username: string): void {
    this.botUsername = username;
  }

  async sendPrivateVerificationPrompt(userId: string): Promise<void> {
    // 先查找用户是否有私聊验证记录
    let pending = await this.verificationsRepo.getPendingVerificationByUser(userId);
    
    // 如果已有记录且是私聊验证，直接发送按钮
    if (pending && pending.source === 'private') {
      const text = this.renderService.renderPrivateVerificationPrompt(this.botUsername);
      const keyboard = this.renderService.buildPrivateVerificationKeyboard(pending.verification_id);
      
      await this.botMessageService.sendMessage(String(userId), text, { reply_markup: keyboard });
      return;
    }

    // 查找用户的入群验证记录（在群里发起的）
    const groupPending = await this.verificationsRepo.getAnyPendingVerification(userId);
    if (!groupPending) {
      await this.botMessageService.sendMessage(String(userId), 'ℹ️ 你目前没有待验证的入群请求。\n\n请先加入需要验证的群组，然后再次尝试。', {});
      return;
    }

    // 删除旧的 group pending 记录，避免 UNIQUE 约束冲突
    await this.verificationsRepo.updateVerificationStatus(groupPending.verification_id, 'expired');

    // 创建 source='private' 的 verification
    const privateVerificationId = generateVerificationId();
    await this.verificationsRepo.createVerification(
      groupPending.chat_id,  // 用群ID
      userId,
      privateVerificationId,
      0,
      'private',  // source='private'
    );

    const text = this.renderService.renderPrivateVerificationPrompt(this.botUsername);
    const keyboard = this.renderService.buildPrivateVerificationKeyboard(privateVerificationId);
    const expiresAt = Math.floor(Date.now() / 1000) + this.verificationDurationSeconds;

    const sent = await this.botMessageService.sendMessage(String(userId), text, { reply_markup: keyboard });

    if (sent?.message_id) {
      await this.verificationsRepo.activateVerification(
        privateVerificationId,
        sent.message_id,
        0,
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
    console.log('[验证回调] verificationId=' + verificationId + ' chatId=' + chatId + ' userId=' + userId);
    
    const verification = await this.verificationsRepo.getVerification(verificationId);

    if (!verification) {
      console.log('[验证回调] verification not found: ' + verificationId);
      await this.tg.answerCallbackQuery(callbackQueryId, '❌ 验证不存在', true);
      return false;
    }

    console.log('[验证回调] found verification: source=' + verification.source + ' status=' + verification.status + ' user_id=' + verification.user_id);

    if (verification.user_id !== userId) {
      console.log('[验证回调] user_id mismatch: expected ' + verification.user_id + ' got ' + userId);
      await this.tg.answerCallbackQuery(callbackQueryId, '❌ 只能验证你自己的账号', true);
      return false;
    }

    if (verification.source === 'private') {
      console.log('[验证回调] handling private verification');
      return await this.handlePrivateVerificationCallback(verificationId, chatId, userId, callbackQueryId, verification);
    }

    if (verification.chat_id !== chatId) {
      await this.tg.answerCallbackQuery(callbackQueryId);
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
    const unrestricted = await this.tg.unrestrictChatMember(verification.chat_id, verification.user_id);
    if (!unrestricted) {
      await this.tg.answerCallbackQuery(callbackQueryId, '❌ 验证处理中，请稍后重试', true);
      return false;
    }

    // 验证成功
    await this.verificationsRepo.updateVerificationStatus(verificationId, 'verified', verification.message_id ?? undefined);
    // 标记为已通过首次发消息验证
    await this.verificationsRepo.updateMessageVerified(verificationId, true);
    await this.tg.answerCallbackQuery(callbackQueryId, '✅ 验证成功！');

    // 只删除验证消息，不删除用户首发消息
    if (verification.message_id) {
      try {
        await this.botMessageService.deleteMessage(verification.chat_id, verification.message_id);
      } catch (e) {
        console.error('Failed to delete verification message after success:', e);
      }
    }

    // 清理该用户的 pending_deletions 记录
    await this.pendingDeletionsRepo.deleteByUser(verification.chat_id, userId);

    return true;
  }

  private async handlePrivateVerificationCallback(
    verificationId: string,
    chatId: string,
    userId: string,
    callbackQueryId: string,
    verification: DbVerification,
  ): Promise<boolean> {
    console.log('[私聊验证] starting for verification: ' + verificationId + ' status=' + verification.status);
    
    if (verification.status !== 'pending') {
      console.log('[私聊验证] status not pending: ' + verification.status);
      await this.tg.answerCallbackQuery(callbackQueryId, '❌ 验证状态异常', true);
      return false;
    }

    const now = Math.floor(Date.now() / 1000);
    if (now > verification.expires_at) {
      console.log('[私聊验证] expired: ' + verification.expires_at + ' now=' + now);
      await this.tg.answerCallbackQuery(callbackQueryId, '❌ 验证已过期，请重新发起验证', true);
      return false;
    }

    const groupChatId = verification.chat_id;
    console.log('[私聊验证] will unrestrict user in group: ' + groupChatId);

    // 解除群里的禁言
    const unrestricted = await this.tg.unrestrictChatMember(groupChatId, verification.user_id);
    if (!unrestricted) {
      await this.tg.answerCallbackQuery(callbackQueryId, '❌ 验证处理中，请稍后重试', true);
      return false;
    }

    // 验证成功 - 入群验证
    await this.verificationsRepo.updateVerificationStatus(verificationId, 'verified', verification.message_id ?? undefined);
    // 标记为已通过首次发消息验证（入群验证后也标记，这样首次发消息就不需要再验证了）
await this.verificationsRepo.updateMessageVerified(verificationId, true);
await this.tg.answerCallbackQuery(callbackQueryId, '✅ 验证成功！');

    // 删除群里验证消息（优先使用 source='group' 的入群验证记录）
    let groupMessageId = verification.group_message_id;
    if (!groupMessageId && verification.source === 'private') {
      const groupVerif = await this.verificationsRepo.getGroupVerification(verification.chat_id, verification.user_id);
      if (groupVerif) {
        groupMessageId = groupVerif.group_message_id;
      }
    }
    if (groupMessageId) {
      try {
        await this.botMessageService.deleteMessage(verification.chat_id, groupMessageId);
      } catch (e) {
        console.error('Failed to delete group verification message:', e);
      }
    }

    // 删除私聊验证消息
    if (verification.message_id) {
      try {
        await this.botMessageService.deleteMessage(chatId, verification.message_id);
      } catch (e) {
        console.error('Failed to delete private verification message:', e);
      }
    }

    // 通知用户验证成功（私聊发送）
    try {
      await this.botMessageService.sendMessage(chatId, `✅ <b>${verification.user_id}</b> 验证成功！欢迎加入群组。`, { parse_mode: 'HTML' });
    } catch (e) {
      console.error('Failed to notify user:', e);
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
    
    // 直接进行 BAN（踢出并永久禁止重新加入）
    await this.tg.banChatMember(chatId, userId, true);
    console.log(`[Verification] User ${userId} banned from chat ${chatId} due to verification failure`);

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
