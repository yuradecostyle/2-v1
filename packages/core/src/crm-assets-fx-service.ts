import { and, desc, eq, lte, sql } from 'drizzle-orm';
import type { AppDb } from './db.js';
import {
  cashAccounts,
  counterparties,
  crmActivities,
  crmLeads,
  departments,
  documentLines,
  documents,
  fixedAssets,
  items,
  regCashMovements,
  regCurrencyRates,
  warehouses,
  type CrmActivityType,
  type CrmLeadStage,
} from './schema.js';
import { postDocument, PostingError } from './posting-engine.js';
import { d, round2, toIsoDate, toNumeric2 } from './money.js';

// ============================================================================
// 1. CRM-ВОРОНКА (ЛІДИ, ЕТАПИ, ЗАДАЧІ МЕНЕДЖЕРАМ, ІСТОРІЯ ДЗВІНКІВ)
// ============================================================================

export async function getCrmPipeline(
  db: AppDb,
  organizationId: string,
  departmentIds?: string[] | null
) {
  const [rawLeads, rawActivities, allCps, orgDepts] = await Promise.all([
    db
      .select()
      .from(crmLeads)
      .where(eq(crmLeads.organizationId, organizationId))
      .orderBy(desc(crmLeads.updatedAt)),
    db
      .select()
      .from(crmActivities)
      .where(eq(crmActivities.organizationId, organizationId))
      .orderBy(desc(crmActivities.createdAt)),
    db.select().from(counterparties),
    db.select().from(departments).where(eq(departments.organizationId, organizationId)),
  ]);

  const deptFilterSet = Array.isArray(departmentIds) ? new Set(departmentIds) : null;
  const leads = deptFilterSet
    ? rawLeads.filter((l) => l.departmentId !== null && deptFilterSet.has(l.departmentId))
    : rawLeads;
  const visibleLeadIds = new Set(leads.map((l) => l.id));
  const activities = deptFilterSet
    ? rawActivities.filter((a) => visibleLeadIds.has(a.leadId))
    : rawActivities;

  const cpMap = new Map(allCps.map((c) => [c.id, c.name]));
  const deptMap = new Map(orgDepts.map((dp) => [dp.id, dp.name]));
  const actsByLead = new Map<string, typeof activities>();
  for (const a of activities) {
    const arr = actsByLead.get(a.leadId) ?? [];
    arr.push(a);
    actsByLead.set(a.leadId, arr);
  }

  let totalPipelineAmount = d(0);
  let wonAmount = d(0);
  let wonCount = 0;

  const enrichedLeads = leads.map((l) => {
    const amt = d(l.expectedAmount);
    if (l.stage !== 'LOST') totalPipelineAmount = totalPipelineAmount.plus(amt);
    if (l.stage === 'WON') {
      wonAmount = wonAmount.plus(amt);
      wonCount += 1;
    }
    return {
      ...l,
      departmentName: l.departmentId ? (deptMap.get(l.departmentId) ?? '') : '',
      counterpartyName: l.counterpartyId ? (cpMap.get(l.counterpartyId) ?? '') : '',
      activities: actsByLead.get(l.id) ?? [],
    };
  });

  const conversionRate =
    leads.length > 0 ? round2(d(wonCount).div(leads.length).mul(100)) : d(0);
  const openTasksCount = activities.filter((a) => a.activityType === 'TASK' && !a.isDone).length;
  const callsCount = activities.filter((a) => a.activityType === 'CALL').length;

  return {
    leads: enrichedLeads,
    activities,
    metrics: {
      totalLeads: leads.length,
      totalPipelineAmount: toNumeric2(totalPipelineAmount),
      wonAmount: toNumeric2(wonAmount),
      wonCount,
      conversionRate: toNumeric2(conversionRate),
      openTasksCount,
      callsCount,
    },
  };
}

export async function createCrmLead(
  db: AppDb,
  params: {
    organizationId: string;
    departmentId?: string | null;
    title: string;
    counterpartyId?: string | null;
    contactName?: string;
    phone?: string;
    email?: string;
    source?: string;
    stage?: CrmLeadStage;
    expectedAmount?: number | string;
    assignedTo?: string;
    notes?: string;
  }
) {
  const [created] = await db
    .insert(crmLeads)
    .values({
      organizationId: params.organizationId,
      departmentId: params.departmentId ?? null,
      title: params.title,
      counterpartyId: params.counterpartyId ?? null,
      contactName: params.contactName ?? '',
      phone: params.phone ?? '',
      email: params.email ?? '',
      source: params.source ?? 'SITE',
      stage: params.stage ?? 'NEW',
      expectedAmount: toNumeric2(params.expectedAmount ?? 0),
      assignedTo: params.assignedTo ?? 'Бондаренко Максим',
      notes: params.notes ?? '',
    })
    .returning();
  return created;
}

