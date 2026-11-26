import * as XLSX from 'xlsx';
import { XMLParser } from 'fast-xml-parser';
import { extractText, getDocumentProxy } from 'unpdf';
import { eq } from 'drizzle-orm';
import type { AppDb } from './db.js';
import { categories, contracts, counterparties, documentLines, documents, items, priceTypes } from './schema.js';
import { postDocument } from './posting-engine.js';
import { toNumeric2 } from './money.js';

export interface ParsedImportItem {
  sku: string;
  name: string;
  categoryName: string;
  unit: string;
  price: number;
  barcode: string;
  itemType: 'GOODS' | 'SERVICE';
}

export interface UniversalParseResult {
  format: 'EXCEL' | 'CSV' | 'XML' | 'PDF';
  filename: string;
  totalDetected: number;
  warnings: string[];
  items: ParsedImportItem[];
}

function cleanStr(val: unknown): string {
  if (val === null || val === undefined) return '';
  return String(val).replace(/\s+/g, ' ').trim();
}

function parsePriceNumber(val: unknown): number {
  if (typeof val === 'number' && Number.isFinite(val)) return Math.max(0, Number(val.toFixed(2)));
  const raw = cleanStr(val)
    .replace(/(грн|uah|₴|usd|\$|eur|€)/gi, '')
    .replace(/\s+/g, '')
    .replace(/,/g, '.');
  const match = raw.match(/-?\d+(\.\d+)?/);
  if (!match) return 0;
  const num = Number(match[0]);
  return Number.isFinite(num) && num >= 0 ? Number(num.toFixed(2)) : 0;
}

function normalizeUnit(raw: string): string {
  const s = cleanStr(raw).toLowerCase().replace(/\.$/, '');
  if (!s) return 'шт';
  if (/^(шт|штук|pcs|pc|ea)$/.test(s)) return 'шт';
  if (/^(м2|м²|кв\.?м|m2|sqm)$/.test(s)) return 'м²';
  if (/^(м\.?п|мп|пог\.?м)$/.test(s)) return 'м.п.';
  if (/^(м|метр|m)$/.test(s)) return 'м';
  if (/^(кг|kg)$/.test(s)) return 'кг';
  if (/^(л|літр|l)$/.test(s)) return 'л';
  if (/^(уп|упак|пач|кор|короб|pack|box)$/.test(s)) return 'уп';
  if (/^(компл|набір|set)$/.test(s)) return 'компл';
  if (/^(посл|усл|service|год)$/.test(s)) return 'посл';
  return cleanStr(raw).slice(0, 12);
}

function detectItemType(rawType: string, name: string, unit: string): 'GOODS' | 'SERVICE' {
  const hay = `${rawType} ${name} ${unit}`.toLowerCase();
  if (
    rawType.toLowerCase().includes('service') ||
    rawType.toLowerCase().includes('послуг') ||
    rawType.toLowerCase().includes('услуг') ||
    rawType.toLowerCase().includes('робот') ||
    unit === 'посл' ||
    /^(послуг|монтаж|доставк|уклад|різка|порізк|ремонт|налаштув|консультац)/.test(hay.trim())
  ) {
    return 'SERVICE';
  }
  return 'GOODS';
}

function decodeTextSmart(buf: Buffer): string {
  // Check UTF-8 BOM or valid UTF-8
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    return buf.toString('utf8').slice(1);
  }
  const utf8 = buf.toString('utf8');
  // If UTF-8 produced replacement chars (U+FFFD), fall back to Windows-1251 (very common in Ukrainian 1C/Excel CSVs)
  if (utf8.includes('\uFFFD')) {
    try {
      return new TextDecoder('windows-1251').decode(buf);
    } catch {
      return utf8;
    }
  }
  return utf8;
}

function parseDelimitedText(text: string): string[][] {
  const lines = text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];

  const sample = lines.slice(0, 10).join('\n');
  const semiCount = (sample.match(/;/g) || []).length;
  const tabCount = (sample.match(/\t/g) || []).length;
  const commaCount = (sample.match(/,/g) || []).length;
  const sep =
    tabCount >= semiCount && tabCount >= commaCount && tabCount > 0
      ? '\t'
      : semiCount >= commaCount && semiCount > 0
        ? ';'
        : ',';

  return lines.map((line) => {
    const out: string[] = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === sep && !inQuotes) {
        out.push(cur.trim());
        cur = '';
      } else {
        cur += ch;
      }
    }
    out.push(cur.trim());
    return out;
  });
}

