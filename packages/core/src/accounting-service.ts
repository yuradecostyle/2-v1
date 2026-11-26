import { and, asc, eq, gte, lt, lte, or } from 'drizzle-orm';
import type { AppDb } from './db.js';
import {
  chartOfAccounts,
  counterparties,
  documentLines,
  documents,
  items,
  organizations,
  regAccountingEntries,
  type AccountType,
  type SubkontoType,
} from './schema.js';
import { getStockBalances } from './reports-service.js';
import { d, round2, round4, toIsoDate, toNumeric2, toNumeric4 } from './money.js';

export const DEFAULT_CHART_OF_ACCOUNTS_291: Array<{
  code: string;
  name: string;
  accountType: AccountType;
  classNo: number;
  subkonto1Type: SubkontoType;
  subkonto2Type: SubkontoType;
  isQuantitative: boolean;
}> = [
  {
    code: '00',
    name: 'Допоміжний рахунок вводу початкових залишків',
    accountType: 'ACTIVE_PASSIVE',
    classNo: 0,
    subkonto1Type: '',
    subkonto2Type: '',
    isQuantitative: false,
  },
  {
    code: '104',
    name: 'Машини та обладнання',
    accountType: 'ACTIVE',
    classNo: 1,
    subkonto1Type: 'ITEM',
    subkonto2Type: '',
    isQuantitative: true,
  },
  {
    code: '106',
    name: 'Інструменти, прилади та інвентар',
    accountType: 'ACTIVE',
    classNo: 1,
    subkonto1Type: 'ITEM',
    subkonto2Type: '',
    isQuantitative: true,
  },
  {
    code: '131',
    name: 'Знос основних засобів',
    accountType: 'PASSIVE',
    classNo: 1,
    subkonto1Type: 'ITEM',
    subkonto2Type: '',
    isQuantitative: false,
  },
  {
    code: '152',
    name: 'Придбання (виготовлення) основних засобів',
    accountType: 'ACTIVE',
    classNo: 1,
    subkonto1Type: 'ITEM',
    subkonto2Type: '',
    isQuantitative: false,
  },
  {
    code: '201',
    name: 'Сировина й матеріали',
    accountType: 'ACTIVE',
    classNo: 2,
    subkonto1Type: 'WAREHOUSE',
    subkonto2Type: 'ITEM',
    isQuantitative: true,
  },
  {
    code: '231',
    name: 'Основне виробництво',
    accountType: 'ACTIVE',
    classNo: 2,
    subkonto1Type: 'ITEM',
    subkonto2Type: '',
    isQuantitative: true,
  },
  {
    code: '26',
    name: 'Готова продукція',
    accountType: 'ACTIVE',
    classNo: 2,
    subkonto1Type: 'WAREHOUSE',
    subkonto2Type: 'ITEM',
    isQuantitative: true,
  },
  {
    code: '281',
    name: 'Товари на складі',
    accountType: 'ACTIVE',
    classNo: 2,
    subkonto1Type: 'WAREHOUSE',
    subkonto2Type: 'ITEM',
    isQuantitative: true,
  },
  {
    code: '301',
    name: 'Готівка в національній валюті',
    accountType: 'ACTIVE',
    classNo: 3,
    subkonto1Type: 'CASH_ACCOUNT',
    subkonto2Type: '',
    isQuantitative: false,
  },
  {
    code: '311',
    name: 'Поточні рахунки в національній валюті',
    accountType: 'ACTIVE',
    classNo: 3,
    subkonto1Type: 'CASH_ACCOUNT',
    subkonto2Type: '',
    isQuantitative: false,
  },
  {
    code: '312',
    name: 'Поточні рахунки в іноземній валюті (USD/EUR)',
    accountType: 'ACTIVE',
    classNo: 3,
    subkonto1Type: 'CASH_ACCOUNT',
    subkonto2Type: '',
    isQuantitative: false,
  },
  {
    code: '361',
    name: 'Розрахунки з вітчизняними покупцями',
    accountType: 'ACTIVE_PASSIVE',
    classNo: 3,
    subkonto1Type: 'COUNTERPARTY',
    subkonto2Type: '',
    isQuantitative: false,
  },
  {
    code: '377',
    name: 'Розрахунки з іншими дебіторами та кредиторами',
    accountType: 'ACTIVE_PASSIVE',
    classNo: 3,
    subkonto1Type: 'COUNTERPARTY',
    subkonto2Type: '',
    isQuantitative: false,
  },
  {
    code: '401',
    name: 'Статутний капітал',
    accountType: 'PASSIVE',
    classNo: 4,
    subkonto1Type: '',
    subkonto2Type: '',
    isQuantitative: false,
  },
  {
    code: '441',
    name: 'Прибуток нерозподілений',
    accountType: 'PASSIVE',
    classNo: 4,
    subkonto1Type: '',
    subkonto2Type: '',
    isQuantitative: false,
  },
  {
    code: '631',
    name: 'Розрахунки з вітчизняними постачальниками',
    accountType: 'ACTIVE_PASSIVE',
    classNo: 6,
    subkonto1Type: 'COUNTERPARTY',
    subkonto2Type: '',
    isQuantitative: false,
  },
  {
    code: '6411',
    name: 'Розрахунки за податком на доходи фізичних осіб (ПДФО)',
    accountType: 'PASSIVE',
    classNo: 6,
    subkonto1Type: 'EMPLOYEE',
    subkonto2Type: '',
    isQuantitative: false,
  },
  {
    code: '6412',
    name: 'Розрахунки за податком на додану вартість (ПДВ)',
    accountType: 'ACTIVE_PASSIVE',
    classNo: 6,
    subkonto1Type: '',
    subkonto2Type: '',
    isQuantitative: false,
  },
  {
    code: '642',
    name: 'Розрахунки за обов’язковими платежами (Військовий збір)',
    accountType: 'PASSIVE',
    classNo: 6,
    subkonto1Type: 'EMPLOYEE',
    subkonto2Type: '',
    isQuantitative: false,
  },
  {
    code: '6431',
    name: 'Податкові зобов’язання з ПДВ',
    accountType: 'PASSIVE',
    classNo: 6,
    subkonto1Type: 'COUNTERPARTY',
    subkonto2Type: '',
    isQuantitative: false,
  },
  {
    code: '6441',
    name: 'Податковий кредит з ПДВ',
    accountType: 'ACTIVE',
    classNo: 6,
    subkonto1Type: 'COUNTERPARTY',
    subkonto2Type: '',
    isQuantitative: false,
  },
  {
    code: '651',
    name: 'За розрахунками з ЄСВ',
    accountType: 'PASSIVE',
    classNo: 6,
    subkonto1Type: '',
    subkonto2Type: '',
    isQuantitative: false,
  },
  {
    code: '661',
    name: 'Розрахунки за заробітною платою',
    accountType: 'PASSIVE',
    classNo: 6,
    subkonto1Type: '',
    subkonto2Type: '',
    isQuantitative: false,
  },
  {
    code: '702',
    name: 'Дохід від реалізації товарів',
    accountType: 'PASSIVE',
    classNo: 7,
    subkonto1Type: 'ITEM',
    subkonto2Type: 'COUNTERPARTY',
    isQuantitative: true,
  },
  {
    code: '703',
    name: 'Дохід від реалізації робіт і послуг',
    accountType: 'PASSIVE',
    classNo: 7,
    subkonto1Type: 'ITEM',
    subkonto2Type: 'COUNTERPARTY',
    isQuantitative: false,
  },
  {
    code: '714',
    name: 'Дохід від операційної курсової різниці',
    accountType: 'PASSIVE',
    classNo: 7,
    subkonto1Type: 'CASH_ACCOUNT',
    subkonto2Type: '',
    isQuantitative: false,
  },
  {
    code: '719',
    name: 'Інші доходи від операційної діяльності',
    accountType: 'PASSIVE',
    classNo: 7,
    subkonto1Type: 'CASHFLOW_CATEGORY',
    subkonto2Type: '',
    isQuantitative: false,
  },
  {
    code: '791',
    name: 'Результат операційної діяльності',
    accountType: 'ACTIVE_PASSIVE',
    classNo: 7,
    subkonto1Type: '',
    subkonto2Type: '',
    isQuantitative: false,
  },
  {
    code: '902',
    name: 'Собівартість реалізованих товарів',
    accountType: 'ACTIVE',
    classNo: 9,
    subkonto1Type: 'ITEM',
    subkonto2Type: '',
    isQuantitative: true,
  },
  {
    code: '903',
    name: 'Собівартість реалізованих робіт і послуг',
    accountType: 'ACTIVE',
    classNo: 9,
    subkonto1Type: 'ITEM',
    subkonto2Type: '',
    isQuantitative: false,
  },
  {
    code: '92',
    name: 'Адміністративні витрати',
    accountType: 'ACTIVE',
    classNo: 9,
    subkonto1Type: 'CASHFLOW_CATEGORY',
    subkonto2Type: '',
    isQuantitative: false,
  },
  {
    code: '93',
    name: 'Витрати на збут',
    accountType: 'ACTIVE',
    classNo: 9,
    subkonto1Type: 'CASHFLOW_CATEGORY',
    subkonto2Type: '',
    isQuantitative: false,
  },
  {
    code: '945',
    name: 'Втрати від операційної курсової різниці',
    accountType: 'ACTIVE',
    classNo: 9,
    subkonto1Type: 'CASH_ACCOUNT',
    subkonto2Type: '',
    isQuantitative: false,
  },
  {
    code: '947',
    name: 'Нестачі і втрати від псування цінностей',
    accountType: 'ACTIVE',
    classNo: 9,
    subkonto1Type: 'WAREHOUSE',
    subkonto2Type: 'ITEM',
    isQuantitative: true,
  },
];

