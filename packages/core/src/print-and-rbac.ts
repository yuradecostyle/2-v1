import { asc, desc, eq } from 'drizzle-orm';
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
// 2. ДРУКОВАНІ ФОРМИ ДОКУМЕНТІВ (РАХУНОК, ВИДАТКОВА, АКТ, ТТН, ІНВЕНТАРИЗАЦІЯ, ВІДОМІСТЬ)
// ============================================================================

export async function getPrintableDocumentData(db: AppDb, documentId: string) {
  const [doc] = await db.select().from(documents).where(eq(documents.id, documentId));
  if (!doc) {
    throw new PostingError('DOCUMENT_NOT_FOUND', 'Документ для друку не знайдено');
  }

  const [[org], lines, allItems, allEmp, allWh, allCp, allAcc, allCf] = await Promise.all([
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

  const gross = round2(doc.totalAmount);
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
      iban: org.iban || mainBank?.iban || 'UA213052990000026007015012345',
      bankName: org.bankName || mainBank?.name || 'АТ КБ «ПриватБанк»',
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
    totals: {
      netAmount: toNumeric2(net),
      vatRate,
      vatAmount: toNumeric2(vat),
      grossAmount: toNumeric2(gross),
      amountInWords: amountToUkrainianWords(toNumeric2(gross)),
    },
    lines: lines.map((l) => {
      const it = l.itemId ? itemMap.get(l.itemId) : undefined;
      const emp = l.employeeId ? empMap.get(l.employeeId) : undefined;
      return {
        ...l,
        itemSku: it?.sku ?? '',
        itemName: it?.name ?? emp?.fullName ?? l.notes ?? '',
        unit: it?.unit ?? (emp ? 'міс' : 'шт'),
        itemType: it?.itemType ?? 'GOODS',
        employeePosition: emp?.position ?? '',
        employeeRnokpp: emp?.rnokpp ?? '',
      };
    }),
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
      (docType === 'money_in' && perms.sales) ||
      (docType === 'money_out' && perms.purchases) ||
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