function extractItemsFromMatrix(rows: unknown[][], warnings: string[]): ParsedImportItem[] {
  const cleanRows = rows
    .map((r) => (Array.isArray(r) ? r.map(cleanStr) : []))
    .filter((r) => r.some((cell) => cell.length > 0));

  if (cleanRows.length === 0) return [];

  // Score candidate header rows in first 15 rows
  const headerKeywords = [
    'назва',
    'найменування',
    'наименование',
    'товар',
    'номенклатура',
    'name',
    'title',
    'product',
    'артикул',
    'арт',
    'код',
    'sku',
    'code',
    'ціна',
    'цена',
    'price',
    'вартість',
    'категорія',
    'категория',
    'група',
    'группа',
    'category',
    'од',
    'ед',
    'unit',
    'штрих',
    'barcode',
    'ean',
  ];

  let headerIdx = -1;
  let bestScore = 0;
  for (let i = 0; i < Math.min(cleanRows.length, 15); i++) {
    const row = cleanRows[i];
    let score = 0;
    for (const cell of row) {
      const lc = cell.toLowerCase();
      if (headerKeywords.some((kw) => lc.includes(kw))) score++;
    }
    if (score > bestScore && score >= 2) {
      bestScore = score;
      headerIdx = i;
    }
  }

  let colSku = -1;
  let colName = -1;
  let colCat = -1;
  let colUnit = -1;
  let colPrice = -1;
  let colBarcode = -1;
  let colType = -1;

  if (headerIdx >= 0) {
    const hdr = cleanRows[headerIdx].map((c) => c.toLowerCase());
    hdr.forEach((h, idx) => {
      if (colName < 0 && /(назв|найменув|наименов|товар|номенкл|name|title|product|опис)/.test(h)) {
        colName = idx;
      } else if (colSku < 0 && /(артикул|арт\.|sku|код|vendorcode|article|code)/.test(h) && !/штрих|укт/.test(h)) {
        colSku = idx;
      } else if (colBarcode < 0 && /(штрих|barcode|ean|upc)/.test(h)) {
        colBarcode = idx;
      } else if (colCat < 0 && /(катег|груп|розділ|раздел|category|group|бренд|brand)/.test(h)) {
        colCat = idx;
      } else if (colUnit < 0 && /(од\.|один|ед\.|единиц|unit|вим)/.test(h)) {
        colUnit = idx;
      } else if (colPrice < 0 && /(ціна|цена|price|варт|роздр|опт|прайс)/.test(h)) {
        colPrice = idx;
      } else if (colType < 0 && /(тип|вид|type)/.test(h)) {
        colType = idx;
      }
    });
  }

  const dataRows = headerIdx >= 0 ? cleanRows.slice(headerIdx + 1) : cleanRows;

  // Fallback heuristics if no explicit header row matched
  if (colName < 0) {
    warnings.push('Заголовки колонок не знайдено явно — застосовано автоматичне визначення колонок.');
    const colCount = Math.max(...dataRows.slice(0, 20).map((r) => r.length), 1);
    if (colCount === 1) {
      colName = 0;
    } else if (colCount === 2) {
      // Check if col 1 is numeric (Name | Price) or col 0 is short SKU (SKU | Name)
      const secondNumeric = dataRows.slice(0, 10).filter((r) => parsePriceNumber(r[1]) > 0).length;
      if (secondNumeric >= 3) {
        colName = 0;
        colPrice = 1;
      } else {
        colSku = 0;
        colName = 1;
      }
    } else {
      // Pick column with longest average text as Name
      let bestNameCol = 0;
      let maxAvgLen = -1;
      for (let c = 0; c < colCount; c++) {
        const vals = dataRows.slice(0, 25).map((r) => r[c] || '');
        const avgLen = vals.reduce((s, v) => s + v.length, 0) / Math.max(vals.length, 1);
        if (avgLen > maxAvgLen) {
          maxAvgLen = avgLen;
          bestNameCol = c;
        }
      }
      colName = bestNameCol;
      if (bestNameCol > 0) colSku = bestNameCol - 1;
      // Pick rightmost numeric column as Price
      for (let c = colCount - 1; c >= 0; c--) {
        if (c === colName || c === colSku) continue;
        const numHits = dataRows.slice(0, 20).filter((r) => parsePriceNumber(r[c]) > 0).length;
        if (numHits >= Math.min(3, dataRows.length)) {
          colPrice = c;
          break;
        }
      }
    }
  }

  const result: ParsedImportItem[] = [];
  let currentGroupHeading = '';

  for (const row of dataRows) {
    const nonEmpty = row.filter((c) => c.length > 0);
    if (nonEmpty.length === 0) continue;

    // Detect category group header row (only 1 non-empty text cell, no price/sku)
    if (nonEmpty.length === 1 && nonEmpty[0].length >= 3 && nonEmpty[0].length <= 80 && !/^\d+([.,]\d+)?$/.test(nonEmpty[0])) {
      if (!/^(разом|всього|итого|total|стор|page)/i.test(nonEmpty[0])) {
        currentGroupHeading = nonEmpty[0];
        continue;
      }
    }

    const name = cleanStr(row[colName]);
    if (!name || name.length < 2) continue;
    if (/^(разом|всього|итого|підсумок|total|найменування|назва|товар)$/i.test(name)) continue;

    const skuRaw = colSku >= 0 ? cleanStr(row[colSku]) : '';
    const catRaw = colCat >= 0 ? cleanStr(row[colCat]) : currentGroupHeading;
    const unitRaw = colUnit >= 0 ? normalizeUnit(row[colUnit]) : 'шт';
    const price = colPrice >= 0 ? parsePriceNumber(row[colPrice]) : 0;
    const barcode = colBarcode >= 0 ? cleanStr(row[colBarcode]) : '';
    const typeRaw = colType >= 0 ? cleanStr(row[colType]) : '';

    result.push({
      sku: skuRaw,
      name,
      categoryName: catRaw,
      unit: unitRaw,
      price,
      barcode,
      itemType: detectItemType(typeRaw, name, unitRaw),
    });
  }

  return result;
}

function asArray<T>(v: T | T[] | undefined | null): T[] {
  if (!v) return [];
  return Array.isArray(v) ? v : [v];
}

