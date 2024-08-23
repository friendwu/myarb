import { Telegraf } from 'telegraf';
import * as dotenv from 'dotenv';
dotenv.config();

const botToken = process.env["TELEGRAM_BOT_TOKEN"]
const channelId= process.env["TELEGRAM_CHAT_ID"]

const bot = new Telegraf(botToken);

async function sendMessageToChannel(message: string) {
    try {
        const response = await bot.telegram.sendMessage(channelId, message);
        //console.log('Message sent:', response);
    } catch (error) {
        console.error('Error sending message:', error);
    }
}

export default sendMessageToChannel;
