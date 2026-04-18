// src/db/voteRecordsRepo.ts
type D1Database = any; // Cloudflare D1

import { DbVoteRecord } from './types';

export class VoteRecordsRepo {
  constructor(private db: D1Database) {}

  async getRecord(voteId: string, voterUserId: string): Promise<DbVoteRecord | null> {
    const result = await this.db
      .prepare('SELECT * FROM vote_records WHERE vote_id = ? AND voter_user_id = ?')
      .bind(voteId, voterUserId)
      .first();

    return (result as DbVoteRecord | null) ?? null;
  }

  async createRecord(
    voteId: string,
    chatId: string,
    voterUserId: string,
    choice: 'yes' | 'no',
    votePower: number,
  ): Promise<boolean> {
    const now = Math.floor(Date.now() / 1000);
    const result = await this.db
      .prepare(`
        INSERT OR IGNORE INTO vote_records (vote_id, chat_id, voter_user_id, choice, vote_power, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `)
      .bind(voteId, chatId, voterUserId, choice, votePower, now)
      .run();

    return (((result as { meta?: { changes?: number } } | null)?.meta?.changes) ?? 0) > 0;
  }

  async getVoteCount(voteId: string): Promise<number> {
    const result = await this.db
      .prepare('SELECT COUNT(*) as count FROM vote_records WHERE vote_id = ?')
      .bind(voteId)
      .first();

    return ((result as { count: number } | null)?.count) ?? 0;
  }
}
