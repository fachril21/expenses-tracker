import { GoogleSpreadsheet } from "google-spreadsheet";
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

// GID of the specific worksheet to append rows to
const TARGET_SHEET_GID = 1154511153;

// Data starts at row 3 (row 1 = title, row 2 = headers)
const DATA_START_ROW = 3;

// Column mapping (0-indexed): F=5, G=6, H=7, I=8
const COL = {
  SOURCE: 5,    // Column F
  CATEGORY: 6,  // Column G
  SUBCATEGORY: 7, // Column H
  IDR: 8,       // Column I
};

// ---- Initialization ----

const serviceAccountAuth = new JWT({
  email: GOOGLE_SERVICE_ACCOUNT_EMAIL,
  // Handle escaped newline characters from env vars
  key: GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n"),
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});

const doc = new GoogleSpreadsheet(GOOGLE_SHEET_ID, serviceAccountAuth);

// ---- Public API ----

/**
 * Appends a new expense record to the target worksheet.
 * Finds the next empty row in column F (starting from row 3)
 * and writes data to columns F, G, H, I.
 */
export async function appendExpenseRecord(data: ExpenseData): Promise<void> {
  await doc.loadInfo();

  const sheet = doc.sheetsById[TARGET_SHEET_GID];

  if (!sheet) {
    throw new Error(
      `Worksheet dengan GID ${TARGET_SHEET_GID} tidak ditemukan. Pastikan sheet tersedia di spreadsheet.`
    );
  }

  // Load cells in the range F1:I100 to find the next empty row
  // Expand range if needed for larger datasets
  await sheet.loadCells("F1:I200");

  // Find the next empty row starting from DATA_START_ROW (row 3)
  let nextRow = DATA_START_ROW - 1; // 0-indexed for getCell (row 3 = index 2)
  while (nextRow < 200) {
    const cell = sheet.getCell(nextRow, COL.SOURCE);
    if (!cell.value) break;
    nextRow++;
  }

  if (nextRow >= 200) {
    throw new Error("Sheet sudah penuh (200 baris). Silakan perluas sheet.");
  }

  // Write data to the specific cells
  const sourceCell = sheet.getCell(nextRow, COL.SOURCE);
  const categoryCell = sheet.getCell(nextRow, COL.CATEGORY);
  const subcategoryCell = sheet.getCell(nextRow, COL.SUBCATEGORY);
  const idrCell = sheet.getCell(nextRow, COL.IDR);

  sourceCell.value = data.source;
  categoryCell.value = data.category;
  subcategoryCell.value = data.subcategory;
  idrCell.numberValue = data.total_harga;

  // Save all modified cells in one batch
  await sheet.saveUpdatedCells();
}
