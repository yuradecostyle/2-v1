import { and, asc, desc, eq, gte, inArray, lt, lte, sql } from 'drizzle-orm';
import type { AppDb } from './db.js';
import {
  cashAccounts,
  cashflowCategories,
  counterparties,
  departments,
  documents,
  items,
  regCashMovements,
  regCostBatches,
  regItemPrices,
  regPnlTurnover,
  regSettlements,
  regStockMovements,
  regStockReservations,
  regStockTotalsMonthly,
  warehouses,
  documentLines,
  type DocumentType,
} from './schema.js';
import { d, monthStartUtc, round2, round4, toIsoDate, toNumeric2, toNumeric4 } from './money.js';

// ============================================================================
// 1. ВІРТУАЛЬНА ТАБЛИЦЯ: ЗАЛИШКИ ТОВАРІВ НА СКЛАДАХ (використовує місячні підсумки!)
// ============================================================================

export interface StockBalanceRow {
  warehouseId: string;
  warehouseName: string;
  itemId: string;
  itemSku: string;
  itemName: string;
  unit: string;
  qty: string;
  reservedQty: string;
  freeQty: string;
  costAmount: string;
  avgCost: string;
}

export async function getStockBalances(
  db: AppDb,
  params: { organizationId: string; asOfDate: Date | string; warehouseId?: string }
): Promise<{
  asOfDate: string;
  rows: StockBalanceRow[];
  totalQty: string;
  totalReservedQty: string;
  totalFreeQty: string;
  totalCost: string;
}> {
  const asOf = toIsoDate(params.asOfDate);
  const mStart = monthStartUtc(asOf);

  // 1) Агрегуємо готові місячні підсумки за всі попередні місяці (< mStart)
  const monthlyConds = [
    eq(regStockTotalsMonthly.organizationId, params.organizationId),
    lt(regStockTotalsMonthly.monthStart, mStart),
  ];
  if (params.warehouseId) {
    monthlyConds.push(eq(regStockTotalsMonthly.warehouseId, params.warehouseId));
  }

  const priorTotals = await db
    .select({
      warehouseId: regStockTotalsMonthly.warehouseId,
      itemId: regStockTotalsMonthly.itemId,
      qty: sql<string>`SUM(${regStockTotalsMonthly.qtyDelta})`,
    })
    .from(regStockTotalsMonthly)
    .where(and(...monthlyConds))
    .groupBy(regStockTotalsMonthly.warehouseId, regStockTotalsMonthly.itemId);

  // 2) Додаємо дельту рухів лише за поточний місяць [mStart .. asOf]
  const movConds = [
    eq(regStockMovements.organizationId, params.organizationId),
    gte(regStockMovements.period, mStart),
    lte(regStockMovements.period, asOf),
  ];
  if (params.warehouseId) {
    movConds.push(eq(regStockMovements.warehouseId, params.warehouseId));
  }

  const monthMovements = await db
    .select({
      warehouseId: regStockMovements.warehouseId,
      itemId: regStockMovements.itemId,
      qty: sql<string>`SUM(${regStockMovements.qty})`,
    })
    .from(regStockMovements)
    .where(and(...movConds))
    .groupBy(regStockMovements.warehouseId, regStockMovements.itemId);

  // 3) Вартість залишків із регістру партій <= asOf + Резерви <= asOf
  const batchConds = [
    eq(regCostBatches.organizationId, params.organizationId),
    lte(regCostBatches.period, asOf),
  ];
  const resConds = [
    eq(regStockReservations.organizationId, params.organizationId),
    lte(regStockReservations.period, asOf),
  ];
  if (params.warehouseId) {
    batchConds.push(eq(regCostBatches.warehouseId, params.warehouseId));
    resConds.push(eq(regStockReservations.warehouseId, params.warehouseId));
  }

  const [batchCosts, resRows] = await Promise.all([
    db
      .select({
        warehouseId: regCostBatches.warehouseId,
        itemId: regCostBatches.itemId,
        cost: sql<string>`SUM(${regCostBatches.costAmount})`,
      })
      .from(regCostBatches)
      .where(and(...batchConds))
      .groupBy(regCostBatches.warehouseId, regCostBatches.itemId),
    db
      .select({
        warehouseId: regStockReservations.warehouseId,
        itemId: regStockReservations.itemId,
        qty: sql<string>`SUM(${regStockReservations.qty})`,
      })
      .from(regStockReservations)
      .where(and(...resConds))
      .groupBy(regStockReservations.warehouseId, regStockReservations.itemId),
  ]);

  const qtyMap = new Map<string, ReturnType<typeof d>>();
  for (const r of priorTotals) {
    const k = `${r.warehouseId}|${r.itemId}`;
    qtyMap.set(k, (qtyMap.get(k) ?? d(0)).plus(d(r.qty)));
  }
  for (const r of monthMovements) {
    const k = `${r.warehouseId}|${r.itemId}`;
    qtyMap.set(k, (qtyMap.get(k) ?? d(0)).plus(d(r.qty)));
  }

  const costMap = new Map<string, ReturnType<typeof d>>();
  for (const r of batchCosts) {
    costMap.set(`${r.warehouseId}|${r.itemId}`, d(r.cost));
  }

  const resMap = new Map<string, ReturnType<typeof d>>();
  for (const r of resRows) {
    const q = d(r.qty);
    if (q.gt(0)) {
      resMap.set(`${r.warehouseId}|${r.itemId}`, q);
    }
  }

  const [allWh, allItems] = await Promise.all([
    db.select().from(warehouses).where(eq(warehouses.organizationId, params.organizationId)),
    db.select().from(items),
  ]);
  const whMap = new Map(allWh.map((w) => [w.id, w]));
  const itemMap = new Map(allItems.map((i) => [i.id, i]));

  const rows: StockBalanceRow[] = [];
  let totalQty = d(0);
  let totalReserved = d(0);
  let totalFree = d(0);
  let totalCost = d(0);

  for (const [key, qty] of qtyMap.entries()) {
    const reserved = resMap.get(key) ?? d(0);
    if (qty.eq(0) && reserved.eq(0)) continue;
    const [warehouseId, itemId] = key.split('|');
    const free = qty.minus(reserved);
    const cost = costMap.get(key) ?? d(0);
    const avgCost = qty.gt(0) ? round2(cost.div(qty)) : d(0);
    const wh = whMap.get(warehouseId);
    const item = itemMap.get(itemId);

    totalQty = totalQty.plus(qty);
    totalReserved = totalReserved.plus(reserved);
    totalFree = totalFree.plus(free);
    totalCost = totalCost.plus(cost);

    rows.push({
      warehouseId,
      warehouseName: wh?.name ?? warehouseId,
      itemId,
      itemSku: item?.sku ?? '',
      itemName: item?.name ?? itemId,
      unit: item?.unit ?? 'шт',
      qty: toNumeric4(qty),
      reservedQty: toNumeric4(reserved),
      freeQty: toNumeric4(free),
      costAmount: toNumeric2(cost),
      avgCost: toNumeric2(avgCost),
    });
  }

  rows.sort((a, b) =>
    `${a.warehouseName}|${a.itemName}`.localeCompare(`${b.warehouseName}|${b.itemName}`, 'uk')
  );

  return {
    asOfDate: asOf.toISOString(),
    rows,
    totalQty: toNumeric4(totalQty),
    totalReservedQty: toNumeric4(totalReserved),
    totalFreeQty: toNumeric4(totalFree),
    totalCost: toNumeric2(totalCost),
  };
}

