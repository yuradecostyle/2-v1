import { eq } from 'drizzle-orm';
import type { AppDb } from './db.js';
import { basSettings, organizations, type DocumentType } from './schema.js';

// ============================================================================
// 1. ФУНКЦІОНАЛЬНІ ОПЦІЇ BAS МАЛИЙ БІЗНЕС («ЩЕ БІЛЬШЕ МОЖЛИВОСТЕЙ»)
// ============================================================================

export interface BasFeaturesConfig {
  // Загальні та інтерфейс
  alwaysOpenDocsInModal: boolean;
  useDepartments: boolean;
  useProjects: boolean;
  useCustomDocFields: boolean;
  // Продажі, замовлення та ціни
  allowOrderWithoutStock: boolean; // Товар на замовлення — проводити в мінус без залишку на складі
  useDiscounts: boolean;
  useOrderStatuses: boolean;
  useContracts: boolean;
  useDeliveryAndTtn: boolean;
  usePrroCheckbox: boolean;
  // Закупівлі та склад
  allowNegativeStockGlobal: boolean; // Списання товарів у мінус по всіх документах
  useWarehouseReserves: boolean;
  useBarcodes: boolean;
  // CRM, Роботи, Виробництво
  useCrm: boolean;
  useWorks: boolean;
  useProductionBom: boolean;
  // Кошти, Персонал, Бухгалтерія
  useMultiCurrency: boolean;
  usePayroll: boolean;
  useVatAccounting: boolean;
}

export const DEFAULT_BAS_FEATURES: BasFeaturesConfig = {
  alwaysOpenDocsInModal: true,
  useDepartments: true,
  useProjects: true,
  useCustomDocFields: true,
  allowOrderWithoutStock: true,
  useDiscounts: true,
  useOrderStatuses: true,
  useContracts: true,
  useDeliveryAndTtn: true,
  usePrroCheckbox: true,
  allowNegativeStockGlobal: false,
  useWarehouseReserves: true,
  useBarcodes: true,
  useCrm: true,
  useWorks: true,
  useProductionBom: true,
  useMultiCurrency: true,
  usePayroll: true,
  useVatAccounting: true,
};

// ============================================================================
// 2. КОНСТРУКТОР ПОЛІВ ПО КОЖНОМУ ДОКУМЕНТУ (ЯК У BAS МАЛИЙ БІЗНЕС)
// ============================================================================

export interface DocFieldConfigItem {
  key: string;
  label: string;
  group: 'header' | 'extra' | 'line';
  visible: boolean;
  required: boolean;
}

export interface CustomDocFieldDef {
  id: string;
  label: string;
  type: 'text' | 'number' | 'date' | 'select';
  options?: string[];
  required: boolean;
}

export interface DocTypeFieldSettings {
  fields: DocFieldConfigItem[];
  customFields: CustomDocFieldDef[];
}

export type AllDocFieldsConfig = Record<DocumentType, DocTypeFieldSettings>;

export interface DocumentMeta {
  orderStatus?: 'NEW' | 'IN_PROGRESS' | 'AWAITING_PAYMENT' | 'READY_TO_SHIP' | 'COMPLETED' | 'CANCELLED';
  shipmentDate?: string;
  managerName?: string;
  projectName?: string;
  deliveryMethod?: string;
  deliveryAddress?: string;
  ttnNumber?: string;
  paymentTerms?: string;
  allowNegativeStock?: boolean;
  isBackorder?: boolean;
  customFields?: Record<string, string>;
}

export function parseDocumentMeta(metaJson?: string | null): DocumentMeta {
  if (!metaJson) return {};
  try {
    const parsed = JSON.parse(metaJson);
    return parsed && typeof parsed === 'object' ? (parsed as DocumentMeta) : {};
  } catch {
    return {};
  }
}

function f(
  key: string,
  label: string,
  group: 'header' | 'extra' | 'line',
  visible = true,
  required = false
): DocFieldConfigItem {
  return { key, label, group, visible, required };
}