function parseXmlItems(xmlText: string, warnings: string[]): ParsedImportItem[] {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    textNodeName: '#text',
    trimValues: true,
    parseTagValue: false,
  });
  const doc = parser.parse(xmlText);
  if (!doc || typeof doc !== 'object') {
    warnings.push('Не вдалося розібрати структуру XML-файлу.');
    return [];
  }

  const out: ParsedImportItem[] = [];

  // 1. YML / Prom.ua / Rozetka / Хорошоп format: yml_catalog.shop.offers.offer
  const shop = doc?.yml_catalog?.shop ?? doc?.shop ?? doc?.price;
  if (shop) {
    const catMap = new Map<string, string>();
    for (const c of asArray(shop?.categories?.category)) {
      if (typeof c === 'object' && c) {
        const id = cleanStr(c['@_id'] ?? c.id);
        const name = cleanStr(c['#text'] ?? c.name);
        if (id && name) catMap.set(id, name);
      }
    }
    const offers = asArray(shop?.offers?.offer ?? shop?.items?.item ?? shop?.products?.product);
    for (const off of offers) {
      if (!off || typeof off !== 'object') continue;
      const name = cleanStr(
        off.name_ua ?? off.name ?? off.title ?? off.model ?? off['#text'] ?? ''
      );
      if (!name) continue;
      const sku = cleanStr(
        off.vendorCode ?? off.article ?? off.sku ?? off.code ?? off['@_id'] ?? ''
      );
      const catId = cleanStr(off.categoryId ?? off.category_id ?? '');
      const categoryName =
        (catId ? catMap.get(catId) : '') || cleanStr(off.category ?? off.group ?? off.vendor ?? '');
      const unit = normalizeUnit(cleanStr(off.unit ?? off.measure ?? 'шт'));
      const price = parsePriceNumber(off.price ?? off.priceuah ?? off.cost ?? 0);
      const barcode = cleanStr(off.barcode ?? off.ean ?? '');
      out.push({
        sku,
        name,
        categoryName,
        unit,
        price,
        barcode,
        itemType: detectItemType(cleanStr(off.type ?? ''), name, unit),
      });
    }
    if (out.length > 0) return out;
  }

  // 2. CommerceML (1С / BAS XML export): КоммерческаяИнформация.Каталог.Товары.Товар
  const cmInfo = doc?.['КоммерческаяИнформация'] ?? doc?.['КомерційнаІнформація'];
  if (cmInfo) {
    const groupMap = new Map<string, string>();
    const collectGroups = (node: unknown) => {
      for (const g of asArray(node as Record<string, unknown>)) {
        if (!g || typeof g !== 'object') continue;
        const id = cleanStr((g as Record<string, unknown>)['Ид'] ?? (g as Record<string, unknown>)['Ід']);
        const name = cleanStr(
          (g as Record<string, unknown>)['Наименование'] ?? (g as Record<string, unknown>)['Найменування']
        );
        if (id && name) groupMap.set(id, name);
        const sub = (g as Record<string, unknown>)['Группы'] ?? (g as Record<string, unknown>)['Групи'];
        if (sub && typeof sub === 'object') {
          collectGroups((sub as Record<string, unknown>)['Группа'] ?? (sub as Record<string, unknown>)['Група']);
        }
      }
    };
    const classifier = cmInfo['Классификатор'] ?? cmInfo['Класифікатор'];
    if (classifier) {
      const rootGroups = classifier['Группы'] ?? classifier['Групи'];
      if (rootGroups) collectGroups(rootGroups['Группа'] ?? rootGroups['Група']);
    }

    const catalog = cmInfo['Каталог'];
    const goodsNode = catalog?.['Товары'] ?? catalog?.['Товари'];
    const goods = asArray(goodsNode?.['Товар']);
    for (const g of goods) {
      if (!g || typeof g !== 'object') continue;
      const name = cleanStr(g['Наименование'] ?? g['Найменування'] ?? g['ПолноеНаименование'] ?? '');
      if (!name) continue;
      const sku = cleanStr(g['Артикул'] ?? g['Код'] ?? g['Ид'] ?? '');
      const barcode = cleanStr(g['Штрихкод'] ?? '');
      const unitNode = g['БазоваяЕдиница'] ?? g['БазоваОдиниця'];
      const unit = normalizeUnit(
        typeof unitNode === 'object' && unitNode
          ? cleanStr(unitNode['#text'] ?? unitNode['@_НаименованиеПолное'] ?? 'шт')
          : cleanStr(unitNode ?? 'шт')
      );
      const grpRef = cleanStr(g['Группы']?.['Ид'] ?? g['Групи']?.['Ід'] ?? '');
      const categoryName = grpRef ? (groupMap.get(grpRef) ?? '') : '';
      const price = parsePriceNumber(g['Цена'] ?? g['Ціна'] ?? 0);
      out.push({
        sku,
        name,
        categoryName,
        unit,
        price,
        barcode,
        itemType: detectItemType('', name, unit),
      });
    }
    if (out.length > 0) return out;
  }

  // 3. Generic XML fallback: recursively locate any array of product-like objects
  const candidates: Array<Record<string, unknown>> = [];
  const walk = (node: unknown) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      for (const el of node) {
        if (el && typeof el === 'object' && !Array.isArray(el)) {
          const obj = el as Record<string, unknown>;
          const keys = Object.keys(obj).map((k) => k.toLowerCase());
          const hasNameKey = keys.some((k) =>
            /(name|title|назв|найменув|наименов|product|item|товар)/.test(k)
          );
          if (hasNameKey) candidates.push(obj);
          else walk(obj);
        } else {
          walk(el);
        }
      }
      return;
    }
    for (const val of Object.values(node as Record<string, unknown>)) {
      walk(val);
    }
  };
  walk(doc);

  for (const obj of candidates) {
    const getByPattern = (re: RegExp): string => {
      for (const [k, v] of Object.entries(obj)) {
        if (re.test(k.toLowerCase())) {
          if (typeof v === 'string' || typeof v === 'number') return cleanStr(v);
          if (v && typeof v === 'object' && '#text' in (v as Record<string, unknown>)) {
            return cleanStr((v as Record<string, unknown>)['#text']);
          }
        }
      }
      return '';
    };
    const name = getByPattern(/(name|title|назв|найменув|наименов|product|товар)/);
    if (!name || name.length < 2) continue;
    const sku = getByPattern(/(sku|art|арт|код|code|vendorcode|@_id)/);
    const categoryName = getByPattern(/(cat|катег|group|груп|brand|бренд)/);
    const unit = normalizeUnit(getByPattern(/(unit|measure|од|ед)/) || 'шт');
    const price = parsePriceNumber(getByPattern(/(price|цін|цен|cost|варт)/));
    const barcode = getByPattern(/(barcode|ean|штрих)/);
    out.push({
      sku,
      name,
      categoryName,
      unit,
      price,
      barcode,
      itemType: detectItemType('', name, unit),
    });
  }

  return out;
}

