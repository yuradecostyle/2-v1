import { PGlite } from '@electric-sql/pglite';
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import { drizzle as drizzlePg, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema.js';

export type AppDb = NodePgDatabase<typeof schema>;

export interface DatabaseHandle {
  db: AppDb;
  driver: 'pglite' | 'postgres';
  close: () => Promise<void>;
  execRaw: (sqlText: string) => Promise<void>;
}

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  entity_type TEXT NOT NULL DEFAULT 'TOV',
  tax_system TEXT NOT NULL DEFAULT 'GENERAL_VAT',
  edrpou TEXT NOT NULL DEFAULT '',
  ipn TEXT NOT NULL DEFAULT '',
  iban TEXT NOT NULL DEFAULT '',
  bank_name TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  director_name TEXT NOT NULL DEFAULT '',
  is_vat_payer BOOLEAN NOT NULL DEFAULT TRUE,
  vat_rate INTEGER NOT NULL DEFAULT 20,
  base_currency TEXT NOT NULL DEFAULT 'UAH',
  costing_method TEXT NOT NULL DEFAULT 'FIFO',
  allow_negative_stock BOOLEAN NOT NULL DEFAULT FALSE,
  lock_date TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS entity_type TEXT NOT NULL DEFAULT 'TOV';
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS tax_system TEXT NOT NULL DEFAULT 'GENERAL_VAT';
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS ipn TEXT NOT NULL DEFAULT '';
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS iban TEXT NOT NULL DEFAULT '';
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS bank_name TEXT NOT NULL DEFAULT '';
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS address TEXT NOT NULL DEFAULT '';
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS director_name TEXT NOT NULL DEFAULT '';
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS is_vat_payer BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS vat_rate INTEGER NOT NULL DEFAULT 20;

CREATE TABLE IF NOT EXISTS departments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  code TEXT NOT NULL DEFAULT 'MAIN',
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  head_name TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_departments_org ON departments(organization_id);

CREATE TABLE IF NOT EXISTS warehouses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'WHOLESALE',
  external_id TEXT NOT NULL DEFAULT '',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE warehouses ADD COLUMN IF NOT EXISTS department_id UUID REFERENCES departments(id) ON DELETE SET NULL;
ALTER TABLE warehouses ADD COLUMN IF NOT EXISTS external_id TEXT NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id UUID,
  name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sku TEXT NOT NULL,
  barcode TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL,
  category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  unit TEXT NOT NULL DEFAULT 'шт',
  item_type TEXT NOT NULL DEFAULT 'GOODS',
  external_id TEXT NOT NULL DEFAULT '',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE items ADD COLUMN IF NOT EXISTS external_id TEXT NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS idx_items_sku ON items(sku);

CREATE TABLE IF NOT EXISTS counterparties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  edrpou TEXT NOT NULL DEFAULT '',
  iban TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  is_customer BOOLEAN NOT NULL DEFAULT TRUE,
  is_supplier BOOLEAN NOT NULL DEFAULT FALSE,
  external_id TEXT NOT NULL DEFAULT '',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE counterparties ADD COLUMN IF NOT EXISTS ipn TEXT NOT NULL DEFAULT '';
ALTER TABLE counterparties ADD COLUMN IF NOT EXISTS iban TEXT NOT NULL DEFAULT '';
ALTER TABLE counterparties ADD COLUMN IF NOT EXISTS external_id TEXT NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS employees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
  full_name TEXT NOT NULL,
  rnokpp TEXT NOT NULL DEFAULT '',
  position TEXT NOT NULL DEFAULT '',
  department TEXT NOT NULL DEFAULT 'ADMIN',
  base_salary NUMERIC(18, 2) NOT NULL DEFAULT 25000.00,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE employees ADD COLUMN IF NOT EXISTS department_id UUID REFERENCES departments(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS bom_specs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  output_item_id UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  output_qty NUMERIC(18, 4) NOT NULL DEFAULT 1.0000,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bom_spec_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bom_spec_id UUID NOT NULL REFERENCES bom_specs(id) ON DELETE CASCADE,
  line_no INTEGER NOT NULL DEFAULT 1,
  component_item_id UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  qty NUMERIC(18, 4) NOT NULL DEFAULT 1.0000
);

CREATE TABLE IF NOT EXISTS access_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  base_role TEXT NOT NULL DEFAULT 'CUSTOM',
  permissions_json TEXT NOT NULL DEFAULT '{}',
  is_system BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS app_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
  access_group_id UUID REFERENCES access_groups(id) ON DELETE SET NULL,
  full_name TEXT NOT NULL,
  login TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL,
  password_hash TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT 'OWNER',
  allowed_org_ids_json TEXT NOT NULL DEFAULT '[]',
  allowed_department_ids_json TEXT NOT NULL DEFAULT '[]',
  permissions_json TEXT NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS department_id UUID REFERENCES departments(id) ON DELETE SET NULL;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS access_group_id UUID REFERENCES access_groups(id) ON DELETE SET NULL;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS login TEXT NOT NULL DEFAULT '';
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS password_hash TEXT NOT NULL DEFAULT '';
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS allowed_org_ids_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS allowed_department_ids_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS permissions_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_app_users_login ON app_users(login);

CREATE TABLE IF NOT EXISTS auth_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_token_hash ON auth_sessions(token_hash);

CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL DEFAULT '',
  user_name TEXT NOT NULL DEFAULT 'Система',
  user_role TEXT NOT NULL DEFAULT 'OWNER',
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL DEFAULT '',
  summary TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  counterparty_id UUID NOT NULL REFERENCES counterparties(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'UAH',
  contract_type TEXT NOT NULL DEFAULT 'CUSTOMER',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cash_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  account_type TEXT NOT NULL DEFAULT 'BANK',
  iban TEXT NOT NULL DEFAULT '',
  currency TEXT NOT NULL DEFAULT 'UAH',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE cash_accounts ADD COLUMN IF NOT EXISTS department_id UUID REFERENCES departments(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS cashflow_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  direction TEXT NOT NULL DEFAULT 'OUT',
  is_operating_expense BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS price_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'UAH'
);

CREATE TABLE IF NOT EXISTS chart_of_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  account_type TEXT NOT NULL DEFAULT 'ACTIVE',
  class_no INTEGER NOT NULL DEFAULT 2,
  subkonto1_type TEXT NOT NULL DEFAULT '',
  subkonto2_type TEXT NOT NULL DEFAULT '',
  is_quantitative BOOLEAN NOT NULL DEFAULT FALSE,
  is_system BOOLEAN NOT NULL DEFAULT TRUE
);
CREATE INDEX IF NOT EXISTS idx_coa_code ON chart_of_accounts(code);

CREATE TABLE IF NOT EXISTS documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  doc_type TEXT NOT NULL,
  doc_number TEXT NOT NULL,
  doc_date TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'DRAFT',
  parent_doc_id UUID,
  warehouse_id UUID REFERENCES warehouses(id) ON DELETE SET NULL,
  target_warehouse_id UUID REFERENCES warehouses(id) ON DELETE SET NULL,
  counterparty_id UUID REFERENCES counterparties(id) ON DELETE SET NULL,
  contract_id UUID REFERENCES contracts(id) ON DELETE SET NULL,
  cash_account_id UUID REFERENCES cash_accounts(id) ON DELETE SET NULL,
  cashflow_category_id UUID REFERENCES cashflow_categories(id) ON DELETE SET NULL,
  price_type_id UUID REFERENCES price_types(id) ON DELETE SET NULL,
  total_amount NUMERIC(18, 2) NOT NULL DEFAULT 0.00,
  vat_amount NUMERIC(18, 2) NOT NULL DEFAULT 0.00,
  fiscal_receipt_id TEXT NOT NULL DEFAULT '',
  fiscal_code TEXT NOT NULL DEFAULT '',
  fiscal_url TEXT NOT NULL DEFAULT '',
  external_id TEXT NOT NULL DEFAULT '',
  comment TEXT NOT NULL DEFAULT '',
  posted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE documents ADD COLUMN IF NOT EXISTS department_id UUID REFERENCES departments(id) ON DELETE SET NULL;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS parent_doc_id UUID;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS bom_spec_id UUID;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS vat_rate INTEGER NOT NULL DEFAULT 20;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'UAH';
ALTER TABLE documents ADD COLUMN IF NOT EXISTS exchange_rate NUMERIC(18, 6) NOT NULL DEFAULT 1.000000;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS discount_total NUMERIC(18, 2) NOT NULL DEFAULT 0.00;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS vat_amount NUMERIC(18, 2) NOT NULL DEFAULT 0.00;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS fiscal_receipt_id TEXT NOT NULL DEFAULT '';
ALTER TABLE documents ADD COLUMN IF NOT EXISTS fiscal_code TEXT NOT NULL DEFAULT '';
ALTER TABLE documents ADD COLUMN IF NOT EXISTS fiscal_url TEXT NOT NULL DEFAULT '';
ALTER TABLE documents ADD COLUMN IF NOT EXISTS external_id TEXT NOT NULL DEFAULT '';
ALTER TABLE documents ADD COLUMN IF NOT EXISTS share_token TEXT NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS idx_documents_org_date ON documents(organization_id, doc_date);
CREATE INDEX IF NOT EXISTS idx_documents_dept ON documents(organization_id, department_id);
CREATE INDEX IF NOT EXISTS idx_documents_type_status ON documents(doc_type, status);
CREATE INDEX IF NOT EXISTS idx_documents_share_token ON documents(share_token);

CREATE TABLE IF NOT EXISTS document_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  line_no INTEGER NOT NULL DEFAULT 1,
  item_id UUID REFERENCES items(id) ON DELETE SET NULL,
  book_qty NUMERIC(18, 4) NOT NULL DEFAULT 0.0000,
  qty NUMERIC(18, 4) NOT NULL DEFAULT 0.0000,
  diff_qty NUMERIC(18, 4) NOT NULL DEFAULT 0.0000,
  price NUMERIC(18, 2) NOT NULL DEFAULT 0.00,
  amount NUMERIC(18, 2) NOT NULL DEFAULT 0.00,
  cost_amount NUMERIC(18, 2) NOT NULL DEFAULT 0.00,
  debit_account_code TEXT NOT NULL DEFAULT '',
  credit_account_code TEXT NOT NULL DEFAULT '',
  warehouse_id UUID REFERENCES warehouses(id) ON DELETE SET NULL,
  counterparty_id UUID REFERENCES counterparties(id) ON DELETE SET NULL,
  contract_id UUID REFERENCES contracts(id) ON DELETE SET NULL,
  cash_account_id UUID REFERENCES cash_accounts(id) ON DELETE SET NULL,
  notes TEXT NOT NULL DEFAULT ''
);
ALTER TABLE document_lines ADD COLUMN IF NOT EXISTS line_role TEXT NOT NULL DEFAULT 'ITEM';
ALTER TABLE document_lines ADD COLUMN IF NOT EXISTS employee_id UUID REFERENCES employees(id) ON DELETE SET NULL;
ALTER TABLE document_lines ADD COLUMN IF NOT EXISTS book_qty NUMERIC(18, 4) NOT NULL DEFAULT 0.0000;
ALTER TABLE document_lines ADD COLUMN IF NOT EXISTS diff_qty NUMERIC(18, 4) NOT NULL DEFAULT 0.0000;
ALTER TABLE document_lines ADD COLUMN IF NOT EXISTS discount_percent NUMERIC(6, 2) NOT NULL DEFAULT 0.00;
ALTER TABLE document_lines ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(18, 2) NOT NULL DEFAULT 0.00;
ALTER TABLE document_lines ADD COLUMN IF NOT EXISTS tax_amount NUMERIC(18, 2) NOT NULL DEFAULT 0.00;
ALTER TABLE document_lines ADD COLUMN IF NOT EXISTS debit_account_code TEXT NOT NULL DEFAULT '';
ALTER TABLE document_lines ADD COLUMN IF NOT EXISTS credit_account_code TEXT NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS idx_doc_lines_doc ON document_lines(document_id);

