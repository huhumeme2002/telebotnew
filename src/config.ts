import dotenv from 'dotenv';
dotenv.config();

export const config = {
  telegram: {
    token: process.env.TELEGRAM_BOT_TOKEN || '',
    allowedUserIds: (process.env.ALLOWED_USER_IDS || '').split(',').map(s => s.trim()).filter(Boolean),
  },
  claudecode: {
    url: process.env.PROVISION_URL || 'http://pro-x.io.vn',
    secret: process.env.PROVISION_SECRET || '',
    adminPassword: process.env.ADMIN_PASSWORD || '',
  },
  codex: {
    url: process.env.CODEX_URL || 'https://codex.micosoft.icu',
    account: process.env.CODEX_ACCOUNT || '',
    password: process.env.CODEX_PASSWORD || '',
  },
  zeno: {
    url: process.env.ZENO_URL || 'http://zeno360.click',
    password: process.env.ZENO_PASSWORD || '',
  },
  plans: {
    trial:  { name: 'Dùng thử', credit: '$50/5h', days: 1 },
    pro:    { name: 'Pro',       credit: '$50/5h', days: 30 },
    week:   { name: 'Gói Tuần', credit: '$100/5h', days: 7 },
    max5x:  { name: 'Max 5x',   credit: '$100/5h', days: 30 },
    max20x: { name: 'Max 20x',  credit: '$200/5h', days: 30 },
  } as Record<string, { name: string; credit: string; days: number }>,
};
