import { count, eq } from 'drizzle-orm';
import type { AppDb } from './db.js';
import {
  cashAccounts,
  cashflowCategories,
  categories,
  contracts,
  counterparties,
  documentLines,
  documents,
  employees,
  bomSpecs,
  bomSpecLines,
  crmLeads,
  crmActivities,
  fixedAssets,
  regCurrencyRates,
  items,
  organizations,
  priceTypes,
  regAccountingEntries,
  warehouses,
} from './schema.js';
import { postDocument, repostFromDate } from './posting-engine.js';
import { ensureChartOfAccounts } from './accounting-service.js';
import { ensureDefaultUsers, recordAuditLog } from './print-and-rbac.js';
import {
  createFixedAsset,
  runMonthlyDepreciation,
  runCurrencyRevaluation,
} from './crm-assets-fx-service.js';

async function ensureStage2DemoDocuments(db: AppDb, orgId: string): Promise<void> {
  await ensureChartOfAccounts(db);

  // Якщо база була створена на Етапі 1 без бухгалтерських проводок — перепроводимо хронологічно
  const [glCount] = await db.select({ cnt: count() }).from(regAccountingEntries);
  if ((glCount?.cnt ?? 0) === 0) {
    await repostFromDate(db, orgId, '2020-01-01T00:00:00Z');
  }

  // Перевіряємо чи вже є демо-замовлення покупця
  const [existingOrder] = await db
    .select({ id: documents.id })
    .from(documents)
    .where(eq(documents.docType, 'customer_order'))
    .limit(1);

  if (!existingOrder) {
    const [whMain] = await db.select().from(warehouses).where(eq(warehouses.code, 'WH-01'));
    const [whShop] = await db.select().from(warehouses).where(eq(warehouses.code, 'WH-02'));
    const [laptop] = await db.select().from(items).where(eq(items.sku, 'NB-TP14'));
    const [monitor] = await db.select().from(items).where(eq(items.sku, 'MN-DL27'));
    const [mouse] = await db.select().from(items).where(eq(items.sku, 'MS-MX3S'));
    const [custSoft] = await db
      .select()
      .from(counterparties)
      .where(eq(counterparties.edrpou, '40872195'));
    const [ptOpt] = await db.select().from(priceTypes).where(eq(priceTypes.code, 'OPT'));

    if (whMain && laptop && monitor && custSoft) {
      const [orderDoc] = await db
        .insert(documents)
        .values({
          organizationId: orgId,
          docType: 'customer_order',
          docNumber: 'ЗП-00001',
          docDate: new Date('2026-11-20T10:00:00Z'),
          warehouseId: whMain.id,
          counterpartyId: custSoft.id,
          priceTypeId: ptOpt?.id ?? null,
          comment: 'Резерв під нову партію робочих місць (грудень)',
        })
        .returning();

      await db.insert(documentLines).values([
        {
          documentId: orderDoc.id,
          lineNo: 1,
          itemId: laptop.id,
          qty: '2.0000',
          price: '34200.00',
          amount: '68400.00',
        },
        {
          documentId: orderDoc.id,
          lineNo: 2,
          itemId: monitor.id,
          qty: '1.0000',
          price: '22800.00',
          amount: '22800.00',
        },
      ]);
      await postDocument(db, orderDoc.id);
    }

    if (whShop && mouse) {
      // Демо-інвентаризація в шоурумі: обліково було 4 миші (8 переміщено − 4 продано), фактично знайдено 5 (+1 надлишок)
      const [invDoc] = await db
        .insert(documents)
        .values({
          organizationId: orgId,
          docType: 'inventory_count',
          docNumber: 'ІНВ-00001',
          docDate: new Date('2026-11-22T18:00:00Z'),
          warehouseId: whShop.id,
          comment: 'Планова інвентаризація вітрини шоуруму на Подолі',
        })
        .returning();

      await db.insert(documentLines).values([
        {
          documentId: invDoc.id,
          lineNo: 1,
          itemId: mouse.id,
          qty: '5.0000',
          price: '2900.00',
        },
      ]);
      await postDocument(db, invDoc.id);
    }
  }

  // Етап 3 (Довідники): Користувачі RBAC, Співробітники, Специфікація BOM
  await ensureDefaultUsers(db, orgId);

  const existingEmps = await db
    .select()
    .from(employees)
    .where(eq(employees.organizationId, orgId));

  if (existingEmps.length === 0) {
    await db.insert(employees).values([
      {
        organizationId: orgId,
        fullName: 'Шевченко Андрій Вікторович',
        rnokpp: '2984512390',
        position: 'Директор',
        department: 'ADMIN',
        baseSalary: '45000.00',
      },
      {
        organizationId: orgId,
        fullName: 'Мельник Олена Сергіївна',
        rnokpp: '3109214587',
        position: 'Головний бухгалтер',
        department: 'ADMIN',
        baseSalary: '38000.00',
      },
      {
        organizationId: orgId,
        fullName: 'Бондаренко Максим Петрович',
        rnokpp: '3341209854',
        position: 'Керівник відділу B2B продажу',
        department: 'SALES',
        baseSalary: '32000.00',
      },
    ]);
  }

  const existingBoms = await db
    .select()
    .from(bomSpecs)
    .where(eq(bomSpecs.organizationId, orgId));

  if (existingBoms.length === 0) {
    const [laptop] = await db.select().from(items).where(eq(items.sku, 'NB-TP14'));
    const [monitor] = await db.select().from(items).where(eq(items.sku, 'MN-DL27'));
    const [dock] = await db.select().from(items).where(eq(items.sku, 'DK-USBC'));

    if (laptop && monitor && dock) {
      let [kitItem] = await db.select().from(items).where(eq(items.sku, 'KIT-WORK01'));
      if (!kitItem) {
        [kitItem] = await db
          .insert(items)
          .values({
            sku: 'KIT-WORK01',
            barcode: '4820001000999',
            name: 'Робоча станція розробника Pro (Комплект)',
            unit: 'компл',
            itemType: 'GOODS',
          })
          .returning();
      }

      const [spec] = await db
        .insert(bomSpecs)
        .values({
          organizationId: orgId,
          code: 'СПЕЦ-01',
          name: 'Збірка робочої станції розробника Pro',
          outputItemId: kitItem.id,
          outputQty: '1.0000',
        })
        .returning();

      await db.insert(bomSpecLines).values([
        { bomSpecId: spec.id, lineNo: 1, componentItemId: laptop.id, qty: '1.0000' },
        { bomSpecId: spec.id, lineNo: 2, componentItemId: monitor.id, qty: '1.0000' },
        { bomSpecId: spec.id, lineNo: 3, componentItemId: dock.id, qty: '1.0000' },
      ]);
    }
  }
}

