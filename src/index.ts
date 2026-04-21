// src/index.ts
import { TelegramAPI } from './telegram';
import { VoteService } from './services/voteService';
import { TelegramUpdate, Env } from './types';

export default {
  // ── Webhook handler ──────────────────────────────────────────────────
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method !== 'POST') {
      return new Response('VoteKick Bot is running.', { status: 200 });
    }

    try {
      const update: TelegramUpdate = await request.json();
      
      console.log('[update] types: msg=' + !!update.message + ' cb=' + !!update.callback_query + ' chat_mem=' + !!update.chat_member);
      const tg = new TelegramAPI(env.BOT_TOKEN);
      const service = new VoteService(env.DB, tg, env);

      // Handle message updates
      if (update.message) {
        // Handle private chat commands
        if (update.message.chat?.type === 'private') {
          const text = update.message.text || '';
          if (text.startsWith('/start') || text.startsWith('/verify')) {
            await service.handlePrivateStart(update.message.from?.id.toString() || '', update.message.message_id);
          } else if (text.startsWith('/help')) {
            await service.sendHelpMessage(update.message.chat.id.toString());
          }
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
      // Handle chat_member updates (all groups - new member detection)
      else if (update.chat_member) {
        const oldStatus = update.chat_member.old_chat_member.status;
        const newStatus = update.chat_member.new_chat_member.status;
        const user = update.chat_member.new_chat_member.user;
        
        // User joined: newStatus is "member", oldStatus is "left"/"kicked"/null (first-time join)
        if (newStatus === 'member' && (oldStatus === 'left' || oldStatus === 'kicked' || oldStatus === null || oldStatus === undefined)) {
          console.log('[新成员] 群: ' + update.chat_member.chat.id + ' | 用户: ' + user.first_name + '(' + user.id + ') | 状态: ' + oldStatus + ' → ' + newStatus);
          await service.handleChatMemberUpdate(update.chat_member);
        }
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

      // Clean up old kick feedback messages
      await service.processOldKickFeedbackMessages();

      console.log('[cron] Processed expired votes, verifications, and kick feedback');
    } catch (err) {
      console.error('[scheduled] Unhandled error:', err);
    }
  },
};
