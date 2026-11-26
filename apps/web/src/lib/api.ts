export type DocumentType =
  | 'opening_balance'
  | 'customer_order'
  | 'goods_receipt'
  | 'sales_invoice'
  | 'stock_transfer'
  | 'inventory_count'
  | 'production_order'
  | 'payroll_sheet'
  | 'tax_invoice'
  | 'depreciation_run'
  | 'fx_revaluation'
  | 'money_in'
  | 'money_out'
  | 'price_setting'
  | 'manual_journal';

export type UserRole =
  | 'OWNER'
  | 'ACCOUNTANT'
  | 'SALES_MANAGER'
  | 'PURCHASE_MANAGER'
  | 'STOREKEEPER'
  | 'CUSTOM';

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

export const PERMISSION_CATALOG: Array<{
  group: 'sections' | 'actions';
  key: PermissionKey;
  label: string;
  hint: string;
}> = [
  { group: 'sections', key: 'dashboard', label: 'Дашборд та показники', hint: 'Огляд бізнесу, KPI, каси' },
  { group: 'sections', key: 'crm', label: 'CRM-воронка', hint: 'Ліди, дзвінки, задачі, конвертація' },
  { group: 'sections', key: 'sales', label: 'Продажі', hint: 'Замовлення, видаткові, рахунки, ПРРО, ПН, прайси' },
  { group: 'sections', key: 'purchases', label: 'Закупівлі', hint: 'Постачальники, прибуткові накладні, витрати' },
  { group: 'sections', key: 'warehouse', label: 'Склад', hint: 'Переміщення, інвентаризація, залишки FIFO' },
  { group: 'sections', key: 'production', label: 'Виробництво і Роботи', hint: 'Комплектації BOM, наряди, роботи' },
  { group: 'sections', key: 'money', label: 'Кошти та Валюта', hint: 'Банк, каса, ПКО/ВКО, курси НБУ' },
  { group: 'sections', key: 'hr', label: 'Персонал та Зарплата', hint: 'Співробітники, відомості ЗП, ПДФО/ЄСВ' },
  { group: 'sections', key: 'accounting', label: 'Бухгалтерія 291 і ДПС', hint: 'ОСВ, SAF-T UA, Ф1/Ф2, ПДВ, ЄП, ОЗ' },
  { group: 'sections', key: 'catalogs', label: 'Довідники', hint: 'Номенклатура, покупці, постачальники' },
  { group: 'sections', key: 'reports', label: 'Аналітика та Звіти', hint: 'P&L, валовий прибуток, борги, Cash Flow' },
  { group: 'sections', key: 'integrations', label: 'Інтеграції та Імпорт', hint: 'BAS OData, Monobank, Приват24, Checkbox' },
  { group: 'actions', key: 'canPostDocs', label: 'Проведення документів', hint: 'Проводити та скасовувати проведення' },
  { group: 'actions', key: 'canDeleteDocs', label: 'Видалення документів', hint: 'Видаляти документи з журналу' },
  { group: 'actions', key: 'canManageOrgs', label: 'Керування ФОП / ТОВ', hint: 'Створювати й редагувати організації' },
  { group: 'actions', key: 'canManageUsers', label: 'Користувачі та права', hint: 'Додавати співробітників і групи доступу' },
];

export interface AccessGroupDto {
  id: string;
  name: string;
  description: string;
  baseRole: UserRole;
  permissions: PermissionMap;
  isSystem: boolean;
  usersCount?: number;
  createdAt: string;
}

export interface DepartmentDto {
  id: string;
  organizationId: string;
  organizationName?: string;
  code: string;
  name: string;
  description: string;
  headName: string;
  address: string;
  isActive: boolean;
  employeesCount?: number;
  usersCount?: number;
  documentsCount?: number;
  createdAt?: string;
}

