import { and, asc, desc, eq } from 'drizzle-orm';
import type { AppDb } from './db.js';
import {
  appUsers,
  auditLogs,
  cashAccounts,
  cashflowCategories,
  counterparties,
  documentLines,
  documents,
  employees,
  items,
  organizations,
  printTemplates,
  warehouses,
  type DocumentType,
  type UserRole,
} from './schema.js';
import { PostingError } from './posting-engine.js';
import { d, round2, toNumeric2 } from './money.js';

// ============================================================================
// 1. СУМА ПРОПИСОМ УКРАЇНСЬКОЮ МОВОЮ (ДЛЯ РАХУНКІВ, НАКЛАДНИХ ТА АКТІВ)
// ============================================================================

const ONES_FEM = ['', 'одна', 'дві', 'три', 'чотири', 'п’ять', 'шість', 'сім', 'вісім', 'дев’ять'];
const TEENS = [
  'десять',
  'одинадцять',
  'дванадцять',
  'тринадцять',
  'чотирнадцять',
  'п’ятнадцять',
  'шістнадцять',
  'сімнадцять',
  'вісімнадцять',
  'дев’ятнадцять',
];
const TENS = [
  '',
  '',
  'двадцять',
  'тридцять',
  'сорок',
  'п’ятдесят',
  'шістдесят',
  'сімдесят',
  'вісімдесят',
  'дев’яносто',
];
const HUNDREDS = [
  '',
  'сто',
  'двісті',
  'триста',
  'чотириста',
  'п’ятсот',
  'шістсот',
  'сімсот',
  'вісімсот',
  'дев’ятсот',
];

function triadToWords(n: number): string[] {
  const words: string[] = [];
  const h = Math.floor(n / 100);
  const rem = n % 100;
  const t = Math.floor(rem / 10);
  const o = rem % 10;

  if (h > 0) words.push(HUNDREDS[h]);
  if (t === 1) {
    words.push(TEENS[o]);
  } else {
    if (t > 1) words.push(TENS[t]);
    if (o > 0) words.push(ONES_FEM[o]);
  }
  return words;
}

function pluralize(n: number, forms: [string, string, string]): string {
  const mod100 = n % 100;
  const mod10 = n % 10;
  if (mod100 >= 11 && mod100 <= 19) return forms[2];
  if (mod10 === 1) return forms[0];
  if (mod10 >= 2 && mod10 <= 4) return forms[1];
  return forms[2];
}

export function amountToUkrainianWords(value: number | string): string {
  const total = round2(value).abs();
  const whole = Math.floor(total.toNumber());
  const kop = Math.round(total.minus(whole).mul(100).toNumber());

  if (whole === 0) {
    return `Нуль гривень ${String(kop).padStart(2, '0')} копійок`;
  }

  const parts: string[] = [];
  const millions = Math.floor(whole / 1_000_000);
  const thousands = Math.floor((whole % 1_000_000) / 1_000);
  const units = whole % 1_000;

  if (millions > 0) {
    parts.push(...triadToWords(millions));
    parts.push(pluralize(millions, ['мільйон', 'мільйони', 'мільйонів']));
  }
  if (thousands > 0) {
    parts.push(...triadToWords(thousands));
    parts.push(pluralize(thousands, ['тисяча', 'тисячі', 'тисяч']));
  }
  if (units > 0) {
    parts.push(...triadToWords(units));
  }

  parts.push(pluralize(units, ['гривня', 'гривні', 'гривень']));
  const sentence = parts.join(' ');
  const capitalized = sentence.charAt(0).toUpperCase() + sentence.slice(1);

  return `${capitalized} ${String(kop).padStart(2, '0')} ${pluralize(kop, [
    'копійка',
    'копійки',
    'копійок',
  ])}`;
}

// ============================================================================
// 2. СТАНДАРТНІ УКРАЇНСЬКІ БУХГАЛТЕРСЬКІ ДРУКОВАНІ ФОРМИ (РЕДАГОВАНІ ШАБЛОНИ)
// ============================================================================

export interface PrintTemplateSpec {
  templateKey: string;
  docType: string;
  name: string;
  standardCode: string;
  titleText: string;
  subtitleText: string;
  headerNote: string;
  footerNote: string;
  signLeftLabel: string;
  signRightLabel: string;
  showDiscountColumn: boolean;
  showVatBlock: boolean;
  showIbanBlock: boolean;
  showStampArea: boolean;
  showSkuColumn: boolean;
}

