// src/db/verificationsRepo.ts
type D1Database = any;

export interface DbVerification {
  id: number;
  chat_id: string;
  user_id: string;
  verification_id: string;
  status: 'pending' | 'verified' | 'failed' | 'expired' | 'banned';
  failure_count: number;
  message_id: number | null;
  trigger_message_id: number | null;
  created_at: number;
  expires_at: number;
  verified_at: number | null;
}

export class VerificationsRepo {
  constructor(private db: D1Database) {}

  async createVerification(
    chatId: string,
    userId: string,
    verificationId: string,
    expiresAt: number,
  ): Promise<DbVerification> {
    const now = Math.floor(Date.now() / 1000);
    await this.db
      .prepare(`
        INSERT INTO user_verifications 
        (chat_id, user_id, verification_id, status, failure_count, created_at, expires_at)
        VALUES (?, ?, ?, 'pending', 0, ?, ?)
      `)
      .bind(chatId, userId, verificationId, now, expiresAt)
      .run();

    return (await this.getVerification(verificationId))!;
  }

  async getVerification(verificationId: string): Promise<DbVerification | null> {
    const result = await this.db
      .prepare('SELECT * FROM user_verifications WHERE verification_id = ?')
      .bind(verificationId)
      .first();

    return (result as DbVerification | null) ?? null;
  }

  async getPendingVerification(chatId: string, userId: string): Promise<DbVerification | null> {
    const result = await this.db
      .prepare(`
        SELECT * FROM user_verifications
        WHERE chat_id = ? AND user_id = ? AND status = 'pending'
        ORDER BY created_at DESC
        LIMIT 1
      `)
      .bind(chatId, userId)
      .first();

    return (result as DbVerification | null) ?? null;
  }

  async updateVerificationStatus(
    verificationId: string,
    status: DbVerification['status'],
    messageId?: number,
  ): Promise<void> {
    const now = Math.floor(Date.now() / 1000);
    const sets = ['status = ?'];
    const params: Array<string | number> = [status];

    if (status === 'verified') {
      sets.push('verified_at = ?');
      params.push(now);
    }

    if (typeof messageId === 'number') {
      sets.push('message_id = ?');
      params.push(messageId);
    }

    params.push(verificationId);

    await this.db
      .prepare(`UPDATE user_verifications SET ${sets.join(', ')} WHERE verification_id = ?`)
      .bind(...params)
      .run();
  }

  async setPromptMessage(
    verificationId: string,
    messageId: number,
    triggerMessageId: number,
  ): Promise<void> {
    await this.db
      .prepare(`
        UPDATE user_verifications
        SET message_id = ?, trigger_message_id = COALESCE(trigger_message_id, ?)
        WHERE verification_id = ?
      `)
      .bind(messageId, triggerMessageId, verificationId)
      .run();
  }

  async activateVerification(
    verificationId: string,
    messageId: number,
    triggerMessageId: number,
    expiresAt: number,
  ): Promise<void> {
    await this.db
      .prepare(`
        UPDATE user_verifications
        SET message_id = ?,
            trigger_message_id = COALESCE(trigger_message_id, ?),
            expires_at = ?
        WHERE verification_id = ?
      `)
      .bind(messageId, triggerMessageId, expiresAt, verificationId)
      .run();
  }

  async setTriggerMessageIdIfEmpty(verificationId: string, triggerMessageId: number): Promise<void> {
    await this.db
      .prepare(`
        UPDATE user_verifications
        SET trigger_message_id = COALESCE(trigger_message_id, ?)
        WHERE verification_id = ?
      `)
      .bind(triggerMessageId, verificationId)
      .run();
  }

  async incrementFailureCount(verificationId: string): Promise<void> {
    await this.db
      .prepare('UPDATE user_verifications SET failure_count = failure_count + 1 WHERE verification_id = ?')
      .bind(verificationId)
      .run();
  }

  async getExpiredPendingVerifications(): Promise<DbVerification[]> {
    const now = Math.floor(Date.now() / 1000);
    const result = await this.db
      .prepare(`
        SELECT * FROM user_verifications
        WHERE status = 'pending'
          AND message_id IS NOT NULL
          AND expires_at < ?
      `)
      .bind(now)
      .all();

    return ((result as { results?: DbVerification[] } | null)?.results) ?? [];
  }

  async getFailedVerificationForUser(chatId: string, userId: string): Promise<DbVerification | null> {
    const result = await this.db
      .prepare(`
        SELECT * FROM user_verifications
        WHERE chat_id = ? AND user_id = ? AND status = 'failed'
        ORDER BY created_at DESC
        LIMIT 1
      `)
      .bind(chatId, userId)
      .first();

    return (result as DbVerification | null) ?? null;
  }

  async getVerifiedUser(chatId: string, userId: string): Promise<DbVerification | null> {
    const result = await this.db
      .prepare("SELECT * FROM user_verifications WHERE chat_id = ? AND user_id = ? AND status = 'verified' LIMIT 1")
      .bind(chatId, userId)
      .first();

    return (result as DbVerification | null) ?? null;
  }

  async banUser(chatId: string, userId: string): Promise<void> {
    const now = Math.floor(Date.now() / 1000);
    await this.db
      .prepare("UPDATE user_verifications SET status = 'banned' WHERE chat_id = ? AND user_id = ?")
      .bind(chatId, userId)
      .run();
  }

  async isBanned(chatId: string, userId: string): Promise<boolean> {
    const result = await this.db
      .prepare("SELECT COUNT(*) as count FROM user_verifications WHERE chat_id = ? AND user_id = ? AND status = 'banned'")
      .bind(chatId, userId)
      .first();

    return ((((result as { count: number } | null)?.count) ?? 0) > 0);
  }
}
