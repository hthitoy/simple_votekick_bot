import { TelegramAPI } from '../telegram';
import { BotMessagesRepo } from '../db/botMessagesRepo';

export class BotMessageService {
  constructor(
    private tg: TelegramAPI,
    private botMessagesRepo: BotMessagesRepo,
  ) {}

  async sendMessage(
    chatId: string,
    text: string,
    extra: Record<string, unknown> = {},
    ttlSeconds: number = 30,
  ): Promise<{ message_id: number } | null> {
    const sent = await this.tg.sendMessage(chatId, text, extra);
    if (sent?.message_id) {
      await this.botMessagesRepo.upsertMessage(chatId, sent.message_id, text, ttlSeconds);
    }
    return sent;
  }

  async sendEphemeralMessage(
    chatId: string,
    text: string,
    extra: Record<string, unknown> = {},
  ): Promise<{ message_id: number } | null> {
    return await this.tg.sendMessage(chatId, text, extra);
  }

  async editMessageText(
    chatId: string,
    messageId: number,
    text: string,
    extra: Record<string, unknown> = {},
  ): Promise<boolean> {
    const updated = await this.tg.editMessageText(chatId, messageId, text, extra);
    if (updated) {
      await this.botMessagesRepo.upsertMessage(chatId, messageId, text);
    }
    return updated;
  }

  async deleteMessage(chatId: string, messageId: number): Promise<boolean> {
    const deleted = await this.tg.deleteMessage(chatId, messageId);
    if (deleted) {
      await this.botMessagesRepo.markDeleted(chatId, messageId);
    }
    return deleted;
  }
}