export const UA_STANDARD_PRINT_TEMPLATES: PrintTemplateSpec[] = [
  {
    templateKey: 'invoice_payment',
    docType: 'customer_order',
    name: 'Рахунок на оплату (Стандарт України)',
    standardCode: 'Типова форма рахунку-фактури (IBAN / ЄДРПОУ)',
    titleText: 'РАХУНОК НА ОПЛАТУ № {{docNumber}} від {{docDate}} р.',
    subtitleText: 'Дійсний для оплати протягом 3 банківських днів',
    headerNote:
      'Увага! Оплата цього рахунку означає погодження з умовами поставки товарів (надання послуг). Повідомлення про оплату є обов’язковим.',
    footerNote:
      'Призначення платежу: Оплата згідно з рахунком № {{docNumber}} від {{docDate}} р.',
    signLeftLabel: 'Виписав(ла) / Постачальник',
    signRightLabel: 'Керівник / Головний бухгалтер',
    showDiscountColumn: true,
    showVatBlock: true,
    showIbanBlock: true,
    showStampArea: true,
    showSkuColumn: true,
  },
  {
    templateKey: 'sales_waybill',
    docType: 'sales_invoice',
    name: 'Видаткова накладна (Форма № М-11 / Стандарт України)',
    standardCode: 'Первинний документ обліку реалізації (ЗУ «Про бухоблік» №996-XIV)',
    titleText: 'ВИДАТКОВА НАКЛАДНА № {{docNumber}} від {{docDate}} р.',
    subtitleText: 'Підстава: Основний договір / Замовлення покупця',
    headerNote: 'Місце складання документа: {{orgAddress}} · Склад відвантаження: {{warehouseName}}',
    footerNote:
      'Товар відпущено у повному обсязі, належної якості та комплектності. Претензій щодо кількості й зовнішнього вигляду немає.',
    signLeftLabel: 'Відпустив(ла) (Постачальник)',
    signRightLabel: 'Отримав(ла) (Покупець / за довіреністю)',
    showDiscountColumn: true,
    showVatBlock: true,
    showIbanBlock: true,
    showStampArea: true,
    showSkuColumn: true,
  },
  {
    templateKey: 'work_act',
    docType: 'sales_invoice',
    name: 'Акт наданих послуг / виконаних робіт',
    standardCode: 'Первинний документ (ст. 9 ЗУ «Про бухоблік та фінзвітність»)',
    titleText: 'АКТ здачі-прийняття робіт (надання послуг) № {{docNumber}} від {{docDate}} р.',
    subtitleText: 'Місце складання: {{orgAddress}}',
    headerNote:
      'Ми, що нижче підписалися, представник Виконавця {{orgName}} та представник Замовника {{counterpartyName}}, склали цей Акт про те, що Виконавцем належним чином виконано наступні роботи (надано послуги):',
    footerNote:
      'Усі роботи (послуги) виконані повністю і в строк. Замовник претензій по об’єму, якості та строкам виконання робіт (надання послуг) не має.',
    signLeftLabel: 'Від Виконавця',
    signRightLabel: 'Від Замовника',
    showDiscountColumn: true,
    showVatBlock: true,
    showIbanBlock: true,
    showStampArea: true,
    showSkuColumn: false,
  },
  {
    templateKey: 'ttn_waybill',
    docType: 'sales_invoice',
    name: 'Товарно-транспортна накладна (ТТН — Форма № 1-ТН)',
    standardCode: 'Форма № 1-ТН (Додаток 7 до Правил перевезень, Наказ Мінінфраструктури №363 / №413)',
    titleText: 'ТОВАРНО-ТРАНСПОРТНА НАКЛАДНА № {{docNumber}} від {{docDate}} р.',
    subtitleText: 'Автомобіль: ________________ · Водій: ________________ · Посвідчення: __________',
    headerNote:
      'Пункт навантаження: {{warehouseName}} ({{orgAddress}}) · Пункт розвантаження: за адресою вантажоодержувача {{counterpartyName}}.',
    footerNote:
      'Здав (відповідальна особа вантажовідправника) / Прийняв до перевезення (водій-експедитор) / Прийняв вантажоодержувач. Вантаж доставлено без пошкоджень.',
    signLeftLabel: 'Здав (Вантажовідправник)',
    signRightLabel: 'Прийняв (Водій / Вантажоодержувач)',
    showDiscountColumn: false,
    showVatBlock: true,
    showIbanBlock: false,
    showStampArea: true,
    showSkuColumn: true,
  },
  {
    templateKey: 'pko_cash_in',
    docType: 'money_in',
    name: 'Прибутковий касовий ордер (ПКО — Форма № КО-1)',
    standardCode: 'Типова форма № КО-1 (Додаток 2 до Положення НБУ №148 від 29.12.2017)',
    titleText: 'ПРИБУТКОВИЙ КАСОВИЙ ОРДЕР № {{docNumber}} від {{docDate}} р.',
    subtitleText: 'Кореспондуючий рахунок: Дт 301 (Каса) / Кт 361 (Покупці)',
    headerNote: 'Прийнято від: {{counterpartyName}} · Підстава: {{comment}}',
    footerNote:
      'КВИТАНЦІЯ до прибуткового касового ордера № {{docNumber}} від {{docDate}} р. Прийнято від {{counterpartyName}} суму: {{totalWords}}. М.П. (штамп касира).',
    signLeftLabel: 'Головний бухгалтер',
    signRightLabel: 'Одержав касир',
    showDiscountColumn: false,
    showVatBlock: true,
    showIbanBlock: false,
    showStampArea: true,
    showSkuColumn: false,
  },
  {
    templateKey: 'vko_cash_out',
    docType: 'money_out',
    name: 'Видатковий касовий ордер (ВКО — Форма № КО-2)',
    standardCode: 'Типова форма № КО-2 (Додаток 3 до Положення НБУ №148 від 29.12.2017)',
    titleText: 'ВИДАТКОВИЙ КАСОВИЙ ОРДЕР № {{docNumber}} від {{docDate}} р.',
    subtitleText: 'Кореспондуючий рахунок: Дт 631 / 661 / 92 · Кт 301 (Каса)',
    headerNote: 'Видати: {{counterpartyName}} · Підстава: {{comment}}',
    footerNote:
      'Одержав(ла): {{totalWords}}. Дата: «___» __________ 20___ р. Підпис одержувача: ____________. За документом (паспорт/ID): серія ___ № __________, виданий ________________.',
    signLeftLabel: 'Керівник / Головний бухгалтер',
    signRightLabel: 'Видав касир / Одержав(ла)',
    showDiscountColumn: false,
    showVatBlock: false,
    showIbanBlock: false,
    showStampArea: true,
    showSkuColumn: false,
  },
  {
    templateKey: 'goods_receipt_m4',
    docType: 'goods_receipt',
    name: 'Прибуткова накладна / Прибутковий ордер (Форма № М-4)',
    standardCode: 'Типова форма № М-4 (Оприбуткування товарно-матеріальних цінностей)',
    titleText: 'ПРИБУТКОВА НАКЛАДНА (ОРДЕР М-4) № {{docNumber}} від {{docDate}} р.',
    subtitleText: 'Склад приймання: {{warehouseName}}',
    headerNote: 'Прийнято на відповідальне зберігання від постачальника {{counterpartyName}}.',
    footerNote: 'Товар прийнято за кількістю та якістю і оприбутковано на склад за методом FIFO.',
    signLeftLabel: 'Здав (Постачальник)',
    signRightLabel: 'Прийняв (Комірник / МВО)',
    showDiscountColumn: true,
    showVatBlock: true,
    showIbanBlock: false,
    showStampArea: true,
    showSkuColumn: true,
  },
  {
    templateKey: 'inventory_inv1',
    docType: 'inventory_count',
    name: 'Інвентаризаційний опис ТМЦ (Наказ Мінфіну №572)',
    standardCode: 'Положення про інвентаризацію активів та зобов’язань (Наказ Мінфіну №879 / №572)',
    titleText: 'ІНВЕНТАРИЗАЦІЙНИЙ ОПИС ТОВАРНО-МАТЕРІАЛЬНИХ ЦІННОСТЕЙ № {{docNumber}} від {{docDate}} р.',
    subtitleText: 'Місце зберігання (Склад): {{warehouseName}}',
    headerNote:
      'Інвентаризаційна комісія провела фактичний підрахунок залишків ТМЦ та звірила його з даними бухгалтерського обліку.',
    footerNote:
      'Усі цінності, пойменовані в цьому інвентаризаційному описі, комісією перевірені в натурі в моїй присутності та внесені до опису, у зв’язку з чим претензій до інвентаризаційної комісії не маю.',
    signLeftLabel: 'Голова та члени інвентаризаційної комісії',
    signRightLabel: 'Матеріально відповідальна особа (МВО)',
    showDiscountColumn: false,
    showVatBlock: false,
    showIbanBlock: false,
    showStampArea: true,
    showSkuColumn: true,
  },
  {
    templateKey: 'payroll_p6',
    docType: 'payroll_sheet',
    name: 'Розрахунково-платіжна відомість (Форма № П-6 / П-7)',
    standardCode: 'Типова форма № П-6 / П-7 (Наказ Держкомстату №489 · ПДФО 18% · ВЗ 5% · ЄСВ 22%)',
    titleText: 'РОЗРАХУНКОВО-ПЛАТІЖНА ВІДОМІСТЬ № {{docNumber}} від {{docDate}} р.',
    subtitleText: 'Утримання: ПДФО 18%, Військовий збір 5% · Нарахування роботодавця: ЄСВ 22%',
    headerNote: 'Відомість нарахування та виплати заробітної плати штатним працівникам {{orgName}}.',
    footerNote: 'До виплати у строк. Податки та ЄСВ підлягають перерахуванню одночасно з виплатою.',
    signLeftLabel: 'Керівник підприємства',
    signRightLabel: 'Головний бухгалтер',
    showDiscountColumn: false,
    showVatBlock: false,
    showIbanBlock: false,
    showStampArea: true,
    showSkuColumn: false,
  },
  {
    templateKey: 'tax_invoice_ua',
    docType: 'tax_invoice',
    name: 'Податкова накладна ПДВ (Наказ Мінфіну №1307 / J1201015)',
    standardCode: 'Форма Податкової накладної (Наказ Мінфіну України №1307 · Електронний формат J1201015)',
    titleText: 'ПОДАТКОВА НАКЛАДНА № {{docNumber}} від {{docDate}} р.',
    subtitleText: 'Підлягає реєстрації в Єдиному реєстрі податкових накладних (ЄРПН)',
    headerNote:
      'Постачальник (продавець): {{orgName}} (ІПН {{orgIpn}}) · Отримувач (покупець): {{counterpartyName}}.',
    footerNote:
      'Документ сформовано відповідно до вимог Податкового кодексу України. Доступне вивантаження XML J1201015 для ЄРПН / M.E.Doc / Кабінету платника.',
    signLeftLabel: 'Керівник / Уповноважена особа (КЕП)',
    signRightLabel: 'Головний бухгалтер',
    showDiscountColumn: true,
    showVatBlock: true,
    showIbanBlock: false,
    showStampArea: true,
    showSkuColumn: true,
  },
];

