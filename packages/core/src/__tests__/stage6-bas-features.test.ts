import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as XLSX from 'xlsx';
import { eq } from 'drizzle-orm';
import {
  createDatabase,
  type DatabaseHandle,
  seedDemoData,
  items,
  warehouses,
  counterparties,
  contracts,
  documents,
  documentLines,
  organizations,
  postDocument,
  PostingError,
  getStockBalances,
  getBasSettings,
  saveBasSettings,
  resetBasSettings,
  parseDocumentMeta,
  parseUniversalCounterpartiesFile,
  commitUniversalCounterpartiesImport,
} from '../index.js';

function createSimplePdf(lines: string[]): Buffer {
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

describe('2C Stage 6 — BAS Малий бізнес (Товар на замовлення в мінус, Налаштування полів і меню, Імпорт покупців/контрагентів)', () => {
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

  it('проводить Замовлення покупця та Видаткову для товару «під замовлення» в мінус навіть при 0 на складі', async () => {
    const [wh] = await handle.db.select().from(warehouses).limit(1);
    const [cp] = await handle.db.select().from(counterparties).limit(1);

    // Новий товар, якого немає на складі (0 шт!)
    const [zeroStockItem] = await handle.db
      .insert(items)
      .values({
        sku: 'CUSTOM-TILE-01',
        name: 'Плитка Італія під замовлення 120x120',
        unit: 'м²',
        itemType: 'GOODS',
        isOrderOnly: false,
      })
      .returning();

    // 1. Замовлення покупця проводиться БЕЗ помилки навіть при 0 на складі!
    const [order] = await handle.db
      .insert(documents)
      .values({
        organizationId: orgId,
        docType: 'customer_order',
        docNumber: 'ЗП-BACKORDER-1',
        docDate: new Date('2026-11-27T10:00:00Z'),
        warehouseId: wh.id,
        counterpartyId: cp.id,
        totalAmount: '15000.00',
      })
      .returning();

    await handle.db.insert(documentLines).values({
      documentId: order.id,
      lineNo: 1,
      itemId: zeroStockItem.id,
      qty: '10.0000',
      price: '1500.00',
      amount: '15000.00',
    });

    await postDocument(handle.db, order.id);
    const [postedOrder] = await handle.db.select().from(documents).where(eq(documents.id, order.id));
    expect(postedOrder.status).toBe('POSTED');
    expect(parseDocumentMeta(postedOrder.metaJson).isBackorder).toBe(true);

    // 2. Видаткова на підставі цього замовлення теж проводиться в мінус!
    const [saleFromOrder] = await handle.db
      .insert(documents)
      .values({
        organizationId: orgId,
        docType: 'sales_invoice',
        docNumber: 'ВН-BACKORDER-1',
        docDate: new Date('2026-11-27T12:00:00Z'),
        parentDocId: order.id,
        warehouseId: wh.id,
        counterpartyId: cp.id,
        totalAmount: '15000.00',
      })
      .returning();

    await handle.db.insert(documentLines).values({
      documentId: saleFromOrder.id,
      lineNo: 1,
      itemId: zeroStockItem.id,
      qty: '10.0000',
      price: '1500.00',
      amount: '15000.00',
    });

    await postDocument(handle.db, saleFromOrder.id);
    const stockAfter = await getStockBalances(handle.db, {
      organizationId: orgId,
      asOfDate: '2026-11-30T23:59:59Z',
    });
    const row = stockAfter.rows.find((r) => r.itemId === zeroStockItem.id)!;
    expect(Number(row.qty)).toBe(-10);

    // 3. Товар із позначкою isOrderOnly=true проводиться у видатковій навіть без замовлення!
    const [orderOnlyItem] = await handle.db
      .insert(items)
      .values({
        sku: 'VIP-ORDER-ONLY',
        name: 'Декор ручної роботи (під замовлення)',
        unit: 'шт',
        itemType: 'GOODS',
        isOrderOnly: true,
      })
      .returning();

    const [directOrderOnlySale] = await handle.db
      .insert(documents)
      .values({
        organizationId: orgId,
        docType: 'sales_invoice',
        docNumber: 'ВН-ORDERONLY-1',
        docDate: new Date('2026-11-27T13:00:00Z'),
        warehouseId: wh.id,
        counterpartyId: cp.id,
        totalAmount: '5000.00',
      })
      .returning();

    await handle.db.insert(documentLines).values({
      documentId: directOrderOnlySale.id,
      lineNo: 1,
      itemId: orderOnlyItem.id,
      qty: '2.0000',
      price: '2500.00',
      amount: '5000.00',
    });

    await postDocument(handle.db, directOrderOnlySale.id);

    // 4. Звичайний товар БЕЗ замовлення та БЕЗ прапора allowNegativeStock все ще блокує нестачу
    const [strictSale] = await handle.db
      .insert(documents)
      .values({
        organizationId: orgId,
        docType: 'sales_invoice',
        docNumber: 'ВН-STRICT-BLOCK',
        docDate: new Date('2026-11-27T14:00:00Z'),
        warehouseId: wh.id,
        counterpartyId: cp.id,
      })
      .returning();

    await handle.db.insert(documentLines).values({
      documentId: strictSale.id,
      lineNo: 1,
      itemId: zeroStockItem.id,
      qty: '1.0000',
      price: '1500.00',
      amount: '1500.00',
    });

    await expect(postDocument(handle.db, strictSale.id)).rejects.toThrow(PostingError);
  });

  it('зберігає й відновлює налаштування BAS Малий бізнес (функції, поля документів, власні поля, меню/підменю)', async () => {
    const initial = await getBasSettings(handle.db, orgId);
    expect(initial.features.allowOrderWithoutStock).toBe(true);
    expect(initial.features.alwaysOpenDocsInModal).toBe(true);
    expect(initial.docFields.customer_order.fields.length).toBeGreaterThan(10);

    const updated = await saveBasSettings(handle.db, orgId, {
      features: { allowNegativeStockGlobal: true, useWorks: false },
      docFields: {
        customer_order: {
          fields: initial.docFields.customer_order.fields.map((f) =>
            f.key === 'projectName' ? { ...f, required: true, label: 'Об’єкт клієнта' } : f
          ),
          customFields: [
            { id: 'cf_designer', label: 'Дизайнер інтер’єру', type: 'text', required: false },
          ],
        },
      },
      menuConfig: {
        sections: { crm: { label: 'Клієнти (CRM)', visible: true, order: 1 } },
        items: { 'sales-orders': { label: 'Замовлення клієнтів', visible: true, pinned: true } },
      },
    });

    expect(updated.features.allowNegativeStockGlobal).toBe(true);
    expect(updated.features.useWorks).toBe(false);
    expect(updated.docFields.customer_order.customFields).toHaveLength(1);
    expect(updated.docFields.customer_order.fields.find((f) => f.key === 'projectName')?.label).toBe(
      'Об’єкт клієнта'
    );
    expect(updated.menuConfig.sections.crm?.label).toBe('Клієнти (CRM)');
    expect(updated.menuConfig.items['sales-orders']?.pinned).toBe(true);

    // Перевіряємо синхронізацію з organizations.allowNegativeStock
    const [org] = await handle.db.select().from(organizations).where(eq(organizations.id, orgId));
    expect(org.allowNegativeStock).toBe(true);

    const reset = await resetBasSettings(handle.db, orgId, 'all');
    expect(reset.features.useWorks).toBe(true);
    expect(reset.docFields.customer_order.customFields).toHaveLength(0);
    expect(Object.keys(reset.menuConfig.sections)).toHaveLength(0);
  });

  it('імпортує покупців та контрагентів з CSV, Excel (XLSX), XML та PDF з автостворенням договорів', async () => {
    // 1. CSV
    const csvBuf = Buffer.from(
      'Найменування;ЄДРПОУ;Телефон;Email;IBAN;Роль\nТОВ «Львів Декор Буд»;41234567;+380671112233;info@ldecor.ua;UA213052990000026007015012345;Покупець\nПП «ІталКераміка»;38990011;+380501234567;opt@ital.ua;;Постачальник',
      'utf8'
    );
    const csvRes = await parseUniversalCounterpartiesFile({
      filename: 'clients.csv',
      contentBase64: csvBuf.toString('base64'),
    });
    expect(csvRes.format).toBe('CSV');
    expect(csvRes.counterparties).toHaveLength(2);
    expect(csvRes.counterparties[0].edrpou).toBe('41234567');
    expect(csvRes.counterparties[0].isCustomer).toBe(true);
    expect(csvRes.counterparties[1].isSupplier).toBe(true);

    // 2. XLSX
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([
      ['Клієнт', 'ЄДРПОУ', 'Телефон', 'Пошта'],
      ['ФОП Савченко Ірина', '2987654321', '+380931112233', 'savchenko@gmail.com'],
    ]);
    XLSX.utils.book_append_sheet(wb, ws, 'Покупці');
    const xlsxBuf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
    const xlsxRes = await parseUniversalCounterpartiesFile({
      filename: 'buyers.xlsx',
      contentBase64: xlsxBuf.toString('base64'),
    });
    expect(xlsxRes.format).toBe('EXCEL');
    expect(xlsxRes.counterparties).toHaveLength(1);
    expect(xlsxRes.counterparties[0].name).toBe('ФОП Савченко Ірина');

    // 3. XML
    const xmlStr = `<?xml version="1.0" encoding="UTF-8"?>
      <Контрагенты>
        <Контрагент>
          <Наименование>ТОВ «Карпати Кераміка»</Наименование>
          <ЕДРПОУ>44556677</ЕДРПОУ>
          <Телефон>+380681234567</Телефон>
        </Контрагент>
      </Контрагенты>`;
    const xmlRes = await parseUniversalCounterpartiesFile({
      filename: 'partners_1c.xml',
      contentBase64: Buffer.from(xmlStr, 'utf8').toString('base64'),
    });
    expect(xmlRes.format).toBe('XML');
    expect(xmlRes.counterparties).toHaveLength(1);
    expect(xmlRes.counterparties[0].edrpou).toBe('44556677');

    // 4. PDF
    const pdfBuf = createSimplePdf([
      'Studio Design Lviv   43210987   +380679998877   studio@design.ua',
    ]);
    const pdfRes = await parseUniversalCounterpartiesFile({
      filename: 'clients_list.pdf',
      contentBase64: pdfBuf.toString('base64'),
    });
    expect(pdfRes.format).toBe('PDF');
    expect(pdfRes.counterparties.length).toBeGreaterThanOrEqual(1);

    // 5. Commit with default contracts
    const commit = await commitUniversalCounterpartiesImport(handle.db, {
      organizationId: orgId,
      counterparties: [
        ...csvRes.counterparties,
        ...xlsxRes.counterparties,
        ...xmlRes.counterparties,
      ],
      createDefaultContracts: true,
    });
    expect(commit.created).toBe(4);
    expect(commit.contractsCreated).toBe(4);

    // Verify idempotency (second run updates, doesn't duplicate)
    const commit2 = await commitUniversalCounterpartiesImport(handle.db, {
      organizationId: orgId,
      counterparties: csvRes.counterparties,
      createDefaultContracts: true,
    });
    expect(commit2.created).toBe(0);
    expect(commit2.updated).toBe(2);

    const allContracts = await handle.db
      .select()
      .from(contracts)
      .where(eq(contracts.organizationId, orgId));
    expect(allContracts.length).toBeGreaterThanOrEqual(4);
  });
});
