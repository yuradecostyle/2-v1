import { eq } from 'drizzle-orm';
import type { AppDb } from './db.js';
import {
  counterparties,
  documentLines,
  documents,
  items,
  warehouses,
} from './schema.js';
import { postDocument } from './posting-engine.js';
import { d, toNumeric2, toNumeric4 } from './money.js';

export interface CsvParseResult {
  headers: string[];
  rows: Record<string, string>[];
}

export function parseCsv(rawText: string): CsvParseResult {
  const clean = rawText.replace(/^\uFEFF/, '').trim();
  if (!clean) return { headers: [], rows: [] };

  const lines = clean.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return { headers: [], rows: [] };

  // Автовизначення розділювача (BAS/Excel в Україні часто експортує з `;`)
  const firstLine = lines[0];
  const delimiter =
    (firstLine.match(/;/g)?.length ?? 0) >= (firstLine.match(/,/g)?.length ?? 0) ? ';' : ',';

  const splitLine = (line: string): string[] => {
    const out: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === delimiter && !inQuotes) {
        out.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    out.push(current.trim());
    return out;
  };

  const headers = splitLine(lines[0]);
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = splitLine(lines[i]);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = cols[idx] ?? '';
    });
    rows.push(row);
  }

  return { headers, rows };
}

function pickField(row: Record<string, string>, aliases: string[]): string {
  const keys = Object.keys(row);
  for (const alias of aliases) {
    const found = keys.find((k) => k.toLowerCase().trim() === alias.toLowerCase());
    if (found && row[found]) return row[found].trim();
  }
  return '';
}

function parseNumber(val: string): string {
  const normalized = val.replace(/\s+/g, '').replace(',', '.');
  if (!normalized || Number.isNaN(Number(normalized))) return '0';
  return normalized;
}