export async function ensureDefaultPrintTemplates(db: AppDb, organizationId: string) {
  const existing = await db
    .select()
    .from(printTemplates)
    .where(eq(printTemplates.organizationId, organizationId))
    .orderBy(asc(printTemplates.templateKey));

  const existingKeys = new Set(existing.map((t) => t.templateKey));
  const missing = UA_STANDARD_PRINT_TEMPLATES.filter((t) => !existingKeys.has(t.templateKey));

  if (missing.length > 0) {
    await db.insert(printTemplates).values(
      missing.map((m) => ({
        organizationId,
        ...m,
        isSystem: true,
      }))
    );
    return db
      .select()
      .from(printTemplates)
      .where(eq(printTemplates.organizationId, organizationId))
      .orderBy(asc(printTemplates.templateKey));
  }
  return existing;
}

export async function getPrintTemplates(db: AppDb, organizationId: string) {
  return ensureDefaultPrintTemplates(db, organizationId);
}

export async function savePrintTemplate(
  db: AppDb,
  params: {
    organizationId: string;
    templateKey: string;
    docType?: string;
    name?: string;
    standardCode?: string;
    titleText?: string;
    subtitleText?: string;
    headerNote?: string;
    footerNote?: string;
    signLeftLabel?: string;
    signRightLabel?: string;
    showDiscountColumn?: boolean;
    showVatBlock?: boolean;
    showIbanBlock?: boolean;
    showStampArea?: boolean;
    showSkuColumn?: boolean;
  }
) {
  await ensureDefaultPrintTemplates(db, params.organizationId);
  const [existing] = await db
    .select()
    .from(printTemplates)
    .where(
      and(
        eq(printTemplates.organizationId, params.organizationId),
        eq(printTemplates.templateKey, params.templateKey)
      )
    )
    .limit(1);

  if (existing) {
    const [updated] = await db
      .update(printTemplates)
      .set({
        ...(params.name !== undefined ? { name: params.name.trim() } : {}),
        ...(params.standardCode !== undefined ? { standardCode: params.standardCode.trim() } : {}),
        ...(params.titleText !== undefined ? { titleText: params.titleText } : {}),
        ...(params.subtitleText !== undefined ? { subtitleText: params.subtitleText } : {}),
        ...(params.headerNote !== undefined ? { headerNote: params.headerNote } : {}),
        ...(params.footerNote !== undefined ? { footerNote: params.footerNote } : {}),
        ...(params.signLeftLabel !== undefined ? { signLeftLabel: params.signLeftLabel } : {}),
        ...(params.signRightLabel !== undefined ? { signRightLabel: params.signRightLabel } : {}),
        ...(params.showDiscountColumn !== undefined
          ? { showDiscountColumn: params.showDiscountColumn }
          : {}),
        ...(params.showVatBlock !== undefined ? { showVatBlock: params.showVatBlock } : {}),
        ...(params.showIbanBlock !== undefined ? { showIbanBlock: params.showIbanBlock } : {}),
        ...(params.showStampArea !== undefined ? { showStampArea: params.showStampArea } : {}),
        ...(params.showSkuColumn !== undefined ? { showSkuColumn: params.showSkuColumn } : {}),
        updatedAt: new Date(),
      })
      .where(eq(printTemplates.id, existing.id))
      .returning();
    return updated;
  }

  const [created] = await db
    .insert(printTemplates)
    .values({
      organizationId: params.organizationId,
      templateKey: params.templateKey,
      docType: params.docType ?? 'sales_invoice',
      name: params.name?.trim() || 'Користувацька друкована форма',
      standardCode: params.standardCode ?? '',
      titleText: params.titleText || 'ДОКУМЕНТ № {{docNumber}} від {{docDate}} р.',
      subtitleText: params.subtitleText ?? '',
      headerNote: params.headerNote ?? '',
      footerNote: params.footerNote ?? '',
      signLeftLabel: params.signLeftLabel ?? 'Відпустив(ла)',
      signRightLabel: params.signRightLabel ?? 'Отримав(ла)',
      showDiscountColumn: params.showDiscountColumn ?? true,
      showVatBlock: params.showVatBlock ?? true,
      showIbanBlock: params.showIbanBlock ?? true,
      showStampArea: params.showStampArea ?? true,
      showSkuColumn: params.showSkuColumn ?? true,
      isSystem: false,
    })
    .returning();
  return created;
}

