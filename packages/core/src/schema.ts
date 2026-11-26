import {
  pgTable,
  uuid,
  text,
  boolean,
  timestamp,
  numeric,
  integer,
  primaryKey,
  index,
} from 'drizzle-orm/pg-core';

// ============================================================================
// 1. ДОВІДНИКИ (CATALOGS), ПЛАН РАХУНКІВ №291, КАДРИ, СПЕЦИФІКАЦІЇ BOM, КОРИСТУВАЧІ
// ============================================================================

export type OrgEntityType = 'TOV' | 'FOP';
export type TaxSystemType =
  | 'GENERAL_VAT'
  | 'GENERAL_NO_VAT'
  | 'EP_GROUP_2'
  | 'EP_GROUP_3_5'
  | 'EP_GROUP_3_3_VAT';

export const organizations = pgTable('organizations', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  entityType: text('entity_type').$type<OrgEntityType>().notNull().default('TOV'),
  taxSystem: text('tax_system').$type<TaxSystemType>().notNull().default('GENERAL_VAT'),
  edrpou: text('edrpou').notNull().default(''),
  ipn: text('ipn').notNull().default(''),
  iban: text('iban').notNull().default(''),
  bankName: text('bank_name').notNull().default(''),
  address: text('address').notNull().default(''),
  directorName: text('director_name').notNull().default(''),
  isVatPayer: boolean('is_vat_payer').notNull().default(true),
  vatRate: integer('vat_rate').notNull().default(20),
  baseCurrency: text('base_currency').notNull().default('UAH'),
  costingMethod: text('costing_method').notNull().default('FIFO'), // FIFO | AVG
  allowNegativeStock: boolean('allow_negative_stock').notNull().default(false),
  lockDate: timestamp('lock_date', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const departments = pgTable(
  'departments',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    code: text('code').notNull().default('MAIN'),
    name: text('name').notNull(),
    description: text('description').notNull().default(''),
    headName: text('head_name').notNull().default(''),
    address: text('address').notNull().default(''),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('idx_departments_org').on(table.organizationId)]
);

export const warehouses = pgTable('warehouses', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  departmentId: uuid('department_id').references(() => departments.id, { onDelete: 'set null' }),
  code: text('code').notNull(),
  name: text('name').notNull(),
  type: text('type').notNull().default('WHOLESALE'), // WHOLESALE | RETAIL
  externalId: text('external_id').notNull().default(''),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const categories = pgTable('categories', {
  id: uuid('id').defaultRandom().primaryKey(),
  parentId: uuid('parent_id'),
  name: text('name').notNull(),
});

export const items = pgTable(
  'items',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    sku: text('sku').notNull(),
    barcode: text('barcode').notNull().default(''),
    name: text('name').notNull(),
    categoryId: uuid('category_id').references(() => categories.id, { onDelete: 'set null' }),
    unit: text('unit').notNull().default('шт'),
    itemType: text('item_type').notNull().default('GOODS'), // GOODS | SERVICE
    externalId: text('external_id').notNull().default(''),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('idx_items_sku').on(table.sku)]
);

export const counterparties = pgTable('counterparties', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  edrpou: text('edrpou').notNull().default(''),
  ipn: text('ipn').notNull().default(''),
  iban: text('iban').notNull().default(''),
  phone: text('phone').notNull().default(''),
  email: text('email').notNull().default(''),
  isCustomer: boolean('is_customer').notNull().default(true),
  isSupplier: boolean('is_supplier').notNull().default(false),
  externalId: text('external_id').notNull().default(''),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const contracts = pgTable('contracts', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  counterpartyId: uuid('counterparty_id')
    .notNull()
    .references(() => counterparties.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  currency: text('currency').notNull().default('UAH'),
  contractType: text('contract_type').notNull().default('CUSTOMER'), // CUSTOMER | SUPPLIER
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const cashAccounts = pgTable('cash_accounts', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  departmentId: uuid('department_id').references(() => departments.id, { onDelete: 'set null' }),
  name: text('name').notNull(),
  accountType: text('account_type').notNull().default('BANK'), // BANK | CASH
  iban: text('iban').notNull().default(''),
  currency: text('currency').notNull().default('UAH'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const cashflowCategories = pgTable('cashflow_categories', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  direction: text('direction').notNull().default('OUT'), // IN | OUT
  isOperatingExpense: boolean('is_operating_expense').notNull().default(false),
});

export const priceTypes = pgTable('price_types', {
  id: uuid('id').defaultRandom().primaryKey(),
  code: text('code').notNull(),
  name: text('name').notNull(),
  currency: text('currency').notNull().default('UAH'),
});

// 1.1. Співробітники (Кадри та Зарплата)
export type EmployeeDepartment = 'ADMIN' | 'SALES' | 'PRODUCTION';

export const employees = pgTable('employees', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  departmentId: uuid('department_id').references(() => departments.id, { onDelete: 'set null' }),
  fullName: text('full_name').notNull(),
  rnokpp: text('rnokpp').notNull().default(''), // ІПН співробітника
  position: text('position').notNull().default(''),
  department: text('department').$type<EmployeeDepartment>().notNull().default('ADMIN'),
  baseSalary: numeric('base_salary', { precision: 18, scale: 2 }).notNull().default('25000.00'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// 1.2. Специфікації (BOM — Виробництво та Комплектація)
export const bomSpecs = pgTable('bom_specs', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  code: text('code').notNull(),
  name: text('name').notNull(),
  outputItemId: uuid('output_item_id')
    .notNull()
    .references(() => items.id, { onDelete: 'cascade' }),
  outputQty: numeric('output_qty', { precision: 18, scale: 4 }).notNull().default('1.0000'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const bomSpecLines = pgTable('bom_spec_lines', {
  id: uuid('id').defaultRandom().primaryKey(),
  bomSpecId: uuid('bom_spec_id')
    .notNull()
    .references(() => bomSpecs.id, { onDelete: 'cascade' }),
  lineNo: integer('line_no').notNull().default(1),
  componentItemId: uuid('component_item_id')
    .notNull()
    .references(() => items.id, { onDelete: 'cascade' }),
  qty: numeric('qty', { precision: 18, scale: 4 }).notNull().default('1.0000'),
});

// 1.3. Користувачі, Групи доступу та Ролі (RBAC) + Сесії авторизації + Журнал аудиту
export type UserRole =
  | 'OWNER'
  | 'ACCOUNTANT'
  | 'SALES_MANAGER'
  | 'PURCHASE_MANAGER'
  | 'STOREKEEPER'
  | 'CUSTOM';

export const accessGroups = pgTable('access_groups', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  baseRole: text('base_role').$type<UserRole>().notNull().default('CUSTOM'),
  permissionsJson: text('permissions_json').notNull().default('{}'),
  isSystem: boolean('is_system').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const appUsers = pgTable(
  'app_users',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    departmentId: uuid('department_id').references(() => departments.id, { onDelete: 'set null' }),
    accessGroupId: uuid('access_group_id').references(() => accessGroups.id, {
      onDelete: 'set null',
    }),
    fullName: text('full_name').notNull(),
    login: text('login').notNull().default(''),
    email: text('email').notNull(),
    passwordHash: text('password_hash').notNull().default(''),
    role: text('role').$type<UserRole>().notNull().default('OWNER'),
    allowedOrgIdsJson: text('allowed_org_ids_json').notNull().default('[]'),
    allowedDepartmentIdsJson: text('allowed_department_ids_json').notNull().default('[]'),
    permissionsJson: text('permissions_json').notNull().default('{}'),
    isActive: boolean('is_active').notNull().default(true),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('idx_app_users_login').on(table.login)]
);

export const authSessions = pgTable(
  'auth_sessions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => appUsers.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('idx_auth_sessions_token_hash').on(table.tokenHash)]
);

export const auditLogs = pgTable('audit_logs', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().default(''),
  userName: text('user_name').notNull().default('Система'),
  userRole: text('user_role').notNull().default('OWNER'),
  action: text('action').notNull(),
  entityType: text('entity_type').notNull(),
  entityId: text('entity_id').notNull().default(''),
  summary: text('summary').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export type AccountType = 'ACTIVE' | 'PASSIVE' | 'ACTIVE_PASSIVE';
export type SubkontoType =
  | ''
  | 'ITEM'
  | 'COUNTERPARTY'
  | 'WAREHOUSE'
  | 'CASH_ACCOUNT'
  | 'CASHFLOW_CATEGORY'
  | 'EMPLOYEE';

export const chartOfAccounts = pgTable(
  'chart_of_accounts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    code: text('code').notNull(),
    name: text('name').notNull(),
    accountType: text('account_type').$type<AccountType>().notNull().default('ACTIVE'),
    classNo: integer('class_no').notNull().default(2),
    subkonto1Type: text('subkonto1_type').$type<SubkontoType>().notNull().default(''),
    subkonto2Type: text('subkonto2_type').$type<SubkontoType>().notNull().default(''),
    isQuantitative: boolean('is_quantitative').notNull().default(false),
    isSystem: boolean('is_system').notNull().default(true),
  },
  (table) => [index('idx_coa_code').on(table.code)]
);

// ============================================================================
// 2. ДОКУМЕНТИ (DOCUMENTS)
// ============================================================================

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

export type DocumentStatus = 'DRAFT' | 'POSTED' | 'CANCELLED';

export const documents = pgTable(
  'documents',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    departmentId: uuid('department_id').references(() => departments.id, { onDelete: 'set null' }),
    docType: text('doc_type').$type<DocumentType>().notNull(),
    docNumber: text('doc_number').notNull(),
    docDate: timestamp('doc_date', { withTimezone: true }).notNull(),
    status: text('status').$type<DocumentStatus>().notNull().default('DRAFT'),
    parentDocId: uuid('parent_doc_id'),
    bomSpecId: uuid('bom_spec_id'),
    warehouseId: uuid('warehouse_id').references(() => warehouses.id, { onDelete: 'set null' }),
    targetWarehouseId: uuid('target_warehouse_id').references(() => warehouses.id, {
      onDelete: 'set null',
    }),
    counterpartyId: uuid('counterparty_id').references(() => counterparties.id, {
      onDelete: 'set null',
    }),
    contractId: uuid('contract_id').references(() => contracts.id, { onDelete: 'set null' }),
    cashAccountId: uuid('cash_account_id').references(() => cashAccounts.id, {
      onDelete: 'set null',
    }),
    cashflowCategoryId: uuid('cashflow_category_id').references(() => cashflowCategories.id, {
      onDelete: 'set null',
    }),
    priceTypeId: uuid('price_type_id').references(() => priceTypes.id, { onDelete: 'set null' }),
    vatRate: integer('vat_rate').notNull().default(20),
    currency: text('currency').notNull().default('UAH'),
    exchangeRate: numeric('exchange_rate', { precision: 18, scale: 6 }).notNull().default('1.000000'),
    discountTotal: numeric('discount_total', { precision: 18, scale: 2 }).notNull().default('0.00'),
    totalAmount: numeric('total_amount', { precision: 18, scale: 2 }).notNull().default('0.00'),
    vatAmount: numeric('vat_amount', { precision: 18, scale: 2 }).notNull().default('0.00'),
    fiscalReceiptId: text('fiscal_receipt_id').notNull().default(''),
    fiscalCode: text('fiscal_code').notNull().default(''),
    fiscalUrl: text('fiscal_url').notNull().default(''),
    externalId: text('external_id').notNull().default(''),
    shareToken: text('share_token').notNull().default(''),
    comment: text('comment').notNull().default(''),
    postedAt: timestamp('posted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_documents_org_date').on(table.organizationId, table.docDate),
    index('idx_documents_type_status').on(table.docType, table.status),
    index('idx_documents_share_token').on(table.shareToken),
  ]
);

export const documentLines = pgTable(
  'document_lines',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    documentId: uuid('document_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),
    lineNo: integer('line_no').notNull().default(1),
    lineRole: text('line_role').notNull().default('ITEM'), // ITEM | COMPONENT | OUTPUT | EMPLOYEE
    itemId: uuid('item_id').references(() => items.id, { onDelete: 'set null' }),
    employeeId: uuid('employee_id').references(() => employees.id, { onDelete: 'set null' }),
    bookQty: numeric('book_qty', { precision: 18, scale: 4 }).notNull().default('0.0000'),
    qty: numeric('qty', { precision: 18, scale: 4 }).notNull().default('0.0000'),
    diffQty: numeric('diff_qty', { precision: 18, scale: 4 }).notNull().default('0.0000'),
    price: numeric('price', { precision: 18, scale: 2 }).notNull().default('0.00'),
    discountPercent: numeric('discount_percent', { precision: 6, scale: 2 }).notNull().default('0.00'),
    discountAmount: numeric('discount_amount', { precision: 18, scale: 2 }).notNull().default('0.00'),
    amount: numeric('amount', { precision: 18, scale: 2 }).notNull().default('0.00'),
    costAmount: numeric('cost_amount', { precision: 18, scale: 2 }).notNull().default('0.00'),
    taxAmount: numeric('tax_amount', { precision: 18, scale: 2 }).notNull().default('0.00'),
    debitAccountCode: text('debit_account_code').notNull().default(''),
    creditAccountCode: text('credit_account_code').notNull().default(''),
    warehouseId: uuid('warehouse_id').references(() => warehouses.id, { onDelete: 'set null' }),
    counterpartyId: uuid('counterparty_id').references(() => counterparties.id, {
      onDelete: 'set null',
    }),
    contractId: uuid('contract_id').references(() => contracts.id, { onDelete: 'set null' }),
    cashAccountId: uuid('cash_account_id').references(() => cashAccounts.id, {
      onDelete: 'set null',
    }),
    notes: text('notes').notNull().default(''),
  },
  (table) => [index('idx_doc_lines_doc').on(table.documentId)]
);

// ============================================================================
// 3. РЕГІСТРИ НАКОПИЧЕННЯ, ВІДОМОСТЕЙ ТА БУХГАЛТЕРІЇ (Дт/Кт)
// ============================================================================

export const regStockMovements = pgTable(
  'reg_stock_movements',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id').notNull(),
    recorderId: uuid('recorder_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),
    recorderType: text('recorder_type').notNull(),
    period: timestamp('period', { withTimezone: true }).notNull(),
    movementType: text('movement_type').notNull(), // IN | OUT
    warehouseId: uuid('warehouse_id').notNull(),
    itemId: uuid('item_id').notNull(),
    qty: numeric('qty', { precision: 18, scale: 4 }).notNull(),
  },
  (table) => [
    index('idx_stock_mov_recorder').on(table.recorderId),
    index('idx_stock_mov_dim_period').on(
      table.organizationId,
      table.warehouseId,
      table.itemId,
      table.period
    ),
  ]
);

export const regStockTotalsMonthly = pgTable(
  'reg_stock_totals_monthly',
  {
    organizationId: uuid('organization_id').notNull(),
    monthStart: timestamp('month_start', { withTimezone: true }).notNull(),
    warehouseId: uuid('warehouse_id').notNull(),
    itemId: uuid('item_id').notNull(),
    qtyDelta: numeric('qty_delta', { precision: 18, scale: 4 }).notNull().default('0.0000'),
  },
  (table) => [
    primaryKey({
      columns: [table.organizationId, table.monthStart, table.warehouseId, table.itemId],
    }),
  ]
);

export const regStockReservations = pgTable(
  'reg_stock_reservations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id').notNull(),
    recorderId: uuid('recorder_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),
    recorderType: text('recorder_type').notNull(),
    period: timestamp('period', { withTimezone: true }).notNull(),
    movementType: text('movement_type').notNull(), // RESERVE | RELEASE
    orderDocId: uuid('order_doc_id').notNull(),
    warehouseId: uuid('warehouse_id').notNull(),
    itemId: uuid('item_id').notNull(),
    qty: numeric('qty', { precision: 18, scale: 4 }).notNull(),
  },
  (table) => [
    index('idx_stock_res_recorder').on(table.recorderId),
    index('idx_stock_res_order').on(table.orderDocId),
    index('idx_stock_res_dim').on(
      table.organizationId,
      table.warehouseId,
      table.itemId,
      table.period
    ),
  ]
);

export const regCostBatches = pgTable(
  'reg_cost_batches',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id').notNull(),
    recorderId: uuid('recorder_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),
    period: timestamp('period', { withTimezone: true }).notNull(),
    movementType: text('movement_type').notNull(), // IN | OUT
    warehouseId: uuid('warehouse_id').notNull(),
    itemId: uuid('item_id').notNull(),
    batchDocId: uuid('batch_doc_id').notNull(),
    batchDate: timestamp('batch_date', { withTimezone: true }).notNull(),
    qty: numeric('qty', { precision: 18, scale: 4 }).notNull(),
    costAmount: numeric('cost_amount', { precision: 18, scale: 2 }).notNull(),
  },
  (table) => [
    index('idx_batches_recorder').on(table.recorderId),
    index('idx_batches_fifo').on(
      table.organizationId,
      table.warehouseId,
      table.itemId,
      table.batchDate,
      table.batchDocId
    ),
  ]
);

export const regSettlements = pgTable(
  'reg_settlements',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id').notNull(),
    recorderId: uuid('recorder_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),
    recorderType: text('recorder_type').notNull(),
    period: timestamp('period', { withTimezone: true }).notNull(),
    counterpartyId: uuid('counterparty_id').notNull(),
    contractId: uuid('contract_id'),
    amount: numeric('amount', { precision: 18, scale: 2 }).notNull(),
  },
  (table) => [
    index('idx_settlements_recorder').on(table.recorderId),
    index('idx_settlements_cp_period').on(table.organizationId, table.counterpartyId, table.period),
  ]
);

export const regCashMovements = pgTable(
  'reg_cash_movements',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id').notNull(),
    recorderId: uuid('recorder_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),
    recorderType: text('recorder_type').notNull(),
    period: timestamp('period', { withTimezone: true }).notNull(),
    cashAccountId: uuid('cash_account_id').notNull(),
    cashflowCategoryId: uuid('cashflow_category_id'),
    currency: text('currency').notNull().default('UAH'),
    foreignAmount: numeric('foreign_amount', { precision: 18, scale: 2 }).notNull().default('0.00'),
    exchangeRate: numeric('exchange_rate', { precision: 18, scale: 6 }).notNull().default('1.000000'),
    amount: numeric('amount', { precision: 18, scale: 2 }).notNull(),
  },
  (table) => [
    index('idx_cash_recorder').on(table.recorderId),
    index('idx_cash_acc_period').on(table.organizationId, table.cashAccountId, table.period),
  ]
);

export const regPnlTurnover = pgTable(
  'reg_pnl_turnover',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id').notNull(),
    recorderId: uuid('recorder_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),
    recorderType: text('recorder_type').notNull(),
    period: timestamp('period', { withTimezone: true }).notNull(),
    pnlType: text('pnl_type').notNull(), // SALE | EXPENSE | OTHER_INCOME
    warehouseId: uuid('warehouse_id'),
    itemId: uuid('item_id'),
    counterpartyId: uuid('counterparty_id'),
    cashflowCategoryId: uuid('cashflow_category_id'),
    qty: numeric('qty', { precision: 18, scale: 4 }).notNull().default('0.0000'),
    revenue: numeric('revenue', { precision: 18, scale: 2 }).notNull().default('0.00'),
    cogs: numeric('cogs', { precision: 18, scale: 2 }).notNull().default('0.00'),
    expense: numeric('expense', { precision: 18, scale: 2 }).notNull().default('0.00'),
    profit: numeric('profit', { precision: 18, scale: 2 }).notNull().default('0.00'),
  },
  (table) => [
    index('idx_pnl_recorder').on(table.recorderId),
    index('idx_pnl_org_period').on(table.organizationId, table.period),
  ]
);

export const regItemPrices = pgTable(
  'reg_item_prices',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    recorderId: uuid('recorder_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),
    effectiveAt: timestamp('effective_at', { withTimezone: true }).notNull(),
    itemId: uuid('item_id').notNull(),
    priceTypeId: uuid('price_type_id').notNull(),
    price: numeric('price', { precision: 18, scale: 2 }).notNull(),
  },
  (table) => [
    index('idx_prices_recorder').on(table.recorderId),
    index('idx_prices_slice').on(table.itemId, table.priceTypeId, table.effectiveAt),
  ]
);

export const regAccountingEntries = pgTable(
  'reg_accounting_entries',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id').notNull(),
    recorderId: uuid('recorder_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),
    recorderType: text('recorder_type').notNull(),
    period: timestamp('period', { withTimezone: true }).notNull(),
    lineNo: integer('line_no').notNull().default(1),
    debitAccountCode: text('debit_account_code').notNull(),
    creditAccountCode: text('credit_account_code').notNull(),
    debitSubkonto1Type: text('debit_subkonto1_type').notNull().default(''),
    debitSubkonto1Id: text('debit_subkonto1_id').notNull().default(''),
    debitSubkonto1Label: text('debit_subkonto1_label').notNull().default(''),
    debitSubkonto2Type: text('debit_subkonto2_type').notNull().default(''),
    debitSubkonto2Id: text('debit_subkonto2_id').notNull().default(''),
    debitSubkonto2Label: text('debit_subkonto2_label').notNull().default(''),
    creditSubkonto1Type: text('credit_subkonto1_type').notNull().default(''),
    creditSubkonto1Id: text('credit_subkonto1_id').notNull().default(''),
    creditSubkonto1Label: text('credit_subkonto1_label').notNull().default(''),
    creditSubkonto2Type: text('credit_subkonto2_type').notNull().default(''),
    creditSubkonto2Id: text('credit_subkonto2_id').notNull().default(''),
    creditSubkonto2Label: text('credit_subkonto2_label').notNull().default(''),
    qty: numeric('qty', { precision: 18, scale: 4 }).notNull().default('0.0000'),
    amount: numeric('amount', { precision: 18, scale: 2 }).notNull(),
    description: text('description').notNull().default(''),
  },
  (table) => [
    index('idx_acc_entries_recorder').on(table.recorderId),
    index('idx_acc_entries_period').on(table.organizationId, table.period),
    index('idx_acc_entries_dt').on(table.organizationId, table.debitAccountCode, table.period),
    index('idx_acc_entries_kt').on(table.organizationId, table.creditAccountCode, table.period),
  ]
);

// ============================================================================
// 4. ІНТЕГРАЦІЇ (BAS OData, Monobank, Приват24, Checkbox ПРРО)
// ============================================================================

export type IntegrationProvider = 'BAS_ODATA' | 'MONOBANK' | 'PRIVAT24' | 'CHECKBOX';

export const integrationConfigs = pgTable('integration_configs', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  provider: text('provider').$type<IntegrationProvider>().notNull(),
  isEnabled: boolean('is_enabled').notNull().default(true),
  mode: text('mode').notNull().default('DEMO'),
  configJson: text('config_json').notNull().default('{}'),
  lastSyncAt: timestamp('last_sync_at', { withTimezone: true }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const integrationSyncLogs = pgTable('integration_sync_logs', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  provider: text('provider').$type<IntegrationProvider>().notNull(),
  status: text('status').notNull().default('SUCCESS'),
  summary: text('summary').notNull(),
  detailsJson: text('details_json').notNull().default('{}'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// ============================================================================
// 5. CRM-ВОРОНКА, ОСНОВНІ ЗАСОБИ (10/13) ТА КУРСИ ВАЛЮТ НБУ
// ============================================================================

export type CrmLeadStage = 'NEW' | 'QUALIFIED' | 'PROPOSAL' | 'NEGOTIATION' | 'WON' | 'LOST';

export const crmLeads = pgTable('crm_leads', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  departmentId: uuid('department_id').references(() => departments.id, { onDelete: 'set null' }),
  title: text('title').notNull(),
  counterpartyId: uuid('counterparty_id').references(() => counterparties.id, {
    onDelete: 'set null',
  }),
  contactName: text('contact_name').notNull().default(''),
  phone: text('phone').notNull().default(''),
  email: text('email').notNull().default(''),
  source: text('source').notNull().default('SITE'), // SITE | PHONE | REFERRAL | TELEGRAM
  stage: text('stage').$type<CrmLeadStage>().notNull().default('NEW'),
  expectedAmount: numeric('expected_amount', { precision: 18, scale: 2 }).notNull().default('0.00'),
  assignedTo: text('assigned_to').notNull().default('Бондаренко Максим'),
  notes: text('notes').notNull().default(''),
  convertedOrderId: uuid('converted_order_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export type CrmActivityType = 'CALL' | 'TASK' | 'MEETING' | 'EMAIL';

export const crmActivities = pgTable('crm_activities', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  leadId: uuid('lead_id')
    .notNull()
    .references(() => crmLeads.id, { onDelete: 'cascade' }),
  activityType: text('activity_type').$type<CrmActivityType>().notNull().default('CALL'),
  subject: text('subject').notNull(),
  outcome: text('outcome').notNull().default(''),
  durationSec: integer('duration_sec').notNull().default(0),
  dueAt: timestamp('due_at', { withTimezone: true }),
  isDone: boolean('is_done').notNull().default(false),
  assignedTo: text('assigned_to').notNull().default('Бондаренко Максим'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const fixedAssets = pgTable('fixed_assets', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  inventoryNumber: text('inventory_number').notNull(),
  name: text('name').notNull(),
  accountCode: text('account_code').notNull().default('104'), // 104 | 106
  depreciationAccountCode: text('depreciation_account_code').notNull().default('131'),
  expenseAccountCode: text('expense_account_code').notNull().default('92'), // 92 | 93 | 231
  commissioningDate: timestamp('commissioning_date', { withTimezone: true }).notNull(),
  initialCost: numeric('initial_cost', { precision: 18, scale: 2 }).notNull(),
  residualValue: numeric('residual_value', { precision: 18, scale: 2 }).notNull().default('0.00'),
  usefulLifeMonths: integer('useful_life_months').notNull().default(60),
  accumulatedDepreciation: numeric('accumulated_depreciation', { precision: 18, scale: 2 })
    .notNull()
    .default('0.00'),
  status: text('status').notNull().default('ACTIVE'), // ACTIVE | DISPOSED
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const regCurrencyRates = pgTable(
  'reg_currency_rates',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    currencyCode: text('currency_code').notNull(), // USD | EUR
    rateDate: timestamp('rate_date', { withTimezone: true }).notNull(),
    rate: numeric('rate', { precision: 18, scale: 6 }).notNull(),
    source: text('source').notNull().default('NBU_API'), // NBU_API | MANUAL
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('idx_fx_rates_code_date').on(table.currencyCode, table.rateDate)]
);

// 6. ШАБЛОНИ ДРУКОВАНИХ ФОРМ (УКРАЇНСЬКІ БУХГАЛТЕРСЬКІ ВЗІРЦІ З МОЖЛИВІСТЮ РЕДАГУВАННЯ)
export const printTemplates = pgTable(
  'print_templates',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    templateKey: text('template_key').notNull(),
    docType: text('doc_type').notNull(),
    name: text('name').notNull(),
    standardCode: text('standard_code').notNull().default(''),
    titleText: text('title_text').notNull(),
    subtitleText: text('subtitle_text').notNull().default(''),
    headerNote: text('header_note').notNull().default(''),
    footerNote: text('footer_note').notNull().default(''),
    signLeftLabel: text('sign_left_label').notNull().default('Відпустив(ла)'),
    signRightLabel: text('sign_right_label').notNull().default('Отримав(ла)'),
    showDiscountColumn: boolean('show_discount_column').notNull().default(true),
    showVatBlock: boolean('show_vat_block').notNull().default(true),
    showIbanBlock: boolean('show_iban_block').notNull().default(true),
    showStampArea: boolean('show_stamp_area').notNull().default(true),
    showSkuColumn: boolean('show_sku_column').notNull().default(true),
    isSystem: boolean('is_system').notNull().default(true),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('idx_print_templates_org_key').on(table.organizationId, table.templateKey)]
);