export async function getActiveCustomerOrders(db: AppDb, organizationId: string) {
  const [orders, resRows, allCp, allWh, allLines] = await Promise.all([
    db
      .select()
      .from(documents)
      .where(
        and(
          eq(documents.organizationId, organizationId),
          eq(documents.docType, 'customer_order'),
          eq(documents.status, 'POSTED')
        )
      )
      .orderBy(desc(documents.docDate)),
    db
      .select({
        orderDocId: regStockReservations.orderDocId,
        remQty: sql<string>`SUM(${regStockReservations.qty})`,
      })
      .from(regStockReservations)
      .where(eq(regStockReservations.organizationId, organizationId))
      .groupBy(regStockReservations.orderDocId),
    db.select().from(counterparties),
    db.select().from(warehouses),
    db.select().from(documentLines),
  ]);

  const remMap = new Map(resRows.map((r) => [r.orderDocId, d(r.remQty)]));
  const cpMap = new Map(allCp.map((c) => [c.id, c.name]));
  const whMap = new Map(allWh.map((w) => [w.id, w.name]));
  const linesMap = new Map<string, typeof allLines>();
  for (const l of allLines) {
    const arr = linesMap.get(l.documentId) ?? [];
    arr.push(l);
    linesMap.set(l.documentId, arr);
  }

  return orders.map((o) => {
    const rem = remMap.get(o.id) ?? d(0);
    return {
      ...o,
      counterpartyName: o.counterpartyId ? (cpMap.get(o.counterpartyId) ?? '') : '',
      warehouseName: o.warehouseId ? (whMap.get(o.warehouseId) ?? '') : '',
      remainingReservedQty: toNumeric4(rem.gt(0) ? rem : d(0)),
      isFulfilled: rem.lte(0),
      lines: linesMap.get(o.id) ?? [],
    };
  });
}