export async function resetPrintTemplate(
  db: AppDb,
  organizationId: string,
  templateKey: string
) {
  const def = UA_STANDARD_PRINT_TEMPLATES.find((t) => t.templateKey === templateKey);
  if (!def) {
    throw new PostingError('NOT_FOUND', 'Стандартний український взірець для цього ключа не знайдено');
  }
  return savePrintTemplate(db, {
    organizationId,
    ...def,
  });
}

// ============================================================================
// 2.1 ДРУКОВАНІ ФОРМИ ДОКУМЕНТІВ (РАХУНОК, ВИДАТКОВА, АКТ, ТТН, ПКО/ВКО, ІНВЕНТАРИЗАЦІЯ, ЗП)
// ============================================================================

export async function getPrintableDocumentData(db: AppDb, documentId: string) {
  const [doc] = await db.select().from(documents).where(eq(documents.id, documentId));
  if (!doc) {
    throw new PostingError('DOCUMENT_NOT_FOUND', 'Документ для друку не знайдено');
  }

  const [[org], lines, allItems, allEmp, allWh, allCp, allAcc, allCf, templates] = await Promise.all([
    db.select().from(organizations).where(eq(organizations.id, doc.organizationId)),
    db
      .select()
      .from(documentLines)
      .where(eq(documentLines.documentId, doc.id))
      .orderBy(asc(documentLines.lineNo)),
    db.select().from(items),
    db.select().from(employees).where(eq(employees.organizationId, doc.organizationId)),
    db.select().from(warehouses).where(eq(warehouses.organizationId, doc.organizationId)),
    db.select().from(counterparties),
    db.select().from(cashAccounts).where(eq(cashAccounts.organizationId, doc.organizationId)),
    db.select().from(cashflowCategories),
    ensureDefaultPrintTemplates(db, doc.organizationId),
  ]);

  const itemMap = new Map(allItems.map((i) => [i.id, i]));
  const empMap = new Map(allEmp.map((e) => [e.id, e]));
  const whMap = new Map(allWh.map((w) => [w.id, w]));
  const cpMap = new Map(allCp.map((c) => [c.id, c]));
  const accMap = new Map(allAcc.map((a) => [a.id, a]));
  const cfMap = new Map(allCf.map((c) => [c.id, c]));
  const mainBank = allAcc.find((a) => a.accountType === 'BANK') ?? allAcc[0];
  const docAcc = doc.cashAccountId ? accMap.get(doc.cashAccountId) : undefined;
  const docCf = doc.cashflowCategoryId ? cfMap.get(doc.cashflowCategoryId) : undefined;

  const cp = doc.counterpartyId ? cpMap.get(doc.counterpartyId) : undefined;
  const wh = doc.warehouseId ? whMap.get(doc.warehouseId) : undefined;
  const targetWh = doc.targetWarehouseId ? whMap.get(doc.targetWarehouseId) : undefined;

  const enrichedLines = lines.map((l) => {
    const it = l.itemId ? itemMap.get(l.itemId) : undefined;
    const emp = l.employeeId ? empMap.get(l.employeeId) : undefined;
    const qtyNum = d(l.qty);
    const priceNum = d(l.price);
    const grossLine = round2(qtyNum.mul(priceNum));
    const discPct = round2(l.discountPercent ?? 0);
    const discAmt =
      d(l.discountAmount ?? 0).gt(0)
        ? round2(l.discountAmount)
        : discPct.gt(0)
          ? round2(grossLine.mul(discPct).div(100))
          : d(0);
    return {
      ...l,
      grossLineAmount: toNumeric2(grossLine),
      discountPercent: toNumeric2(discPct),
      discountAmount: toNumeric2(discAmt),
      itemSku: it?.sku ?? '',
      itemName: it?.name ?? emp?.fullName ?? l.notes ?? '',
      unit: it?.unit ?? (emp ? 'міс' : 'шт'),
      itemType: it?.itemType ?? 'GOODS',
      employeePosition: emp?.position ?? '',
      employeeRnokpp: emp?.rnokpp ?? '',
    };
  });

  const discountSumFromLines = enrichedLines.reduce(
    (acc, l) => acc.plus(d(l.discountAmount)),
    d(0)
  );
  const discountTotal = d(doc.discountTotal ?? 0).gt(0)
    ? round2(doc.discountTotal)
    : round2(discountSumFromLines);

  const gross = round2(doc.totalAmount);
  const subtotalBeforeDiscount = round2(gross.plus(discountTotal));
  const vatRate = org.isVatPayer ? (doc.vatRate ?? 20) : 0;
  const vat =
    d(doc.vatAmount).gt(0)
      ? round2(doc.vatAmount)
      : vatRate > 0
        ? round2(gross.mul(vatRate).div(100 + vatRate))
        : d(0);
  const net = round2(gross.minus(vat));

  return {
    document: doc,
    organization: {
      ...org,
      iban: org.iban || mainBank?.iban || '',
      bankName: org.bankName || mainBank?.name || '',
    },
    counterparty: cp ?? null,
    warehouseName: wh?.name ?? '',
    targetWarehouseName: targetWh?.name ?? '',
    cashAccount: docAcc
      ? {
          id: docAcc.id,
          name: docAcc.name,
          accountType: docAcc.accountType,
          iban: docAcc.iban,
          currency: docAcc.currency,
        }
      : null,
    cashflowCategoryName: docCf?.name ?? '',
    templates,
    totals: {
      subtotalBeforeDiscount: toNumeric2(subtotalBeforeDiscount),
      discountTotal: toNumeric2(discountTotal),
      hasDiscount: discountTotal.gt(0),
      netAmount: toNumeric2(net),
      vatRate,
      vatAmount: toNumeric2(vat),
      grossAmount: toNumeric2(gross),
      amountInWords: amountToUkrainianWords(toNumeric2(gross)),
    },
    lines: enrichedLines,
  };
}