export async function ensureChartOfAccounts(db: AppDb): Promise<void> {
  const existing = await db.select({ code: chartOfAccounts.code }).from(chartOfAccounts);
  const existingCodes = new Set(existing.map((r) => r.code));

  for (const acc of DEFAULT_CHART_OF_ACCOUNTS_291) {
    if (!existingCodes.has(acc.code)) {
      await db.insert(chartOfAccounts).values({
        ...acc,
        isSystem: true,
      });
    }
  }
}

// ============================================================================
// ОБОРОТНО-САЛЬДОВА ВІДОМІСТЬ (ОСВ / TRIAL BALANCE) ЗА РАХУНКАМИ №291
// ============================================================================

export interface TrialBalanceRow {
  accountCode: string;
  accountName: string;
  accountType: AccountType;
  classNo: number;
  openingDebit: string;
  openingCredit: string;
  turnoverDebit: string;
  turnoverCredit: string;
  closingDebit: string;
  closingCredit: string;
}

export async function getTrialBalance(
  db: AppDb,
  params: { organizationId: string; dateFrom: Date | string; dateTo: Date | string }
): Promise<{
  rows: TrialBalanceRow[];
  totals: {
    openingDebit: string;
    openingCredit: string;
    turnoverDebit: string;
    turnoverCredit: string;
    closingDebit: string;
    closingCredit: string;
    isBalanced: boolean;
  };
}> {
  await ensureChartOfAccounts(db);
  const from = toIsoDate(params.dateFrom);
  const to = toIsoDate(params.dateTo);

  const [accounts, priorEntries, periodEntries] = await Promise.all([
    db.select().from(chartOfAccounts).orderBy(asc(chartOfAccounts.code)),
    db
      .select()
      .from(regAccountingEntries)
      .where(
        and(
          eq(regAccountingEntries.organizationId, params.organizationId),
          lt(regAccountingEntries.period, from)
        )
      ),
    db
      .select()
      .from(regAccountingEntries)
      .where(
        and(
          eq(regAccountingEntries.organizationId, params.organizationId),
          gte(regAccountingEntries.period, from),
          lte(regAccountingEntries.period, to)
        )
      ),
  ]);

  const accMap = new Map(accounts.map((a) => [a.code, a]));

  // Для коректного розгорнутого сальдо по активно-пасивних рахунках (361, 631 тощо)
  // групуємо всередині рахунку за ключем субконто 1 (або '__root__' для простих рахунків)
  type SubBucket = {
    openNet: ReturnType<typeof d>; // Dt - Kt
    turnDt: ReturnType<typeof d>;
    turnKt: ReturnType<typeof d>;
  };

  const bucketsByAcc = new Map<string, Map<string, SubBucket>>();

  const getBucket = (accCode: string, subKey: string): SubBucket => {
    let subMap = bucketsByAcc.get(accCode);
    if (!subMap) {
      subMap = new Map();
      bucketsByAcc.set(accCode, subMap);
    }
    let b = subMap.get(subKey);
    if (!b) {
      b = { openNet: d(0), turnDt: d(0), turnKt: d(0) };
      subMap.set(subKey, b);
    }
    return b;
  };

  for (const e of priorEntries) {
    const amt = d(e.amount);
    const dtMeta = accMap.get(e.debitAccountCode);
    const ktMeta = accMap.get(e.creditAccountCode);

    const dtKey =
      dtMeta?.accountType === 'ACTIVE_PASSIVE' && e.debitSubkonto1Id
        ? e.debitSubkonto1Id
        : '__root__';
    const ktKey =
      ktMeta?.accountType === 'ACTIVE_PASSIVE' && e.creditSubkonto1Id
        ? e.creditSubkonto1Id
        : '__root__';

    getBucket(e.debitAccountCode, dtKey).openNet = getBucket(
      e.debitAccountCode,
      dtKey
    ).openNet.plus(amt);
    getBucket(e.creditAccountCode, ktKey).openNet = getBucket(
      e.creditAccountCode,
      ktKey
    ).openNet.minus(amt);
  }

  for (const e of periodEntries) {
    const amt = d(e.amount);
    const dtMeta = accMap.get(e.debitAccountCode);
    const ktMeta = accMap.get(e.creditAccountCode);

    const dtKey =
      dtMeta?.accountType === 'ACTIVE_PASSIVE' && e.debitSubkonto1Id
        ? e.debitSubkonto1Id
        : '__root__';
    const ktKey =
      ktMeta?.accountType === 'ACTIVE_PASSIVE' && e.creditSubkonto1Id
        ? e.creditSubkonto1Id
        : '__root__';

    getBucket(e.debitAccountCode, dtKey).turnDt = getBucket(
      e.debitAccountCode,
      dtKey
    ).turnDt.plus(amt);
    getBucket(e.creditAccountCode, ktKey).turnKt = getBucket(
      e.creditAccountCode,
      ktKey
    ).turnKt.plus(amt);
  }

  let totOpenDt = d(0);
  let totOpenKt = d(0);
  let totTurnDt = d(0);
  let totTurnKt = d(0);
  let totCloseDt = d(0);
  let totCloseKt = d(0);

  const rows: TrialBalanceRow[] = [];

  for (const acc of accounts) {
    const subMap = bucketsByAcc.get(acc.code);
    if (!subMap) continue;

    let openDt = d(0);
    let openKt = d(0);
    let turnDt = d(0);
    let turnKt = d(0);
    let closeDt = d(0);
    let closeKt = d(0);

    for (const b of subMap.values()) {
      turnDt = turnDt.plus(b.turnDt);
      turnKt = turnKt.plus(b.turnKt);

      if (b.openNet.gt(0)) openDt = openDt.plus(b.openNet);
      else if (b.openNet.lt(0)) openKt = openKt.plus(b.openNet.abs());

      const closeNet = b.openNet.plus(b.turnDt).minus(b.turnKt);
      if (closeNet.gt(0)) closeDt = closeDt.plus(closeNet);
      else if (closeNet.lt(0)) closeKt = closeKt.plus(closeNet.abs());
    }

    if (
      openDt.eq(0) &&
      openKt.eq(0) &&
      turnDt.eq(0) &&
      turnKt.eq(0) &&
      closeDt.eq(0) &&
      closeKt.eq(0)
    ) {
      continue;
    }

    totOpenDt = totOpenDt.plus(openDt);
    totOpenKt = totOpenKt.plus(openKt);
    totTurnDt = totTurnDt.plus(turnDt);
    totTurnKt = totTurnKt.plus(turnKt);
    totCloseDt = totCloseDt.plus(closeDt);
    totCloseKt = totCloseKt.plus(closeKt);

    rows.push({
      accountCode: acc.code,
      accountName: acc.name,
      accountType: acc.accountType,
      classNo: acc.classNo,
      openingDebit: toNumeric2(openDt),
      openingCredit: toNumeric2(openKt),
      turnoverDebit: toNumeric2(turnDt),
      turnoverCredit: toNumeric2(turnKt),
      closingDebit: toNumeric2(closeDt),
      closingCredit: toNumeric2(closeKt),
    });
  }

  const isBalanced =
    round2(totOpenDt).eq(round2(totOpenKt)) &&
    round2(totTurnDt).eq(round2(totTurnKt)) &&
    round2(totCloseDt).eq(round2(totCloseKt));

  return {
    rows,
    totals: {
      openingDebit: toNumeric2(totOpenDt),
      openingCredit: toNumeric2(totOpenKt),
      turnoverDebit: toNumeric2(totTurnDt),
      turnoverCredit: toNumeric2(totTurnKt),
      closingDebit: toNumeric2(totCloseDt),
      closingCredit: toNumeric2(totCloseKt),
      isBalanced,
    },
  };
}