async function parsePdfItems(buf: Buffer, warnings: string[]): Promise<ParsedImportItem[]> {
  const pdf = await getDocumentProxy(new Uint8Array(buf));
  const { text } = await extractText(pdf, { mergePages: false });
  const pages = Array.isArray(text) ? text : [String(text ?? '')];
  const rawLines = pages
    .flatMap((page) => page.split(/\r?\n/))
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (rawLines.length === 0) {
    warnings.push(
      'У PDF не знайдено текстового шару (можливо, це відскановане зображення без OCR). Спробуйте експортувати прайс у XLS/CSV/XML або текстовий PDF.'
    );
    return [];
  }

  const out: ParsedImportItem[] = [];
  const skipLineRe =
    /^(стор\.?|page\s+\d|разом|всього|итого|пдв|ндс|єдрпоу|іпн|iban|мфо|рахунок|видаткова|накладна|постачальник|покупець|одержувач|дата|тел\.|email|www\.|http|№\s+артикул|№\s+найменув)/i;

  const unitTokenRe = /\b(шт\.?|м2|м²|кв\.?\s*м|м\.?\s*п\.?|мп|пог\.?\s*м|кг|л|уп\.?|упак\.?|кор\.?|компл\.?|посл\.?|м)\b/i;

  for (const line of rawLines) {
    if (line.length < 4 || skipLineRe.test(line)) continue;

    // Split by 2+ spaces or tab (typical for PDF table exports from Excel / 1C / BAS)
    const cols = line.split(/\t|\s{2,}/).map((c) => c.trim()).filter(Boolean);
    if (cols.length >= 3) {
      let work = [...cols];
      // Drop leading line number (e.g., "1", "12.")
      if (/^\d{1,4}\.?$/.test(work[0])) work.shift();

      let sku = '';
      if (work.length >= 2 && /^[A-Za-zА-Яа-яІіЇїЄє0-9._/-]{2,22}$/.test(work[0]) && /\d/.test(work[0]) && !/^\d+[.,]\d{2}$/.test(work[0])) {
        sku = work.shift()!;
      }

      // Extract trailing price
      let price = 0;
      for (let i = work.length - 1; i >= 1; i--) {
        const p = parsePriceNumber(work[i]);
        if (p > 0 && /\d/.test(work[i])) {
          price = p;
          work.splice(i, 1);
          break;
        }
      }

      // Extract unit if present
      let unit = 'шт';
      for (let i = work.length - 1; i >= 1; i--) {
        if (work[i].length <= 10 && unitTokenRe.test(work[i])) {
          unit = normalizeUnit(work[i]);
          work.splice(i, 1);
          break;
        }
      }

      // Drop leftover pure quantity column
      if (work.length >= 2 && /^\d+([.,]\d+)?$/.test(work[work.length - 1])) {
        work.pop();
      }

      const name = cleanStr(work.join(' '));
      if (name.length >= 3 && !skipLineRe.test(name) && !/^\d+([.,]\d+)?$/.test(name)) {
        out.push({
          sku,
          name,
          categoryName: '',
          unit,
          price,
          barcode: '',
          itemType: detectItemType('', name, unit),
        });
        continue;
      }
    }

    // Fallback single-spaced line pattern: "[№] [SKU] Name ... [unit] Price [грн]"
    const priceMatch = line.match(
      /^(?:\d{1,4}\.?\s+)?(?:([A-Za-z0-9][A-Za-z0-9._/-]{2,18})\s+)?(.{4,140}?)\s+(?:(шт\.?|м2|м²|кв\.?м|м\.?п\.?|кг|л|уп\.?|компл\.?|посл\.?)\s+)?(\d[\d\s]{0,9}(?:[.,]\d{1,2})?)\s*(?:грн\.?|₴|uah)?$/i
    );
    if (priceMatch) {
      const sku = cleanStr(priceMatch[1] ?? '');
      const name = cleanStr(priceMatch[2] ?? '');
      const unit = normalizeUnit(priceMatch[3] ?? 'шт');
      const price = parsePriceNumber(priceMatch[4] ?? 0);
      if (name.length >= 3 && !skipLineRe.test(name) && price > 0) {
        out.push({
          sku,
          name,
          categoryName: '',
          unit,
          price,
          barcode: '',
          itemType: detectItemType('', name, unit),
        });
      }
    }
  }

  if (out.length === 0) {
    warnings.push(
      'У PDF виявлено текст, але рядки товарів не мають чіткої табличної структури. Ви можете додати/відредагувати позиції вручну або завантажити Excel/CSV/XML.'
    );
  }
  return out;
}