// ============================================================================
// 3. RBAC (РОЛЬОВА МОДЕЛЬ ДОСТУПУ, ГРУПИ ТА КАСТОМНІ ПРАВА) + ЖУРНАЛ АУДИТУ
// ============================================================================

export type PermissionKey =
  | 'dashboard'
  | 'crm'
  | 'sales'
  | 'purchases'
  | 'warehouse'
  | 'production'
  | 'money'
  | 'hr'
  | 'accounting'
  | 'catalogs'
  | 'reports'
  | 'integrations'
  | 'canPostDocs'
  | 'canDeleteDocs'
  | 'canManageOrgs'
  | 'canManageUsers';

export type PermissionMap = Record<PermissionKey, boolean>;

export const ALL_PERMISSION_KEYS: PermissionKey[] = [
  'dashboard',
  'crm',
  'sales',
  'purchases',
  'warehouse',
  'production',
  'money',
  'hr',
  'accounting',
  'catalogs',
  'reports',
  'integrations',
  'canPostDocs',
  'canDeleteDocs',
  'canManageOrgs',
  'canManageUsers',
];

function makePermissions(enabled: PermissionKey[]): PermissionMap {
  const set = new Set(enabled);
  const out = {} as PermissionMap;
  for (const k of ALL_PERMISSION_KEYS) {
    out[k] = set.has(k);
  }
  return out;
}