export const DEFAULT_DOC_FIELD_CONFIGS: AllDocFieldsConfig = {
  customer_order: {
    fields: [
      f('docNumber', 'Номер документа', 'header', true, false),
      f('docDate', 'Дата та час', 'header', true, true),
      f('counterpartyId', 'Покупець / Клієнт', 'header', true, true),
      f('contractId', 'Договір', 'header', true, false),
      f('warehouseId', 'Склад резервування', 'header', true, false),
      f('priceTypeId', 'Тип цін', 'header', true, false),
      f('departmentId', 'Підрозділ / Філія', 'header', true, false),
      f('orderStatus', 'Стан замовлення', 'extra', true, false),
      f('shipmentDate', 'Дата відвантаження', 'extra', true, false),
      f('managerName', 'Відповідальний менеджер', 'extra', true, false),
      f('projectName', 'Проєкт / Об’єкт', 'extra', true, false),
      f('paymentTerms', 'Умови оплати', 'extra', true, false),
      f('deliveryMethod', 'Спосіб доставки', 'extra', true, false),
      f('deliveryAddress', 'Адреса доставки / Відділення', 'extra', true, false),
      f('ttnNumber', 'Номер ТТН / Декларації', 'extra', false, false),
      f('allowNegativeStock', 'Товар на замовлення (в мінус без складу)', 'extra', true, false),
      f('comment', 'Коментар', 'extra', true, false),
      f('lineDiscount', 'Колонка «Знижка %»', 'line', true, false),
      f('lineNotes', 'Колонка «Примітка рядка»', 'line', false, false),
    ],
    customFields: [],
  },
  sales_invoice: {
    fields: [
      f('docNumber', 'Номер документа', 'header', true, false),
      f('docDate', 'Дата та час', 'header', true, true),
      f('counterpartyId', 'Покупець / Клієнт', 'header', true, true),
      f('contractId', 'Договір', 'header', true, false),
      f('parentDocId', 'На підставі замовлення', 'header', true, false),
      f('warehouseId', 'Склад відвантаження', 'header', true, true),
      f('priceTypeId', 'Тип цін', 'header', true, false),
      f('departmentId', 'Підрозділ / Філія', 'header', true, false),
      f('managerName', 'Відповідальний менеджер', 'extra', true, false),
      f('projectName', 'Проєкт / Об’єкт', 'extra', true, false),
      f('paymentTerms', 'Умови оплати', 'extra', false, false),
      f('deliveryMethod', 'Спосіб доставки', 'extra', true, false),
      f('deliveryAddress', 'Адреса доставки', 'extra', true, false),
      f('ttnNumber', 'Номер ТТН', 'extra', true, false),
      f('allowNegativeStock', 'Товар на замовлення (провести в мінус)', 'extra', true, false),
      f('comment', 'Коментар', 'extra', true, false),
      f('lineDiscount', 'Колонка «Знижка %»', 'line', true, false),
      f('lineNotes', 'Колонка «Примітка рядка»', 'line', false, false),
    ],
    customFields: [],
  },
  goods_receipt: {
    fields: [
      f('docNumber', 'Номер документа', 'header', true, false),
      f('docDate', 'Дата та час', 'header', true, true),
      f('counterpartyId', 'Постачальник', 'header', true, true),
      f('contractId', 'Договір з постачальником', 'header', true, false),
      f('warehouseId', 'Склад приймання', 'header', true, true),
      f('departmentId', 'Підрозділ', 'header', true, false),
      f('managerName', 'Відповідальний', 'extra', true, false),
      f('projectName', 'Проєкт / Об’єкт', 'extra', false, false),
      f('ttnNumber', 'Вхідний № накладної / ТТН', 'extra', true, false),
      f('comment', 'Коментар', 'extra', true, false),
      f('lineNotes', 'Колонка «Примітка рядка»', 'line', false, false),
    ],
    customFields: [],
  },
  money_in: {
    fields: [
      f('docNumber', 'Номер документа', 'header', true, false),
      f('docDate', 'Дата та час', 'header', true, true),
      f('counterpartyId', 'Платник / Контрагент', 'header', true, false),
      f('contractId', 'Договір', 'header', true, false),
      f('cashAccountId', 'Каса / Банківський рахунок', 'header', true, true),
      f('cashflowCategoryId', 'Стаття РГК (Cash Flow)', 'header', true, false),
      f('departmentId', 'Підрозділ', 'header', true, false),
      f('projectName', 'Проєкт / Об’єкт', 'extra', false, false),
      f('comment', 'Призначення платежу / Коментар', 'extra', true, false),
    ],
    customFields: [],
  },
  money_out: {
    fields: [
      f('docNumber', 'Номер документа', 'header', true, false),
      f('docDate', 'Дата та час', 'header', true, true),
      f('counterpartyId', 'Отримувач / Контрагент', 'header', true, false),
      f('contractId', 'Договір', 'header', true, false),
      f('cashAccountId', 'Каса / Банківський рахунок', 'header', true, true),
      f('cashflowCategoryId', 'Стаття витрат / РГК', 'header', true, false),
      f('departmentId', 'Підрозділ', 'header', true, false),
      f('projectName', 'Проєкт / Об’єкт', 'extra', false, false),
      f('comment', 'Призначення платежу / Коментар', 'extra', true, false),
    ],
    customFields: [],
  },
  stock_transfer: {
    fields: [
      f('docNumber', 'Номер документа', 'header', true, false),
      f('docDate', 'Дата та час', 'header', true, true),
      f('warehouseId', 'Склад-відправник', 'header', true, true),
      f('targetWarehouseId', 'Склад-отримувач', 'header', true, true),
      f('departmentId', 'Підрозділ', 'header', true, false),
      f('managerName', 'Відповідальний комірник', 'extra', true, false),
      f('comment', 'Коментар', 'extra', true, false),
    ],
    customFields: [],
  },
  inventory_count: {
    fields: [
      f('docNumber', 'Номер документа', 'header', true, false),
      f('docDate', 'Дата інвентаризації', 'header', true, true),
      f('warehouseId', 'Склад', 'header', true, true),
      f('departmentId', 'Підрозділ', 'header', true, false),
      f('managerName', 'Голова комісії / МВО', 'extra', true, false),
      f('comment', 'Коментар', 'extra', true, false),
    ],
    customFields: [],
  },
  production_order: {
    fields: [
      f('docNumber', 'Номер документа', 'header', true, false),
      f('docDate', 'Дата випуску', 'header', true, true),
      f('bomSpecId', 'Специфікація BOM', 'header', true, false),
      f('warehouseId', 'Склад сировини', 'header', true, true),
      f('targetWarehouseId', 'Склад готової продукції', 'header', true, true),
      f('departmentId', 'Підрозділ / Цех', 'header', true, false),
      f('projectName', 'Проєкт / Замовлення', 'extra', true, false),
      f('comment', 'Коментар', 'extra', true, false),
    ],
    customFields: [],
  },
  payroll_sheet: {
    fields: [
      f('docNumber', 'Номер відомості', 'header', true, false),
      f('docDate', 'Дата нарахування', 'header', true, true),
      f('departmentId', 'Підрозділ', 'header', true, false),
      f('comment', 'Період та примітка', 'extra', true, false),
    ],
    customFields: [],
  },
  tax_invoice: {
    fields: [
      f('docNumber', 'Номер ПН', 'header', true, false),
      f('docDate', 'Дата виникнення ПЗ', 'header', true, true),
      f('counterpartyId', 'Покупець', 'header', true, true),
      f('contractId', 'Договір', 'header', true, false),
      f('vatRate', 'Ставка ПДВ (%)', 'header', true, true),
      f('comment', 'Примітка', 'extra', true, false),
      f('lineDiscount', 'Колонка «Знижка %»', 'line', true, false),
    ],
    customFields: [],
  },
  price_setting: {
    fields: [
      f('docNumber', 'Номер документа', 'header', true, false),
      f('docDate', 'Дата дії цін', 'header', true, true),
      f('priceTypeId', 'Вид цін', 'header', true, true),
      f('comment', 'Коментар', 'extra', true, false),
    ],
    customFields: [],
  },
  manual_journal: {
    fields: [
      f('docNumber', 'Номер операції', 'header', true, false),
      f('docDate', 'Дата проводки', 'header', true, true),
      f('departmentId', 'Підрозділ', 'header', true, false),
      f('comment', 'Зміст бухгалтерської операції', 'extra', true, false),
    ],
    customFields: [],
  },
  opening_balance: {
    fields: [
      f('docNumber', 'Номер документа', 'header', true, false),
      f('docDate', 'Дата вводу залишків', 'header', true, true),
      f('warehouseId', 'Склад', 'header', true, false),
      f('comment', 'Коментар', 'extra', true, false),
    ],
    customFields: [],
  },
  depreciation_run: {
    fields: [
      f('docNumber', 'Номер документа', 'header', true, false),
      f('docDate', 'Дата амортизації', 'header', true, true),
      f('comment', 'Коментар', 'extra', true, false),
    ],
    customFields: [],
  },
  fx_revaluation: {
    fields: [
      f('docNumber', 'Номер документа', 'header', true, false),
      f('docDate', 'Дата переоцінки', 'header', true, true),
      f('comment', 'Коментар', 'extra', true, false),
    ],
    customFields: [],
  },
};

