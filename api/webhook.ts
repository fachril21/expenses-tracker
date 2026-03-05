import { Telegraf } from "telegraf";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import * as dotenv from "dotenv";

// Load environment variables for local development
dotenv.config();

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

if (!BOT_TOKEN) {
  throw new Error("TELEGRAM_BOT_TOKEN is not set in environment variables.");
}

// Initialize the Telegraf bot instance
const bot = new Telegraf(BOT_TOKEN);

// ---- Bot Commands & Handlers ----

// /start command
bot.start((ctx) => {
  ctx.reply(
    "👋 Bot is running!\n\nSend me a text description or a photo of a receipt to track your expense."
  );
});

// /help command
bot.help((ctx) => {
  ctx.reply(
    "ℹ️ *Expense Tracker Bot*\n\n" +
    "You can:\n" +
    "• Send a text message describing an expense (e.g. 'Lunch at McDonald\\'s 50000')\n" +
    "• Send a photo of a receipt to extract the details automatically.\n\n" +
    "The bot will parse the data and save it to your Google Spreadsheet.",
    { parse_mode: "Markdown" }
  );
});

// ---- Vercel Serverless Function Handler ----

/**
 * This is the entry point for the Vercel serverless function.
 * It receives Telegram webhook updates and processes them with the bot.
 */
export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  if (req.method === "POST") {
    try {
      await bot.handleUpdate(req.body);
      res.status(200).json({ ok: true });
    } catch (error) {
      console.error("Error handling Telegram update:", error);
      res.status(500).json({ ok: false, error: "Internal Server Error" });
    }
  } else {
    // Respond to GET requests (useful for verifying the webhook URL is live)
    res.status(200).send("✅ Expense Tracker Bot webhook is active.");
  }
}