// ============================================================================
// 2. ВІДОМІСТЬ ПО ТОВАРАХ НА СКЛАДАХ (ПОЧАТКОВИЙ / ПРИХІД / ВИТРАТА / КІНЦЕВИЙ)
// ============================================================================

export interface StockTurnoverRow {
  warehouseId: string;
  warehouseName: string;
  itemId: string;
  itemSku: string;
  itemName: string;
  unit: string;
  openingQty: string;
  inQty: string;
  outQty: string;
  closingQty: string;
}

export async function getStockTurnover(
  db: AppDb,
  params: { organizationId: string; dateFrom: Date | string; dateTo: Date | string; warehouseId?: string }
): Promise<{ rows: StockTurnoverRow[] }> {
  const from = toIsoDate(params.dateFrom);
  const to = toIsoDate(params.dateTo);

  const openingConds = [
    eq(regStockMovements.organizationId, params.organizationId),
    lt(regStockMovements.period, from),
  ];
  const periodConds = [
    eq(regStockMovements.organizationId, params.organizationId),
    gte(regStockMovements.period, from),
    lte(regStockMovements.period, to),
  ];

  if (params.warehouseId) {
    openingConds.push(eq(regStockMovements.warehouseId, params.warehouseId));
    periodConds.push(eq(regStockMovements.warehouseId, params.warehouseId));
  }

  const [openingRows, periodRows, allWh, allItems] = await Promise.all([
    db
      .select({
        warehouseId: regStockMovements.warehouseId,
        itemId: regStockMovements.itemId,
        qty: sql<string>`SUM(${regStockMovements.qty})`,
      })
      .from(regStockMovements)
      .where(and(...openingConds))
      .groupBy(regStockMovements.warehouseId, regStockMovements.itemId),
    db
      .select({
        warehouseId: regStockMovements.warehouseId,
        itemId: regStockMovements.itemId,
        inQty: sql<string>`SUM(CASE WHEN ${regStockMovements.qty} > 0 THEN ${regStockMovements.qty} ELSE 0 END)`,
        outQty: sql<string>`SUM(CASE WHEN ${regStockMovements.qty} < 0 THEN -${regStockMovements.qty} ELSE 0 END)`,
      })
      .from(regStockMovements)
      .where(and(...periodConds))
      .groupBy(regStockMovements.warehouseId, regStockMovements.itemId),
    db.select().from(warehouses).where(eq(warehouses.organizationId, params.organizationId)),
    db.select().from(items),
  ]);

  const whMap = new Map(allWh.map((w) => [w.id, w]));
  const itemMap = new Map(allItems.map((i) => [i.id, i]));

  const keys = new Set<string>();
  const openMap = new Map<string, ReturnType<typeof d>>();
  const inMap = new Map<string, ReturnType<typeof d>>();
  const outMap = new Map<string, ReturnType<typeof d>>();

  for (const r of openingRows) {
    const k = `${r.warehouseId}|${r.itemId}`;
    keys.add(k);
    openMap.set(k, d(r.qty));
  }
  for (const r of periodRows) {
    const k = `${r.warehouseId}|${r.itemId}`;
    keys.add(k);
    inMap.set(k, d(r.inQty));
    outMap.set(k, d(r.outQty));
  }

  const rows: StockTurnoverRow[] = [];
  for (const k of keys) {
    const [warehouseId, itemId] = k.split('|');
    const opening = openMap.get(k) ?? d(0);
    const inQ = inMap.get(k) ?? d(0);
    const outQ = outMap.get(k) ?? d(0);
    const closing = opening.plus(inQ).minus(outQ);

    if (opening.eq(0) && inQ.eq(0) && outQ.eq(0) && closing.eq(0)) continue;

    const wh = whMap.get(warehouseId);
    const item = itemMap.get(itemId);
    rows.push({
      warehouseId,
      warehouseName: wh?.name ?? warehouseId,
      itemId,
      itemSku: item?.sku ?? '',
      itemName: item?.name ?? itemId,
      unit: item?.unit ?? 'шт',
      openingQty: toNumeric4(opening),
      inQty: toNumeric4(inQ),
      outQty: toNumeric4(outQ),
      closingQty: toNumeric4(closing),
    });
  }

  rows.sort((a, b) =>
    `${a.warehouseName}|${a.itemName}`.localeCompare(`${b.warehouseName}|${b.itemName}`, 'uk')
  );

  return { rows };
}

// ============================================================================
// 3. ВАЛОВИЙ ПРИБУТОК (ПРОДАЖІ ТА РЕНТАБЕЛЬНІСТЬ)
// ============================================================================

export interface GrossProfitRow {
  groupId: string;
  groupName: string;
  groupCode: string;
  qty: string;
  revenue: string;
  cogs: string;
  profit: string;
  marginPercent: string;
}