export interface AuthUserDto {
  id: string;
  organizationId: string;
  departmentId: string | null;
  departmentName: string;
  accessGroupId: string | null;
  accessGroupName: string;
  fullName: string;
  login: string;
  email: string;
  role: UserRole;
  allowedOrgIds: string[];
  allowedDepartmentIds: string[];
  permissions: Record<string, boolean>;
  effectivePermissions: PermissionMap;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

export function canAccessDocType(
  perms: PermissionMap | undefined,
  docType: DocumentType
): boolean {
  if (!perms) return true;
  if (perms.accounting) return true;
  switch (docType) {
    case 'customer_order':
    case 'sales_invoice':
    case 'tax_invoice':
      return Boolean(perms.sales);
    case 'price_setting':
      return Boolean(perms.sales || perms.purchases);
    case 'goods_receipt':
      return Boolean(perms.purchases || perms.warehouse);
    case 'stock_transfer':
    case 'inventory_count':
      return Boolean(perms.warehouse);
    case 'opening_balance':
      return Boolean(perms.warehouse || perms.purchases);
    case 'production_order':
      return Boolean(perms.production);
    case 'payroll_sheet':
      return Boolean(perms.hr);
    case 'money_in':
      return Boolean(perms.money || perms.sales);
    case 'money_out':
      return Boolean(perms.money || perms.purchases);
    case 'manual_journal':
    case 'depreciation_run':
    case 'fx_revaluation':
      return Boolean(perms.accounting);
  }
}

export const USER_ROLE_META: Record<
  UserRole,
  { label: string; short: string; description: string; bgVar: string; inkVar: string }
> = {
  OWNER: {
    label: 'Власник / Адміністратор',
    short: 'Власник',
    description: 'Повний доступ до всіх ФОП/ТОВ, фінансів, налаштувань і створення користувачів',
    bgVar: 'var(--primary-soft)',
    inkVar: 'var(--primary-ink)',
  },
  ACCOUNTANT: {
    label: 'Головний бухгалтер',
    short: 'Бухгалтер',
    description: 'Бухгалтерія №291, ПДВ, зарплата, ОЗ, валюта, ОСВ, SAF-T UA та звітність ДПС',
    bgVar: 'var(--violet-soft)',
    inkVar: 'var(--violet-ink)',
  },
  SALES_MANAGER: {
    label: 'Менеджер з продажу',
    short: 'Продажі',
    description: 'CRM-воронка, замовлення покупців, продажі, рахунки, клієнти та ПРРО',
    bgVar: 'var(--info-soft)',
    inkVar: 'var(--info-ink)',
  },
  PURCHASE_MANAGER: {
    label: 'Менеджер із закупівель',
    short: 'Закупівлі',
    description: 'Постачальники, прибуткові накладні, замовлення постачальникам, витрати та склад',
    bgVar: 'var(--warn-soft)',
    inkVar: 'var(--warn-ink)',
  },
  STOREKEEPER: {
    label: 'Комірник',
    short: 'Комірник',
    description: 'Прихід товару, переміщення, інвентаризація, виробництво та складські залишки',
    bgVar: 'var(--pos-soft)',
    inkVar: 'var(--pos-ink)',
  },
  CUSTOM: {
    label: 'Індивідуальні права',
    short: 'Кастомні',
    description: 'Власний набір галочок доступу до потрібних розділів та дій',
    bgVar: 'var(--neutral-soft)',
    inkVar: 'var(--neutral-ink)',
  },
};

export type OrgEntityType = 'TOV' | 'FOP';
export type TaxSystemType =
  | 'GENERAL_VAT'
  | 'GENERAL_NO_VAT'
  | 'EP_GROUP_2'
  | 'EP_GROUP_3_5'
  | 'EP_GROUP_3_3_VAT';

export const TAX_SYSTEM_LABELS: Record<TaxSystemType, string> = {
  GENERAL_VAT: 'Загальна (ПДВ 20%)',
  GENERAL_NO_VAT: 'Загальна (без ПДВ)',
  EP_GROUP_2: 'ЄП 2 група (без ПДВ)',
  EP_GROUP_3_5: 'ЄП 3 група (5%, без ПДВ)',
  EP_GROUP_3_3_VAT: 'ЄП 3 група (3% + ПДВ 20%)',
};

const ACTIVE_ORG_STORAGE_KEY = 'oblikflow_active_org_id';
const ACTIVE_DEPT_STORAGE_KEY = 'oblikflow_active_dept_id';
const AUTH_TOKEN_STORAGE_KEY = 'oblikflow_auth_token';

let currentRole: UserRole = 'OWNER';
let currentUserName = 'Адміністратор';
let currentOrganizationId: string | null =
  typeof window !== 'undefined' ? window.localStorage.getItem(ACTIVE_ORG_STORAGE_KEY) : null;
let currentDepartmentId: string | null =
  typeof window !== 'undefined' ? window.localStorage.getItem(ACTIVE_DEPT_STORAGE_KEY) : null;
let currentAuthToken: string | null =
  typeof window !== 'undefined' ? window.localStorage.getItem(AUTH_TOKEN_STORAGE_KEY) : null;
let unauthorizedHandler: (() => void) | null = null;

export function setAuthToken(token: string | null): void {
  currentAuthToken = token;
  if (typeof window !== 'undefined') {
    if (token) {
      window.localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, token);
    } else {
      window.localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
    }
  }
}

