import { and, asc, desc, eq, gte, lte, ne, sql } from 'drizzle-orm';
import type { AppDb } from './db.js';
import {
  cashAccounts,
  cashflowCategories,
  chartOfAccounts,
  counterparties,
  documentLines,
  documents,
  employees,
  fixedAssets,
  items,
  organizations,
  priceTypes,
  regAccountingEntries,
  regCashMovements,
  regCostBatches,
  regCurrencyRates,
  regItemPrices,
  regPnlTurnover,
  regSettlements,
  regStockMovements,
  regStockReservations,
  regStockTotalsMonthly,
  warehouses,
} from './schema.js';
import { ensureChartOfAccounts } from './accounting-service.js';
import { d, monthStartUtc, round2, round4, toIsoDate, toNumeric2, toNumeric4 } from './money.js';

export class PostingError extends Error {
  readonly code: string;
  readonly details?: Record<string, unknown>;

  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'PostingError';
    this.code = code;
    this.details = details;
  }
}

type Tx = Parameters<Parameters<AppDb['transaction']>[0]>[0];

async function adjustStockMonthlyTotal(
  tx: Tx,
  organizationId: string,
  period: Date,
  warehouseId: string,
  itemId: string,
  qtyDelta: string
): Promise<void> {
  const mStart = monthStartUtc(period);
  await tx
    .insert(regStockTotalsMonthly)
    .values({
      organizationId,
      monthStart: mStart,
      warehouseId,
      itemId,
      qtyDelta,
    })
    .onConflictDoUpdate({
      target: [
        regStockTotalsMonthly.organizationId,
        regStockTotalsMonthly.monthStart,
        regStockTotalsMonthly.warehouseId,
        regStockTotalsMonthly.itemId,
      ],
      set: {
        qtyDelta: sql`${regStockTotalsMonthly.qtyDelta} + ${qtyDelta}::numeric`,
      },
    });
}

async function clearDocumentMovements(tx: Tx, documentId: string): Promise<void> {
  const existingStock = await tx
    .select()
    .from(regStockMovements)
    .where(eq(regStockMovements.recorderId, documentId));

  for (const mov of existingStock) {
    const reversed = toNumeric4(d(mov.qty).neg());
    await adjustStockMonthlyTotal(
      tx,
      mov.organizationId,
      mov.period,
      mov.warehouseId,
      mov.itemId,
      reversed
    );
  }

  await tx.delete(regStockMovements).where(eq(regStockMovements.recorderId, documentId));
  await tx.delete(regStockReservations).where(eq(regStockReservations.recorderId, documentId));
  await tx.delete(regCostBatches).where(eq(regCostBatches.recorderId, documentId));
  await tx.delete(regSettlements).where(eq(regSettlements.recorderId, documentId));
  await tx.delete(regCashMovements).where(eq(regCashMovements.recorderId, documentId));
  await tx.delete(regPnlTurnover).where(eq(regPnlTurnover.recorderId, documentId));
  await tx.delete(regItemPrices).where(eq(regItemPrices.recorderId, documentId));
  await tx.delete(regAccountingEntries).where(eq(regAccountingEntries.recorderId, documentId));
}

async function getPhysicalQtyAsOf(
  tx: Tx,
  organizationId: string,
  warehouseId: string,
  itemId: string,
  asOfDate: Date
): Promise<ReturnType<typeof d>> {
  const [row] = await tx
    .select({
      qty: sql<string>`COALESCE(SUM(${regStockMovements.qty}), 0)`,
    })
    .from(regStockMovements)
    .where(
      and(
        eq(regStockMovements.organizationId, organizationId),
        eq(regStockMovements.warehouseId, warehouseId),
        eq(regStockMovements.itemId, itemId),
        lte(regStockMovements.period, asOfDate)
      )
    );
  return round4(row?.qty ?? 0);
}

async function getReservedQtyAsOf(
  tx: Tx,
  organizationId: string,
  warehouseId: string,
  itemId: string,
  asOfDate: Date,
  excludeOrderDocId?: string | null
): Promise<ReturnType<typeof d>> {
  const conds = [
    eq(regStockReservations.organizationId, organizationId),
    eq(regStockReservations.warehouseId, warehouseId),
    eq(regStockReservations.itemId, itemId),
    lte(regStockReservations.period, asOfDate),
  ];
  if (excludeOrderDocId) {
    conds.push(ne(regStockReservations.orderDocId, excludeOrderDocId));
  }

  const [row] = await tx
    .select({
      qty: sql<string>`COALESCE(SUM(${regStockReservations.qty}), 0)`,
    })
    .from(regStockReservations)
    .where(and(...conds));

  const res = round4(row?.qty ?? 0);
  return res.gt(0) ? res : d(0);
}

async function getOrderRemainingReservation(
  tx: Tx,
  orderDocId: string,
  warehouseId: string,
  itemId: string
): Promise<ReturnType<typeof d>> {
  const [row] = await tx
    .select({
      qty: sql<string>`COALESCE(SUM(${regStockReservations.qty}), 0)`,
    })
    .from(regStockReservations)
    .where(
      and(
        eq(regStockReservations.orderDocId, orderDocId),
        eq(regStockReservations.warehouseId, warehouseId),
        eq(regStockReservations.itemId, itemId)
      )
    );
  const rem = round4(row?.qty ?? 0);
  return rem.gt(0) ? rem : d(0);
}

interface FifoBatch {
  batchDocId: string;
  batchDate: Date;
  remainingQty: string;
  remainingCost: string;
}

async function getAvailableFifoBatches(
  tx: Tx,
  organizationId: string,
  warehouseId: string,
  itemId: string,
  asOfDate: Date
): Promise<FifoBatch[]> {
  const rows = await tx
    .select({
      batchDocId: regCostBatches.batchDocId,
      batchDate: regCostBatches.batchDate,
      remainingQty: sql<string>`SUM(${regCostBatches.qty})`,
      remainingCost: sql<string>`SUM(${regCostBatches.costAmount})`,
    })
    .from(regCostBatches)
    .where(
      and(
        eq(regCostBatches.organizationId, organizationId),
        eq(regCostBatches.warehouseId, warehouseId),
        eq(regCostBatches.itemId, itemId),
        lte(regCostBatches.period, asOfDate)
      )
    )
    .groupBy(regCostBatches.batchDocId, regCostBatches.batchDate)
    .orderBy(asc(regCostBatches.batchDate), asc(regCostBatches.batchDocId));

  return rows.filter((r) => d(r.remainingQty).gt(0));
}

interface AllocatedBatch {
  batchDocId: string;
  batchDate: Date;
  qty: string;
  costAmount: string;
}

async function allocateFifo(
  tx: Tx,
  params: {
    organizationId: string;
    warehouseId: string;
    warehouseName: string;
    itemId: string;
    itemName: string;
    requiredQty: string;
    asOfDate: Date;
    allowNegativeStock: boolean;
    fallbackBatchDocId: string;
    respectReservations?: boolean;
    excludeOrderDocId?: string | null;
  }
): Promise<{ allocations: AllocatedBatch[]; totalCost: string }> {
  const batches = await getAvailableFifoBatches(
    tx,
    params.organizationId,
    params.warehouseId,
    params.itemId,
    params.asOfDate
  );

  let remainingToTake = round4(params.requiredQty);
  const totalAvailable = batches.reduce((acc, b) => acc.plus(d(b.remainingQty)), d(0));

  if (totalAvailable.lt(remainingToTake) && !params.allowNegativeStock) {
    throw new PostingError(
      'INSUFFICIENT_STOCK',
      `Недостатньо товару "${params.itemName}" на складі "${params.warehouseName}" на ${params.asOfDate.toISOString().slice(0, 10)}: потрібно ${remainingToTake.toFixed(2)}, доступно ${totalAvailable.toFixed(2)}`,
      {
        itemId: params.itemId,
        warehouseId: params.warehouseId,
        required: remainingToTake.toFixed(4),
        available: totalAvailable.toFixed(4),
      }
    );
  }

  if (params.respectReservations && !params.allowNegativeStock) {
    const reservedByOthers = await getReservedQtyAsOf(
      tx,
      params.organizationId,
      params.warehouseId,
      params.itemId,
      params.asOfDate,
      params.excludeOrderDocId
    );
    const freeAvailable = totalAvailable.minus(reservedByOthers);
    if (freeAvailable.lt(remainingToTake)) {
      throw new PostingError(
        'INSUFFICIENT_FREE_STOCK',
        `Недостатньо вільного залишку товару "${params.itemName}" на складі "${params.warehouseName}": фізично є ${totalAvailable.toFixed(2)}, зарезервовано під інші замовлення ${reservedByOthers.toFixed(2)}, вільно ${freeAvailable.toFixed(2)}, потрібно ${remainingToTake.toFixed(2)}`,
        {
          itemId: params.itemId,
          warehouseId: params.warehouseId,
          physical: totalAvailable.toFixed(4),
          reserved: reservedByOthers.toFixed(4),
          free: freeAvailable.toFixed(4),
          required: remainingToTake.toFixed(4),
        }
      );
    }
  }

  const allocations: AllocatedBatch[] = [];
  let totalCost = d(0);

  for (const batch of batches) {
    if (remainingToTake.lte(0)) break;
    const bQty = round4(batch.remainingQty);
    const bCost = round2(batch.remainingCost);
    if (bQty.lte(0)) continue;

    if (bQty.lte(remainingToTake)) {
      allocations.push({
        batchDocId: batch.batchDocId,
        batchDate: batch.batchDate,
        qty: toNumeric4(bQty),
        costAmount: toNumeric2(bCost),
      });
      totalCost = totalCost.plus(bCost);
      remainingToTake = remainingToTake.minus(bQty);
    } else {
      const partCost = round2(bCost.mul(remainingToTake).div(bQty));
      allocations.push({
        batchDocId: batch.batchDocId,
        batchDate: batch.batchDate,
        qty: toNumeric4(remainingToTake),
        costAmount: toNumeric2(partCost),
      });
      totalCost = totalCost.plus(partCost);
      remainingToTake = d(0);
    }
  }

  if (remainingToTake.gt(0) && params.allowNegativeStock) {
    allocations.push({
      batchDocId: params.fallbackBatchDocId,
      batchDate: params.asOfDate,
      qty: toNumeric4(remainingToTake),
      costAmount: '0.00',
    });
  }

  return {
    allocations,
    totalCost: toNumeric2(totalCost),
  };
}

