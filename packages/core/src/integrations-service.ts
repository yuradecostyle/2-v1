import { and, desc, eq } from 'drizzle-orm';
import type { AppDb } from './db.js';
import {
  cashAccounts,
  cashflowCategories,
  counterparties,
  documentLines,
  documents,
  integrationConfigs,
  integrationSyncLogs,
  items,
  warehouses,
  type IntegrationProvider,
} from './schema.js';
import { postDocument, PostingError } from './posting-engine.js';
import { d, round2, toNumeric2, toNumeric4 } from './money.js';

export async function getIntegrationConfigs(db: AppDb, organizationId: string) {
  const existing = await db
    .select()
    .from(integrationConfigs)
    .where(eq(integrationConfigs.organizationId, organizationId));

  const providers: IntegrationProvider[] = ['BAS_ODATA', 'MONOBANK', 'PRIVAT24', 'CHECKBOX'];
  const map = new Map(existing.map((c) => [c.provider, c]));

  for (const p of providers) {
    if (!map.has(p)) {
      const defaultCfg =
        p === 'BAS_ODATA'
          ? {
              baseUrl: 'http://127.0.0.1:8080/bas_ut/odata/standard.odata',
              username: 'Адміністратор',
              password: '',
            }
          : p === 'MONOBANK'
            ? { token: '', accountId: '0' }
            : p === 'PRIVAT24'
              ? { clientId: '', token: '', iban: 'UA213052990000026007015012345' }
              : {
                  apiUrl: 'https://api.checkbox.ua/api/v1',
                  licenseKey: '',
                  login: '',
                  password: '',
                };

      const [created] = await db
        .insert(integrationConfigs)
        .values({
          organizationId,
          provider: p,
          mode: 'DEMO',
          isEnabled: true,
          configJson: JSON.stringify(defaultCfg),
        })
        .returning();
      map.set(p, created);
    }
  }

  const logs = await db
    .select()
    .from(integrationSyncLogs)
    .where(eq(integrationSyncLogs.organizationId, organizationId))
    .orderBy(desc(integrationSyncLogs.createdAt))
    .limit(20);

  return {
    configs: Array.from(map.values()).map((c) => ({
      ...c,
      config: JSON.parse(c.configJson || '{}'),
    })),
    logs,
  };
}

export async function saveIntegrationConfig(
  db: AppDb,
  params: {
    organizationId: string;
    provider: IntegrationProvider;
    mode: 'DEMO' | 'LIVE';
    config: Record<string, unknown>;
  }
) {
  const [existing] = await db
    .select()
    .from(integrationConfigs)
    .where(
      and(
        eq(integrationConfigs.organizationId, params.organizationId),
        eq(integrationConfigs.provider, params.provider)
      )
    );

  if (existing) {
    const [updated] = await db
      .update(integrationConfigs)
      .set({
        mode: params.mode,
        configJson: JSON.stringify(params.config),
        updatedAt: new Date(),
      })
      .where(eq(integrationConfigs.id, existing.id))
      .returning();
    return updated;
  }

  const [created] = await db
    .insert(integrationConfigs)
    .values({
      organizationId: params.organizationId,
      provider: params.provider,
      mode: params.mode,
      configJson: JSON.stringify(params.config),
    })
    .returning();
  return created;
}

async function recordSyncLog(
  db: AppDb,
  organizationId: string,
  provider: IntegrationProvider,
  status: 'SUCCESS' | 'ERROR',
  summary: string,
  details: Record<string, unknown> = {}
) {
  await db.insert(integrationSyncLogs).values({
    organizationId,
    provider,
    status,
    summary,
    detailsJson: JSON.stringify(details),
  });
  await db
    .update(integrationConfigs)
    .set({ lastSyncAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(integrationConfigs.organizationId, organizationId),
        eq(integrationConfigs.provider, provider)
      )
    );
}

// ============================================================================
// 1. ПРЯМИЙ КОНЕКТОР ДО BAS STANDARD OData v3/v4
// ============================================================================

interface BasOdataItem {
  Ref_Key: string;
  Code?: string;
  Артикул?: string;
  Description: string;
  ВидНоменклатури?: string;
  Послуга?: boolean;
}

interface BasOdataCounterparty {
  Ref_Key: string;
  Description: string;
  КодПоЄДРПОУ?: string;
  ЄДРПОУ?: string;
  Покупець?: boolean;
  Постачальник?: boolean;
}