CREATE TABLE IF NOT EXISTS reg_stock_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  recorder_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  recorder_type TEXT NOT NULL,
  period TIMESTAMPTZ NOT NULL,
  movement_type TEXT NOT NULL,
  warehouse_id UUID NOT NULL,
  item_id UUID NOT NULL,
  qty NUMERIC(18, 4) NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_stock_mov_recorder ON reg_stock_movements(recorder_id);
CREATE INDEX IF NOT EXISTS idx_stock_mov_dim_period ON reg_stock_movements(organization_id, warehouse_id, item_id, period);

CREATE TABLE IF NOT EXISTS reg_stock_totals_monthly (
  organization_id UUID NOT NULL,
  month_start TIMESTAMPTZ NOT NULL,
  warehouse_id UUID NOT NULL,
  item_id UUID NOT NULL,
  qty_delta NUMERIC(18, 4) NOT NULL DEFAULT 0.0000,
  PRIMARY KEY (organization_id, month_start, warehouse_id, item_id)
);

CREATE TABLE IF NOT EXISTS reg_stock_reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  recorder_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  recorder_type TEXT NOT NULL,
  period TIMESTAMPTZ NOT NULL,
  movement_type TEXT NOT NULL,
  order_doc_id UUID NOT NULL,
  warehouse_id UUID NOT NULL,
  item_id UUID NOT NULL,
  qty NUMERIC(18, 4) NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_stock_res_recorder ON reg_stock_reservations(recorder_id);
