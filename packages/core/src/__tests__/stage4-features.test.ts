import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  createDatabase,
  type DatabaseHandle,
  seedDemoData,
  seedStage4DemoData,
  getCrmPipeline,
  convertLeadToCustomerOrder,
  getFixedAssetsList,
  getForeignCurrencyBalances,
  syncNbuCurrencyRates,
  runCurrencyRevaluation,
  getBalanceSheetF1,
  getIncomeStatementF2,
  getVatDeclaration,
  getSingleTaxDeclaration,
  getUnifiedPayrollReport,
  getTrialBalance,
} from '../index.js';

describe('BAS Alternative Stage 4 — CRM, Fixed Assets (10/13), Multi-currency NBU & Statutory Reports (F1/F2/VAT/EP/ESV)', () => {
  let handle: DatabaseHandle;
  let orgId: string;

  beforeEach(async () => {
    handle = await createDatabase();
    const seeded = await seedDemoData(handle.db);
    orgId = seeded.organizationId;
    await seedStage4DemoData(handle.db, orgId);
  });

  afterEach(async () => {
    await handle.close();
  });

  it('працює CRM-воронка (ліди, задачі, дзвінки) та конвертація ліда в Замовлення покупця', async () => {
    const crm = await getCrmPipeline(handle.db, orgId);
    expect(crm.leads.length).toBe(4);
    expect(crm.metrics.callsCount).toBeGreaterThanOrEqual(2);
    expect(crm.metrics.openTasksCount).toBeGreaterThanOrEqual(3);

    const lead = crm.leads[0];
    const order = await convertLeadToCustomerOrder(handle.db, lead.id);
    expect(order.docType).toBe('customer_order');

    const crmAfter = await getCrmPipeline(handle.db, orgId);
    expect(crmAfter.metrics.wonCount).toBe(1);
  });

  it('обліковує Основні засоби (104/106) та нараховує прямолінійну амортизацію (Кт 131)', async () => {
    const fa = await getFixedAssetsList(handle.db, orgId);
    expect(fa.rows).toHaveLength(2);
    // 180 000 + 96 000 = 276 000.00 ₴ первісної вартості
    expect(Number(fa.totals.totalInitialCost)).toBe(276000);
    // Амортизація за листопад: 3 000 + 2 000 = 5 000.00 ₴
    expect(Number(fa.totals.totalAccumulatedDepreciation)).toBe(5000);
    // Залишкова вартість: 271 000.00 ₴
    expect(Number(fa.totals.totalBookValue)).toBe(271000);
  });

  it('веде мультивалютний рахунок USD (312), оновлює курс НБУ і проводить курсові різниці (714/945)', async () => {
    // На старті $5000 було за 41.20 (206 000 ₴), переоцінено 26.11 за 41.70 (208 500 ₴, +2 500 ₴ у Кт 714)
    const fxBefore = await getForeignCurrencyBalances(handle.db, {
      organizationId: orgId,
      asOfDate: '2026-11-26T23:59:59Z',
    });
    expect(fxBefore).toHaveLength(1);
    expect(Number(fxBefore[0].foreignBalance)).toBe(5000);
    expect(Number(fxBefore[0].uahBookBalance)).toBe(208500);
    expect(Number(fxBefore[0].unrealizedFxDiff)).toBe(0);

    // Знижуємо курс НБУ до 41.40 -> від'ємна курсова різниця -1 500.00 ₴ (Дт 945 Кт 312)
    await syncNbuCurrencyRates(handle.db, {
      date: '2026-11-28T00:00:00Z',
      manualRates: { USD: 41.4, EUR: 44.5 },
    });
    const revalDoc = await runCurrencyRevaluation(handle.db, {
      organizationId: orgId,
      asOfDate: '2026-11-28T18:00:00Z',
    });
    expect(Number(revalDoc.totalAmount)).toBe(1500);

    const fxAfter = await getForeignCurrencyBalances(handle.db, {
      organizationId: orgId,
      asOfDate: '2026-11-30T23:59:59Z',
    });
    expect(Number(fxAfter[0].uahBookBalance)).toBe(207000);
  });

  it('формує повний пакет звітності ДПС (Баланс Ф1 зі збігом Актив=Пасив, Ф2, ПДВ, ЄП, ЄСВ/4ДФ)', async () => {
    const tb = await getTrialBalance(handle.db, {
      organizationId: orgId,
      dateFrom: '2026-10-01T00:00:00Z',
      dateTo: '2026-11-30T23:59:59Z',
    });
    expect(tb.totals.isBalanced).toBe(true);

    // 1. Баланс Ф1: Актив 1300 === Пасив 1900!
    const f1 = await getBalanceSheetF1(handle.db, {
      organizationId: orgId,
      asOfDate: '2026-11-30T23:59:59Z',
    });
    expect(f1.isBalanced).toBe(true);
    expect(f1.totalAssets).toBe(f1.totalLiabilitiesAndEquity);
    const faRow = f1.assets.find((r) => r.code === '1010')!;
    expect(Number(faRow.amount)).toBe(271000);

    // 2. Звіт про фінрезультати Ф2
    const f2 = await getIncomeStatementF2(handle.db, {
      organizationId: orgId,
      dateFrom: '2026-10-01T00:00:00Z',
      dateTo: '2026-11-30T23:59:59Z',
    });
    const revRow = f2.rows.find((r) => r.code === '2000')!;
    expect(Number(revRow.amount)).toBe(509596);

    // 3. Декларація з ПДВ (J0200125)
    const vat = await getVatDeclaration(handle.db, {
      organizationId: orgId,
      dateFrom: '2026-11-01T00:00:00Z',
      dateTo: '2026-11-30T23:59:59Z',
    });
    expect(vat.xml).toContain('J0200125.xsd');

    // 4. Декларація Єдиного податку 3 група (F0103308)
    const ep = await getSingleTaxDeclaration(handle.db, {
      organizationId: orgId,
      dateFrom: '2026-11-01T00:00:00Z',
      dateTo: '2026-11-30T23:59:59Z',
      taxRatePercent: 5,
    });
    expect(ep.xml).toContain('F0103308.xsd');

    // 5. Об'єднаний звіт ЄСВ + 4ДФ (J0500109)
    const esv = await getUnifiedPayrollReport(handle.db, {
      organizationId: orgId,
      dateFrom: '2026-11-01T00:00:00Z',
      dateTo: '2026-11-30T23:59:59Z',
    });
    expect(esv.rows).toHaveLength(3);
    expect(Number(esv.totals.gross)).toBe(115000);
    expect(Number(esv.totals.pdfo)).toBe(20700);
    expect(Number(esv.totals.vz)).toBe(5750);
    expect(Number(esv.totals.esv)).toBe(25300);
    expect(esv.xml).toContain('J0500109.xsd');
  });
});