interface BasOdataBalance {
  Номенклатура_Key: string;
  КоличествоBalance: number;
  СуммаBalance: number;
}

const DEMO_ODATA_PAYLOAD = {
  items: [
    {
      Ref_Key: '8a110015-5d01-11ef-9a10-005056991101',
      Артикул: 'ODATA-UPS1500',
      Description: 'ДБЖ Eaton Ellipse PRO 1600VA (імпорт OData BAS)',
      Послуга: false,
    },
    {
      Ref_Key: '8a110015-5d01-11ef-9a10-005056991102',
      Артикул: 'ODATA-SW24',
      Description: 'Комутатор Cisco CBS250-24T-4G (імпорт OData BAS)',
      Послуга: false,
    },
    {
      Ref_Key: '8a110015-5d01-11ef-9a10-005056991103',
      Артикул: 'ODATA-SRV',
      Description: 'Аудит ІТ-інфраструктури (імпорт OData BAS)',
      Послуга: true,
    },
  ] as BasOdataItem[],
  counterparties: [
    {
      Ref_Key: '9b220015-5d01-11ef-9a10-005056992201',
      Description: 'ТОВ «ДатаЦентр Альянс»',
      КодПоЄДРПОУ: '38901472',
      Покупець: true,
      Постачальник: false,
    },
    {
      Ref_Key: '9b220015-5d01-11ef-9a10-005056992202',
      Description: 'ТОВ «Нетворк Дистрибуція Україна»',
      КодПоЄДРПОУ: '41098234',
      Покупець: false,
      Постачальник: true,
    },
  ] as BasOdataCounterparty[],
  balances: [
    {
      Номенклатура_Key: '8a110015-5d01-11ef-9a10-005056991101',
      КоличествоBalance: 4,
      СуммаBalance: 46000,
    },
    {
      Номенклатура_Key: '8a110015-5d01-11ef-9a10-005056991102',
      КоличествоBalance: 3,
      СуммаBalance: 51000,
    },
  ] as BasOdataBalance[],
};