CREATE INDEX IF NOT EXISTS idx_stock_res_order ON reg_stock_reservations(order_doc_id);
CREATE INDEX IF NOT EXISTS idx_stock_res_dim ON reg_stock_reservations(organization_id, warehouse_id, item_id, period);

CREATE TABLE IF NOT EXISTS reg_cost_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  recorder_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  period TIMESTAMPTZ NOT NULL,
  movement_type TEXT NOT NULL,
  warehouse_id UUID NOT NULL,
  item_id UUID NOT NULL,
  batch_doc_id UUID NOT NULL,
  batch_date TIMESTAMPTZ NOT NULL,
  qty NUMERIC(18, 4) NOT NULL,
  cost_amount NUMERIC(18, 2) NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_batches_recorder ON reg_cost_batches(recorder_id);
CREATE INDEX IF NOT EXISTS idx_batches_fifo ON reg_cost_batches(organization_id, warehouse_id, item_id, batch_date, batch_doc_id);

CREATE TABLE IF NOT EXISTS reg_settlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  recorder_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  recorder_type TEXT NOT NULL,
  period TIMESTAMPTZ NOT NULL,
  counterparty_id UUID NOT NULL,
  contract_id UUID,
  amount NUMERIC(18, 2) NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_settlements_recorder ON reg_settlements(recorder_id);