interface SubkontoRef {
  type: string;
  id: string;
  label: string;
}

async function executePostingInTx(tx: Tx, documentId: string): Promise<void> {
  const [doc] = await tx.select().from(documents).where(eq(documents.id, documentId));
  if (!doc) {
    throw new PostingError('DOCUMENT_NOT_FOUND', `Документ ${documentId} не знайдено`);
  }

  const [org] = await tx
    .select()
    .from(organizations)
    .where(eq(organizations.id, doc.organizationId));
  if (!org) {
    throw new PostingError('ORGANIZATION_NOT_FOUND', 'Організацію документа не знайдено');
  }

  if (org.lockDate && doc.docDate <= org.lockDate) {
    throw new PostingError(
      'PERIOD_LOCKED',
      `Період закрито для редагування до ${org.lockDate.toISOString().slice(0, 10)}`
    );
  }

  await clearDocumentMovements(tx, doc.id);

  const [lines, allItems, allWarehouses, allCfCats, allCps, allAccs, allCoa, allEmps] =
    await Promise.all([
      tx
        .select()
        .from(documentLines)
        .where(eq(documentLines.documentId, doc.id))
        .orderBy(asc(documentLines.lineNo)),
      tx.select().from(items),
      tx.select().from(warehouses),
      tx.select().from(cashflowCategories),
      tx.select().from(counterparties),
      tx.select().from(cashAccounts),
      tx.select().from(chartOfAccounts),
      tx.select().from(employees).where(eq(employees.organizationId, doc.organizationId)),
    ]);

  const itemMap = new Map(allItems.map((i) => [i.id, i]));
  const warehouseMap = new Map(allWarehouses.map((w) => [w.id, w]));
  const cfCatMap = new Map(allCfCats.map((c) => [c.id, c]));
  const cpMap = new Map(allCps.map((c) => [c.id, c]));
  const cashAccMap = new Map(allAccs.map((a) => [a.id, a]));
  const coaSet = new Set(allCoa.map((c) => c.code));
  const empMap = new Map(allEmps.map((e) => [e.id, e]));

  let glLineCounter = 0;

  const addGlEntry = async (params: {
    dt: string;
    kt: string;
    amount: ReturnType<typeof d> | string;
    qty?: ReturnType<typeof d> | string;
    description: string;
    dtSub1?: SubkontoRef;
    dtSub2?: SubkontoRef;
    ktSub1?: SubkontoRef;
    ktSub2?: SubkontoRef;
  }) => {
    const amt = round2(params.amount);
    if (amt.lte(0)) return;
    glLineCounter += 1;
    await tx.insert(regAccountingEntries).values({
      organizationId: doc.organizationId,
      recorderId: doc.id,
      recorderType: doc.docType,
      period: doc.docDate,
      lineNo: glLineCounter,
      debitAccountCode: params.dt,
      creditAccountCode: params.kt,
      debitSubkonto1Type: params.dtSub1?.type ?? '',
      debitSubkonto1Id: params.dtSub1?.id ?? '',
      debitSubkonto1Label: params.dtSub1?.label ?? '',
      debitSubkonto2Type: params.dtSub2?.type ?? '',
      debitSubkonto2Id: params.dtSub2?.id ?? '',
      debitSubkonto2Label: params.dtSub2?.label ?? '',
      creditSubkonto1Type: params.ktSub1?.type ?? '',
      creditSubkonto1Id: params.ktSub1?.id ?? '',
      creditSubkonto1Label: params.ktSub1?.label ?? '',
      creditSubkonto2Type: params.ktSub2?.type ?? '',
      creditSubkonto2Id: params.ktSub2?.id ?? '',
      creditSubkonto2Label: params.ktSub2?.label ?? '',
      qty: toNumeric4(params.qty ?? 0),
      amount: toNumeric2(amt),
      description: params.description,
    });
  };

  const addStockMovement = async (
    warehouseId: string,
    itemId: string,
    movementType: 'IN' | 'OUT',
    absQty: string
  ) => {
    const signedQty = movementType === 'IN' ? toNumeric4(absQty) : toNumeric4(d(absQty).neg());
    await tx.insert(regStockMovements).values({
      organizationId: doc.organizationId,
      recorderId: doc.id,
      recorderType: doc.docType,
      period: doc.docDate,
      movementType,
      warehouseId,
      itemId,
      qty: signedQty,
    });
    await adjustStockMonthlyTotal(
      tx,
      doc.organizationId,
      doc.docDate,
      warehouseId,
      itemId,
      signedQty
    );
  };

  const getFxRateInTx = async (currencyCode: string, asOf: Date): Promise<ReturnType<typeof d>> => {
    if (!currencyCode || currencyCode === 'UAH') return d(1);
    if (d(doc.exchangeRate).gt(1) && doc.currency === currencyCode) {
      return d(doc.exchangeRate);
    }
    const [rateRow] = await tx
      .select()
      .from(regCurrencyRates)
      .where(
        and(eq(regCurrencyRates.currencyCode, currencyCode), lte(regCurrencyRates.rateDate, asOf))
      )
      .orderBy(desc(regCurrencyRates.rateDate), desc(regCurrencyRates.createdAt))
      .limit(1);
    if (rateRow) return d(rateRow.rate);
    return currencyCode === 'USD' ? d(41.5) : currencyCode === 'EUR' ? d(44.8) : d(1);
  };

  switch (doc.docType) {
    case 'opening_balance': {
      let computedTotal = d(0);
      for (const line of lines) {
        const lineAmount = round2(
          !d(line.amount).eq(0) ? line.amount : d(line.qty).mul(d(line.price))
        );
        computedTotal = computedTotal.plus(lineAmount.abs());

        const whId = line.warehouseId ?? doc.warehouseId;
        if (line.itemId && whId && d(line.qty).gt(0)) {
          const wh = warehouseMap.get(whId);
          const it = itemMap.get(line.itemId);
          await addStockMovement(whId, line.itemId, 'IN', toNumeric4(line.qty));
          await tx.insert(regCostBatches).values({
            organizationId: doc.organizationId,
            recorderId: doc.id,
            period: doc.docDate,
            movementType: 'IN',
            warehouseId: whId,
            itemId: line.itemId,
            batchDocId: doc.id,
            batchDate: doc.docDate,
            qty: toNumeric4(line.qty),
            costAmount: toNumeric2(lineAmount),
          });
          await addGlEntry({
            dt: '281',
            kt: '00',
            amount: lineAmount,
            qty: line.qty,
            description: `Ввід поч. залишків товару: ${it?.name ?? ''}`,
            dtSub1: { type: 'WAREHOUSE', id: whId, label: wh?.name ?? whId },
            dtSub2: { type: 'ITEM', id: line.itemId, label: it?.name ?? line.itemId },
          });
        }

        const accId = line.cashAccountId ?? doc.cashAccountId;
        if (accId && !line.itemId && !d(line.amount).eq(0)) {
          const acc = cashAccMap.get(accId);
          const accCurrency = acc?.currency ?? 'UAH';
          const rate = await getFxRateInTx(accCurrency, doc.docDate);
          const foreignAmt = round2(line.amount);
          const uahAmt = accCurrency !== 'UAH' ? round2(foreignAmt.mul(rate)) : foreignAmt;
          const glCode =
            accCurrency !== 'UAH' ? '312' : acc?.accountType === 'CASH' ? '301' : '311';

          await tx.insert(regCashMovements).values({
            organizationId: doc.organizationId,
            recorderId: doc.id,
            recorderType: doc.docType,
            period: doc.docDate,
            cashAccountId: accId,
            cashflowCategoryId: doc.cashflowCategoryId,
            currency: accCurrency,
            foreignAmount: toNumeric2(foreignAmt),
            exchangeRate: rate.toFixed(6),
            amount: toNumeric2(uahAmt),
          });
          await addGlEntry({
            dt: glCode,
            kt: '00',
            amount: uahAmt.abs(),
            description: `Ввід поч. залишку коштів: ${acc?.name ?? ''}${
              accCurrency !== 'UAH' ? ` (${toNumeric2(foreignAmt)} ${accCurrency} × ${rate.toFixed(2)})` : ''
            }`,
            dtSub1: { type: 'CASH_ACCOUNT', id: accId, label: acc?.name ?? accId },
          });
        }

        const cpId = line.counterpartyId ?? doc.counterpartyId;
        if (cpId && !line.itemId && !accId && !d(line.amount).eq(0)) {
          const cp = cpMap.get(cpId);
          const amt = d(line.amount);
          await tx.insert(regSettlements).values({
            organizationId: doc.organizationId,
            recorderId: doc.id,
            recorderType: doc.docType,
            period: doc.docDate,
            counterpartyId: cpId,
            contractId: line.contractId ?? doc.contractId,
            amount: toNumeric2(amt),
          });
          if (amt.gt(0)) {
            await addGlEntry({
              dt: '361',
              kt: '00',
              amount: amt,
              description: `Початкова дебіторська заборгованість: ${cp?.name ?? ''}`,
              dtSub1: { type: 'COUNTERPARTY', id: cpId, label: cp?.name ?? cpId },
            });
          } else {
            await addGlEntry({
              dt: '00',
              kt: '631',
              amount: amt.abs(),
              description: `Початкова кредиторська заборгованість: ${cp?.name ?? ''}`,
              ktSub1: { type: 'COUNTERPARTY', id: cpId, label: cp?.name ?? cpId },
            });
          }
        }
      }

      if (d(doc.totalAmount).eq(0) && computedTotal.gt(0)) {
        await tx
          .update(documents)
          .set({ totalAmount: toNumeric2(computedTotal) })
          .where(eq(documents.id, doc.id));
      }
      break;
    }

    case 'customer_order': {
      if (!doc.warehouseId) {
        throw new PostingError('VALIDATION_ERROR', 'У замовленні покупця не вказано склад резервування');
      }
      if (!doc.counterpartyId) {
        throw new PostingError('VALIDATION_ERROR', 'У замовленні покупця не вказано клієнта');
      }
      if (lines.length === 0) {
        throw new PostingError('VALIDATION_ERROR', 'У замовленні відсутні товарні рядки');
      }

      const wh = warehouseMap.get(doc.warehouseId);
      let totalOrder = d(0);

      for (const line of lines) {
        if (!line.itemId) continue;
        const item = itemMap.get(line.itemId);
        if (!item) continue;

        const qty = round4(line.qty);
        if (qty.lte(0)) {
          throw new PostingError('VALIDATION_ERROR', `Кількість для "${item.name}" має бути > 0`);
        }

        const amount = round2(d(line.amount).gt(0) ? line.amount : qty.mul(d(line.price)));
        totalOrder = totalOrder.plus(amount);

        if (item.itemType === 'GOODS') {
          if (!org.allowNegativeStock) {
            const phys = await getPhysicalQtyAsOf(
              tx,
              doc.organizationId,
              doc.warehouseId,
              item.id,
              doc.docDate
            );
            const alreadyReserved = await getReservedQtyAsOf(
              tx,
              doc.organizationId,
              doc.warehouseId,
              item.id,
              doc.docDate,
              doc.id
            );
            const free = phys.minus(alreadyReserved);
            if (free.lt(qty)) {
              throw new PostingError(
                'INSUFFICIENT_FREE_STOCK',
                `Неможливо зарезервувати "${item.name}" на складі "${wh?.name ?? ''}": фізично ${phys.toFixed(2)}, вже в резерві ${alreadyReserved.toFixed(2)}, вільно ${free.toFixed(2)}, замовлено ${qty.toFixed(2)}`
              );
            }
          }

          await tx.insert(regStockReservations).values({
            organizationId: doc.organizationId,
            recorderId: doc.id,
            recorderType: doc.docType,
            period: doc.docDate,
            movementType: 'RESERVE',
            orderDocId: doc.id,
            warehouseId: doc.warehouseId,
            itemId: item.id,
            qty: toNumeric4(qty),
          });
        }

        await tx
          .update(documentLines)
          .set({ amount: toNumeric2(amount) })
          .where(eq(documentLines.id, line.id));
      }

      await tx
        .update(documents)
        .set({ totalAmount: toNumeric2(totalOrder) })
        .where(eq(documents.id, doc.id));
      break;
    }

    case 'goods_receipt': {
      if (!doc.warehouseId) {
        throw new PostingError('VALIDATION_ERROR', 'У прибутковій накладній не вказано склад');
      }
      if (!doc.counterpartyId) {
        throw new PostingError(
          'VALIDATION_ERROR',
          'У прибутковій накладній не вказано постачальника'
        );
      }
      if (lines.length === 0) {
        throw new PostingError('VALIDATION_ERROR', 'У накладній відсутні товарні рядки');
      }

      const wh = warehouseMap.get(doc.warehouseId);
      const cp = cpMap.get(doc.counterpartyId);
      let total = d(0);

      for (const line of lines) {
        if (!line.itemId) continue;
        const item = itemMap.get(line.itemId);
        if (!item) continue;

        const qty = round4(line.qty);
        if (qty.lte(0)) {
          throw new PostingError('VALIDATION_ERROR', `Кількість для "${item.name}" має бути > 0`);
        }
        const amount = round2(d(line.amount).gt(0) ? line.amount : qty.mul(d(line.price)));
        total = total.plus(amount);

        if (item.itemType === 'GOODS') {
          await addStockMovement(doc.warehouseId, item.id, 'IN', toNumeric4(qty));
          await tx.insert(regCostBatches).values({
            organizationId: doc.organizationId,
            recorderId: doc.id,
            period: doc.docDate,
            movementType: 'IN',
            warehouseId: doc.warehouseId,
            itemId: item.id,
            batchDocId: doc.id,
            batchDate: doc.docDate,
            qty: toNumeric4(qty),
            costAmount: toNumeric2(amount),
          });

          await addGlEntry({
            dt: '281',
            kt: '631',
            amount,
            qty,
            description: `Оприбуткування товару "${item.name}" від ${cp?.name ?? ''}`,
            dtSub1: { type: 'WAREHOUSE', id: doc.warehouseId, label: wh?.name ?? '' },
            dtSub2: { type: 'ITEM', id: item.id, label: item.name },
            ktSub1: { type: 'COUNTERPARTY', id: doc.counterpartyId, label: cp?.name ?? '' },
          });
        } else {
          await addGlEntry({
            dt: '92',
            kt: '631',
            amount,
            description: `Придбання послуги "${item.name}" від ${cp?.name ?? ''}`,
            ktSub1: { type: 'COUNTERPARTY', id: doc.counterpartyId, label: cp?.name ?? '' },
          });
        }
      }

      await tx.insert(regSettlements).values({
        organizationId: doc.organizationId,
        recorderId: doc.id,
        recorderType: doc.docType,
        period: doc.docDate,
        counterpartyId: doc.counterpartyId,
        contractId: doc.contractId,
        amount: toNumeric2(total.neg()),
      });

      await tx
        .update(documents)
        .set({ totalAmount: toNumeric2(total) })
        .where(eq(documents.id, doc.id));
      break;
    }

    case 'sales_invoice': {
      if (!doc.warehouseId) {
        throw new PostingError('VALIDATION_ERROR', 'У видатковій накладній не вказано склад');
      }
      if (!doc.counterpartyId) {
        throw new PostingError('VALIDATION_ERROR', 'У видатковій накладній не вказано покупця');
      }
      if (lines.length === 0) {
        throw new PostingError('VALIDATION_ERROR', 'У накладній відсутні товарні рядки');
      }

      const wh = warehouseMap.get(doc.warehouseId);
      const cp = cpMap.get(doc.counterpartyId);
      const whName = wh?.name ?? doc.warehouseId;

      let totalRevenue = d(0);
      for (const line of lines) {
        if (!line.itemId) continue;
        const item = itemMap.get(line.itemId);
        if (!item) continue;

        const qty = round4(line.qty);
        if (qty.lte(0)) {
          throw new PostingError('VALIDATION_ERROR', `Кількість для "${item.name}" має бути > 0`);
        }
        const revenue = round2(d(line.amount).gt(0) ? line.amount : qty.mul(d(line.price)));
        totalRevenue = totalRevenue.plus(revenue);

        let lineCogs = d(0);
        if (item.itemType === 'GOODS') {
          // Якщо відвантаження за замовленням (parentDocId) — знімаємо його резерв і не блокуємося власним резервом
          if (doc.parentDocId) {
            const remRes = await getOrderRemainingReservation(
              tx,
              doc.parentDocId,
              doc.warehouseId,
              item.id
            );
            const toRelease = remRes.gt(qty) ? qty : remRes;
            if (toRelease.gt(0)) {
              await tx.insert(regStockReservations).values({
                organizationId: doc.organizationId,
                recorderId: doc.id,
                recorderType: doc.docType,
                period: doc.docDate,
                movementType: 'RELEASE',
                orderDocId: doc.parentDocId,
                warehouseId: doc.warehouseId,
                itemId: item.id,
                qty: toNumeric4(toRelease.neg()),
              });
            }
          }

          const { allocations, totalCost } = await allocateFifo(tx, {
            organizationId: doc.organizationId,
            warehouseId: doc.warehouseId,
            warehouseName: whName,
            itemId: item.id,
            itemName: item.name,
            requiredQty: toNumeric4(qty),
            asOfDate: doc.docDate,
            allowNegativeStock: org.allowNegativeStock,
            fallbackBatchDocId: doc.id,
            respectReservations: true,
            excludeOrderDocId: doc.parentDocId,
          });
          lineCogs = d(totalCost);

          await addStockMovement(doc.warehouseId, item.id, 'OUT', toNumeric4(qty));

          for (const alloc of allocations) {
            await tx.insert(regCostBatches).values({
              organizationId: doc.organizationId,
              recorderId: doc.id,
              period: doc.docDate,
              movementType: 'OUT',
              warehouseId: doc.warehouseId,
              itemId: item.id,
              batchDocId: alloc.batchDocId,
              batchDate: alloc.batchDate,
              qty: toNumeric4(d(alloc.qty).neg()),
              costAmount: toNumeric2(d(alloc.costAmount).neg()),
            });
          }

          // Проводка доходу: Дт 361 Кт 702
          await addGlEntry({
            dt: '361',
            kt: '702',
            amount: revenue,
            qty,
            description: `Дохід від реалізації товару "${item.name}"`,
            dtSub1: { type: 'COUNTERPARTY', id: doc.counterpartyId, label: cp?.name ?? '' },
            ktSub1: { type: 'ITEM', id: item.id, label: item.name },
            ktSub2: { type: 'COUNTERPARTY', id: doc.counterpartyId, label: cp?.name ?? '' },
          });

          // Проводка списання собівартості FIFO: Дт 902 Кт 281
          await addGlEntry({
            dt: '902',
            kt: '281',
            amount: lineCogs,
            qty,
            description: `Списання FIFO собівартості "${item.name}"`,
            dtSub1: { type: 'ITEM', id: item.id, label: item.name },
            ktSub1: { type: 'WAREHOUSE', id: doc.warehouseId, label: whName },
            ktSub2: { type: 'ITEM', id: item.id, label: item.name },
          });
        } else {
          // Реалізація послуг: Дт 361 Кт 703
          await addGlEntry({
            dt: '361',
            kt: '703',
            amount: revenue,
            qty,
            description: `Реалізація послуги "${item.name}"`,
            dtSub1: { type: 'COUNTERPARTY', id: doc.counterpartyId, label: cp?.name ?? '' },
            ktSub1: { type: 'ITEM', id: item.id, label: item.name },
            ktSub2: { type: 'COUNTERPARTY', id: doc.counterpartyId, label: cp?.name ?? '' },
          });
        }

        await tx
          .update(documentLines)
          .set({
            amount: toNumeric2(revenue),
            costAmount: toNumeric2(lineCogs),
          })
          .where(eq(documentLines.id, line.id));

        const profit = round2(revenue.minus(lineCogs));
        await tx.insert(regPnlTurnover).values({
          organizationId: doc.organizationId,
          recorderId: doc.id,
          recorderType: doc.docType,
          period: doc.docDate,
          pnlType: 'SALE',
          warehouseId: doc.warehouseId,
          itemId: item.id,
          counterpartyId: doc.counterpartyId,
          qty: toNumeric4(qty),
          revenue: toNumeric2(revenue),
          cogs: toNumeric2(lineCogs),
          expense: '0.00',
          profit: toNumeric2(profit),
        });
      }

      await tx.insert(regSettlements).values({
        organizationId: doc.organizationId,
        recorderId: doc.id,
        recorderType: doc.docType,
        period: doc.docDate,
        counterpartyId: doc.counterpartyId,
        contractId: doc.contractId,
        amount: toNumeric2(totalRevenue),
      });

      await tx
        .update(documents)
        .set({ totalAmount: toNumeric2(totalRevenue) })
        .where(eq(documents.id, doc.id));
      break;
    }

    case 'stock_transfer': {
      if (!doc.warehouseId || !doc.targetWarehouseId) {
        throw new PostingError(
          'VALIDATION_ERROR',
          'У переміщенні необхідно вказати склад-відправник та склад-отримувач'
        );
      }
      if (doc.warehouseId === doc.targetWarehouseId) {
        throw new PostingError(
          'VALIDATION_ERROR',
          'Склад-відправник і склад-отримувач не можуть збігатися'
        );
      }
      if (lines.length === 0) {
        throw new PostingError('VALIDATION_ERROR', 'У переміщенні відсутні товарні рядки');
      }

      const srcWh = warehouseMap.get(doc.warehouseId);
      const dstWh = warehouseMap.get(doc.targetWarehouseId);
      let totalTransferCost = d(0);

      for (const line of lines) {
        if (!line.itemId) continue;
        const item = itemMap.get(line.itemId);
        if (!item || item.itemType !== 'GOODS') continue;

        const qty = round4(line.qty);
        if (qty.lte(0)) {
          throw new PostingError('VALIDATION_ERROR', `Кількість для "${item.name}" має бути > 0`);
        }

        const { allocations, totalCost } = await allocateFifo(tx, {
          organizationId: doc.organizationId,
          warehouseId: doc.warehouseId,
          warehouseName: srcWh?.name ?? doc.warehouseId,
          itemId: item.id,
          itemName: item.name,
          requiredQty: toNumeric4(qty),
          asOfDate: doc.docDate,
          allowNegativeStock: org.allowNegativeStock,
          fallbackBatchDocId: doc.id,
          respectReservations: true,
        });

        totalTransferCost = totalTransferCost.plus(d(totalCost));

        await addStockMovement(doc.warehouseId, item.id, 'OUT', toNumeric4(qty));
        await addStockMovement(doc.targetWarehouseId, item.id, 'IN', toNumeric4(qty));

        for (const alloc of allocations) {
          await tx.insert(regCostBatches).values({
            organizationId: doc.organizationId,
            recorderId: doc.id,
            period: doc.docDate,
            movementType: 'OUT',
            warehouseId: doc.warehouseId,
            itemId: item.id,
            batchDocId: alloc.batchDocId,
            batchDate: alloc.batchDate,
            qty: toNumeric4(d(alloc.qty).neg()),
            costAmount: toNumeric2(d(alloc.costAmount).neg()),
          });
          await tx.insert(regCostBatches).values({
            organizationId: doc.organizationId,
            recorderId: doc.id,
            period: doc.docDate,
            movementType: 'IN',
            warehouseId: doc.targetWarehouseId,
            itemId: item.id,
            batchDocId: alloc.batchDocId,
            batchDate: alloc.batchDate,
            qty: toNumeric4(alloc.qty),
            costAmount: toNumeric2(alloc.costAmount),
          });
        }

        // Дт 281 (Склад-отримувач) — Кт 281 (Склад-відправник)
        await addGlEntry({
          dt: '281',
          kt: '281',
          amount: totalCost,
          qty,
          description: `Переміщення "${item.name}": ${srcWh?.name ?? ''} → ${dstWh?.name ?? ''}`,
          dtSub1: { type: 'WAREHOUSE', id: doc.targetWarehouseId, label: dstWh?.name ?? '' },
          dtSub2: { type: 'ITEM', id: item.id, label: item.name },
          ktSub1: { type: 'WAREHOUSE', id: doc.warehouseId, label: srcWh?.name ?? '' },
          ktSub2: { type: 'ITEM', id: item.id, label: item.name },
        });

        await tx
          .update(documentLines)
          .set({ costAmount: totalCost, amount: totalCost })
          .where(eq(documentLines.id, line.id));
      }

      await tx
        .update(documents)
        .set({ totalAmount: toNumeric2(totalTransferCost) })
        .where(eq(documents.id, doc.id));
      break;
    }

    case 'inventory_count': {
      if (!doc.warehouseId) {
        throw new PostingError('VALIDATION_ERROR', 'В інвентаризації не вказано склад');
      }
      if (lines.length === 0) {
        throw new PostingError('VALIDATION_ERROR', 'В інвентаризації відсутні товарні рядки');
      }

      const wh = warehouseMap.get(doc.warehouseId);
      let totalAbsAdjustment = d(0);

      for (const line of lines) {
        if (!line.itemId) continue;
        const item = itemMap.get(line.itemId);
        if (!item || item.itemType !== 'GOODS') continue;

        const factQty = round4(line.qty);
        if (factQty.lt(0)) {
          throw new PostingError(
            'VALIDATION_ERROR',
            `Фактична кількість "${item.name}" не може бути від’ємною`
          );
        }

        // Розраховуємо точний обліковий залишок на момент інвентаризації
        const bookQty = await getPhysicalQtyAsOf(
          tx,
          doc.organizationId,
          doc.warehouseId,
          item.id,
          doc.docDate
        );
        const diffQty = round4(factQty.minus(bookQty));

        let lineAmount = d(0);

        if (diffQty.gt(0)) {
          // НАДЛИШОК -> Оприбуткування на склад Дт 281 Кт 719
          let unitPrice = round2(line.price);
          if (unitPrice.lte(0)) {
            const batches = await getAvailableFifoBatches(
              tx,
              doc.organizationId,
              doc.warehouseId,
              item.id,
              doc.docDate
            );
            if (batches.length > 0) {
              const bLast = batches[batches.length - 1];
              unitPrice = round2(d(bLast.remainingCost).div(d(bLast.remainingQty)));
            }
          }
          lineAmount = round2(diffQty.mul(unitPrice));
          totalAbsAdjustment = totalAbsAdjustment.plus(lineAmount);

          await addStockMovement(doc.warehouseId, item.id, 'IN', toNumeric4(diffQty));
          await tx.insert(regCostBatches).values({
            organizationId: doc.organizationId,
            recorderId: doc.id,
            period: doc.docDate,
            movementType: 'IN',
            warehouseId: doc.warehouseId,
            itemId: item.id,
            batchDocId: doc.id,
            batchDate: doc.docDate,
            qty: toNumeric4(diffQty),
            costAmount: toNumeric2(lineAmount),
          });

          if (lineAmount.gt(0)) {
            await tx.insert(regPnlTurnover).values({
              organizationId: doc.organizationId,
              recorderId: doc.id,
              recorderType: doc.docType,
              period: doc.docDate,
              pnlType: 'OTHER_INCOME',
              warehouseId: doc.warehouseId,
              itemId: item.id,
              qty: toNumeric4(diffQty),
              revenue: toNumeric2(lineAmount),
              cogs: '0.00',
              expense: '0.00',
              profit: toNumeric2(lineAmount),
            });

            await addGlEntry({
              dt: '281',
              kt: '719',
              amount: lineAmount,
              qty: diffQty,
              description: `Оприбуткування надлишків інвентаризації: "${item.name}"`,
              dtSub1: { type: 'WAREHOUSE', id: doc.warehouseId, label: wh?.name ?? '' },
              dtSub2: { type: 'ITEM', id: item.id, label: item.name },
            });
          }
        } else if (diffQty.lt(0)) {
          // НЕСТАЧА -> Списання по FIFO Дт 947 Кт 281
          const shortageQty = diffQty.abs();
          const { allocations, totalCost } = await allocateFifo(tx, {
            organizationId: doc.organizationId,
            warehouseId: doc.warehouseId,
            warehouseName: wh?.name ?? doc.warehouseId,
            itemId: item.id,
            itemName: item.name,
            requiredQty: toNumeric4(shortageQty),
            asOfDate: doc.docDate,
            allowNegativeStock: org.allowNegativeStock,
            fallbackBatchDocId: doc.id,
            respectReservations: false,
          });

          lineAmount = d(totalCost);
          totalAbsAdjustment = totalAbsAdjustment.plus(lineAmount);

          await addStockMovement(doc.warehouseId, item.id, 'OUT', toNumeric4(shortageQty));

          for (const alloc of allocations) {
            await tx.insert(regCostBatches).values({
              organizationId: doc.organizationId,
              recorderId: doc.id,
              period: doc.docDate,
              movementType: 'OUT',
              warehouseId: doc.warehouseId,
              itemId: item.id,
              batchDocId: alloc.batchDocId,
              batchDate: alloc.batchDate,
              qty: toNumeric4(d(alloc.qty).neg()),
              costAmount: toNumeric2(d(alloc.costAmount).neg()),
            });
          }

          if (lineAmount.gt(0)) {
            await tx.insert(regPnlTurnover).values({
              organizationId: doc.organizationId,
              recorderId: doc.id,
              recorderType: doc.docType,
              period: doc.docDate,
              pnlType: 'EXPENSE',
              warehouseId: doc.warehouseId,
              itemId: item.id,
              qty: toNumeric4(shortageQty),
              revenue: '0.00',
              cogs: '0.00',
              expense: toNumeric2(lineAmount),
              profit: toNumeric2(lineAmount.neg()),
            });

            await addGlEntry({
              dt: '947',
              kt: '281',
              amount: lineAmount,
              qty: shortageQty,
              description: `Списання нестачі за інвентаризацією: "${item.name}"`,
              dtSub1: { type: 'WAREHOUSE', id: doc.warehouseId, label: wh?.name ?? '' },
              dtSub2: { type: 'ITEM', id: item.id, label: item.name },
              ktSub1: { type: 'WAREHOUSE', id: doc.warehouseId, label: wh?.name ?? '' },
              ktSub2: { type: 'ITEM', id: item.id, label: item.name },
            });
          }
        }

        await tx
          .update(documentLines)
          .set({
            bookQty: toNumeric4(bookQty),
            diffQty: toNumeric4(diffQty),
            amount: toNumeric2(lineAmount),
            costAmount: toNumeric2(lineAmount),
          })
          .where(eq(documentLines.id, line.id));
      }

      await tx
        .update(documents)
        .set({ totalAmount: toNumeric2(totalAbsAdjustment) })
        .where(eq(documents.id, doc.id));
      break;
    }

    case 'money_in': {
      if (!doc.cashAccountId) {
        throw new PostingError('VALIDATION_ERROR', 'Не вказано касу або банківський рахунок');
      }
      const amount = round2(doc.totalAmount);
      if (amount.lte(0)) {
        throw new PostingError('VALIDATION_ERROR', 'Сума надходження має бути > 0');
      }

      const acc = cashAccMap.get(doc.cashAccountId);
      const accCurrency = acc?.currency ?? 'UAH';
      const rate = await getFxRateInTx(accCurrency, doc.docDate);
      const uahAmount = accCurrency !== 'UAH' ? round2(amount.mul(rate)) : amount;
      const cashGlCode =
        accCurrency !== 'UAH' ? '312' : acc?.accountType === 'CASH' ? '301' : '311';
      const cp = doc.counterpartyId ? cpMap.get(doc.counterpartyId) : undefined;
      const cfCat = doc.cashflowCategoryId ? cfCatMap.get(doc.cashflowCategoryId) : undefined;

      await tx.insert(regCashMovements).values({
        organizationId: doc.organizationId,
        recorderId: doc.id,
        recorderType: doc.docType,
        period: doc.docDate,
        cashAccountId: doc.cashAccountId,
        cashflowCategoryId: doc.cashflowCategoryId,
        currency: accCurrency,
        foreignAmount: toNumeric2(amount),
        exchangeRate: rate.toFixed(6),
        amount: toNumeric2(uahAmount),
      });

      if (doc.counterpartyId) {
        await tx.insert(regSettlements).values({
          organizationId: doc.organizationId,
          recorderId: doc.id,
          recorderType: doc.docType,
          period: doc.docDate,
          counterpartyId: doc.counterpartyId,
          contractId: doc.contractId,
          amount: toNumeric2(uahAmount.neg()),
        });

        await addGlEntry({
          dt: cashGlCode,
          kt: '361',
          amount: uahAmount,
          description: doc.comment || `Оплата від покупця ${cp?.name ?? ''}`,
          dtSub1: { type: 'CASH_ACCOUNT', id: doc.cashAccountId, label: acc?.name ?? '' },
          ktSub1: { type: 'COUNTERPARTY', id: doc.counterpartyId, label: cp?.name ?? '' },
        });
      } else {
        await tx.insert(regPnlTurnover).values({
          organizationId: doc.organizationId,
          recorderId: doc.id,
          recorderType: doc.docType,
          period: doc.docDate,
          pnlType: 'OTHER_INCOME',
          cashflowCategoryId: doc.cashflowCategoryId,
          qty: '0.0000',
          revenue: toNumeric2(uahAmount),
          cogs: '0.00',
          expense: '0.00',
          profit: toNumeric2(uahAmount),
        });

        await addGlEntry({
          dt: cashGlCode,
          kt: '719',
          amount: uahAmount,
          description: doc.comment || `Інше надходження коштів`,
          dtSub1: { type: 'CASH_ACCOUNT', id: doc.cashAccountId, label: acc?.name ?? '' },
          ktSub1: cfCat
            ? { type: 'CASHFLOW_CATEGORY', id: cfCat.id, label: cfCat.name }
            : undefined,
        });
      }
      break;
    }

    case 'money_out': {
      if (!doc.cashAccountId) {
        throw new PostingError('VALIDATION_ERROR', 'Не вказано касу або банківський рахунок');
      }
      const amount = round2(doc.totalAmount);
      if (amount.lte(0)) {
        throw new PostingError('VALIDATION_ERROR', 'Сума списання має бути > 0');
      }

      const acc = cashAccMap.get(doc.cashAccountId);
      const accCurrency = acc?.currency ?? 'UAH';
      const rate = await getFxRateInTx(accCurrency, doc.docDate);
      const uahAmount = accCurrency !== 'UAH' ? round2(amount.mul(rate)) : amount;
      const cashGlCode =
        accCurrency !== 'UAH' ? '312' : acc?.accountType === 'CASH' ? '301' : '311';
      const cp = doc.counterpartyId ? cpMap.get(doc.counterpartyId) : undefined;
      const cfCat = doc.cashflowCategoryId ? cfCatMap.get(doc.cashflowCategoryId) : undefined;

      await tx.insert(regCashMovements).values({
        organizationId: doc.organizationId,
        recorderId: doc.id,
        recorderType: doc.docType,
        period: doc.docDate,
        cashAccountId: doc.cashAccountId,
        cashflowCategoryId: doc.cashflowCategoryId,
        currency: accCurrency,
        foreignAmount: toNumeric2(amount.neg()),
        exchangeRate: rate.toFixed(6),
        amount: toNumeric2(uahAmount.neg()),
      });

      if (doc.counterpartyId && !cfCat?.isOperatingExpense) {
        await tx.insert(regSettlements).values({
          organizationId: doc.organizationId,
          recorderId: doc.id,
          recorderType: doc.docType,
          period: doc.docDate,
          counterpartyId: doc.counterpartyId,
          contractId: doc.contractId,
          amount: toNumeric2(uahAmount),
        });

        await addGlEntry({
          dt: '631',
          kt: cashGlCode,
          amount: uahAmount,
          description: doc.comment || `Оплата постачальнику ${cp?.name ?? ''}`,
          dtSub1: { type: 'COUNTERPARTY', id: doc.counterpartyId, label: cp?.name ?? '' },
          ktSub1: { type: 'CASH_ACCOUNT', id: doc.cashAccountId, label: acc?.name ?? '' },
        });
      } else {
        await tx.insert(regPnlTurnover).values({
          organizationId: doc.organizationId,
          recorderId: doc.id,
          recorderType: doc.docType,
          period: doc.docDate,
          pnlType: 'EXPENSE',
          counterpartyId: doc.counterpartyId,
          cashflowCategoryId: doc.cashflowCategoryId,
          qty: '0.0000',
          revenue: '0.00',
          cogs: '0.00',
          expense: toNumeric2(uahAmount),
          profit: toNumeric2(uahAmount.neg()),
        });

        const expAccount =
          cfCat?.name.toLowerCase().includes('маркет') ||
          cfCat?.name.toLowerCase().includes('реклам') ||
          cfCat?.name.toLowerCase().includes('збут')
            ? '93'
            : '92';

        await addGlEntry({
          dt: expAccount,
          kt: cashGlCode,
          amount: uahAmount,
          description: doc.comment || cfCat?.name || 'Операційні витрати',
          dtSub1: cfCat
            ? { type: 'CASHFLOW_CATEGORY', id: cfCat.id, label: cfCat.name }
            : undefined,
          ktSub1: { type: 'CASH_ACCOUNT', id: doc.cashAccountId, label: acc?.name ?? '' },
        });
      }
      break;
    }

    case 'price_setting': {
      if (!doc.priceTypeId) {
        throw new PostingError('VALIDATION_ERROR', 'Не вказано тип цін для встановлення');
      }
      if (lines.length === 0) {
        throw new PostingError('VALIDATION_ERROR', 'Додайте хоча б одну позицію номенклатури');
      }

      for (const line of lines) {
        if (!line.itemId) continue;
        const price = round2(line.price);
        if (price.lt(0)) {
          throw new PostingError('VALIDATION_ERROR', 'Ціна не може бути від’ємною');
        }
        await tx.insert(regItemPrices).values({
          recorderId: doc.id,
          effectiveAt: doc.docDate,
          itemId: line.itemId,
          priceTypeId: doc.priceTypeId,
          price: toNumeric2(price),
        });
      }
      break;
    }

    case 'manual_journal': {
      if (lines.length === 0) {
        throw new PostingError('VALIDATION_ERROR', 'Додайте хоча б одну бухгалтерську проводку');
      }

      let totalManual = d(0);
      for (const line of lines) {
        const dtCode = line.debitAccountCode.trim();
        const ktCode = line.creditAccountCode.trim();
        if (!dtCode || !ktCode) {
          throw new PostingError('VALIDATION_ERROR', 'Вкажіть рахунок Дебету та Кредиту');
        }
        if (coaSet.size > 0 && (!coaSet.has(dtCode) || !coaSet.has(ktCode))) {
          throw new PostingError(
            'VALIDATION_ERROR',
            `Рахунок "${dtCode}" або "${ktCode}" відсутній у Плані рахунків №291`
          );
        }
        const amt = round2(line.amount);
        if (amt.lte(0)) {
          throw new PostingError('VALIDATION_ERROR', 'Сума проводки має бути > 0');
        }
        totalManual = totalManual.plus(amt);

        const cp = line.counterpartyId ? cpMap.get(line.counterpartyId) : undefined;
        const it = line.itemId ? itemMap.get(line.itemId) : undefined;

        await addGlEntry({
          dt: dtCode,
          kt: ktCode,
          amount: amt,
          qty: line.qty,
          description: line.notes || doc.comment || 'Ручна бухгалтерська операція',
          dtSub1: cp
            ? { type: 'COUNTERPARTY', id: cp.id, label: cp.name }
            : it
              ? { type: 'ITEM', id: it.id, label: it.name }
              : undefined,
          ktSub1: cp
            ? { type: 'COUNTERPARTY', id: cp.id, label: cp.name }
            : it
              ? { type: 'ITEM', id: it.id, label: it.name }
              : undefined,
        });
      }

      await tx
        .update(documents)
        .set({ totalAmount: toNumeric2(totalManual) })
        .where(eq(documents.id, doc.id));
      break;
    }

    case 'production_order': {
      if (!doc.warehouseId) {
        throw new PostingError(
          'VALIDATION_ERROR',
          'У виробничому замовленні не вказано склад списання компонентів'
        );
      }
      if (lines.length < 2) {
        throw new PostingError(
          'VALIDATION_ERROR',
          'Виробництво має містити хоча б 1 рядок готового виробу (OUTPUT) та 1 рядок комплектуючих (COMPONENT)'
        );
      }

      const dstWarehouseId = doc.targetWarehouseId || doc.warehouseId;
      const srcWh = warehouseMap.get(doc.warehouseId);
      const dstWh = warehouseMap.get(dstWarehouseId);

      let outputLines = lines.filter((l) => l.lineRole === 'OUTPUT');
      let componentLines = lines.filter((l) => l.lineRole !== 'OUTPUT');
      if (outputLines.length === 0) {
        outputLines = [lines[0]];
        componentLines = lines.slice(1);
      }

      const mainOutputItem = outputLines[0]?.itemId
        ? itemMap.get(outputLines[0].itemId)
        : undefined;

      // 1) Списуємо компоненти за FIFO у Дт 231 Кт 281
      let totalProductionCost = d(0);

      for (const comp of componentLines) {
        if (!comp.itemId) continue;
        const compItem = itemMap.get(comp.itemId);
        if (!compItem || compItem.itemType !== 'GOODS') continue;

        const qty = round4(comp.qty);
        if (qty.lte(0)) {
          throw new PostingError(
            'VALIDATION_ERROR',
            `Кількість компонента "${compItem.name}" має бути > 0`
          );
        }

        const { allocations, totalCost } = await allocateFifo(tx, {
          organizationId: doc.organizationId,
          warehouseId: doc.warehouseId,
          warehouseName: srcWh?.name ?? doc.warehouseId,
          itemId: compItem.id,
          itemName: compItem.name,
          requiredQty: toNumeric4(qty),
          asOfDate: doc.docDate,
          allowNegativeStock: org.allowNegativeStock,
          fallbackBatchDocId: doc.id,
          respectReservations: true,
        });

        totalProductionCost = totalProductionCost.plus(d(totalCost));
        await addStockMovement(doc.warehouseId, compItem.id, 'OUT', toNumeric4(qty));

        for (const alloc of allocations) {
          await tx.insert(regCostBatches).values({
            organizationId: doc.organizationId,
            recorderId: doc.id,
            period: doc.docDate,
            movementType: 'OUT',
            warehouseId: doc.warehouseId,
            itemId: compItem.id,
            batchDocId: alloc.batchDocId,
            batchDate: alloc.batchDate,
            qty: toNumeric4(d(alloc.qty).neg()),
            costAmount: toNumeric2(d(alloc.costAmount).neg()),
          });
        }

        await addGlEntry({
          dt: '231',
          kt: '281',
          amount: totalCost,
          qty,
          description: `Списання комплектуючої "${compItem.name}" у виробництво`,
          dtSub1: mainOutputItem
            ? { type: 'ITEM', id: mainOutputItem.id, label: mainOutputItem.name }
            : undefined,
          ktSub1: { type: 'WAREHOUSE', id: doc.warehouseId, label: srcWh?.name ?? '' },
          ktSub2: { type: 'ITEM', id: compItem.id, label: compItem.name },
        });

        await tx
          .update(documentLines)
          .set({
            lineRole: 'COMPONENT',
            costAmount: totalCost,
            amount: totalCost,
            price: qty.gt(0) ? toNumeric2(d(totalCost).div(qty)) : '0.00',
          })
          .where(eq(documentLines.id, comp.id));
      }

      // 2) Оприбутковуємо випущену готову продукцію Дт 281 Кт 231 за фактичною FIFO-собівартістю компонентів
      const totalOutQty = outputLines.reduce((acc, l) => acc.plus(d(l.qty)), d(0));
      if (totalOutQty.lte(0)) {
        throw new PostingError('VALIDATION_ERROR', 'Кількість випуску продукції має бути > 0');
      }

      for (const outLine of outputLines) {
        if (!outLine.itemId) continue;
        const outItem = itemMap.get(outLine.itemId);
        if (!outItem) continue;

        const outQty = round4(outLine.qty);
        const shareCost =
          outputLines.length === 1
            ? totalProductionCost
            : round2(totalProductionCost.mul(outQty).div(totalOutQty));
        const unitCost = round2(shareCost.div(outQty));

        await addStockMovement(dstWarehouseId, outItem.id, 'IN', toNumeric4(outQty));
        await tx.insert(regCostBatches).values({
          organizationId: doc.organizationId,
          recorderId: doc.id,
          period: doc.docDate,
          movementType: 'IN',
          warehouseId: dstWarehouseId,
          itemId: outItem.id,
          batchDocId: doc.id,
          batchDate: doc.docDate,
          qty: toNumeric4(outQty),
          costAmount: toNumeric2(shareCost),
        });

        await addGlEntry({
          dt: '281',
          kt: '231',
          amount: shareCost,
          qty: outQty,
          description: `Випуск готової продукції / комплекту "${outItem.name}"`,
          dtSub1: { type: 'WAREHOUSE', id: dstWarehouseId, label: dstWh?.name ?? '' },
          dtSub2: { type: 'ITEM', id: outItem.id, label: outItem.name },
          ktSub1: { type: 'ITEM', id: outItem.id, label: outItem.name },
        });

        await tx
          .update(documentLines)
          .set({
            lineRole: 'OUTPUT',
            price: toNumeric2(unitCost),
            amount: toNumeric2(shareCost),
            costAmount: toNumeric2(shareCost),
          })
          .where(eq(documentLines.id, outLine.id));
      }

      await tx
        .update(documents)
        .set({ totalAmount: toNumeric2(totalProductionCost) })
        .where(eq(documents.id, doc.id));
      break;
    }

    case 'payroll_sheet': {
      if (lines.length === 0) {
        throw new PostingError(
          'VALIDATION_ERROR',
          'Додайте співробітників до розрахункової відомості зарплати'
        );
      }

      let totalGross = d(0);
      let totalEsv = d(0);
      let totalWithheld = d(0);

      for (const line of lines) {
        const emp = line.employeeId ? empMap.get(line.employeeId) : undefined;
        const empName = emp?.fullName || line.notes || 'Співробітник';
        const empId = emp?.id || line.id;

        const gross = round2(
          d(line.amount).gt(0)
            ? line.amount
            : d(line.price).gt(0)
              ? line.price
              : (emp?.baseSalary ?? 0)
        );
        if (gross.lte(0)) continue;

        const pdfo = round2(gross.mul(0.18)); // ПДФО 18%
        const vz = round2(gross.mul(0.05)); // Військовий збір 5%
        const esv = round2(gross.mul(0.22)); // ЄСВ роботодавця 22%
        const withheld = pdfo.plus(vz);

        totalGross = totalGross.plus(gross);
        totalEsv = totalEsv.plus(esv);
        totalWithheld = totalWithheld.plus(withheld);

        const expAcc = emp?.department === 'SALES' ? '93' : '92';
        const empSub: SubkontoRef = { type: 'EMPLOYEE', id: empId, label: empName };

        // 1. Нарахування основної ЗП: Дт 92/93 Кт 661
        await addGlEntry({
          dt: expAcc,
          kt: '661',
          amount: gross,
          description: `Нараховано ЗП: ${empName}`,
          ktSub1: empSub,
        });

        // 2. Нарахування ЄСВ 22%: Дт 92/93 Кт 651
        await addGlEntry({
          dt: expAcc,
          kt: '651',
          amount: esv,
          description: `Нараховано ЄСВ (22%): ${empName}`,
          ktSub1: empSub,
        });

        // 3. Утримання ПДФО 18%: Дт 661 Кт 6411
        await addGlEntry({
          dt: '661',
          kt: '6411',
          amount: pdfo,
          description: `Утримано ПДФО (18%): ${empName}`,
          dtSub1: empSub,
          ktSub1: empSub,
        });

        // 4. Утримання Військового збору 5%: Дт 661 Кт 642
        await addGlEntry({
          dt: '661',
          kt: '642',
          amount: vz,
          description: `Утримано Військовий збір (5%): ${empName}`,
          dtSub1: empSub,
          ktSub1: empSub,
        });

        await tx
          .update(documentLines)
          .set({
            lineRole: 'EMPLOYEE',
            qty: '1.0000',
            price: toNumeric2(gross),
            amount: toNumeric2(gross),
            taxAmount: toNumeric2(withheld),
            costAmount: toNumeric2(esv),
            notes: `${empName} (На руки: ${toNumeric2(gross.minus(withheld))} ₴, ПДФО: ${toNumeric2(pdfo)}, ВЗ: ${toNumeric2(vz)}, ЄСВ: ${toNumeric2(esv)})`,
          })
          .where(eq(documentLines.id, line.id));
      }

      const totalPayrollExpense = totalGross.plus(totalEsv);
      if (totalPayrollExpense.gt(0)) {
        await tx.insert(regPnlTurnover).values({
          organizationId: doc.organizationId,
          recorderId: doc.id,
          recorderType: doc.docType,
          period: doc.docDate,
          pnlType: 'EXPENSE',
          qty: '0.0000',
          revenue: '0.00',
          cogs: '0.00',
          expense: toNumeric2(totalPayrollExpense),
          profit: toNumeric2(totalPayrollExpense.neg()),
        });
      }

      await tx
        .update(documents)
        .set({
          totalAmount: toNumeric2(totalGross),
          vatAmount: toNumeric2(totalWithheld.plus(totalEsv)),
        })
        .where(eq(documents.id, doc.id));
      break;
    }

    case 'tax_invoice': {
      const rate = doc.vatRate ?? 20;
      let gross = round2(doc.totalAmount);
      if (gross.lte(0) && lines.length > 0) {
        gross = lines.reduce(
          (acc, l) => acc.plus(d(l.amount).gt(0) ? d(l.amount) : d(l.qty).mul(d(l.price))),
          d(0)
        );
      }
      if (gross.lte(0)) {
        throw new PostingError('VALIDATION_ERROR', 'Сума податкової накладної має бути > 0');
      }

      const vat = rate > 0 ? round2(gross.mul(rate).div(100 + rate)) : d(0);
      const cp = doc.counterpartyId ? cpMap.get(doc.counterpartyId) : undefined;

      if (vat.gt(0)) {
        await addGlEntry({
          dt: '6431',
          kt: '6412',
          amount: vat,
          description: `Реєстрація податкової накладної ПДВ (${rate}%): ${cp?.name ?? ''}`,
          dtSub1: cp ? { type: 'COUNTERPARTY', id: cp.id, label: cp.name } : undefined,
        });
      }

      await tx
        .update(documents)
        .set({
          totalAmount: toNumeric2(gross),
          vatAmount: toNumeric2(vat),
        })
        .where(eq(documents.id, doc.id));
      break;
    }

    case 'depreciation_run': {
      const assets = await tx
        .select()
        .from(fixedAssets)
        .where(
          and(
            eq(fixedAssets.organizationId, doc.organizationId),
            eq(fixedAssets.status, 'ACTIVE'),
            lte(fixedAssets.commissioningDate, doc.docDate)
          )
        );

      let totalDep = d(0);

      for (const fa of assets) {
        // Рахуємо накопичений знос із регістру бухгалтерії (ідемпотентно при перепроведенні!)
        const [wearRow] = await tx
          .select({
            wear: sql<string>`COALESCE(SUM(${regAccountingEntries.amount}), 0)`,
          })
          .from(regAccountingEntries)
          .where(
            and(
              eq(regAccountingEntries.organizationId, doc.organizationId),
              eq(regAccountingEntries.creditAccountCode, fa.depreciationAccountCode),
              eq(regAccountingEntries.creditSubkonto1Id, fa.id)
            )
          );

        const priorWear = round2(wearRow?.wear ?? 0);
        const maxDepreciable = round2(d(fa.initialCost).minus(d(fa.residualValue)));
        const remaining = maxDepreciable.minus(priorWear);
        if (remaining.lte(0) || fa.usefulLifeMonths <= 0) continue;

        const monthly = round2(maxDepreciable.div(fa.usefulLifeMonths));
        const charge = monthly.gt(remaining) ? remaining : monthly;
        if (charge.lte(0)) continue;

        totalDep = totalDep.plus(charge);

        await addGlEntry({
          dt: fa.expenseAccountCode || '92',
          kt: fa.depreciationAccountCode || '131',
          amount: charge,
          description: `Амортизація ОЗ ${fa.inventoryNumber} (${fa.name})`,
          ktSub1: { type: 'ITEM', id: fa.id, label: `${fa.inventoryNumber} · ${fa.name}` },
        });

        await tx
          .update(fixedAssets)
          .set({
            accumulatedDepreciation: toNumeric2(priorWear.plus(charge)),
          })
          .where(eq(fixedAssets.id, fa.id));
      }

      if (totalDep.gt(0)) {
        await tx.insert(regPnlTurnover).values({
          organizationId: doc.organizationId,
          recorderId: doc.id,
          recorderType: doc.docType,
          period: doc.docDate,
          pnlType: 'EXPENSE',
          qty: '0.0000',
          revenue: '0.00',
          cogs: '0.00',
          expense: toNumeric2(totalDep),
          profit: toNumeric2(totalDep.neg()),
        });
      }

      await tx
        .update(documents)
        .set({ totalAmount: toNumeric2(totalDep) })
        .where(eq(documents.id, doc.id));
      break;
    }

    case 'fx_revaluation': {
      const fxAccounts = allAccs.filter(
        (a) => a.organizationId === doc.organizationId && a.currency !== 'UAH'
      );

      let totalAbsDiff = d(0);

      for (const acc of fxAccounts) {
        const [agg] = await tx
          .select({
            foreignBal: sql<string>`COALESCE(SUM(${regCashMovements.foreignAmount}), 0)`,
            uahBal: sql<string>`COALESCE(SUM(${regCashMovements.amount}), 0)`,
          })
          .from(regCashMovements)
          .where(
            and(
              eq(regCashMovements.organizationId, doc.organizationId),
              eq(regCashMovements.cashAccountId, acc.id),
              lte(regCashMovements.period, doc.docDate)
            )
          );

        const fBal = round2(agg?.foreignBal ?? 0);
        if (fBal.eq(0)) continue;

        const uahBook = round2(agg?.uahBal ?? 0);
        const rate = await getFxRateInTx(acc.currency, doc.docDate);
        const uahTarget = round2(fBal.mul(rate));
        const diff = round2(uahTarget.minus(uahBook));
        if (diff.eq(0)) continue;

        totalAbsDiff = totalAbsDiff.plus(diff.abs());

        // Записуємо курсову різницю тільки в UAH еквіваленті (foreignAmount = 0)
        await tx.insert(regCashMovements).values({
          organizationId: doc.organizationId,
          recorderId: doc.id,
          recorderType: doc.docType,
          period: doc.docDate,
          cashAccountId: acc.id,
          currency: acc.currency,
          foreignAmount: '0.00',
          exchangeRate: rate.toFixed(6),
          amount: toNumeric2(diff),
        });

        if (diff.gt(0)) {
          await addGlEntry({
            dt: '312',
            kt: '714',
            amount: diff,
            description: `Позитивна курсова різниця (${acc.currency}, курс НБУ ${rate.toFixed(4)})`,
            dtSub1: { type: 'CASH_ACCOUNT', id: acc.id, label: acc.name },
            ktSub1: { type: 'CASH_ACCOUNT', id: acc.id, label: acc.name },
          });
          await tx.insert(regPnlTurnover).values({
            organizationId: doc.organizationId,
            recorderId: doc.id,
            recorderType: doc.docType,
            period: doc.docDate,
            pnlType: 'OTHER_INCOME',
            qty: '0.0000',
            revenue: toNumeric2(diff),
            cogs: '0.00',
            expense: '0.00',
            profit: toNumeric2(diff),
          });
        } else {
          const loss = diff.abs();
          await addGlEntry({
            dt: '945',
            kt: '312',
            amount: loss,
            description: `Від’ємна курсова різниця (${acc.currency}, курс НБУ ${rate.toFixed(4)})`,
            dtSub1: { type: 'CASH_ACCOUNT', id: acc.id, label: acc.name },
            ktSub1: { type: 'CASH_ACCOUNT', id: acc.id, label: acc.name },
          });
          await tx.insert(regPnlTurnover).values({
            organizationId: doc.organizationId,
            recorderId: doc.id,
            recorderType: doc.docType,
            period: doc.docDate,
            pnlType: 'EXPENSE',
            qty: '0.0000',
            revenue: '0.00',
            cogs: '0.00',
            expense: toNumeric2(loss),
            profit: toNumeric2(loss.neg()),
          });
        }
      }

      await tx
        .update(documents)
        .set({ totalAmount: toNumeric2(totalAbsDiff) })
        .where(eq(documents.id, doc.id));
      break;
    }
  }

  await tx
    .update(documents)
    .set({
      status: 'POSTED',
      postedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(documents.id, doc.id));
}

export async function postDocument(db: AppDb, documentId: string): Promise<void> {
  await ensureChartOfAccounts(db);
  await db.transaction(async (tx) => {
    await executePostingInTx(tx, documentId);
  });
}

export async function unpostDocument(db: AppDb, documentId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const [doc] = await tx.select().from(documents).where(eq(documents.id, documentId));
    if (!doc) {
      throw new PostingError('DOCUMENT_NOT_FOUND', `Документ ${documentId} не знайдено`);
    }
    const [org] = await tx
      .select()
      .from(organizations)
      .where(eq(organizations.id, doc.organizationId));
    if (org?.lockDate && doc.docDate <= org.lockDate) {
      throw new PostingError(
        'PERIOD_LOCKED',
        `Період закрито для редагування до ${org.lockDate.toISOString().slice(0, 10)}`
      );
    }

    await clearDocumentMovements(tx, doc.id);
    await tx
      .update(documents)
      .set({
        status: 'DRAFT',
        postedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(documents.id, doc.id));
  });
}