export async function getGrossProfit(
  db: AppDb,
  params: {
    organizationId: string;
    dateFrom: Date | string;
    dateTo: Date | string;
    groupBy?: 'item' | 'counterparty' | 'warehouse';
  }
): Promise<{
  groupBy: string;
  rows: GrossProfitRow[];
  totals: { qty: string; revenue: string; cogs: string; profit: string; marginPercent: string };
}> {
  const from = toIsoDate(params.dateFrom);
  const to = toIsoDate(params.dateTo);
  const groupBy = params.groupBy ?? 'item';

  const [sales, allItems, allCp, allWh] = await Promise.all([
    db
      .select()
      .from(regPnlTurnover)
      .where(
        and(
          eq(regPnlTurnover.organizationId, params.organizationId),
          eq(regPnlTurnover.pnlType, 'SALE'),
          gte(regPnlTurnover.period, from),
          lte(regPnlTurnover.period, to)
        )
      ),
    db.select().from(items),
    db.select().from(counterparties),
    db.select().from(warehouses),
  ]);

  const itemMap = new Map(allItems.map((i) => [i.id, i]));
  const cpMap = new Map(allCp.map((c) => [c.id, c]));
  const whMap = new Map(allWh.map((w) => [w.id, w]));

  const agg = new Map<
    string,
    {
      groupName: string;
      groupCode: string;
      qty: ReturnType<typeof d>;
      revenue: ReturnType<typeof d>;
      cogs: ReturnType<typeof d>;
      profit: ReturnType<typeof d>;
    }
  >();

  for (const s of sales) {
    let groupId = 'unknown';
    let groupName = 'Не вказано';
    let groupCode = '';

    if (groupBy === 'item') {
      groupId = s.itemId ?? 'unknown';
      const it = s.itemId ? itemMap.get(s.itemId) : undefined;
      groupName = it?.name ?? 'Без номенклатури';
      groupCode = it?.sku ?? '';
    } else if (groupBy === 'counterparty') {
      groupId = s.counterpartyId ?? 'unknown';
      const cp = s.counterpartyId ? cpMap.get(s.counterpartyId) : undefined;
      groupName = cp?.name ?? 'Без контрагента';
      groupCode = cp?.edrpou ?? '';
    } else {
      groupId = s.warehouseId ?? 'unknown';
      const wh = s.warehouseId ? whMap.get(s.warehouseId) : undefined;
      groupName = wh?.name ?? 'Без складу';
      groupCode = wh?.code ?? '';
    }

    const cur = agg.get(groupId) ?? {
      groupName,
      groupCode,
      qty: d(0),
      revenue: d(0),
      cogs: d(0),
      profit: d(0),
    };
    cur.qty = cur.qty.plus(d(s.qty));
    cur.revenue = cur.revenue.plus(d(s.revenue));
    cur.cogs = cur.cogs.plus(d(s.cogs));
    cur.profit = cur.profit.plus(d(s.profit));
    agg.set(groupId, cur);
  }

  let totQty = d(0);
  let totRev = d(0);
  let totCogs = d(0);
  let totProfit = d(0);

  const rows: GrossProfitRow[] = [];
  for (const [groupId, v] of agg.entries()) {
    totQty = totQty.plus(v.qty);
    totRev = totRev.plus(v.revenue);
    totCogs = totCogs.plus(v.cogs);
    totProfit = totProfit.plus(v.profit);
    const margin = v.revenue.gt(0) ? round2(v.profit.div(v.revenue).mul(100)) : d(0);
    rows.push({
      groupId,
      groupName: v.groupName,
      groupCode: v.groupCode,
      qty: toNumeric4(v.qty),
      revenue: toNumeric2(v.revenue),
      cogs: toNumeric2(v.cogs),
      profit: toNumeric2(v.profit),
      marginPercent: toNumeric2(margin),
    });
  }

  rows.sort((a, b) => d(b.profit).comparedTo(d(a.profit)));
  const totalMargin = totRev.gt(0) ? round2(totProfit.div(totRev).mul(100)) : d(0);

  return {
    groupBy,
    rows,
    totals: {
      qty: toNumeric4(totQty),
      revenue: toNumeric2(totRev),
      cogs: toNumeric2(totCogs),
      profit: toNumeric2(totProfit),
      marginPercent: toNumeric2(totalMargin),
    },
  };
}

// ============================================================================
// 4. ВЗАЄМОРОЗРАХУНКИ З КОНТРАГЕНТАМИ + АКТ ЗВІРКИ
// ============================================================================

export interface SettlementRow {
  counterpartyId: string;
  counterpartyName: string;
  edrpou: string;
  balance: string; // + нам винні (дебіторка), - ми винні (кредиторка)
  receivable: string;
  payable: string;
}

