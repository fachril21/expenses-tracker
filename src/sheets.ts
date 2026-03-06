import { JWT } from "google-auth-library";
import type { ExpenseData } from "./gemini";

// ---- Environment Variables ----

const GOOGLE_SERVICE_ACCOUNT_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const GOOGLE_PRIVATE_KEY = process.env.GOOGLE_PRIVATE_KEY;
const GOOGLE_SHEET_ID = process.env.GOOGLE_SHEET_ID;

if (!GOOGLE_SERVICE_ACCOUNT_EMAIL || !GOOGLE_PRIVATE_KEY || !GOOGLE_SHEET_ID) {
  throw new Error(
    "Google Sheets environment variables are not set. Required: GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY, GOOGLE_SHEET_ID"
  );
}

// ---- Sheet Configuration ----

// Name of the target sheet tab (must match the sheet tab name in your spreadsheet)
const TARGET_SHEET_NAME = "List Pengeluaran";

// Data starts at row 3 (row 1 = title, row 2 = headers)
const DATA_START_ROW = 3;

// ---- Auth ----

const auth = new JWT({
  email: GOOGLE_SERVICE_ACCOUNT_EMAIL,
  key: GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n"),
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});

// ---- Helpers ----

const SHEETS_API_BASE = `https://sheets.googleapis.com/v4/spreadsheets/${GOOGLE_SHEET_ID}`;

async function getAuthHeaders(): Promise<Record<string, string>> {
  const token = await auth.getAccessToken();
  return {
    Authorization: `Bearer ${token.token}`,
    "Content-Type": "application/json",
  };
}

/**
 * Find the next empty row by reading column F starting from row 3.
 */
async function findNextEmptyRow(): Promise<number> {
  const headers = await getAuthHeaders();
  const range = `'${TARGET_SHEET_NAME}'!F${DATA_START_ROW}:F200`;
  const url = `${SHEETS_API_BASE}/values/${encodeURIComponent(range)}`;

  const response = await fetch(url, { headers });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gagal membaca sheet: ${response.status} ${errorText}`);
  }

  const data = (await response.json()) as { values?: string[][] };
  const values = data.values || [];

  // The next empty row = DATA_START_ROW + number of filled rows
  return DATA_START_ROW + values.length;
}

// ---- Public API ----

/**
 * Appends a new expense record to columns F, G, H, I
 * at the next empty row.
 */
export async function appendExpenseRecord(data: ExpenseData): Promise<void> {
  const nextRow = await findNextEmptyRow();
  const headers = await getAuthHeaders();

  // Write to F{row}:I{row}
  const range = `'${TARGET_SHEET_NAME}'!F${nextRow}:I${nextRow}`;
  const url = `${SHEETS_API_BASE}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`;

  const body = {
    range,
    majorDimension: "ROWS",
    values: [[data.source, data.category, data.subcategory, data.total_harga]],
  };

  const response = await fetch(url, {
    method: "PUT",
    headers,
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gagal menulis ke sheet: ${response.status} ${errorText}`);
  }
}
