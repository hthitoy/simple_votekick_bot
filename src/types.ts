// src/types.ts
type D1Database = any;

export interface Env {
  DB: D1Database;
  BOT_TOKEN: string;
  BASE_VOTE_THRESHOLD: string;
  VOTE_DURATION_SECONDS: string;
  INITIATOR_COOLDOWN_SECONDS: string;
  TARGET_COOLDOWN_SECONDS: string;
  MIN_WEIGHT_TO_INITIATE: string;
  ENABLE_VERIFICATION: string; // '1' 或 '0'
}

export interface TelegramUser {
  id: number;
  is_bot: boolean;
  first_name: string;
  username?: string;
}

export interface TelegramChat {
  id: number;
  type: string;
}

export interface TelegramChatMember {
  status: string;
  user: TelegramUser;
}

export interface TelegramMessage {
  message_id: number;
  from?: TelegramUser;
  chat: TelegramChat;
  text?: string;
  reply_to_message?: TelegramMessage;
  new_chat_members?: TelegramUser[];
}

export interface TelegramCallbackQuery {
  id: string;
  from: TelegramUser;
  message?: TelegramMessage;
  data?: string;
}

export interface TelegramChatMemberUpdate {
  chat: TelegramChat;
  from?: TelegramUser;
  date: number;
  old_chat_member: TelegramChatMember;
  new_chat_member: TelegramChatMember;
}

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
  my_chat_member?: {
    chat: TelegramChat;
    from: TelegramUser;
    date: number;
    new_chat_member: TelegramChatMember;
    old_chat_member: TelegramChatMember;
  };
  chat_member?: TelegramChatMemberUpdate;
}

export interface DbUser {
  id: number;
  chat_id: string;
  user_id: string;
  username: string | null;
  first_name: string | null;
  weight: number;
  last_message_at: number | null;
  last_weight_update_at: number | null;
  joined_at: number;
}

export interface DbVote {
  vote_id: string;
  chat_id: string;
  target_user_id: string;
  target_username: string | null;
  target_first_name: string | null;
  initiator_user_id: string;
  initiator_username: string | null;
  initiator_message_id: number | null;
  target_message_id: number | null;
  yes_weight: number;
  no_weight: number;
  threshold: number;
  status: 'active' | 'passed' | 'rejected' | 'expired';
  quoted_text: string | null;
  message_id: number | null;
  expires_at: number;
  created_at: number;
}

export interface DbVoteRecord {
  id: number;
  vote_id: string;
  chat_id: string;
  voter_user_id: string;
  choice: 'yes' | 'no';
  vote_power: number;
  created_at: number;
}

export interface DbBotMessage {
  id: number;
  chat_id: string;
  message_id: number;
  content: string | null;
  status: 'in_progress' | 'deleted';
  created_at: number;
  updated_at: number;
}
