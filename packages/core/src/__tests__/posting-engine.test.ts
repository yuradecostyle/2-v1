import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import {
  createDatabase,
  type DatabaseHandle,
  seedDemoData,
  postDocument,
  unpostDocument,
  repostFromDate,
  rebuildStockTotals,
  PostingError,
  getStockBalances,
  getStockTurnover,
  getGrossProfit,
  getSettlements,
  getCashFlowAndPnl,
  getLatestItemPrice,
  getDocumentMovements,
  importItemsFromBasCsv,
  importOpeningBalancesFromBasCsv,
  documents,
  documentLines,
  items,
  warehouses,
  counterparties,
  priceTypes,
  regStockMovements,
  regStockTotalsMonthly,
} from '../index.js';

describe('BAS Alternative — Posting Engine & Registers', () => {
  let handle: DatabaseHandle;
  let orgId: string;

  beforeEach(async () => {
    handle = await createDatabase(); // in-memory PGlite (real PostgreSQL dialect)
    const seeded = await seedDemoData(handle.db);
    orgId = seeded.organizationId;
  });

  afterEach(async () => {
    await handle.close();
  });

  it('рахує точну собівартість по FIFO через дві партії різних місяців', async () => {
    // У seed:
    // 01.10.2026: ВПЗ-00001 — 5 ноутбуків по 28 000 = 140 000
    // 10.10.2026: ПН-00001  — 6 ноутбуків по 29 500 = 177 000
    // 05.11.2026: ВН-00001  — продаж 7 ноутбуків по 34 200 = 239 400
    // Очікувана FIFO собівартість: 5 * 28 000 + 2 * 29 500 = 140 000 + 59 000 = 199 000.00
    const [sale1] = await handle.db
      .select()
      .from(documents)
      .where(eq(documents.docNumber, 'ВН-00001'));

    const movs = await getDocumentMovements(handle.db, sale1.id);
    const laptopBatches = movs.costBatches.filter((b) =>
      b.itemName.includes('ThinkPad')
    );

    expect(laptopBatches).toHaveLength(2);
    const totalLaptopCogs = laptopBatches.reduce(
      (sum, b) => sum + Math.abs(Number(b.costAmount)),
      0
    );
    expect(totalLaptopCogs).toBe(199000);

    // Залишок ноутбуків на складі на 30.11.2026: 4 шт * 29 500 = 118 000.00
    const stock = await getStockBalances(handle.db, {
      organizationId: orgId,
      asOfDate: '2026-11-30T23:59:59Z',
    });
    const laptopRow = stock.rows.find((r) => r.itemSku === 'NB-TP14');
    expect(laptopRow).toBeDefined();
    expect(Number(laptopRow!.qty)).toBe(4);
    expect(Number(laptopRow!.costAmount)).toBe(118000);
    expect(Number(laptopRow!.avgCost)).toBe(29500);
  });

  it('блокує проведення при нестачі товару і не залишає сміття в регістрах', async () => {
    const [whMain] = await handle.db
      .select()
      .from(warehouses)
      .where(eq(warehouses.code, 'WH-01'));
    const [laptop] = await handle.db
      .select()
      .from(items)
      .where(eq(items.sku, 'NB-TP14'));
    const [cust] = await handle.db.select().from(counterparties).limit(1);

    const [badSale] = await handle.db
      .insert(documents)
      .values({
        organizationId: orgId,
        docType: 'sales_invoice',
        docNumber: 'ВН-FAIL',
        docDate: new Date('2026-11-20T10:00:00Z'),
        warehouseId: whMain.id,
        counterpartyId: cust.id,
      })
      .returning();

    await handle.db.insert(documentLines).values({
      documentId: badSale.id,
      lineNo: 1,
      itemId: laptop.id,
      qty: '10.0000', // доступно лише 4
      price: '35000.00',
      amount: '350000.00',
    });

    await expect(postDocument(handle.db, badSale.id)).rejects.toThrow(PostingError);

    const [afterDoc] = await handle.db
      .select()
      .from(documents)
      .where(eq(documents.id, badSale.id));
    expect(afterDoc.status).toBe('DRAFT');

    const movs = await getDocumentMovements(handle.db, badSale.id);
    expect(movs.stockMovements).toHaveLength(0);
    expect(movs.settlements).toHaveLength(0);
  });

  it('перераховує FIFO-собівартість після зміни прибуткової ціни заднім числом (repostFromDate)', async () => {
    // Змінюємо ціну в ПН-00001 (10.10.2026) для ноутбуків з 29 500 на 31 000
    const [rec1] = await handle.db
      .select()
      .from(documents)
      .where(eq(documents.docNumber, 'ПН-00001'));
    const [laptop] = await handle.db
      .select()
      .from(items)
      .where(eq(items.sku, 'NB-TP14'));

    const recLines = await handle.db
      .select()
      .from(documentLines)
      .where(eq(documentLines.documentId, rec1.id));
    const laptopLine = recLines.find((l) => l.itemId === laptop.id)!;

    await handle.db
      .update(documentLines)
      .set({ price: '31000.00', amount: '186000.00' })
      .where(eq(documentLines.id, laptopLine.id));

    const res = await repostFromDate(handle.db, orgId, '2026-10-10T00:00:00Z');
    expect(res.repostedCount).toBeGreaterThanOrEqual(5);

    // Нова собівартість 7 ноутбуків у ВН-00001: 5 * 28 000 + 2 * 31 000 = 202 000.00
    const [sale1] = await handle.db
      .select()
      .from(documents)
      .where(eq(documents.docNumber, 'ВН-00001'));
    const saleLines = await handle.db
      .select()
      .from(documentLines)
      .where(eq(documentLines.documentId, sale1.id));
    const saleLaptopLine = saleLines.find((l) => l.itemId === laptop.id)!;
    expect(Number(saleLaptopLine.costAmount)).toBe(202000);
  });

  it('підтримує 100% збіжність місячних підсумків із прямими рухами регістру', async () => {
    const [directSum] = await handle.db
      .select({ total: sql<string>`SUM(${regStockMovements.qty})` })
      .from(regStockMovements);
    const [monthlySum] = await handle.db
      .select({ total: sql<string>`SUM(${regStockTotalsMonthly.qtyDelta})` })
      .from(regStockTotalsMonthly);

    expect(Number(monthlySum.total)).toBe(Number(directSum.total));

    // Перевірка відміни проведення і повторної збіжності
    const [sale3] = await handle.db
      .select()
      .from(documents)
      .where(eq(documents.docNumber, 'ВН-00003'));
    await unpostDocument(handle.db, sale3.id);

    const [directAfter] = await handle.db
      .select({ total: sql<string>`SUM(${regStockMovements.qty})` })
      .from(regStockMovements);
    const [monthlyAfter] = await handle.db
      .select({ total: sql<string>`SUM(${regStockTotalsMonthly.qtyDelta})` })
      .from(regStockTotalsMonthly);

    expect(Number(monthlyAfter.total)).toBe(Number(directAfter.total));

    // Повна перебудова підсумків
    const rowsRebuilt = await rebuildStockTotals(handle.db, orgId);
    expect(rowsRebuilt).toBeGreaterThan(0);
  });

  it('коректно формує звіти (Відомість, Валовий прибуток, Взаєморозрахунки, CashFlow/P&L, Зріз цін)', async () => {
    const turnover = await getStockTurnover(handle.db, {
      organizationId: orgId,
      dateFrom: '2026-11-01T00:00:00Z',
      dateTo: '2026-11-30T23:59:59Z',
    });
    expect(turnover.rows.length).toBeGreaterThan(0);

    const gp = await getGrossProfit(handle.db, {
      organizationId: orgId,
      dateFrom: '2026-11-01T00:00:00Z',
      dateTo: '2026-11-30T23:59:59Z',
      groupBy: 'item',
    });
    // Виручка ВН-00001 (383 150) + ВН-00002 (51 596) + ВН-00003 (74 850) = 509 596.00
    expect(Number(gp.totals.revenue)).toBe(509596);
    expect(Number(gp.totals.profit)).toBeGreaterThan(0);

    const settlements = await getSettlements(handle.db, {
      organizationId: orgId,
      asOfDate: '2026-11-30T23:59:59Z',
    });
    expect(Number(settlements.totalReceivable)).toBeGreaterThan(0);
    expect(Number(settlements.totalPayable)).toBeGreaterThan(0);

    const cfPnl = await getCashFlowAndPnl(handle.db, {
      organizationId: orgId,
      dateFrom: '2026-11-01T00:00:00Z',
      dateTo: '2026-11-30T23:59:59Z',
    });
    // Операційні витрати: оренда 42 000 + маркетинг 18 500 = 60 500
    expect(Number(cfPnl.pnl.operatingExpenses)).toBe(60500);
    expect(Number(cfPnl.totalClosingCash)).toBeGreaterThan(0);

    // Зріз останніх цін
    const [laptop] = await handle.db.select().from(items).where(eq(items.sku, 'NB-TP14'));
    const [ptRetail] = await handle.db.select().from(priceTypes).where(eq(priceTypes.code, 'ROZN'));
    const latestPrice = await getLatestItemPrice(handle.db, {
      itemId: laptop.id,
      priceTypeId: ptRetail.id,
      asOfDate: '2026-11-15T00:00:00Z',
    });
    expect(latestPrice?.price).toBe('36900.00');
  });

  it('імпортує номенклатуру та початкові залишки з BAS CSV і проводить документ', async () => {
    const itemsCsv = `Артикул;Найменування;Од. вим.;Тип
BAS-100;Принтер HP LaserJet Pro;шт;Товар
BAS-101;Картридж HP 85A;шт;Товар`;

    const impRes = await importItemsFromBasCsv(handle.db, itemsCsv);
    expect(impRes.created).toBe(2);

    const [whMain] = await handle.db
      .select()
      .from(warehouses)
      .where(eq(warehouses.code, 'WH-01'));

    const balCsv = `Артикул;Найменування;Кількість;Собівартість
BAS-100;Принтер HP LaserJet Pro;3;8500
BAS-101;Картридж HP 85A;10;1200`;

    const balRes = await importOpeningBalancesFromBasCsv(handle.db, {
      organizationId: orgId,
      warehouseId: whMain.id,
      docDate: '2026-11-22T09:00:00Z',
      csvText: balCsv,
      autoPost: true,
    });
    expect(balRes.posted).toBe(true);
    expect(balRes.linesCount).toBe(2);
    expect(Number(balRes.totalAmount)).toBe(37500);
  });
});