export async function seedStage3DemoDocuments(db: AppDb, orgId: string): Promise<void> {
  await ensureStage2DemoDocuments(db, orgId);

  const empList = await db
    .select()
    .from(employees)
    .where(eq(employees.organizationId, orgId));

  const [existingPayroll] = await db
    .select({ id: documents.id })
    .from(documents)
    .where(eq(documents.docType, 'payroll_sheet'))
    .limit(1);

  if (!existingPayroll && empList.length > 0) {
    const [payDoc] = await db
      .insert(documents)
      .values({
        organizationId: orgId,
        docType: 'payroll_sheet',
        docNumber: 'ЗПВ-00001',
        docDate: new Date('2026-11-28T16:00:00Z'),
        comment: 'Нарахування заробітної плати за листопад 2026 (ПДФО 18%, ВЗ 5%, ЄСВ 22%)',
      })
      .returning();

    await db.insert(documentLines).values(
      empList.map((emp, idx) => ({
        documentId: payDoc.id,
        lineNo: idx + 1,
        lineRole: 'EMPLOYEE',
        employeeId: emp.id,
        qty: '1.0000',
        price: emp.baseSalary,
        amount: emp.baseSalary,
      }))
    );
    await postDocument(db, payDoc.id);
  }

  const [existingProd] = await db
    .select({ id: documents.id })
    .from(documents)
    .where(eq(documents.docType, 'production_order'))
    .limit(1);

  if (!existingProd) {
    const [whMain] = await db.select().from(warehouses).where(eq(warehouses.code, 'WH-01'));
    const [spec] = await db.select().from(bomSpecs).where(eq(bomSpecs.organizationId, orgId));
    const [kitItem] = await db.select().from(items).where(eq(items.sku, 'KIT-WORK01'));
    const [laptop] = await db.select().from(items).where(eq(items.sku, 'NB-TP14'));
    const [monitor] = await db.select().from(items).where(eq(items.sku, 'MN-DL27'));
    const [dock] = await db.select().from(items).where(eq(items.sku, 'DK-USBC'));

    if (whMain && spec && kitItem && laptop && monitor && dock) {
      const [prodDoc] = await db
        .insert(documents)
        .values({
          organizationId: orgId,
          docType: 'production_order',
          docNumber: 'ВИР-00001',
          docDate: new Date('2026-11-24T13:00:00Z'),
          bomSpecId: spec.id,
          warehouseId: whMain.id,
          targetWarehouseId: whMain.id,
          comment: 'Комплектація робочої станції за специфікацією СПЕЦ-01',
        })
        .returning();

      await db.insert(documentLines).values([
        {
          documentId: prodDoc.id,
          lineNo: 1,
          lineRole: 'OUTPUT',
          itemId: kitItem.id,
          qty: '1.0000',
        },
        {
          documentId: prodDoc.id,
          lineNo: 2,
          lineRole: 'COMPONENT',
          itemId: laptop.id,
          qty: '1.0000',
        },
        {
          documentId: prodDoc.id,
          lineNo: 3,
          lineRole: 'COMPONENT',
          itemId: monitor.id,
          qty: '1.0000',
        },
        {
          documentId: prodDoc.id,
          lineNo: 4,
          lineRole: 'COMPONENT',
          itemId: dock.id,
          qty: '1.0000',
        },
      ]);
      await postDocument(db, prodDoc.id);
    }
  }

  const [existingTaxInv] = await db
    .select({ id: documents.id })
    .from(documents)
    .where(eq(documents.docType, 'tax_invoice'))
    .limit(1);

  if (!existingTaxInv) {
    const [sale1] = await db
      .select()
      .from(documents)
      .where(eq(documents.docNumber, 'ВН-00001'));
    if (sale1) {
      const saleLines = await db
        .select()
        .from(documentLines)
        .where(eq(documentLines.documentId, sale1.id));

      const [taxDoc] = await db
        .insert(documents)
        .values({
          organizationId: orgId,
          docType: 'tax_invoice',
          docNumber: 'ПНПДВ-00001',
          docDate: new Date('2026-11-05T12:10:00Z'),
          parentDocId: sale1.id,
          counterpartyId: sale1.counterpartyId,
          vatRate: 20,
          totalAmount: sale1.totalAmount,
          comment: 'Податкова накладна за першою подією (до ВН-00001)',
        })
        .returning();

      if (saleLines.length > 0) {
        await db.insert(documentLines).values(
          saleLines.map((l, idx) => ({
            documentId: taxDoc.id,
            lineNo: idx + 1,
            itemId: l.itemId,
            qty: l.qty,
            price: l.price,
            amount: l.amount,
          }))
        );
      }
      await postDocument(db, taxDoc.id);

      await recordAuditLog(db, {
        organizationId: orgId,
        userName: 'Мельник Олена (Гол. бухгалтер)',
        userRole: 'ACCOUNTANT',
        action: 'SEED_STAGE3',
        entityType: 'system',
        summary: 'Ініціалізовано модулі Етапу 3: Виробництво BOM, Зарплата, ПДВ (J1201015) та RBAC',
      });
    }
  }
}