export async function repostFromDate(
  db: AppDb,
  organizationId: string,
  fromDate: Date | string
): Promise<{ repostedCount: number; documentIds: string[] }> {
  await ensureChartOfAccounts(db);
  const start = toIsoDate(fromDate);
  return db.transaction(async (tx) => {
    const targetDocs = await tx
      .select({ id: documents.id })
      .from(documents)
      .where(
        and(
          eq(documents.organizationId, organizationId),
          eq(documents.status, 'POSTED'),
          gte(documents.docDate, start)
        )
      )
      .orderBy(asc(documents.docDate), asc(documents.createdAt), asc(documents.id));

    for (const dRow of targetDocs) {
      await clearDocumentMovements(tx, dRow.id);
    }

    for (const dRow of targetDocs) {
      await executePostingInTx(tx, dRow.id);
    }

    return {
      repostedCount: targetDocs.length,
      documentIds: targetDocs.map((x) => x.id),
    };
  });
}

export async function rebuildStockTotals(db: AppDb, organizationId: string): Promise<number> {
  return db.transaction(async (tx) => {
    await tx
      .delete(regStockTotalsMonthly)
      .where(eq(regStockTotalsMonthly.organizationId, organizationId));

    const movs = await tx
      .select()
      .from(regStockMovements)
      .where(eq(regStockMovements.organizationId, organizationId));

    const agg = new Map<
      string,
      { monthStart: Date; warehouseId: string; itemId: string; qty: ReturnType<typeof d> }
    >();

    for (const m of movs) {
      const ms = monthStartUtc(m.period);
      const key = `${ms.toISOString()}|${m.warehouseId}|${m.itemId}`;
      const existing = agg.get(key);
      if (existing) {
        existing.qty = existing.qty.plus(d(m.qty));
      } else {
        agg.set(key, {
          monthStart: ms,
          warehouseId: m.warehouseId,
          itemId: m.itemId,
          qty: d(m.qty),
        });
      }
    }

    for (const entry of agg.values()) {
      await tx.insert(regStockTotalsMonthly).values({
        organizationId,
        monthStart: entry.monthStart,
        warehouseId: entry.warehouseId,
        itemId: entry.itemId,
        qtyDelta: toNumeric4(entry.qty),
      });
    }

    return agg.size;
  });
}