export async function getSettlements(
  db: AppDb,
  params: { organizationId: string; asOfDate: Date | string }
): Promise<{
  asOfDate: string;
  rows: SettlementRow[];
  totalReceivable: string;
  totalPayable: string;
  netBalance: string;
}> {
  const asOf = toIsoDate(params.asOfDate);

  const [grouped, allCp] = await Promise.all([
    db
      .select({
        counterpartyId: regSettlements.counterpartyId,
        balance: sql<string>`SUM(${regSettlements.amount})`,
      })
      .from(regSettlements)
      .where(
        and(
          eq(regSettlements.organizationId, params.organizationId),
          lte(regSettlements.period, asOf)
        )
      )
      .groupBy(regSettlements.counterpartyId),
    db.select().from(counterparties),
  ]);

  const cpMap = new Map(allCp.map((c) => [c.id, c]));
  let totalReceivable = d(0);
  let totalPayable = d(0);

  const rows: SettlementRow[] = [];
  for (const r of grouped) {
    const bal = round2(r.balance);
    if (bal.eq(0)) continue;
    const rec = bal.gt(0) ? bal : d(0);
    const pay = bal.lt(0) ? bal.abs() : d(0);
    totalReceivable = totalReceivable.plus(rec);
    totalPayable = totalPayable.plus(pay);

    const cp = cpMap.get(r.counterpartyId);
    rows.push({
      counterpartyId: r.counterpartyId,
      counterpartyName: cp?.name ?? r.counterpartyId,
      edrpou: cp?.edrpou ?? '',
      balance: toNumeric2(bal),
      receivable: toNumeric2(rec),
      payable: toNumeric2(pay),
    });
  }

  rows.sort((a, b) => d(b.balance).abs().comparedTo(d(a.balance).abs()));

  return {
    asOfDate: asOf.toISOString(),
    rows,
    totalReceivable: toNumeric2(totalReceivable),
    totalPayable: toNumeric2(totalPayable),
    netBalance: toNumeric2(totalReceivable.minus(totalPayable)),
  };
}

export async function getCounterpartyCard(
  db: AppDb,
  params: {
    organizationId: string;
    counterpartyId: string;
    dateFrom: Date | string;
    dateTo: Date | string;
  }
) {
  const from = toIsoDate(params.dateFrom);
  const to = toIsoDate(params.dateTo);

  const [openingRow] = await db
    .select({
      bal: sql<string>`COALESCE(SUM(${regSettlements.amount}), 0)`,
    })
    .from(regSettlements)
    .where(
      and(
        eq(regSettlements.organizationId, params.organizationId),
        eq(regSettlements.counterpartyId, params.counterpartyId),
        lt(regSettlements.period, from)
      )
    );

  const movs = await db
    .select({
      id: regSettlements.id,
      period: regSettlements.period,
      recorderId: regSettlements.recorderId,
      recorderType: regSettlements.recorderType,
      amount: regSettlements.amount,
      docNumber: documents.docNumber,
      comment: documents.comment,
    })
    .from(regSettlements)
    .leftJoin(documents, eq(regSettlements.recorderId, documents.id))
    .where(
      and(
        eq(regSettlements.organizationId, params.organizationId),
        eq(regSettlements.counterpartyId, params.counterpartyId),
        gte(regSettlements.period, from),
        lte(regSettlements.period, to)
      )
    )
    .orderBy(asc(regSettlements.period), asc(regSettlements.id));

  let running = round2(openingRow?.bal ?? 0);
  const openingBalance = toNumeric2(running);

  const entries = movs.map((m) => {
    const amt = round2(m.amount);
    running = running.plus(amt);
    return {
      id: m.id,
      date: m.period.toISOString(),
      documentId: m.recorderId,
      docType: m.recorderType,
      docNumber: m.docNumber ?? '',
      comment: m.comment ?? '',
      debit: amt.gt(0) ? toNumeric2(amt) : '0.00',
      credit: amt.lt(0) ? toNumeric2(amt.abs()) : '0.00',
      runningBalance: toNumeric2(running),
    };
  });

  return {
    openingBalance,
    closingBalance: toNumeric2(running),
    entries,
  };
}

// ============================================================================
// 5. РУХ ГРОШОВИХ КОШТІВ (CASH FLOW) ТА P&L
// ============================================================================