export async function seedStage4DemoData(db: AppDb, orgId: string): Promise<void> {
  await seedStage3DemoDocuments(db, orgId);

  // 1. CRM-воронка (ліди, задачі, дзвінки)
  const existingLeads = await db
    .select()
    .from(crmLeads)
    .where(eq(crmLeads.organizationId, orgId));

  if (existingLeads.length === 0) {
    const [custSoft] = await db
      .select()
      .from(counterparties)
      .where(eq(counterparties.edrpou, '40872195'));

    const [l1, l2, l3, l4] = await db
      .insert(crmLeads)
      .values([
        {
          organizationId: orgId,
          title: 'Оновлення парку ноутбуків (15 шт) — IT-компанія',
          counterpartyId: custSoft?.id ?? null,
          contactName: 'Олексій Гнатюк (CTO)',
          phone: '+380671112233',
          email: 'cto@softsfera.ua',
          source: 'REFERRAL',
          stage: 'NEGOTIATION',
          expectedAmount: '513000.00',
          assignedTo: 'Бондаренко Максим',
          notes: 'Узгоджуємо графік поставки двома партіями в грудні',
        },
        {
          organizationId: orgId,
          title: 'Комплектація 4 робочих місць дизайнерів (4K монітори)',
          contactName: 'Ірина Коваль',
          phone: '+380509988776',
          email: 'iryna@pixelstudio.ua',
          source: 'SITE',
          stage: 'PROPOSAL',
          expectedAmount: '148000.00',
          assignedTo: 'Бондаренко Максим',
          notes: 'Надіслано КП на Dell UltraSharp 27" + Mac/ThinkPad док-станції',
        },
        {
          organizationId: orgId,
          title: 'Закупівля периферії Logitech для офісу у Львові',
          contactName: 'Дмитро Савченко',
          phone: '+380934455667',
          source: 'TELEGRAM',
          stage: 'QUALIFIED',
          expectedAmount: '64500.00',
          assignedTo: 'Бондаренко Максим',
          notes: 'Потрібен рахунок з ПДВ 20%',
        },
        {
          organizationId: orgId,
          title: 'Запит на серверні SSD 2TB для дата-центру',
          contactName: 'Сергій Мельничук',
          phone: '+380631230099',
          source: 'PHONE',
          stage: 'NEW',
          expectedAmount: '112000.00',
          assignedTo: 'Бондаренко Максим',
        },
      ])
      .returning();

    await db.insert(crmActivities).values([
      {
        organizationId: orgId,
        leadId: l1.id,
        activityType: 'CALL',
        subject: 'Вхідний дзвінок: уточнення комплектації та знижки 5%',
        outcome: 'Клієнт підтвердив бюджет, чекає фінальний рахунок',
        durationSec: 420,
        isDone: true,
        assignedTo: 'Бондаренко Максим',
      },
      {
        organizationId: orgId,
        leadId: l1.id,
        activityType: 'TASK',
        subject: 'Сформувати замовлення покупця та зарезервувати 15 шт на складі',
        dueAt: new Date('2026-11-27T12:00:00Z'),
        isDone: false,
        assignedTo: 'Бондаренко Максим',
      },
      {
        organizationId: orgId,
        leadId: l2.id,
        activityType: 'CALL',
        subject: 'Презентація КП по моніторах Dell 4K',
        outcome: 'Надіслали специфікацію на пошту, передзвонити у п’ятницю',
        durationSec: 265,
        isDone: true,
        assignedTo: 'Бондаренко Максим',
      },
      {
        organizationId: orgId,
        leadId: l3.id,
        activityType: 'TASK',
        subject: 'Підготувати комерційну пропозицію з ПДВ 20%',
        dueAt: new Date('2026-11-28T15:00:00Z'),
        isDone: false,
        assignedTo: 'Бондаренко Максим',
      },
      {
        organizationId: orgId,
        leadId: l4.id,
        activityType: 'TASK',
        subject: 'Передзвонити клієнту щодо наявності Samsung 990 PRO',
        dueAt: new Date('2026-11-26T16:00:00Z'),
        isDone: false,
        assignedTo: 'Бондаренко Максим',
      },
    ]);
  }

  // 2. Основні засоби (104/106) та нарахування амортизації (131)
  const existingAssets = await db
    .select()
    .from(fixedAssets)
    .where(eq(fixedAssets.organizationId, orgId));

  if (existingAssets.length === 0) {
    await createFixedAsset(db, {
      organizationId: orgId,
      inventoryNumber: 'ОЗ-0001',
      name: 'Сервер Dell PowerEdge R750 (офісний кластер)',
      accountCode: '104',
      expenseAccountCode: '92',
      commissioningDate: new Date('2026-10-05T09:00:00Z'),
      initialCost: '180000.00',
      residualValue: '0.00',
      usefulLifeMonths: 60, // 3 000.00 ₴ / міс
    });

    await createFixedAsset(db, {
      organizationId: orgId,
      inventoryNumber: 'ОЗ-0002',
      name: 'Стелажна система та навантажувач складу (Київ)',
      accountCode: '106',
      expenseAccountCode: '93',
      commissioningDate: new Date('2026-10-10T09:00:00Z'),
      initialCost: '96000.00',
      residualValue: '0.00',
      usefulLifeMonths: 48, // 2 000.00 ₴ / міс
    });

    // Нараховуємо амортизацію за листопад 2026 (3000 + 2000 = 5000.00 ₴ -> Дт 92/93 Кт 131)
    await runMonthlyDepreciation(db, {
      organizationId: orgId,
      periodDate: new Date('2026-11-30T17:00:00Z'),
    });
  }

  // 3. Мультивалютний рахунок USD (312), курси НБУ та курсові різниці (714/945)
  const existingRates = await db.select().from(regCurrencyRates).limit(1);
  if (existingRates.length === 0) {
    await db.insert(regCurrencyRates).values([
      {
        currencyCode: 'USD',
        rateDate: new Date('2026-10-01T00:00:00Z'),
        rate: '41.200000',
        source: 'NBU_API',
      },
      {
        currencyCode: 'EUR',
        rateDate: new Date('2026-10-01T00:00:00Z'),
        rate: '44.500000',
        source: 'NBU_API',
      },
      {
        currencyCode: 'USD',
        rateDate: new Date('2026-11-26T00:00:00Z'),
        rate: '41.700000',
        source: 'NBU_API',
      },
      {
        currencyCode: 'EUR',
        rateDate: new Date('2026-11-26T00:00:00Z'),
        rate: '44.950000',
        source: 'NBU_API',
      },
    ]);
  }

  const allAccs = await db
    .select()
    .from(cashAccounts)
    .where(eq(cashAccounts.organizationId, orgId));
  let usdAcc = allAccs.find((a) => a.currency === 'USD');

  if (!usdAcc) {
    [usdAcc] = await db
      .insert(cashAccounts)
      .values({
        organizationId: orgId,
        name: 'ПриватБанк Валютний (USD)',
        accountType: 'BANK',
        iban: 'UA883052990000026009015098765',
        currency: 'USD',
      })
      .returning();

    // Початковий залишок $5 000 на 01.10.2026 за курсом НБУ 41.20 = 206 000.00 ₴
    const [fxOpen] = await db
      .insert(documents)
      .values({
        organizationId: orgId,
        docType: 'opening_balance',
        docNumber: 'ВПЗ-USD-01',
        docDate: new Date('2026-10-01T08:30:00Z'),
        cashAccountId: usdAcc.id,
        currency: 'USD',
        exchangeRate: '41.200000',
        totalAmount: '206000.00',
        comment: 'Початковий валютний залишок $5 000 (курс НБУ 41.20)',
      })
      .returning();

    await db.insert(documentLines).values({
      documentId: fxOpen.id,
      lineNo: 1,
      cashAccountId: usdAcc.id,
      amount: '5000.00',
      notes: 'Валютний залишок USD',
    });
    await postDocument(db, fxOpen.id);

    // Переоцінка на 26.11.2026 за курсом 41.70 (+0.50 * 5000 = +2 500.00 ₴ -> Дт 312 Кт 714)
    await runCurrencyRevaluation(db, {
      organizationId: orgId,
      asOfDate: new Date('2026-11-26T18:00:00Z'),
    });
  }
}