export function getAuthToken(): string | null {
  return currentAuthToken;
}

export function setUnauthorizedHandler(fn: (() => void) | null): void {
  unauthorizedHandler = fn;
}

export function setActiveUserContext(role: UserRole, userName: string): void {
  currentRole = role;
  currentUserName = userName;
}

export function getActiveUserContext(): { role: UserRole; userName: string } {
  return { role: currentRole, userName: currentUserName };
}

export function setActiveOrganizationId(orgId: string | null): void {
  currentOrganizationId = orgId;
  if (typeof window !== 'undefined') {
    if (orgId) {
      window.localStorage.setItem(ACTIVE_ORG_STORAGE_KEY, orgId);
    } else {
      window.localStorage.removeItem(ACTIVE_ORG_STORAGE_KEY);
    }
  }
}

export function getActiveOrganizationId(): string | null {
  return currentOrganizationId;
}

export function setActiveDepartmentId(deptId: string | null): void {
  currentDepartmentId = deptId;
  if (typeof window !== 'undefined') {
    if (deptId) {
      window.localStorage.setItem(ACTIVE_DEPT_STORAGE_KEY, deptId);
    } else {
      window.localStorage.removeItem(ACTIVE_DEPT_STORAGE_KEY);
    }
  }
}

export function getActiveDepartmentId(): string | null {
  return currentDepartmentId;
}

export const DOC_TYPE_META: Record<
  DocumentType,
  { label: string; short: string; color: string }