export async function getCashFlowAndPnl(
  db: AppDb,
  params: { organizationId: string; dateFrom: Date | string; dateTo: Date | string }
) {
  const from = toIsoDate(params.dateFrom);
  const to = toIsoDate(params.dateTo);

  const [accounts, cfCats, openCash, periodCash, pnlRows] = await Promise.all([
    db.select().from(cashAccounts).where(eq(cashAccounts.organizationId, params.organizationId)),
    db.select().from(cashflowCategories),
    db
      .select({
        cashAccountId: regCashMovements.cashAccountId,
        bal: sql<string>`SUM(${regCashMovements.amount})`,
      })
      .from(regCashMovements)
      .where(
        and(
          eq(regCashMovements.organizationId, params.organizationId),
          lt(regCashMovements.period, from)
        )
      )
      .groupBy(regCashMovements.cashAccountId),
    db
      .select()
      .from(regCashMovements)
      .where(
        and(
          eq(regCashMovements.organizationId, params.organizationId),
          gte(regCashMovements.period, from),
          lte(regCashMovements.period, to)
        )
      ),
    db
      .select()
      .from(regPnlTurnover)
      .where(
        and(
          eq(regPnlTurnover.organizationId, params.organizationId),
          gte(regPnlTurnover.period, from),
          lte(regPnlTurnover.period, to)
        )
      ),
  ]);

  const openMap = new Map(openCash.map((r) => [r.cashAccountId, d(r.bal)]));
  const cfCatMap = new Map(cfCats.map((c) => [c.id, c]));

  const inByAcc = new Map<string, ReturnType<typeof d>>();
  const outByAcc = new Map<string, ReturnType<typeof d>>();
  const byCategory = new Map<
    string,
    { categoryName: string; direction: string; amount: ReturnType<typeof d> }
  >();

  for (const m of periodCash) {
    const amt = d(m.amount);
    if (amt.gt(0)) {
      inByAcc.set(m.cashAccountId, (inByAcc.get(m.cashAccountId) ?? d(0)).plus(amt));
    } else if (amt.lt(0)) {
      outByAcc.set(m.cashAccountId, (outByAcc.get(m.cashAccountId) ?? d(0)).plus(amt.abs()));
    }

    const catKey = m.cashflowCategoryId ?? 'uncategorized';
    const cat = m.cashflowCategoryId ? cfCatMap.get(m.cashflowCategoryId) : undefined;
    const cur = byCategory.get(catKey) ?? {
      categoryName: cat?.name ?? 'Без статті РГК',
      direction: amt.gte(0) ? 'IN' : 'OUT',
      amount: d(0),
    };
    cur.amount = cur.amount.plus(amt);
    byCategory.set(catKey, cur);
  }

  let totalClosingCash = d(0);
  const cashByAccount = accounts.map((acc) => {
    const opening = openMap.get(acc.id) ?? d(0);
    const inflow = inByAcc.get(acc.id) ?? d(0);
    const outflow = outByAcc.get(acc.id) ?? d(0);
    const closing = opening.plus(inflow).minus(outflow);
    totalClosingCash = totalClosingCash.plus(closing);
    return {
      cashAccountId: acc.id,
      name: acc.name,
      accountType: acc.accountType,
      currency: acc.currency,
      opening: toNumeric2(opening),
      inflow: toNumeric2(inflow),
      outflow: toNumeric2(outflow),
      closing: toNumeric2(closing),
    };
  });

  // P&L summary
  let revenue = d(0);
  let otherIncome = d(0);
  let cogs = d(0);
  let operatingExpenses = d(0);
  const expensesByCategory = new Map<string, { categoryName: string; amount: ReturnType<typeof d> }>();

  for (const p of pnlRows) {
    if (p.pnlType === 'SALE') {
      revenue = revenue.plus(d(p.revenue));
      cogs = cogs.plus(d(p.cogs));
    } else if (p.pnlType === 'OTHER_INCOME') {
      otherIncome = otherIncome.plus(d(p.revenue));
    } else if (p.pnlType === 'EXPENSE') {
      const exp = d(p.expense);
      operatingExpenses = operatingExpenses.plus(exp);
      const catKey = p.cashflowCategoryId ?? 'other_expense';
      const cat = p.cashflowCategoryId ? cfCatMap.get(p.cashflowCategoryId) : undefined;
      const cur = expensesByCategory.get(catKey) ?? {
        categoryName: cat?.name ?? 'Інші витрати',
        amount: d(0),
      };
      cur.amount = cur.amount.plus(exp);
      expensesByCategory.set(catKey, cur);
    }
  }

  const grossProfit = revenue.minus(cogs);
  const netProfit = grossProfit.plus(otherIncome).minus(operatingExpenses);

  return {
    cashByAccount,
    totalClosingCash: toNumeric2(totalClosingCash),
    cashflowByCategory: Array.from(byCategory.entries()).map(([id, v]) => ({
      categoryId: id,
      categoryName: v.categoryName,
      direction: v.direction,
      amount: toNumeric2(v.amount),
    })),
    pnl: {
      revenue: toNumeric2(revenue),
      cogs: toNumeric2(cogs),
      grossProfit: toNumeric2(grossProfit),
      otherIncome: toNumeric2(otherIncome),
      operatingExpenses: toNumeric2(operatingExpenses),
      netProfit: toNumeric2(netProfit),
      grossMarginPercent: revenue.gt(0) ? toNumeric2(grossProfit.div(revenue).mul(100)) : '0.00',
      netMarginPercent: revenue.gt(0) ? toNumeric2(netProfit.div(revenue).mul(100)) : '0.00',
      expensesByCategory: Array.from(expensesByCategory.entries()).map(([id, v]) => ({
        categoryId: id,
        categoryName: v.categoryName,
        amount: toNumeric2(v.amount),
      })),
    },
  };
}

