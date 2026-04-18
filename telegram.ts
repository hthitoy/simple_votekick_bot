// src/telegram.ts

type TgResponse<T> = {
  ok: boolean;
  result?: T;
  description?: string;
};

type TgMessage = {
  message_id: number;
};

type TgChatMember = {
  status: string;
};

export class TelegramAPI {
  private baseUrl: string;

  constructor(private token: string) {
    this.baseUrl = `https://api.telegram.org/bot${token}`;
  }

  private async call<T>(method: string, body: Record<string, unknown>): Promise<T | null> {
    try {
      const res = await fetch(`${this.baseUrl}/${method}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const json = (await res.json()) as TgResponse<T>;

      if (!json.ok) {
        console.error(`Telegram API error [${method}]`, json.description, body);
        return null;
      }

      return json.result ?? null;
    } catch (err) {
      console.error(`Telegram API network error [${method}]`, err);
      return null;
    }
  }

  // ─────────────────────────────────────────────
  async sendMessage(
    chatId: string | number,
    text: string,
    extra: Record<string, unknown> = {}
  ): Promise<TgMessage | null> {
    return this.call<TgMessage>('sendMessage', {
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      ...extra,
    });
  }

  // ─────────────────────────────────────────────
  async editMessageText(
    chatId: string | number,
    messageId: number,
    text: string,
    extra: Record<string, unknown> = {}
  ): Promise<boolean> {
    const res = await this.call('editMessageText', {
      chat_id: chatId,
      message_id: messageId,
      text,
      parse_mode: 'HTML',
      ...extra,
    });

    return !!res;
  }

  // ─────────────────────────────────────────────
  async answerCallbackQuery(
    callbackQueryId: string,
    text?: string,
    showAlert = false
  ): Promise<void> {
    await this.call('answerCallbackQuery', {
      callback_query_id: callbackQueryId,
      text,
      show_alert: showAlert,
    });
  }

  // ─────────────────────────────────────────────
  async kickChatMember(
    chatId: string | number,
    userId: string | number
  ): Promise<boolean> {
    const res = await this.call('banChatMember', {
      chat_id: chatId,
      user_id: userId,
      revoke_messages: false,
    });
    return !!res;
  }

  async banChatMember(
    chatId: string | number,
    userId: string | number,
    revokeMessages = true
  ): Promise<boolean> {
    const res = await this.call('banChatMember', {
      chat_id: chatId,
      user_id: userId,
      revoke_messages: revokeMessages,
    });
    return !!res;
  }

  async unbanChatMember(
    chatId: string | number,
    userId: string | number
  ): Promise<boolean> {
    const res = await this.call('unbanChatMember', {
      chat_id: chatId,
      user_id: userId,
      only_if_banned: true,
    });
    return !!res;
  }

  /**
   * 禁言用户（不允许发送消息）
   * permissions: 用户权限对象，都设为 false 表示禁言
   */
  async restrictChatMember(
    chatId: string | number,
    userId: string | number,
    untilDate?: number,
  ): Promise<boolean> {
    const res = await this.call('restrictChatMember', {
      chat_id: chatId,
      user_id: userId,
      permissions: {
        can_send_messages: false,
        can_send_media_messages: false,
        can_send_polls: false,
        can_send_other_messages: false,
        can_add_web_page_previews: false,
        can_change_info: false,
        can_invite_users: false,
        can_pin_messages: false,
      },
      until_date: untilDate,
    });
    return !!res;
  }

  /**
   * 解除禁言 - 恢复用户的所有权限
   */
  async unrestrictChatMember(
    chatId: string | number,
    userId: string | number,
  ): Promise<boolean> {
    const res = await this.call('restrictChatMember', {
      chat_id: chatId,
      user_id: userId,
      permissions: {
        can_send_messages: true,
        can_send_media_messages: true,
        can_send_polls: true,
        can_send_other_messages: true,
        can_add_web_page_previews: true,
        can_change_info: true,
        can_invite_users: true,
        can_pin_messages: true,
      },
    });
    return !!res;
  }

  // ─────────────────────────────────────────────
  async getChatMember(
    chatId: string | number,
    userId: string | number
  ): Promise<TgChatMember | null> {
    return this.call<TgChatMember>('getChatMember', {
      chat_id: chatId,
      user_id: userId,
    });
  }

  // ─────────────────────────────────────────────
  async deleteMessage(
    chatId: string | number,
    messageId: number
  ): Promise<boolean> {
    const res = await this.call('deleteMessage', {
      chat_id: chatId,
      message_id: messageId,
    });
    return !!res;
  }
}
