import { Telegraf } from "telegraf";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import * as dotenv from "dotenv";
import { extractExpenseFromImage, extractExpenseFromText } from "../src/gemini";
import { appendExpenseRecord } from "../src/sheets";

// Load environment variables for local development
dotenv.config();

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

if (!BOT_TOKEN) {
  throw new Error("TELEGRAM_BOT_TOKEN is not set in environment variables.");
}

// Initialize the Telegraf bot instance
const bot = new Telegraf(BOT_TOKEN);

// ---- Helper: Format currency ----

function formatRupiah(amount: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

// ---- Bot Commands & Handlers ----

// /start command
bot.start((ctx) => {
  ctx.reply(
    "👋 Halo! Saya adalah bot pencatat pengeluaran.\n\n" +
      "Kirimkan saya:\n" +
      "• 📝 Pesan teks deskripsi pengeluaran (contoh: 'Makan siang di Warteg 25000')\n" +
      "• 📸 Foto struk belanja\n\n" +
      "Saya akan mengekstrak data dan menyimpannya ke Google Spreadsheet Anda."
  );
});

// /help command
bot.help((ctx) => {
  ctx.reply(
    "ℹ️ *Expense Tracker Bot*\n\n" +
      "Cara penggunaan:\n" +
      "• Kirim pesan teks deskripsi pengeluaran (contoh: 'Beli kopi di Starbucks 45000')\n" +
      "• Kirim foto struk belanja untuk ekstraksi otomatis\n\n" +
      "Bot akan menganalisis data dan menyimpannya ke Google Spreadsheet Anda.",
    { parse_mode: "Markdown" }
  );
});

// ---- Photo Handler ----

bot.on("photo", async (ctx) => {
  try {
    // Send processing indicator
    await ctx.reply("⏳ Sedang memproses struk...");

    // Get the highest resolution photo (last element in array)
    const photos = ctx.message.photo;
    const highResPhoto = photos[photos.length - 1];

    // Get the file link from Telegram servers
    const fileLink = await ctx.telegram.getFileLink(highResPhoto.file_id);

    // Fetch the image as ArrayBuffer
    const response = await fetch(fileLink.href);
    const arrayBuffer = await response.arrayBuffer();
    const imageBuffer = Buffer.from(arrayBuffer);

    // Extract expense data using Gemini
    const expenseData = await extractExpenseFromImage(imageBuffer, "image/jpeg");

    // Append to Google Sheets
    await appendExpenseRecord(expenseData);

    // Send success message
    await ctx.reply(
      `✅ Berhasil dicatat!\n\n` +
        `💳 Source: ${expenseData.source}\n` +
        `📂 Kategori: ${expenseData.category}\n` +
        `🏪 Deskripsi: ${expenseData.subcategory}\n` +
        `💰 Total: ${formatRupiah(expenseData.total_harga)}`
    );
  } catch (error) {
    console.error("Error processing photo:", error);
    await ctx.reply(
      "❌ Gagal memproses struk. Silakan pastikan foto jelas dan coba lagi."
    );
  }
});

// ---- Text Handler ----

bot.on("text", async (ctx) => {
  const userText = ctx.message.text;

  // Ignore if it looks like a command (already handled by bot.command handlers)
  if (userText.startsWith("/")) return;

  try {
    // Send processing indicator
    await ctx.reply("⏳ Sedang memproses...");

    // Extract expense data using Gemini
    const expenseData = await extractExpenseFromText(userText);

    // Append to Google Sheets
    await appendExpenseRecord(expenseData);

    // Send success message
    await ctx.reply(
      `✅ Berhasil dicatat!\n\n` +
        `💳 Source: ${expenseData.source}\n` +
        `📂 Kategori: ${expenseData.category}\n` +
        `🏪 Deskripsi: ${expenseData.subcategory}\n` +
        `💰 Total: ${formatRupiah(expenseData.total_harga)}`
    );
  } catch (error) {
    console.error("Error processing text:", error);
    await ctx.reply(
      "❌ Gagal memproses pesan. Silakan coba lagi dengan format yang lebih jelas.\n\n" +
        "Contoh: 'Makan siang di Warteg Bahari 25000'"
    );
  }
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
