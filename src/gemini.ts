// import { GoogleGenerativeAI } from "@google/generative-ai";

// ---- Types ----

export interface ExpenseData {
  source: "JAGO" | "Cash";
  category: string;
  subcategory: string;
  total_harga: number;
}

// ---- Initialization ----

/** 
 * GOOGLE GEMINI (Commented out as requested)
 * 
 * const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
 * if (!GEMINI_API_KEY) {
 *   console.error("CRITICAL: GEMINI_API_KEY is not set!");
 *   throw new Error("GEMINI_API_KEY is not set in environment variables.");
 * }
 * const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
 * const model = genAI.getGenerativeModel({
 *   model: "gemini-3.1-flash-lite-preview",
 * });
 */

// ---- OpenRouter Initialization ----

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const AI_MODEL = "google/gemini-flash-1.5:free";

if (!OPENROUTER_API_KEY) {
  console.error("CRITICAL: OPENROUTER_API_KEY is not set!");
  throw new Error("OPENROUTER_API_KEY is not set in environment variables.");
}

/**
 * Helper to call OpenRouter API
 */
async function callOpenRouter(messages: any[]) {
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
      "HTTP-Referer": "https://github.com/fachril21/expenses-tracker", // Optional, for OpenRouter rankings
      "X-Title": "Expenses Tracker Bot", // Optional
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: AI_MODEL,
      messages: messages,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(`OpenRouter API error: ${errorData.error?.message || response.statusText}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

// ---- System Prompt ----

const SYSTEM_PROMPT = `Kamu adalah asisten AI yang mengekstrak data pengeluaran dari struk belanja atau teks deskripsi pengeluaran.

ATURAN KETAT:
1. Kamu HARUS mengembalikan HANYA objek JSON yang valid, tanpa teks tambahan, tanpa markdown, tanpa code block.
2. JSON harus memiliki struktur PERSIS seperti ini:
   { "source": "JAGO" | "Cash", "category": "string", "subcategory": "string", "total_harga": number }

3. Untuk "source": metode pembayaran. Pilihan HANYA: "JAGO" atau "Cash".
   - Jika disebutkan transfer, m-banking, atau digital payment → "JAGO"
   - Jika disebutkan tunai atau cash → "Cash"
   - Jika tidak disebutkan → default "Cash"

4. Untuk "category": kategori pengeluaran. Pilihan HANYA dari daftar berikut:
   - "Kebutuhan Rumah" (kebutuhan rumah tangga, peralatan rumah, dll)
   - "Kebutuhan Makan" (makanan, minuman, groceries, restoran, warung)
   - "Transport" (transportasi, ojek online, bensin, parkir)
   - "Pulsa" (pulsa, paket data, internet)
   - "Jajan" (jajanan, snack, kopi, dessert, hiburan ringan)
   Pilih kategori yang PALING SESUAI dari daftar di atas.

5. Untuk "subcategory": nama toko, tempat, atau deskripsi singkat item yang dibeli.

6. Untuk "total_harga": total harga dalam angka (tanpa simbol mata uang, tanpa titik pemisah ribuan). Contoh: 50000 bukan "Rp 50.000".

7. JANGAN menambahkan penjelasan, komentar, atau teks apapun selain objek JSON.`;

// ---- Helper: Parse AI Response ----

function parseAIResponse(responseText: string): ExpenseData {
  // Strip any accidental markdown code fencing
  let cleaned = responseText.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "");
  }

  try {
    const parsed = JSON.parse(cleaned);

    // Validate required fields
    if (
      typeof parsed.source !== "string" ||
      typeof parsed.category !== "string" ||
      typeof parsed.subcategory !== "string" ||
      typeof parsed.total_harga !== "number"
    ) {
      throw new Error("Respons AI tidak sesuai format yang diharapkan.");
    }

    // Validate source value
    if (parsed.source !== "JAGO" && parsed.source !== "Cash") {
      parsed.source = "Cash"; // Default fallback
    }

    // Validate category value
    const validCategories = ["Kebutuhan Rumah", "Kebutuhan Makan", "Transport", "Pulsa", "Jajan"];
    if (!validCategories.includes(parsed.category)) {
      parsed.category = "Jajan"; // Default fallback
    }

    return parsed as ExpenseData;
  } catch (e) {
    console.error("Failed to parse AI response:", responseText);
    throw new Error("Gagal mengurai respons dari AI. Pastikan formatnya JSON.");
  }
}

// ---- Public API ----

/**
 * Extract expense data from a receipt image.
 * NOTE: Some free models on OpenRouter may not support vision.
 */
export async function extractExpenseFromImage(
  imageBuffer: Buffer,
  mimeType: string
): Promise<ExpenseData> {
  const base64Image = imageBuffer.toString("base64");

  // We send the system prompt as the first message to guide the model
  const responseText = await callOpenRouter([
    {
      role: "system",
      content: SYSTEM_PROMPT,
    },
    {
      role: "user",
      content: [
        {
          type: "text",
          text: "Ekstrak data pengeluaran dari struk di atas.",
        },
        {
          type: "image_url",
          image_url: {
            url: `data:${mimeType};base64,${base64Image}`,
          },
        },
      ],
    },
  ]);

  return parseAIResponse(responseText);
}

/**
 * Extract expense data from a text description.
 */
export async function extractExpenseFromText(
  text: string
): Promise<ExpenseData> {
  const responseText = await callOpenRouter([
    {
      role: "system",
      content: SYSTEM_PROMPT,
    },
    {
      role: "user",
      content: `Ekstrak data pengeluaran dari teks berikut:\n\n"${text}"`,
    },
  ]);

  return parseAIResponse(responseText);
}