export async function parseUniversalItemsFile(params: {
  filename: string;
  contentBase64: string;
  mimeType?: string;
}): Promise<UniversalParseResult> {
  const filename = params.filename.trim() || 'import.csv';
  const ext = filename.toLowerCase().split('.').pop() ?? '';
  const mime = (params.mimeType ?? '').toLowerCase();
  const buf = Buffer.from(params.contentBase64, 'base64');
  const warnings: string[] = [];

  let format: UniversalParseResult['format'] = 'CSV';
  let parsed: ParsedImportItem[] = [];

  if (ext === 'pdf' || mime.includes('pdf') || buf.subarray(0, 4).toString('ascii') === '%PDF') {
    format = 'PDF';
    parsed = await parsePdfItems(buf, warnings);
  } else if (
    ext === 'xml' ||
    ext === 'yml' ||
    mime.includes('xml') ||
    buf.subarray(0, 80).toString('utf8').trimStart().startsWith('<')
  ) {
    format = 'XML';
    const xmlText = decodeTextSmart(buf);
    parsed = parseXmlItems(xmlText, warnings);
  } else if (
    ext === 'xlsx' ||
    ext === 'xls' ||
    ext === 'ods' ||
    mime.includes('spreadsheet') ||
    mime.includes('excel')
  ) {
    format = 'EXCEL';
    const wb = XLSX.read(buf, { type: 'buffer' });
    let bestRows: unknown[][] = [];
    for (const sheetName of wb.SheetNames) {
      const ws = wb.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' });
      if (rows.length > bestRows.length) bestRows = rows;
    }
    parsed = extractItemsFromMatrix(bestRows, warnings);
  } else {
    format = 'CSV';
    const text = decodeTextSmart(buf);
    const matrix = parseDelimitedText(text);
    parsed = extractItemsFromMatrix(matrix, warnings);
  }

  // Auto-fill missing SKUs & deduplicate within the file
  const seen = new Set<string>();
  const deduped: ParsedImportItem[] = [];
  let autoSeq = 1;
  for (const item of parsed) {
    const cleanName = cleanStr(item.name);
    if (!cleanName) continue;
    const sku = cleanStr(item.sku) || `IMP-${String(autoSeq++).padStart(4, '0')}`;
    const key = `${sku.toLowerCase()}::${cleanName.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push({
      ...item,
      sku,
      name: cleanName,
      categoryName: cleanStr(item.categoryName),
      unit: normalizeUnit(item.unit || 'шт'),
      price: Number.isFinite(item.price) && item.price >= 0 ? Number(item.price.toFixed(2)) : 0,
      barcode: cleanStr(item.barcode),
    });
  }

  return {
    format,
    filename,
    totalDetected: deduped.length,
    warnings,
    items: deduped.slice(0, 2000),
  };
}

export async function commitUniversalItemsImport(
  db: AppDb,
  params: {
    organizationId: string;
    departmentId?: string | null;
    items: ParsedImportItem[];
    defaultCategoryName?: string;
    createPriceSetting?: boolean;
    priceTypeId?: string | null;
  }
) {
  const existingCats = await db.select().from(categories);
  const catByName = new Map(existingCats.map((c) => [c.name.trim().toLowerCase(), c.id]));

  const ensureCategory = async (nameRaw: string): Promise<string | null> => {
    const name = cleanStr(nameRaw) || cleanStr(params.defaultCategoryName ?? '');
    if (!name) return null;
    const key = name.toLowerCase();
    if (catByName.has(key)) return catByName.get(key)!;
    const [created] = await db.insert(categories).values({ name }).returning();
    catByName.set(key, created.id);
    return created.id;
  };

  const existingItems = await db.select().from(items);
  const bySku = new Map(existingItems.map((i) => [i.sku.trim().toLowerCase(), i]));
  const byName = new Map(existingItems.map((i) => [i.name.trim().toLowerCase(), i]));

  let createdCount = 0;
  let updatedCount = 0;
  let categoriesCreated = 0;
  const initialCatCount = catByName.size;
  const priceEntries: Array<{ itemId: string; price: number }> = [];

  for (const row of params.items) {
    const name = cleanStr(row.name);
    if (!name) continue;
    const sku = cleanStr(row.sku) || `IMP-${String(Date.now()).slice(-5)}-${createdCount + 1}`;
    const catId = await ensureCategory(row.categoryName);
    const unit = normalizeUnit(row.unit || 'шт');
    const barcode = cleanStr(row.barcode);
    const itemType = row.itemType === 'SERVICE' ? 'SERVICE' : 'GOODS';

    const existing = bySku.get(sku.toLowerCase()) ?? byName.get(name.toLowerCase());
    let targetItemId: string;

    if (existing) {
      await db
        .update(items)
        .set({
          name,
          unit,
          itemType,
          ...(catId ? { categoryId: catId } : {}),
          ...(barcode ? { barcode } : {}),
        })
        .where(eq(items.id, existing.id));
      targetItemId = existing.id;
      updatedCount++;
    } else {
      const [inserted] = await db
        .insert(items)
        .values({
          sku,
          name,
          barcode,
          categoryId: catId,
          unit,
          itemType,
          isActive: true,
        })
        .returning();
      bySku.set(sku.toLowerCase(), inserted);
      byName.set(name.toLowerCase(), inserted);
      targetItemId = inserted.id;
      createdCount++;
    }

    if (row.price > 0) {
      priceEntries.push({ itemId: targetItemId, price: row.price });
    }
  }

  categoriesCreated = catByName.size - initialCatCount;

  // Optionally create & post price_setting document for imported prices
  let priceDocNumber: string | null = null;
  if (params.createPriceSetting && priceEntries.length > 0) {
    let ptId = params.priceTypeId ?? null;
    if (!ptId) {
      const pts = await db.select().from(priceTypes).limit(1);
      ptId = pts[0]?.id ?? null;
    }
    if (ptId) {
      const [pDoc] = await db
        .insert(documents)
        .values({
          organizationId: params.organizationId,
          departmentId: params.departmentId ?? null,
          docType: 'price_setting',
          docNumber: `ВЦ-ІМП-${String(Date.now()).slice(-4)}`,
          docDate: new Date(),
          status: 'DRAFT',
          priceTypeId: ptId,
          totalAmount: '0.00',
          comment: `Автоматичне встановлення цін при імпорті номенклатури (${priceEntries.length} поз.)`,
        })
        .returning();

      await db.insert(documentLines).values(
        priceEntries.map((pe, idx) => ({
          documentId: pDoc.id,
          lineNo: idx + 1,
          lineRole: 'ITEM',
          itemId: pe.itemId,
          qty: '1.0000',
          price: toNumeric2(pe.price),
          amount: toNumeric2(pe.price),
        }))
      );
      await postDocument(db, pDoc.id);
      priceDocNumber = pDoc.docNumber;
    }
  }

  return {
    created: createdCount,
    updated: updatedCount,
    categoriesCreated,
    pricesApplied: priceDocNumber ? priceEntries.length : 0,
    priceDocNumber,
  };
}

// ============================================================================
// УНІВЕРСАЛЬНИЙ ІМПОРТ ПОКУПЦІВ ТА КОНТРАГЕНТІВ (PDF / EXCEL / CSV / XML)
// ============================================================================

export interface ParsedImportCounterparty {
  name: string;
  edrpou: string;
  ipn: string;
  iban: string;
  phone: string;
  email: string;
  isCustomer: boolean;
  isSupplier: boolean;
}

export interface UniversalCounterpartiesParseResult {
  format: 'EXCEL' | 'CSV' | 'XML' | 'PDF';
  filename: string;
  totalDetected: number;
  warnings: string[];
  counterparties: ParsedImportCounterparty[];
}

function detectCounterpartyRoles(rawRole: string): { isCustomer: boolean; isSupplier: boolean } {
  const s = rawRole.toLowerCase();
  if (!s) return { isCustomer: true, isSupplier: false };
  const isSup = /(постач|поставщ|supplier|vendor|партнер)/.test(s);
  const isCust = /(покуп|клієнт|клиент|buyer|customer|client|замовн)/.test(s);
  if (isSup && isCust) return { isCustomer: true, isSupplier: true };
  if (isSup) return { isCustomer: false, isSupplier: true };
  return { isCustomer: true, isSupplier: false };
}

function extractCounterpartiesFromMatrix(
  rows: unknown[][],
  warnings: string[]
): ParsedImportCounterparty[] {
  const cleanRows = rows
    .map((r) => (Array.isArray(r) ? r.map(cleanStr) : []))
    .filter((r) => r.some((cell) => cell.length > 0));

  if (cleanRows.length === 0) return [];

  const headerKeywords = [
    'назва',
    'найменування',
    'наименование',
    'контрагент',
    'покупець',
    'клієнт',
    'клиент',
    'постачальник',
    'компанія',
    'організація',
    'піб',
    'фио',
    'name',
    'client',
    'customer',
    'supplier',
    'єдрпоу',
    'едрпоу',
    'окпо',
    'іпн',
    'инн',
    'рнокпп',
    'edrpou',
    'iban',
    'рахунок',
    'телефон',
    'тел',
    'phone',
    'email',
    'e-mail',
    'пошта',
    'роль',
    'тип',
  ];

  let headerIdx = -1;
  let bestScore = 0;
  for (let i = 0; i < Math.min(cleanRows.length, 15); i++) {
    let score = 0;
    for (const cell of cleanRows[i]) {
      const lc = cell.toLowerCase();
      if (headerKeywords.some((kw) => lc.includes(kw))) score++;
    }
    if (score > bestScore && score >= 1) {
      bestScore = score;
      headerIdx = i;
    }
  }

  let colName = -1;
  let colEdrpou = -1;
  let colIpn = -1;
  let colIban = -1;
  let colPhone = -1;
  let colEmail = -1;
  let colRole = -1;

  if (headerIdx >= 0) {
    const hdr = cleanRows[headerIdx].map((c) => c.toLowerCase());
    hdr.forEach((h, idx) => {
      if (
        colName < 0 &&
        /(назв|найменув|наименов|контрагент|покуп|клієнт|клиент|постач|компан|організ|піб|фио|name|client|customer|partner)/.test(
          h
        )
      ) {
        colName = idx;
      } else if (colEdrpou < 0 && /(єдрпоу|едрпоу|окпо|код|edrpou|tax)/.test(h)) {
        colEdrpou = idx;
      } else if (colIpn < 0 && /(іпн|инн|рнокпп|ipn|tin)/.test(h)) {
        colIpn = idx;
      } else if (colIban < 0 && /(iban|рахунок|счет|р\/р|bank)/.test(h)) {
        colIban = idx;
      } else if (colPhone < 0 && /(тел|phone|моб|mobile|контакт)/.test(h)) {
        colPhone = idx;
      } else if (colEmail < 0 && /(mail|пошт|email)/.test(h)) {
        colEmail = idx;
      } else if (colRole < 0 && /(роль|тип|вид|role|type|група)/.test(h)) {
        colRole = idx;
      }
    });
  }

  const dataRows = headerIdx >= 0 ? cleanRows.slice(headerIdx + 1) : cleanRows;

  if (colName < 0) {
    warnings.push('Заголовки колонок контрагентів визначено автоматично.');
    colName = 0;
  }

  const result: ParsedImportCounterparty[] = [];
  const seen = new Set<string>();

  for (const r of dataRows) {
    let name = cleanStr(r[colName]);
    if (!name || name.length < 2) continue;
    if (/^(всього|разом|итого|total|№|контрагент|найменування)$/i.test(name)) continue;

    // Scan all cells for auto-extraction of IBAN, email, phone, EDRPOU if columns weren't explicitly mapped
    let edrpou = colEdrpou >= 0 ? cleanStr(r[colEdrpou]) : '';
    let ipn = colIpn >= 0 ? cleanStr(r[colIpn]) : '';
    let iban = colIban >= 0 ? cleanStr(r[colIban]) : '';
    let phone = colPhone >= 0 ? cleanStr(r[colPhone]) : '';
    let email = colEmail >= 0 ? cleanStr(r[colEmail]) : '';
    const rawRole = colRole >= 0 ? cleanStr(r[colRole]) : '';

    for (let c = 0; c < r.length; c++) {
      if (c === colName) continue;
      const cell = r[c];
      if (!cell) continue;
      if (!iban && /^UA\d{25,29}$/i.test(cell.replace(/\s+/g, ''))) {
        iban = cell.replace(/\s+/g, '').toUpperCase();
      } else if (!email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cell)) {
        email = cell;
      } else if (!phone && /(\+?38\s*0|0\d{2})[\s\-()]?\d{3}[\s\-()]?\d{2}[\s\-()]?\d{2}/.test(cell)) {
        phone = cell;
      } else if (!edrpou && /^\d{8,10}$/.test(cell)) {
        edrpou = cell;
      }
    }

    edrpou = edrpou.replace(/[^\d]/g, '').slice(0, 12);
    ipn = ipn.replace(/[^\d]/g, '').slice(0, 12);
    const key = edrpou ? `edrpou:${edrpou}` : `name:${name.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const roles = detectCounterpartyRoles(rawRole);
    result.push({
      name: name.slice(0, 180),
      edrpou,
      ipn,
      iban,
      phone,
      email,
      isCustomer: roles.isCustomer,
      isSupplier: roles.isSupplier,
    });
  }

  return result;
}

function extractCounterpartiesFromXml(xmlText: string, warnings: string[]): ParsedImportCounterparty[] {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    trimValues: true,
    parseTagValue: false,
  });
  const doc = parser.parse(xmlText);
  const out: ParsedImportCounterparty[] = [];
  const seen = new Set<string>();

  const walk = (node: unknown) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      for (const el of node) walk(el);
      return;
    }
    const rec = node as Record<string, unknown>;
    const nameVal =
      rec.name ??
      rec.Name ??
      rec.FullName ??
      rec['Наименование'] ??
      rec['Найменування'] ??
      rec['ПолноеНаименование'] ??
      rec['ПовнаНазва'] ??
      rec['Назва'] ??
      rec.title;

    if (typeof nameVal === 'string' && nameVal.trim().length >= 2) {
      const name = cleanStr(nameVal);
      const edrpou = cleanStr(
        rec.edrpou ?? rec.EDRPOU ?? rec.okpo ?? rec['ЄДРПОУ'] ?? rec['ЕДРПОУ'] ?? rec['ОКПО'] ?? rec['КодПоЕДРПОУ'] ?? ''
      ).replace(/[^\d]/g, '');
      const ipn = cleanStr(rec.ipn ?? rec.IPN ?? rec.inn ?? rec['ІПН'] ?? rec['ИНН'] ?? '').replace(/[^\d]/g, '');
      const iban = cleanStr(rec.iban ?? rec.IBAN ?? rec['Рахунок'] ?? '').replace(/\s+/g, '');
      const phone = cleanStr(rec.phone ?? rec.Phone ?? rec['Телефон'] ?? '');
      const email = cleanStr(rec.email ?? rec.Email ?? rec['Пошта'] ?? '');
      const role = cleanStr(rec.role ?? rec.type ?? rec['Роль'] ?? rec['Тип'] ?? '');
      const roles = detectCounterpartyRoles(role);
      const key = edrpou ? `edrpou:${edrpou}` : `name:${name.toLowerCase()}`;
      if (!seen.has(key)) {
        seen.add(key);
        out.push({
          name,
          edrpou,
          ipn,
          iban,
          phone,
          email,
          isCustomer: roles.isCustomer,
          isSupplier: roles.isSupplier,
        });
      }
      return;
    }

    for (const val of Object.values(rec)) {
      if (val && typeof val === 'object') walk(val);
    }
  };

  walk(doc);
  if (out.length === 0) {
    warnings.push('У XML-файлі не знайдено вузлів контрагентів (<counterparty>, <client>, <Контрагент>).');
  }
  return out;
}