export const DEFAULT_ROLE_PERMISSIONS: Record<UserRole, PermissionMap> = {
  OWNER: makePermissions([...ALL_PERMISSION_KEYS]),
  ACCOUNTANT: makePermissions([
    'dashboard',
    'sales',
    'purchases',
    'warehouse',
    'money',
    'hr',
    'accounting',
    'catalogs',
    'reports',
    'integrations',
    'canPostDocs',
    'canDeleteDocs',
  ]),
  SALES_MANAGER: makePermissions([
    'dashboard',
    'crm',
    'sales',
    'catalogs',
    'reports',
    'canPostDocs',
  ]),
  PURCHASE_MANAGER: makePermissions([
    'dashboard',
    'purchases',
    'warehouse',
    'catalogs',
    'reports',
    'canPostDocs',
  ]),
  STOREKEEPER: makePermissions([
    'dashboard',
    'warehouse',
    'production',
    'purchases',
    'catalogs',
    'canPostDocs',
  ]),
  CUSTOM: makePermissions(['dashboard']),
};

export function resolveEffectivePermissions(
  role: UserRole,
  groupPermissions?: Partial<Record<string, boolean>> | null,
  userOverrides?: Partial<Record<string, boolean>> | null
): PermissionMap {
  const base = { ...(DEFAULT_ROLE_PERMISSIONS[role] ?? DEFAULT_ROLE_PERMISSIONS.CUSTOM) };
  if (groupPermissions && Object.keys(groupPermissions).length > 0) {
    for (const k of ALL_PERMISSION_KEYS) {
      if (typeof groupPermissions[k] === 'boolean') {
        base[k] = Boolean(groupPermissions[k]);
      }
    }
  }
  if (userOverrides && Object.keys(userOverrides).length > 0) {
    for (const k of ALL_PERMISSION_KEYS) {
      if (typeof userOverrides[k] === 'boolean') {
        base[k] = Boolean(userOverrides[k]);
      }
    }
  }
  return base;
}

