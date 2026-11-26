import { and, asc, eq, gte, lte } from 'drizzle-orm';
import type { AppDb } from './db.js';
import {
  documentLines,
  documents,
  employees,
  organizations,
  regAccountingEntries,
  regCashMovements,
} from './schema.js';
import { getTrialBalance } from './accounting-service.js';
import { d, round2, toIsoDate, toNumeric2 } from './money.js';

function xmlEsc(v: string | number | null | undefined): string {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ============================================================================
// 1. БАЛАНС (ЗВІТ ПРО ФІНАНСОВИЙ СТАН) — ФОРМА №1 (Ф1-м / НП(С)БО 1)
// ============================================================================

export async function getBalanceSheetF1(
  db: AppDb,
  params: { organizationId: string; asOfDate: Date | string }
) {
  const asOf = toIsoDate(params.asOfDate);
  const tb = await getTrialBalance(db, {
    organizationId: params.organizationId,
    dateFrom: '2000-01-01T00:00:00Z',
    dateTo: asOf,
  });

  const byCode = new Map(tb.rows.map((r) => [r.accountCode, r]));
  const closeDt = (codes: string[]) =>
    codes.reduce((acc, c) => acc.plus(d(byCode.get(c)?.closingDebit ?? 0)), d(0));
  const closeKt = (codes: string[]) =>
    codes.reduce((acc, c) => acc.plus(d(byCode.get(c)?.closingCredit ?? 0)), d(0));

  // АКТИВ
  const faInitial = closeDt(['104', '106', '152']); // 1011
  const faWear = closeKt(['131']); // 1012
  const faNet = faInitial.minus(faWear); // 1010

  const inventory = closeDt(['201', '231', '26', '281']); // 1100
  const receivables = closeDt(['361', '377', '631']); // 1125 (враховуючи видані аванси Дт 631)
  const taxReceivable = closeDt(['6412', '6441', '6431']); // 1135 (переплата / ПДВ-зобов'язання до закриття)
  const cash = closeDt(['301', '311', '312']); // 1165

  const totalAssets = round2(faNet.plus(inventory).plus(receivables).plus(taxReceivable).plus(cash));

  // ПАСИВ
  // Капітал (401 + сальдо вводу початкових залишків 00)
  const equity00Net = closeKt(['00']).minus(closeDt(['00']));
  const registeredCapital = closeKt(['401']).plus(equity00Net); // 1400

  // Нерозподілений прибуток = 441 + нерозподілений фінрезультат поточного періоду (Клас 7 Кт - Клас 9 Дт)
  const class7 = closeKt(['702', '703', '714', '719', '791']).minus(
    closeDt(['702', '703', '714', '719', '791'])
  );
  const class9 = closeDt(['902', '903', '92', '93', '945', '947']).minus(
    closeKt(['902', '903', '92', '93', '945', '947'])
  );
  const retainedEarnings = closeKt(['441']).minus(closeDt(['441'])).plus(class7.minus(class9)); // 1420

  const payablesTrade = closeKt(['631', '361', '377']); // 1615 (кредиторка + отримані аванси Кт 361)
  const payablesBudget = closeKt(['6411', '6412', '642', '6431']); // 1620
  const payablesEsv = closeKt(['651']); // 1625
  const payablesPayroll = closeKt(['661']); // 1630

  const totalLiabilitiesAndEquity = round2(
    registeredCapital
      .plus(retainedEarnings)
      .plus(payablesTrade)
      .plus(payablesBudget)
      .plus(payablesEsv)
      .plus(payablesPayroll)
  );

  return {
    formCode: 'Ф1 (ДКУД 1801001)',
    asOfDate: asOf.toISOString(),
    assets: [
      { code: '1010', name: 'Основні засоби (залишкова вартість)', amount: toNumeric2(faNet), isBold: true },
      { code: '1011', name: '  первісна вартість (104, 106)', amount: toNumeric2(faInitial) },
      { code: '1012', name: '  знос (131)', amount: toNumeric2(faWear.neg()) },
      { code: '1100', name: 'Запаси (201, 231, 26, 281)', amount: toNumeric2(inventory) },
      { code: '1125', name: 'Дебіторська заборгованість за товари, роботи, послуги (361)', amount: toNumeric2(receivables) },
      { code: '1135', name: 'Дебіторська заборгованість за розрахунками з бюджетом (6431/6441)', amount: toNumeric2(taxReceivable) },
      { code: '1165', name: 'Гроші та їх еквіваленти (301, 311, 312)', amount: toNumeric2(cash) },
      { code: '1300', name: 'БАЛАНС (АКТИВ)', amount: toNumeric2(totalAssets), isTotal: true },
    ],
    liabilities: [
      { code: '1400', name: 'Зареєстрований (пайовий) та початковий капітал (401, 00)', amount: toNumeric2(registeredCapital) },
      { code: '1420', name: 'Нерозподілений прибуток / збиток (441 + поточний фінрезультат)', amount: toNumeric2(retainedEarnings) },
      { code: '1615', name: 'Поточна кредиторська заборгованість за товари та послуги (631)', amount: toNumeric2(payablesTrade) },
      { code: '1620', name: 'Розрахунки з бюджетом: ПДВ, ПДФО, ВЗ (6411, 6412, 642)', amount: toNumeric2(payablesBudget) },
      { code: '1625', name: 'Розрахунки зі страхування: ЄСВ (651)', amount: toNumeric2(payablesEsv) },
      { code: '1630', name: 'Розрахунки з оплати праці (661)', amount: toNumeric2(payablesPayroll) },
      { code: '1900', name: 'БАЛАНС (ПАСИВ)', amount: toNumeric2(totalLiabilitiesAndEquity), isTotal: true },
    ],
    totalAssets: toNumeric2(totalAssets),
    totalLiabilitiesAndEquity: toNumeric2(totalLiabilitiesAndEquity),
    isBalanced: totalAssets.eq(totalLiabilitiesAndEquity),
  };
}

// ============================================================================
// 2. ЗВІТ ПРО ФІНАНСОВІ РЕЗУЛЬТАТИ — ФОРМА №2 (Ф2-м)
// ============================================================================

export async function getIncomeStatementF2(
  db: AppDb,
  params: { organizationId: string; dateFrom: Date | string; dateTo: Date | string }
) {
  const tb = await getTrialBalance(db, params);
  const byCode = new Map(tb.rows.map((r) => [r.accountCode, r]));
  const turnKt = (codes: string[]) =>
    codes.reduce((acc, c) => acc.plus(d(byCode.get(c)?.turnoverCredit ?? 0)), d(0));
  const turnDt = (codes: string[]) =>
    codes.reduce((acc, c) => acc.plus(d(byCode.get(c)?.turnoverDebit ?? 0)), d(0));

  const revenue = turnKt(['702', '703']); // 2000
  const cogs = turnDt(['902', '903']); // 2050
  const grossProfit = revenue.minus(cogs); // 2090
  const otherOpIncome = turnKt(['714', '719']); // 2120
  const adminExpenses = turnDt(['92']); // 2130
  const salesExpenses = turnDt(['93']); // 2150
  const otherOpExpenses = turnDt(['945', '947']); // 2180

  const profitBeforeTax = grossProfit
    .plus(otherOpIncome)
    .minus(adminExpenses)
    .minus(salesExpenses)
    .minus(otherOpExpenses); // 2290

  const incomeTax = profitBeforeTax.gt(0) ? round2(profitBeforeTax.mul(0.18)) : d(0); // 2300
  const netProfit = profitBeforeTax.minus(incomeTax); // 2350

  return {
    formCode: 'Ф2 (ДКУД 1801003)',
    rows: [
      { code: '2000', name: 'Чистий дохід від реалізації продукції (товарів, робіт, послуг)', amount: toNumeric2(revenue) },
      { code: '2050', name: 'Собівартість реалізованої продукції (товарів, робіт, послуг)', amount: toNumeric2(cogs.neg()) },
      { code: '2090', name: 'Валовий прибуток (збиток)', amount: toNumeric2(grossProfit), isBold: true },
      { code: '2120', name: 'Інші операційні доходи (курсові різниці 714, надлишки 719)', amount: toNumeric2(otherOpIncome) },
      { code: '2130', name: 'Адміністративні витрати (92: оренда, ЗП, амортизація)', amount: toNumeric2(adminExpenses.neg()) },
      { code: '2150', name: 'Витрати на збут (93: маркетинг, ЗП продажів)', amount: toNumeric2(salesExpenses.neg()) },
      { code: '2180', name: 'Інші операційні витрати (945 курсові втрати, 947 нестачі)', amount: toNumeric2(otherOpExpenses.neg()) },
      { code: '2290', name: 'Фінансовий результат до оподаткування (прибуток / збиток)', amount: toNumeric2(profitBeforeTax), isBold: true },
      { code: '2300', name: 'Витрати з податку на прибуток (розрахунково 18%)', amount: toNumeric2(incomeTax.neg()) },
      { code: '2350', name: 'Чистий фінансовий результат (прибуток / збиток)', amount: toNumeric2(netProfit), isTotal: true },
    ],
    profitBeforeTax: toNumeric2(profitBeforeTax),
    netProfit: toNumeric2(netProfit),
  };
}

// ============================================================================
// 3. ПОДАТКОВА ДЕКЛАРАЦІЯ З ПДВ (J0200125 XML)
// ============================================================================

export async function getVatDeclaration(
  db: AppDb,
  params: { organizationId: string; dateFrom: Date | string; dateTo: Date | string }
) {
  const from = toIsoDate(params.dateFrom);
  const to = toIsoDate(params.dateTo);

  const [[org], periodDocs] = await Promise.all([
    db.select().from(organizations).where(eq(organizations.id, params.organizationId)),
    db
      .select()
      .from(documents)
      .where(
        and(
          eq(documents.organizationId, params.organizationId),
          eq(documents.status, 'POSTED'),
          gte(documents.docDate, from),
          lte(documents.docDate, to)
        )
      ),
  ]);

  // Податкові зобов'язання (із проведених tax_invoice або sales_invoice)
  const taxInvoices = periodDocs.filter((doc) => doc.docType === 'tax_invoice');
  const salesDocs = periodDocs.filter((doc) => doc.docType === 'sales_invoice');
  const sourceOut = taxInvoices.length > 0 ? taxInvoices : salesDocs;

  let outGross = d(0);
  let outVat = d(0);
  for (const doc of sourceOut) {
    const gross = d(doc.totalAmount);
    const vat = d(doc.vatAmount).gt(0) ? d(doc.vatAmount) : round2(gross.mul(20).div(120));
    outGross = outGross.plus(gross);
    outVat = outVat.plus(vat);
  }
  const outBase = outGross.minus(outVat);

  // Податковий кредит (із прибуткових накладних goods_receipt — умовно 20% в т.ч.)
  const purchaseDocs = periodDocs.filter((doc) => doc.docType === 'goods_receipt');
  let inGross = d(0);
  let inVat = d(0);
  for (const doc of purchaseDocs) {
    const gross = d(doc.totalAmount);
    const vat = round2(gross.mul(20).div(120));
    inGross = inGross.plus(gross);
    inVat = inVat.plus(vat);
  }
  const inBase = inGross.minus(inVat);

  const netVat = round2(outVat.minus(inVat));
  const vatPayable = netVat.gt(0) ? netVat : d(0);
  const vatNegative = netVat.lt(0) ? netVat.abs() : d(0);

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<DECLAR xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="J0200125.xsd">
  <DECLARHEAD>
    <TIN>${xmlEsc(org.edrpou)}</TIN>
    <C_DOC>J02</C_DOC><C_DOC_SUB>001</C_DOC_SUB><C_DOC_VER>25</C_DOC_VER>
    <PERIOD_MONTH>${to.getUTCMonth() + 1}</PERIOD_MONTH>
    <PERIOD_YEAR>${to.getUTCFullYear()}</PERIOD_YEAR>
  </DECLARHEAD>
  <DECLARBODY>
    <HNAME>${xmlEsc(org.name)}</HNAME>
    <R0011G3>${toNumeric2(outBase)}</R0011G3>
    <R0011G4>${toNumeric2(outVat)}</R0011G4>
    <R0101G3>${toNumeric2(inBase)}</R0101G3>
    <R0101G4>${toNumeric2(inVat)}</R0101G4>
    <R0180G4>${toNumeric2(vatPayable)}</R0180G4>
    <R0190G4>${toNumeric2(vatNegative)}</R0190G4>
  </DECLARBODY>
</DECLAR>`;

  return {
    formCode: 'J0200125 (Декларація з ПДВ)',
    rows: [
      { code: '1.1', name: 'Операції на митній території України (ставка 20%) — Податкові зобов’язання', base: toNumeric2(outBase), vat: toNumeric2(outVat) },
      { code: '9', name: 'Усього податкових зобов’язань', base: toNumeric2(outBase), vat: toNumeric2(outVat), isBold: true },
      { code: '10.1', name: 'Придбання товарів/послуг з ПДВ 20% — Податковий кредит', base: toNumeric2(inBase), vat: toNumeric2(inVat) },
      { code: '17', name: 'Усього податкового кредиту', base: toNumeric2(inBase), vat: toNumeric2(inVat), isBold: true },
      { code: '18', name: 'Позитивне значення різниці (до сплати в бюджет)', base: '—', vat: toNumeric2(vatPayable), isTotal: true },
      { code: '19', name: 'Від’ємне значення різниці (переноситься на наступний період)', base: '—', vat: toNumeric2(vatNegative) },
    ],
    filename: `J0200125_${org.edrpou}_${to.toISOString().slice(0, 7)}.xml`,
    xml,
  };
}

// ============================================================================
// 4. ДЕКЛАРАЦІЯ ПЛАТНИКА ЄДИНОГО ПОДАТКУ (3 ГРУПА: 5% / 3% + ВЗ 1%, F0103308)
// ============================================================================

export async function getSingleTaxDeclaration(
  db: AppDb,
  params: {
    organizationId: string;
    dateFrom: Date | string;
    dateTo: Date | string;
    taxRatePercent?: number; // 5 (без ПДВ) або 3 (з ПДВ)
  }
) {
  const from = toIsoDate(params.dateFrom);
  const to = toIsoDate(params.dateTo);
  const rate = params.taxRatePercent ?? 5;

  const [[org], cashIn] = await Promise.all([
    db.select().from(organizations).where(eq(organizations.id, params.organizationId)),
    db
      .select()
      .from(regCashMovements)
      .where(
        and(
          eq(regCashMovements.organizationId, params.organizationId),
          eq(regCashMovements.recorderType, 'money_in'),
          gte(regCashMovements.period, from),
          lte(regCashMovements.period, to)
        )
      ),
  ]);

  // Дохід за касовим методом (сума надходжень на рахунки/каси в грн)
  const taxableIncome = cashIn.reduce((acc, m) => acc.plus(d(m.amount)), d(0));
  const singleTaxAmount = round2(taxableIncome.mul(rate).div(100));
  const militaryTax1Percent = round2(taxableIncome.mul(1).div(100)); // Військовий збір 1% для 3 групи ЄП

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<DECLAR xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="F0103308.xsd">
  <DECLARHEAD>
    <TIN>${xmlEsc(org.edrpou)}</TIN>
    <C_DOC>F01</C_DOC><C_DOC_SUB>033</C_DOC_SUB><C_DOC_VER>8</C_DOC_VER>
    <PERIOD_YEAR>${to.getUTCFullYear()}</PERIOD_YEAR>
  </DECLARHEAD>
  <DECLARBODY>
    <HNAME>${xmlEsc(org.name)}</HNAME>
    <R006G3>${toNumeric2(taxableIncome)}</R006G3>
    <R011G3>${toNumeric2(singleTaxAmount)}</R011G3>
    <R023G3>${toNumeric2(militaryTax1Percent)}</R023G3>
  </DECLARBODY>
</DECLAR>`;

  return {
    formCode: `F0103308 (Єдиний податок 3 група, ${rate}% + 1% ВЗ)`,
    taxRatePercent: rate,
    rows: [
      { code: '06', name: 'Обсяг доходу за звітний період (касовий метод — надходження на рахунки)', amount: toNumeric2(taxableIncome) },
      { code: '11', name: `Сума Єдиного податку за ставкою ${rate}%`, amount: toNumeric2(singleTaxAmount), isBold: true },
      { code: '23', name: 'Військовий збір платника ЄП 3 групи (1% від доходу)', amount: toNumeric2(militaryTax1Percent) },
      { code: 'TOTAL', name: 'Усього податків до сплати (ЄП + ВЗ)', amount: toNumeric2(singleTaxAmount.plus(militaryTax1Percent)), isTotal: true },
    ],
    filename: `F0103308_${org.edrpou}_${to.toISOString().slice(0, 7)}.xml`,
    xml,
  };
}

// ============================================================================
// 5. ОБ'ЄДНАНИЙ ЗВІТ ЄСВ + ПДФО + ВЗ (ДОДАТОК 1 ТА 4ДФ — J0500109 XML)
// ============================================================================

export async function getUnifiedPayrollReport(
  db: AppDb,
  params: { organizationId: string; dateFrom: Date | string; dateTo: Date | string }
) {
  const from = toIsoDate(params.dateFrom);
  const to = toIsoDate(params.dateTo);

  const [[org], payrollDocs, allEmps] = await Promise.all([
    db.select().from(organizations).where(eq(organizations.id, params.organizationId)),
    db
      .select()
      .from(documents)
      .where(
        and(
          eq(documents.organizationId, params.organizationId),
          eq(documents.docType, 'payroll_sheet'),
          eq(documents.status, 'POSTED'),
          gte(documents.docDate, from),
          lte(documents.docDate, to)
        )
      )
      .orderBy(asc(documents.docDate)),
    db.select().from(employees).where(eq(employees.organizationId, params.organizationId)),
  ]);

  const empMap = new Map(allEmps.map((e) => [e.id, e]));
  const perEmp = new Map<
    string,
    {
      employeeId: string;
      fullName: string;
      rnokpp: string;
      position: string;
      gross: ReturnType<typeof d>;
      pdfo: ReturnType<typeof d>;
      vz: ReturnType<typeof d>;
      esv: ReturnType<typeof d>;
    }
  >();

  for (const pd of payrollDocs) {
    const lines = await db
      .select()
      .from(documentLines)
      .where(eq(documentLines.documentId, pd.id));

    for (const l of lines) {
      const emp = l.employeeId ? empMap.get(l.employeeId) : undefined;
      const key = emp?.id ?? l.id;
      const gross = round2(l.amount);
      const pdfo = round2(gross.mul(0.18));
      const vz = round2(gross.mul(0.05));
      const esv = round2(gross.mul(0.22));

      const cur = perEmp.get(key) ?? {
        employeeId: key,
        fullName: emp?.fullName ?? l.notes ?? 'Співробітник',
        rnokpp: emp?.rnokpp ?? '',
        position: emp?.position ?? '',
        gross: d(0),
        pdfo: d(0),
        vz: d(0),
        esv: d(0),
      };
      cur.gross = cur.gross.plus(gross);
      cur.pdfo = cur.pdfo.plus(pdfo);
      cur.vz = cur.vz.plus(vz);
      cur.esv = cur.esv.plus(esv);
      perEmp.set(key, cur);
    }
  }

  let totGross = d(0);
  let totPdfo = d(0);
  let totVz = d(0);
  let totEsv = d(0);

  const rows = Array.from(perEmp.values()).map((r) => {
    totGross = totGross.plus(r.gross);
    totPdfo = totPdfo.plus(r.pdfo);
    totVz = totVz.plus(r.vz);
    totEsv = totEsv.plus(r.esv);
    return {
      employeeId: r.employeeId,
      fullName: r.fullName,
      rnokpp: r.rnokpp,
      position: r.position,
      gross: toNumeric2(r.gross),
      pdfo: toNumeric2(r.pdfo),
      vz: toNumeric2(r.vz),
      esv: toNumeric2(r.esv),
      netPay: toNumeric2(r.gross.minus(r.pdfo).minus(r.vz)),
    };
  });

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<DECLAR xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="J0500109.xsd">
  <DECLARHEAD>
    <TIN>${xmlEsc(org.edrpou)}</TIN>
    <C_DOC>J05</C_DOC><C_DOC_SUB>001</C_DOC_SUB><C_DOC_VER>9</C_DOC_VER>
    <PERIOD_MONTH>${to.getUTCMonth() + 1}</PERIOD_MONTH>
    <PERIOD_YEAR>${to.getUTCFullYear()}</PERIOD_YEAR>
  </DECLARHEAD>
  <DECLARBODY>
    <HNAME>${xmlEsc(org.name)}</HNAME>
    <R01G1>${rows.length}</R01G1>
    <R0101G1>${toNumeric2(totGross)}</R0101G1>
    <R0301G1>${toNumeric2(totEsv)}</R0301G1>
    <R4DF_PDFO>${toNumeric2(totPdfo)}</R4DF_PDFO>
    <R4DF_VZ>${toNumeric2(totVz)}</R4DF_VZ>
${rows
  .map(
    (r, i) => `    <EMP ROWNUM="${i + 1}" RNOKPP="${xmlEsc(r.rnokpp)}" NAME="${xmlEsc(
      r.fullName
    )}" GROSS="${r.gross}" PDFO="${r.pdfo}" VZ="${r.vz}" ESV="${r.esv}" />`
  )
  .join('\n')}
  </DECLARBODY>
</DECLAR>`;

  return {
    formCode: 'J0500109 (Об’єднаний звіт ЄСВ + 4ДФ ПДФО/ВЗ)',
    rows,
    totals: {
      employeesCount: rows.length,
      gross: toNumeric2(totGross),
      pdfo: toNumeric2(totPdfo),
      vz: toNumeric2(totVz),
      esv: toNumeric2(totEsv),
      netPay: toNumeric2(totGross.minus(totPdfo).minus(totVz)),
    },
    filename: `J0500109_${org.edrpou}_${to.toISOString().slice(0, 7)}.xml`,
    xml,
  };
}