CREATE INDEX IF NOT EXISTS idx_settlements_cp_period ON reg_settlements(organization_id, counterparty_id, period);

CREATE TABLE IF NOT EXISTS reg_cash_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  recorder_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  recorder_type TEXT NOT NULL,
  period TIMESTAMPTZ NOT NULL,
  cash_account_id UUID NOT NULL,
  cashflow_category_id UUID,
  currency TEXT NOT NULL DEFAULT 'UAH',
  foreign_amount NUMERIC(18, 2) NOT NULL DEFAULT 0.00,
  exchange_rate NUMERIC(18, 6) NOT NULL DEFAULT 1.000000,
  amount NUMERIC(18, 2) NOT NULL
);
ALTER TABLE reg_cash_movements ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'UAH';
ALTER TABLE reg_cash_movements ADD COLUMN IF NOT EXISTS foreign_amount NUMERIC(18, 2) NOT NULL DEFAULT 0.00;
ALTER TABLE reg_cash_movements ADD COLUMN IF NOT EXISTS exchange_rate NUMERIC(18, 6) NOT NULL DEFAULT 1.000000;
CREATE INDEX IF NOT EXISTS idx_cash_recorder ON reg_cash_movements(recorder_id);
CREATE INDEX IF NOT EXISTS idx_cash_acc_period ON reg_cash_movements(organization_id, cash_account_id, period);