function extractCounterpartiesFromPdfText(text: string, warnings: string[]): ParsedImportCounterparty[] {
  const lines = text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length >= 3);

  const matrix: string[][] = [];
  for (const line of lines) {
    if (line.includes(';') || line.includes('\t')) {
      const cols = line.split(/[;\t]/).map((c) => c.trim());
      if (cols.length >= 2) {
        matrix.push(cols);
        continue;
      }
    }
    const multiSpaceCols = line.split(/\s{2,}/).map((c) => c.trim()).filter(Boolean);
    if (multiSpaceCols.length >= 2) {
      matrix.push(multiSpaceCols);
      continue;
    }
    // Extract phone / email / EDRPOU / IBAN from single line
    const ibanMatch = line.match(/UA\d{25,29}/i);
    const emailMatch = line.match(/[^\s@]+@[^\s@]+\.[^\s@]+/);
    const phoneMatch = line.match(/(\+?38\s*0|0\d{2})[\s\-()]?\d{3}[\s\-()]?\d{2}[\s\-()]?\d{2}/);
    const edrpouMatch = line.match(/\b(\d{8}|\d{10})\b/);
    let cleanName = line;
    if (ibanMatch) cleanName = cleanName.replace(ibanMatch[0], '');
    if (emailMatch) cleanName = cleanName.replace(emailMatch[0], '');
    if (phoneMatch) cleanName = cleanName.replace(phoneMatch[0], '');
    if (edrpouMatch) cleanName = cleanName.replace(edrpouMatch[0], '');
    cleanName = cleanName.replace(/^\d+[\.\)]\s*/, '').replace(/[|,;]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (cleanName.length >= 3 && (phoneMatch || emailMatch || edrpouMatch || ibanMatch)) {
      matrix.push([
        cleanName,
        edrpouMatch?.[1] ?? '',
        phoneMatch?.[0] ?? '',
        emailMatch?.[0] ?? '',
        ibanMatch?.[0] ?? '',
      ]);
    }
  }

  if (matrix.length === 0) {
    warnings.push('У PDF-файлі не вдалося знайти рядки контрагентів (назва + телефон / ЄДРПОУ / email).');
    return [];
  }
  return extractCounterpartiesFromMatrix(matrix, warnings);
}