export async function seedDemoData(db: AppDb): Promise<{ seeded: boolean; organizationId: string }> {
  await ensureChartOfAccounts(db);
  const [existingOrg] = await db.select({ id: organizations.id }).from(organizations).limit(1);
  if (existingOrg) {
    await ensureStage2DemoDocuments(db, existingOrg.id);
    return { seeded: false, organizationId: existingOrg.id };
  }

  // 1. Організація
  const [org] = await db
    .insert(organizations)
    .values({
      name: 'ТОВ «КиївТехТрейд»',
      edrpou: '41289543',
      baseCurrency: 'UAH',
      costingMethod: 'FIFO',
      allowNegativeStock: false,
    })
    .returning();

  // 2. Склади
  const [whMain, whShop] = await db
    .insert(warehouses)
    .values([
      {
        organizationId: org.id,
        code: 'WH-01',
        name: 'Центральний склад (Київ)',
        type: 'WHOLESALE',
      },
      {
        organizationId: org.id,
        code: 'WH-02',
        name: 'Магазин-шоурум (Поділ)',
        type: 'RETAIL',
      },
    ])
    .returning();

  // 3. Категорії та Номенклатура
  const [catLaptops, catPeripherals, catServices] = await db
    .insert(categories)
    .values([
      { name: 'Ноутбуки та монітори' },
      { name: 'Периферія та аксесуари' },
      { name: 'Послуги та налаштування' },
    ])
    .returning();

  const [itemLaptop, itemMonitor, itemMouse, itemKeyboard, itemSsd, itemDock, itemSetup] = await db
    .insert(items)
    .values([
      {
        sku: 'NB-TP14',
        barcode: '4820001000011',
        name: 'Ноутбук Lenovo ThinkPad E14 Gen 6',
        categoryId: catLaptops.id,
        unit: 'шт',
        itemType: 'GOODS',
      },
      {
        sku: 'MN-DL27',
        barcode: '4820001000028',
        name: 'Монітор Dell UltraSharp 27" 4K',
        categoryId: catLaptops.id,
        unit: 'шт',
        itemType: 'GOODS',
      },
      {
        sku: 'MS-MX3S',
        barcode: '4820001000035',
        name: 'Миша Logitech MX Master 3S',
        categoryId: catPeripherals.id,
        unit: 'шт',
        itemType: 'GOODS',
      },
      {
        sku: 'KB-KC2',
        barcode: '4820001000042',
        name: 'Клавіатура Keychron K2 Pro',
        categoryId: catPeripherals.id,
        unit: 'шт',
        itemType: 'GOODS',
      },
      {
        sku: 'SSD-990P',
        barcode: '4820001000059',
        name: 'SSD Samsung 990 PRO 2TB NVMe',
        categoryId: catPeripherals.id,
        unit: 'шт',
        itemType: 'GOODS',
      },
      {
        sku: 'DK-USBC',
        barcode: '4820001000066',
        name: 'Док-станція Anker USB-C 11-in-1',
        categoryId: catPeripherals.id,
        unit: 'шт',
        itemType: 'GOODS',
      },
      {
        sku: 'SRV-001',
        barcode: '',
        name: 'Налаштування робочого місця та перенесення даних',
        categoryId: catServices.id,
        unit: 'посл',
        itemType: 'SERVICE',
      },
    ])
    .returning();

  // 4. Контрагенти та договори
  const [supErc, supMti, custSoft, custNova, custRetail] = await db
    .insert(counterparties)
    .values([
      {
        name: 'ТОВ «ЕРС Дистрибуція»',
        edrpou: '23514780',
        phone: '+380445001122',
        email: 'orders@erc-demo.ua',
        isCustomer: false,
        isSupplier: true,
      },
      {
        name: 'ТОВ «МТІ-Трейд»',
        edrpou: '31490821',
        phone: '+380445003344',
        email: 'b2b@mti-demo.ua',
        isCustomer: false,
        isSupplier: true,
      },
      {
        name: 'ТОВ «СофтСфера Україна»',
        edrpou: '40872195',
        phone: '+380671112233',
        email: 'procurement@softsfera.ua',
        isCustomer: true,
        isSupplier: false,
      },
      {
        name: 'ФОП Коваленко Олександр Ігорович',
        edrpou: '3214509871',
        phone: '+380932223344',
        email: 'kovalenko@fop.ua',
        isCustomer: true,
        isSupplier: false,
      },
      {
        name: 'Роздрібний покупець',
        edrpou: '',
        phone: '',
        email: '',
        isCustomer: true,
        isSupplier: false,
      },
    ])
    .returning();

  const [ctrErc, ctrMti, ctrSoft, ctrNova] = await db
    .insert(contracts)
    .values([
      {
        organizationId: org.id,
        counterpartyId: supErc.id,
        name: 'Договір поставки №12/2026',
        contractType: 'SUPPLIER',
      },
      {
        organizationId: org.id,
        counterpartyId: supMti.id,
        name: 'Основний договір постачальника',
        contractType: 'SUPPLIER',
      },
      {
        organizationId: org.id,
        counterpartyId: custSoft.id,
        name: 'Договір купівлі-продажу №45',
        contractType: 'CUSTOMER',
      },
      {
        organizationId: org.id,
        counterpartyId: custNova.id,
        name: 'Основний договір покупця',
        contractType: 'CUSTOMER',
      },
    ])
    .returning();

  // 5. Каси та Банківські рахунки
  const [accBank, accCash] = await db
    .insert(cashAccounts)
    .values([
      {
        organizationId: org.id,
        name: 'ПриватБанк (UAH) Основний',
        accountType: 'BANK',
        iban: 'UA213052990000026007015012345',
        currency: 'UAH',
      },
      {
        organizationId: org.id,
        name: 'Каса магазину (Поділ)',
        accountType: 'CASH',
        iban: '',
        currency: 'UAH',
      },
    ])
    .returning();

  // 6. Статті РГК
  const [cfCustPay, cfSupPay, cfRent, cfMarketing] = await db
    .insert(cashflowCategories)
    .values([
      { name: 'Оплата від покупців', direction: 'IN', isOperatingExpense: false },
      { name: 'Оплата постачальникам за товар', direction: 'OUT', isOperatingExpense: false },
      { name: 'Оренда офісу та складу', direction: 'OUT', isOperatingExpense: true },
      { name: 'Маркетинг і реклама', direction: 'OUT', isOperatingExpense: true },
    ])
    .returning();

  // 7. Типи цін
  const [ptWholesale, ptRetail] = await db
    .insert(priceTypes)
    .values([
      { code: 'OPT', name: 'Оптова ціна (UAH)', currency: 'UAH' },
      { code: 'ROZN', name: 'Роздрібна ціна (UAH)', currency: 'UAH' },
    ])
    .returning();

  // ============================================================================
  // ДЕМО-ДОКУМЕНТИ (жовтень - листопад 2026) — усі проходять через PostingEngine!
  // ============================================================================

  // 1) Ввід початкових залишків (01.10.2026): стартові гроші + товар
  const [docOpen] = await db
    .insert(documents)
    .values({
      organizationId: org.id,
      docType: 'opening_balance',
      docNumber: 'ВПЗ-00001',
      docDate: new Date('2026-10-01T08:00:00Z'),
      warehouseId: whMain.id,
      comment: 'Стартові залишки при переході з BAS',
    })
    .returning();

  await db.insert(documentLines).values([
    {
      documentId: docOpen.id,
      lineNo: 1,
      cashAccountId: accBank.id,
      amount: '450000.00',
      notes: 'Залишок на рахунку ПриватБанк',
    },
    {
      documentId: docOpen.id,
      lineNo: 2,
      cashAccountId: accCash.id,
      amount: '35000.00',
      notes: 'Залишок у касі',
    },
    {
      documentId: docOpen.id,
      lineNo: 3,
      itemId: itemLaptop.id,
      warehouseId: whMain.id,
      qty: '5.0000',
      price: '28000.00',
      amount: '140000.00',
    },
    {
      documentId: docOpen.id,
      lineNo: 4,
      itemId: itemMouse.id,
      warehouseId: whMain.id,
      qty: '20.0000',
      price: '2900.00',
      amount: '58000.00',
    },
  ]);
  await postDocument(db, docOpen.id);

  // 2) Встановлення цін (02.10.2026)
  const [docPriceRetail] = await db
    .insert(documents)
    .values({
      organizationId: org.id,
      docType: 'price_setting',
      docNumber: 'ВЦ-00001',
      docDate: new Date('2026-10-02T09:00:00Z'),
      priceTypeId: ptRetail.id,
      comment: 'Базовий роздрібний прайс на Q4 2026',
    })
    .returning();

  await db.insert(documentLines).values([
    { documentId: docPriceRetail.id, lineNo: 1, itemId: itemLaptop.id, price: '36900.00' },
    { documentId: docPriceRetail.id, lineNo: 2, itemId: itemMonitor.id, price: '24500.00' },
    { documentId: docPriceRetail.id, lineNo: 3, itemId: itemMouse.id, price: '4299.00' },
    { documentId: docPriceRetail.id, lineNo: 4, itemId: itemKeyboard.id, price: '4950.00' },
    { documentId: docPriceRetail.id, lineNo: 5, itemId: itemSsd.id, price: '7600.00' },
    { documentId: docPriceRetail.id, lineNo: 6, itemId: itemDock.id, price: '3100.00' },
    { documentId: docPriceRetail.id, lineNo: 7, itemId: itemSetup.id, price: '1800.00' },
  ]);
  await postDocument(db, docPriceRetail.id);

  const [docPriceOpt] = await db
    .insert(documents)
    .values({
      organizationId: org.id,
      docType: 'price_setting',
      docNumber: 'ВЦ-00002',
      docDate: new Date('2026-10-02T09:05:00Z'),
      priceTypeId: ptWholesale.id,
      comment: 'Оптовий B2B прайс',
    })
    .returning();

  await db.insert(documentLines).values([
    { documentId: docPriceOpt.id, lineNo: 1, itemId: itemLaptop.id, price: '34200.00' },
    { documentId: docPriceOpt.id, lineNo: 2, itemId: itemMonitor.id, price: '22800.00' },
    { documentId: docPriceOpt.id, lineNo: 3, itemId: itemMouse.id, price: '3850.00' },
    { documentId: docPriceOpt.id, lineNo: 4, itemId: itemKeyboard.id, price: '4400.00' },
    { documentId: docPriceOpt.id, lineNo: 5, itemId: itemSsd.id, price: '6950.00' },
    { documentId: docPriceOpt.id, lineNo: 6, itemId: itemDock.id, price: '2750.00' },
    { documentId: docPriceOpt.id, lineNo: 7, itemId: itemSetup.id, price: '1500.00' },
  ]);
  await postDocument(db, docPriceOpt.id);

  // 3) Прибуткова накладна №1 (10.10.2026) — друга дорожча партія ноутбуків (для демонстрації FIFO!)
  const [docRec1] = await db
    .insert(documents)
    .values({
      organizationId: org.id,
      docType: 'goods_receipt',
      docNumber: 'ПН-00001',
      docDate: new Date('2026-10-10T11:00:00Z'),
      warehouseId: whMain.id,
      counterpartyId: supErc.id,
      contractId: ctrErc.id,
      comment: 'Поставка ноутбуків та моніторів (нова партія)',
    })
    .returning();

  await db.insert(documentLines).values([
    {
      documentId: docRec1.id,
      lineNo: 1,
      itemId: itemLaptop.id,
      qty: '6.0000',
      price: '29500.00',
      amount: '177000.00',
    },
    {
      documentId: docRec1.id,
      lineNo: 2,
      itemId: itemMonitor.id,
      qty: '10.0000',
      price: '18500.00',
      amount: '185000.00',
    },
    {
      documentId: docRec1.id,
      lineNo: 3,
      itemId: itemSsd.id,
      qty: '15.0000',
      price: '5400.00',
      amount: '81000.00',
    },
  ]);
  await postDocument(db, docRec1.id);

  // 4) Прибуткова накладна №2 (15.10.2026) — периферія від МТІ
  const [docRec2] = await db
    .insert(documents)
    .values({
      organizationId: org.id,
      docType: 'goods_receipt',
      docNumber: 'ПН-00002',
      docDate: new Date('2026-10-15T14:00:00Z'),
      warehouseId: whMain.id,
      counterpartyId: supMti.id,
      contractId: ctrMti.id,
      comment: 'Периферія на склад',
    })
    .returning();

  await db.insert(documentLines).values([
    {
      documentId: docRec2.id,
      lineNo: 1,
      itemId: itemKeyboard.id,
      qty: '12.0000',
      price: '3300.00',
      amount: '39600.00',
    },
    {
      documentId: docRec2.id,
      lineNo: 2,
      itemId: itemDock.id,
      qty: '20.0000',
      price: '1950.00',
      amount: '39000.00',
    },
  ]);
  await postDocument(db, docRec2.id);

  // 5) Переміщення товарів у магазин-шоурум (20.10.2026)
  const [docTrans] = await db
    .insert(documents)
    .values({
      organizationId: org.id,
      docType: 'stock_transfer',
      docNumber: 'ПМ-00001',
      docDate: new Date('2026-10-20T10:30:00Z'),
      warehouseId: whMain.id,
      targetWarehouseId: whShop.id,
      comment: 'Поповнення вітрини магазину на Подолі',
    })
    .returning();

  await db.insert(documentLines).values([
    { documentId: docTrans.id, lineNo: 1, itemId: itemMouse.id, qty: '8.0000' },
    { documentId: docTrans.id, lineNo: 2, itemId: itemKeyboard.id, qty: '5.0000' },
    { documentId: docTrans.id, lineNo: 3, itemId: itemMonitor.id, qty: '3.0000' },
  ]);
  await postDocument(db, docTrans.id);

  // 6) Видаткова накладна №1 (05.11.2026) — великий B2B продаж для ТОВ СофтСфера (спише 5 шт за 28000 + 2 шт за 29500 по FIFO!)
  const [docSale1] = await db
    .insert(documents)
    .values({
      organizationId: org.id,
      docType: 'sales_invoice',
      docNumber: 'ВН-00001',
      docDate: new Date('2026-11-05T12:00:00Z'),
      warehouseId: whMain.id,
      counterpartyId: custSoft.id,
      contractId: ctrSoft.id,
      priceTypeId: ptWholesale.id,
      comment: 'Комплектація 7 робочих місць для команди розробників',
    })
    .returning();

  await db.insert(documentLines).values([
    {
      documentId: docSale1.id,
      lineNo: 1,
      itemId: itemLaptop.id,
      qty: '7.0000',
      price: '34200.00',
      amount: '239400.00',
    },
    {
      documentId: docSale1.id,
      lineNo: 2,
      itemId: itemMonitor.id,
      qty: '5.0000',
      price: '22800.00',
      amount: '114000.00',
    },
    {
      documentId: docSale1.id,
      lineNo: 3,
      itemId: itemDock.id,
      qty: '7.0000',
      price: '2750.00',
      amount: '19250.00',
    },
    {
      documentId: docSale1.id,
      lineNo: 4,
      itemId: itemSetup.id,
      qty: '7.0000',
      price: '1500.00',
      amount: '10500.00',
    },
  ]);
  await postDocument(db, docSale1.id);

  // 7) Видаткова накладна №2 (12.11.2026) — продаж із магазину-шоуруму
  const [docSale2] = await db
    .insert(documents)
    .values({
      organizationId: org.id,
      docType: 'sales_invoice',
      docNumber: 'ВН-00002',
      docDate: new Date('2026-11-12T15:20:00Z'),
      warehouseId: whShop.id,
      counterpartyId: custRetail.id,
      priceTypeId: ptRetail.id,
      comment: 'Роздрібний продаж у шоурумі',
    })
    .returning();

  await db.insert(documentLines).values([
    {
      documentId: docSale2.id,
      lineNo: 1,
      itemId: itemMouse.id,
      qty: '4.0000',
      price: '4299.00',
      amount: '17196.00',
    },
    {
      documentId: docSale2.id,
      lineNo: 2,
      itemId: itemKeyboard.id,
      qty: '2.0000',
      price: '4950.00',
      amount: '9900.00',
    },
    {
      documentId: docSale2.id,
      lineNo: 3,
      itemId: itemMonitor.id,
      qty: '1.0000',
      price: '24500.00',
      amount: '24500.00',
    },
  ]);
  await postDocument(db, docSale2.id);

  // 8) Видаткова накладна №3 (18.11.2026) — продаж ФОП Коваленко
  const [docSale3] = await db
    .insert(documents)
    .values({
      organizationId: org.id,
      docType: 'sales_invoice',
      docNumber: 'ВН-00003',
      docDate: new Date('2026-11-18T11:15:00Z'),
      warehouseId: whMain.id,
      counterpartyId: custNova.id,
      contractId: ctrNova.id,
      priceTypeId: ptWholesale.id,
      comment: 'Відвантаження SSD та аксесуарів',
    })
    .returning();

  await db.insert(documentLines).values([
    {
      documentId: docSale3.id,
      lineNo: 1,
      itemId: itemSsd.id,
      qty: '8.0000',
      price: '6950.00',
      amount: '55600.00',
    },
    {
      documentId: docSale3.id,
      lineNo: 2,
      itemId: itemMouse.id,
      qty: '5.0000',
      price: '3850.00',
      amount: '19250.00',
    },
  ]);
  await postDocument(db, docSale3.id);

  // 9) Грошові документи (оплати)
  const [docPayIn1] = await db
    .insert(documents)
    .values({
      organizationId: org.id,
      docType: 'money_in',
      docNumber: 'НК-00001',
      docDate: new Date('2026-11-08T10:00:00Z'),
      cashAccountId: accBank.id,
      counterpartyId: custSoft.id,
      contractId: ctrSoft.id,
      cashflowCategoryId: cfCustPay.id,
      totalAmount: '300000.00',
      comment: 'Часткова оплата за рахунком ВН-00001',
    })
    .returning();
  await postDocument(db, docPayIn1.id);

  const [docPayIn2] = await db
    .insert(documents)
    .values({
      organizationId: org.id,
      docType: 'money_in',
      docNumber: 'НК-00002',
      docDate: new Date('2026-11-12T15:25:00Z'),
      cashAccountId: accCash.id,
      counterpartyId: custRetail.id,
      cashflowCategoryId: cfCustPay.id,
      totalAmount: '51596.00',
      comment: 'Оплата готівкою за ВН-00002',
    })
    .returning();
  await postDocument(db, docPayIn2.id);

  const [docPayOutSup] = await db
    .insert(documents)
    .values({
      organizationId: org.id,
      docType: 'money_out',
      docNumber: 'СК-00001',
      docDate: new Date('2026-11-10T16:00:00Z'),
      cashAccountId: accBank.id,
      counterpartyId: supErc.id,
      contractId: ctrErc.id,
      cashflowCategoryId: cfSupPay.id,
      totalAmount: '350000.00',
      comment: 'Оплата постачальнику ЕРС за ПН-00001',
    })
    .returning();
  await postDocument(db, docPayOutSup.id);

  const [docPayRent] = await db
    .insert(documents)
    .values({
      organizationId: org.id,
      docType: 'money_out',
      docNumber: 'СК-00002',
      docDate: new Date('2026-11-03T09:30:00Z'),
      cashAccountId: accBank.id,
      cashflowCategoryId: cfRent.id,
      totalAmount: '42000.00',
      comment: 'Оренда складу та шоуруму за листопад 2026',
    })
    .returning();
  await postDocument(db, docPayRent.id);

  const [docPayMkt] = await db
    .insert(documents)
    .values({
      organizationId: org.id,
      docType: 'money_out',
      docNumber: 'СК-00003',
      docDate: new Date('2026-11-15T13:00:00Z'),
      cashAccountId: accBank.id,
      cashflowCategoryId: cfMarketing.id,
      totalAmount: '18500.00',
      comment: 'Контекстна реклама Google Ads',
    })
    .returning();
  await postDocument(db, docPayMkt.id);

  // Додаємо документи Етапу 2 (замовлення покупця з резервом + інвентаризація)
  await ensureStage2DemoDocuments(db, org.id);

  await db.select({ total: count() }).from(documents);

  return { seeded: true, organizationId: org.id };
}