export async function updateCrmLeadStage(
  db: AppDb,
  leadId: string,
  stage: CrmLeadStage
) {
  const [updated] = await db
    .update(crmLeads)
    .set({ stage, updatedAt: new Date() })
    .where(eq(crmLeads.id, leadId))
    .returning();
  return updated;
}

export async function addCrmActivity(
  db: AppDb,
  params: {
    organizationId: string;
    leadId: string;
    activityType: CrmActivityType;
    subject: string;
    outcome?: string;
    durationSec?: number;
    dueAt?: string | null;
    assignedTo?: string;
    isDone?: boolean;
  }
) {
  const [created] = await db
    .insert(crmActivities)
    .values({
      organizationId: params.organizationId,
      leadId: params.leadId,
      activityType: params.activityType,
      subject: params.subject,
      outcome: params.outcome ?? '',
      durationSec: params.durationSec ?? 0,
      dueAt: params.dueAt ? new Date(params.dueAt) : null,
      isDone: params.isDone ?? params.activityType === 'CALL',
      assignedTo: params.assignedTo ?? 'Бондаренко Максим',
    })
    .returning();

  await db
    .update(crmLeads)
    .set({ updatedAt: new Date() })
    .where(eq(crmLeads.id, params.leadId));

  return created;
}

export async function toggleCrmActivityDone(db: AppDb, activityId: string, isDone: boolean) {
  const [updated] = await db
    .update(crmActivities)
    .set({ isDone })
    .where(eq(crmActivities.id, activityId))
    .returning();
  return updated;
}

export async function convertLeadToCustomerOrder(db: AppDb, leadId: string) {
  const [lead] = await db.select().from(crmLeads).where(eq(crmLeads.id, leadId));
  if (!lead) throw new PostingError('NOT_FOUND', 'Лід CRM не знайдено');

  let cpId = lead.counterpartyId;
  if (!cpId) {
    const [newCp] = await db
      .insert(counterparties)
      .values({
        name: lead.contactName || lead.title,
        phone: lead.phone,
        email: lead.email,
        isCustomer: true,
        isSupplier: false,
      })
      .returning();
    cpId = newCp.id;
  }

  const [wh] = await db
    .select()
    .from(warehouses)
    .where(eq(warehouses.organizationId, lead.organizationId))
    .limit(1);
  const [firstItem] = await db.select().from(items).limit(1);

  const [orderDoc] = await db
    .insert(documents)
    .values({
      organizationId: lead.organizationId,
      departmentId: lead.departmentId ?? null,
      docType: 'customer_order',
      docNumber: `ЗП-CRM-${String(Date.now()).slice(-4)}`,
      docDate: new Date(),
      status: 'DRAFT',
      warehouseId: wh?.id ?? null,
      counterpartyId: cpId,
      totalAmount: lead.expectedAmount,
      comment: `Створено з CRM-угоди: ${lead.title}`,
    })
    .returning();

  if (firstItem) {
    await db.insert(documentLines).values({
      documentId: orderDoc.id,
      lineNo: 1,
      itemId: firstItem.id,
      qty: '1.0000',
      price: lead.expectedAmount,
      amount: lead.expectedAmount,
    });
  }

  await db
    .update(crmLeads)
    .set({
      stage: 'WON',
      counterpartyId: cpId,
      convertedOrderId: orderDoc.id,
      updatedAt: new Date(),
    })
    .where(eq(crmLeads.id, lead.id));

  return orderDoc;
}

// ============================================================================
// 2. ОСНОВНІ ЗАСОБИ ТА АМОРТИЗАЦІЯ (РАХУНКИ 104 / 106 / 131 — П(С)БО 7)
// ============================================================================