export async function parseUniversalCounterpartiesFile(params: {
  filename: string;
  contentBase64: string;
  mimeType?: string;
}): Promise<UniversalCounterpartiesParseResult> {
  const buf = Buffer.from(params.contentBase64, 'base64');
  const ext = (params.filename.split('.').pop() || '').toLowerCase();
  const mime = (params.mimeType || '').toLowerCase();
  const warnings: string[] = [];

  if (ext === 'pdf' || mime.includes('pdf') || buf.subarray(0, 4).toString('ascii') === '%PDF') {
    try {
      const pdf = await getDocumentProxy(new Uint8Array(buf));
      const extracted = await extractText(pdf, { mergePages: true });
      const text = Array.isArray(extracted.text) ? extracted.text.join('\n') : String(extracted.text || '');
      const list = extractCounterpartiesFromPdfText(text, warnings);
      return { format: 'PDF', filename: params.filename, totalDetected: list.length, warnings, counterparties: list };
    } catch (err) {
      warnings.push(`Помилка читання PDF: ${(err as Error).message}`);
      return { format: 'PDF', filename: params.filename, totalDetected: 0, warnings, counterparties: [] };
    }
  }

  if (ext === 'xlsx' || ext === 'xls' || ext === 'ods' || mime.includes('spreadsheet') || mime.includes('excel')) {
    const wb = XLSX.read(buf, { type: 'buffer' });
    const firstSheet = wb.SheetNames[0];
    const ws = firstSheet ? wb.Sheets[firstSheet] : undefined;
    const matrix = ws ? (XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as unknown[][]) : [];
    const list = extractCounterpartiesFromMatrix(matrix, warnings);
    return { format: 'EXCEL', filename: params.filename, totalDetected: list.length, warnings, counterparties: list };
  }

  const text = decodeTextSmart(buf);
  const trimmed = text.trimStart();
  if (ext === 'xml' || mime.includes('xml') || trimmed.startsWith('<?xml') || /^<[a-zA-Zа-яА-ЯіІїЇєЄ_][\w:-]*/.test(trimmed)) {
    const list = extractCounterpartiesFromXml(text, warnings);
    return { format: 'XML', filename: params.filename, totalDetected: list.length, warnings, counterparties: list };
  }

  const matrix = parseDelimitedText(text);
  const list = extractCounterpartiesFromMatrix(matrix, warnings);
  return { format: 'CSV', filename: params.filename, totalDetected: list.length, warnings, counterparties: list };
}