// ============================================================================
// 6. ПЕРІОДИЧНИЙ РЕГІСТР ВІДОМОСТЕЙ: ЗРІЗ ОСТАННІХ ЦІН НА ДАТУ
// ============================================================================

export async function getLatestItemPrice(
  db: AppDb,
  params: { itemId: string; priceTypeId: string; asOfDate: Date | string }
): Promise<{ price: string; effectiveAt: string } | null> {
  const asOf = toIsoDate(params.asOfDate);
  const [row] = await db
    .select()
    .from(regItemPrices)
    .where(
      and(
        eq(regItemPrices.itemId, params.itemId),
        eq(regItemPrices.priceTypeId, params.priceTypeId),
        lte(regItemPrices.effectiveAt, asOf)
      )
    )
    .orderBy(desc(regItemPrices.effectiveAt))
    .limit(1);

  if (!row) return null;
  return {
    price: row.price,
    effectiveAt: row.effectiveAt.toISOString(),
  };
}

export async function getLatestPricesBulk(
  db: AppDb,
  params: { priceTypeId: string; asOfDate: Date | string }
): Promise<Record<string, string>> {
  const asOf = toIsoDate(params.asOfDate);
  const rows = await db
    .select()
    .from(regItemPrices)
    .where(and(eq(regItemPrices.priceTypeId, params.priceTypeId), lte(regItemPrices.effectiveAt, asOf)))
    .orderBy(desc(regItemPrices.effectiveAt));

  const result: Record<string, string> = {};
  for (const r of rows) {
    if (!(r.itemId in result)) {
      result[r.itemId] = r.price;
    }
  }
  return result;
}

// ============================================================================
// 7. ДАШБОРД KPI
// ============================================================================