> = {
  customer_order: {
    label: 'Замовлення покупця (Резерв)',
    short: 'Замовлення',
    color: 'bg-cyan-50 text-cyan-700 border-cyan-200',
  },
  goods_receipt: {
    label: 'Прибуткова накладна',
    short: 'Прихід',
    color: 'bg-blue-50 text-blue-700 border-blue-200',
  },
  sales_invoice: {
    label: 'Видаткова накладна',
    short: 'Продаж',
    color: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  },
  tax_invoice: {
    label: 'Податкова накладна (ПДВ / ЄРПН)',
    short: 'ПН (ПДВ)',
    color: 'bg-sky-50 text-sky-700 border-sky-200',
  },
  production_order: {
    label: 'Виробництво / Комплектація (BOM)',
    short: 'Виробництво',
    color: 'bg-lime-50 text-lime-800 border-lime-300',
  },
  payroll_sheet: {
    label: 'Нарахування зарплати (Відомість)',
    short: 'Зарплата',
    color: 'bg-rose-50 text-rose-700 border-rose-200',
  },
  depreciation_run: {
    label: 'Амортизація ОЗ (10/13)',
    short: 'Амортизація',
    color: 'bg-stone-100 text-stone-700 border-stone-300',
  },
  fx_revaluation: {
    label: 'Курсові різниці (Переоцінка НБУ)',
    short: 'Курсові різн.',
    color: 'bg-emerald-50 text-emerald-800 border-emerald-300',
  },
  stock_transfer: {
    label: 'Переміщення товарів',
    short: 'Переміщення',
    color: 'bg-violet-50 text-violet-700 border-violet-200',
  },
  inventory_count: {
    label: 'Інвентаризація складу',
    short: 'Інвентаризація',
    color: 'bg-orange-50 text-orange-700 border-orange-200',
  },
  money_in: {
    label: 'Надходження коштів',
    short: 'Оплата (+)',
    color: 'bg-teal-50 text-teal-700 border-teal-200',
  },
  money_out: {
    label: 'Списання коштів',
    short: 'Виплата (-)',
    color: 'bg-amber-50 text-amber-700 border-amber-200',
  },
  price_setting: {
    label: 'Встановлення цін',
    short: 'Прайс',
    color: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  },
  manual_journal: {
    label: 'Бухгалтерська операція (Дт/Кт)',
    short: 'Операція Дт/Кт',
    color: 'bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200',
  },
  opening_balance: {
    label: 'Ввід початкових залишків',
    short: 'Поч. залишки',
    color: 'bg-slate-100 text-slate-700 border-slate-300',
  },
};

export interface OrganizationDto {
  id: string;
  name: string;
  entityType: OrgEntityType;
  taxSystem: TaxSystemType;
  edrpou: string;
  ipn?: string;
  iban?: string;
  bankName?: string;
  address?: string;
  directorName?: string;
  isVatPayer: boolean;
  vatRate: number;
  baseCurrency: string;
  costingMethod: string;
  allowNegativeStock: boolean;
  lockDate: string | null;
}

export interface BootstrapData {
  currentUser?: AuthUserDto | null;
  organization: OrganizationDto;
  organizations: OrganizationDto[];
  basSettings?: BasSettingsDto;
  departments: DepartmentDto[];
  allDepartments: DepartmentDto[];
  activeDepartmentId: string | null;
  canSeeAllDepartments: boolean;
  warehouses: Array<{
    id: string;
    organizationId?: string;
    departmentId?: string | null;
    code: string;
    name: string;
    type: string;
    isActive: boolean;
  }>;
  allWarehouses: Array<{
    id: string;
    organizationId: string;
    code: string;
    name: string;
    type: string;
    isActive: boolean;
  }>;
  categories: Array<{ id: string; name: string }>;
  items: Array<{
    id: string;
    sku: string;
    barcode: string;
    name: string;
    categoryId: string | null;
    unit: string;
    itemType: 'GOODS' | 'SERVICE';
    isOrderOnly?: boolean;
    isActive: boolean;
  }>;
  counterparties: Array<{
    id: string;
    name: string;
    edrpou: string;
    ipn?: string;
    iban?: string;
    phone: string;
    email: string;
    isCustomer: boolean;
    isSupplier: boolean;
  }>;
  contracts: Array<{
    id: string;
    counterpartyId: string;
    name: string;
    currency: string;
    contractType: string;
  }>;
  cashAccounts: Array<{
    id: string;
    organizationId?: string;
    name: string;
    accountType: 'BANK' | 'CASH';
    iban: string;
    currency: string;
  }>;
  allCashAccounts: Array<{
    id: string;
    organizationId: string;
    name: string;
    accountType: 'BANK' | 'CASH';
    iban: string;
    currency: string;
  }>;
  cashflowCategories: Array<{
    id: string;
    name: string;
    direction: string;
    isOperatingExpense: boolean;
  }>;
  priceTypes: Array<{ id: string; code: string; name: string; currency: string }>;
  chartOfAccounts: Array<{
    id: string;
    code: string;
    name: string;
    accountType: 'ACTIVE' | 'PASSIVE' | 'ACTIVE_PASSIVE';
    classNo: number;
    subkonto1Type: string;
    subkonto2Type: string;
    isQuantitative: boolean;
  }>;
  employees: Array<{
    id: string;
    departmentId?: string | null;
    departmentName?: string;
    fullName: string;
    rnokpp: string;
    position: string;
    department: 'ADMIN' | 'SALES' | 'PRODUCTION';
    baseSalary: string;
    isActive: boolean;
  }>;
  bomSpecs: Array<{
    id: string;
    code: string;
    name: string;
    outputItemId: string;
    outputQty: string;
    lines: Array<{ id: string; lineNo: number; componentItemId: string; qty: string }>;
  }>;
  users: Array<{
    id: string;
    fullName: string;
    email: string;
    role: UserRole;
  }>;
}

