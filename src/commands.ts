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

// Pending states for multi-step flows
const pendingInput = new Map<number, { action: string; data?: any }>();

export function registerCommands(bot: TelegramBot) {

  // ========== /start & /menu — Main menu ==========
  bot.onText(/\/(start|menu)/, async (msg) => {
    if (!isAllowed(msg.from!.id)) return;
    bot.sendMessage(msg.chat.id,
      `🔐 *Key Manager*\n\nChọn chức năng:`,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [
              { text: '🔑 Tạo Key ClaudeCode', callback_data: 'menu_claudecode' },
            ],
            [
              { text: '🎮 Tạo Key Combo', callback_data: 'menu_combo' },
            ],
            [
              { text: '🔍 Check Key', callback_data: 'action_checkkey' },
              { text: '📅 Gia hạn Key', callback_data: 'action_extend' },
            ],
            [
              { text: '⬆️ Nâng gói', callback_data: 'action_upgrade' },
              { text: '🗑 Huỷ Combo', callback_data: 'action_deletecombo' },
            ],
            [
              { text: '📊 Thống kê', callback_data: 'menu_stats' },
              { text: '📋 List key hôm nay', callback_data: 'action_keys' },
            ],
          ],
        },
      }
    );
  });

  // ========== Callback query handler ==========
  bot.on('callback_query', async (query) => {
    if (!query.from || !isAllowed(query.from.id)) return;
    const chatId = query.message!.chat.id;
    const data = query.data || '';
    bot.answerCallbackQuery(query.id);

    // --- ClaudeCode submenu ---
    if (data === 'menu_claudecode') {
      bot.sendMessage(chatId, '📦 *Chọn gói ClaudeCode:*', {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [
              { text: `🆓 Trial ($50/5h, 1 ngày)`, callback_data: 'create_cc_trial' },
            ],
            [
              { text: `📗 Pro ($50/5h, 30 ngày)`, callback_data: 'create_cc_pro' },
            ],
            [
              { text: `📘 Gói Tuần ($100/5h, 7 ngày)`, callback_data: 'create_cc_week' },
            ],
            [
              { text: `📙 Max 5x ($100/5h, 30 ngày)`, callback_data: 'create_cc_max5x' },
            ],
            [
              { text: `📕 Max 20x ($200/5h, 30 ngày)`, callback_data: 'create_cc_max20x' },
            ],
            [{ text: '⬅️ Quay lại', callback_data: 'back_main' }],
          ],
        },
      });
      return;
    }

    // --- Create ClaudeCode key ---
    if (data.startsWith('create_cc_')) {
      const planId = data.replace('create_cc_', '');
      const plan = config.plans[planId];
      if (!plan) return;

      pendingInput.set(query.from.id, { action: 'createkey', data: { planId } });
      bot.sendMessage(chatId,
        `📝 Nhập tên khách hàng cho gói *${plan.name}*:\n(hoặc gửi "skip" để dùng tên random)`,
        { parse_mode: 'Markdown' }
      );
      return;
    }

    // --- Combo submenu ---
    if (data === 'menu_combo') {
      bot.sendMessage(chatId, '🎮 *Chọn loại Combo:*', {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '📗 Combo 7 ngày (Dev)', callback_data: 'create_combo_7' }],
            [{ text: '📕 Combo 30 ngày (Proxy)', callback_data: 'create_combo_30' }],
            [{ text: '⬅️ Quay lại', callback_data: 'back_main' }],
          ],
        },
      });
      return;
    }

    // --- Create Combo key ---
    if (data.startsWith('create_combo_')) {
      const days = parseInt(data.replace('create_combo_', ''));
      pendingInput.set(query.from.id, { action: 'createcombo', data: { days } });
      bot.sendMessage(chatId,
        `📝 Nhập tên khách hàng cho Combo ${days} ngày:\n(hoặc gửi "skip" để dùng tên random)`
      );
      return;
    }

    // --- Action prompts ---
    if (data === 'action_checkkey') {
      pendingInput.set(query.from.id, { action: 'checkkey' });
      bot.sendMessage(chatId, '🔍 Gửi key cần check (sk-...)');
      return;
    }

    if (data === 'action_extend') {
      pendingInput.set(query.from.id, { action: 'extend' });
      bot.sendMessage(chatId, '📅 Gửi theo format:\n`sk-xxx số_ngày`\n\nVí dụ: `sk-abc123 30`', { parse_mode: 'Markdown' });
      return;
    }

    if (data === 'action_upgrade') {
      pendingInput.set(query.from.id, { action: 'upgrade' });
      bot.sendMessage(chatId,
        '⬆️ Gửi theo format:\n`sk-xxx gói_mới`\n\nVí dụ: `sk-abc123 max20x`\n\nGói: trial, pro, week, max5x, max20x',
        { parse_mode: 'Markdown' }
      );
      return;
    }

    if (data === 'action_deletecombo') {
      pendingInput.set(query.from.id, { action: 'deletecombo' });
      bot.sendMessage(chatId, '🗑 Gửi key combo cần huỷ (UUID)');
      return;
    }

    // --- Stats submenu ---
    if (data === 'menu_stats') {
      bot.sendMessage(chatId, '📊 *Thống kê:*', {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '📊 Hôm nay', callback_data: 'stats_today' }],
            [{ text: '📊 Tuần này', callback_data: 'stats_week' }],
            [{ text: '📊 Tháng này', callback_data: 'stats_month' }],
            [{ text: '⬅️ Quay lại', callback_data: 'back_main' }],
          ],
        },
      });
      return;
    }

    if (data.startsWith('stats_')) {
      const period = data.replace('stats_', '');
      let stats;
      let label: string;
      if (period === 'week') { stats = getStatsRange(7); label = 'tuần này'; }
      else if (period === 'month') { stats = getStatsRange(30); label = 'tháng này'; }
      else { stats = getStatsToday(); label = 'hôm nay'; }

      if (stats.length === 0) {
        bot.sendMessage(chatId, `📊 Chưa tạo key nào ${label}`);
        return;
      }
      let total = 0;
      let text = `📊 Thống kê ${label}:\n\n`;
      for (const s of stats) { text += `• ${s.type} / ${s.plan}: ${s.count} key\n`; total += s.count; }
      text += `\n📌 Tổng: ${total} key`;
      bot.sendMessage(chatId, text);
      return;
    }

    if (data === 'action_keys') {
      const keys = getKeysToday();
      if (keys.length === 0) { bot.sendMessage(chatId, '📋 Chưa tạo key nào hôm nay'); return; }
      let text = `📋 Key đã tạo hôm nay (${keys.length}):\n\n`;
      for (const k of keys) {
        const time = k.created_at.split(' ')[1] || k.created_at;
        text += `${time} | ${k.type} | ${k.plan} | ${k.customer_name}\n\`${k.key}\`\n\n`;
      }
      bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
      return;
    }

    // --- Back to main ---
    if (data === 'back_main') {
      bot.sendMessage(chatId, '🔐 *Key Manager*\n\nChọn chức năng:', {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔑 Tạo Key ClaudeCode', callback_data: 'menu_claudecode' }],
            [{ text: '🎮 Tạo Key Combo', callback_data: 'menu_combo' }],
            [
              { text: '🔍 Check Key', callback_data: 'action_checkkey' },
              { text: '📅 Gia hạn Key', callback_data: 'action_extend' },
            ],
            [
              { text: '⬆️ Nâng gói', callback_data: 'action_upgrade' },
              { text: '🗑 Huỷ Combo', callback_data: 'action_deletecombo' },
            ],
            [
              { text: '📊 Thống kê', callback_data: 'menu_stats' },
              { text: '📋 List key hôm nay', callback_data: 'action_keys' },
            ],
          ],
        },
      });
      return;
    }
  });

  // ========== Text input handler (for pending actions) ==========
  bot.on('message', async (msg) => {
    if (!msg.text || msg.text.startsWith('/') || !msg.from) return;
    if (!isAllowed(msg.from.id)) return;

    const pending = pendingInput.get(msg.from.id);
    if (!pending) return;
    pendingInput.delete(msg.from.id);

    const chatId = msg.chat.id;
    const input = msg.text.trim();

    // --- Create ClaudeCode key ---
    if (pending.action === 'createkey') {
      const { planId } = pending.data;
      const plan = config.plans[planId];
      const name = input.toLowerCase() === 'skip' ? randomName() : input;

      try {
        const res = await api.createClaudeCodeKey(planId, name);
        const apiKey = res.api_key || res.key;
        if (apiKey) {
          const expiry = res.expiry ? res.expiry.split('T')[0] : formatExpiry(plan.days);
          logKey('claudecode', planId, apiKey, name, String(msg.from.id));
          bot.sendMessage(chatId,
            `✅ Tạo key thành công!\n\n` +
            `🔑 Key: \`${apiKey}\`\n` +
            `📦 Gói: ${plan.name} (${plan.credit})\n` +
            `📅 Hết hạn: ${expiry}\n` +
            `👤 KH: ${name}`,
            { parse_mode: 'Markdown' }
          );
        } else {
          bot.sendMessage(chatId, `❌ Lỗi: ${JSON.stringify(res)}`);
        }
      } catch (e: any) {
        bot.sendMessage(chatId, `❌ Lỗi: ${e.message}`);
      }
      return;
    }

    // --- Create Combo key ---
    if (pending.action === 'createcombo') {
      const { days } = pending.data;
      const name = input.toLowerCase() === 'skip' ? randomName() : input;
      const type = days <= 7 ? 'Dev' : 'Proxy';

      try {
        bot.sendMessage(chatId, '⏳ Đang tạo key combo...');
        const keys = await api.createComboCard(type);
        const cardKey = keys[0];
        const expiry = formatExpiry(days);
        await api.createZenoKey(cardKey, expiry);

        logKey('combo', type, cardKey, name, String(msg.from.id));
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
      return;
    }

    // --- Check key ---
    if (pending.action === 'checkkey') {
      const key = input.startsWith('sk-') ? input : `sk-${input}`;
      try {
        const res = await api.checkKey(key);
        if (res.error) { bot.sendMessage(chatId, `❌ ${res.error.message || res.error}`); return; }
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
      return;
    }

    // --- Extend key ---
    if (pending.action === 'extend') {
      const parts = input.split(/\s+/);
      const key = parts[0];
      const days = parseInt(parts[1]);
      if (!key || isNaN(days)) {
        bot.sendMessage(chatId, '❌ Format sai. Ví dụ: `sk-abc123 30`', { parse_mode: 'Markdown' });
        return;
      }
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
      return;
    }

    // --- Upgrade key ---
    if (pending.action === 'upgrade') {
      const parts = input.split(/\s+/);
      const key = parts[0];
      const newPlan = parts[1]?.toLowerCase();
      const plan = config.plans[newPlan];
      if (!key || !plan) {
        bot.sendMessage(chatId, '❌ Format sai. Ví dụ: `sk-abc123 max20x`', { parse_mode: 'Markdown' });
        return;
      }
      try {
        const res = await api.upgradeKey(key, newPlan, 'upgraded');
        const upgradedKey = res.api_key || res.key;
        if (upgradedKey) {
          logKey('claudecode', newPlan, upgradedKey, 'upgraded', String(msg.from.id));
          bot.sendMessage(chatId,
            `✅ Nâng gói thành công!\n\n` +
            `🔑 Key: \`${upgradedKey}\`\n` +
            `📦 Gói mới: ${plan.name} (${plan.credit})`,
            { parse_mode: 'Markdown' }
          );
        } else {
          bot.sendMessage(chatId, `❌ Lỗi: ${JSON.stringify(res)}`);
        }
      } catch (e: any) {
        bot.sendMessage(chatId, `❌ Lỗi: ${e.message}`);
      }
      return;
    }

    // --- Delete combo ---
    if (pending.action === 'deletecombo') {
      try {
        bot.sendMessage(chatId, '⏳ Đang huỷ key combo...');
        const r1 = await api.disableComboCard(input);
        const r2 = await api.deleteZenoKey(input);
        bot.sendMessage(chatId,
          `✅ Đã huỷ key Combo!\n\n` +
          `🔑 Key: \`${input}\`\n` +
          `Codex: ${r1.code === 0 ? '✅' : '❌'}\n` +
          `Zeno360: ${r2.success ? '✅' : '❌'}`,
          { parse_mode: 'Markdown' }
        );
      } catch (e: any) {
        bot.sendMessage(chatId, `❌ Lỗi: ${e.message}`);
      }
      return;
    }
  });

  // ========== Keep slash command support ==========

  bot.onText(/\/createkey\s+(\w+)\s*(.*)?/, async (msg, match) => {
    if (!isAllowed(msg.from!.id)) return;
    const chatId = msg.chat.id;
    const planId = match![1].toLowerCase();
    const name = match![2]?.trim() || randomName();
    const plan = config.plans[planId];
    if (!plan) { bot.sendMessage(chatId, `❌ Gói không hợp lệ. Các gói: ${Object.keys(config.plans).join(', ')}`); return; }
    try {
      const res = await api.createClaudeCodeKey(planId, name);
      const apiKey = res.api_key || res.key;
      if (apiKey) {
        const expiry = res.expiry ? res.expiry.split('T')[0] : formatExpiry(plan.days);
        logKey('claudecode', planId, apiKey, name, String(msg.from!.id));
        bot.sendMessage(chatId, `✅ Tạo key thành công!\n\n🔑 Key: \`${apiKey}\`\n📦 Gói: ${plan.name} (${plan.credit})\n📅 Hết hạn: ${expiry}`, { parse_mode: 'Markdown' });
      } else { bot.sendMessage(chatId, `❌ Lỗi: ${JSON.stringify(res)}`); }
    } catch (e: any) { bot.sendMessage(chatId, `❌ Lỗi: ${e.message}`); }
  });

  bot.onText(/\/createcombo\s+(\d+)\s*(.*)?/, async (msg, match) => {
    if (!isAllowed(msg.from!.id)) return;
    const chatId = msg.chat.id;
    const days = parseInt(match![1]);
    const name = match![2]?.trim() || randomName();
    const type = days <= 7 ? 'Dev' : days <= 30 ? 'Proxy' : null;
    if (!type) { bot.sendMessage(chatId, '❌ Chỉ hỗ trợ 7 hoặc 30 ngày'); return; }
    try {
      bot.sendMessage(chatId, '⏳ Đang tạo key combo...');
      const keys = await api.createComboCard(type);
      const cardKey = keys[0];
      const expiry = formatExpiry(days);
      await api.createZenoKey(cardKey, expiry);
      logKey('combo', type, cardKey, name, String(msg.from!.id));
      bot.sendMessage(chatId, `✅ Tạo key Combo thành công!\n\n🔑 Key: \`${cardKey}\`\n📦 Loại: ${type} (${days} ngày)\n📅 Hết hạn: ${expiry}\n👤 KH: ${name}`, { parse_mode: 'Markdown' });
    } catch (e: any) { bot.sendMessage(chatId, `❌ Lỗi tạo combo: ${e.message}`); }
  });

  bot.onText(/\/checkkey\s+(sk-\S+)/, async (msg, match) => {
    if (!isAllowed(msg.from!.id)) return;
    const chatId = msg.chat.id;
    try {
      const res = await api.checkKey(match![1]);
      if (res.error) { bot.sendMessage(chatId, `❌ ${res.error.message || res.error}`); return; }
      const s = res.status || res;
      bot.sendMessage(chatId, `🔍 Thông tin key:\n\n📦 Gói: ${s.plan_type || 'N/A'}\n💰 Credit: $${s.rate_limit_amount || 0}/5h\n⏳ Còn lại: $${s.rate_limit_window_remaining?.toFixed(2) || 0}\n📅 Còn: ${s.days_remaining || 0} ngày\n${s.expired ? '🔴 Đã hết hạn' : '🟢 Còn hiệu lực'}`);
    } catch (e: any) { bot.sendMessage(chatId, `❌ Lỗi: ${e.message}`); }
  });

  bot.onText(/\/extend\s+(sk-\S+)\s+(-?\d+)/, async (msg, match) => {
    if (!isAllowed(msg.from!.id)) return;
    const chatId = msg.chat.id;
    try {
      const res = await api.extendKey(match![1], parseInt(match![2]));
      if (res.success) {
        bot.sendMessage(chatId, `✅ Gia hạn thành công!\n\n🔑 Key: \`${match![1].substring(0, 15)}...\`\n📅 Hạn cũ: ${res.data.old_expiry?.split('T')[0]}\n📅 Hạn mới: ${res.data.new_expiry?.split('T')[0]}\n➕ Thêm: ${match![2]} ngày`, { parse_mode: 'Markdown' });
      } else { bot.sendMessage(chatId, `❌ Lỗi: ${JSON.stringify(res)}`); }
    } catch (e: any) { bot.sendMessage(chatId, `❌ Lỗi: ${e.message}`); }
  });

  bot.onText(/\/setexpiry\s+(sk-\S+)\s+(\d{4}-\d{2}-\d{2})/, async (msg, match) => {
    if (!isAllowed(msg.from!.id)) return;
    try {
      const res = await api.extendKeySetExpiry(match![1], match![2]);
      if (res.success) { bot.sendMessage(msg.chat.id, `✅ Đặt hạn thành công!\n\n🔑 Key: \`${match![1].substring(0, 15)}...\`\n📅 Hạn mới: ${match![2]}`, { parse_mode: 'Markdown' }); }
      else { bot.sendMessage(msg.chat.id, `❌ Lỗi: ${JSON.stringify(res)}`); }
    } catch (e: any) { bot.sendMessage(msg.chat.id, `❌ Lỗi: ${e.message}`); }
  });

  bot.onText(/\/upgrade\s+(sk-\S+)\s+(\w+)/, async (msg, match) => {
    if (!isAllowed(msg.from!.id)) return;
    const plan = config.plans[match![2].toLowerCase()];
    if (!plan) { bot.sendMessage(msg.chat.id, `❌ Gói không hợp lệ.`); return; }
    try {
      const res = await api.upgradeKey(match![1], match![2].toLowerCase(), 'upgraded');
      const k = res.api_key || res.key;
      if (k) { logKey('claudecode', match![2].toLowerCase(), k, 'upgraded', String(msg.from!.id)); bot.sendMessage(msg.chat.id, `✅ Nâng gói thành công!\n\n🔑 Key: \`${k}\`\n📦 Gói mới: ${plan.name} (${plan.credit})`, { parse_mode: 'Markdown' }); }
      else { bot.sendMessage(msg.chat.id, `❌ Lỗi: ${JSON.stringify(res)}`); }
    } catch (e: any) { bot.sendMessage(msg.chat.id, `❌ Lỗi: ${e.message}`); }
  });

  bot.onText(/\/deletecombo\s+([A-F0-9-]+)/i, async (msg, match) => {
    if (!isAllowed(msg.from!.id)) return;
    try {
      bot.sendMessage(msg.chat.id, '⏳ Đang huỷ key combo...');
      const r1 = await api.disableComboCard(match![1]);
      const r2 = await api.deleteZenoKey(match![1]);
      bot.sendMessage(msg.chat.id, `✅ Đã huỷ key Combo!\n\n🔑 Key: \`${match![1]}\`\nCodex: ${r1.code === 0 ? '✅' : '❌'}\nZeno360: ${r2.success ? '✅' : '❌'}`, { parse_mode: 'Markdown' });
    } catch (e: any) { bot.sendMessage(msg.chat.id, `❌ Lỗi: ${e.message}`); }
  });

  bot.onText(/\/stats\s*(\w*)/, async (msg, match) => {
    if (!isAllowed(msg.from!.id)) return;
    const p = match![1]?.toLowerCase() || 'today';
    let stats, label: string;
    if (p === 'week' || p === 'tuan') { stats = getStatsRange(7); label = 'tuần này'; }
    else if (p === 'month' || p === 'thang') { stats = getStatsRange(30); label = 'tháng này'; }
    else { stats = getStatsToday(); label = 'hôm nay'; }
    if (stats.length === 0) { bot.sendMessage(msg.chat.id, `📊 Chưa tạo key nào ${label}`); return; }
    let total = 0, text = `📊 Thống kê ${label}:\n\n`;
    for (const s of stats) { text += `• ${s.type} / ${s.plan}: ${s.count} key\n`; total += s.count; }
    text += `\n📌 Tổng: ${total} key`;
    bot.sendMessage(msg.chat.id, text);
  });

  bot.onText(/\/keys/, async (msg) => {
    if (!isAllowed(msg.from!.id)) return;
    const keys = getKeysToday();
    if (keys.length === 0) { bot.sendMessage(msg.chat.id, '📋 Chưa tạo key nào hôm nay'); return; }
    let text = `📋 Key đã tạo hôm nay (${keys.length}):\n\n`;
    for (const k of keys) { text += `${k.created_at.split(' ')[1] || k.created_at} | ${k.type} | ${k.plan} | ${k.customer_name}\n\`${k.key}\`\n\n`; }
    bot.sendMessage(msg.chat.id, text, { parse_mode: 'Markdown' });
  });

  bot.onText(/\/help/, async (msg) => {
    if (!isAllowed(msg.from!.id)) return;
    bot.sendMessage(msg.chat.id, `📖 Gửi /menu để mở menu chính.\n\nHoặc dùng lệnh trực tiếp:\n/createkey <gói> [tên]\n/createcombo <7|30> [tên]\n/checkkey <sk-xxx>\n/extend <sk-xxx> <ngày>\n/setexpiry <sk-xxx> <YYYY-MM-DD>\n/upgrade <sk-xxx> <gói>\n/deletecombo <UUID>\n/stats [week|month]\n/keys`);
  });
}