// ============================================================================
// 3. НАЛАШТУВАННЯ МЕНЮ ТА ПІДМЕНЮ (КОЖЕН ПУНКТ МОЖНА УВІМКНУТИ / ПЕРЕЙМЕНУВАТИ / ЗАКРІПИТИ)
// ============================================================================

export interface MenuSectionOverride {
  visible?: boolean;
  label?: string;
  order?: number;
}

export interface MenuItemOverride {
  visible?: boolean;
  label?: string;
  pinned?: boolean;
}

export interface MenuCustomizationConfig {
  sections: Record<string, MenuSectionOverride>;
  items: Record<string, MenuItemOverride>;
}

export const DEFAULT_MENU_CUSTOMIZATION: MenuCustomizationConfig = {
  sections: {},
  items: {},
};

export interface BasSettingsPayload {
  organizationId: string;
  features: BasFeaturesConfig;
  docFields: AllDocFieldsConfig;
  menuConfig: MenuCustomizationConfig;
  updatedAt: string;
}

function mergeDocFields(stored: Partial<Record<string, Partial<DocTypeFieldSettings>>>): AllDocFieldsConfig {
  const out = {} as AllDocFieldsConfig;
  for (const docType of Object.keys(DEFAULT_DOC_FIELD_CONFIGS) as DocumentType[]) {
    const def = DEFAULT_DOC_FIELD_CONFIGS[docType];
    const saved = stored?.[docType];
    const savedFieldMap = new Map((saved?.fields ?? []).map((item) => [item.key, item]));

    const mergedFields: DocFieldConfigItem[] = def.fields.map((df) => {
      const ov = savedFieldMap.get(df.key);
      if (!ov) return { ...df };
      return {
        key: df.key,
        group: df.group,
        label: typeof ov.label === 'string' && ov.label.trim() ? ov.label.trim() : df.label,
        visible: typeof ov.visible === 'boolean' ? ov.visible : df.visible,
        required: typeof ov.required === 'boolean' ? ov.required : df.required,
      };
    });

    const customFields: CustomDocFieldDef[] = Array.isArray(saved?.customFields)
      ? saved.customFields.filter(
          (cf) => cf && typeof cf.id === 'string' && typeof cf.label === 'string' && cf.label.trim()
        )
      : [];

    out[docType] = {
      fields: mergedFields,
      customFields,
    };
  }
  return out;
}