export async function syncFromBasOdata(
  db: AppDb,
  params: { organizationId: string; warehouseId?: string }
) {
  const { configs } = await getIntegrationConfigs(db, params.organizationId);
  const cfgRow = configs.find((c) => c.provider === 'BAS_ODATA')!;
  const cfg = cfgRow.config as { baseUrl?: string; username?: string; password?: string };

  let odataItems: BasOdataItem[] = [];
  let odataCps: BasOdataCounterparty[] = [];
  let odataBalances: BasOdataBalance[] = [];

  try {
    if (cfgRow.mode === 'LIVE') {
      if (!cfg.baseUrl) {
        throw new Error('Вкажіть URL публікації OData BAS (напр. http://server/base/odata/standard.odata)');
      }
      const base = cfg.baseUrl.replace(/\/+$/, '');
      const auth = Buffer.from(`${cfg.username ?? ''}:${cfg.password ?? ''}`, 'utf8').toString(
        'base64'
      );
      const headers = {
        Accept: 'application/json',
        Authorization: `Basic ${auth}`,
      };

      const [itRes, cpRes, balRes] = await Promise.all([
        fetch(`${base}/${encodeURIComponent('Catalog_Номенклатура')}?$format=json&$top=500`, {
          headers,
        }),
        fetch(`${base}/${encodeURIComponent('Catalog_Контрагенти')}?$format=json&$top=500`, {
          headers,
        }),
        fetch(
          `${base}/${encodeURIComponent('AccumulationRegister_ТовариНаСкладах_Balance')}?$format=json`,
          { headers }
        ).catch(() => null),
      ]);

      if (!itRes.ok) {
        throw new Error(`Помилка запиту до OData BAS Catalog_Номенклатура: HTTP ${itRes.status}`);
      }
      const itJson = (await itRes.json()) as { value?: BasOdataItem[] };
      const cpJson = cpRes.ok
        ? ((await cpRes.json()) as { value?: BasOdataCounterparty[] })
        : { value: [] };
      const balJson =
        balRes && balRes.ok
          ? ((await balRes.json()) as { value?: BasOdataBalance[] })
          : { value: [] };

      odataItems = itJson.value ?? [];
      odataCps = cpJson.value ?? [];
      odataBalances = balJson.value ?? [];
    } else {
      odataItems = DEMO_ODATA_PAYLOAD.items;
      odataCps = DEMO_ODATA_PAYLOAD.counterparties;
      odataBalances = DEMO_ODATA_PAYLOAD.balances;
    }

    // 1) Ідемпотентна синхронізація Номенклатури по Ref_Key / SKU
    const existingItems = await db.select().from(items);
    const itemByExt = new Map(existingItems.filter((i) => i.externalId).map((i) => [i.externalId, i]));
    const itemBySku = new Map(existingItems.map((i) => [i.sku.toLowerCase(), i]));

    let itemsCreated = 0;
    let itemsUpdated = 0;

    for (const raw of odataItems) {
      const sku = raw.Артикул || raw.Code || `OD-${raw.Ref_Key.slice(0, 6)}`;
      const itemType =
        raw.Послуга || raw.ВидНоменклатури?.toLowerCase().includes('послуг') ? 'SERVICE' : 'GOODS';

      const found = itemByExt.get(raw.Ref_Key) ?? itemBySku.get(sku.toLowerCase());
      if (found) {
        await db
          .update(items)
          .set({ name: raw.Description, sku, itemType, externalId: raw.Ref_Key })
          .where(eq(items.id, found.id));
        itemByExt.set(raw.Ref_Key, { ...found, name: raw.Description, sku, externalId: raw.Ref_Key });
        itemsUpdated++;
      } else {
        const [ins] = await db
          .insert(items)
          .values({
            sku,
            name: raw.Description,
            unit: itemType === 'SERVICE' ? 'посл' : 'шт',
            itemType,
            externalId: raw.Ref_Key,
          })
          .returning();
        itemByExt.set(raw.Ref_Key, ins);
        itemBySku.set(sku.toLowerCase(), ins);
        itemsCreated++;
      }
    }

    // 2) Ідемпотентна синхронізація Контрагентів по Ref_Key / ЄДРПОУ
    const existingCps = await db.select().from(counterparties);
    const cpByExt = new Map(existingCps.filter((c) => c.externalId).map((c) => [c.externalId, c]));
    const cpByEdrpou = new Map(existingCps.filter((c) => c.edrpou).map((c) => [c.edrpou, c]));

    let cpsCreated = 0;
    let cpsUpdated = 0;

    for (const raw of odataCps) {
      const edrpou = raw.КодПоЄДРПОУ ?? raw.ЄДРПОУ ?? '';
      const found = cpByExt.get(raw.Ref_Key) ?? (edrpou ? cpByEdrpou.get(edrpou) : undefined);
      const isCustomer = raw.Покупець ?? true;
      const isSupplier = raw.Постачальник ?? false;

      if (found) {
        await db
          .update(counterparties)
          .set({
            name: raw.Description,
            edrpou,
            isCustomer,
            isSupplier,
            externalId: raw.Ref_Key,
          })
          .where(eq(counterparties.id, found.id));
        cpsUpdated++;
      } else {
        await db.insert(counterparties).values({
          name: raw.Description,
          edrpou,
          isCustomer,
          isSupplier,
          externalId: raw.Ref_Key,
        });
        cpsCreated++;
      }
    }

    // 3) Ідемпотентний імпорт залишків OData (створюється документ тільки якщо ще не був завантажений)
    let balanceDocNumber: string | null = null;
    const syncExternalKey = `ODATA-BAL-${cfgRow.mode}`;
    const [existingBalDoc] = await db
      .select()
      .from(documents)
      .where(
        and(
          eq(documents.organizationId, params.organizationId),
          eq(documents.externalId, syncExternalKey)
        )
      );

    if (!existingBalDoc && odataBalances.length > 0) {
      const [defaultWh] = await db
        .select()
        .from(warehouses)
        .where(eq(warehouses.organizationId, params.organizationId))
        .limit(1);
      const targetWhId = params.warehouseId || defaultWh?.id;

      if (targetWhId) {
        const validLines = odataBalances
          .map((b, idx) => {
            const it = itemByExt.get(b.Номенклатура_Key);
            if (!it || b.КоличествоBalance <= 0) return null;
            const qty = d(b.КоличествоBalance);
            const amt = d(b.СуммаBalance);
            const price = round2(amt.div(qty));
            return {
              lineNo: idx + 1,
              itemId: it.id,
              warehouseId: targetWhId,
              qty: toNumeric4(qty),
              price: toNumeric2(price),
              amount: toNumeric2(amt),
            };
          })
          .filter((x): x is NonNullable<typeof x> => x !== null);

        if (validLines.length > 0) {
          const total = validLines.reduce((acc, l) => acc.plus(d(l.amount)), d(0));
          const [doc] = await db
            .insert(documents)
            .values({
              organizationId: params.organizationId,
              docType: 'opening_balance',
              docNumber: 'ВПЗ-ODATA-01',
              docDate: new Date('2026-11-20T09:00:00Z'),
              warehouseId: targetWhId,
              totalAmount: toNumeric2(total),
              externalId: syncExternalKey,
              comment: `Прямий імпорт залишків із BAS OData (${cfgRow.mode})`,
            })
            .returning();

          await db
            .insert(documentLines)
            .values(validLines.map((l) => ({ ...l, documentId: doc.id })));
          await postDocument(db, doc.id);
          balanceDocNumber = doc.docNumber;
        }
      }
    }

    const summary = `OData (${cfgRow.mode}): товари +${itemsCreated}/оновл.${itemsUpdated}, контрагенти +${cpsCreated}/оновл.${cpsUpdated}${
      balanceDocNumber ? `, проведено залишки ${balanceDocNumber}` : ''
    }`;
    await recordSyncLog(db, params.organizationId, 'BAS_ODATA', 'SUCCESS', summary, {
      itemsCreated,
      itemsUpdated,
      cpsCreated,
      cpsUpdated,
      balanceDocNumber,
    });

    return {
      mode: cfgRow.mode,
      summary,
      itemsCreated,
      itemsUpdated,
      cpsCreated,
      cpsUpdated,
      balanceDocNumber,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Помилка OData';
    await recordSyncLog(db, params.organizationId, 'BAS_ODATA', 'ERROR', msg);
    throw err;
  }
}

// ============================================================================
// 2. ІНТЕГРАЦІЯ З MONOBANK ТА ПРИВАТ24 AUTOCLIENT (АВТОІМПОРТ ВИПИСОК)
// ============================================================================

interface NormalizedBankTx {
  externalId: string;
  occurredAt: Date;
  amount: number; // + in, - out (in UAH)
  counterEdrpou: string;
  counterName: string;
  description: string;
}

async function importNormalizedBankStatement(
  db: AppDb,
  params: {
    organizationId: string;
    provider: 'MONOBANK' | 'PRIVAT24';
    cashAccountId: string;
    transactions: NormalizedBankTx[];
  }
) {
  const [existingDocs, allCps, allCf] = await Promise.all([
    db
      .select({ externalId: documents.externalId })
      .from(documents)
      .where(eq(documents.organizationId, params.organizationId)),
    db.select().from(counterparties),
    db.select().from(cashflowCategories),
  ]);

  const seenExt = new Set(existingDocs.filter((x) => x.externalId).map((x) => x.externalId));
  const cpByEdrpou = new Map(allCps.filter((c) => c.edrpou).map((c) => [c.edrpou.trim(), c]));
  const cfIn = allCf.find((c) => c.direction === 'IN');
  const cfSup = allCf.find((c) => c.direction === 'OUT' && !c.isOperatingExpense);
  const cfExp = allCf.find((c) => c.direction === 'OUT' && c.isOperatingExpense);

  let imported = 0;
  let skippedDuplicates = 0;

  for (const tx of params.transactions) {
    if (seenExt.has(tx.externalId)) {
      skippedDuplicates++;
      continue;
    }
    if (tx.amount === 0) continue;

    const isIncoming = tx.amount > 0;
    const absAmount = Math.abs(tx.amount);

    // Авторозпізнавання або створення контрагента за ЄДРПОУ
    let cp = tx.counterEdrpou ? cpByEdrpou.get(tx.counterEdrpou.trim()) : undefined;
    if (!cp && tx.counterName && tx.counterEdrpou) {
      const [createdCp] = await db
        .insert(counterparties)
        .values({
          name: tx.counterName,
          edrpou: tx.counterEdrpou.trim(),
          isCustomer: isIncoming,
          isSupplier: !isIncoming,
        })
        .returning();
      cp = createdCp;
      cpByEdrpou.set(tx.counterEdrpou.trim(), cp);
    }

    const isBankFeeOrOpEx =
      !isIncoming &&
      (tx.description.toLowerCase().includes('коміс') ||
        tx.description.toLowerCase().includes('доставк') ||
        tx.description.toLowerCase().includes('нова пошта') ||
        tx.description.toLowerCase().includes('оренда'));

    const docType = isIncoming ? 'money_in' : 'money_out';
    const prefix = params.provider === 'MONOBANK' ? 'MONO' : 'P24';

    const [createdDoc] = await db
      .insert(documents)
      .values({
        organizationId: params.organizationId,
        docType,
        docNumber: `${prefix}-${tx.externalId.slice(-6).toUpperCase()}`,
        docDate: tx.occurredAt,
        cashAccountId: params.cashAccountId,
        counterpartyId: isBankFeeOrOpEx ? null : (cp?.id ?? null),
        cashflowCategoryId: isIncoming
          ? (cfIn?.id ?? null)
          : isBankFeeOrOpEx
            ? (cfExp?.id ?? null)
            : (cfSup?.id ?? null),
        totalAmount: toNumeric2(absAmount),
        externalId: tx.externalId,
        comment: `[${params.provider}] ${tx.description}`,
      })
      .returning();

    await postDocument(db, createdDoc.id);
    seenExt.add(tx.externalId);
    imported++;
  }

  return { imported, skippedDuplicates };
}

export async function syncBankStatement(
  db: AppDb,
  params: {
    organizationId: string;
    provider: 'MONOBANK' | 'PRIVAT24';
    cashAccountId?: string;
  }
) {
  const { configs } = await getIntegrationConfigs(db, params.organizationId);
  const cfgRow = configs.find((c) => c.provider === params.provider)!;
  const cfg = cfgRow.config as Record<string, string>;

  const [defaultBankAcc] = await db
    .select()
    .from(cashAccounts)
    .where(
      and(
        eq(cashAccounts.organizationId, params.organizationId),
        eq(cashAccounts.accountType, 'BANK')
      )
    )
    .limit(1);

  const targetCashAccId = params.cashAccountId || defaultBankAcc?.id;
  if (!targetCashAccId) {
    throw new PostingError('VALIDATION_ERROR', 'Створіть хоча б один банківський рахунок у довіднику');
  }

  try {
    let txs: NormalizedBankTx[] = [];

    if (params.provider === 'MONOBANK') {
      if (cfgRow.mode === 'LIVE') {
        if (!cfg.token) {
          throw new Error('Вкажіть X-Token для Monobank API у налаштуваннях інтеграції');
        }
        const toUnix = Math.floor(Date.now() / 1000);
        const fromUnix = toUnix - 25 * 86400; // останні 25 діб (ліміт Monobank API <= 31 доба)
        const accId = cfg.accountId || '0';
        const res = await fetch(
          `https://api.monobank.ua/personal/statement/${accId}/${fromUnix}/${toUnix}`,
          {
            headers: { 'X-Token': cfg.token },
          }
        );
        if (!res.ok) {
          throw new Error(`Помилка Monobank API: HTTP ${res.status}`);
        }
        const raw = (await res.json()) as Array<{
          id: string;
          time: number;
          amount: number;
          description: string;
          counterEdrpou?: string;
          counterName?: string;
        }>;
        txs = raw.map((r) => ({
          externalId: `MONO:${r.id}`,
          occurredAt: new Date(r.time * 1000),
          amount: r.amount / 100,
          counterEdrpou: r.counterEdrpou ?? '',
          counterName: r.counterName ?? '',
          description: r.description,
        }));
      } else {
        txs = [
          {
            externalId: 'MONO:demo_tx_8001',
            occurredAt: new Date('2026-11-21T11:20:00Z'),
            amount: 83150.0,
            counterEdrpou: '40872195',
            counterName: 'ТОВ «СофтСфера Україна»',
            description: 'Остаточна оплата за рахунком ВН-00001 згідно договору №45',
          },
          {
            externalId: 'MONO:demo_tx_8002',
            occurredAt: new Date('2026-11-22T14:40:00Z'),
            amount: -1850.0,
            counterEdrpou: '31316718',
            counterName: 'ТОВ «Нова Пошта»',
            description: 'Оплата послуг експрес-доставки замовлень клієнтам',
          },
        ];
      }
    } else {
      // PRIVAT24 AUTOCLIENT
      if (cfgRow.mode === 'LIVE') {
        if (!cfg.token || !cfg.clientId) {
          throw new Error('Вкажіть Client ID та Token Автоклієнта Приват24 у налаштуваннях');
        }
        const startDate = '01-11-2026';
        const url = `https://acp.privatbank.ua/api/statements/transactions?acc=${encodeURIComponent(
          cfg.iban ?? ''
        )}&startDate=${startDate}`;
        const res = await fetch(url, {
          headers: {
            id: cfg.clientId,
            token: cfg.token,
            'Content-Type': 'application/json;charset=utf8',
          },
        });
        if (!res.ok) {
          throw new Error(`Помилка Приват24 Autoclient API: HTTP ${res.status}`);
        }
        const data = (await res.json()) as {
          transactions?: Array<{
            ID?: string;
            REF?: string;
            DAT_OD?: string;
            SUM_E?: string;
            TRANTYPE?: string;
            AUT_CNTR_CRF?: string;
            AUT_CNTR_NAM?: string;
            OSND?: string;
          }>;
        };
        txs = (data.transactions ?? []).map((t) => {
          const sum = Number(t.SUM_E ?? 0);
          const signed = t.TRANTYPE === 'C' ? sum : -sum;
          return {
            externalId: `P24:${t.ID ?? t.REF ?? Math.random().toString(36).slice(2)}`,
            occurredAt: new Date(),
            amount: signed,
            counterEdrpou: t.AUT_CNTR_CRF ?? '',
            counterName: t.AUT_CNTR_NAM ?? '',
            description: t.OSND ?? 'Банківська операція Приват24',
          };
        });
      } else {
        txs = [
          {
            externalId: 'P24:demo_ref_9101',
            occurredAt: new Date('2026-11-23T10:15:00Z'),
            amount: 74850.0,
            counterEdrpou: '3214509871',
            counterName: 'ФОП Коваленко Олександр Ігорович',
            description: 'Оплата за накладною ВН-00003 без ПДВ',
          },
          {
            externalId: 'P24:demo_ref_9102',
            occurredAt: new Date('2026-11-23T17:00:00Z'),
            amount: -350.0,
            counterEdrpou: '14360570',
            counterName: 'АТ КБ «ПриватБанк»',
            description: 'Комісія за розрахунково-касове обслуговування рахунку',
          },
        ];
      }
    }

    const res = await importNormalizedBankStatement(db, {
      organizationId: params.organizationId,
      provider: params.provider,
      cashAccountId: targetCashAccId,
      transactions: txs,
    });

    const summary = `${params.provider} (${cfgRow.mode}): створено та проведено ${res.imported} платіжних документів (пропущено дублікатів: ${res.skippedDuplicates})`;
    await recordSyncLog(db, params.organizationId, params.provider, 'SUCCESS', summary, res);

    return {
      mode: cfgRow.mode,
      summary,
      ...res,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Помилка синхронізації банку';
    await recordSyncLog(db, params.organizationId, params.provider, 'ERROR', msg);
    throw err;
  }
}

// ============================================================================
// 3. CHECKBOX ПРРО — ФІСКАЛІЗАЦІЯ ВИДАТКОВИХ НАКЛАДНИХ У ДПС
// ============================================================================

export async function fiscalizeSalesInvoiceCheckbox(
  db: AppDb,
  params: { documentId: string; paymentType?: 'CASH' | 'CASHLESS' }
) {
  const [doc] = await db.select().from(documents).where(eq(documents.id, params.documentId));
  if (!doc) {
    throw new PostingError('DOCUMENT_NOT_FOUND', 'Документ для фіскалізації не знайдено');
  }
  if (doc.docType !== 'sales_invoice') {
    throw new PostingError(
      'VALIDATION_ERROR',
      'Фіскалізувати в ПРРО можна лише видаткову накладну (sales_invoice)'
    );
  }
  if (doc.fiscalCode) {
    return {
      alreadyFiscalized: true,
      fiscalReceiptId: doc.fiscalReceiptId,
      fiscalCode: doc.fiscalCode,
      fiscalUrl: doc.fiscalUrl,
    };
  }

  const { configs } = await getIntegrationConfigs(db, doc.organizationId);
  const cfgRow = configs.find((c) => c.provider === 'CHECKBOX')!;
  const cfg = cfgRow.config as {
    apiUrl?: string;
    licenseKey?: string;
    login?: string;
    password?: string;
  };

  const [lines, allItems] = await Promise.all([
    db.select().from(documentLines).where(eq(documentLines.documentId, doc.id)),
    db.select().from(items),
  ]);
  const itemMap = new Map(allItems.map((i) => [i.id, i]));

  try {
    let fiscalReceiptId = '';
    let fiscalCode = '';
    let fiscalUrl = '';

    if (cfgRow.mode === 'LIVE') {
      if (!cfg.login || !cfg.password || !cfg.licenseKey) {
        throw new Error('Заповніть login, password та licenseKey каси Checkbox у налаштуваннях');
      }
      const apiUrl = (cfg.apiUrl || 'https://api.checkbox.ua/api/v1').replace(/\/+$/, '');

      const authRes = await fetch(`${apiUrl}/cashier/signin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ login: cfg.login, password: cfg.password }),
      });
      if (!authRes.ok) {
        throw new Error(`Помилка авторизації касира Checkbox: HTTP ${authRes.status}`);
      }
      const { access_token: token } = (await authRes.json()) as { access_token: string };

      const receiptPayload = {
        goods: lines.map((l) => {
          const it = l.itemId ? itemMap.get(l.itemId) : undefined;
          return {
            good: {
              code: it?.sku ?? l.id,
              name: it?.name ?? 'Товар',
              price: Math.round(Number(l.price) * 100),
            },
            quantity: Math.round(Number(l.qty) * 1000),
          };
        }),
        payments: [
          {
            type: params.paymentType ?? 'CASHLESS',
            value: Math.round(Number(doc.totalAmount) * 100),
          },
        ],
      };

      const sellRes = await fetch(`${apiUrl}/receipts/sell`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'X-License-Key': cfg.licenseKey,
        },
        body: JSON.stringify(receiptPayload),
      });
      if (!sellRes.ok) {
        throw new Error(`Помилка фіскалізації чека Checkbox: HTTP ${sellRes.status}`);
      }
      const sellData = (await sellRes.json()) as { id: string; fiscal_code?: string };
      fiscalReceiptId = sellData.id;
      fiscalCode = sellData.fiscal_code || `CB-${sellData.id.slice(0, 8).toUpperCase()}`;
      fiscalUrl = `https://cabinet.tax.gov.ua/cashregs/check?id=${encodeURIComponent(fiscalCode)}`;
    } else {
      // DEMO SANDBOX ПРРО CHECKBOX
      const numericHash = Math.abs(
        doc.id.split('').reduce((acc, ch) => (acc * 31 + ch.charCodeAt(0)) | 0, 7)
      );
      fiscalCode = `400${String(numericHash).slice(0, 7).padEnd(7, '5')}`;
      fiscalReceiptId = `cbx-demo-${doc.id.slice(0, 8)}`;
      const dateParam = doc.docDate.toISOString().slice(0, 10).replace(/-/g, '');
      fiscalUrl = `https://cabinet.tax.gov.ua/cashregs/check?fn=4000192837&id=${fiscalCode}&date=${dateParam}&sum=${doc.totalAmount}`;
    }

    await db
      .update(documents)
      .set({
        fiscalReceiptId,
        fiscalCode,
        fiscalUrl,
        updatedAt: new Date(),
      })
      .where(eq(documents.id, doc.id));

    const summary = `Фіскалізовано чек ПРРО №${fiscalCode} для накладної ${doc.docNumber} на суму ${doc.totalAmount} ₴ (${cfgRow.mode})`;
    await recordSyncLog(db, doc.organizationId, 'CHECKBOX', 'SUCCESS', summary, {
      documentId: doc.id,
      docNumber: doc.docNumber,
      fiscalCode,
      fiscalUrl,
    });

    return {
      alreadyFiscalized: false,
      mode: cfgRow.mode,
      fiscalReceiptId,
      fiscalCode,
      fiscalUrl,
      totalAmount: doc.totalAmount,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Помилка Checkbox ПРРО';
    await recordSyncLog(db, doc.organizationId, 'CHECKBOX', 'ERROR', msg);
    throw err;
  }
}