export async function getFixedAssetsList(db: AppDb, organizationId: string) {
  const rows = await db
    .select()
    .from(fixedAssets)
    .where(eq(fixedAssets.organizationId, organizationId))
    .orderBy(desc(fixedAssets.commissioningDate));

  let totalInitial = d(0);
  let totalDepreciation = d(0);
  let totalMonthly = d(0);

  const enriched = rows.map((fa) => {
    const initial = d(fa.initialCost);
    const residual = d(fa.residualValue);
    const accDep = d(fa.accumulatedDepreciation);
    const depreciable = initial.minus(residual);
    const monthly =
      fa.usefulLifeMonths > 0 ? round2(depreciable.div(fa.usefulLifeMonths)) : d(0);
    const bookValue = initial.minus(accDep);

    totalInitial = totalInitial.plus(initial);
    totalDepreciation = totalDepreciation.plus(accDep);
    if (fa.status === 'ACTIVE' && bookValue.gt(residual)) {
      totalMonthly = totalMonthly.plus(monthly);
    }

    return {
      ...fa,
      monthlyDepreciation: toNumeric2(monthly),
      bookValue: toNumeric2(bookValue),
    };
  });

  return {
    rows: enriched,
    totals: {
      totalInitialCost: toNumeric2(totalInitial),
      totalAccumulatedDepreciation: toNumeric2(totalDepreciation),
      totalBookValue: toNumeric2(totalInitial.minus(totalDepreciation)),
      totalMonthlyDepreciation: toNumeric2(totalMonthly),
    },
  };
}

export async function createFixedAsset(
  db: AppDb,
  params: {
    organizationId: string;
    inventoryNumber: string;
    name: string;
    accountCode?: '104' | '106';
    expenseAccountCode?: '92' | '93' | '231';
    commissioningDate: Date | string;
    initialCost: number | string;
    residualValue?: number | string;
    usefulLifeMonths: number;
    postCommissioningEntry?: boolean;
  }
) {
  const accCode = params.accountCode ?? '104';
  const commDate = toIsoDate(params.commissioningDate);
  const cost = toNumeric2(params.initialCost);

  const [created] = await db
    .insert(fixedAssets)
    .values({
      organizationId: params.organizationId,
      inventoryNumber: params.inventoryNumber,
      name: params.name,
      accountCode: accCode,
      depreciationAccountCode: '131',
      expenseAccountCode: params.expenseAccountCode ?? '92',
      commissioningDate: commDate,
      initialCost: cost,
      residualValue: toNumeric2(params.residualValue ?? 0),
      usefulLifeMonths: params.usefulLifeMonths,
      accumulatedDepreciation: '0.00',
      status: 'ACTIVE',
    })
    .returning();

  // Введення ОЗ в експлуатацію: Дт 104/106 — Кт 00 (початковий баланс / капітал)
  if (params.postCommissioningEntry !== false) {
    const [doc] = await db
      .insert(documents)
      .values({
        organizationId: params.organizationId,
        docType: 'manual_journal',
        docNumber: `ОЗ-ВВЕД-${params.inventoryNumber}`,
        docDate: commDate,
        totalAmount: cost,
        comment: `Введення основного засобу в експлуатацію: ${params.name} (${params.inventoryNumber})`,
      })
      .returning();

    await db.insert(documentLines).values({
      documentId: doc.id,
      lineNo: 1,
      debitAccountCode: accCode,
      creditAccountCode: '00',
      amount: cost,
      notes: `Введення в експлуатацію ОЗ ${params.inventoryNumber} — ${params.name}`,
    });

    await postDocument(db, doc.id);
  }

  return created;
}

export async function runMonthlyDepreciation(
  db: AppDb,
  params: { organizationId: string; periodDate: Date | string }
) {
  const dt = toIsoDate(params.periodDate);
  const ym = dt.toISOString().slice(0, 7);

  const [doc] = await db
    .insert(documents)
    .values({
      organizationId: params.organizationId,
      docType: 'depreciation_run',
      docNumber: `АМ-${ym}-${String(Date.now()).slice(-3)}`,
      docDate: dt,
      comment: `Нарахування амортизації основних засобів за ${ym} (прямолінійний метод П(С)БО 7)`,
    })
    .returning();

  await postDocument(db, doc.id);
  const [posted] = await db.select().from(documents).where(eq(documents.id, doc.id));
  return posted;
}

// ============================================================================
// 3. МУЛЬТИВАЛЮТНИЙ ОБЛІК (USD/EUR), КУРСИ НБУ ТА КУРСОВІ РІЗНИЦІ (П(С)БО 21)
// ============================================================================

export async function getCurrencyRates(db: AppDb) {
  const rows = await db
    .select()
    .from(regCurrencyRates)
    .orderBy(desc(regCurrencyRates.rateDate), desc(regCurrencyRates.createdAt))
    .limit(40);

  const latestUsd = rows.find((r) => r.currencyCode === 'USD');
  const latestEur = rows.find((r) => r.currencyCode === 'EUR');

  return {
    latest: {
      USD: latestUsd?.rate ?? '41.500000',
      EUR: latestEur?.rate ?? '44.800000',
    },
    history: rows,
  };
}

