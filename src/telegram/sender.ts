import TelegramBot from 'node-telegram-bot-api';
import * as retry from '../utils/retry.js';

export class TelegramSender {
  private chatId: string;

  private bot: TelegramBot;

  constructor(token: string, chatId: string) {
    this.chatId = chatId;
    this.bot = new TelegramBot(token, { polling: false });
  }

  async send(msg: string): Promise<void> {
    await retry.simple(
      () => this.bot.sendMessage(this.chatId, msg, { parse_mode: 'Markdown' }),
      2,
      10000,
    );
  }
}
