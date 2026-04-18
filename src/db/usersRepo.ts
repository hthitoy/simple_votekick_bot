// src/db/usersRepo.ts
type D1Database = any; // Cloudflare D1

import { DbUser } from '../types';

export class UsersRepo {
  constructor(private db: D1Database) {}

  async getUser(chatId: string, userId: string): Promise<DbUser | null> {
    const result = await this.db
      .prepare('SELECT * FROM users WHERE chat_id = ? AND user_id = ?')
      .bind(chatId, userId)
      .first();

    return (result as DbUser | null) ?? null;
  }

  async upsertUser(
    chatId: string,
    userId: string,
    username: string | null,
    firstName: string | null,
  ): Promise<DbUser> {
    const now = Math.floor(Date.now() / 1000);
    await this.db
      .prepare(`
        INSERT INTO users (chat_id, user_id, username, first_name, weight, last_message_at, last_weight_update_at, joined_at)
        VALUES (?, ?, ?, ?, 1.0, ?, ?, ?)
        ON CONFLICT(chat_id, user_id) DO UPDATE SET
          username = excluded.username,
          first_name = excluded.first_name
      `)
      .bind(chatId, userId, username, firstName, now, now, now)
      .run();

    return (await this.getUser(chatId, userId))!;
  }

  async updateWeight(
    chatId: string,
    userId: string,
    newWeight: number,
    lastMessageAt: number,
  ): Promise<void> {
    const now = Math.floor(Date.now() / 1000);
    await this.db
      .prepare(`
        UPDATE users
        SET weight = ?, last_message_at = ?, last_weight_update_at = ?
        WHERE chat_id = ? AND user_id = ?
      `)
      .bind(newWeight, lastMessageAt, now, chatId, userId)
      .run();
  }
}
