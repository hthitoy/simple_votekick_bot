// src/renderService.ts
import { DbVote } from '../types';

export class RenderService {

  renderVoteMessage(vote: DbVote): string {
    const target = this.escape(
      vote.target_username
        ? `@${vote.target_username}`
        : vote.target_first_name ?? `User ${vote.target_user_id}`
    );

    const net = vote.yes_weight - vote.no_weight;
    const bar = this.buildNetBar(net, vote.threshold);

    const startTime = this.formatTime(vote.created_at);
    const durationMin = Math.round((vote.expires_at - vote.created_at) / 60);

    // 如果有引用文本，使用 blockquote
    const quotedSection = vote.quoted_text
      ? `<blockquote>${this.escape(vote.quoted_text.slice(0, 100))}</blockquote>\n`
      : '';

    return (
`VoteKick ${target}
${quotedSection}投票倾向:${bar}
⬆️ ${vote.yes_weight.toFixed(1)}  ⬇️ ${vote.no_weight.toFixed(1)}  ⚖️ ${net >= 0 ? '+' : ''}${net.toFixed(1)}
有效：${durationMin}分钟  阈值：${vote.threshold}`
    );
  }

  /**
   * 单轴净值进度条（避免 yes/no 假满问题）
   */
  private buildNetBar(net: number, threshold: number): string {
    const SIZE = 10;

    const ratio = Math.max(-1, Math.min(1, net / threshold));

    const filled = Math.round(Math.abs(ratio) * SIZE);
    const empty = SIZE - filled;

    if (ratio > 0) {
      return '🟩'.repeat(filled) + '⬜'.repeat(empty);
    } else if (ratio < 0) {
      return '🟥'.repeat(filled) + '⬜'.repeat(empty);
    } else {
      return '⬜'.repeat(SIZE);
    }
  }

  formatTime(timestamp: number): string {
    const d = new Date(timestamp * 1000);
    return d.toTimeString().slice(0, 5); // HH:mm
  }

  buildVoteKeyboard(voteId: string) {
    return {
      inline_keyboard: [
        [
          { text: '⬆️ 踢出', callback_data: `vote:${voteId}:yes` },
          { text: '⬇️ 不踢出', callback_data: `vote:${voteId}:no` },
        ]
      ]
    };
  }

  renderResultMessage(vote: DbVote): string {
    const target = vote.target_username
      ? `@${vote.target_username}`
      : vote.target_first_name ?? `User ${vote.target_user_id}`;

    const result =
      vote.status === 'passed'
        ? `✅ 通过：${target} 已被踢出`
        : vote.status === 'rejected'
        ? `❌ 未通过：${target} 保留`
        : `⏰ 结束：${target} 保留`;

    return (
`🗳 VoteKick 已结束

${result}

⬆️ ${vote.yes_weight.toFixed(1)}  ⬇️ ${vote.no_weight.toFixed(1)}
🎯 阈值：${vote.threshold}`
    );
  }

  // ════════════════════════════════════════════════════════════════════════
  // 验证相关的渲染方法
  // ════════════════════════════════════════════════════════════════════════

  renderVerificationPrompt(userDisplay: string, userId: string, source: 'group' | 'private' = 'group'): string {
    const mention = `<a href="tg://user?id=${userId}">${this.escape(userDisplay)}</a>`;
    if (source === 'private') {
      return `🤖 <b>${mention}, 请在一分钟内点击下方按钮确认你是人类：</b>\n\n验证成功后自动解除群内禁言。`;
    }
    return `🤖 <b>${mention}, 请在一分钟内点击下方按钮确认你是人类：</b>`;
  }

  buildVerificationKeyboard(verificationId: string, botUsername?: string) {
    const keyboard = { inline_keyboard: [[{ text: '✅ I am not robot', callback_data: `verify:${verificationId}` }]] };

    if (botUsername) {
      keyboard.inline_keyboard.push([{ text: '🤖 前往验证', url: `https://t.me/${botUsername}?start=verify_${verificationId}` }]);
    }

    return keyboard;
  }

  buildPrivateVerificationKeyboard(verificationId: string) {
    return { inline_keyboard: [[{ text: '✅ I am not robot', callback_data: `verify:${verificationId}` }]] };
  }

  renderVerificationSuccess(): string {
    return `✅ <b>验证成功！</b>\n欢迎加入群组。禁言已解除。`;
  }

  renderVerificationSuccessWithGroupLink(groupTitle?: string): string {
    return `✅ <b>验证成功！</b>\n验证通过, 禁言已解除。\n${groupTitle ? `群组：${groupTitle}` : ''}`;
  }

  renderPrivateVerificationPrompt(botUsername: string): string {
    return `🤖 <b>请在一分钟内点击下方按钮确认你是人类：</b>`;
  }

  renderStartGuide(): string {
    return (
` <b>欢迎使用 VoteKick Bot</b>

<b>使用方法：</b>

1. <b>发起投票：</b>
  回复目标消息并带上 <code>/kick</code> 命令

2. <b>群成员投票：</b>
  点击 ⬆️踢出 或 ⬇️不踢出
  赞成票力达到阈值后自动踢人

3. <b>系统规则：</b>
  权重系统：活跃成员投票力更大
  冷却时间：防止滥用(管理员/群主无法被踢)
  权重公式：
    <code>W_new=W_old×0.90^Δd+log(1+Δt×0.002)</code>
    <code>Δd=为发言间隔(day)</code>
    <code>Δt=发言间隔(min)</code>
    <code>W=权重(min)</code>
  投票力: Weight
  踢出阈值:
    <code>Threshold=20×(1+Weight/10)</code>

有问题? 请联系,群管理员
  反馈群：@simplevotekick`
    );
  }

  renderGroupHelp(botUsername: string): string {
    return (
`<b>VoteKick 使用方法</b>
1.<b>发起投票踢人：</b>
  回复目标消息 + <code>/kick</code>
2.<b>参与投票：</b>
  点击 ⬆️ 踢出 / ⬇️ 不踢出
3.<b>查询权重：</b>
  <code>/weight@${botUsername}</code>
4.<b>查看详细帮助：</b>
  私聊发送 <code>/help</code>`
    );
  }

  renderWeightMessage(displayName: string, username: string | undefined, weight: number, threshold: number): string {
    const mention = username ? `@${username}` : displayName;
    return (
`<b>目标: </b>${this.escape(mention)}
<b>投票权：</b>${weight.toFixed(2)}
<b>被踢阈值：</b>${threshold}`
    );
  }

  private escape(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }
}
