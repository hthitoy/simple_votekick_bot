// src/db/votesRepo.ts
type D1Database = any; // Cloudflare D1

import { DbVote } from './types';

export class VotesRepo {
  constructor(private db: D1Database) {}

  async getVote(voteId: string): Promise<DbVote | null> {
    const result = await this.db
      .prepare('SELECT * FROM votes WHERE vote_id = ?')
      .bind(voteId)
      .first();

    return (result as DbVote | null) ?? null;
  }

  async getActiveVoteForTarget(chatId: string, targetUserId: string): Promise<DbVote | null> {
    const result = await this.db
      .prepare("SELECT * FROM votes WHERE chat_id = ? AND target_user_id = ? AND status = 'active'")
      .bind(chatId, targetUserId)
      .first();

    return (result as DbVote | null) ?? null;
  }

  async getActiveVoteForChat(chatId: string): Promise<DbVote | null> {
    const result = await this.db
      .prepare("SELECT * FROM votes WHERE chat_id = ? AND status = 'active' LIMIT 1")
      .bind(chatId)
      .first();

    return (result as DbVote | null) ?? null;
  }

  async getLastVoteByInitiator(chatId: string, initiatorUserId: string): Promise<DbVote | null> {
    const result = await this.db
      .prepare('SELECT * FROM votes WHERE chat_id = ? AND initiator_user_id = ? ORDER BY created_at DESC LIMIT 1')
      .bind(chatId, initiatorUserId)
      .first();

    return (result as DbVote | null) ?? null;
  }

  async getLastVoteForTarget(chatId: string, targetUserId: string): Promise<DbVote | null> {
    const result = await this.db
      .prepare('SELECT * FROM votes WHERE chat_id = ? AND target_user_id = ? ORDER BY created_at DESC LIMIT 1')
      .bind(chatId, targetUserId)
      .first();

    return (result as DbVote | null) ?? null;
  }

  async createVote(vote: Omit<DbVote, 'created_at'>): Promise<void> {
    const now = Math.floor(Date.now() / 1000);
    await this.db
      .prepare(`
        INSERT INTO votes
          (vote_id, chat_id, target_user_id, target_username, target_first_name,
           initiator_user_id, initiator_username, initiator_message_id, target_message_id,
           yes_weight, no_weight, threshold, status, quoted_text, message_id, expires_at, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, 'active', ?, ?, ?, ?)
      `)
      .bind(
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
        now,
      )
      .run();
  }

  async updateVoteWeights(voteId: string, yesWeight: number, noWeight: number): Promise<void> {
    await this.db
      .prepare('UPDATE votes SET yes_weight = ?, no_weight = ? WHERE vote_id = ?')
      .bind(yesWeight, noWeight, voteId)
      .run();
  }

  async incrementVoteWeights(voteId: string, yesDelta: number, noDelta: number): Promise<boolean> {
    const result = await this.db
      .prepare(`
        UPDATE votes
        SET yes_weight = yes_weight + ?, no_weight = no_weight + ?
        WHERE vote_id = ? AND status = 'active'
      `)
      .bind(yesDelta, noDelta, voteId)
      .run();

    return (((result as { meta?: { changes?: number } } | null)?.meta?.changes) ?? 0) > 0;
  }

  async updateVoteStatus(voteId: string, status: DbVote['status']): Promise<void> {
    await this.db
      .prepare('UPDATE votes SET status = ? WHERE vote_id = ?')
      .bind(status, voteId)
      .run();
  }

  async updateMessageId(voteId: string, messageId: number): Promise<void> {
    await this.db
      .prepare('UPDATE votes SET message_id = ? WHERE vote_id = ?')
      .bind(messageId, voteId)
      .run();
  }

  async getExpiredActiveVotes(): Promise<DbVote[]> {
    const now = Math.floor(Date.now() / 1000);
    const result = await this.db
      .prepare("SELECT * FROM votes WHERE status = 'active' AND expires_at < ?")
      .bind(now)
      .all();

    return ((result as { results?: DbVote[] } | null)?.results) ?? [];
  }
}