export async function getBasSettings(db: AppDb, organizationId: string): Promise<BasSettingsPayload> {
  const [[row], [org]] = await Promise.all([
    db
      .select()
      .from(basSettings)
      .where(eq(basSettings.organizationId, organizationId))
      .limit(1),
    db
      .select({ allowNegativeStock: organizations.allowNegativeStock })
      .from(organizations)
      .where(eq(organizations.id, organizationId))
      .limit(1),
  ]);

  let parsedFeatures: Partial<BasFeaturesConfig> = {};
  let parsedDocFields: Partial<Record<string, Partial<DocTypeFieldSettings>>> = {};
  let parsedMenu: Partial<MenuCustomizationConfig> = {};

  if (row) {
    try {
      parsedFeatures = JSON.parse(row.featuresJson || '{}');
    } catch {}
    try {
      parsedDocFields = JSON.parse(row.docFieldsJson || '{}');
    } catch {}
    try {
      parsedMenu = JSON.parse(row.menuConfigJson || '{}');
    } catch {}
  }

  const features: BasFeaturesConfig = {
    ...DEFAULT_BAS_FEATURES,
    ...parsedFeatures,
    // Завжди синхронізуємо глобальний прапор мінусових залишків з поточною організацією
    allowNegativeStockGlobal:
      parsedFeatures.allowNegativeStockGlobal ?? Boolean(org?.allowNegativeStock),
  };

  return {
    organizationId,
    features,
    docFields: mergeDocFields(parsedDocFields),
    menuConfig: {
      sections: parsedMenu.sections && typeof parsedMenu.sections === 'object' ? parsedMenu.sections : {},
      items: parsedMenu.items && typeof parsedMenu.items === 'object' ? parsedMenu.items : {},
    },
    updatedAt: row?.updatedAt?.toISOString() ?? new Date().toISOString(),
  };
}