// ============================================================================
// ОСВ ПО РАХУНКУ В РОЗРІЗІ СУБКОНТО (КАРТКА / АНАЛІТИКА РАХУНКУ)
// ============================================================================

export async function getAccountSubkontoBalance(
  db: AppDb,
  params: {
    organizationId: string;
    accountCode: string;
    dateFrom: Date | string;
    dateTo: Date | string;
  }
) {
  const from = toIsoDate(params.dateFrom);
  const to = toIsoDate(params.dateTo);

  const [account] = await db
    .select()
    .from(chartOfAccounts)
    .where(eq(chartOfAccounts.code, params.accountCode));

  const entries = await db
    .select()
    .from(regAccountingEntries)
    .where(
      and(
        eq(regAccountingEntries.organizationId, params.organizationId),
        lte(regAccountingEntries.period, to),
        or(
          eq(regAccountingEntries.debitAccountCode, params.accountCode),
          eq(regAccountingEntries.creditAccountCode, params.accountCode)
        )
      )
    );

  type SubState = {
    subkontoLabel: string;
    openNet: ReturnType<typeof d>;
    openQty: ReturnType<typeof d>;
    turnDt: ReturnType<typeof d>;
    turnKt: ReturnType<typeof d>;
    turnQtyDt: ReturnType<typeof d>;
    turnQtyKt: ReturnType<typeof d>;
  };

  const map = new Map<string, SubState>();

  const ensure = (key: string, label: string): SubState => {
    let s = map.get(key);
    if (!s) {
      s = {
        subkontoLabel: label || 'Без аналітики',
        openNet: d(0),
        openQty: d(0),
        turnDt: d(0),
        turnKt: d(0),
        turnQtyDt: d(0),
        turnQtyKt: d(0),
      };
      map.set(key, s);
    }
    return s;
  };

  for (const e of entries) {
    const isBefore = e.period < from;
    const amt = d(e.amount);
    const qty = d(e.qty);

    if (e.debitAccountCode === params.accountCode) {
      const label = [e.debitSubkonto1Label, e.debitSubkonto2Label].filter(Boolean).join(' · ');
      const key = `${e.debitSubkonto1Id}|${e.debitSubkonto2Id}|${label}`;
      const st = ensure(key, label);
      if (isBefore) {
        st.openNet = st.openNet.plus(amt);
        st.openQty = st.openQty.plus(qty);
      } else {
        st.turnDt = st.turnDt.plus(amt);
        st.turnQtyDt = st.turnQtyDt.plus(qty);
      }
    }

    if (e.creditAccountCode === params.accountCode) {
      const label = [e.creditSubkonto1Label, e.creditSubkonto2Label].filter(Boolean).join(' · ');
      const key = `${e.creditSubkonto1Id}|${e.creditSubkonto2Id}|${label}`;
      const st = ensure(key, label);
      if (isBefore) {
        st.openNet = st.openNet.minus(amt);
        st.openQty = st.openQty.minus(qty);
      } else {
        st.turnKt = st.turnKt.plus(amt);
        st.turnQtyKt = st.turnQtyKt.plus(qty);
      }
    }
  }

  const rows = Array.from(map.values()).map((st) => {
    const closeNet = st.openNet.plus(st.turnDt).minus(st.turnKt);
    const closeQty = st.openQty.plus(st.turnQtyDt).minus(st.turnQtyKt);
    return {
      subkontoLabel: st.subkontoLabel,
      openingDebit: st.openNet.gt(0) ? toNumeric2(st.openNet) : '0.00',
      openingCredit: st.openNet.lt(0) ? toNumeric2(st.openNet.abs()) : '0.00',
      turnoverDebit: toNumeric2(st.turnDt),
      turnoverCredit: toNumeric2(st.turnKt),
      closingDebit: closeNet.gt(0) ? toNumeric2(closeNet) : '0.00',
      closingCredit: closeNet.lt(0) ? toNumeric2(closeNet.abs()) : '0.00',
      closingQty: toNumeric4(round4(closeQty)),
    };
  });

  rows.sort((a, b) => a.subkontoLabel.localeCompare(b.subkontoLabel, 'uk'));

  return {
    account,
    rows,
  };
}