export async function getDocumentMovements(db: AppDb, documentId: string) {
  const [
    stock,
    reservations,
    batches,
    settlements,
    cash,
    pnl,
    prices,
    accEntries,
    allItems,
    allWh,
    allCp,
    allAcc,
    allCf,
    allPt,
  ] = await Promise.all([
    db.select().from(regStockMovements).where(eq(regStockMovements.recorderId, documentId)),
    db.select().from(regStockReservations).where(eq(regStockReservations.recorderId, documentId)),
    db.select().from(regCostBatches).where(eq(regCostBatches.recorderId, documentId)),
    db.select().from(regSettlements).where(eq(regSettlements.recorderId, documentId)),
    db.select().from(regCashMovements).where(eq(regCashMovements.recorderId, documentId)),
    db.select().from(regPnlTurnover).where(eq(regPnlTurnover.recorderId, documentId)),
    db.select().from(regItemPrices).where(eq(regItemPrices.recorderId, documentId)),
    db
      .select()
      .from(regAccountingEntries)
      .where(eq(regAccountingEntries.recorderId, documentId))
      .orderBy(asc(regAccountingEntries.lineNo)),
    db.select().from(items),
    db.select().from(warehouses),
    db.select().from(counterparties),
    db.select().from(cashAccounts),
    db.select().from(cashflowCategories),
    db.select().from(priceTypes),
  ]);

  const itemMap = new Map(allItems.map((x) => [x.id, x]));
  const whMap = new Map(allWh.map((x) => [x.id, x]));
  const cpMap = new Map(allCp.map((x) => [x.id, x]));
  const accMap = new Map(allAcc.map((x) => [x.id, x]));
  const cfMap = new Map(allCf.map((x) => [x.id, x]));
  const ptMap = new Map(allPt.map((x) => [x.id, x]));

  return {
    accountingEntries: accEntries,
    stockMovements: stock.map((r) => ({
      ...r,
      warehouseName: whMap.get(r.warehouseId)?.name ?? r.warehouseId,
      itemName: itemMap.get(r.itemId)?.name ?? r.itemId,
      itemSku: itemMap.get(r.itemId)?.sku ?? '',
    })),
    stockReservations: reservations.map((r) => ({
      ...r,
      warehouseName: whMap.get(r.warehouseId)?.name ?? r.warehouseId,
      itemName: itemMap.get(r.itemId)?.name ?? r.itemId,
      itemSku: itemMap.get(r.itemId)?.sku ?? '',
    })),
    costBatches: batches.map((r) => ({
      ...r,
      warehouseName: whMap.get(r.warehouseId)?.name ?? r.warehouseId,
      itemName: itemMap.get(r.itemId)?.name ?? r.itemId,
    })),
    settlements: settlements.map((r) => ({
      ...r,
      counterpartyName: cpMap.get(r.counterpartyId)?.name ?? r.counterpartyId,
    })),
    cashMovements: cash.map((r) => ({
      ...r,
      cashAccountName: accMap.get(r.cashAccountId)?.name ?? r.cashAccountId,
      cashflowCategoryName: r.cashflowCategoryId
        ? (cfMap.get(r.cashflowCategoryId)?.name ?? '')
        : '',
    })),
    pnlTurnover: pnl.map((r) => ({
      ...r,
      itemName: r.itemId ? (itemMap.get(r.itemId)?.name ?? '') : '',
      counterpartyName: r.counterpartyId ? (cpMap.get(r.counterpartyId)?.name ?? '') : '',
      cashflowCategoryName: r.cashflowCategoryId
        ? (cfMap.get(r.cashflowCategoryId)?.name ?? '')
        : '',
    })),
    itemPrices: prices.map((r) => ({
      ...r,
      itemName: itemMap.get(r.itemId)?.name ?? r.itemId,
      priceTypeName: ptMap.get(r.priceTypeId)?.name ?? r.priceTypeId,
    })),
  };
}