CREATE TABLE IF NOT EXISTS reg_pnl_turnover (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  recorder_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  recorder_type TEXT NOT NULL,
  period TIMESTAMPTZ NOT NULL,
  pnl_type TEXT NOT NULL,
  warehouse_id UUID,
  item_id UUID,
  counterparty_id UUID,
  cashflow_category_id UUID,
  qty NUMERIC(18, 4) NOT NULL DEFAULT 0.0000,
  revenue NUMERIC(18, 2) NOT NULL DEFAULT 0.00,
  cogs NUMERIC(18, 2) NOT NULL DEFAULT 0.00,
  expense NUMERIC(18, 2) NOT NULL DEFAULT 0.00,
  profit NUMERIC(18, 2) NOT NULL DEFAULT 0.00
);
CREATE INDEX IF NOT EXISTS idx_pnl_recorder ON reg_pnl_turnover(recorder_id);
CREATE INDEX IF NOT EXISTS idx_pnl_org_period ON reg_pnl_turnover(organization_id, period);

CREATE TABLE IF NOT EXISTS reg_item_prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recorder_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  effective_at TIMESTAMPTZ NOT NULL,
  item_id UUID NOT NULL,
  price_type_id UUID NOT NULL,
  price NUMERIC(18, 2) NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_prices_recorder ON reg_item_prices(recorder_id);
CREATE INDEX IF NOT EXISTS idx_prices_slice ON reg_item_prices(item_id, price_type_id, effective_at);

CREATE TABLE IF NOT EXISTS reg_accounting_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  recorder_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  recorder_type TEXT NOT NULL,
  period TIMESTAMPTZ NOT NULL,
  line_no INTEGER NOT NULL DEFAULT 1,
  debit_account_code TEXT NOT NULL,
  credit_account_code TEXT NOT NULL,
  debit_subkonto1_type TEXT NOT NULL DEFAULT '',
  debit_subkonto1_id TEXT NOT NULL DEFAULT '',
  debit_subkonto1_label TEXT NOT NULL DEFAULT '',
  debit_subkonto2_type TEXT NOT NULL DEFAULT '',
  debit_subkonto2_id TEXT NOT NULL DEFAULT '',
  debit_subkonto2_label TEXT NOT NULL DEFAULT '',
  credit_subkonto1_type TEXT NOT NULL DEFAULT '',
  credit_subkonto1_id TEXT NOT NULL DEFAULT '',
  credit_subkonto1_label TEXT NOT NULL DEFAULT '',
  credit_subkonto2_type TEXT NOT NULL DEFAULT '',
  credit_subkonto2_id TEXT NOT NULL DEFAULT '',
  credit_subkonto2_label TEXT NOT NULL DEFAULT '',
  qty NUMERIC(18, 4) NOT NULL DEFAULT 0.0000,
  amount NUMERIC(18, 2) NOT NULL,
  description TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_acc_entries_recorder ON reg_accounting_entries(recorder_id);
CREATE INDEX IF NOT EXISTS idx_acc_entries_period ON reg_accounting_entries(organization_id, period);
CREATE INDEX IF NOT EXISTS idx_acc_entries_dt ON reg_accounting_entries(organization_id, debit_account_code, period);
CREATE INDEX IF NOT EXISTS idx_acc_entries_kt ON reg_accounting_entries(organization_id, credit_account_code, period);