// ============================================================================
// ЖУРНАЛ ПРОВОДОК Дт/Кт
// ============================================================================

export async function getJournalEntries(
  db: AppDb,
  params: {
    organizationId: string;
    dateFrom: Date | string;
    dateTo: Date | string;
    accountCode?: string;
  }
) {
  const from = toIsoDate(params.dateFrom);
  const to = toIsoDate(params.dateTo);

  const conds = [
    eq(regAccountingEntries.organizationId, params.organizationId),
    gte(regAccountingEntries.period, from),
    lte(regAccountingEntries.period, to),
  ];

  if (params.accountCode) {
    conds.push(
      or(
        eq(regAccountingEntries.debitAccountCode, params.accountCode),
        eq(regAccountingEntries.creditAccountCode, params.accountCode)
      )!
    );
  }

  const rows = await db
    .select({
      entry: regAccountingEntries,
      docNumber: documents.docNumber,
      docType: documents.docType,
    })
    .from(regAccountingEntries)
    .leftJoin(documents, eq(regAccountingEntries.recorderId, documents.id))
    .where(and(...conds))
    .orderBy(asc(regAccountingEntries.period), asc(regAccountingEntries.lineNo));

  return rows.map((r) => ({
    ...r.entry,
    docNumber: r.docNumber ?? '',
    docType: r.docType ?? r.entry.recorderType,
  }));
}