export async function commitUniversalCounterpartiesImport(
  db: AppDb,
  params: {
    organizationId: string;
    counterparties: ParsedImportCounterparty[];
    createDefaultContracts?: boolean;
  }
) {
  const existing = await db.select().from(counterparties);
  const byEdrpou = new Map(
    existing.filter((c) => c.edrpou.trim()).map((c) => [c.edrpou.trim(), c])
  );
  const byName = new Map(existing.map((c) => [c.name.trim().toLowerCase(), c]));

  let created = 0;
  let updated = 0;
  let contractsCreated = 0;

  for (const row of params.counterparties) {
    const name = cleanStr(row.name);
    if (!name) continue;
    const edrpou = cleanStr(row.edrpou);
    const ipn = cleanStr(row.ipn);
    const iban = cleanStr(row.iban);
    const phone = cleanStr(row.phone);
    const email = cleanStr(row.email);

    const found = (edrpou ? byEdrpou.get(edrpou) : undefined) ?? byName.get(name.toLowerCase());
    if (found) {
      await db
        .update(counterparties)
        .set({
          name,
          ...(edrpou ? { edrpou } : {}),
          ...(ipn ? { ipn } : {}),
          ...(iban ? { iban } : {}),
          ...(phone ? { phone } : {}),
          ...(email ? { email } : {}),
          isCustomer: found.isCustomer || row.isCustomer,
          isSupplier: found.isSupplier || row.isSupplier,
        })
        .where(eq(counterparties.id, found.id));
      updated++;
    } else {
      const [inserted] = await db
        .insert(counterparties)
        .values({
          name,
          edrpou,
          ipn,
          iban,
          phone,
          email,
          isCustomer: row.isCustomer,
          isSupplier: row.isSupplier,
          isActive: true,
        })
        .returning();
      if (edrpou) byEdrpou.set(edrpou, inserted);
      byName.set(name.toLowerCase(), inserted);
      created++;

      if (params.createDefaultContracts) {
        await db.insert(contracts).values({
          organizationId: params.organizationId,
          counterpartyId: inserted.id,
          name: row.isSupplier && !row.isCustomer ? 'Основний договір постачання' : 'Основний договір',
          currency: 'UAH',
          contractType: row.isSupplier && !row.isCustomer ? 'SUPPLIER' : 'CUSTOMER',
        });
        contractsCreated++;
      }
    }
  }

  return {
    created,
    updated,
    contractsCreated,
  };
}