export const ROLE_LABELS: Record<UserRole, string> = {
  OWNER: 'Власник / Директор (Повний доступ)',
  ACCOUNTANT: 'Головний бухгалтер (Облік, ПДВ, ЗП, SAF-T)',
  SALES_MANAGER: 'Менеджер з продажу (CRM, Замовлення, Продажі, ПРРО)',
  PURCHASE_MANAGER: 'Менеджер із закупівель (Постачальники, Закупівлі, Склад)',
  STOREKEEPER: 'Комірник (Прихід, Переміщення, Інвентаризація, Виробництво)',
  CUSTOM: 'Індивідуальні права (Кастомний доступ)',
};

export function requiredPermissionForDocType(docType: DocumentType): PermissionKey {
  switch (docType) {
    case 'customer_order':
    case 'sales_invoice':
    case 'tax_invoice':
    case 'price_setting':
      return 'sales';
    case 'goods_receipt':
      return 'purchases';
    case 'stock_transfer':
    case 'inventory_count':
    case 'opening_balance':
      return 'warehouse';
    case 'production_order':
      return 'production';
    case 'payroll_sheet':
      return 'hr';
    case 'money_in':
    case 'money_out':
      return 'money';
    case 'manual_journal':
    case 'depreciation_run':
    case 'fx_revaluation':
      return 'accounting';
  }
}

export const ALL_DOCUMENT_TYPES: DocumentType[] = [
  'opening_balance',
  'customer_order',
  'goods_receipt',
  'sales_invoice',
  'stock_transfer',
  'inventory_count',
  'production_order',
  'payroll_sheet',
  'tax_invoice',
  'depreciation_run',
  'fx_revaluation',
  'money_in',
  'money_out',
  'price_setting',
  'manual_journal',
];

export function canViewDocType(perms: PermissionMap, docType: DocumentType): boolean {
  if (perms.accounting) return true;
  const reqPerm = requiredPermissionForDocType(docType);
  if (perms[reqPerm]) return true;
  if (docType === 'money_in' && perms.sales) return true;
  if (docType === 'money_out' && perms.purchases) return true;
  if (docType === 'price_setting' && (perms.sales || perms.purchases)) return true;
  if (docType === 'goods_receipt' && perms.warehouse) return true;
  if (docType === 'tax_invoice' && perms.sales) return true;
  if (docType === 'opening_balance' && (perms.warehouse || perms.purchases)) return true;
  return false;
}

export function getVisibleDocTypes(perms: PermissionMap): DocumentType[] {
  return ALL_DOCUMENT_TYPES.filter((dt) => canViewDocType(perms, dt));
}

export function assertEffectivePermission(
  perms: PermissionMap,
  action: 'DOC_WRITE' | 'DOC_POST' | 'DOC_DELETE' | 'ORG_POLICY' | 'USERS_ADMIN' | 'INTEGRATION_SYNC' | 'PAYROLL' | 'ACCOUNTING',
  docType?: DocumentType
): void {
  if (action === 'USERS_ADMIN' && !perms.canManageUsers) {
    throw new PostingError(
      'FORBIDDEN_ROLE',
      'У вас немає права на керування користувачами та групами доступу'
    );
  }
  if (action === 'ORG_POLICY' && !perms.canManageOrgs && !perms.accounting) {
    throw new PostingError(
      'FORBIDDEN_ROLE',
      'У вас немає прав на зміну організацій та облікової політики'
    );
  }
  if (action === 'INTEGRATION_SYNC' && !perms.integrations) {
    throw new PostingError(
      'FORBIDDEN_ROLE',
      'У вас немає доступу до інтеграцій та синхронізації'
    );
  }
  if (action === 'PAYROLL' && !perms.hr && !perms.accounting) {
    throw new PostingError(
      'FORBIDDEN_ROLE',
      'У вас немає доступу до розділу Персонал та Зарплата'
    );
  }
  if (action === 'ACCOUNTING' && !perms.accounting) {
    throw new PostingError(
      'FORBIDDEN_ROLE',
      'У вас немає доступу до Бухгалтерії №291 та звітності ДПС'
    );
  }
  if (action === 'DOC_POST' && !perms.canPostDocs) {
    throw new PostingError(
      'FORBIDDEN_ROLE',
      'У вас немає права на проведення або скасування проведення документів'
    );
  }
  if (action === 'DOC_DELETE' && !perms.canDeleteDocs) {
    throw new PostingError(
      'FORBIDDEN_ROLE',
      'У вас немає права на видалення документів'
    );
  }
  if ((action === 'DOC_WRITE' || action === 'DOC_POST') && docType) {
    const reqPerm = requiredPermissionForDocType(docType);
    // Додаткова гнучкість: менеджер з продажу може вносити money_in/price_setting; закупівельник — money_out/price_setting
    const allowedByAlias =
      (docType === 'tax_invoice' && perms.accounting) ||
      (docType === 'money_in' && (perms.sales || perms.accounting)) ||
      (docType === 'money_out' && (perms.purchases || perms.accounting)) ||
      (docType === 'price_setting' && (perms.sales || perms.purchases)) ||
      (docType === 'goods_receipt' && perms.warehouse);
    if (!perms[reqPerm] && !allowedByAlias) {
      throw new PostingError(
        'FORBIDDEN_ROLE',
        `У вас немає прав для роботи з документом типу «${docType}»`
      );
    }
  }
}