export async function saveBasSettings(
  db: AppDb,
  organizationId: string,
  patch: {
    features?: Partial<BasFeaturesConfig>;
    docFields?: Partial<Record<string, Partial<DocTypeFieldSettings>>>;
    menuConfig?: Partial<MenuCustomizationConfig>;
  }
): Promise<BasSettingsPayload> {
  const current = await getBasSettings(db, organizationId);

  const nextFeatures: BasFeaturesConfig = {
    ...current.features,
    ...(patch.features ?? {}),
  };

  const nextDocFields = patch.docFields
    ? mergeDocFields({ ...current.docFields, ...patch.docFields })
    : current.docFields;

  const nextMenuConfig: MenuCustomizationConfig = {
    sections:
      patch.menuConfig?.sections !== undefined
        ? patch.menuConfig.sections
        : current.menuConfig.sections,
    items:
      patch.menuConfig?.items !== undefined ? patch.menuConfig.items : current.menuConfig.items,
  };

  // Синхронізуємо organizations.allowNegativeStock якщо змінили в опціях BAS
  if (patch.features?.allowNegativeStockGlobal !== undefined) {
    await db
      .update(organizations)
      .set({ allowNegativeStock: Boolean(patch.features.allowNegativeStockGlobal) })
      .where(eq(organizations.id, organizationId));
  }

  const [existing] = await db
    .select({ id: basSettings.id })
    .from(basSettings)
    .where(eq(basSettings.organizationId, organizationId))
    .limit(1);

  if (existing) {
    await db
      .update(basSettings)
      .set({
        featuresJson: JSON.stringify(nextFeatures),
        docFieldsJson: JSON.stringify(nextDocFields),
        menuConfigJson: JSON.stringify(nextMenuConfig),
        updatedAt: new Date(),
      })
      .where(eq(basSettings.id, existing.id));
  } else {
    await db.insert(basSettings).values({
      organizationId,
      featuresJson: JSON.stringify(nextFeatures),
      docFieldsJson: JSON.stringify(nextDocFields),
      menuConfigJson: JSON.stringify(nextMenuConfig),
    });
  }

  return getBasSettings(db, organizationId);
}

export async function resetBasSettings(
  db: AppDb,
  organizationId: string,
  scope: 'all' | 'features' | 'docFields' | 'menuConfig' = 'all'
): Promise<BasSettingsPayload> {
  const current = await getBasSettings(db, organizationId);
  return saveBasSettings(db, organizationId, {
    features: scope === 'all' || scope === 'features' ? DEFAULT_BAS_FEATURES : current.features,
    docFields:
      scope === 'all' || scope === 'docFields' ? DEFAULT_DOC_FIELD_CONFIGS : current.docFields,
    menuConfig:
      scope === 'all' || scope === 'menuConfig' ? DEFAULT_MENU_CUSTOMIZATION : current.menuConfig,
  });
}
