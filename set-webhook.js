// scripts/set-webhook.js
// Run: BOT_TOKEN=xxx WORKER_URL=https://xxx.workers.dev node scripts/set-webhook.js

const BOT_TOKEN = process.env.BOT_TOKEN;
const WORKER_URL = process.env.WORKER_URL;

if (!BOT_TOKEN || !WORKER_URL) {
  console.error('Usage: BOT_TOKEN=xxx WORKER_URL=https://xxx.workers.dev node scripts/set-webhook.js');
  process.exit(1);
}

async function setWebhook() {
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/setWebhook`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: WORKER_URL,
      allowed_updates: ['message', 'callback_query'],
    }),
  });
  const json = await res.json();
  console.log('setWebhook result:', JSON.stringify(json, null, 2));
}

setWebhook().catch(console.error);
