import TelegramBot from 'node-telegram-bot-api';
import { config } from './config';
import { logKey, getStatsToday, getStatsRange, getKeysToday } from './db';
import * as api from './api';

function randomName(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = 'User-';
  for (let i = 0; i < 4; i++) result += chars[Math.floor(Math.random() * chars.length)];
  return result;
}

function formatExpiry(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

function isAllowed(userId: number): boolean {
  if (config.telegram.allowedUserIds.length === 0) return true;
  return config.telegram.allowedUserIds.includes(String(userId));
}

export function registerCommands(bot: TelegramBot) {

  // /createkey <plan> [name]
  bot.onText(/\/createkey\s+(\w+)\s*(.*)?/, async (msg, match) => {
    if (!isAllowed(msg.from!.id)) return;
    const chatId = msg.chat.id;
    const planId = match![1].toLowerCase();
    const name = match![2]?.trim() || randomName();

    const plan = config.plans[planId];
    if (!plan) {
      bot.sendMessage(chatId, `❌ Gói không hợp lệ. Các gói: ${Object.keys(config.plans).join(', ')}`);
      return;
    }

    try {
      const res = await api.createClaudeCodeKey(planId, name);
      if (res.key) {
        logKey('claudecode', planId, res.key, name, String(msg.from!.id));
        bot.sendMessage(chatId,
          `✅ Tạo key thành công!\n\n` +
          `🔑 Key: \`${res.key}\`\n` +
          `📦 Gói: ${plan.name} (${plan.credit})\n` +
          `📅 Hết hạn: ${formatExpiry(plan.days)}`,
          { parse_mode: 'Markdown' }
        );
      } else {
        bot.sendMessage(chatId, `❌ Lỗi: ${JSON.stringify(res)}`);
      }
    } catch (e: any) {
      bot.sendMessage(chatId, `❌ Lỗi: ${e.message}`);
    }
  });

  // /createcombo <7|30> [name]
  bot.onText(/\/createcombo\s+(\d+)\s*(.*)?/, async (msg, match) => {
    if (!isAllowed(msg.from!.id)) return;
    const chatId = msg.chat.id;
    const days = parseInt(match![1]);
    const name = match![2]?.trim() || randomName();

    let type: string;
    if (days <= 7) type = 'Dev';
    else if (days <= 30) type = 'Proxy';
    else { bot.sendMessage(chatId, '❌ Chỉ hỗ trợ 7 hoặc 30 ngày'); return; }

    try {
      bot.sendMessage(chatId, '⏳ Đang tạo key combo...');

      // Step 1+2: Create card on codex
      const keys = await api.createComboCard(type);
      const cardKey = keys[0];

      // Step 3+4: Create key on zeno360
      const expiry = formatExpiry(days);
      await api.createZenoKey(cardKey, expiry);

      logKey('combo', type, cardKey, name, String(msg.from!.id));
      bot.sendMessage(chatId,
        `✅ Tạo key Combo thành công!\n\n` +
        `🔑 Key: \`${cardKey}\`\n` +
        `📦 Loại: ${type} (${days} ngày)\n` +
        `📅 Hết hạn: ${expiry}\n` +
        `👤 KH: ${name}`,
        { parse_mode: 'Markdown' }
      );
    } catch (e: any) {
      bot.sendMessage(chatId, `❌ Lỗi tạo combo: ${e.message}`);
    }
  });

  // /checkkey <sk-xxx>
  bot.onText(/\/checkkey\s+(sk-\S+)/, async (msg, match) => {
    if (!isAllowed(msg.from!.id)) return;
    const chatId = msg.chat.id;
    const key = match![1];

    try {
      const res = await api.checkKey(key);
      if (res.error) {
        bot.sendMessage(chatId, `❌ ${res.error.message || res.error}`);
        return;
      }
      const status = res.status || res;
      bot.sendMessage(chatId,
        `🔍 Thông tin key:\n\n` +
        `📦 Gói: ${status.plan_type || 'N/A'}\n` +
        `💰 Credit: $${status.rate_limit_amount || 0}/5h\n` +
        `⏳ Còn lại: $${status.rate_limit_window_remaining?.toFixed(2) || 0}\n` +
        `📅 Còn: ${status.days_remaining || 0} ngày\n` +
        `${status.expired ? '🔴 Đã hết hạn' : '🟢 Còn hiệu lực'}`
      );
    } catch (e: any) {
      bot.sendMessage(chatId, `❌ Lỗi: ${e.message}`);
    }
  });

  // /extend <sk-xxx> <days>
  bot.onText(/\/extend\s+(sk-\S+)\s+(-?\d+)/, async (msg, match) => {
    if (!isAllowed(msg.from!.id)) return;
    const chatId = msg.chat.id;
    const key = match![1];
    const days = parseInt(match![2]);

    try {
      const res = await api.extendKey(key, days);
      if (res.success) {
        bot.sendMessage(chatId,
          `✅ Gia hạn thành công!\n\n` +
          `🔑 Key: \`${key.substring(0, 15)}...\`\n` +
          `📅 Hạn cũ: ${res.data.old_expiry?.split('T')[0]}\n` +
          `📅 Hạn mới: ${res.data.new_expiry?.split('T')[0]}\n` +
          `➕ Thêm: ${days} ngày`,
          { parse_mode: 'Markdown' }
        );
      } else {
        bot.sendMessage(chatId, `❌ Lỗi: ${JSON.stringify(res)}`);
      }
    } catch (e: any) {
      bot.sendMessage(chatId, `❌ Lỗi: ${e.message}`);
    }
  });

  // /setexpiry <sk-xxx> <YYYY-MM-DD>
  bot.onText(/\/setexpiry\s+(sk-\S+)\s+(\d{4}-\d{2}-\d{2})/, async (msg, match) => {
    if (!isAllowed(msg.from!.id)) return;
    const chatId = msg.chat.id;
    const key = match![1];
    const expiry = match![2];

    try {
      const res = await api.extendKeySetExpiry(key, expiry);
      if (res.success) {
        bot.sendMessage(chatId,
          `✅ Đặt hạn thành công!\n\n` +
          `🔑 Key: \`${key.substring(0, 15)}...\`\n` +
          `📅 Hạn mới: ${expiry}`,
          { parse_mode: 'Markdown' }
        );
      } else {
        bot.sendMessage(chatId, `❌ Lỗi: ${JSON.stringify(res)}`);
      }
    } catch (e: any) {
      bot.sendMessage(chatId, `❌ Lỗi: ${e.message}`);
    }
  });

  // /upgrade <sk-xxx> <new_plan>
  bot.onText(/\/upgrade\s+(sk-\S+)\s+(\w+)/, async (msg, match) => {
    if (!isAllowed(msg.from!.id)) return;
    const chatId = msg.chat.id;
    const key = match![1];
    const newPlan = match![2].toLowerCase();

    const plan = config.plans[newPlan];
    if (!plan) {
      bot.sendMessage(chatId, `❌ Gói không hợp lệ. Các gói: ${Object.keys(config.plans).join(', ')}`);
      return;
    }

    try {
      const res = await api.upgradeKey(key, newPlan, 'upgraded');
      if (res.key) {
        logKey('claudecode', newPlan, res.key, 'upgraded', String(msg.from!.id));
        bot.sendMessage(chatId,
          `✅ Nâng gói thành công!\n\n` +
          `🔑 Key: \`${res.key}\`\n` +
          `📦 Gói mới: ${plan.name} (${plan.credit})`,
          { parse_mode: 'Markdown' }
        );
      } else {
        bot.sendMessage(chatId, `❌ Lỗi: ${JSON.stringify(res)}`);
      }
    } catch (e: any) {
      bot.sendMessage(chatId, `❌ Lỗi: ${e.message}`);
    }
  });

  // /deletecombo <KEY-UUID>
  bot.onText(/\/deletecombo\s+([A-F0-9-]+)/i, async (msg, match) => {
    if (!isAllowed(msg.from!.id)) return;
    const chatId = msg.chat.id;
    const key = match![1];

    try {
      bot.sendMessage(chatId, '⏳ Đang huỷ key combo...');
      const r1 = await api.disableComboCard(key);
      const r2 = await api.deleteZenoKey(key);
      bot.sendMessage(chatId,
        `✅ Đã huỷ key Combo!\n\n` +
        `🔑 Key: \`${key}\`\n` +
        `Codex: ${r1.code === 0 ? '✅' : '❌'}\n` +
        `Zeno360: ${r2.success ? '✅' : '❌'}`,
        { parse_mode: 'Markdown' }
      );
    } catch (e: any) {
      bot.sendMessage(chatId, `❌ Lỗi: ${e.message}`);
    }
  });

  // /stats
  bot.onText(/\/stats\s*(\w*)/, async (msg, match) => {
    if (!isAllowed(msg.from!.id)) return;
    const chatId = msg.chat.id;
    const period = match![1]?.toLowerCase() || 'today';

    let stats;
    let label: string;
    if (period === 'week' || period === 'tuan') {
      stats = getStatsRange(7);
      label = 'tuần này';
    } else if (period === 'month' || period === 'thang') {
      stats = getStatsRange(30);
      label = 'tháng này';
    } else {
      stats = getStatsToday();
      label = 'hôm nay';
    }

    if (stats.length === 0) {
      bot.sendMessage(chatId, `📊 Chưa tạo key nào ${label}`);
      return;
    }

    let total = 0;
    let text = `📊 Thống kê ${label}:\n\n`;
    for (const s of stats) {
      text += `• ${s.type} / ${s.plan}: ${s.count} key\n`;
      total += s.count;
    }
    text += `\n📌 Tổng: ${total} key`;
    bot.sendMessage(chatId, text);
  });

  // /keys — list keys created today
  bot.onText(/\/keys/, async (msg) => {
    if (!isAllowed(msg.from!.id)) return;
    const chatId = msg.chat.id;
    const keys = getKeysToday();

    if (keys.length === 0) {
      bot.sendMessage(chatId, '📋 Chưa tạo key nào hôm nay');
      return;
    }

    let text = `📋 Key đã tạo hôm nay (${keys.length}):\n\n`;
    for (const k of keys) {
      const time = k.created_at.split(' ')[1] || k.created_at;
      text += `${time} | ${k.type} | ${k.plan} | ${k.customer_name}\n\`${k.key}\`\n\n`;
    }
    bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
  });

  // /help
  bot.onText(/\/help/, async (msg) => {
    if (!isAllowed(msg.from!.id)) return;
    bot.sendMessage(msg.chat.id,
      `📖 *Danh sách lệnh:*\n\n` +
      `*ClaudeCode:*\n` +
      `/createkey <gói> [tên] — Tạo key\n` +
      `  Gói: trial, pro, week, max5x, max20x\n` +
      `/checkkey <sk-xxx> — Check key\n` +
      `/extend <sk-xxx> <số ngày> — Gia hạn\n` +
      `/setexpiry <sk-xxx> <YYYY-MM-DD> — Đặt hạn\n` +
      `/upgrade <sk-xxx> <gói mới> — Nâng gói\n\n` +
      `*Combo:*\n` +
      `/createcombo <7|30> [tên] — Tạo combo\n` +
      `/deletecombo <KEY-UUID> — Huỷ combo\n\n` +
      `*Thống kê:*\n` +
      `/stats — Hôm nay\n` +
      `/stats week — Tuần này\n` +
      `/stats month — Tháng này\n` +
      `/keys — List key hôm nay`,
      { parse_mode: 'Markdown' }
    );
  });
}
