import TelegramBot from 'node-telegram-bot-api';
import { config } from './config';
import { registerCommands } from './commands';

const bot = new TelegramBot(config.telegram.token, { polling: true });

registerCommands(bot);

console.log('🤖 KeyManager bot started');

process.on('SIGINT', () => { bot.stopPolling(); process.exit(0); });
process.on('SIGTERM', () => { bot.stopPolling(); process.exit(0); });
