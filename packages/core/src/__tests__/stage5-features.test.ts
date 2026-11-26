import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as XLSX from 'xlsx';
import {
  createDatabase,
  type DatabaseHandle,
  seedDemoData,
  documents,
  documentLines,
  items,
  warehouses,
  counterparties,
  postDocument,
  getPrintableDocumentData,
  getPrintTemplates,
  savePrintTemplate,
  resetPrintTemplate,
  UA_STANDARD_PRINT_TEMPLATES,
  parseUniversalItemsFile,
  commitUniversalItemsImport,
  assertEffectivePermission,
  DEFAULT_ROLE_PERMISSIONS,
} from '../index.js';

function createMinimalTextPdf(lines: string[]): Buffer {
  const escaped = lines.map((l) => l.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)'));
  const textOps = escaped
    .map((l, i) => `BT /F1 10 Tf 40 ${760 - i * 18} Td (${l}) Tj ET`)
    .join('\n');
  const streamLen = Buffer.byteLength(textOps, 'utf8');
  const objects = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n',
    `4 0 obj\n<< /Length ${streamLen} >>\nstream\n${textOps}\nendstream\nendobj\n`,
    '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  for (const obj of objects) {
    offsets.push(Buffer.byteLength(pdf, 'utf8'));
    pdf += obj;
  }
  const xrefOffset = Buffer.byteLength(pdf, 'utf8');
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) {
    pdf += `${String(off).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(pdf, 'utf8');
}

describe('2C Stage 5 — Знижки в продажах, Редаговані форми UA (10 стандартів), Розділення Бухгалтерії, Універсальний імпорт (PDF/XLS/CSV/XML)', () => {
  let handle: DatabaseHandle;
  let orgId: string;

  beforeEach(async () => {
    handle = await createDatabase();
    const seeded = await seedDemoData(handle.db);
    orgId = seeded.organizationId;
  });

  afterEach(async () => {
    await handle.close();
  });

  it('зберігає знижки на товари у Замовленні/Видатковій та коректно виводить їх у друкованій формі', async () => {
    const [wh] = await handle.db.select().from(warehouses).limit(1);
    const [cp] = await handle.db.select().from(counterparties).limit(1);
    const [it] = await handle.db.select().from(items).limit(1);

    // 2 шт * 1000.00 = 2000.00, знижка 15% = 300.00, до сплати 1700.00
    const [order] = await handle.db
      .insert(documents)
      .values({
        organizationId: orgId,
        docType: 'customer_order',
        docNumber: 'ЗП-DISC-01',
        docDate: new Date('2026-11-26T10:00:00Z'),
        status: 'DRAFT',
        warehouseId: wh.id,
        counterpartyId: cp.id,
        discountTotal: '300.00',
        totalAmount: '1700.00',
        comment: 'Замовлення зі знижкою 15%',
      })
      .returning();

    await handle.db.insert(documentLines).values({
      documentId: order.id,
      lineNo: 1,
      lineRole: 'ITEM',
      itemId: it.id,
      qty: '2.0000',
      price: '1000.00',
      discountPercent: '15.00',
      discountAmount: '300.00',
      amount: '1700.00',
    });

    await postDocument(handle.db, order.id);

    const printable = await getPrintableDocumentData(handle.db, order.id);
    expect(printable.totals.hasDiscount).toBe(true);
    expect(printable.totals.subtotalBeforeDiscount).toBe('2000.00');
    expect(printable.totals.discountTotal).toBe('300.00');
    expect(printable.totals.grossAmount).toBe('1700.00');
    expect(printable.lines[0].discountPercent).toBe('15.00');
    expect(printable.lines[0].discountAmount).toBe('300.00');
    expect(printable.templates).toHaveLength(UA_STANDARD_PRINT_TEMPLATES.length);
    expect(printable.templates.length).toBe(10);
  });

  it('дозволяє редагувати, зберігати та скидати всі 10 українських стандартних друкованих форм', async () => {
    const initial = await getPrintTemplates(handle.db, orgId);
    expect(initial).toHaveLength(10);
    expect(initial.map((t) => t.templateKey)).toContain('sales_waybill');
    expect(initial.map((t) => t.templateKey)).toContain('ttn_waybill');
    expect(initial.map((t) => t.templateKey)).toContain('pko_cash_in');
    expect(initial.map((t) => t.templateKey)).toContain('vko_cash_out');

    const edited = await savePrintTemplate(handle.db, {
      organizationId: orgId,
      templateKey: 'sales_waybill',
      titleText: 'ВИДАТКОВА НАКЛАДНА DecoStyle № {{docNumber}}',
      footerNote: 'Гарантія 24 місяці згідно договору',
      showDiscountColumn: true,
    });
    expect(edited.titleText).toBe('ВИДАТКОВА НАКЛАДНА DecoStyle № {{docNumber}}');
    expect(edited.footerNote).toBe('Гарантія 24 місяці згідно договору');

    const reset = await resetPrintTemplate(handle.db, orgId, 'sales_waybill');
    expect(reset.titleText).toContain('ВИДАТКОВА НАКЛАДНА № {{docNumber}}');
    expect(reset.footerNote).not.toBe('Гарантія 24 місяці згідно договору');
  });

  it('імпортує номенклатуру з CSV, Excel (XLSX), XML (YML + 1C) та PDF і створює прайс-лист', async () => {
    // 1. CSV
    const csvBuf = Buffer.from(
      'Артикул;Найменування;Категорія;Од.;Ціна\nDEC-01;Плитка керамограніт 60x60;Керамограніт;м2;890.50\nDEC-02;Укладка плитки;Послуги;посл;650',
      'utf8'
    );
    const csvRes = await parseUniversalItemsFile({
      filename: 'price_decostyle.csv',
      contentBase64: csvBuf.toString('base64'),
    });
    expect(csvRes.format).toBe('CSV');
    expect(csvRes.items).toHaveLength(2);
    expect(csvRes.items[0].sku).toBe('DEC-01');
    expect(csvRes.items[0].price).toBe(890.5);
    expect(csvRes.items[1].itemType).toBe('SERVICE');

    // 2. XLSX
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([
      ['Код', 'Назва товару', 'Категорія', 'Од. вим.', 'Ціна, грн'],
      ['XLS-100', 'Клей для плитки Ceresit CM11 25кг', 'Будсуміші', 'шт', 315],
      ['XLS-101', 'Затирка швів сіра 2кг', 'Будсуміші', 'шт', 240.25],
    ]);
    XLSX.utils.book_append_sheet(wb, ws, 'Прайс');
    const xlsxBuf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
    const xlsxRes = await parseUniversalItemsFile({
      filename: 'supplier_price.xlsx',
      contentBase64: xlsxBuf.toString('base64'),
    });
    expect(xlsxRes.format).toBe('EXCEL');
    expect(xlsxRes.items).toHaveLength(2);
    expect(xlsxRes.items[0].sku).toBe('XLS-100');
    expect(xlsxRes.items[0].categoryName).toBe('Будсуміші');
    expect(xlsxRes.items[1].price).toBe(240.25);

    // 3. XML (YML Prom.ua)
    const ymlXml = `<?xml version="1.0" encoding="UTF-8"?>
      <yml_catalog date="2026-11-26">
        <shop>
          <categories><category id="7">Сантехніка</category></categories>
          <offers>
            <offer id="YML-55" available="true">
              <vendorCode>MIX-55</vendorCode>
              <name>Змішувач для умивальника Grohe</name>
              <categoryId>7</categoryId>
              <price>4250</price>
            </offer>
          </offers>
        </shop>
      </yml_catalog>`;
    const ymlRes = await parseUniversalItemsFile({
      filename: 'prom_export.xml',
      contentBase64: Buffer.from(ymlXml, 'utf8').toString('base64'),
    });
    expect(ymlRes.format).toBe('XML');
    expect(ymlRes.items).toHaveLength(1);
    expect(ymlRes.items[0].sku).toBe('MIX-55');
    expect(ymlRes.items[0].categoryName).toBe('Сантехніка');
    expect(ymlRes.items[0].price).toBe(4250);

    // 4. PDF
    const pdfBuf = createMinimalTextPdf([
      'SKU-901   Ceramic Tile Marble White 60x120   m2   1250.00',
      'SKU-902   Primer Deep Penetration 10L   pcs   480.00',
    ]);
    const pdfRes = await parseUniversalItemsFile({
      filename: 'catalog_2026.pdf',
      contentBase64: pdfBuf.toString('base64'),
    });
    expect(pdfRes.format).toBe('PDF');
    expect(pdfRes.items.length).toBeGreaterThanOrEqual(2);
    expect(pdfRes.items[0].price).toBe(1250);

    // 5. Commit combined items + auto-create categories & price setting doc
    const commit = await commitUniversalItemsImport(handle.db, {
      organizationId: orgId,
      items: [...csvRes.items, ...xlsxRes.items, ...ymlRes.items],
      defaultCategoryName: 'Загальна',
      createPriceSetting: true,
    });
    expect(commit.created).toBe(5);
    expect(commit.categoriesCreated).toBeGreaterThanOrEqual(3);
    expect(commit.pricesApplied).toBe(5);
    expect(commit.priceDocNumber).toBeTruthy();
  });

  it('ізолює права Бухгалтерії: менеджер продажів заблокований, бухгалтер має повний доступ', () => {
    expect(() =>
      assertEffectivePermission(DEFAULT_ROLE_PERMISSIONS.SALES_MANAGER, 'ACCOUNTING')
    ).toThrow(/Бухгалтер/i);
    expect(() =>
      assertEffectivePermission(DEFAULT_ROLE_PERMISSIONS.ACCOUNTANT, 'ACCOUNTING')
    ).not.toThrow();
    expect(() =>
      assertEffectivePermission(
        DEFAULT_ROLE_PERMISSIONS.ACCOUNTANT,
        'DOC_POST',
        'manual_journal'
      )
    ).not.toThrow();
  });
});
