import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { eq } from 'drizzle-orm';
import {
  createDatabase,
  type DatabaseHandle,
  seedDemoData,
  postDocument,
  PostingError,
  getStockBalances,
  getActiveCustomerOrders,
  getTrialBalance,
  getAccountSubkontoBalance,
  generateSaftUaXml,
  syncFromBasOdata,
  syncBankStatement,
  fiscalizeSalesInvoiceCheckbox,
  getDocumentMovements,
  documents,
  documentLines,
  items,
  warehouses,
  counterparties,
} from '../index.js';

describe('BAS Alternative Stage 2 — Reservations, Inventory, Accounting №291, SAF-T UA & Integrations', () => {
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

  it('блокує продаж чужого резерву і коректно знімає резерв при відвантаженні за замовленням', async () => {
    // На WH-01 фізично залишилось 4 ноутбуки NB-TP14, з них 2 у резерві за ЗП-00001 -> вільно 2 шт
    const stockBefore = await getStockBalances(handle.db, {
      organizationId: orgId,
      asOfDate: '2026-11-30T23:59:59Z',
    });
    const laptopStock = stockBefore.rows.find(
      (r) => r.itemSku === 'NB-TP14' && r.warehouseName.includes('Центральний')
    )!;
    expect(Number(laptopStock.qty)).toBe(4);
    expect(Number(laptopStock.reservedQty)).toBe(2);
    expect(Number(laptopStock.freeQty)).toBe(2);

    const [whMain] = await handle.db.select().from(warehouses).where(eq(warehouses.code, 'WH-01'));
    const [laptop] = await handle.db.select().from(items).where(eq(items.sku, 'NB-TP14'));
    const [otherCust] = await handle.db
      .select()
      .from(counterparties)
      .where(eq(counterparties.edrpou, '3214509871'));

    // 1) Інший покупець намагається купити 3 ноутбуки без замовлення -> помилка INSUFFICIENT_FREE_STOCK
    const [blockedSale] = await handle.db
      .insert(documents)
      .values({
        organizationId: orgId,
        docType: 'sales_invoice',
        docNumber: 'ВН-RES-BLOCK',
        docDate: new Date('2026-11-25T10:00:00Z'),
        warehouseId: whMain.id,
        counterpartyId: otherCust.id,
      })
      .returning();

    await handle.db.insert(documentLines).values({
      documentId: blockedSale.id,
      lineNo: 1,
      itemId: laptop.id,
      qty: '3.0000',
      price: '35000.00',
      amount: '105000.00',
    });

    await expect(postDocument(handle.db, blockedSale.id)).rejects.toThrow(PostingError);

    // 2) Відвантаження 3 ноутбуків НА ПІДСТАВІ замовлення ЗП-00001 -> успіх (2 з резерву + 1 вільний)
    const [orderDoc] = await handle.db
      .select()
      .from(documents)
      .where(eq(documents.docNumber, 'ЗП-00001'));

    const [fulfilledSale] = await handle.db
      .insert(documents)
      .values({
        organizationId: orgId,
        docType: 'sales_invoice',
        docNumber: 'ВН-FROM-ORDER',
        docDate: new Date('2026-11-25T11:00:00Z'),
        parentDocId: orderDoc.id,
        warehouseId: whMain.id,
        counterpartyId: orderDoc.counterpartyId,
      })
      .returning();

    await handle.db.insert(documentLines).values({
      documentId: fulfilledSale.id,
      lineNo: 1,
      itemId: laptop.id,
      qty: '3.0000',
      price: '34200.00',
      amount: '102600.00',
    });

    await postDocument(handle.db, fulfilledSale.id);

    const stockAfter = await getStockBalances(handle.db, {
      organizationId: orgId,
      asOfDate: '2026-11-30T23:59:59Z',
    });
    const laptopAfter = stockAfter.rows.find(
      (r) => r.itemSku === 'NB-TP14' && r.warehouseName.includes('Центральний')
    )!;
    expect(Number(laptopAfter.qty)).toBe(1);
    expect(Number(laptopAfter.reservedQty)).toBe(0);
    expect(Number(laptopAfter.freeQty)).toBe(1);

    const activeOrders = await getActiveCustomerOrders(handle.db, orgId);
    expect(activeOrders.length).toBeGreaterThanOrEqual(1);
  });

  it('проводить інвентаризацію з нестачею по FIFO і формує проводки Дт 947 Кт 281', async () => {
    const [whMain] = await handle.db.select().from(warehouses).where(eq(warehouses.code, 'WH-01'));
    const [laptop] = await handle.db.select().from(items).where(eq(items.sku, 'NB-TP14'));

    // На WH-01 обліково 4 ноутбуки по 29 500 ₴. Фіксуємо фактично 3 шт (нестача 1 шт = 29 500 ₴)
    const [invDoc] = await handle.db
      .insert(documents)
      .values({
        organizationId: orgId,
        docType: 'inventory_count',
        docNumber: 'ІНВ-SHORTAGE',
        docDate: new Date('2026-11-26T15:00:00Z'),
        warehouseId: whMain.id,
      })
      .returning();

    await handle.db.insert(documentLines).values({
      documentId: invDoc.id,
      lineNo: 1,
      itemId: laptop.id,
      qty: '3.0000',
      price: '29500.00',
    });

    await postDocument(handle.db, invDoc.id);

    const movs = await getDocumentMovements(handle.db, invDoc.id);
    expect(movs.accountingEntries).toHaveLength(1);
    expect(movs.accountingEntries[0].debitAccountCode).toBe('947');
    expect(movs.accountingEntries[0].creditAccountCode).toBe('281');
    expect(Number(movs.accountingEntries[0].amount)).toBe(29500);
  });

  it('підтримує баланс ОСВ (Дт = Кт) за Планом рахунків №291, ручні проводки та експорт SAF-T UA v2.0', async () => {
    // Додамо ручну бухгалтерську операцію (нарахування ЄСВ Дт 92 Кт 651)
    const [manualDoc] = await handle.db
      .insert(documents)
      .values({
        organizationId: orgId,
        docType: 'manual_journal',
        docNumber: 'БО-00001',
        docDate: new Date('2026-11-28T17:00:00Z'),
        comment: 'Нарахування ЄСВ адміністративного персоналу',
      })
      .returning();

    await handle.db.insert(documentLines).values({
      documentId: manualDoc.id,
      lineNo: 1,
      debitAccountCode: '92',
      creditAccountCode: '651',
      amount: '15400.00',
      notes: 'ЄСВ 22% за листопад',
    });
    await postDocument(handle.db, manualDoc.id);

    const tb = await getTrialBalance(handle.db, {
      organizationId: orgId,
      dateFrom: '2026-11-01T00:00:00Z',
      dateTo: '2026-11-30T23:59:59Z',
    });

    expect(tb.totals.isBalanced).toBe(true);
    expect(tb.totals.openingDebit).toBe(tb.totals.openingCredit);
    expect(tb.totals.turnoverDebit).toBe(tb.totals.turnoverCredit);
    expect(tb.totals.closingDebit).toBe(tb.totals.closingCredit);

    const sub281 = await getAccountSubkontoBalance(handle.db, {
      organizationId: orgId,
      accountCode: '281',
      dateFrom: '2026-11-01T00:00:00Z',
      dateTo: '2026-11-30T23:59:59Z',
    });
    expect(sub281.rows.length).toBeGreaterThan(0);

    const saft = await generateSaftUaXml(handle.db, {
      organizationId: orgId,
      dateFrom: '2026-10-01T00:00:00Z',
      dateTo: '2026-11-30T23:59:59Z',
    });

    expect(saft.stats.isBalanced).toBe(true);
    expect(saft.xml).toContain('<AuditFileVersion>2.00</AuditFileVersion>');
    expect(saft.xml).toContain('<GeneralLedgerAccounts>');
    expect(saft.xml).toContain('<GeneralLedgerEntries>');
    expect(saft.xml).toContain('<SalesInvoices>');
  });

  it('виконує OData-синхронізацію BAS, автоімпорт Monobank/Приват24 без дублікатів та фіскалізацію Checkbox ПРРО', async () => {
    // 1) BAS OData sync (ідемпотентний)
    const odata1 = await syncFromBasOdata(handle.db, { organizationId: orgId });
    expect(odata1.itemsCreated).toBe(3);
    expect(odata1.cpsCreated).toBe(2);
    expect(odata1.balanceDocNumber).toBe('ВПЗ-ODATA-01');

    const odata2 = await syncFromBasOdata(handle.db, { organizationId: orgId });
    expect(odata2.itemsCreated).toBe(0);
    expect(odata2.balanceDocNumber).toBeNull();

    // 2) Monobank & Privat24 statements (ідемпотентні)
    const mono1 = await syncBankStatement(handle.db, {
      organizationId: orgId,
      provider: 'MONOBANK',
    });
    expect(mono1.imported).toBe(2);

    const mono2 = await syncBankStatement(handle.db, {
      organizationId: orgId,
      provider: 'MONOBANK',
    });
    expect(mono2.imported).toBe(0);
    expect(mono2.skippedDuplicates).toBe(2);

    const p24 = await syncBankStatement(handle.db, {
      organizationId: orgId,
      provider: 'PRIVAT24',
    });
    expect(p24.imported).toBe(2);

    // 3) Checkbox ПРРО фіскалізація накладної ВН-00001
    const [sale1] = await handle.db
      .select()
      .from(documents)
      .where(eq(documents.docNumber, 'ВН-00001'));
    const fisc = await fiscalizeSalesInvoiceCheckbox(handle.db, { documentId: sale1.id });
    expect(fisc.fiscalCode).toBeTruthy();
    expect(fisc.fiscalUrl).toContain('cabinet.tax.gov.ua');

    // Перевіряємо, що після всіх інтеграцій баланс ОСВ залишається ідеальним!
    const tbAfter = await getTrialBalance(handle.db, {
      organizationId: orgId,
      dateFrom: '2026-10-01T00:00:00Z',
      dateTo: '2026-12-31T23:59:59Z',
    });
    expect(tbAfter.totals.isBalanced).toBe(true);
  });
});