/**
 * Чиста ініціалізація для production-клієнтів (SEED_DEMO_DATA=false):
 * - План рахунків Мінфіну №291
 * - Базові статті РГК та види цін
 * - 1 стартова організація (без жодних тестових документів, товарів, клієнтів, кадрів чи CRM-лідів)
 */
export async function ensureCleanBaseData(
  db: AppDb,
  options?: { orgName?: string }
): Promise<{ organizationId: string }> {
  await ensureChartOfAccounts(db);

  const existingCf = await db.select({ id: cashflowCategories.id }).from(cashflowCategories).limit(1);
  if (existingCf.length === 0) {
    await db.insert(cashflowCategories).values([
      { name: 'Оплата від покупців', direction: 'IN', isOperatingExpense: false },
      { name: 'Оплата постачальникам за товар', direction: 'OUT', isOperatingExpense: false },
      { name: 'Оренда приміщення / складу', direction: 'OUT', isOperatingExpense: true },
      { name: 'Зарплата та податки', direction: 'OUT', isOperatingExpense: true },
      { name: 'Логістика та доставка', direction: 'OUT', isOperatingExpense: true },
      { name: 'Маркетинг і реклама', direction: 'OUT', isOperatingExpense: true },
      { name: 'Інші операційні витрати', direction: 'OUT', isOperatingExpense: true },
    ]);
  }

  const existingPt = await db.select({ id: priceTypes.id }).from(priceTypes).limit(1);
  if (existingPt.length === 0) {
    await db.insert(priceTypes).values([
      { code: 'ROZN', name: 'Роздрібна ціна (UAH)', currency: 'UAH' },
      { code: 'OPT', name: 'Оптова ціна (UAH)', currency: 'UAH' },
      { code: 'ZAKUP', name: 'Закупівельна ціна (UAH)', currency: 'UAH' },
    ]);
  }

  const existingOrgs = await db.select().from(organizations).limit(1);
  if (existingOrgs.length > 0) {
    return { organizationId: existingOrgs[0].id };
  }

  const orgName = options?.orgName?.trim() || 'Моя компанія';
  const [org] = await db
    .insert(organizations)
    .values({
      name: orgName,
      entityType: 'TOV',
      taxSystem: 'GENERAL_VAT',
      edrpou: '',
      ipn: '',
      iban: '',
      bankName: '',
      address: '',
      directorName: '',
      isVatPayer: true,
      vatRate: 20,
      baseCurrency: 'UAH',
      costingMethod: 'FIFO',
      allowNegativeStock: false,
    })
    .returning();

  await db.insert(warehouses).values({
    organizationId: org.id,
    code: 'WH-01',
    name: 'Основний склад',
    type: 'WHOLESALE',
  });

  await db.insert(cashAccounts).values([
    {
      organizationId: org.id,
      name: 'Основний рахунок (Банк)',
      accountType: 'BANK',
      iban: '',
      currency: 'UAH',
    },
    {
      organizationId: org.id,
      name: 'Основна каса (Готівка)',
      accountType: 'CASH',
      iban: '',
      currency: 'UAH',
    },
  ]);

  return { organizationId: org.id };
}
