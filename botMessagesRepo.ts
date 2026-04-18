type D1Database = any;

import { DbBotMessage } from './types';

export class BotMessagesRepo {
  constructor(private db: D1Database) {}

  async upsertMessage(
    chatId: string,
    messageId: number,
    content: string | null,
  ): Promise<void> {
    const now = Math.floor(Date.now() / 1000);
    await this.db
      .prepare(`
        INSERT INTO bot_messages (chat_id, message_id, content, status, created_at, updated_at)
        VALUES (?, ?, ?, 'in_progress', ?, ?)
        ON CONFLICT(chat_id, message_id) DO UPDATE SET
          content = excluded.content,
          status = 'in_progress',
          updated_at = excluded.updated_at
      `)
      .bind(chatId, messageId, content, now, now)
      .run();
  }

  async markDeleted(chatId: string, messageId: number): Promise<void> {
    const now = Math.floor(Date.now() / 1000);
    await this.db
      .prepare(`
        UPDATE bot_messages
        SET status = 'deleted', updated_at = ?
        WHERE chat_id = ? AND message_id = ?
      `)
      .bind(now, chatId, messageId)
      .run();
  }

  async getMessage(chatId: string, messageId: number): Promise<DbBotMessage | null> {
    const result = await this.db
      .prepare('SELECT * FROM bot_messages WHERE chat_id = ? AND message_id = ?')
      .bind(chatId, messageId)
      .first();

    return (result as DbBotMessage | null) ?? null;
  }
}