CREATE TABLE IF NOT EXISTS integration_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  mode TEXT NOT NULL DEFAULT 'DEMO',
  config_json TEXT NOT NULL DEFAULT '{}',
  last_sync_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS integration_sync_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'SUCCESS',
  summary TEXT NOT NULL,
  details_json TEXT NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS crm_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  counterparty_id UUID REFERENCES counterparties(id) ON DELETE SET NULL,
  contact_name TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT 'SITE',
  stage TEXT NOT NULL DEFAULT 'NEW',
  expected_amount NUMERIC(18, 2) NOT NULL DEFAULT 0.00,
  assigned_to TEXT NOT NULL DEFAULT 'Бондаренко Максим',
  notes TEXT NOT NULL DEFAULT '',
  converted_order_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS department_id UUID REFERENCES departments(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS crm_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES crm_leads(id) ON DELETE CASCADE,
  activity_type TEXT NOT NULL DEFAULT 'CALL',
  subject TEXT NOT NULL,
  outcome TEXT NOT NULL DEFAULT '',
  duration_sec INTEGER NOT NULL DEFAULT 0,
  due_at TIMESTAMPTZ,
  is_done BOOLEAN NOT NULL DEFAULT FALSE,
  assigned_to TEXT NOT NULL DEFAULT 'Бондаренко Максим',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS fixed_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  inventory_number TEXT NOT NULL,
  name TEXT NOT NULL,
  account_code TEXT NOT NULL DEFAULT '104',
  depreciation_account_code TEXT NOT NULL DEFAULT '131',
  expense_account_code TEXT NOT NULL DEFAULT '92',
  commissioning_date TIMESTAMPTZ NOT NULL,
  initial_cost NUMERIC(18, 2) NOT NULL,
  residual_value NUMERIC(18, 2) NOT NULL DEFAULT 0.00,
  useful_life_months INTEGER NOT NULL DEFAULT 60,
  accumulated_depreciation NUMERIC(18, 2) NOT NULL DEFAULT 0.00,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS reg_currency_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  currency_code TEXT NOT NULL,
  rate_date TIMESTAMPTZ NOT NULL,
  rate NUMERIC(18, 6) NOT NULL,
  source TEXT NOT NULL DEFAULT 'NBU_API',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_fx_rates_code_date ON reg_currency_rates(currency_code, rate_date);

CREATE TABLE IF NOT EXISTS print_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  template_key TEXT NOT NULL,
  doc_type TEXT NOT NULL,
  name TEXT NOT NULL,
  standard_code TEXT NOT NULL DEFAULT '',
  title_text TEXT NOT NULL,
  subtitle_text TEXT NOT NULL DEFAULT '',
  header_note TEXT NOT NULL DEFAULT '',
  footer_note TEXT NOT NULL DEFAULT '',
  sign_left_label TEXT NOT NULL DEFAULT 'Відпустив(ла)',
  sign_right_label TEXT NOT NULL DEFAULT 'Отримав(ла)',
  show_discount_column BOOLEAN NOT NULL DEFAULT TRUE,
  show_vat_block BOOLEAN NOT NULL DEFAULT TRUE,
  show_iban_block BOOLEAN NOT NULL DEFAULT TRUE,
  show_stamp_area BOOLEAN NOT NULL DEFAULT TRUE,
  show_sku_column BOOLEAN NOT NULL DEFAULT TRUE,
  is_system BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_print_templates_org_key ON print_templates(organization_id, template_key);

ALTER TABLE items ADD COLUMN IF NOT EXISTS is_order_only BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS meta_json TEXT NOT NULL DEFAULT '{}';

CREATE TABLE IF NOT EXISTS bas_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  features_json TEXT NOT NULL DEFAULT '{}',
  doc_fields_json TEXT NOT NULL DEFAULT '{}',
  menu_config_json TEXT NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_bas_settings_org ON bas_settings(organization_id);
`;

export async function createDatabase(options?: {
  databaseUrl?: string;
  dataDir?: string;
}): Promise<DatabaseHandle> {
  const databaseUrl = options?.databaseUrl ?? process.env.DATABASE_URL;

  if (databaseUrl) {
    const pool = new Pool({ connectionString: databaseUrl });
    const db = drizzlePg(pool, { schema });
    const handle: DatabaseHandle = {
      db,
      driver: 'postgres',
      execRaw: async (sqlText: string) => {
        await pool.query(sqlText);
      },
      close: async () => {
        await pool.end();
      },
    };
    await handle.execRaw(SCHEMA_SQL);
    return handle;
  }

  const client = options?.dataDir ? new PGlite(options.dataDir) : new PGlite();
  await client.waitReady;
  const db = drizzlePglite(client, { schema }) as unknown as AppDb;
  const handle: DatabaseHandle = {
    db,
    driver: 'pglite',
    execRaw: async (sqlText: string) => {
      await client.exec(sqlText);
    },
    close: async () => {
      await client.close();
    },
  };
  await handle.execRaw(SCHEMA_SQL);
  return handle;
}