// ============================================================================
// ГЕНЕРАТОР SAF-T UA v2.0 (СТАНДАРТНИЙ АУДИТОРСЬКИЙ ФАЙЛ ДПС УКРАЇНИ XML)
// ============================================================================

function xmlEscape(val: string | number | null | undefined): string {
  return String(val ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export async function generateSaftUaXml(
  db: AppDb,
  params: { organizationId: string; dateFrom: Date | string; dateTo: Date | string }
) {
  const from = toIsoDate(params.dateFrom);
  const to = toIsoDate(params.dateTo);
  const fromStr = from.toISOString().slice(0, 10);
  const toStr = to.toISOString().slice(0, 10);

  const [[org], tb, entries, allCp, allItems, stock, periodDocs, allDocLines] = await Promise.all([
    db.select().from(organizations).where(eq(organizations.id, params.organizationId)),
    getTrialBalance(db, params),
    getJournalEntries(db, params),
    db.select().from(counterparties),
    db.select().from(items),
    getStockBalances(db, { organizationId: params.organizationId, asOfDate: to }),
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
      )
      .orderBy(asc(documents.docDate)),
    db.select().from(documentLines),
  ]);

  const linesByDoc = new Map<string, typeof allDocLines>();
  for (const l of allDocLines) {
    const arr = linesByDoc.get(l.documentId) ?? [];
    arr.push(l);
    linesByDoc.set(l.documentId, arr);
  }

  const cpMap = new Map(allCp.map((c) => [c.id, c]));
  const itemMap = new Map(allItems.map((i) => [i.id, i]));

  // Групуємо проводки в транзакції Головної книги по документу-реєстратору
  const entriesByDoc = new Map<string, typeof entries>();
  let totalGlDebit = d(0);
  let totalGlCredit = d(0);

  for (const e of entries) {
    totalGlDebit = totalGlDebit.plus(d(e.amount));
    totalGlCredit = totalGlCredit.plus(d(e.amount));
    const arr = entriesByDoc.get(e.recorderId) ?? [];
    arr.push(e);
    entriesByDoc.set(e.recorderId, arr);
  }

  const customers = allCp.filter((c) => c.isCustomer);
  const suppliers = allCp.filter((c) => c.isSupplier);

  const salesDocs = periodDocs.filter((doc) => doc.docType === 'sales_invoice');
  const purchaseDocs = periodDocs.filter((doc) => doc.docType === 'goods_receipt');
  const paymentDocs = periodDocs.filter(
    (doc) => doc.docType === 'money_in' || doc.docType === 'money_out'
  );
  const movementDocs = periodDocs.filter(
    (doc) => doc.docType === 'stock_transfer' || doc.docType === 'inventory_count'
  );

  const sumDocs = (arr: typeof periodDocs) =>
    toNumeric2(arr.reduce((acc, doc) => acc.plus(d(doc.totalAmount)), d(0)));

  const nowDate = new Date().toISOString().slice(0, 10);

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<AuditFile xmlns="urn:OECD:StandardAuditFile-Taxation/2.00" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <Header>
    <AuditFileVersion>2.00</AuditFileVersion>
    <AuditFileCountry>UA</AuditFileCountry>
    <AuditFileRegion>UA-30</AuditFileRegion>
    <AuditFileDateCreated>${nowDate}</AuditFileDateCreated>
    <SoftwareCompanyName>ОблікFlow</SoftwareCompanyName>
    <SoftwareID>OblikFlow-ERP-UA</SoftwareID>
    <SoftwareVersion>2.0.0</SoftwareVersion>
    <Company>
      <RegistrationNumber>${xmlEscape(org.edrpou || '00000000')}</RegistrationNumber>
      <Name>${xmlEscape(org.name)}</Name>
    </Company>
    <DefaultCurrencyCode>${xmlEscape(org.baseCurrency)}</DefaultCurrencyCode>
    <SelectionCriteria>
      <SelectionStartDate>${fromStr}</SelectionStartDate>
      <SelectionEndDate>${toStr}</SelectionEndDate>
    </SelectionCriteria>
    <TaxAccountingBasis>A</TaxAccountingBasis>
  </Header>
  <MasterFiles>
    <GeneralLedgerAccounts>
${tb.rows
  .map(
    (r) => `      <Account>
        <AccountID>${xmlEscape(r.accountCode)}</AccountID>
        <AccountDescription>${xmlEscape(r.accountName)}</AccountDescription>
        <StandardAccountID>${xmlEscape(r.accountCode)}</StandardAccountID>
        <AccountType>${xmlEscape(r.accountType)}</AccountType>
        <OpeningDebitBalance>${r.openingDebit}</OpeningDebitBalance>
        <OpeningCreditBalance>${r.openingCredit}</OpeningCreditBalance>
        <ClosingDebitBalance>${r.closingDebit}</ClosingDebitBalance>
        <ClosingCreditBalance>${r.closingCredit}</ClosingCreditBalance>
      </Account>`
  )
  .join('\n')}
    </GeneralLedgerAccounts>
    <Customers>
${customers
  .map(
    (c) => `      <Customer>
        <RegistrationNumber>${xmlEscape(c.edrpou || '100000000000')}</RegistrationNumber>
        <Name>${xmlEscape(c.name)}</Name>
        <CustomerID>${xmlEscape(c.id)}</CustomerID>
        <AccountID>361</AccountID>
      </Customer>`
  )
  .join('\n')}
    </Customers>
    <Suppliers>
${suppliers
  .map(
    (s) => `      <Supplier>
        <RegistrationNumber>${xmlEscape(s.edrpou || '100000000000')}</RegistrationNumber>
        <Name>${xmlEscape(s.name)}</Name>
        <SupplierID>${xmlEscape(s.id)}</SupplierID>
        <AccountID>631</AccountID>
      </Supplier>`
  )
  .join('\n')}
    </Suppliers>
    <Products>
${allItems
  .map(
    (it) => `      <Product>
        <GoodsServicesID>${it.itemType === 'SERVICE' ? '02' : '01'}</GoodsServicesID>
        <ProductCode>${xmlEscape(it.sku)}</ProductCode>
        <Description>${xmlEscape(it.name)}</Description>
        <UOMBase>${xmlEscape(it.unit)}</UOMBase>
      </Product>`
  )
  .join('\n')}
    </Products>
    <PhysicalStock>
${stock.rows
  .map(
    (st) => `      <PhysicalStockEntry>
        <WarehouseID>${xmlEscape(st.warehouseId)}</WarehouseID>
        <WarehouseName>${xmlEscape(st.warehouseName)}</WarehouseName>
        <ProductCode>${xmlEscape(st.itemSku)}</ProductCode>
        <ClosingStockQuantity>${st.qty}</ClosingStockQuantity>
        <ClosingStockValue>${st.costAmount}</ClosingStockValue>
      </PhysicalStockEntry>`
  )
  .join('\n')}
    </PhysicalStock>
  </MasterFiles>
  <GeneralLedgerEntries>
    <NumberOfEntries>${entriesByDoc.size}</NumberOfEntries>
    <TotalDebit>${toNumeric2(totalGlDebit)}</TotalDebit>
    <TotalCredit>${toNumeric2(totalGlCredit)}</TotalCredit>
    <Journal>
      <JournalID>GL-MAIN</JournalID>
      <Description>Головна книга (План рахунків Мінфіну №291)</Description>
      <Type>GL</Type>
${Array.from(entriesByDoc.entries())
  .map(([docId, txEntries]) => {
    const first = txEntries[0];
    const txDate = first.period.toISOString().slice(0, 10);
    const linesXml = txEntries
      .map(
        (ln, i) => `        <TransactionLine>
          <RecordID>${i * 2 + 1}</RecordID>
          <AccountID>${xmlEscape(ln.debitAccountCode)}</AccountID>
          ${
            ln.debitSubkonto1Label
              ? `<Analysis><AnalysisType>${xmlEscape(ln.debitSubkonto1Type)}</AnalysisType><AnalysisID>${xmlEscape(ln.debitSubkonto1Label)}</AnalysisID></Analysis>`
              : ''
          }
          <Description>${xmlEscape(ln.description)}</Description>
          <DebitAmount><Amount>${ln.amount}</Amount></DebitAmount>
        </TransactionLine>
        <TransactionLine>
          <RecordID>${i * 2 + 2}</RecordID>
          <AccountID>${xmlEscape(ln.creditAccountCode)}</AccountID>
          ${
            ln.creditSubkonto1Label
              ? `<Analysis><AnalysisType>${xmlEscape(ln.creditSubkonto1Type)}</AnalysisType><AnalysisID>${xmlEscape(ln.creditSubkonto1Label)}</AnalysisID></Analysis>`
              : ''
          }
          <Description>${xmlEscape(ln.description)}</Description>
          <CreditAmount><Amount>${ln.amount}</Amount></CreditAmount>
        </TransactionLine>`
      )
      .join('\n');
    return `      <Transaction>
        <TransactionID>${xmlEscape(docId)}</TransactionID>
        <Period>${first.period.getUTCMonth() + 1}</Period>
        <PeriodYear>${first.period.getUTCFullYear()}</PeriodYear>
        <TransactionDate>${txDate}</TransactionDate>
        <Description>${xmlEscape(`${first.docType} №${first.docNumber}`)}</Description>
${linesXml}
      </Transaction>`;
  })
  .join('\n')}
    </Journal>
  </GeneralLedgerEntries>
  <SourceDocuments>
    <SalesInvoices>
      <NumberOfEntries>${salesDocs.length}</NumberOfEntries>
      <TotalDebit>0.00</TotalDebit>
      <TotalCredit>${sumDocs(salesDocs)}</TotalCredit>
${salesDocs
  .map((sd) => {
    const cp = sd.counterpartyId ? cpMap.get(sd.counterpartyId) : undefined;
    const dLines = linesByDoc.get(sd.id) ?? [];
    return `      <Invoice>
        <InvoiceNo>${xmlEscape(sd.docNumber)}</InvoiceNo>
        <CustomerInfo>
          <CustomerID>${xmlEscape(sd.counterpartyId ?? '')}</CustomerID>
          <Name>${xmlEscape(cp?.name ?? '')}</Name>
        </CustomerInfo>
        <InvoiceDate>${sd.docDate.toISOString().slice(0, 10)}</InvoiceDate>
        ${sd.fiscalCode ? `<FiscalReceiptNumber>${xmlEscape(sd.fiscalCode)}</FiscalReceiptNumber>` : ''}
${dLines
  .map((ln) => {
    const it = ln.itemId ? itemMap.get(ln.itemId) : undefined;
    return `        <InvoiceLine>
          <LineNumber>${ln.lineNo}</LineNumber>
          <ProductCode>${xmlEscape(it?.sku ?? '')}</ProductCode>
          <ProductDescription>${xmlEscape(it?.name ?? '')}</ProductDescription>
          <Quantity>${ln.qty}</Quantity>
          <UnitPrice>${ln.price}</UnitPrice>
          <InvoiceLineAmount><Amount>${ln.amount}</Amount></InvoiceLineAmount>
        </InvoiceLine>`;
  })
  .join('\n')}
        <DocumentTotals>
          <GrossTotal>${sd.totalAmount}</GrossTotal>
        </DocumentTotals>
      </Invoice>`;
  })
  .join('\n')}
    </SalesInvoices>
    <PurchaseInvoices>
      <NumberOfEntries>${purchaseDocs.length}</NumberOfEntries>
      <TotalDebit>${sumDocs(purchaseDocs)}</TotalDebit>
      <TotalCredit>0.00</TotalCredit>
${purchaseDocs
  .map((pd) => {
    const cp = pd.counterpartyId ? cpMap.get(pd.counterpartyId) : undefined;
    return `      <Invoice>
        <InvoiceNo>${xmlEscape(pd.docNumber)}</InvoiceNo>
        <SupplierInfo>
          <SupplierID>${xmlEscape(pd.counterpartyId ?? '')}</SupplierID>
          <Name>${xmlEscape(cp?.name ?? '')}</Name>
        </SupplierInfo>
        <InvoiceDate>${pd.docDate.toISOString().slice(0, 10)}</InvoiceDate>
        <DocumentTotals>
          <GrossTotal>${pd.totalAmount}</GrossTotal>
        </DocumentTotals>
      </Invoice>`;
  })
  .join('\n')}
    </PurchaseInvoices>
    <Payments>
      <NumberOfEntries>${paymentDocs.length}</NumberOfEntries>
      <TotalDebit>${sumDocs(paymentDocs.filter((p) => p.docType === 'money_out'))}</TotalDebit>
      <TotalCredit>${sumDocs(paymentDocs.filter((p) => p.docType === 'money_in'))}</TotalCredit>
${paymentDocs
  .map(
    (pm) => `      <Payment>
        <PaymentRefNo>${xmlEscape(pm.docNumber)}</PaymentRefNo>
        <TransactionDate>${pm.docDate.toISOString().slice(0, 10)}</TransactionDate>
        <PaymentMethod>${pm.docType === 'money_in' ? 'INCOMING' : 'OUTGOING'}</PaymentMethod>
        <Description>${xmlEscape(pm.comment)}</Description>
        <DocumentTotals><GrossTotal>${pm.totalAmount}</GrossTotal></DocumentTotals>
      </Payment>`
  )
  .join('\n')}
    </Payments>
    <MovementOfGoods>
      <NumberOfMovementLines>${movementDocs.length}</NumberOfMovementLines>
${movementDocs
  .map(
    (mv) => `      <StockMovement>
        <MovementReference>${xmlEscape(mv.docNumber)}</MovementReference>
        <MovementDate>${mv.docDate.toISOString().slice(0, 10)}</MovementDate>
        <MovementType>${xmlEscape(mv.docType)}</MovementType>
        <DocumentTotals><GrossTotal>${mv.totalAmount}</GrossTotal></DocumentTotals>
      </StockMovement>`
  )
  .join('\n')}
    </MovementOfGoods>
  </SourceDocuments>
</AuditFile>`;

  return {
    filename: `SAF-T_UA_${org.edrpou || 'ORG'}_${fromStr}_${toStr}.xml`,
    xml,
    stats: {
      accountsCount: tb.rows.length,
      transactionsCount: entriesByDoc.size,
      entriesCount: entries.length,
      totalDebit: toNumeric2(totalGlDebit),
      totalCredit: toNumeric2(totalGlCredit),
      isBalanced: round2(totalGlDebit).eq(round2(totalGlCredit)) && tb.totals.isBalanced,
      salesInvoicesCount: salesDocs.length,
      purchaseInvoicesCount: purchaseDocs.length,
      paymentsCount: paymentDocs.length,
    },
  };
}

// ============================================================================
// ГЕНЕРАТОР ПОДАТКОВОЇ НАКЛАДНОЇ ДПС УКРАЇНИ (ЄРПН XML J1201015)
// ============================================================================

export async function generateTaxInvoiceXmlJ1201015(db: AppDb, documentId: string) {
  const [doc] = await db.select().from(documents).where(eq(documents.id, documentId));
  if (!doc) {
    throw new Error('Документ не знайдено');
  }

  const [[org], cpRows, lines, allItems] = await Promise.all([
    db.select().from(organizations).where(eq(organizations.id, doc.organizationId)),
    doc.counterpartyId
      ? db.select().from(counterparties).where(eq(counterparties.id, doc.counterpartyId))
      : Promise.resolve([]),
    db
      .select()
      .from(documentLines)
      .where(eq(documentLines.documentId, doc.id))
      .orderBy(asc(documentLines.lineNo)),
    db.select().from(items),
  ]);

  const cp = cpRows[0];
  const itemMap = new Map(allItems.map((i) => [i.id, i]));

  const rate = doc.vatRate ?? 20;
  const gross = round2(doc.totalAmount);
  const vat =
    d(doc.vatAmount).gt(0)
      ? round2(doc.vatAmount)
      : rate > 0
        ? round2(gross.mul(rate).div(100 + rate))
        : d(0);
  const net = round2(gross.minus(vat));

  const ddmmyyyy = (dt: Date) => {
    const dd = String(dt.getUTCDate()).padStart(2, '0');
    const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
    const yyyy = dt.getUTCFullYear();
    return `${dd}${mm}${yyyy}`;
  };

  const docDateStr = ddmmyyyy(doc.docDate);
  const sellerIpn = org.ipn || (org.edrpou ? `${org.edrpou}2650` : '412895426501');
  const buyerIpn = cp?.ipn || (cp?.edrpou ? `${cp.edrpou}2650` : '100000000000');

  const linesXml = lines
    .map((ln, idx) => {
      const it = ln.itemId ? itemMap.get(ln.itemId) : undefined;
      const rowNum = idx + 1;
      const lineGross = round2(ln.amount);
      const lineNet = rate > 0 ? round2(lineGross.mul(100).div(100 + rate)) : lineGross;
      const unitNet = d(ln.qty).gt(0) ? round2(lineNet.div(d(ln.qty))) : d(ln.price);
      return `    <RXXXXG3S ROWNUM="${rowNum}">${xmlEscape(it?.name ?? ln.notes ?? 'Товар/Послуга')}</RXXXXG3S>
    <RXXXXG4S ROWNUM="${rowNum}">${xmlEscape(it?.unit ?? 'шт')}</RXXXXG4S>
    <RXXXXG5 ROWNUM="${rowNum}">${toNumeric4(ln.qty)}</RXXXXG5>
    <RXXXXG6 ROWNUM="${rowNum}">${toNumeric2(unitNet)}</RXXXXG6>
    <RXXXXG7 ROWNUM="${rowNum}">${rate}</RXXXXG7>
    <RXXXXG10 ROWNUM="${rowNum}">${toNumeric2(lineNet)}</RXXXXG10>`;
    })
    .join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<DECLAR xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="J1201015.xsd">
  <DECLARHEAD>
    <TIN>${xmlEscape(org.edrpou || '00000000')}</TIN>
    <C_DOC>J12</C_DOC>
    <C_DOC_SUB>010</C_DOC_SUB>
    <C_DOC_VER>15</C_DOC_VER>
    <C_DOC_TYPE>0</C_DOC_TYPE>
    <C_DOC_CNT>1</C_DOC_CNT>
    <PERIOD_MONTH>${doc.docDate.getUTCMonth() + 1}</PERIOD_MONTH>
    <PERIOD_TYPE>1</PERIOD_TYPE>
    <PERIOD_YEAR>${doc.docDate.getUTCFullYear()}</PERIOD_YEAR>
    <D_FILL>${docDateStr}</D_FILL>
    <SOFTWARE>ОблікFlow ERP v3</SOFTWARE>
  </DECLARHEAD>
  <DECLARBODY>
    <HFILL>${docDateStr}</HFILL>
    <HNUM>${xmlEscape(doc.docNumber.replace(/[^0-9]/g, '') || '1')}</HNUM>
    <HNAMESEL>${xmlEscape(org.name)}</HNAMESEL>
    <HKSEL>${xmlEscape(sellerIpn)}</HKSEL>
    <HTINSEL>${xmlEscape(org.edrpou)}</HTINSEL>
    <HNAMEBUY>${xmlEscape(cp?.name ?? 'Неплатник ПДВ')}</HNAMEBUY>
    <HKBUY>${xmlEscape(buyerIpn)}</HKBUY>
    <HTINBUY>${xmlEscape(cp?.edrpou ?? '')}</HTINBUY>
${linesXml}
    <R01G7>${toNumeric2(net)}</R01G7>
    <R03G7>${toNumeric2(vat)}</R03G7>
    <R04G7>${toNumeric2(gross)}</R04G7>
  </DECLARBODY>
</DECLAR>`;

  return {
    filename: `J1201015_${org.edrpou || 'ORG'}_${doc.docNumber}.xml`,
    xml,
    netAmount: toNumeric2(net),
    vatAmount: toNumeric2(vat),
    grossAmount: toNumeric2(gross),
    vatRate: rate,
  };
}