export interface DocumentSummary {
  id: string;
  organizationId?: string;
  organizationName?: string;
  organizationEntityType?: OrgEntityType;
  departmentId?: string | null;
  departmentName?: string;
  docType: DocumentType;
  docNumber: string;
  docDate: string;
  status: 'DRAFT' | 'POSTED' | 'CANCELLED';
  parentDocId: string | null;
  parentDocNumber?: string;
  bomSpecId?: string | null;
  warehouseId: string | null;
  targetWarehouseId: string | null;
  counterpartyId: string | null;
  contractId: string | null;
  cashAccountId: string | null;
  cashflowCategoryId: string | null;
  priceTypeId: string | null;
  vatRate?: number;
  discountTotal?: string;
  totalAmount: string;
  vatAmount?: string;
  fiscalReceiptId?: string;
  fiscalCode?: string;
  fiscalUrl?: string;
  comment: string;
  metaJson?: string;
  meta?: DocumentMetaDto;
  warehouseName?: string;
  targetWarehouseName?: string;
  counterpartyName?: string;
  cashAccountName?: string;
  priceTypeName?: string;
  cashflowCategoryName?: string;
}

export interface DocumentLineDto {
  id?: string;
  lineNo?: number;
  lineRole?: string;
  itemId: string | null;
  employeeId?: string | null;
  bookQty?: string | number;
  qty: string | number;
  diffQty?: string | number;
  price: string | number;
  discountPercent?: string | number;
  discountAmount?: string | number;
  amount: string | number;
  costAmount?: string;
  taxAmount?: string;
  debitAccountCode?: string;
  creditAccountCode?: string;
  warehouseId?: string | null;
  counterpartyId?: string | null;
  cashAccountId?: string | null;
  notes?: string;
}

export interface PrintTemplateDto {
  id: string;
  organizationId: string;
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
  isSystem: boolean;
  updatedAt?: string;
}

export interface ParsedImportItem {
  sku: string;
  name: string;
  categoryName: string;
  unit: string;
  price: number;
  barcode: string;
  itemType: 'GOODS' | 'SERVICE';
  rawSource?: string;
}

export interface UniversalParseResult {
  format: 'EXCEL' | 'CSV' | 'XML' | 'PDF';
  filename: string;
  totalDetected: number;
  warnings: string[];
  items: ParsedImportItem[];
}

export interface UniversalCommitResult {
  created: number;
  updated: number;
  categoriesCreated: number;
  pricesApplied: number;
  priceDocNumber: string | null;
}

export interface ParsedImportCounterparty {
  name: string;
  edrpou: string;
  ipn: string;
  iban: string;
  phone: string;
  email: string;
  isCustomer: boolean;
  isSupplier: boolean;
}

export interface UniversalCounterpartiesParseResult {
  format: 'EXCEL' | 'CSV' | 'XML' | 'PDF';
  filename: string;
  totalDetected: number;
  warnings: string[];
  counterparties: ParsedImportCounterparty[];
}

export interface UniversalCounterpartiesCommitResult {
  created: number;
  updated: number;
  contractsCreated: number;
}

