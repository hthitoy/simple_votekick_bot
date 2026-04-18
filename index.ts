// src/index.ts
import { TelegramAPI } from './telegram';
import { VoteService } from './voteService';
import { TelegramUpdate, Env } from './types';

export default {
  // ── Webhook handler ──────────────────────────────────────────────────
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method !== 'POST') {
      return new Response('VoteKick Bot is running.', { status: 200 });
    }

    try {
      const update: TelegramUpdate = await request.json();
      const tg = new TelegramAPI(env.BOT_TOKEN);
      const service = new VoteService(env.DB, tg, env);

      // Handle message updates
      if (update.message) {
        // Check for new chat members
        if (update.message.new_chat_members && update.message.new_chat_members.length > 0) {
          await service.handleNewChatMember(update.message);
        }
        // Handle regular messages
        await service.handleMessage(update.message);
      }
      // Handle callback queries (button clicks)
      else if (update.callback_query) {
        await service.handleCallback(update.callback_query);
      }
      // Handle my_chat_member updates (bot status changes)
      else if (update.my_chat_member) {
        console.log('[my_chat_member]', {
          chat_id: update.my_chat_member.chat.id,
          status: update.my_chat_member.new_chat_member.status,
          old_status: update.my_chat_member.old_chat_member.status,
        });
      }
    } catch (err) {
      console.error('[fetch] Unhandled error:', err);
    }

    return new Response('OK', { status: 200 });
  },

  // ── Cron handler (process expired votes and verifications every minute) ─
  async scheduled(_event: ScheduledEvent, env: Env): Promise<void> {
    try {
      const tg = new TelegramAPI(env.BOT_TOKEN);
      const service = new VoteService(env.DB, tg, env);

      // Process expired votes
      await service.processExpiredVotes();

      // Process expired verifications
      await service.processExpiredVerifications();

      console.log('[cron] Processed expired votes and verifications');
    } catch (err) {
      console.error('[scheduled] Unhandled error:', err);
    }
  },
};