export async function getLatestExchangeRate(
  db: AppDb,
  currencyCode: string,
  asOfDate: Date | string
): Promise<string> {
  if (currencyCode === 'UAH') return '1.000000';
  const dt = toIsoDate(asOfDate);
  const [row] = await db
    .select()
    .from(regCurrencyRates)
    .where(
      and(
        eq(regCurrencyRates.currencyCode, currencyCode),
        lte(regCurrencyRates.rateDate, dt)
      )
    )
    .orderBy(desc(regCurrencyRates.rateDate), desc(regCurrencyRates.createdAt))
    .limit(1);

  if (row) return row.rate;
  return currencyCode === 'USD' ? '41.500000' : currencyCode === 'EUR' ? '44.800000' : '1.000000';
}

export async function syncNbuCurrencyRates(
  db: AppDb,
  params?: { date?: Date | string; manualRates?: { USD?: number; EUR?: number } }
) {
  const rateDate = toIsoDate(params?.date ?? new Date());
  let usdRate = params?.manualRates?.USD;
  let eurRate = params?.manualRates?.EUR;
  let source = params?.manualRates ? 'MANUAL' : 'NBU_API';

  if (!usdRate || !eurRate) {
    try {
      const yyyymmdd = rateDate.toISOString().slice(0, 10).replace(/-/g, '');
      const url = `https://bank.gov.ua/NBUStatService/v1/statdirectory/exchange?date=${yyyymmdd}&json`;
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (res.ok) {
        const data = (await res.json()) as Array<{ cc: string; rate: number }>;
        const u = data.find((x) => x.cc === 'USD');
        const e = data.find((x) => x.cc === 'EUR');
        if (u?.rate) usdRate = u.rate;
        if (e?.rate) eurRate = e.rate;
      }
    } catch {
      // Fallback official-like rates if offline or future test date
      source = 'NBU_FALLBACK';
    }
  }

  const finalUsd = (usdRate ?? 41.65).toFixed(6);
  const finalEur = (eurRate ?? 44.92).toFixed(6);

  await db.insert(regCurrencyRates).values([
    { currencyCode: 'USD', rateDate, rate: finalUsd, source },
    { currencyCode: 'EUR', rateDate, rate: finalEur, source },
  ]);

  return {
    rateDate: rateDate.toISOString(),
    source,
    USD: finalUsd,
    EUR: finalEur,
  };
}

export async function getForeignCurrencyBalances(
  db: AppDb,
  params: { organizationId: string; asOfDate: Date | string }
) {
  const dt = toIsoDate(params.asOfDate);
  const fxAccounts = await db
    .select()
    .from(cashAccounts)
    .where(eq(cashAccounts.organizationId, params.organizationId));

  const nonUah = fxAccounts.filter((a) => a.currency !== 'UAH');
  const results = [];

  for (const acc of nonUah) {
    const [agg] = await db
      .select({
        foreignBal: sql<string>`COALESCE(SUM(${regCashMovements.foreignAmount}), 0)`,
        uahBal: sql<string>`COALESCE(SUM(${regCashMovements.amount}), 0)`,
      })
      .from(regCashMovements)
      .where(
        and(
          eq(regCashMovements.organizationId, params.organizationId),
          eq(regCashMovements.cashAccountId, acc.id),
          lte(regCashMovements.period, dt)
        )
      );

    const fBal = round2(agg?.foreignBal ?? 0);
    const uahBook = round2(agg?.uahBal ?? 0);
    const currentRate = await getLatestExchangeRate(db, acc.currency, dt);
    const uahTarget = round2(fBal.mul(d(currentRate)));
    const fxDiff = round2(uahTarget.minus(uahBook));

    results.push({
      cashAccountId: acc.id,
      name: acc.name,
      currency: acc.currency,
      iban: acc.iban,
      foreignBalance: toNumeric2(fBal),
      uahBookBalance: toNumeric2(uahBook),
      currentRate,
      uahRevaluedBalance: toNumeric2(uahTarget),
      unrealizedFxDiff: toNumeric2(fxDiff),
    });
  }

  return results;
}

export async function runCurrencyRevaluation(
  db: AppDb,
  params: { organizationId: string; asOfDate: Date | string }
) {
  const dt = toIsoDate(params.asOfDate);
  const [doc] = await db
    .insert(documents)
    .values({
      organizationId: params.organizationId,
      docType: 'fx_revaluation',
      docNumber: `КР-${dt.toISOString().slice(0, 10)}-${String(Date.now()).slice(-3)}`,
      docDate: dt,
      comment: `Переоцінка валютних рахунків за курсом НБУ на ${dt.toISOString().slice(0, 10)} (П(С)БО 21)`,
    })
    .returning();

  await postDocument(db, doc.id);
  const [posted] = await db.select().from(documents).where(eq(documents.id, doc.id));
  return posted;
}
