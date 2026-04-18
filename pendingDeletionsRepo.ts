// pendingDeletionsRepo.ts
type D1Database = any;

export interface PendingDeletion {
  id?: number;
  chat_id: string;
  user_id: string;
  message_id: number;
  content?: string;
  reason?: string;
  status: 'pending' | 'failed' | 'deleted';
  created_at?: number;
  expires_at?: number;
  deleted_at?: number;
}

export class PendingDeletionsRepo {
  constructor(private db: D1Database) {}

  async create(data: {
    chat_id: string;
    user_id: string;
    message_id: number;
    content?: string;
    reason?: string;
    expires_at?: number;
  }): Promise<void> {
    await this.db
      .prepare(`
        INSERT OR REPLACE INTO pending_deletions 
        (chat_id, user_id, message_id, content, reason, status, expires_at)
        VALUES (?, ?, ?, ?, ?, 'pending', ?)
      `)
      .bind(data.chat_id, data.user_id, data.message_id, data.content ?? null, data.reason ?? null, data.expires_at ?? null)
      .run();
  }

  async getPending(limit = 100): Promise<PendingDeletion[]> {
    const result = await this.db
      .prepare('SELECT * FROM pending_deletions WHERE status = ? ORDER BY created_at ASC LIMIT ?')
      .bind('pending', limit)
      .all<PendingDeletion>();
    return result.results ?? [];
  }

  async markDeleted(id: number): Promise<void> {
    const now = Math.floor(Date.now() / 1000);
    await this.db
      .prepare('UPDATE pending_deletions SET status = ?, deleted_at = ? WHERE id = ?')
      .bind('deleted', now, id)
      .run();
  }

  async markFailed(id: number): Promise<void> {
    await this.db
      .prepare('UPDATE pending_deletions SET status = ? WHERE id = ?')
      .bind('failed', id)
      .run();
  }

  async deleteExpired(): Promise<number> {
    const now = Math.floor(Date.now() / 1000);
    const result = await this.db
      .prepare('DELETE FROM pending_deletions WHERE expires_at IS NOT NULL AND expires_at < ? AND status = ?')
      .bind(now, 'pending')
      .run();
    return result.success ? result.meta.changes : 0;
  }

  async getByUser(chatId: string, userId: string): Promise<PendingDeletion[]> {
    const result = await this.db
      .prepare('SELECT * FROM pending_deletions WHERE chat_id = ? AND user_id = ? AND status = ? ORDER BY created_at ASC')
      .bind(chatId, userId, 'pending')
      .all<PendingDeletion>();
    return result.results ?? [];
  }

  async deleteByUser(chatId: string, userId: string): Promise<number> {
    const result = await this.db
      .prepare('DELETE FROM pending_deletions WHERE chat_id = ? AND user_id = ?')
      .bind(chatId, userId)
      .run();
    return result.success ? result.meta.changes : 0;
  }
}