export function assertRolePermission(
  role: UserRole,
  action: 'DOC_WRITE' | 'DOC_POST' | 'ORG_POLICY' | 'INTEGRATION_SYNC' | 'PAYROLL' | 'ACCOUNTING',
  docType?: DocumentType
): void {
  if (role === 'OWNER' || role === 'ACCOUNTANT') return;

  if (action === 'ORG_POLICY' || action === 'PAYROLL' || action === 'ACCOUNTING') {
    throw new PostingError(
      'FORBIDDEN_ROLE',
      `Роль "${ROLE_LABELS[role]}" не має прав на виконання цієї фінансово-бухгалтерської операції`
    );
  }

  if (role === 'STOREKEEPER') {
    const allowedDocs: DocumentType[] = [
      'goods_receipt',
      'stock_transfer',
      'inventory_count',
      'production_order',
    ];
    if (docType && !allowedDocs.includes(docType)) {
      throw new PostingError(
        'FORBIDDEN_ROLE',
        `Комірник може працювати лише зі складськими та виробничими документами (заборонено: ${docType})`
      );
    }
  }

  if (role === 'SALES_MANAGER') {
    const allowedDocs: DocumentType[] = [
      'customer_order',
      'sales_invoice',
      'money_in',
      'price_setting',
      'tax_invoice',
    ];
    if (docType && !allowedDocs.includes(docType)) {
      throw new PostingError(
        'FORBIDDEN_ROLE',
        `Менеджер з продажу не має прав змінювати документ типу "${docType}"`
      );
    }
  }

  if (role === 'PURCHASE_MANAGER') {
    const allowedDocs: DocumentType[] = [
      'goods_receipt',
      'money_out',
      'price_setting',
      'stock_transfer',
    ];
    if (docType && !allowedDocs.includes(docType)) {
      throw new PostingError(
        'FORBIDDEN_ROLE',
        `Менеджер із закупівель не має прав змінювати документ типу "${docType}"`
      );
    }
  }
}

export async function recordAuditLog(
  db: AppDb,
  params: {
    organizationId: string;
    userId?: string;
    userName?: string;
    userRole?: UserRole;
    action: string;
    entityType: string;
    entityId?: string;
    summary: string;
  }
): Promise<void> {
  await db.insert(auditLogs).values({
    organizationId: params.organizationId,
    userId: params.userId ?? '',
    userName: params.userName ?? 'Користувач',
    userRole: params.userRole ?? 'OWNER',
    action: params.action,
    entityType: params.entityType,
    entityId: params.entityId ?? '',
    summary: params.summary,
  });
}

export async function getAuditLogs(db: AppDb, organizationId: string, limit = 40) {
  return db
    .select()
    .from(auditLogs)
    .where(eq(auditLogs.organizationId, organizationId))
    .orderBy(desc(auditLogs.createdAt))
    .limit(limit);
}

export async function ensureDefaultUsers(db: AppDb, organizationId: string) {
  const existing = await db
    .select()
    .from(appUsers)
    .where(eq(appUsers.organizationId, organizationId));

  if (existing.length > 0) return existing;

  return db
    .insert(appUsers)
    .values([
      {
        organizationId,
        fullName: 'Шевченко Андрій (Директор)',
        email: 'ceo@kyivtech.ua',
        role: 'OWNER',
      },
      {
        organizationId,
        fullName: 'Мельник Олена (Гол. бухгалтер)',
        email: 'chief.acc@kyivtech.ua',
        role: 'ACCOUNTANT',
      },
      {
        organizationId,
        fullName: 'Бондаренко Максим (Менеджер B2B)',
        email: 'sales@kyivtech.ua',
        role: 'SALES_MANAGER',
      },
      {
        organizationId,
        fullName: 'Ткаченко Ігор (Зав. складу)',
        email: 'warehouse@kyivtech.ua',
        role: 'STOREKEEPER',
      },
    ])
    .returning();
}