export async function importItemsFromBasCsv(db: AppDb, csvText: string) {
  const { rows } = parseCsv(csvText);
  const existing = await db.select().from(items);
  const bySku = new Map(existing.map((i) => [i.sku.toLowerCase(), i]));

  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const row of rows) {
    const name = pickField(row, ['Найменування', 'Номенклатура', 'Назва', 'name', 'Наименование']);
    const sku =
      pickField(row, ['Артикул', 'Код', 'sku', 'code']) ||
      `BAS-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    const unit = pickField(row, ['Од. вим.', 'Одиниця', 'Ед. изм.', 'unit']) || 'шт';
    const barcode = pickField(row, ['Штрихкод', 'barcode']);
    const typeRaw = pickField(row, ['Тип', 'Вид', 'type', 'item_type']).toLowerCase();
    const itemType = typeRaw.includes('послуг') || typeRaw.includes('service') ? 'SERVICE' : 'GOODS';

    if (!name) {
      skipped++;
      continue;
    }

    const found = bySku.get(sku.toLowerCase());
    if (found) {
      await db
        .update(items)
        .set({ name, unit, barcode, itemType })
        .where(eq(items.id, found.id));
      updated++;
    } else {
      const [ins] = await db
        .insert(items)
        .values({ sku, name, unit, barcode, itemType })
        .returning();
      bySku.set(sku.toLowerCase(), ins);
      created++;
    }
  }

  return { totalRows: rows.length, created, updated, skipped };
}

export async function importCounterpartiesFromBasCsv(db: AppDb, csvText: string) {
  const { rows } = parseCsv(csvText);
  const existing = await db.select().from(counterparties);
  const byEdrpou = new Map(
    existing.filter((c) => c.edrpou).map((c) => [c.edrpou.trim(), c])
  );
  const byName = new Map(existing.map((c) => [c.name.toLowerCase().trim(), c]));

  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const row of rows) {
    const name = pickField(row, ['Контрагент', 'Найменування', 'Назва', 'name', 'Наименование']);
    const edrpou = pickField(row, ['ЄДРПОУ', 'ЕДРПОУ', 'ІПН', 'ИНН', 'edrpou']);
    const phone = pickField(row, ['Телефон', 'phone']);
    const email = pickField(row, ['Email', 'E-mail', 'Пошта']);
    const roleRaw = pickField(row, ['Роль', 'Тип', 'role']).toLowerCase();

    const isSupplier = roleRaw.includes('постач') || roleRaw.includes('supplier');
    const isCustomer = roleRaw ? roleRaw.includes('покуп') || roleRaw.includes('клієнт') || roleRaw.includes('customer') : true;

    if (!name) {
      skipped++;
      continue;
    }

    const found = (edrpou && byEdrpou.get(edrpou)) || byName.get(name.toLowerCase());
    if (found) {
      await db
        .update(counterparties)
        .set({ name, edrpou, phone, email, isCustomer, isSupplier })
        .where(eq(counterparties.id, found.id));
      updated++;
    } else {
      const [ins] = await db
        .insert(counterparties)
        .values({ name, edrpou, phone, email, isCustomer, isSupplier })
        .returning();
      if (edrpou) byEdrpou.set(edrpou, ins);
      byName.set(name.toLowerCase(), ins);
      created++;
    }
  }

  return { totalRows: rows.length, created, updated, skipped };
}

export async function importOpeningBalancesFromBasCsv(
  db: AppDb,
  params: {
    organizationId: string;
    warehouseId: string;
    docDate: Date | string;
    csvText: string;
    autoPost?: boolean;
  }
) {
  const { rows } = parseCsv(params.csvText);
  const [allItems, allWh] = await Promise.all([
    db.select().from(items),
    db.select().from(warehouses).where(eq(warehouses.organizationId, params.organizationId)),
  ]);

  const bySku = new Map(allItems.map((i) => [i.sku.toLowerCase(), i]));
  const byName = new Map(allItems.map((i) => [i.name.toLowerCase(), i]));
  const whByName = new Map(allWh.map((w) => [w.name.toLowerCase(), w]));

  const linesToInsert: Array<{
    itemId: string;
    warehouseId: string;
    qty: string;
    price: string;
    amount: string;
  }> = [];

  let itemsAutoCreated = 0;

  for (const row of rows) {
    const sku = pickField(row, ['Артикул', 'Код', 'sku']);
    const name = pickField(row, ['Найменування', 'Номенклатура', 'Назва', 'name']);
    const qtyNum = d(parseNumber(pickField(row, ['Кількість', 'Залишок', 'Количество', 'qty'])));
    const priceNum = d(parseNumber(pickField(row, ['Собівартість', 'Ціна', 'Цена', 'price', 'cost'])));
    const amountRaw = parseNumber(pickField(row, ['Сума', 'Сумма', 'amount']));
    const amountNum = d(amountRaw).gt(0) ? d(amountRaw) : qtyNum.mul(priceNum);
    const whName = pickField(row, ['Склад', 'warehouse']);

    if (qtyNum.lte(0) || (!sku && !name)) continue;

    let item = (sku && bySku.get(sku.toLowerCase())) || (name && byName.get(name.toLowerCase()));
    if (!item) {
      const [createdItem] = await db
        .insert(items)
        .values({
          sku: sku || `IMP-${Date.now().toString(36).slice(-4)}-${itemsAutoCreated + 1}`,
          name: name || sku,
          unit: pickField(row, ['Од. вим.', 'Одиниця', 'unit']) || 'шт',
          itemType: 'GOODS',
        })
        .returning();
      item = createdItem;
      bySku.set(item.sku.toLowerCase(), item);
      byName.set(item.name.toLowerCase(), item);
      itemsAutoCreated++;
    }

    const whId = (whName && whByName.get(whName.toLowerCase())?.id) || params.warehouseId;
    const unitPrice = qtyNum.gt(0) ? amountNum.div(qtyNum) : priceNum;

    linesToInsert.push({
      itemId: item.id,
      warehouseId: whId,
      qty: toNumeric4(qtyNum),
      price: toNumeric2(unitPrice),
      amount: toNumeric2(amountNum),
    });
  }

  if (linesToInsert.length === 0) {
    return { documentId: null, linesCount: 0, itemsAutoCreated, posted: false };
  }

  const total = linesToInsert.reduce((acc, l) => acc.plus(d(l.amount)), d(0));
  const [doc] = await db
    .insert(documents)
    .values({
      organizationId: params.organizationId,
      docType: 'opening_balance',
      docNumber: `BAS-IMP-${new Date().toISOString().slice(0, 10)}`,
      docDate: new Date(params.docDate),
      status: 'DRAFT',
      warehouseId: params.warehouseId,
      totalAmount: toNumeric2(total),
      comment: 'Імпорт початкових залишків із BAS CSV',
    })
    .returning();

  await db.insert(documentLines).values(
    linesToInsert.map((l, idx) => ({
      documentId: doc.id,
      lineNo: idx + 1,
      itemId: l.itemId,
      warehouseId: l.warehouseId,
      qty: l.qty,
      price: l.price,
      amount: l.amount,
    }))
  );

  let posted = false;
  if (params.autoPost) {
    await postDocument(db, doc.id);
    posted = true;
  }

  return {
    documentId: doc.id,
    docNumber: doc.docNumber,
    linesCount: linesToInsert.length,
    itemsAutoCreated,
    totalAmount: toNumeric2(total),
    posted,
  };
}
