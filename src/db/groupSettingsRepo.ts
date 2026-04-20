// src/db/groupSettingsRepo.ts
type D1Database = any;

export interface GroupSetting {
  chat_id: string;
  vote_kick_enabled: number; // 1 for true, 0 for false
  verification_enabled: number;
  auto_cleanup_enabled: number;
  created_at?: number;
  updated_at?: number;
}

export class GroupSettingsRepo {
  constructor(private db: D1Database) {}

  async getSettings(chatId: string): Promise<GroupSetting | null> {
    const result = await this.db
      .prepare('SELECT * FROM group_settings WHERE chat_id = ?')
      .bind(chatId)
      .first();

    return (result as GroupSetting | null) ?? null;
  }

  async ensureSettingsExist(chatId: string): Promise<void> {
    const existing = await this.getSettings(chatId);
    if (!existing) {
      await this.db
        .prepare(`
          INSERT INTO group_settings (chat_id, vote_kick_enabled, verification_enabled, auto_cleanup_enabled)
          VALUES (?, 1, 1, 1)
        `)
        .bind(chatId)
        .run();
    }
  }

  async updateVoteKickEnabled(chatId: string, enabled: boolean): Promise<void> {
    await this.db
      .prepare(`
        UPDATE group_settings
        SET vote_kick_enabled = ?, updated_at = ?
        WHERE chat_id = ?
      `)
      .bind(enabled ? 1 : 0, Math.floor(Date.now() / 1000), chatId)
      .run();
  }

  async updateVerificationEnabled(chatId: string, enabled: boolean): Promise<void> {
    await this.db
      .prepare(`
        UPDATE group_settings
        SET verification_enabled = ?, updated_at = ?
        WHERE chat_id = ?
      `)
      .bind(enabled ? 1 : 0, Math.floor(Date.now() / 1000), chatId)
      .run();
  }

  async updateAutoCleanupEnabled(chatId: string, enabled: boolean): Promise<void> {
    await this.db
      .prepare(`
        UPDATE group_settings
        SET auto_cleanup_enabled = ?, updated_at = ?
        WHERE chat_id = ?
      `)
      .bind(enabled ? 1 : 0, Math.floor(Date.now() / 1000), chatId)
      .run();
  }
}