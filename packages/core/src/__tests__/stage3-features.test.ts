import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { eq } from 'drizzle-orm';
import {
  createDatabase,
  type DatabaseHandle,
  seedDemoData,
  seedStage3DemoDocuments,
  getDocumentMovements,
  getTrialBalance,
  getStockBalances,
  generateTaxInvoiceXmlJ1201015,
  amountToUkrainianWords,
  getPrintableDocumentData,
  assertRolePermission,
  getAuditLogs,
  PostingError,
  documents,
} from '../index.js';

describe('BAS Alternative Stage 3 — Production BOM, Payroll, VAT J1201015, Print Forms & RBAC', () => {
  let handle: DatabaseHandle;
  let orgId: string;

  beforeEach(async () => {
    handle = await createDatabase();
    const seeded = await seedDemoData(handle.db);
    orgId = seeded.organizationId;
    await seedStage3DemoDocuments(handle.db, orgId);
  });

  afterEach(async () => {
    await handle.close();
  });

  it('списує комплектуючі за FIFO на рахунок 231 і випускає готову продукцію (BOM)', async () => {
    const [prodDoc] = await handle.db
      .select()
      .from(documents)
      .where(eq(documents.docNumber, 'ВИР-00001'));

    expect(prodDoc).toBeDefined();
    // Собівартість комплекту: ThinkPad (29 500) + Монітор Dell (18 500) + Док-станція (1 950) = 49 950.00 ₴
    expect(Number(prodDoc.totalAmount)).toBe(49950);

    const movs = await getDocumentMovements(handle.db, prodDoc.id);
    // 3 проводки Дт 231 Кт 281 + 1 проводка випуску Дт 281 Кт 231 = 4 проводки
    expect(movs.accountingEntries).toHaveLength(4);

    const stock = await getStockBalances(handle.db, {
      organizationId: orgId,
      asOfDate: '2026-11-30T23:59:59Z',
    });
    const kitRow = stock.rows.find((r) => r.itemSku === 'KIT-WORK01');
    expect(kitRow).toBeDefined();
    expect(Number(kitRow!.qty)).toBe(1);
    expect(Number(kitRow!.costAmount)).toBe(49950);
  });

  it('нараховує зарплату (ПДФО 18%, ВЗ 5%, ЄСВ 22%) з проводками на 661, 651, 6411, 642', async () => {
    const [payDoc] = await handle.db
      .select()
      .from(documents)
      .where(eq(documents.docNumber, 'ЗПВ-00001'));

    expect(payDoc).toBeDefined();
    // 45 000 + 38 000 + 32 000 = 115 000.00 ₴
    expect(Number(payDoc.totalAmount)).toBe(115000);

    const movs = await getDocumentMovements(handle.db, payDoc.id);
    // 3 співробітники * 4 проводки = 12 проводок
    expect(movs.accountingEntries).toHaveLength(12);

    const tb = await getTrialBalance(handle.db, {
      organizationId: orgId,
      dateFrom: '2026-11-01T00:00:00Z',
      dateTo: '2026-11-30T23:59:59Z',
    });
    expect(tb.totals.isBalanced).toBe(true);

    // Перевіряємо сальдо по рахунках зарплати та податків:
    // 661 (На руки): 115 000 - 20 700 (ПДФО) - 5 750 (ВЗ) = 88 550.00 ₴
    // 6411 (ПДФО 18%): 20 700.00 ₴
    // 642 (ВЗ 5%): 5 750.00 ₴
    // 651 (ЄСВ 22%): 25 300.00 ₴
    const acc661 = tb.rows.find((r) => r.accountCode === '661')!;
    const acc6411 = tb.rows.find((r) => r.accountCode === '6411')!;
    const acc642 = tb.rows.find((r) => r.accountCode === '642')!;
    const acc651 = tb.rows.find((r) => r.accountCode === '651')!;

    expect(Number(acc661.closingCredit)).toBe(88550);
    expect(Number(acc6411.closingCredit)).toBe(20700);
    expect(Number(acc642.closingCredit)).toBe(5750);
    expect(Number(acc651.closingCredit)).toBe(25300);
  });

  it('формує Податкову накладну ПДВ (Дт 6431 Кт 6412) та експортує XML J1201015 для ЄРПН', async () => {
    const [taxDoc] = await handle.db
      .select()
      .from(documents)
      .where(eq(documents.docNumber, 'ПНПДВ-00001'));

    expect(taxDoc).toBeDefined();
    expect(Number(taxDoc.vatAmount)).toBe(63858.33);

    const xmlRes = await generateTaxInvoiceXmlJ1201015(handle.db, taxDoc.id);
    expect(xmlRes.vatAmount).toBe('63858.33');
    expect(xmlRes.grossAmount).toBe('383150.00');
    expect(xmlRes.xml).toContain('J1201015.xsd');
    expect(xmlRes.xml).toContain('<R03G7>63858.33</R03G7>');
  });

  it('генерує друковані форми із сумою прописом українською мовою та перевіряє ролі RBAC', async () => {
    const words = amountToUkrainianWords(383150.0);
    expect(words).toBe('Триста вісімдесят три тисячі сто п’ятдесят гривень 00 копійок');

    const [sale1] = await handle.db
      .select()
      .from(documents)
      .where(eq(documents.docNumber, 'ВН-00001'));

    const printable = await getPrintableDocumentData(handle.db, sale1.id);
    expect(printable.totals.amountInWords).toBe(
      'Триста вісімдесят три тисячі сто п’ятдесят гривень 00 копійок'
    );
    expect(printable.lines).toHaveLength(4);

    // RBAC checks
    expect(() =>
      assertRolePermission('STOREKEEPER', 'DOC_POST', 'inventory_count')
    ).not.toThrow();
    expect(() =>
      assertRolePermission('STOREKEEPER', 'DOC_POST', 'payroll_sheet')
    ).toThrow(PostingError);
    expect(() =>
      assertRolePermission('SALES_MANAGER', 'ORG_POLICY')
    ).toThrow(PostingError);
    expect(() =>
      assertRolePermission('ACCOUNTANT', 'PAYROLL', 'payroll_sheet')
    ).not.toThrow();

    const logs = await getAuditLogs(handle.db, orgId);
    expect(logs.length).toBeGreaterThan(0);
  });
});