export async function getDashboardSummary(
  db: AppDb,
  params: {
    organizationId: string;
    dateFrom: Date | string;
    dateTo: Date | string;
    departmentIds?: string[] | null;
    allowedDocTypes?: DocumentType[] | null;
  }
) {
  const from = toIsoDate(params.dateFrom);
  const to = toIsoDate(params.dateTo);
  const hasDeptFilter = Array.isArray(params.departmentIds);
  const deptIdSet = hasDeptFilter ? new Set(params.departmentIds!) : null;

  const [stock, settlements, cfPnl, orgDocs, orgDepts, orgWhs, orgCashAccs] = await Promise.all([
    getStockBalances(db, { organizationId: params.organizationId, asOfDate: to }),
    getSettlements(db, { organizationId: params.organizationId, asOfDate: to }),
    getCashFlowAndPnl(db, params),
    db
      .select()
      .from(documents)
      .where(eq(documents.organizationId, params.organizationId))
      .orderBy(desc(documents.docDate), desc(documents.createdAt)),
    db
      .select()
      .from(departments)
      .where(eq(departments.organizationId, params.organizationId)),
    db
      .select()
      .from(warehouses)
      .where(eq(warehouses.organizationId, params.organizationId)),
    db
      .select()
      .from(cashAccounts)
      .where(eq(cashAccounts.organizationId, params.organizationId)),
  ]);

  const deptNameMap = new Map(orgDepts.map((dp) => [dp.id, dp.name]));
  const allowedTypeSet = params.allowedDocTypes ? new Set(params.allowedDocTypes) : null;

  const deptFilteredDocs = hasDeptFilter
    ? orgDocs.filter((doc) => doc.departmentId !== null && deptIdSet!.has(doc.departmentId))
    : orgDocs;

  const recentDocs = deptFilteredDocs
    .filter((doc) => (!allowedTypeSet ? true : allowedTypeSet.has(doc.docType)))
    .slice(0, 8)
    .map((doc) => ({
      ...doc,
      departmentName: doc.departmentId ? (deptNameMap.get(doc.departmentId) ?? '') : '',
    }));

  if (!hasDeptFilter) {
    return {
      kpis: {
        revenue: cfPnl.pnl.revenue,
        grossProfit: cfPnl.pnl.grossProfit,
        netProfit: cfPnl.pnl.netProfit,
        grossMarginPercent: cfPnl.pnl.grossMarginPercent,
        cashBalance: cfPnl.totalClosingCash,
        inventoryValue: stock.totalCost,
        inventoryQty: round4(stock.totalQty).toFixed(2),
        reservedQty: round4(stock.totalReservedQty).toFixed(2),
        receivables: settlements.totalReceivable,
        payables: settlements.totalPayable,
      },
      cashByAccount: cfPnl.cashByAccount,
      recentDocuments: recentDocs,
    };
  }

  // Підроздільний зріз показників KPI
  const deptDocIds = deptFilteredDocs.map((doc) => doc.id);

  // 1. P&L (Виручка, собівартість, прибуток) по документах обраного підрозділу(ів)
  let revenue = d(0);
  let otherIncome = d(0);
  let cogs = d(0);
  let operatingExpenses = d(0);

  if (deptDocIds.length > 0) {
    const pnlRows = await db
      .select()
      .from(regPnlTurnover)
      .where(
        and(
          eq(regPnlTurnover.organizationId, params.organizationId),
          gte(regPnlTurnover.period, from),
          lte(regPnlTurnover.period, to),
          inArray(regPnlTurnover.recorderId, deptDocIds)
        )
      );
    for (const p of pnlRows) {
      if (p.pnlType === 'SALE') {
        revenue = revenue.plus(d(p.revenue));
        cogs = cogs.plus(d(p.cogs));
      } else if (p.pnlType === 'OTHER_INCOME') {
        otherIncome = otherIncome.plus(d(p.revenue));
      } else if (p.pnlType === 'EXPENSE') {
        operatingExpenses = operatingExpenses.plus(d(p.expense));
      }
    }
  }
  const grossProfit = revenue.minus(cogs);
  const netProfit = grossProfit.plus(otherIncome).minus(operatingExpenses);
  const grossMarginPercent = revenue.gt(0)
    ? toNumeric2(grossProfit.div(revenue).mul(100))
    : '0.00';

  // 2. Взаєморозрахунки (Дебіторка / Кредиторка) по документах підрозділу(ів)
  let totalReceivable = d(0);
  let totalPayable = d(0);
  if (deptDocIds.length > 0) {
    const settleRows = await db
      .select({
        counterpartyId: regSettlements.counterpartyId,
        bal: sql<string>`SUM(${regSettlements.amount})`,
      })
      .from(regSettlements)
      .where(
        and(
          eq(regSettlements.organizationId, params.organizationId),
          lte(regSettlements.period, to),
          inArray(regSettlements.recorderId, deptDocIds)
        )
      )
      .groupBy(regSettlements.counterpartyId);
    for (const r of settleRows) {
      const bal = round2(r.bal);
      if (bal.gt(0)) totalReceivable = totalReceivable.plus(bal);
      if (bal.lt(0)) totalPayable = totalPayable.plus(bal.abs());
    }
  }

  // 3. Каси та рахунки, прив'язані до обраного підрозділу(ів)
  const deptAccIds = new Set(
    orgCashAccs
      .filter((a) => a.departmentId !== null && deptIdSet!.has(a.departmentId))
      .map((a) => a.id)
  );
  const scopedCashByAccount = cfPnl.cashByAccount.filter((a) => deptAccIds.has(a.cashAccountId));
  const scopedCashBalance = scopedCashByAccount.reduce((acc, a) => acc.plus(d(a.closing)), d(0));

  // 4. Товарні залишки на складах обраного підрозділу(ів)
  const deptWhIds = new Set(
    orgWhs
      .filter((w) => w.departmentId !== null && deptIdSet!.has(w.departmentId))
      .map((w) => w.id)
  );
  const scopedStockRows = stock.rows.filter((r) => deptWhIds.has(r.warehouseId));
  const scopedInvCost = scopedStockRows.reduce((acc, r) => acc.plus(d(r.costAmount)), d(0));
  const scopedInvQty = scopedStockRows.reduce((acc, r) => acc.plus(d(r.qty)), d(0));
  const scopedResQty = scopedStockRows.reduce((acc, r) => acc.plus(d(r.reservedQty)), d(0));

  return {
    kpis: {
      revenue: toNumeric2(revenue),
      grossProfit: toNumeric2(grossProfit),
      netProfit: toNumeric2(netProfit),
      grossMarginPercent,
      cashBalance: toNumeric2(scopedCashBalance),
      inventoryValue: toNumeric2(scopedInvCost),
      inventoryQty: round4(scopedInvQty).toFixed(2),
      reservedQty: round4(scopedResQty).toFixed(2),
      receivables: toNumeric2(totalReceivable),
      payables: toNumeric2(totalPayable),
    },
    cashByAccount: scopedCashByAccount,
    recentDocuments: recentDocs,
  };
}