export interface DocumentMetaDto {
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

export const ORDER_STATUS_META: Record<
  NonNullable<DocumentMetaDto['orderStatus']>,
  { label: string; bgVar: string; inkVar: string }
> = {
  NEW: { label: 'Нове', bgVar: 'var(--info-soft)', inkVar: 'var(--info-ink)' },
  IN_PROGRESS: { label: 'В роботі', bgVar: 'var(--primary-soft)', inkVar: 'var(--primary-ink)' },
  AWAITING_PAYMENT: { label: 'Очікує оплати', bgVar: 'var(--warn-soft)', inkVar: 'var(--warn-ink)' },
  READY_TO_SHIP: { label: 'До відвантаження', bgVar: 'var(--violet-soft)', inkVar: 'var(--violet-ink)' },
  COMPLETED: { label: 'Виконано', bgVar: 'var(--pos-soft)', inkVar: 'var(--pos-ink)' },
  CANCELLED: { label: 'Скасовано', bgVar: 'var(--neg-soft)', inkVar: 'var(--neg-ink)' },
};

export interface BasFeaturesConfig {
  alwaysOpenDocsInModal: boolean;
  useDepartments: boolean;
  useProjects: boolean;
  useCustomDocFields: boolean;
  allowOrderWithoutStock: boolean;
  useDiscounts: boolean;
  useOrderStatuses: boolean;
  useContracts: boolean;
  useDeliveryAndTtn: boolean;
  usePrroCheckbox: boolean;
  allowNegativeStockGlobal: boolean;
  useWarehouseReserves: boolean;
  useBarcodes: boolean;
  useCrm: boolean;
  useWorks: boolean;
  useProductionBom: boolean;
  useMultiCurrency: boolean;
  usePayroll: boolean;
  useVatAccounting: boolean;
}

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

export interface MenuCustomizationConfig {
  sections: Record<string, { visible?: boolean; label?: string; order?: number }>;
  items: Record<string, { visible?: boolean; label?: string; pinned?: boolean }>;
}

export interface BasSettingsDto {
  organizationId: string;
  features: BasFeaturesConfig;
  docFields: Record<DocumentType, DocTypeFieldSettings>;
  menuConfig: MenuCustomizationConfig;
  updatedAt: string;
}

export interface DocumentFull extends DocumentSummary {
  lines: DocumentLineDto[];
}

export async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...(currentAuthToken ? { Authorization: `Bearer ${currentAuthToken}` } : {}),
      'x-user-role': currentRole,
      'x-user-name': encodeURIComponent(currentUserName),
      ...(currentOrganizationId ? { 'x-organization-id': currentOrganizationId } : {}),
      ...(currentDepartmentId ? { 'x-department-id': currentDepartmentId } : {}),
      ...(init?.headers ?? {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && url !== '/api/auth/login') {
    setAuthToken(null);
    unauthorizedHandler?.();
  }
  if (!res.ok) {
    throw new Error(data.message || data.error || `HTTP ${res.status}`);
  }
  return data as T;
}

export function fmtMoney(value: string | number | null | undefined, currency = '₴'): string {
  const num = Number(value ?? 0);
  const formatted = new Intl.NumberFormat('uk-UA', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
  return currency ? `${formatted} ${currency}` : formatted;
}

export function fmtQty(value: string | number | null | undefined): string {
  const num = Number(value ?? 0);
  return new Intl.NumberFormat('uk-UA', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(num);
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('uk-UA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

export function downloadCsv(filename: string, headers: string[], rows: (string | number)[][]): void {
  const escape = (v: string | number) => {
    const s = String(v ?? '');
    return s.includes(';') || s.includes('"') || s.includes('\n')
      ? `"${s.replace(/"/g, '""')}"`
      : s;
  };
  const csv = [headers.map(escape).join(';'), ...rows.map((r) => r.map(escape).join(';'))].join(
    '\n'
  );
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadTextFile(filename: string, content: string, mime = 'application/xml'): void {
  const blob = new Blob([content], { type: `${mime};charset=utf-8;` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
