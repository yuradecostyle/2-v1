import Fastify, { type FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import { z } from 'zod';
import { and, asc, desc, eq } from 'drizzle-orm';
import path from 'node:path';
import { mkdirSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import {
  createSession,
  deleteSessionByToken,
  ensureDefaultAccessGroupsAndUsers,
  ensureDefaultDepartments,
  getUserBySessionToken,
  hashPassword,
  revokeAllUserSessions,
  serializeAccessGroup,
  serializeUser,
  verifyPassword,
  type AuthUserDto,
} from './auth.js';
import {
  createDatabase,
  ensureCleanBaseData,
  seedDemoData,
  seedStage4DemoData,
  organizations,
  departments,
  warehouses,
  categories,
  items,
  counterparties,
  contracts,
  cashAccounts,
  cashflowCategories,
  priceTypes,
  chartOfAccounts,
  employees,
  bomSpecs,
  bomSpecLines,
  accessGroups,
  appUsers,
  auditLogs,
  crmLeads,
  documents,
  documentLines,
  postDocument,
  unpostDocument,
  repostFromDate,
  rebuildStockTotals,
  getDocumentMovements,
  getStockBalances,
  getActiveCustomerOrders,
  getStockTurnover,
  getGrossProfit,
  getSettlements,
  getCounterpartyCard,
  getCashFlowAndPnl,
  getLatestPricesBulk,
  getDashboardSummary,
  getTrialBalance,
  getAccountSubkontoBalance,
  getJournalEntries,
  generateSaftUaXml,
  generateTaxInvoiceXmlJ1201015,
  getPrintableDocumentData,
  getPrintTemplates,
  savePrintTemplate,
  resetPrintTemplate,
  parseUniversalItemsFile,
  commitUniversalItemsImport,
  parseUniversalCounterpartiesFile,
  commitUniversalCounterpartiesImport,
  getBasSettings,
  saveBasSettings,
  resetBasSettings,
  parseDocumentMeta,
  assertRolePermission,
  assertEffectivePermission,
  canViewDocType,
  getVisibleDocTypes,
  DEFAULT_ROLE_PERMISSIONS,
  recordAuditLog,
  getAuditLogs,
  getCrmPipeline,
  createCrmLead,
  updateCrmLeadStage,
  addCrmActivity,
  toggleCrmActivityDone,
  convertLeadToCustomerOrder,
  getFixedAssetsList,
  createFixedAsset,
  runMonthlyDepreciation,
  getCurrencyRates,
  syncNbuCurrencyRates,
  getForeignCurrencyBalances,
  runCurrencyRevaluation,
  getBalanceSheetF1,
  getIncomeStatementF2,
  getVatDeclaration,
  getSingleTaxDeclaration,
  getUnifiedPayrollReport,
  getIntegrationConfigs,
  saveIntegrationConfig,
  syncFromBasOdata,
  syncBankStatement,
  fiscalizeSalesInvoiceCheckbox,
  importItemsFromBasCsv,
  importCounterpartiesFromBasCsv,
  importOpeningBalancesFromBasCsv,
  PostingError,
  d,
  toNumeric2,
  toNumeric4,
  type DocumentType,
  type IntegrationProvider,
  type OrgEntityType,
  type TaxSystemType,
  type UserRole,
} from '@bas-alt/core';

const PORT = Number(process.env.PORT ?? 4000);
const HOST = process.env.HOST ?? '127.0.0.1';
const SEED_DEMO_DATA = process.env.SEED_DEMO_DATA !== 'false';
const DATA_DIR = process.env.PGLITE_DATA_DIR ?? path.resolve(process.cwd(), '../../data/pglite');

mkdirSync(DATA_DIR, { recursive: true });

const dbHandle = await createDatabase({
  databaseUrl: process.env.DATABASE_URL,
  dataDir: process.env.DATABASE_URL ? undefined : DATA_DIR,
});

const { db } = dbHandle;
let defaultOrgId: string;
if (SEED_DEMO_DATA) {
  const seeded = await seedDemoData(db);
  defaultOrgId = seeded.organizationId;
  await seedStage4DemoData(db, defaultOrgId);
} else {
  const clean = await ensureCleanBaseData(db, {
    orgName: process.env.INIT_ORG_NAME,
  });
  defaultOrgId = clean.organizationId;
}

async function provisionOrganizationDefaults(params: {
  organizationId: string;
  orgName: string;
  entityType: OrgEntityType;
  iban?: string;
  bankName?: string;
  directorName?: string;
}) {
  const shortLabel = params.orgName.slice(0, 28);
  const existingDepts = await db
    .select()
    .from(departments)
    .where(eq(departments.organizationId, params.organizationId));
  let mainDeptId = existingDepts[0]?.id;
  if (!mainDeptId) {
    const [dept] = await db
      .insert(departments)
      .values({
        organizationId: params.organizationId,
        code: params.entityType === 'FOP' ? 'MAIN' : 'HQ',
        name: params.entityType === 'FOP' ? 'Основний офіс ФОП' : 'Головний офіс',
        description: 'Основний підрозділ організації',
        headName: params.directorName || '',
      })
      .returning();
    mainDeptId = dept.id;
  }

  const existingWh = await db
    .select()
    .from(warehouses)
    .where(eq(warehouses.organizationId, params.organizationId));
  let mainWhId = existingWh[0]?.id;
  if (!mainWhId) {
    const [wh] = await db
      .insert(warehouses)
      .values({
        organizationId: params.organizationId,
        departmentId: mainDeptId,
        code: params.entityType === 'FOP' ? 'WH-FOP' : 'WH-MAIN',
        name: `Основний склад (${shortLabel})`,
        type: 'WHOLESALE',
      })
      .returning();
    mainWhId = wh.id;
  }

  const existingAcc = await db
    .select()
    .from(cashAccounts)
    .where(eq(cashAccounts.organizationId, params.organizationId));
  if (existingAcc.length === 0) {
    await db.insert(cashAccounts).values([
      {
        organizationId: params.organizationId,
        departmentId: mainDeptId,
        name: params.bankName
          ? `Рахунок ${params.bankName}`
          : params.entityType === 'FOP'
            ? 'Рахунок ФОП IBAN (ПриватБанк)'
            : 'Основний рахунок IBAN (UAH)',
        accountType: 'BANK',
        iban: params.iban || '',
        currency: 'UAH',
      },
      {
        organizationId: params.organizationId,
        departmentId: mainDeptId,
        name: params.entityType === 'FOP' ? 'Каса ФОП (Готівка)' : 'Основна каса (Готівка)',
        accountType: 'CASH',
        iban: '',
        currency: 'UAH',
      },
    ]);
  }

  return { mainWhId, mainDeptId };
}

async function ensureDemoSecondFop() {
  const allOrgs = await db.select().from(organizations).orderBy(asc(organizations.createdAt));
  if (allOrgs.length > 1) return;

  // Ensure first demo org has entityType / taxSystem / bank info filled nicely
  if (allOrgs[0] && !allOrgs[0].iban) {
    await db
      .update(organizations)
      .set({
        entityType: 'TOV',
        taxSystem: 'GENERAL_VAT',
        iban: 'UA213052990000026007015012345',
        bankName: 'АТ КБ «ПриватБанк»',
        address: 'м. Київ, вул. Хрещатик, 22',
        directorName: 'Шевченко Андрій Іванович',
      })
      .where(eq(organizations.id, allOrgs[0].id));
  }

  const [fop] = await db
    .insert(organizations)
    .values({
      name: 'ФОП Коваленко Олександр Петрович',
      entityType: 'FOP',
      taxSystem: 'EP_GROUP_3_5',
      edrpou: '3184509214',
      ipn: '3184509214',
      iban: 'UA883220010000026005310094821',
      bankName: 'АТ «Універсал Банк» (Monobank)',
      address: 'м. Львів, вул. Городоцька, 85',
      directorName: 'Коваленко Олександр Петрович',
      isVatPayer: false,
      vatRate: 0,
      baseCurrency: 'UAH',
      costingMethod: 'FIFO',
      allowNegativeStock: false,
    })
    .returning();

  const { mainWhId } = await provisionOrganizationDefaults({
    organizationId: fop.id,
    orgName: fop.name,
    entityType: 'FOP',
    iban: fop.iban,
    bankName: fop.bankName,
    directorName: fop.directorName,
  });

  // Seed starter opening balance & 1 posted customer order for the FOP so it is alive immediately
  const sampleItems = await db.select().from(items).limit(2);
  const sampleCps = await db.select().from(counterparties).where(eq(counterparties.isCustomer, true)).limit(1);
  if (sampleItems.length > 0) {
    const [obDoc] = await db
      .insert(documents)
      .values({
        organizationId: fop.id,
        docType: 'opening_balance',
        docNumber: 'ВПЗ-ФОП-01',
        docDate: new Date('2026-10-01T09:00:00Z'),
        status: 'DRAFT',
        warehouseId: mainWhId,
        totalAmount: '112000.00',
        vatRate: 0,
        vatAmount: '0.00',
        comment: 'Початкові залишки товарів ФОП Коваленко (ЄП 3 гр. 5%)',
      })
      .returning();

    await db.insert(documentLines).values(
      sampleItems.map((it, idx) => ({
        documentId: obDoc.id,
        lineNo: idx + 1,
        lineRole: 'ITEM' as const,
        itemId: it.id,
        qty: '4.0000',
        bookQty: '0.0000',
        diffQty: '0.0000',
        price: idx === 0 ? '24000.00' : '4000.00',
        amount: idx === 0 ? '96000.00' : '16000.00',
      }))
    );
    await postDocument(db, obDoc.id);

    if (sampleCps[0]) {
      const [ord] = await db
        .insert(documents)
        .values({
          organizationId: fop.id,
          docType: 'customer_order',
          docNumber: 'ЗП-ФОП-01',
          docDate: new Date('2026-11-20T10:30:00Z'),
          status: 'DRAFT',
          warehouseId: mainWhId,
          counterpartyId: sampleCps[0].id,
          totalAmount: '31500.00',
          vatRate: 0,
          vatAmount: '0.00',
          comment: 'Замовлення по ФОП (без ПДВ, 3 група 5%)',
        })
        .returning();

      await db.insert(documentLines).values([
        {
          documentId: ord.id,
          lineNo: 1,
          lineRole: 'ITEM',
          itemId: sampleItems[0].id,
          qty: '1.0000',
          bookQty: '0.0000',
          diffQty: '0.0000',
          price: '31500.00',
          amount: '31500.00',
        },
      ]);
      await postDocument(db, ord.id);
    }
  }
}

if (SEED_DEMO_DATA) {
  await ensureDemoSecondFop();
}
await ensureDefaultAccessGroupsAndUsers(db, defaultOrgId, { seedDemoUsers: SEED_DEMO_DATA });
await ensureDefaultDepartments(db, { seedDemoDepartments: SEED_DEMO_DATA });

type AuthedRequest = FastifyRequest & { authUser?: AuthUserDto; authToken?: string };

const app = Fastify({ logger: false, bodyLimit: 30 * 1024 * 1024 });
await app.register(cors, { origin: true });

// Глобальна перевірка авторизації по токену сесії (крім відкритих маршрутів)
app.addHook('preHandler', async (req: AuthedRequest, reply) => {
  const urlPath = req.url.split('?')[0];
  if (
    urlPath === '/api/health' ||
    urlPath === '/api/auth/login' ||
    urlPath.startsWith('/api/public/')
  ) {
    return;
  }

  const authHeader = req.headers.authorization;
  const rawToken =
    typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
      ? authHeader.slice(7).trim()
      : '';

  if (rawToken) {
    const user = await getUserBySessionToken(db, rawToken);
    if (user) {
      req.authUser = user;
      req.authToken = rawToken;
      return;
    }
  }

  if (urlPath === '/api/auth/me') {
    return reply.status(401).send({
      error: 'UNAUTHORIZED',
      message: 'Сесія неактивна',
    });
  }

  return reply.status(401).send({
    error: 'UNAUTHORIZED',
    message: 'Потрібна авторизація. Увійдіть під своїм логіном і паролем.',
  });
});

app.setErrorHandler((err, _req, reply) => {
  if (err instanceof PostingError) {
    const status = err.code === 'FORBIDDEN_ROLE' ? 403 : 400;
    return reply.status(status).send({
      error: err.code,
      message: err.message,
      details: err.details,
    });
  }
  if (err instanceof z.ZodError) {
    return reply.status(400).send({
      error: 'VALIDATION_ERROR',
      message: 'Помилка валідації даних',
      details: err.flatten(),
    });
  }
  const message = err instanceof Error ? err.message : 'Внутрішня помилка сервера';
  return reply.status(500).send({ error: 'INTERNAL_ERROR', message });
});

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function getEffectiveAllowedOrgIds(authUser?: AuthUserDto): Promise<string[] | null> {
  if (!authUser) return null;
  const explicitOrgs = authUser.allowedOrgIds ?? [];
  const allowedDepts = authUser.allowedDepartmentIds ?? [];

  if (allowedDepts.length === 0) {
    return explicitOrgs.length > 0 ? explicitOrgs : null;
  }

  // Користувач обмежений конкретними підрозділами: дозволені лише ті організації, що містять ці підрозділи
  const allDepts = await db
    .select({ id: departments.id, organizationId: departments.organizationId })
    .from(departments);
  const deptAllowedSet = new Set(allowedDepts);
  const orgsFromDepts = Array.from(
    new Set(allDepts.filter((dp) => deptAllowedSet.has(dp.id)).map((dp) => dp.organizationId))
  );

  if (explicitOrgs.length > 0) {
    const expSet = new Set(explicitOrgs);
    return orgsFromDepts.filter((oid) => expSet.has(oid));
  }
  return orgsFromDepts;
}

async function getOrgId(req?: FastifyRequest, explicitOrgId?: string | null): Promise<string> {
  const authUser = (req as AuthedRequest | undefined)?.authUser;
  const allowedIds = (await getEffectiveAllowedOrgIds(authUser)) ?? [];
  const headerOrgId = req?.headers['x-organization-id'];
  const queryOrgId = (req?.query as Record<string, unknown> | undefined)?.organizationId;
  const candidate =
    explicitOrgId ||
    (typeof headerOrgId === 'string' ? headerOrgId : '') ||
    (typeof queryOrgId === 'string' ? queryOrgId : '');

  if (candidate && UUID_RE.test(candidate)) {
    if (allowedIds.length === 0 || allowedIds.includes(candidate)) {
      const [found] = await db
        .select({ id: organizations.id })
        .from(organizations)
        .where(eq(organizations.id, candidate))
        .limit(1);
      if (found) return found.id;
    }
  }

  if (allowedIds.length > 0) {
    const preferred =
      authUser?.organizationId && allowedIds.includes(authUser.organizationId)
        ? authUser.organizationId
        : allowedIds[0];
    const [foundAllowed] = await db
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.id, preferred))
      .limit(1);
    if (foundAllowed) return foundAllowed.id;
  }

  const [org] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .orderBy(asc(organizations.createdAt))
    .limit(1);
  return org?.id ?? defaultOrgId;
}

interface DepartmentScope {
  orgDepartments: Array<typeof departments.$inferSelect>;
  visibleDepartments: Array<typeof departments.$inferSelect>;
  activeDepartmentId: string | null;
  filterDeptIds: string[] | null;
  canSeeAllDepartments: boolean;
}

async function resolveDepartmentScope(
  req: FastifyRequest | undefined,
  orgId: string
): Promise<DepartmentScope> {
  const authUser = (req as AuthedRequest | undefined)?.authUser;
  const orgDepartments = await db
    .select()
    .from(departments)
    .where(eq(departments.organizationId, orgId))
    .orderBy(asc(departments.createdAt));

  const headerDept = req?.headers['x-department-id'];
  const queryDept = (req?.query as Record<string, unknown> | undefined)?.departmentId;
  const rawRequested =
    (typeof queryDept === 'string' ? queryDept : '') ||
    (typeof headerDept === 'string' ? headerDept : '');
  const requested = rawRequested.trim();

  const allowedAll = authUser?.allowedDepartmentIds ?? [];
  const isUnrestricted = allowedAll.length === 0;

  if (isUnrestricted) {
    if (requested && requested !== 'ALL' && UUID_RE.test(requested)) {
      if (orgDepartments.some((dp) => dp.id === requested)) {
        return {
          orgDepartments,
          visibleDepartments: orgDepartments,
          activeDepartmentId: requested,
          filterDeptIds: [requested],
          canSeeAllDepartments: true,
        };
      }
    }
    return {
      orgDepartments,
      visibleDepartments: orgDepartments,
      activeDepartmentId: null,
      filterDeptIds: null,
      canSeeAllDepartments: true,
    };
  }

  const allowedSet = new Set(allowedAll);
  const visibleDepartments = orgDepartments.filter((dp) => allowedSet.has(dp.id));

  if (visibleDepartments.length === 0) {
    return {
      orgDepartments,
      visibleDepartments: [],
      activeDepartmentId: null,
      filterDeptIds: [],
      canSeeAllDepartments: false,
    };
  }

  if (visibleDepartments.length === 1) {
    return {
      orgDepartments,
      visibleDepartments,
      activeDepartmentId: visibleDepartments[0].id,
      filterDeptIds: [visibleDepartments[0].id],
      canSeeAllDepartments: false,
    };
  }

  if (requested === 'ALL' || !requested) {
    return {
      orgDepartments,
      visibleDepartments,
      activeDepartmentId: null,
      filterDeptIds: visibleDepartments.map((dp) => dp.id),
      canSeeAllDepartments: false,
    };
  }

  if (UUID_RE.test(requested) && visibleDepartments.some((dp) => dp.id === requested)) {
    return {
      orgDepartments,
      visibleDepartments,
      activeDepartmentId: requested,
      filterDeptIds: [requested],
      canSeeAllDepartments: false,
    };
  }

  return {
    orgDepartments,
    visibleDepartments,
    activeDepartmentId: null,
    filterDeptIds: visibleDepartments.map((dp) => dp.id),
    canSeeAllDepartments: false,
  };
}

function resolveAllowedDepartmentForWrite(
  scope: DepartmentScope,
  requestedDeptId: string | null | undefined,
  authUser?: AuthUserDto
): string | null {
  if (requestedDeptId) {
    if (scope.canSeeAllDepartments) {
      if (scope.orgDepartments.some((dp) => dp.id === requestedDeptId)) {
        return requestedDeptId;
      }
    } else {
      if (scope.visibleDepartments.some((dp) => dp.id === requestedDeptId)) {
        return requestedDeptId;
      }
      throw new PostingError(
        'FORBIDDEN_ROLE',
        'У вас немає доступу до обраного підрозділу. Оберіть один із дозволених підрозділів.'
      );
    }
  }
  if (scope.activeDepartmentId) return scope.activeDepartmentId;
  if (
    authUser?.departmentId &&
    scope.visibleDepartments.some((dp) => dp.id === authUser.departmentId)
  ) {
    return authUser.departmentId;
  }
  return scope.visibleDepartments[0]?.id ?? null;
}

function taxSystemDefaults(taxSystem: TaxSystemType): { isVatPayer: boolean; vatRate: number } {
  switch (taxSystem) {
    case 'GENERAL_VAT':
    case 'EP_GROUP_3_3_VAT':
      return { isVatPayer: true, vatRate: 20 };
    case 'GENERAL_NO_VAT':
    case 'EP_GROUP_2':
    case 'EP_GROUP_3_5':
      return { isVatPayer: false, vatRate: 0 };
  }
}

function getRequestRole(req: FastifyRequest): {
  role: UserRole;
  userName: string;
  userId: string;
  perms: AuthUserDto['effectivePermissions'];
} {
  const authUser = (req as AuthedRequest).authUser;
  if (authUser) {
    return {
      role: authUser.role,
      userName: authUser.fullName,
      userId: authUser.id,
      perms: authUser.effectivePermissions,
    };
  }
  return {
    role: 'OWNER',
    userName: 'Система',
    userId: '',
    perms: DEFAULT_ROLE_PERMISSIONS.OWNER,
  };
}

function assertReqPerm(
  req: FastifyRequest,
  action: 'DOC_WRITE' | 'DOC_POST' | 'DOC_DELETE' | 'ORG_POLICY' | 'USERS_ADMIN' | 'INTEGRATION_SYNC' | 'PAYROLL' | 'ACCOUNTING',
  docType?: DocumentType
): void {
  const authUser = (req as AuthedRequest).authUser;
  if (authUser) {
    assertEffectivePermission(authUser.effectivePermissions, action, docType);
  }
}

function generateDocNumber(docType: DocumentType): string {
  const prefixes: Record<DocumentType, string> = {
    opening_balance: 'ВПЗ',
    customer_order: 'ЗП',
    goods_receipt: 'ПН',
    sales_invoice: 'ВН',
    stock_transfer: 'ПМ',
    inventory_count: 'ІНВ',
    production_order: 'ВИР',
    payroll_sheet: 'ЗПВ',
    tax_invoice: 'ПНПДВ',
    depreciation_run: 'АМ',
    fx_revaluation: 'КР',
    money_in: 'НК',
    money_out: 'СК',
    price_setting: 'ВЦ',
    manual_journal: 'БО',
  };
  const suffix = String(Date.now()).slice(-5);
  return `${prefixes[docType]}-${suffix}`;
}

// ============================================================================
// АВТОРИЗАЦІЯ (ЛОГІН / ПАРОЛЬ / СЕСІЇ) ТА КЕРУВАННЯ КОРИСТУВАЧАМИ І ПРАВАМИ
// ============================================================================

app.post('/api/auth/login', async (req, reply) => {
  const body = z
    .object({
      login: z.string().min(1),
      password: z.string().min(1),
    })
    .parse(req.body);

  const normalized = body.login.trim().toLowerCase();
  const allUsers = await db.select().from(appUsers);
  const found = allUsers.find(
    (u) =>
      u.login.trim().toLowerCase() === normalized ||
      u.email.trim().toLowerCase() === normalized
  );

  if (!found || !verifyPassword(body.password, found.passwordHash)) {
    return reply.status(401).send({
      error: 'INVALID_CREDENTIALS',
      message: 'Невірний логін або пароль',
    });
  }

  if (!found.isActive) {
    return reply.status(403).send({
      error: 'USER_BLOCKED',
      message: 'Обліковий запис заблоковано адміністратором',
    });
  }

  const token = await createSession(db, found.id);
  const now = new Date();
  await db.update(appUsers).set({ lastLoginAt: now }).where(eq(appUsers.id, found.id));

  await recordAuditLog(db, {
    organizationId: found.organizationId,
    userId: found.id,
    userName: found.fullName,
    userRole: found.role,
    action: 'USER_LOGIN',
    entityType: 'auth',
    entityId: found.id,
    summary: `Вхід у систему (${found.login})`,
  });

  let groupRow: typeof accessGroups.$inferSelect | null = null;
  if (found.accessGroupId) {
    const [g] = await db
      .select()
      .from(accessGroups)
      .where(eq(accessGroups.id, found.accessGroupId))
      .limit(1);
    groupRow = g ?? null;
  }
  let deptRow: typeof departments.$inferSelect | null = null;
  if (found.departmentId) {
    const [dp] = await db
      .select()
      .from(departments)
      .where(eq(departments.id, found.departmentId))
      .limit(1);
    deptRow = dp ?? null;
  }

  return {
    token,
    user: serializeUser({ ...found, lastLoginAt: now }, groupRow, deptRow),
  };
});

app.post('/api/auth/logout', async (req: AuthedRequest) => {
  if (req.authToken) {
    await deleteSessionByToken(db, req.authToken);
  }
  return { ok: true };
});

app.get('/api/auth/me', async (req: AuthedRequest) => {
  return { user: req.authUser };
});

app.post('/api/auth/change-password', async (req: AuthedRequest, reply) => {
  const authUser = req.authUser!;
  const body = z
    .object({
      currentPassword: z.string().min(1),
      newPassword: z.string().min(4, 'Пароль має містити мінімум 4 символи'),
    })
    .parse(req.body);

  const [dbUser] = await db.select().from(appUsers).where(eq(appUsers.id, authUser.id));
  if (!dbUser || !verifyPassword(body.currentPassword, dbUser.passwordHash)) {
    return reply.status(400).send({
      error: 'WRONG_PASSWORD',
      message: 'Поточний пароль вказано невірно',
    });
  }

  await db
    .update(appUsers)
    .set({ passwordHash: hashPassword(body.newPassword) })
    .where(eq(appUsers.id, authUser.id));

  await recordAuditLog(db, {
    organizationId: dbUser.organizationId,
    userId: dbUser.id,
    userName: dbUser.fullName,
    userRole: dbUser.role,
    action: 'CHANGE_PASSWORD',
    entityType: 'user',
    entityId: dbUser.id,
    summary: `Користувач ${dbUser.fullName} змінив свій пароль`,
  });

  return { ok: true };
});

// ГРУПИ ДОСТУПУ (ACCESS GROUPS)
const USER_ROLE_ENUM = z.enum([
  'OWNER',
  'ACCOUNTANT',
  'SALES_MANAGER',
  'PURCHASE_MANAGER',
  'STOREKEEPER',
  'CUSTOM',
]);

app.get('/api/access-groups', async (req: AuthedRequest) => {
  assertReqPerm(req, 'USERS_ADMIN');
  const [groups, allUsers] = await Promise.all([
    db.select().from(accessGroups).orderBy(asc(accessGroups.createdAt)),
    db.select({ accessGroupId: appUsers.accessGroupId, login: appUsers.login }).from(appUsers),
  ]);
  const validUsers = allUsers.filter((u) => u.login.trim().length > 0);
  return groups.map((g) =>
    serializeAccessGroup(
      g,
      validUsers.filter((u) => u.accessGroupId === g.id).length
    )
  );
});

app.post('/api/access-groups', async (req: AuthedRequest) => {
  assertReqPerm(req, 'USERS_ADMIN');
  const orgId = await getOrgId(req);
  const body = z
    .object({
      name: z.string().min(2),
      description: z.string().optional().default(''),
      baseRole: USER_ROLE_ENUM.optional().default('CUSTOM'),
      permissions: z.record(z.boolean()).optional().default({}),
    })
    .parse(req.body);

  const [created] = await db
    .insert(accessGroups)
    .values({
      name: body.name.trim(),
      description: body.description.trim(),
      baseRole: body.baseRole,
      permissionsJson: JSON.stringify(body.permissions),
      isSystem: false,
    })
    .returning();

  await recordAuditLog(db, {
    organizationId: orgId,
    userId: req.authUser!.id,
    userName: req.authUser!.fullName,
    userRole: req.authUser!.role,
    action: 'CREATE_ACCESS_GROUP',
    entityType: 'access_group',
    entityId: created.id,
    summary: `Створено групу доступу «${created.name}»`,
  });

  return serializeAccessGroup(created, 0);
});

app.patch('/api/access-groups/:id', async (req: AuthedRequest, reply) => {
  assertReqPerm(req, 'USERS_ADMIN');
  const orgId = await getOrgId(req);
  const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
  const body = z
    .object({
      name: z.string().min(2).optional(),
      description: z.string().optional(),
      baseRole: USER_ROLE_ENUM.optional(),
      permissions: z.record(z.boolean()).optional(),
    })
    .parse(req.body);

  const [existing] = await db.select().from(accessGroups).where(eq(accessGroups.id, id));
  if (!existing) {
    return reply.status(404).send({ error: 'NOT_FOUND', message: 'Групу доступу не знайдено' });
  }

  const [updated] = await db
    .update(accessGroups)
    .set({
      ...(body.name !== undefined ? { name: body.name.trim() } : {}),
      ...(body.description !== undefined ? { description: body.description.trim() } : {}),
      ...(body.baseRole !== undefined ? { baseRole: body.baseRole } : {}),
      ...(body.permissions !== undefined
        ? { permissionsJson: JSON.stringify(body.permissions) }
        : {}),
    })
    .where(eq(accessGroups.id, id))
    .returning();

  await recordAuditLog(db, {
    organizationId: orgId,
    userId: req.authUser!.id,
    userName: req.authUser!.fullName,
    userRole: req.authUser!.role,
    action: 'UPDATE_ACCESS_GROUP',
    entityType: 'access_group',
    entityId: id,
    summary: `Оновлено права групи доступу «${updated.name}»`,
  });

  return serializeAccessGroup(updated);
});

app.delete('/api/access-groups/:id', async (req: AuthedRequest, reply) => {
  assertReqPerm(req, 'USERS_ADMIN');
  const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
  const [existing] = await db.select().from(accessGroups).where(eq(accessGroups.id, id));
  if (!existing) {
    return reply.status(404).send({ error: 'NOT_FOUND', message: 'Групу не знайдено' });
  }
  if (existing.isSystem) {
    return reply.status(400).send({
      error: 'SYSTEM_GROUP',
      message: 'Базову системну групу не можна видалити — ви можете змінити її права або створити нову групу.',
    });
  }
  await db.delete(accessGroups).where(eq(accessGroups.id, id));
  return { deleted: true };
});

app.get('/api/users', async (req: AuthedRequest) => {
  assertReqPerm(req, 'USERS_ADMIN');
  const [rows, groups, allDepts] = await Promise.all([
    db.select().from(appUsers).orderBy(asc(appUsers.createdAt)),
    db.select().from(accessGroups),
    db.select().from(departments),
  ]);
  const groupMap = new Map(groups.map((g) => [g.id, g]));
  const deptMap = new Map(allDepts.map((dp) => [dp.id, dp]));
  return rows
    .filter((u) => u.login.trim().length > 0)
    .map((u) =>
      serializeUser(
        u,
        u.accessGroupId ? groupMap.get(u.accessGroupId) : null,
        u.departmentId ? deptMap.get(u.departmentId) : null
      )
    );
});

app.post('/api/users', async (req: AuthedRequest, reply) => {
  assertReqPerm(req, 'USERS_ADMIN');
  const orgId = await getOrgId(req);

  const body = z
    .object({
      fullName: z.string().min(2),
      login: z.string().min(2).max(64),
      email: z.string().optional().default(''),
      password: z.string().min(4, 'Пароль має містити мінімум 4 символи'),
      role: USER_ROLE_ENUM.default('SALES_MANAGER'),
      accessGroupId: z.string().uuid().nullable().optional().default(null),
      departmentId: z.string().uuid().nullable().optional().default(null),
      allowedOrgIds: z.array(z.string().uuid()).optional().default([]),
      allowedDepartmentIds: z.array(z.string().uuid()).optional().default([]),
      permissions: z.record(z.boolean()).optional().default({}),
      isActive: z.boolean().optional().default(true),
    })
    .parse(req.body);

  const normalizedLogin = body.login.trim().toLowerCase();
  const existing = await db.select().from(appUsers);
  if (existing.some((u) => u.login.trim().toLowerCase() === normalizedLogin)) {
    return reply.status(400).send({
      error: 'DUPLICATE_LOGIN',
      message: `Користувач із логіном «${normalizedLogin}» вже існує`,
    });
  }

  let groupRow: typeof accessGroups.$inferSelect | null = null;
  if (body.accessGroupId) {
    const [g] = await db
      .select()
      .from(accessGroups)
      .where(eq(accessGroups.id, body.accessGroupId))
      .limit(1);
    groupRow = g ?? null;
  }

  let deptRow: typeof departments.$inferSelect | null = null;
  if (body.departmentId) {
    const [dp] = await db
      .select()
      .from(departments)
      .where(eq(departments.id, body.departmentId))
      .limit(1);
    deptRow = dp ?? null;
  }

  const finalRole = groupRow ? groupRow.baseRole : body.role;

  const [created] = await db
    .insert(appUsers)
    .values({
      organizationId: deptRow?.organizationId ?? body.allowedOrgIds[0] ?? orgId,
      departmentId: deptRow?.id ?? null,
      accessGroupId: groupRow?.id ?? null,
      fullName: body.fullName.trim(),
      login: normalizedLogin,
      email: body.email.trim() || `${normalizedLogin}@2c.ua`,
      passwordHash: hashPassword(body.password),
      role: finalRole,
      allowedOrgIdsJson: JSON.stringify(body.allowedOrgIds),
      allowedDepartmentIdsJson: JSON.stringify(body.allowedDepartmentIds),
      permissionsJson: JSON.stringify(body.permissions),
      isActive: body.isActive,
    })
    .returning();

  await recordAuditLog(db, {
    organizationId: orgId,
    userId: req.authUser!.id,
    userName: req.authUser!.fullName,
    userRole: req.authUser!.role,
    action: 'CREATE_USER',
    entityType: 'user',
    entityId: created.id,
    summary: `Створено користувача ${created.fullName} (логін: ${created.login}${groupRow ? `, група: ${groupRow.name}` : `, роль: ${created.role}`}${deptRow ? `, підрозділ: ${deptRow.name}` : ''})`,
  });

  return serializeUser(created, groupRow, deptRow);
});

app.patch('/api/users/:id', async (req: AuthedRequest, reply) => {
  assertReqPerm(req, 'USERS_ADMIN');
  const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
  const body = z
    .object({
      fullName: z.string().min(2).optional(),
      login: z.string().min(2).max(64).optional(),
      email: z.string().optional(),
      role: USER_ROLE_ENUM.optional(),
      accessGroupId: z.string().uuid().nullable().optional(),
      departmentId: z.string().uuid().nullable().optional(),
      allowedOrgIds: z.array(z.string().uuid()).optional(),
      allowedDepartmentIds: z.array(z.string().uuid()).optional(),
      permissions: z.record(z.boolean()).optional(),
      isActive: z.boolean().optional(),
      newPassword: z.string().min(4).optional(),
    })
    .parse(req.body);

  const [existing] = await db.select().from(appUsers).where(eq(appUsers.id, id));
  if (!existing) {
    return reply.status(404).send({ error: 'NOT_FOUND', message: 'Користувача не знайдено' });
  }

  if (id === req.authUser!.id && body.isActive === false) {
    return reply.status(400).send({
      error: 'CANNOT_SELF_BLOCK',
      message: 'Не можна заблокувати власний обліковий запис',
    });
  }

  if (body.login) {
    const norm = body.login.trim().toLowerCase();
    const all = await db.select().from(appUsers);
    if (all.some((u) => u.id !== id && u.login.trim().toLowerCase() === norm)) {
      return reply.status(400).send({
        error: 'DUPLICATE_LOGIN',
        message: `Логін «${norm}» вже зайнятий іншим користувачем`,
      });
    }
  }

  const nextGroupId =
    body.accessGroupId !== undefined ? body.accessGroupId : existing.accessGroupId;
  let groupRow: typeof accessGroups.$inferSelect | null = null;
  if (nextGroupId) {
    const [g] = await db
      .select()
      .from(accessGroups)
      .where(eq(accessGroups.id, nextGroupId))
      .limit(1);
    groupRow = g ?? null;
  }

  const nextDeptId =
    body.departmentId !== undefined ? body.departmentId : existing.departmentId;
  let deptRow: typeof departments.$inferSelect | null = null;
  if (nextDeptId) {
    const [dp] = await db
      .select()
      .from(departments)
      .where(eq(departments.id, nextDeptId))
      .limit(1);
    deptRow = dp ?? null;
  }

  const [updated] = await db
    .update(appUsers)
    .set({
      ...(body.fullName !== undefined ? { fullName: body.fullName.trim() } : {}),
      ...(body.login !== undefined ? { login: body.login.trim().toLowerCase() } : {}),
      ...(body.email !== undefined ? { email: body.email.trim() } : {}),
      ...(body.departmentId !== undefined ? { departmentId: body.departmentId } : {}),
      ...(body.accessGroupId !== undefined ? { accessGroupId: body.accessGroupId } : {}),
      ...(body.role !== undefined
        ? { role: body.role }
        : body.accessGroupId && groupRow
          ? { role: groupRow.baseRole }
          : {}),
      ...(body.allowedOrgIds !== undefined
        ? { allowedOrgIdsJson: JSON.stringify(body.allowedOrgIds) }
        : {}),
      ...(body.allowedDepartmentIds !== undefined
        ? { allowedDepartmentIdsJson: JSON.stringify(body.allowedDepartmentIds) }
        : {}),
      ...(body.permissions !== undefined
        ? { permissionsJson: JSON.stringify(body.permissions) }
        : {}),
      ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
      ...(body.newPassword ? { passwordHash: hashPassword(body.newPassword) } : {}),
    })
    .where(eq(appUsers.id, id))
    .returning();

  if (body.isActive === false || body.newPassword) {
    await revokeAllUserSessions(db, id);
  }

  await recordAuditLog(db, {
    organizationId: existing.organizationId,
    userId: req.authUser!.id,
    userName: req.authUser!.fullName,
    userRole: req.authUser!.role,
    action: 'UPDATE_USER',
    entityType: 'user',
    entityId: id,
    summary: `Оновлено права/дані користувача ${updated.fullName} (${updated.login})${deptRow ? ` · підрозділ: ${deptRow.name}` : ''}${body.newPassword ? ' · скинуто пароль' : ''}`,
  });

  return serializeUser(updated, groupRow, deptRow);
});

app.delete('/api/users/:id', async (req: AuthedRequest, reply) => {
  assertReqPerm(req, 'USERS_ADMIN');
  const { id } = z.object({ id: z.string().uuid() }).parse(req.params);

  if (id === req.authUser!.id) {
    return reply.status(400).send({
      error: 'CANNOT_SELF_DELETE',
      message: 'Не можна видалити власний обліковий запис',
    });
  }

  const [existing] = await db.select().from(appUsers).where(eq(appUsers.id, id));
  if (!existing) {
    return reply.status(404).send({ error: 'NOT_FOUND', message: 'Користувача не знайдено' });
  }

  await revokeAllUserSessions(db, id);
  await db.delete(appUsers).where(eq(appUsers.id, id));

  await recordAuditLog(db, {
    organizationId: existing.organizationId,
    userId: req.authUser!.id,
    userName: req.authUser!.fullName,
    userRole: req.authUser!.role,
    action: 'DELETE_USER',
    entityType: 'user',
    entityId: id,
    summary: `Видалено користувача ${existing.fullName} (${existing.login})`,
  });

  return { deleted: true };
});

// ============================================================================
// HEALTH & BOOTSTRAP
// ============================================================================

app.get('/api/health', async () => ({
  status: 'ok',
  version: '1.0.0',
  driver: dbHandle.driver,
  demoMode: SEED_DEMO_DATA,
  timestamp: new Date().toISOString(),
}));

app.get('/api/bootstrap', async (req) => {
  const orgId = await getOrgId(req);
  const deptScope = await resolveDepartmentScope(req, orgId);
  const [
    allOrgs,
    allDeptsList,
    allWhList,
    catList,
    itemList,
    cpList,
    ctrList,
    allAccList,
    cfList,
    ptList,
    coaList,
    empList,
    bomList,
    bomLinesList,
    userList,
    groupsList,
  ] = await Promise.all([
    db.select().from(organizations).orderBy(asc(organizations.createdAt)),
    db.select().from(departments).orderBy(asc(departments.createdAt)),
    db.select().from(warehouses).orderBy(asc(warehouses.name)),
    db.select().from(categories).orderBy(asc(categories.name)),
    db.select().from(items).orderBy(asc(items.name)),
    db.select().from(counterparties).orderBy(asc(counterparties.name)),
    db
      .select()
      .from(contracts)
      .where(eq(contracts.organizationId, orgId))
      .orderBy(asc(contracts.name)),
    db.select().from(cashAccounts).orderBy(asc(cashAccounts.name)),
    db.select().from(cashflowCategories).orderBy(asc(cashflowCategories.name)),
    db.select().from(priceTypes).orderBy(asc(priceTypes.name)),
    db.select().from(chartOfAccounts).orderBy(asc(chartOfAccounts.code)),
    db
      .select()
      .from(employees)
      .where(eq(employees.organizationId, orgId))
      .orderBy(asc(employees.fullName)),
    db
      .select()
      .from(bomSpecs)
      .where(eq(bomSpecs.organizationId, orgId))
      .orderBy(asc(bomSpecs.code)),
    db.select().from(bomSpecLines).orderBy(asc(bomSpecLines.lineNo)),
    db
      .select()
      .from(appUsers)
      .where(eq(appUsers.organizationId, orgId))
      .orderBy(asc(appUsers.createdAt)),
    db.select().from(accessGroups),
  ]);

  const authUser = (req as AuthedRequest).authUser;
  const effectiveAllowedOrgs = await getEffectiveAllowedOrgIds(authUser);
  const visibleOrgs =
    effectiveAllowedOrgs !== null
      ? allOrgs.filter((o) => effectiveAllowedOrgs.includes(o.id))
      : allOrgs;
  const visibleOrgIds = new Set(visibleOrgs.map((o) => o.id));
  const organization = visibleOrgs.find((o) => o.id === orgId) ?? visibleOrgs[0] ?? allOrgs[0];

  const allowedDeptSet =
    authUser && authUser.allowedDepartmentIds.length > 0
      ? new Set(authUser.allowedDepartmentIds)
      : null;
  const visibleAllDepts = allDeptsList.filter(
    (dp) => visibleOrgIds.has(dp.organizationId) && (!allowedDeptSet || allowedDeptSet.has(dp.id))
  );
  const deptNameMap = new Map(allDeptsList.map((dp) => [dp.id, dp.name]));
  const deptObjMap = new Map(allDeptsList.map((dp) => [dp.id, dp]));
  const groupMap = new Map(groupsList.map((g) => [g.id, g]));

  const filterDeptSet = deptScope.filterDeptIds ? new Set(deptScope.filterDeptIds) : null;
  const whList = allWhList.filter(
    (w) =>
      w.organizationId === organization.id &&
      (!filterDeptSet || w.departmentId === null || filterDeptSet.has(w.departmentId))
  );
  const accList = allAccList.filter(
    (a) =>
      a.organizationId === organization.id &&
      (!filterDeptSet || a.departmentId === null || filterDeptSet.has(a.departmentId))
  );
  const visibleEmployees = empList
    .filter((e) => !filterDeptSet || (e.departmentId !== null && filterDeptSet.has(e.departmentId)))
    .map((e) => ({
      ...e,
      departmentName: e.departmentId ? (deptNameMap.get(e.departmentId) ?? '') : '',
    }));

  const linesByBom = new Map<string, typeof bomLinesList>();
  for (const l of bomLinesList) {
    const arr = linesByBom.get(l.bomSpecId) ?? [];
    arr.push(l);
    linesByBom.set(l.bomSpecId, arr);
  }

  const basCfg = await getBasSettings(db, organization.id);

  return {
    currentUser: authUser ?? null,
    organization,
    organizations: visibleOrgs,
    basSettings: basCfg,
    departments: deptScope.visibleDepartments,
    allDepartments: visibleAllDepts,
    activeDepartmentId: deptScope.activeDepartmentId,
    canSeeAllDepartments: deptScope.canSeeAllDepartments,
    warehouses: whList,
    allWarehouses: allWhList.filter((w) => visibleOrgIds.has(w.organizationId)),
    categories: catList,
    items: itemList,
    counterparties: cpList,
    contracts: ctrList,
    cashAccounts: accList,
    allCashAccounts: allAccList.filter((a) => visibleOrgIds.has(a.organizationId)),
    cashflowCategories: cfList,
    priceTypes: ptList,
    chartOfAccounts: coaList,
    employees: visibleEmployees,
    bomSpecs: bomList.map((b) => ({
      ...b,
      lines: linesByBom.get(b.id) ?? [],
    })),
    users: userList
      .filter((u) => u.login.trim().length > 0)
      .map((u) =>
        serializeUser(
          u,
          u.accessGroupId ? groupMap.get(u.accessGroupId) : null,
          u.departmentId ? deptObjMap.get(u.departmentId) : null
        )
      ),
  };
});

// ============================================================================
// ПІДРОЗДІЛИ (ФІЛІЇ / ВІДДІЛИ) ТА РОЗМЕЖУВАННЯ ВИДИМОСТІ
// ============================================================================

app.get('/api/departments', async (req: AuthedRequest) => {
  const orgId = await getOrgId(req);
  const query = z
    .object({
      scope: z.enum(['current', 'all']).optional().default('current'),
    })
    .parse(req.query);

  const authUser = req.authUser;
  const allowedOrgIds = authUser?.allowedOrgIds ?? [];
  const allowedDeptIds = authUser?.allowedDepartmentIds ?? [];

  const [allDepts, allOrgs, allEmps, allUsers, allDocs] = await Promise.all([
    db.select().from(departments).orderBy(asc(departments.createdAt)),
    db.select().from(organizations),
    db.select({ departmentId: employees.departmentId }).from(employees),
    db.select({ departmentId: appUsers.departmentId, login: appUsers.login }).from(appUsers),
    db.select({ departmentId: documents.departmentId }).from(documents),
  ]);

  const orgMap = new Map(allOrgs.map((o) => [o.id, o]));
  const validUsers = allUsers.filter((u) => u.login.trim().length > 0);

  return allDepts
    .filter((dp) => {
      if (query.scope === 'current' && dp.organizationId !== orgId) return false;
      if (allowedOrgIds.length > 0 && !allowedOrgIds.includes(dp.organizationId)) return false;
      if (allowedDeptIds.length > 0 && !allowedDeptIds.includes(dp.id)) return false;
      return true;
    })
    .map((dp) => ({
      ...dp,
      organizationName: orgMap.get(dp.organizationId)?.name ?? '',
      employeesCount: allEmps.filter((e) => e.departmentId === dp.id).length,
      usersCount: validUsers.filter((u) => u.departmentId === dp.id).length,
      documentsCount: allDocs.filter((d) => d.departmentId === dp.id).length,
    }));
});

app.post('/api/departments', async (req: AuthedRequest) => {
  const { role, userName, perms } = getRequestRole(req);
  if (!perms.canManageOrgs && !perms.canManageUsers) {
    throw new PostingError(
      'FORBIDDEN_ROLE',
      'У вас немає прав на створення підрозділів компанії'
    );
  }
  const body = z
    .object({
      organizationId: z.string().uuid().optional(),
      code: z.string().min(1).max(24).optional().default(''),
      name: z.string().min(2),
      description: z.string().optional().default(''),
      headName: z.string().optional().default(''),
      address: z.string().optional().default(''),
    })
    .parse(req.body);

  const orgId = await getOrgId(req, body.organizationId);
  const autoCode =
    body.code.trim().toUpperCase() ||
    `DEP-${String(Date.now()).slice(-3)}`;

  const [created] = await db
    .insert(departments)
    .values({
      organizationId: orgId,
      code: autoCode,
      name: body.name.trim(),
      description: body.description.trim(),
      headName: body.headName.trim(),
      address: body.address.trim(),
      isActive: true,
    })
    .returning();

  await recordAuditLog(db, {
    organizationId: orgId,
    userId: req.authUser?.id ?? '',
    userName,
    userRole: role,
    action: 'CREATE_DEPARTMENT',
    entityType: 'department',
    entityId: created.id,
    summary: `Створено підрозділ «${created.name}» (${created.code})`,
  });

  return created;
});

app.patch('/api/departments/:id', async (req: AuthedRequest, reply) => {
  const { role, userName, perms } = getRequestRole(req);
  if (!perms.canManageOrgs && !perms.canManageUsers) {
    throw new PostingError(
      'FORBIDDEN_ROLE',
      'У вас немає прав на редагування підрозділів компанії'
    );
  }
  const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
  const body = z
    .object({
      code: z.string().min(1).max(24).optional(),
      name: z.string().min(2).optional(),
      description: z.string().optional(),
      headName: z.string().optional(),
      address: z.string().optional(),
      isActive: z.boolean().optional(),
    })
    .parse(req.body);

  const [existing] = await db.select().from(departments).where(eq(departments.id, id));
  if (!existing) {
    return reply.status(404).send({ error: 'NOT_FOUND', message: 'Підрозділ не знайдено' });
  }

  const [updated] = await db
    .update(departments)
    .set({
      ...(body.code !== undefined ? { code: body.code.trim().toUpperCase() } : {}),
      ...(body.name !== undefined ? { name: body.name.trim() } : {}),
      ...(body.description !== undefined ? { description: body.description.trim() } : {}),
      ...(body.headName !== undefined ? { headName: body.headName.trim() } : {}),
      ...(body.address !== undefined ? { address: body.address.trim() } : {}),
      ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
    })
    .where(eq(departments.id, id))
    .returning();

  await recordAuditLog(db, {
    organizationId: existing.organizationId,
    userId: req.authUser?.id ?? '',
    userName,
    userRole: role,
    action: 'UPDATE_DEPARTMENT',
    entityType: 'department',
    entityId: id,
    summary: `Оновлено підрозділ «${updated.name}»`,
  });

  return updated;
});

app.delete('/api/departments/:id', async (req: AuthedRequest, reply) => {
  const { role, userName, perms } = getRequestRole(req);
  if (!perms.canManageOrgs && !perms.canManageUsers) {
    throw new PostingError(
      'FORBIDDEN_ROLE',
      'У вас немає прав на видалення підрозділів компанії'
    );
  }
  const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
  const [existing] = await db.select().from(departments).where(eq(departments.id, id));
  if (!existing) {
    return reply.status(404).send({ error: 'NOT_FOUND', message: 'Підрозділ не знайдено' });
  }

  const siblings = await db
    .select({ id: departments.id })
    .from(departments)
    .where(eq(departments.organizationId, existing.organizationId));
  if (siblings.length <= 1) {
    return reply.status(400).send({
      error: 'LAST_DEPARTMENT',
      message: 'Не можна видалити єдиний підрозділ організації.',
    });
  }

  await db.delete(departments).where(eq(departments.id, id));

  await recordAuditLog(db, {
    organizationId: existing.organizationId,
    userId: req.authUser?.id ?? '',
    userName,
    userRole: role,
    action: 'DELETE_DEPARTMENT',
    entityType: 'department',
    entityId: id,
    summary: `Видалено підрозділ «${existing.name}»`,
  });

  return { deleted: true };
});

// ============================================================================
// ОРГАНІЗАЦІЇ ТА ФОП (МУЛЬТИОРГАНІЗАЦІЙНІСТЬ)
// ============================================================================

app.get('/api/organizations', async () => {
  const [orgs, allDocs, allWh, allAcc] = await Promise.all([
    db.select().from(organizations).orderBy(asc(organizations.createdAt)),
    db.select({ organizationId: documents.organizationId, status: documents.status }).from(documents),
    db.select({ organizationId: warehouses.organizationId }).from(warehouses),
    db.select({ organizationId: cashAccounts.organizationId }).from(cashAccounts),
  ]);

  return orgs.map((org) => {
    const orgDocs = allDocs.filter((d) => d.organizationId === org.id);
    return {
      ...org,
      docsCount: orgDocs.length,
      postedDocsCount: orgDocs.filter((d) => d.status === 'POSTED').length,
      warehousesCount: allWh.filter((w) => w.organizationId === org.id).length,
      cashAccountsCount: allAcc.filter((a) => a.organizationId === org.id).length,
    };
  });
});

app.post('/api/organizations', async (req) => {
  const { role, userName } = getRequestRole(req);
  assertReqPerm(req, 'ORG_POLICY');

  const body = z
    .object({
      name: z.string().min(2),
      entityType: z.enum(['TOV', 'FOP']).default('FOP'),
      taxSystem: z
        .enum(['GENERAL_VAT', 'GENERAL_NO_VAT', 'EP_GROUP_2', 'EP_GROUP_3_5', 'EP_GROUP_3_3_VAT'])
        .default('EP_GROUP_3_5'),
      edrpou: z.string().optional().default(''),
      ipn: z.string().optional().default(''),
      iban: z.string().optional().default(''),
      bankName: z.string().optional().default(''),
      address: z.string().optional().default(''),
      directorName: z.string().optional().default(''),
      isVatPayer: z.boolean().optional(),
      vatRate: z.number().optional(),
      allowNegativeStock: z.boolean().optional().default(false),
    })
    .parse(req.body);

  const taxDef = taxSystemDefaults(body.taxSystem);
  const isVatPayer = body.isVatPayer ?? taxDef.isVatPayer;
  const vatRate = body.vatRate ?? taxDef.vatRate;

  const [created] = await db
    .insert(organizations)
    .values({
      name: body.name.trim(),
      entityType: body.entityType,
      taxSystem: body.taxSystem,
      edrpou: body.edrpou.trim(),
      ipn: body.ipn.trim() || (body.entityType === 'FOP' ? body.edrpou.trim() : ''),
      iban: body.iban.trim(),
      bankName: body.bankName.trim(),
      address: body.address.trim(),
      directorName: body.directorName.trim(),
      isVatPayer,
      vatRate,
      allowNegativeStock: body.allowNegativeStock,
      baseCurrency: 'UAH',
      costingMethod: 'FIFO',
    })
    .returning();

  await provisionOrganizationDefaults({
    organizationId: created.id,
    orgName: created.name,
    entityType: created.entityType,
    iban: created.iban,
    bankName: created.bankName,
    directorName: created.directorName,
  });

  await recordAuditLog(db, {
    organizationId: created.id,
    userName,
    userRole: role,
    action: 'CREATE_ORGANIZATION',
    entityType: 'organization',
    entityId: created.id,
    summary: `Створено організацію (${created.entityType === 'FOP' ? 'ФОП' : 'ТОВ'}): ${created.name}`,
  });

  return created;
});

app.patch('/api/organizations/:id', async (req) => {
  const { role, userName } = getRequestRole(req);
  assertReqPerm(req, 'ORG_POLICY');

  const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
  const body = z
    .object({
      name: z.string().min(1).optional(),
      entityType: z.enum(['TOV', 'FOP']).optional(),
      taxSystem: z
        .enum(['GENERAL_VAT', 'GENERAL_NO_VAT', 'EP_GROUP_2', 'EP_GROUP_3_5', 'EP_GROUP_3_3_VAT'])
        .optional(),
      edrpou: z.string().optional(),
      ipn: z.string().optional(),
      iban: z.string().optional(),
      bankName: z.string().optional(),
      address: z.string().optional(),
      directorName: z.string().optional(),
      isVatPayer: z.boolean().optional(),
      vatRate: z.number().optional(),
      allowNegativeStock: z.boolean().optional(),
      lockDate: z.string().nullable().optional(),
    })
    .parse(req.body);

  const taxDef = body.taxSystem ? taxSystemDefaults(body.taxSystem) : null;

  const [updated] = await db
    .update(organizations)
    .set({
      ...(body.name !== undefined ? { name: body.name.trim() } : {}),
      ...(body.entityType !== undefined ? { entityType: body.entityType } : {}),
      ...(body.taxSystem !== undefined ? { taxSystem: body.taxSystem } : {}),
      ...(body.edrpou !== undefined ? { edrpou: body.edrpou.trim() } : {}),
      ...(body.ipn !== undefined ? { ipn: body.ipn.trim() } : {}),
      ...(body.iban !== undefined ? { iban: body.iban.trim() } : {}),
      ...(body.bankName !== undefined ? { bankName: body.bankName.trim() } : {}),
      ...(body.address !== undefined ? { address: body.address.trim() } : {}),
      ...(body.directorName !== undefined ? { directorName: body.directorName.trim() } : {}),
      ...(body.isVatPayer !== undefined
        ? { isVatPayer: body.isVatPayer }
        : taxDef
          ? { isVatPayer: taxDef.isVatPayer }
          : {}),
      ...(body.vatRate !== undefined
        ? { vatRate: body.vatRate }
        : taxDef
          ? { vatRate: taxDef.vatRate }
          : {}),
      ...(body.allowNegativeStock !== undefined
        ? { allowNegativeStock: body.allowNegativeStock }
        : {}),
      ...(body.lockDate !== undefined
        ? { lockDate: body.lockDate ? new Date(body.lockDate) : null }
        : {}),
    })
    .where(eq(organizations.id, id))
    .returning();

  await recordAuditLog(db, {
    organizationId: id,
    userName,
    userRole: role,
    action: 'UPDATE_ORGANIZATION',
    entityType: 'organization',
    entityId: id,
    summary: `Оновлено реквізити організації ${updated.name}`,
  });

  return updated;
});

app.delete('/api/organizations/:id', async (req, reply) => {
  const { role } = getRequestRole(req);
  assertReqPerm(req, 'ORG_POLICY');

  const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
  const allOrgs = await db.select({ id: organizations.id }).from(organizations);
  if (allOrgs.length <= 1) {
    return reply.status(400).send({
      error: 'LAST_ORGANIZATION',
      message: 'Неможливо видалити єдину організацію в системі.',
    });
  }

  const orgDocs = await db
    .select({ id: documents.id })
    .from(documents)
    .where(eq(documents.organizationId, id))
    .limit(1);
  if (orgDocs.length > 0) {
    return reply.status(400).send({
      error: 'ORG_HAS_DOCUMENTS',
      message: 'Неможливо видалити організацію, у якій вже є документи. Спочатку видаліть документи цієї організації.',
    });
  }

  await db.delete(organizations).where(eq(organizations.id, id));
  return { deleted: true };
});

app.patch('/api/organization', async (req) => {
  const { role, userName } = getRequestRole(req);
  assertReqPerm(req, 'ORG_POLICY');

  const orgId = await getOrgId(req);
  const body = z
    .object({
      name: z.string().min(1).optional(),
      edrpou: z.string().optional(),
      isVatPayer: z.boolean().optional(),
      vatRate: z.number().optional(),
      allowNegativeStock: z.boolean().optional(),
      lockDate: z.string().nullable().optional(),
    })
    .parse(req.body);

  const [updated] = await db
    .update(organizations)
    .set({
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.edrpou !== undefined ? { edrpou: body.edrpou } : {}),
      ...(body.isVatPayer !== undefined ? { isVatPayer: body.isVatPayer } : {}),
      ...(body.vatRate !== undefined ? { vatRate: body.vatRate } : {}),
      ...(body.allowNegativeStock !== undefined
        ? { allowNegativeStock: body.allowNegativeStock }
        : {}),
      ...(body.lockDate !== undefined
        ? { lockDate: body.lockDate ? new Date(body.lockDate) : null }
        : {}),
    })
    .where(eq(organizations.id, orgId))
    .returning();

  await recordAuditLog(db, {
    organizationId: orgId,
    userName,
    userRole: role,
    action: 'UPDATE_ORG_POLICY',
    entityType: 'organization',
    entityId: orgId,
    summary: `Оновлено облікову політику організації (${updated.name})`,
  });

  return updated;
});

app.get('/api/audit-logs', async (req) => {
  const orgId = await getOrgId(req);
  return getAuditLogs(db, orgId, 50);
});

// ============================================================================
// ДОВІДНИКИ (CATALOGS) + КАДРИ + СПЕЦИФІКАЦІЇ BOM
// ============================================================================

app.post('/api/catalogs/categories', async (req) => {
  const body = z
    .object({
      name: z.string().min(1),
      parentId: z.string().uuid().nullable().optional(),
    })
    .parse(req.body);

  const [created] = await db
    .insert(categories)
    .values({ name: body.name.trim(), parentId: body.parentId ?? null })
    .returning();
  return created;
});

app.post('/api/catalogs/items', async (req) => {
  const body = z
    .object({
      sku: z.string().min(1),
      barcode: z.string().optional().default(''),
      name: z.string().min(1),
      categoryId: z.string().uuid().nullable().optional(),
      unit: z.string().default('шт'),
      itemType: z.enum(['GOODS', 'SERVICE']).default('GOODS'),
      isOrderOnly: z.boolean().optional().default(false),
    })
    .parse(req.body);

  const [created] = await db.insert(items).values(body).returning();
  return created;
});

app.post('/api/catalogs/counterparties', async (req) => {
  const body = z
    .object({
      name: z.string().min(1),
      edrpou: z.string().optional().default(''),
      ipn: z.string().optional().default(''),
      iban: z.string().optional().default(''),
      phone: z.string().optional().default(''),
      email: z.string().optional().default(''),
      isCustomer: z.boolean().default(true),
      isSupplier: z.boolean().default(false),
    })
    .parse(req.body);

  const [created] = await db.insert(counterparties).values(body).returning();
  return created;
});

app.post('/api/catalogs/warehouses', async (req) => {
  const orgId = await getOrgId(req);
  const deptScope = await resolveDepartmentScope(req, orgId);
  const body = z
    .object({
      code: z.string().min(1),
      name: z.string().min(1),
      type: z.enum(['WHOLESALE', 'RETAIL']).default('WHOLESALE'),
      departmentId: z.string().uuid().nullable().optional(),
    })
    .parse(req.body);

  const deptId = resolveAllowedDepartmentForWrite(
    deptScope,
    body.departmentId,
    (req as AuthedRequest).authUser
  );

  const [created] = await db
    .insert(warehouses)
    .values({ code: body.code, name: body.name, type: body.type, organizationId: orgId, departmentId: deptId })
    .returning();
  return created;
});

app.post('/api/catalogs/cash-accounts', async (req) => {
  const orgId = await getOrgId(req);
  const deptScope = await resolveDepartmentScope(req, orgId);
  const body = z
    .object({
      name: z.string().min(1),
      accountType: z.enum(['BANK', 'CASH']).default('BANK'),
      iban: z.string().optional().default(''),
      currency: z.string().default('UAH'),
      departmentId: z.string().uuid().nullable().optional(),
    })
    .parse(req.body);

  const deptId = resolveAllowedDepartmentForWrite(
    deptScope,
    body.departmentId,
    (req as AuthedRequest).authUser
  );

  const [created] = await db
    .insert(cashAccounts)
    .values({
      name: body.name,
      accountType: body.accountType,
      iban: body.iban,
      currency: body.currency,
      organizationId: orgId,
      departmentId: deptId,
    })
    .returning();
  return created;
});

app.post('/api/catalogs/employees', async (req) => {
  const orgId = await getOrgId(req);
  const deptScope = await resolveDepartmentScope(req, orgId);
  const body = z
    .object({
      fullName: z.string().min(1),
      rnokpp: z.string().optional().default(''),
      position: z.string().optional().default(''),
      department: z.enum(['ADMIN', 'SALES', 'PRODUCTION']).default('ADMIN'),
      departmentId: z.string().uuid().nullable().optional(),
      baseSalary: z.union([z.number(), z.string()]).default('25000.00'),
    })
    .parse(req.body);

  const deptId = resolveAllowedDepartmentForWrite(
    deptScope,
    body.departmentId,
    (req as AuthedRequest).authUser
  );

  const [created] = await db
    .insert(employees)
    .values({
      organizationId: orgId,
      departmentId: deptId,
      fullName: body.fullName,
      rnokpp: body.rnokpp,
      position: body.position,
      department: body.department,
      baseSalary: toNumeric2(body.baseSalary),
    })
    .returning();
  return created;
});

app.patch('/api/catalogs/employees/:id', async (req, reply) => {
  const orgId = await getOrgId(req);
  const deptScope = await resolveDepartmentScope(req, orgId);
  const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
  const body = z
    .object({
      fullName: z.string().min(1).optional(),
      rnokpp: z.string().optional(),
      position: z.string().optional(),
      department: z.enum(['ADMIN', 'SALES', 'PRODUCTION']).optional(),
      departmentId: z.string().uuid().nullable().optional(),
      baseSalary: z.union([z.number(), z.string()]).optional(),
      isActive: z.boolean().optional(),
    })
    .parse(req.body);

  const [existing] = await db.select().from(employees).where(eq(employees.id, id));
  if (!existing) {
    return reply.status(404).send({ error: 'NOT_FOUND', message: 'Співробітника не знайдено' });
  }

  const nextDeptId =
    body.departmentId !== undefined
      ? body.departmentId === null
        ? null
        : resolveAllowedDepartmentForWrite(
            deptScope,
            body.departmentId,
            (req as AuthedRequest).authUser
          )
      : undefined;

  const [updated] = await db
    .update(employees)
    .set({
      ...(body.fullName !== undefined ? { fullName: body.fullName.trim() } : {}),
      ...(body.rnokpp !== undefined ? { rnokpp: body.rnokpp.trim() } : {}),
      ...(body.position !== undefined ? { position: body.position.trim() } : {}),
      ...(body.department !== undefined ? { department: body.department } : {}),
      ...(nextDeptId !== undefined ? { departmentId: nextDeptId } : {}),
      ...(body.baseSalary !== undefined ? { baseSalary: toNumeric2(body.baseSalary) } : {}),
      ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
    })
    .where(eq(employees.id, id))
    .returning();

  return updated;
});

app.post('/api/catalogs/bom-specs', async (req) => {
  const orgId = await getOrgId(req);
  const body = z
    .object({
      code: z.string().min(1),
      name: z.string().min(1),
      outputItemId: z.string().uuid(),
      outputQty: z.union([z.number(), z.string()]).default(1),
      components: z
        .array(
          z.object({
            componentItemId: z.string().uuid(),
            qty: z.union([z.number(), z.string()]).default(1),
          })
        )
        .min(1),
    })
    .parse(req.body);

  const [spec] = await db
    .insert(bomSpecs)
    .values({
      organizationId: orgId,
      code: body.code,
      name: body.name,
      outputItemId: body.outputItemId,
      outputQty: toNumeric4(body.outputQty),
    })
    .returning();

  await db.insert(bomSpecLines).values(
    body.components.map((c, idx) => ({
      bomSpecId: spec.id,
      lineNo: idx + 1,
      componentItemId: c.componentItemId,
      qty: toNumeric4(c.qty),
    }))
  );

  return spec;
});

app.patch('/api/catalogs/items/:id', async (req, reply) => {
  const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
  const body = z
    .object({
      sku: z.string().min(1).optional(),
      barcode: z.string().optional(),
      name: z.string().min(1).optional(),
      categoryId: z.string().uuid().nullable().optional(),
      unit: z.string().optional(),
      itemType: z.enum(['GOODS', 'SERVICE']).optional(),
      isOrderOnly: z.boolean().optional(),
      isActive: z.boolean().optional(),
    })
    .parse(req.body);
  const [updated] = await db
    .update(items)
    .set({
      ...(body.sku !== undefined ? { sku: body.sku.trim() } : {}),
      ...(body.barcode !== undefined ? { barcode: body.barcode.trim() } : {}),
      ...(body.name !== undefined ? { name: body.name.trim() } : {}),
      ...(body.categoryId !== undefined ? { categoryId: body.categoryId } : {}),
      ...(body.unit !== undefined ? { unit: body.unit.trim() || 'шт' } : {}),
      ...(body.itemType !== undefined ? { itemType: body.itemType } : {}),
      ...(body.isOrderOnly !== undefined ? { isOrderOnly: body.isOrderOnly } : {}),
      ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
    })
    .where(eq(items.id, id))
    .returning();
  if (!updated) return reply.status(404).send({ error: 'NOT_FOUND', message: 'Номенклатуру не знайдено' });
  return updated;
});

app.patch('/api/catalogs/counterparties/:id', async (req, reply) => {
  const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
  const body = z
    .object({
      name: z.string().min(1).optional(),
      edrpou: z.string().optional(),
      ipn: z.string().optional(),
      iban: z.string().optional(),
      phone: z.string().optional(),
      email: z.string().optional(),
      isCustomer: z.boolean().optional(),
      isSupplier: z.boolean().optional(),
    })
    .parse(req.body);
  const [updated] = await db
    .update(counterparties)
    .set({
      ...(body.name !== undefined ? { name: body.name.trim() } : {}),
      ...(body.edrpou !== undefined ? { edrpou: body.edrpou.trim() } : {}),
      ...(body.ipn !== undefined ? { ipn: body.ipn.trim() } : {}),
      ...(body.iban !== undefined ? { iban: body.iban.trim() } : {}),
      ...(body.phone !== undefined ? { phone: body.phone.trim() } : {}),
      ...(body.email !== undefined ? { email: body.email.trim() } : {}),
      ...(body.isCustomer !== undefined ? { isCustomer: body.isCustomer } : {}),
      ...(body.isSupplier !== undefined ? { isSupplier: body.isSupplier } : {}),
    })
    .where(eq(counterparties.id, id))
    .returning();
  if (!updated) return reply.status(404).send({ error: 'NOT_FOUND', message: 'Контрагента не знайдено' });
  return updated;
});

app.post('/api/catalogs/contracts', async (req) => {
  const orgId = await getOrgId(req);
  const body = z
    .object({
      counterpartyId: z.string().uuid(),
      name: z.string().min(1),
      currency: z.string().default('UAH'),
      contractType: z.enum(['CUSTOMER', 'SUPPLIER']).default('CUSTOMER'),
    })
    .parse(req.body);
  const [created] = await db
    .insert(contracts)
    .values({ ...body, organizationId: orgId })
    .returning();
  return created;
});

app.post('/api/catalogs/cashflow-categories', async (req) => {
  const body = z
    .object({
      name: z.string().min(1),
      direction: z.enum(['IN', 'OUT']).default('OUT'),
      isOperatingExpense: z.boolean().default(false),
    })
    .parse(req.body);
  const [created] = await db
    .insert(cashflowCategories)
    .values({
      name: body.name.trim(),
      direction: body.direction,
      isOperatingExpense: body.isOperatingExpense,
    })
    .returning();
  return created;
});

app.post('/api/catalogs/price-types', async (req) => {
  const body = z
    .object({
      code: z.string().min(1),
      name: z.string().min(1),
      currency: z.string().default('UAH'),
    })
    .parse(req.body);
  const [created] = await db
    .insert(priceTypes)
    .values({
      code: body.code.trim().toUpperCase(),
      name: body.name.trim(),
      currency: body.currency.trim().toUpperCase(),
    })
    .returning();
  return created;
});

// ============================================================================
// ШАБЛОНИ ДРУКОВАНИХ ФОРМ (УКРАЇНСЬКІ БУХГАЛТЕРСЬКІ ВЗІРЦІ — РЕДАГУВАННЯ)
// ============================================================================

app.get('/api/print-templates', async (req) => {
  const orgId = await getOrgId(req);
  return getPrintTemplates(db, orgId);
});

app.put('/api/print-templates/:templateKey', async (req) => {
  const orgId = await getOrgId(req);
  const { templateKey } = z.object({ templateKey: z.string().min(1) }).parse(req.params);
  const body = z
    .object({
      docType: z.string().optional(),
      name: z.string().min(1).optional(),
      standardCode: z.string().optional(),
      titleText: z.string().min(1).optional(),
      subtitleText: z.string().optional(),
      headerNote: z.string().optional(),
      footerNote: z.string().optional(),
      signLeftLabel: z.string().optional(),
      signRightLabel: z.string().optional(),
      showDiscountColumn: z.boolean().optional(),
      showVatBlock: z.boolean().optional(),
      showIbanBlock: z.boolean().optional(),
      showStampArea: z.boolean().optional(),
      showSkuColumn: z.boolean().optional(),
    })
    .parse(req.body);

  return savePrintTemplate(db, {
    organizationId: orgId,
    templateKey,
    ...body,
  });
});

app.post('/api/print-templates/:templateKey/reset', async (req) => {
  const orgId = await getOrgId(req);
  const { templateKey } = z.object({ templateKey: z.string().min(1) }).parse(req.params);
  return resetPrintTemplate(db, orgId, templateKey);
});

// ============================================================================
// НАЛАШТУВАННЯ BAS МАЛИЙ БІЗНЕС (ФУНКЦІОНАЛЬНІ ОПЦІЇ, ПОЛЯ ДОКУМЕНТІВ, МЕНЮ)
// ============================================================================

app.get('/api/bas-settings', async (req) => {
  const orgId = await getOrgId(req);
  return getBasSettings(db, orgId);
});

app.put('/api/bas-settings', async (req) => {
  const { role, userName } = getRequestRole(req);
  const orgId = await getOrgId(req);
  const body = z
    .object({
      features: z.record(z.boolean()).optional(),
      docFields: z.record(z.any()).optional(),
      menuConfig: z
        .object({
          sections: z.record(z.any()).optional(),
          items: z.record(z.any()).optional(),
        })
        .optional(),
    })
    .parse(req.body);

  const updated = await saveBasSettings(db, orgId, body as Parameters<typeof saveBasSettings>[2]);

  await recordAuditLog(db, {
    organizationId: orgId,
    userName,
    userRole: role,
    action: 'UPDATE_BAS_SETTINGS',
    entityType: 'bas_settings',
    summary: 'Оновлено налаштування BAS Малий бізнес (опції, поля документів або меню)',
  });

  return updated;
});

app.post('/api/bas-settings/reset', async (req) => {
  const orgId = await getOrgId(req);
  const body = z
    .object({
      scope: z.enum(['all', 'features', 'docFields', 'menuConfig']).optional().default('all'),
    })
    .parse(req.body ?? {});
  return resetBasSettings(db, orgId, body.scope);
});

// ============================================================================
// ДОКУМЕНТИ (DOCUMENTS) + ДРУКОВАНІ ФОРМИ + ПДВ J1201015 + RBAC
// ============================================================================

const docLineSchema = z.object({
  lineRole: z.string().optional().default('ITEM'),
  itemId: z.string().uuid().nullable().optional(),
  employeeId: z.string().uuid().nullable().optional(),
  bookQty: z.union([z.number(), z.string()]).optional().default(0),
  qty: z.union([z.number(), z.string()]).optional().default(0),
  price: z.union([z.number(), z.string()]).optional().default(0),
  discountPercent: z.union([z.number(), z.string()]).optional().default(0),
  discountAmount: z.union([z.number(), z.string()]).optional().default(0),
  amount: z.union([z.number(), z.string()]).optional().default(0),
  debitAccountCode: z.string().optional().default(''),
  creditAccountCode: z.string().optional().default(''),
  warehouseId: z.string().uuid().nullable().optional(),
  counterpartyId: z.string().uuid().nullable().optional(),
  contractId: z.string().uuid().nullable().optional(),
  cashAccountId: z.string().uuid().nullable().optional(),
  notes: z.string().optional().default(''),
});

const docPayloadSchema = z.object({
  docType: z.enum([
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
  ]),
  organizationId: z.string().uuid().nullable().optional(),
  departmentId: z.string().uuid().nullable().optional(),
  docNumber: z.string().optional(),
  docDate: z.string(),
  parentDocId: z.string().uuid().nullable().optional(),
  bomSpecId: z.string().uuid().nullable().optional(),
  warehouseId: z.string().uuid().nullable().optional(),
  targetWarehouseId: z.string().uuid().nullable().optional(),
  counterpartyId: z.string().uuid().nullable().optional(),
  contractId: z.string().uuid().nullable().optional(),
  cashAccountId: z.string().uuid().nullable().optional(),
  cashflowCategoryId: z.string().uuid().nullable().optional(),
  priceTypeId: z.string().uuid().nullable().optional(),
  vatRate: z.number().optional().default(20),
  totalAmount: z.union([z.number(), z.string()]).optional(),
  comment: z.string().optional().default(''),
  meta: z.record(z.unknown()).optional(),
  lines: z.array(docLineSchema).optional().default([]),
  autoPost: z.boolean().optional().default(false),
});

app.get('/api/documents', async (req) => {
  const orgId = await getOrgId(req);
  const deptScope = await resolveDepartmentScope(req, orgId);
  const { perms } = getRequestRole(req);
  const authUser = (req as AuthedRequest).authUser;
  const allowedOrgIds = authUser?.allowedOrgIds ?? [];
  const allowedDeptIdsAll = authUser?.allowedDepartmentIds ?? [];

  const query = z
    .object({
      docType: z.string().optional(),
      status: z.string().optional(),
      scope: z.enum(['current', 'all']).optional().default('current'),
    })
    .parse(req.query);

  const conds = [];
  if (query.scope !== 'all') {
    conds.push(eq(documents.organizationId, orgId));
  }
  if (query.docType) {
    conds.push(eq(documents.docType, query.docType as DocumentType));
  }
  if (query.status) {
    conds.push(eq(documents.status, query.status as 'DRAFT' | 'POSTED' | 'CANCELLED'));
  }

  const [rawDocList, orgList, deptList, whList, cpList, accList, ptList, cfList] = await Promise.all([
    conds.length > 0
      ? db
          .select()
          .from(documents)
          .where(and(...conds))
          .orderBy(desc(documents.docDate), desc(documents.createdAt))
      : db.select().from(documents).orderBy(desc(documents.docDate), desc(documents.createdAt)),
    db.select().from(organizations),
    db.select().from(departments),
    db.select().from(warehouses),
    db.select().from(counterparties),
    db.select().from(cashAccounts),
    db.select().from(priceTypes),
    db.select().from(cashflowCategories),
  ]);

  const filterDeptSet = deptScope.filterDeptIds ? new Set(deptScope.filterDeptIds) : null;
  const docList = rawDocList.filter((doc) => {
    if (allowedOrgIds.length > 0 && !allowedOrgIds.includes(doc.organizationId)) return false;
    if (!canViewDocType(perms, doc.docType)) return false;
    if (query.scope === 'all') {
      if (allowedDeptIdsAll.length > 0) {
        if (!doc.departmentId || !allowedDeptIdsAll.includes(doc.departmentId)) return false;
      }
    } else if (filterDeptSet) {
      if (!doc.departmentId || !filterDeptSet.has(doc.departmentId)) return false;
    }
    return true;
  });

  const orgMap = new Map(orgList.map((x) => [x.id, x]));
  const deptMap = new Map(deptList.map((x) => [x.id, x.name]));
  const whMap = new Map(whList.map((x) => [x.id, x.name]));
  const cpMap = new Map(cpList.map((x) => [x.id, x.name]));
  const accMap = new Map(accList.map((x) => [x.id, x.name]));
  const ptMap = new Map(ptList.map((x) => [x.id, x.name]));
  const cfMap = new Map(cfList.map((x) => [x.id, x.name]));
  const docNumMap = new Map(docList.map((x) => [x.id, x.docNumber]));

  return docList.map((doc) => {
    const org = orgMap.get(doc.organizationId);
    return {
      ...doc,
      meta: parseDocumentMeta(doc.metaJson),
      organizationName: org?.name ?? '',
      organizationEntityType: org?.entityType ?? 'TOV',
      departmentName: doc.departmentId ? (deptMap.get(doc.departmentId) ?? '') : '',
      parentDocNumber: doc.parentDocId ? (docNumMap.get(doc.parentDocId) ?? '') : '',
      warehouseName: doc.warehouseId ? (whMap.get(doc.warehouseId) ?? '') : '',
      targetWarehouseName: doc.targetWarehouseId ? (whMap.get(doc.targetWarehouseId) ?? '') : '',
      counterpartyName: doc.counterpartyId ? (cpMap.get(doc.counterpartyId) ?? '') : '',
      cashAccountName: doc.cashAccountId ? (accMap.get(doc.cashAccountId) ?? '') : '',
      priceTypeName: doc.priceTypeId ? (ptMap.get(doc.priceTypeId) ?? '') : '',
      cashflowCategoryName: doc.cashflowCategoryId ? (cfMap.get(doc.cashflowCategoryId) ?? '') : '',
    };
  });
});

app.get('/api/orders/active', async (req) => {
  const orgId = await getOrgId(req);
  return getActiveCustomerOrders(db, orgId);
});

app.get('/api/inventory/book-balances', async (req) => {
  const orgId = await getOrgId(req);
  const query = z
    .object({
      warehouseId: z.string().uuid(),
      asOfDate: z.string().optional(),
    })
    .parse(req.query);

  const stock = await getStockBalances(db, {
    organizationId: orgId,
    warehouseId: query.warehouseId,
    asOfDate: query.asOfDate ?? new Date().toISOString(),
  });

  return stock.rows.map((r) => ({
    itemId: r.itemId,
    itemSku: r.itemSku,
    itemName: r.itemName,
    bookQty: r.qty,
    qty: r.qty,
    price: r.avgCost,
  }));
});

app.get('/api/documents/:id', async (req, reply) => {
  const { perms } = getRequestRole(req);
  const authUser = (req as AuthedRequest).authUser;
  const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
  const [doc] = await db.select().from(documents).where(eq(documents.id, id));
  if (!doc) return reply.status(404).send({ error: 'NOT_FOUND', message: 'Документ не знайдено' });

  if (
    authUser &&
    authUser.allowedOrgIds.length > 0 &&
    !authUser.allowedOrgIds.includes(doc.organizationId)
  ) {
    return reply.status(403).send({
      error: 'FORBIDDEN_ROLE',
      message: 'У вас немає доступу до документів цієї організації',
    });
  }
  if (
    authUser &&
    authUser.allowedDepartmentIds.length > 0 &&
    (!doc.departmentId || !authUser.allowedDepartmentIds.includes(doc.departmentId))
  ) {
    return reply.status(403).send({
      error: 'FORBIDDEN_ROLE',
      message: 'У вас немає доступу до документів цього підрозділу',
    });
  }
  if (!canViewDocType(perms, doc.docType)) {
    return reply.status(403).send({
      error: 'FORBIDDEN_ROLE',
      message: 'У вас немає прав для перегляду цього типу документа',
    });
  }

  const lines = await db
    .select()
    .from(documentLines)
    .where(eq(documentLines.documentId, id))
    .orderBy(asc(documentLines.lineNo));

  return { ...doc, meta: parseDocumentMeta(doc.metaJson), lines };
});

app.get('/api/documents/:id/print', async (req) => {
  const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
  return getPrintableDocumentData(db, id);
});

app.post('/api/documents/:id/share', async (req, reply) => {
  const { role, userName } = getRequestRole(req);
  const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
  const [doc] = await db.select().from(documents).where(eq(documents.id, id));
  if (!doc) {
    return reply.status(404).send({ error: 'NOT_FOUND', message: 'Документ не знайдено' });
  }

  let token = doc.shareToken;
  if (!token) {
    token = randomBytes(12).toString('base64url');
    await db
      .update(documents)
      .set({ shareToken: token, updatedAt: new Date() })
      .where(eq(documents.id, id));

    await recordAuditLog(db, {
      organizationId: doc.organizationId,
      userName,
      userRole: role,
      action: 'SHARE_DOC',
      entityType: doc.docType,
      entityId: id,
      summary: `Створено відкрите онлайн-посилання на документ №${doc.docNumber}`,
    });
  }

  const [[org], cpRows] = await Promise.all([
    db.select().from(organizations).where(eq(organizations.id, doc.organizationId)),
    doc.counterpartyId
      ? db.select().from(counterparties).where(eq(counterparties.id, doc.counterpartyId))
      : Promise.resolve([]),
  ]);

  return {
    shareToken: token,
    documentId: doc.id,
    docType: doc.docType,
    docNumber: doc.docNumber,
    docDate: doc.docDate,
    totalAmount: doc.totalAmount,
    status: doc.status,
    organizationName: org?.name ?? '',
    counterpartyName: cpRows[0]?.name ?? '',
    counterpartyPhone: cpRows[0]?.phone ?? '',
  };
});

app.post('/api/documents/:id/share/regenerate', async (req, reply) => {
  const { role, userName } = getRequestRole(req);
  const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
  const [doc] = await db.select().from(documents).where(eq(documents.id, id));
  if (!doc) {
    return reply.status(404).send({ error: 'NOT_FOUND', message: 'Документ не знайдено' });
  }

  const token = randomBytes(12).toString('base64url');
  await db
    .update(documents)
    .set({ shareToken: token, updatedAt: new Date() })
    .where(eq(documents.id, id));

  await recordAuditLog(db, {
    organizationId: doc.organizationId,
    userName,
    userRole: role,
    action: 'REGENERATE_SHARE_DOC',
    entityType: doc.docType,
    entityId: id,
    summary: `Оновлено відкрите онлайн-посилання на документ №${doc.docNumber} (попереднє анульовано)`,
  });

  return { shareToken: token };
});

app.get('/api/public/documents/:token', async (req, reply) => {
  const { token } = z.object({ token: z.string().min(8).max(64) }).parse(req.params);
  const [doc] = await db.select().from(documents).where(eq(documents.shareToken, token)).limit(1);
  if (!doc) {
    return reply.status(404).send({
      error: 'NOT_FOUND',
      message: 'Документ не знайдено або посилання було анульовано',
    });
  }
  return getPrintableDocumentData(db, doc.id);
});

app.get('/api/documents/:id/tax-xml', async (req) => {
  const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
  return generateTaxInvoiceXmlJ1201015(db, id);
});

app.post('/api/documents', async (req) => {
  const { role, userName } = getRequestRole(req);
  const body = docPayloadSchema.parse(req.body);
  const orgId = await getOrgId(req, body.organizationId);
  const deptScope = await resolveDepartmentScope(req, orgId);
  const deptId = resolveAllowedDepartmentForWrite(
    deptScope,
    body.departmentId,
    (req as AuthedRequest).authUser
  );

  assertReqPerm(req, 'DOC_WRITE', body.docType);
  if (body.autoPost) {
    assertReqPerm(req, 'DOC_POST', body.docType);
  }

  const normalizedLines = body.lines.map((l, idx) => {
    const qty = d(l.qty);
    const bookQty = d(l.bookQty);
    const price = d(l.price);
    const grossLine = qty.mul(price);
    const discPctNum = Math.min(100, Math.max(0, Number(l.discountPercent ?? 0) || 0));
    const discPct = d(discPctNum);
    const discAmt = discPct.gt(0)
      ? grossLine.mul(discPct).div(100)
      : d(l.discountAmount ?? 0).gt(0)
        ? d(l.discountAmount ?? 0)
        : d(0);
    const computedLineAmt = grossLine.minus(discAmt);
    const amount =
      discAmt.gt(0)
        ? computedLineAmt.lt(0)
          ? d(0)
          : computedLineAmt
        : d(l.amount).gt(0)
          ? d(l.amount)
          : grossLine;
    return {
      lineNo: idx + 1,
      lineRole: l.lineRole ?? 'ITEM',
      itemId: l.itemId ?? null,
      employeeId: l.employeeId ?? null,
      bookQty: toNumeric4(bookQty),
      qty: toNumeric4(qty),
      diffQty: toNumeric4(qty.minus(bookQty)),
      price: toNumeric2(price),
      discountPercent: toNumeric2(discPct),
      discountAmount: toNumeric2(discAmt),
      amount: toNumeric2(amount),
      debitAccountCode: l.debitAccountCode ?? '',
      creditAccountCode: l.creditAccountCode ?? '',
      warehouseId: l.warehouseId ?? null,
      counterpartyId: l.counterpartyId ?? null,
      contractId: l.contractId ?? null,
      cashAccountId: l.cashAccountId ?? null,
      notes: l.notes ?? '',
    };
  });

  const computedDiscountTotal = toNumeric2(
    normalizedLines.reduce((acc, l) => acc.plus(d(l.discountAmount)), d(0))
  );
  const computedTotal =
    body.totalAmount !== undefined
      ? toNumeric2(body.totalAmount)
      : toNumeric2(normalizedLines.reduce((acc, l) => acc.plus(d(l.amount)), d(0)));

  const [created] = await db
    .insert(documents)
    .values({
      organizationId: orgId,
      departmentId: deptId,
      docType: body.docType,
      docNumber: body.docNumber?.trim() || generateDocNumber(body.docType),
      docDate: new Date(body.docDate),
      status: 'DRAFT',
      parentDocId: body.parentDocId ?? null,
      bomSpecId: body.bomSpecId ?? null,
      warehouseId: body.warehouseId ?? null,
      targetWarehouseId: body.targetWarehouseId ?? null,
      counterpartyId: body.counterpartyId ?? null,
      contractId: body.contractId ?? null,
      cashAccountId: body.cashAccountId ?? null,
      cashflowCategoryId: body.cashflowCategoryId ?? null,
      priceTypeId: body.priceTypeId ?? null,
      vatRate: body.vatRate ?? 20,
      discountTotal: computedDiscountTotal,
      totalAmount: computedTotal,
      comment: body.comment,
      metaJson: JSON.stringify(body.meta ?? {}),
    })
    .returning();

  if (normalizedLines.length > 0) {
    await db
      .insert(documentLines)
      .values(normalizedLines.map((l) => ({ ...l, documentId: created.id })));
  }

  if (body.autoPost) {
    await postDocument(db, created.id);
  }

  await recordAuditLog(db, {
    organizationId: orgId,
    userName,
    userRole: role,
    action: body.autoPost ? 'CREATE_AND_POST_DOC' : 'CREATE_DOC',
    entityType: body.docType,
    entityId: created.id,
    summary: `Створено ${body.autoPost ? 'і проведено ' : ''}документ ${created.docNumber} (${body.docType})`,
  });

  const [finalDoc] = await db.select().from(documents).where(eq(documents.id, created.id));
  const finalLines = await db
    .select()
    .from(documentLines)
    .where(eq(documentLines.documentId, created.id))
    .orderBy(asc(documentLines.lineNo));

  return { ...finalDoc, lines: finalLines };
});

app.post('/api/documents/:id/create-invoice-from-order', async (req, reply) => {
  const { role, userName } = getRequestRole(req);
  assertReqPerm(req, 'DOC_POST', 'sales_invoice');

  const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
  const body = z
    .object({
      autoPost: z.boolean().optional().default(true),
    })
    .parse(req.body ?? {});

  const [order] = await db.select().from(documents).where(eq(documents.id, id));
  if (!order || order.docType !== 'customer_order') {
    return reply.status(400).send({
      error: 'INVALID_ORDER',
      message: 'Документ не є замовленням покупця',
    });
  }

  const orderLines = await db
    .select()
    .from(documentLines)
    .where(eq(documentLines.documentId, order.id))
    .orderBy(asc(documentLines.lineNo));

  const [invoice] = await db
    .insert(documents)
    .values({
      organizationId: order.organizationId,
      departmentId: order.departmentId,
      docType: 'sales_invoice',
      docNumber: generateDocNumber('sales_invoice'),
      docDate: new Date(),
      status: 'DRAFT',
      parentDocId: order.id,
      warehouseId: order.warehouseId,
      counterpartyId: order.counterpartyId,
      contractId: order.contractId,
      priceTypeId: order.priceTypeId,
      discountTotal: order.discountTotal,
      totalAmount: order.totalAmount,
      comment: `Відвантаження на підставі замовлення №${order.docNumber}`,
      metaJson: order.metaJson || '{}',
    })
    .returning();

  if (orderLines.length > 0) {
    await db.insert(documentLines).values(
      orderLines.map((l, idx) => ({
        documentId: invoice.id,
        lineNo: idx + 1,
        itemId: l.itemId,
        qty: l.qty,
        price: l.price,
        discountPercent: l.discountPercent,
        discountAmount: l.discountAmount,
        amount: l.amount,
      }))
    );
  }

  if (body.autoPost) {
    await postDocument(db, invoice.id);
  }

  await recordAuditLog(db, {
    organizationId: order.organizationId,
    userName,
    userRole: role,
    action: 'FULFILL_ORDER',
    entityType: 'sales_invoice',
    entityId: invoice.id,
    summary: `Відвантажено накладну ${invoice.docNumber} за замовленням ${order.docNumber}`,
  });

  const [finalInvoice] = await db.select().from(documents).where(eq(documents.id, invoice.id));
  return finalInvoice;
});

// 1-клік створення Податкової накладної ПДВ (ЄРПН) на підставі Видаткової або Оплати
app.post('/api/documents/:id/create-tax-invoice', async (req, reply) => {
  const { role, userName } = getRequestRole(req);
  assertReqPerm(req, 'DOC_POST', 'tax_invoice');

  const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
  const [sourceDoc] = await db.select().from(documents).where(eq(documents.id, id));
  if (!sourceDoc) {
    return reply.status(404).send({ error: 'NOT_FOUND', message: 'Документ-підставу не знайдено' });
  }

  const srcLines = await db
    .select()
    .from(documentLines)
    .where(eq(documentLines.documentId, sourceDoc.id))
    .orderBy(asc(documentLines.lineNo));

  const [taxDoc] = await db
    .insert(documents)
    .values({
      organizationId: sourceDoc.organizationId,
      departmentId: sourceDoc.departmentId,
      docType: 'tax_invoice',
      docNumber: generateDocNumber('tax_invoice'),
      docDate: new Date(),
      status: 'DRAFT',
      parentDocId: sourceDoc.id,
      counterpartyId: sourceDoc.counterpartyId,
      contractId: sourceDoc.contractId,
      vatRate: sourceDoc.vatRate ?? 20,
      discountTotal: sourceDoc.discountTotal,
      totalAmount: sourceDoc.totalAmount,
      comment: `Податкова накладна до документа №${sourceDoc.docNumber}`,
    })
    .returning();

  if (srcLines.length > 0) {
    await db.insert(documentLines).values(
      srcLines.map((l, idx) => ({
        documentId: taxDoc.id,
        lineNo: idx + 1,
        itemId: l.itemId,
        qty: l.qty,
        price: l.price,
        discountPercent: l.discountPercent,
        discountAmount: l.discountAmount,
        amount: l.amount,
      }))
    );
  }

  await postDocument(db, taxDoc.id);

  await recordAuditLog(db, {
    organizationId: sourceDoc.organizationId,
    userName,
    userRole: role,
    action: 'CREATE_TAX_INVOICE',
    entityType: 'tax_invoice',
    entityId: taxDoc.id,
    summary: `Сформовано Податкову накладну ${taxDoc.docNumber} до ${sourceDoc.docNumber}`,
  });

  const [finalTaxDoc] = await db.select().from(documents).where(eq(documents.id, taxDoc.id));
  return finalTaxDoc;
});

app.put('/api/documents/:id', async (req, reply) => {
  const { role, userName } = getRequestRole(req);
  const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
  const body = docPayloadSchema.parse(req.body);

  assertReqPerm(req, 'DOC_WRITE', body.docType);

  const [existing] = await db.select().from(documents).where(eq(documents.id, id));
  if (!existing) return reply.status(404).send({ error: 'NOT_FOUND', message: 'Документ не знайдено' });

  const deptScope = await resolveDepartmentScope(req, existing.organizationId);
  const nextDeptId =
    body.departmentId !== undefined
      ? resolveAllowedDepartmentForWrite(
          deptScope,
          body.departmentId,
          (req as AuthedRequest).authUser
        )
      : existing.departmentId;

  const wasPosted = existing.status === 'POSTED';
  if (wasPosted) {
    await unpostDocument(db, id);
  }

  const normalizedLines = body.lines.map((l, idx) => {
    const qty = d(l.qty);
    const bookQty = d(l.bookQty);
    const price = d(l.price);
    const grossLine = qty.mul(price);
    const discPctNum = Math.min(100, Math.max(0, Number(l.discountPercent ?? 0) || 0));
    const discPct = d(discPctNum);
    const discAmt = discPct.gt(0)
      ? grossLine.mul(discPct).div(100)
      : d(l.discountAmount ?? 0).gt(0)
        ? d(l.discountAmount ?? 0)
        : d(0);
    const computedLineAmt = grossLine.minus(discAmt);
    const amount =
      discAmt.gt(0)
        ? computedLineAmt.lt(0)
          ? d(0)
          : computedLineAmt
        : d(l.amount).gt(0)
          ? d(l.amount)
          : grossLine;
    return {
      documentId: id,
      lineNo: idx + 1,
      lineRole: l.lineRole ?? 'ITEM',
      itemId: l.itemId ?? null,
      employeeId: l.employeeId ?? null,
      bookQty: toNumeric4(bookQty),
      qty: toNumeric4(qty),
      diffQty: toNumeric4(qty.minus(bookQty)),
      price: toNumeric2(price),
      discountPercent: toNumeric2(discPct),
      discountAmount: toNumeric2(discAmt),
      amount: toNumeric2(amount),
      debitAccountCode: l.debitAccountCode ?? '',
      creditAccountCode: l.creditAccountCode ?? '',
      warehouseId: l.warehouseId ?? null,
      counterpartyId: l.counterpartyId ?? null,
      contractId: l.contractId ?? null,
      cashAccountId: l.cashAccountId ?? null,
      notes: l.notes ?? '',
    };
  });

  const computedDiscountTotal = toNumeric2(
    normalizedLines.reduce((acc, l) => acc.plus(d(l.discountAmount)), d(0))
  );
  const computedTotal =
    body.totalAmount !== undefined
      ? toNumeric2(body.totalAmount)
      : toNumeric2(normalizedLines.reduce((acc, l) => acc.plus(d(l.amount)), d(0)));

  await db
    .update(documents)
    .set({
      departmentId: nextDeptId,
      docNumber: body.docNumber?.trim() || existing.docNumber,
      docDate: new Date(body.docDate),
      parentDocId: body.parentDocId ?? null,
      bomSpecId: body.bomSpecId ?? null,
      warehouseId: body.warehouseId ?? null,
      targetWarehouseId: body.targetWarehouseId ?? null,
      counterpartyId: body.counterpartyId ?? null,
      contractId: body.contractId ?? null,
      cashAccountId: body.cashAccountId ?? null,
      cashflowCategoryId: body.cashflowCategoryId ?? null,
      priceTypeId: body.priceTypeId ?? null,
      vatRate: body.vatRate ?? existing.vatRate,
      discountTotal: computedDiscountTotal,
      totalAmount: computedTotal,
      comment: body.comment,
      ...(body.meta !== undefined ? { metaJson: JSON.stringify(body.meta) } : {}),
      updatedAt: new Date(),
    })
    .where(eq(documents.id, id));

  await db.delete(documentLines).where(eq(documentLines.documentId, id));
  if (normalizedLines.length > 0) {
    await db.insert(documentLines).values(normalizedLines);
  }

  if (body.autoPost || wasPosted) {
    await postDocument(db, id);
  }

  await recordAuditLog(db, {
    organizationId: existing.organizationId,
    userName,
    userRole: role,
    action: 'UPDATE_DOC',
    entityType: existing.docType,
    entityId: id,
    summary: `Оновлено документ ${existing.docNumber}`,
  });

  const [finalDoc] = await db.select().from(documents).where(eq(documents.id, id));
  const finalLines = await db
    .select()
    .from(documentLines)
    .where(eq(documentLines.documentId, id))
    .orderBy(asc(documentLines.lineNo));

  return { ...finalDoc, lines: finalLines };
});

app.delete('/api/documents/:id', async (req) => {
  const { role, userName } = getRequestRole(req);
  const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
  const [existing] = await db.select().from(documents).where(eq(documents.id, id));
  if (existing) {
    assertReqPerm(req, 'DOC_WRITE', existing.docType);
    if (existing.status === 'POSTED') {
      await unpostDocument(db, id);
    }
    await db.delete(documents).where(eq(documents.id, id));
    await recordAuditLog(db, {
      organizationId: existing.organizationId,
      userName,
      userRole: role,
      action: 'DELETE_DOC',
      entityType: existing.docType,
      entityId: id,
      summary: `Видалено документ ${existing.docNumber}`,
    });
  }
  return { deleted: true };
});

app.post('/api/documents/:id/post', async (req) => {
  const { role, userName } = getRequestRole(req);
  const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
  const [existing] = await db.select().from(documents).where(eq(documents.id, id));
  if (existing) {
    assertReqPerm(req, 'DOC_POST', existing.docType);
  }
  await postDocument(db, id);
  const [doc] = await db.select().from(documents).where(eq(documents.id, id));
  if (doc) {
    await recordAuditLog(db, {
      organizationId: doc.organizationId,
      userName,
      userRole: role,
      action: 'POST_DOC',
      entityType: doc.docType,
      entityId: id,
      summary: `Проведено документ ${doc.docNumber}`,
    });
  }
  return doc;
});

app.post('/api/documents/:id/unpost', async (req) => {
  const { role, userName } = getRequestRole(req);
  const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
  const [existing] = await db.select().from(documents).where(eq(documents.id, id));
  if (existing) {
    assertReqPerm(req, 'DOC_POST', existing.docType);
  }
  await unpostDocument(db, id);
  const [doc] = await db.select().from(documents).where(eq(documents.id, id));
  if (doc) {
    await recordAuditLog(db, {
      organizationId: doc.organizationId,
      userName,
      userRole: role,
      action: 'UNPOST_DOC',
      entityType: doc.docType,
      entityId: id,
      summary: `Скасовано проведення документа ${doc.docNumber}`,
    });
  }
  return doc;
});

app.get('/api/documents/:id/movements', async (req) => {
  const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
  return getDocumentMovements(db, id);
});

// ============================================================================
// ЗВ'ЯЗКИ ДОКУМЕНТА (ПІДПОРЯДКОВАНІСТЬ), ІСТОРІЯ ТА «СТВОРИТИ НА ПІДСТАВІ»
// ============================================================================

app.get('/api/documents/:id/relations-and-history', async (req, reply) => {
  const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
  const [doc] = await db.select().from(documents).where(eq(documents.id, id));
  if (!doc) return reply.status(404).send({ error: 'NOT_FOUND', message: 'Документ не знайдено' });

  const [allDocs, allCps, docAuditLogs] = await Promise.all([
    db
      .select()
      .from(documents)
      .where(eq(documents.organizationId, doc.organizationId))
      .orderBy(desc(documents.docDate)),
    db.select().from(counterparties),
    db
      .select()
      .from(auditLogs)
      .where(and(eq(auditLogs.organizationId, doc.organizationId), eq(auditLogs.entityId, id)))
      .orderBy(desc(auditLogs.createdAt)),
  ]);

  const cpMap = new Map(allCps.map((c) => [c.id, c.name]));
  const hydrate = (dRow: typeof doc) => ({
    id: dRow.id,
    docType: dRow.docType,
    docNumber: dRow.docNumber,
    docDate: dRow.docDate,
    status: dRow.status,
    totalAmount: dRow.totalAmount,
    counterpartyName: dRow.counterpartyId ? (cpMap.get(dRow.counterpartyId) ?? '') : '',
    comment: dRow.comment,
  });

  const parent = doc.parentDocId
    ? allDocs.find((x) => x.id === doc.parentDocId) ?? null
    : null;
  const children = allDocs.filter((x) => x.parentDocId === doc.id);
  const siblings = doc.parentDocId
    ? allDocs.filter((x) => x.parentDocId === doc.parentDocId && x.id !== doc.id)
    : [];

  // Синтезуємо повний таймлайн історії документа
  const history: Array<{
    id: string;
    at: string;
    actor: string;
    role: string;
    action: string;
    summary: string;
  }> = [
    ...docAuditLogs.map((l) => ({
      id: l.id,
      at: l.createdAt.toISOString(),
      actor: l.userName,
      role: l.userRole,
      action: l.action,
      summary: l.summary,
    })),
  ];

  // Якщо базових записів аудиту ще немає (наприклад, для демо-документів), додаємо системні події створення/проведення
  if (!history.some((h) => h.action.includes('CREATE'))) {
    history.push({
      id: `${doc.id}-created`,
      at: doc.createdAt.toISOString(),
      actor: 'Система',
      role: 'SYSTEM',
      action: 'CREATED',
      summary: `Створено документ №${doc.docNumber} на суму ${doc.totalAmount} ₴`,
    });
  }
  if (doc.postedAt && !history.some((h) => h.action.includes('POST'))) {
    history.push({
      id: `${doc.id}-posted`,
      at: doc.postedAt.toISOString(),
      actor: 'Posting Engine',
      role: 'SYSTEM',
      action: 'POSTED',
      summary: `Документ проведено по регістрах обліку та Головній книзі Дт/Кт`,
    });
  }
  if (doc.fiscalCode) {
    history.push({
      id: `${doc.id}-fiscal`,
      at: doc.updatedAt.toISOString(),
      actor: 'Checkbox ПРРО',
      role: 'SYSTEM',
      action: 'FISCALIZED',
      summary: `Фіскалізовано чек ДПС №${doc.fiscalCode}`,
    });
  }

  history.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  // Доступні швидкі дії «Створити на підставі» залежно від типу документа
  const nextActionsByType: Record<string, Array<{ targetType: DocumentType; label: string }>> = {
    customer_order: [
      { targetType: 'sales_invoice', label: 'Видаткова накладна (відвантаження + зняття резерву)' },
      { targetType: 'money_in', label: 'Надходження коштів (оплата / передплата)' },
      { targetType: 'tax_invoice', label: 'Податкова накладна (ПДВ)' },
    ],
    sales_invoice: [
      { targetType: 'money_in', label: 'Надходження коштів (оплата від покупця)' },
      { targetType: 'tax_invoice', label: 'Податкова накладна (ПДВ / ЄРПН)' },
      { targetType: 'stock_transfer', label: 'Переміщення товарів' },
    ],
    goods_receipt: [
      { targetType: 'money_out', label: 'Списання коштів (оплата постачальнику)' },
      { targetType: 'stock_transfer', label: 'Переміщення на інший склад' },
      { targetType: 'price_setting', label: 'Встановлення цін на основі приходу' },
    ],
    money_in: [
      { targetType: 'tax_invoice', label: 'Податкова накладна ПДВ (перша подія)' },
      { targetType: 'sales_invoice', label: 'Видаткова накладна (відвантаження під оплату)' },
    ],
    production_order: [
      { targetType: 'sales_invoice', label: 'Видаткова накладна (продаж готової продукції)' },
      { targetType: 'stock_transfer', label: 'Переміщення готової продукції' },
    ],
  };

  return {
    current: hydrate(doc),
    parent: parent ? hydrate(parent) : null,
    children: children.map(hydrate),
    siblings: siblings.map(hydrate),
    history,
    availableNextActions: nextActionsByType[doc.docType] ?? [
      { targetType: 'sales_invoice', label: 'Видаткова накладна' },
      { targetType: 'money_in', label: 'Надходження коштів' },
      { targetType: 'money_out', label: 'Списання коштів' },
    ],
    linkableDocuments: allDocs
      .filter((x) => x.id !== doc.id)
      .slice(0, 60)
      .map(hydrate),
  };
});

app.patch('/api/documents/:id/link-parent', async (req, reply) => {
  const { role, userName } = getRequestRole(req);
  const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
  const { parentDocId } = z
    .object({ parentDocId: z.string().uuid().nullable() })
    .parse(req.body);

  if (parentDocId === id) {
    return reply.status(400).send({ error: 'VALIDATION_ERROR', message: 'Не можна прив’язати документ сам до себе' });
  }

  const [updated] = await db
    .update(documents)
    .set({ parentDocId, updatedAt: new Date() })
    .where(eq(documents.id, id))
    .returning();

  if (!updated) {
    return reply.status(404).send({ error: 'NOT_FOUND', message: 'Документ не знайдено' });
  }

  await recordAuditLog(db, {
    organizationId: updated.organizationId,
    userName,
    userRole: role,
    action: 'LINK_PARENT_DOC',
    entityType: updated.docType,
    entityId: updated.id,
    summary: parentDocId
      ? `Прив’язано документ-підставу до №${updated.docNumber}`
      : `Відв’язано документ-підставу від №${updated.docNumber}`,
  });

  return updated;
});

app.post('/api/documents/:id/create-related', async (req, reply) => {
  const { role, userName } = getRequestRole(req);
  const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
  const body = z
    .object({
      targetDocType: z.enum([
        'customer_order',
        'goods_receipt',
        'sales_invoice',
        'stock_transfer',
        'tax_invoice',
        'money_in',
        'money_out',
        'price_setting',
      ]),
      autoPost: z.boolean().optional().default(false),
    })
    .parse(req.body);

  assertReqPerm(req, 'DOC_WRITE', body.targetDocType);
  if (body.autoPost) {
    assertReqPerm(req, 'DOC_POST', body.targetDocType);
  }

  const [src] = await db.select().from(documents).where(eq(documents.id, id));
  if (!src) {
    return reply.status(404).send({ error: 'NOT_FOUND', message: 'Документ-підставу не знайдено' });
  }

  const [srcLines, accList, cfList, ptList] = await Promise.all([
    db
      .select()
      .from(documentLines)
      .where(eq(documentLines.documentId, src.id))
      .orderBy(asc(documentLines.lineNo)),
    db.select().from(cashAccounts).where(eq(cashAccounts.organizationId, src.organizationId)),
    db.select().from(cashflowCategories),
    db.select().from(priceTypes),
  ]);

  const isCash = body.targetDocType === 'money_in' || body.targetDocType === 'money_out';
  const defaultBank = accList.find((a) => a.accountType === 'BANK') ?? accList[0];
  const defaultCf = cfList.find(
    (c) =>
      c.direction === (body.targetDocType === 'money_in' ? 'IN' : 'OUT') && !c.isOperatingExpense
  );

  const [created] = await db
    .insert(documents)
    .values({
      organizationId: src.organizationId,
      departmentId: src.departmentId,
      docType: body.targetDocType,
      docNumber: generateDocNumber(body.targetDocType),
      docDate: new Date(),
      status: 'DRAFT',
      parentDocId: src.id,
      warehouseId: isCash ? null : src.warehouseId,
      counterpartyId: src.counterpartyId,
      contractId: src.contractId,
      cashAccountId: isCash ? (defaultBank?.id ?? null) : null,
      cashflowCategoryId: isCash ? (defaultCf?.id ?? null) : null,
      priceTypeId:
        body.targetDocType === 'price_setting'
          ? (ptList[0]?.id ?? null)
          : src.priceTypeId,
      vatRate: src.vatRate ?? 20,
      discountTotal: isCash ? '0.00' : src.discountTotal,
      totalAmount: src.totalAmount,
      comment: `Створено на підставі №${src.docNumber}`,
      metaJson: src.metaJson || '{}',
    })
    .returning();

  if (!isCash && srcLines.length > 0) {
    const filtered =
      src.docType === 'production_order'
        ? srcLines.filter((l) => l.lineRole === 'OUTPUT')
        : srcLines;
    const copyLines = filtered.length > 0 ? filtered : srcLines;
    await db.insert(documentLines).values(
      copyLines.map((l, idx) => ({
        documentId: created.id,
        lineNo: idx + 1,
        lineRole: 'ITEM',
        itemId: l.itemId,
        qty: l.qty,
        price: l.price,
        discountPercent: l.discountPercent,
        discountAmount: l.discountAmount,
        amount: l.amount,
      }))
    );
  }

  if (body.autoPost) {
    await postDocument(db, created.id);
  }

  await recordAuditLog(db, {
    organizationId: src.organizationId,
    userName,
    userRole: role,
    action: 'CREATE_RELATED_DOC',
    entityType: src.docType,
    entityId: src.id,
    summary: `На підставі №${src.docNumber} створено ${created.docNumber} (${body.targetDocType})`,
  });

  await recordAuditLog(db, {
    organizationId: src.organizationId,
    userName,
    userRole: role,
    action: 'CREATE_DOC',
    entityType: created.docType,
    entityId: created.id,
    summary: `Створено на підставі документа №${src.docNumber}`,
  });

  const [finalDoc] = await db.select().from(documents).where(eq(documents.id, created.id));
  return finalDoc;
});

// ============================================================================
// РОЗУМНИЙ ШВИДКИЙ ГЛОБАЛЬНИЙ ПОШУК (ТОВАРИ + КЛІЄНТИ + ДОКУМЕНТИ + CRM + РАХУНКИ)
// ============================================================================

app.get('/api/search', async (req) => {
  const orgId = await getOrgId(req);
  const deptScope = await resolveDepartmentScope(req, orgId);
  const { perms } = getRequestRole(req);
  const filterDeptSet = deptScope.filterDeptIds ? new Set(deptScope.filterDeptIds) : null;

  const { q } = z.object({ q: z.string().optional().default('') }).parse(req.query);
  const query = q.trim().toLowerCase();
  const tokens = query.split(/\s+/).filter(Boolean);

  const matches = (...fields: Array<string | null | undefined>) => {
    if (tokens.length === 0) return true;
    const hay = fields.filter(Boolean).join(' ').toLowerCase();
    return tokens.every((t) => hay.includes(t));
  };

  const [allItems, allCats, allCps, allDocs, allLeads, allCoa, stockBal] = await Promise.all([
    db.select().from(items).orderBy(asc(items.name)),
    db.select().from(categories),
    db.select().from(counterparties).orderBy(asc(counterparties.name)),
    db
      .select()
      .from(documents)
      .where(eq(documents.organizationId, orgId))
      .orderBy(desc(documents.docDate)),
    db
      .select()
      .from(crmLeads)
      .where(eq(crmLeads.organizationId, orgId))
      .orderBy(desc(crmLeads.updatedAt)),
    db.select().from(chartOfAccounts).orderBy(asc(chartOfAccounts.code)),
    getStockBalances(db, { organizationId: orgId, asOfDate: new Date().toISOString() }),
  ]);

  const catMap = new Map(allCats.map((c) => [c.id, c.name]));
  const cpMap = new Map(allCps.map((c) => [c.id, c.name]));
  const stockByItem = new Map<string, { qty: number; free: number }>();
  for (const r of stockBal.rows) {
    const cur = stockByItem.get(r.itemId) ?? { qty: 0, free: 0 };
    cur.qty += Number(r.qty);
    cur.free += Number(r.freeQty);
    stockByItem.set(r.itemId, cur);
  }

  const canSeeItems = Boolean(
    perms.catalogs || perms.sales || perms.purchases || perms.warehouse || perms.production
  );
  const canSeeCps = Boolean(
    perms.catalogs || perms.sales || perms.purchases || perms.crm || perms.money || perms.accounting
  );

  return {
    items: canSeeItems
      ? allItems
          .filter((i) =>
            matches(i.name, i.sku, i.barcode, i.categoryId ? catMap.get(i.categoryId) : '')
          )
          .slice(0, 10)
          .map((i) => {
            const st = stockByItem.get(i.id);
            return {
              id: i.id,
              sku: i.sku,
              barcode: i.barcode,
              name: i.name,
              unit: i.unit,
              itemType: i.itemType,
              categoryName: i.categoryId ? (catMap.get(i.categoryId) ?? '') : '',
              stockQty: st?.qty ?? 0,
              freeQty: st?.free ?? 0,
            };
          })
      : [],
    counterparties: canSeeCps
      ? allCps
          .filter((c) => matches(c.name, c.edrpou, c.phone, c.email))
          .slice(0, 10)
          .map((c) => ({
            id: c.id,
            name: c.name,
            edrpou: c.edrpou,
            phone: c.phone,
            isCustomer: c.isCustomer,
            isSupplier: c.isSupplier,
          }))
      : [],
    documents: allDocs
      .filter((doc) => {
        if (!canViewDocType(perms, doc.docType)) return false;
        if (filterDeptSet && (!doc.departmentId || !filterDeptSet.has(doc.departmentId))) {
          return false;
        }
        return matches(
          doc.docNumber,
          doc.docType,
          doc.comment,
          doc.fiscalCode,
          doc.totalAmount,
          doc.counterpartyId ? cpMap.get(doc.counterpartyId) : ''
        );
      })
      .slice(0, 12)
      .map((doc) => ({
        id: doc.id,
        docType: doc.docType,
        docNumber: doc.docNumber,
        docDate: doc.docDate,
        status: doc.status,
        totalAmount: doc.totalAmount,
        counterpartyName: doc.counterpartyId ? (cpMap.get(doc.counterpartyId) ?? '') : '',
        comment: doc.comment,
      })),
    leads: perms.crm
      ? allLeads
          .filter((l) => {
            if (filterDeptSet && (!l.departmentId || !filterDeptSet.has(l.departmentId))) {
              return false;
            }
            return matches(l.title, l.contactName, l.phone, l.notes);
          })
          .slice(0, 6)
          .map((l) => ({
            id: l.id,
            title: l.title,
            contactName: l.contactName,
            stage: l.stage,
            expectedAmount: l.expectedAmount,
          }))
      : [],
    accounts: perms.accounting
      ? allCoa.filter((a) => matches(a.code, a.name)).slice(0, 8)
      : [],
  };
});

app.post('/api/documents/:id/fiscalize', async (req) => {
  const { role, userName } = getRequestRole(req);
  assertReqPerm(req, 'DOC_POST', 'sales_invoice');

  const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
  const body = z
    .object({
      paymentType: z.enum(['CASH', 'CASHLESS']).optional().default('CASHLESS'),
    })
    .parse(req.body ?? {});

  const res = await fiscalizeSalesInvoiceCheckbox(db, {
    documentId: id,
    paymentType: body.paymentType,
  });

  const orgId = await getOrgId(req);
  await recordAuditLog(db, {
    organizationId: orgId,
    userName,
    userRole: role,
    action: 'FISCALIZE_PRRO',
    entityType: 'sales_invoice',
    entityId: id,
    summary: `Фіскалізовано чек ПРРО №${res.fiscalCode}`,
  });

  return res;
});

// ============================================================================
// ПЕРІОДИЧНІ ЦІНИ (ЗРІЗ ОСТАННІХ)
// ============================================================================

app.get('/api/prices/latest', async (req) => {
  const query = z
    .object({
      priceTypeId: z.string().uuid(),
      asOfDate: z.string().optional(),
    })
    .parse(req.query);

  return getLatestPricesBulk(db, {
    priceTypeId: query.priceTypeId,
    asOfDate: query.asOfDate ?? new Date().toISOString(),
  });
});

// ============================================================================
// БУХГАЛТЕРСЬКИЙ ОБЛІК (Дт/Кт, План рахунків №291, ОСВ, Субконто, SAF-T UA)
// ============================================================================

app.get('/api/accounting/trial-balance', async (req) => {
  assertReqPerm(req, 'ACCOUNTING');
  const orgId = await getOrgId(req);
  const query = z
    .object({
      dateFrom: z.string().optional().default('2026-10-01T00:00:00Z'),
      dateTo: z.string().optional().default('2026-12-31T23:59:59Z'),
    })
    .parse(req.query);

  return getTrialBalance(db, {
    organizationId: orgId,
    dateFrom: query.dateFrom,
    dateTo: query.dateTo,
  });
});

app.get('/api/accounting/subkonto', async (req) => {
  assertReqPerm(req, 'ACCOUNTING');
  const orgId = await getOrgId(req);
  const query = z
    .object({
      accountCode: z.string().min(1),
      dateFrom: z.string().optional().default('2026-10-01T00:00:00Z'),
      dateTo: z.string().optional().default('2026-12-31T23:59:59Z'),
    })
    .parse(req.query);

  return getAccountSubkontoBalance(db, {
    organizationId: orgId,
    accountCode: query.accountCode,
    dateFrom: query.dateFrom,
    dateTo: query.dateTo,
  });
});

app.get('/api/accounting/journal', async (req) => {
  assertReqPerm(req, 'ACCOUNTING');
  const orgId = await getOrgId(req);
  const query = z
    .object({
      dateFrom: z.string().optional().default('2026-10-01T00:00:00Z'),
      dateTo: z.string().optional().default('2026-12-31T23:59:59Z'),
      accountCode: z.string().optional(),
    })
    .parse(req.query);

  return getJournalEntries(db, {
    organizationId: orgId,
    dateFrom: query.dateFrom,
    dateTo: query.dateTo,
    accountCode: query.accountCode || undefined,
  });
});

app.get('/api/accounting/saft-ua', async (req) => {
  assertReqPerm(req, 'ACCOUNTING');
  const orgId = await getOrgId(req);
  const query = z
    .object({
      dateFrom: z.string().optional().default('2026-10-01T00:00:00Z'),
      dateTo: z.string().optional().default('2026-12-31T23:59:59Z'),
    })
    .parse(req.query);

  return generateSaftUaXml(db, {
    organizationId: orgId,
    dateFrom: query.dateFrom,
    dateTo: query.dateTo,
  });
});

// ============================================================================
// УПРАВЛІНСЬКІ ЗВІТИ ТА ДАШБОРД
// ============================================================================

app.get('/api/dashboard', async (req) => {
  const orgId = await getOrgId(req);
  const deptScope = await resolveDepartmentScope(req, orgId);
  const { perms } = getRequestRole(req);
  const query = z
    .object({
      dateFrom: z.string().optional().default('2026-10-01T00:00:00Z'),
      dateTo: z.string().optional().default('2026-12-31T23:59:59Z'),
    })
    .parse(req.query);

  return getDashboardSummary(db, {
    organizationId: orgId,
    dateFrom: query.dateFrom,
    dateTo: query.dateTo,
    departmentIds: deptScope.filterDeptIds,
    allowedDocTypes: getVisibleDocTypes(perms),
  });
});

app.get('/api/reports/stock-balances', async (req) => {
  const orgId = await getOrgId(req);
  const query = z
    .object({
      asOfDate: z.string().optional().default('2026-12-31T23:59:59Z'),
      warehouseId: z.string().uuid().optional(),
    })
    .parse(req.query);

  return getStockBalances(db, {
    organizationId: orgId,
    asOfDate: query.asOfDate,
    warehouseId: query.warehouseId,
  });
});

app.get('/api/reports/stock-turnover', async (req) => {
  const orgId = await getOrgId(req);
  const query = z
    .object({
      dateFrom: z.string().optional().default('2026-11-01T00:00:00Z'),
      dateTo: z.string().optional().default('2026-11-30T23:59:59Z'),
      warehouseId: z.string().uuid().optional(),
    })
    .parse(req.query);

  return getStockTurnover(db, {
    organizationId: orgId,
    dateFrom: query.dateFrom,
    dateTo: query.dateTo,
    warehouseId: query.warehouseId,
  });
});

app.get('/api/reports/gross-profit', async (req) => {
  const orgId = await getOrgId(req);
  const query = z
    .object({
      dateFrom: z.string().optional().default('2026-10-01T00:00:00Z'),
      dateTo: z.string().optional().default('2026-12-31T23:59:59Z'),
      groupBy: z.enum(['item', 'counterparty', 'warehouse']).optional().default('item'),
    })
    .parse(req.query);

  return getGrossProfit(db, {
    organizationId: orgId,
    dateFrom: query.dateFrom,
    dateTo: query.dateTo,
    groupBy: query.groupBy,
  });
});

app.get('/api/reports/settlements', async (req) => {
  const orgId = await getOrgId(req);
  const query = z
    .object({
      asOfDate: z.string().optional().default('2026-12-31T23:59:59Z'),
    })
    .parse(req.query);

  return getSettlements(db, {
    organizationId: orgId,
    asOfDate: query.asOfDate,
  });
});

app.get('/api/reports/counterparty-card', async (req) => {
  const orgId = await getOrgId(req);
  const query = z
    .object({
      counterpartyId: z.string().uuid(),
      dateFrom: z.string().optional().default('2026-10-01T00:00:00Z'),
      dateTo: z.string().optional().default('2026-12-31T23:59:59Z'),
    })
    .parse(req.query);

  return getCounterpartyCard(db, {
    organizationId: orgId,
    counterpartyId: query.counterpartyId,
    dateFrom: query.dateFrom,
    dateTo: query.dateTo,
  });
});

app.get('/api/reports/cashflow-pnl', async (req) => {
  const orgId = await getOrgId(req);
  const query = z
    .object({
      dateFrom: z.string().optional().default('2026-10-01T00:00:00Z'),
      dateTo: z.string().optional().default('2026-12-31T23:59:59Z'),
    })
    .parse(req.query);

  return getCashFlowAndPnl(db, {
    organizationId: orgId,
    dateFrom: query.dateFrom,
    dateTo: query.dateTo,
  });
});

// ============================================================================
// ІНТЕГРАЦІЇ (BAS OData, Monobank, Приват24, Checkbox ПРРО)
// ============================================================================

app.get('/api/integrations', async (req) => {
  const orgId = await getOrgId(req);
  return getIntegrationConfigs(db, orgId);
});

app.put('/api/integrations/:provider', async (req) => {
  const { role } = getRequestRole(req);
  assertReqPerm(req, 'INTEGRATION_SYNC');

  const orgId = await getOrgId(req);
  const { provider } = z
    .object({
      provider: z.enum(['BAS_ODATA', 'MONOBANK', 'PRIVAT24', 'CHECKBOX']),
    })
    .parse(req.params);

  const body = z
    .object({
      mode: z.enum(['DEMO', 'LIVE']),
      config: z.record(z.unknown()),
    })
    .parse(req.body);

  return saveIntegrationConfig(db, {
    organizationId: orgId,
    provider: provider as IntegrationProvider,
    mode: body.mode,
    config: body.config,
  });
});

app.post('/api/integrations/bas-odata/sync', async (req) => {
  const { role } = getRequestRole(req);
  assertReqPerm(req, 'INTEGRATION_SYNC');

  const orgId = await getOrgId(req);
  const body = z
    .object({
      warehouseId: z.string().uuid().optional(),
    })
    .parse(req.body ?? {});

  return syncFromBasOdata(db, {
    organizationId: orgId,
    warehouseId: body.warehouseId,
  });
});

app.post('/api/integrations/bank/sync', async (req) => {
  const { role } = getRequestRole(req);
  assertReqPerm(req, 'INTEGRATION_SYNC');

  const orgId = await getOrgId(req);
  const body = z
    .object({
      provider: z.enum(['MONOBANK', 'PRIVAT24']),
      cashAccountId: z.string().uuid().optional(),
    })
    .parse(req.body);

  return syncBankStatement(db, {
    organizationId: orgId,
    provider: body.provider,
    cashAccountId: body.cashAccountId,
  });
});

// ============================================================================
// СЕРВІС ТА CSV ІМПОРТ
// ============================================================================

app.post('/api/service/repost-from-date', async (req) => {
  const { role, userName } = getRequestRole(req);
  assertReqPerm(req, 'ORG_POLICY');

  const orgId = await getOrgId(req);
  const body = z.object({ fromDate: z.string() }).parse(req.body);
  const res = await repostFromDate(db, orgId, body.fromDate);

  await recordAuditLog(db, {
    organizationId: orgId,
    userName,
    userRole: role,
    action: 'REPOST_SEQUENCE',
    entityType: 'system',
    summary: `Перепроведено послідовність з ${body.fromDate} (${res.repostedCount} док.)`,
  });

  return res;
});

app.post('/api/service/rebuild-totals', async (req) => {
  const orgId = await getOrgId(req);
  const rowsRebuilt = await rebuildStockTotals(db, orgId);
  return { rowsRebuilt };
});

app.post('/api/import/items', async (req) => {
  const body = z.object({ csvText: z.string().min(1) }).parse(req.body);
  return importItemsFromBasCsv(db, body.csvText);
});

app.post('/api/import/items/parse-file', async (req) => {
  const body = z
    .object({
      filename: z.string().min(1),
      contentBase64: z.string().min(1),
      mimeType: z.string().optional(),
    })
    .parse(req.body);
  return parseUniversalItemsFile(body);
});

app.post('/api/import/items/commit', async (req) => {
  const { role, userName } = getRequestRole(req);
  const orgId = await getOrgId(req);
  const deptScope = await resolveDepartmentScope(req, orgId);
  const body = z
    .object({
      items: z
        .array(
          z.object({
            sku: z.string().optional().default(''),
            name: z.string().min(1),
            categoryName: z.string().optional().default(''),
            unit: z.string().optional().default('шт'),
            price: z.number().optional().default(0),
            barcode: z.string().optional().default(''),
            itemType: z.enum(['GOODS', 'SERVICE']).optional().default('GOODS'),
          })
        )
        .min(1),
      defaultCategoryName: z.string().optional().default(''),
      createPriceSetting: z.boolean().optional().default(false),
      priceTypeId: z.string().uuid().nullable().optional(),
    })
    .parse(req.body);

  const result = await commitUniversalItemsImport(db, {
    organizationId: orgId,
    departmentId: deptScope.activeDepartmentId ?? deptScope.visibleDepartments[0]?.id ?? null,
    items: body.items,
    defaultCategoryName: body.defaultCategoryName,
    createPriceSetting: body.createPriceSetting,
    priceTypeId: body.priceTypeId ?? null,
  });

  await recordAuditLog(db, {
    organizationId: orgId,
    userName,
    userRole: role,
    action: 'UNIVERSAL_IMPORT_ITEMS',
    entityType: 'items',
    summary: `Імпорт номенклатури з файлу: створено ${result.created}, оновлено ${result.updated}, категорій +${result.categoriesCreated}`,
  });

  return result;
});

app.post('/api/import/counterparties', async (req) => {
  const body = z.object({ csvText: z.string().min(1) }).parse(req.body);
  return importCounterpartiesFromBasCsv(db, body.csvText);
});

app.post('/api/import/counterparties/parse-file', async (req) => {
  const body = z
    .object({
      filename: z.string().min(1),
      contentBase64: z.string().min(1),
      mimeType: z.string().optional(),
    })
    .parse(req.body);
  return parseUniversalCounterpartiesFile(body);
});

app.post('/api/import/counterparties/commit', async (req) => {
  const { role, userName } = getRequestRole(req);
  const orgId = await getOrgId(req);
  const body = z
    .object({
      counterparties: z
        .array(
          z.object({
            name: z.string().min(1),
            edrpou: z.string().optional().default(''),
            ipn: z.string().optional().default(''),
            iban: z.string().optional().default(''),
            phone: z.string().optional().default(''),
            email: z.string().optional().default(''),
            isCustomer: z.boolean().optional().default(true),
            isSupplier: z.boolean().optional().default(false),
          })
        )
        .min(1),
      createDefaultContracts: z.boolean().optional().default(true),
    })
    .parse(req.body);

  const result = await commitUniversalCounterpartiesImport(db, {
    organizationId: orgId,
    counterparties: body.counterparties,
    createDefaultContracts: body.createDefaultContracts,
  });

  await recordAuditLog(db, {
    organizationId: orgId,
    userName,
    userRole: role,
    action: 'UNIVERSAL_IMPORT_COUNTERPARTIES',
    entityType: 'counterparties',
    summary: `Імпорт покупців/контрагентів з файлу: створено ${result.created}, оновлено ${result.updated}, договорів +${result.contractsCreated}`,
  });

  return result;
});

app.post('/api/import/opening-balances', async (req) => {
  const orgId = await getOrgId(req);
  const body = z
    .object({
      warehouseId: z.string().uuid(),
      docDate: z.string(),
      csvText: z.string().min(1),
      autoPost: z.boolean().optional().default(true),
    })
    .parse(req.body);

  return importOpeningBalancesFromBasCsv(db, {
    organizationId: orgId,
    warehouseId: body.warehouseId,
    docDate: body.docDate,
    csvText: body.csvText,
    autoPost: body.autoPost,
  });
});

// ============================================================================
// CRM-ВОРОНКА (ЛІДИ, ЗАДАЧІ, ДЗВІНКИ, КОНВЕРТАЦІЯ В ЗАМОВЛЕННЯ)
// ============================================================================

app.get('/api/crm/pipeline', async (req) => {
  const { perms } = getRequestRole(req);
  if (!perms.crm) {
    throw new PostingError('FORBIDDEN_ROLE', 'У вас немає доступу до CRM-воронки');
  }
  const orgId = await getOrgId(req);
  const deptScope = await resolveDepartmentScope(req, orgId);
  return getCrmPipeline(db, orgId, deptScope.filterDeptIds);
});

app.post('/api/crm/leads', async (req) => {
  const { perms } = getRequestRole(req);
  if (!perms.crm) {
    throw new PostingError('FORBIDDEN_ROLE', 'У вас немає доступу до створення лідів у CRM');
  }
  const orgId = await getOrgId(req);
  const deptScope = await resolveDepartmentScope(req, orgId);
  const body = z
    .object({
      title: z.string().min(1),
      departmentId: z.string().uuid().nullable().optional(),
      counterpartyId: z.string().uuid().nullable().optional(),
      contactName: z.string().optional(),
      phone: z.string().optional(),
      email: z.string().optional(),
      source: z.string().optional(),
      stage: z.enum(['NEW', 'QUALIFIED', 'PROPOSAL', 'NEGOTIATION', 'WON', 'LOST']).optional(),
      expectedAmount: z.union([z.number(), z.string()]).optional(),
      assignedTo: z.string().optional(),
      notes: z.string().optional(),
    })
    .parse(req.body);

  const deptId = resolveAllowedDepartmentForWrite(
    deptScope,
    body.departmentId,
    (req as AuthedRequest).authUser
  );

  return createCrmLead(db, { organizationId: orgId, ...body, departmentId: deptId });
});

app.patch('/api/crm/leads/:id/stage', async (req) => {
  const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
  const { stage } = z
    .object({ stage: z.enum(['NEW', 'QUALIFIED', 'PROPOSAL', 'NEGOTIATION', 'WON', 'LOST']) })
    .parse(req.body);
  return updateCrmLeadStage(db, id, stage);
});

app.post('/api/crm/leads/:id/convert', async (req) => {
  const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
  return convertLeadToCustomerOrder(db, id);
});

app.post('/api/crm/activities', async (req) => {
  const orgId = await getOrgId(req);
  const body = z
    .object({
      leadId: z.string().uuid(),
      activityType: z.enum(['CALL', 'TASK', 'MEETING', 'EMAIL']).default('CALL'),
      subject: z.string().min(1),
      outcome: z.string().optional(),
      durationSec: z.number().optional(),
      dueAt: z.string().nullable().optional(),
      assignedTo: z.string().optional(),
      isDone: z.boolean().optional(),
    })
    .parse(req.body);

  return addCrmActivity(db, { organizationId: orgId, ...body });
});

app.patch('/api/crm/activities/:id/toggle', async (req) => {
  const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
  const { isDone } = z.object({ isDone: z.boolean() }).parse(req.body);
  return toggleCrmActivityDone(db, id, isDone);
});

// ============================================================================
// ОСНОВНІ ЗАСОБИ (104/106/131) ТА МУЛЬТИВАЛЮТНІСТЬ / КУРСИ НБУ
// ============================================================================

app.get('/api/fixed-assets', async (req) => {
  assertReqPerm(req, 'ACCOUNTING');
  const orgId = await getOrgId(req);
  return getFixedAssetsList(db, orgId);
});

app.post('/api/fixed-assets', async (req) => {
  assertReqPerm(req, 'ACCOUNTING');
  const orgId = await getOrgId(req);
  const body = z
    .object({
      inventoryNumber: z.string().min(1),
      name: z.string().min(1),
      accountCode: z.enum(['104', '106']).default('104'),
      expenseAccountCode: z.enum(['92', '93', '231']).default('92'),
      commissioningDate: z.string(),
      initialCost: z.union([z.number(), z.string()]),
      residualValue: z.union([z.number(), z.string()]).optional().default(0),
      usefulLifeMonths: z.number().int().positive().default(60),
    })
    .parse(req.body);

  return createFixedAsset(db, { organizationId: orgId, ...body });
});

app.post('/api/fixed-assets/depreciate', async (req) => {
  assertReqPerm(req, 'ACCOUNTING');
  const orgId = await getOrgId(req);
  const body = z
    .object({ periodDate: z.string().optional().default(new Date().toISOString()) })
    .parse(req.body ?? {});
  return runMonthlyDepreciation(db, { organizationId: orgId, periodDate: body.periodDate });
});

app.get('/api/currency/rates', async () => getCurrencyRates(db));

app.post('/api/currency/sync-nbu', async (req) => {
  const body = z
    .object({
      date: z.string().optional(),
      manualRates: z
        .object({ USD: z.number().optional(), EUR: z.number().optional() })
        .optional(),
    })
    .parse(req.body ?? {});
  return syncNbuCurrencyRates(db, body);
});

app.get('/api/currency/balances', async (req) => {
  const orgId = await getOrgId(req);
  const { asOfDate } = z
    .object({ asOfDate: z.string().optional().default('2026-12-31T23:59:59Z') })
    .parse(req.query);
  return getForeignCurrencyBalances(db, { organizationId: orgId, asOfDate });
});

app.post('/api/currency/revalue', async (req) => {
  assertReqPerm(req, 'ACCOUNTING');
  const orgId = await getOrgId(req);
  const { asOfDate } = z
    .object({ asOfDate: z.string().optional().default(new Date().toISOString()) })
    .parse(req.body ?? {});
  return runCurrencyRevaluation(db, { organizationId: orgId, asOfDate });
});

// ============================================================================
// РЕГЛАМЕНТОВАНА ЗВІТНІСТЬ ДПС (Ф1, Ф2, ПДВ, ЄДИНИЙ ПОДАТОК, ЄСВ/4ДФ)
// ============================================================================

app.get('/api/statutory/balance-f1', async (req) => {
  assertReqPerm(req, 'ACCOUNTING');
  const orgId = await getOrgId(req);
  const { asOfDate } = z
    .object({ asOfDate: z.string().optional().default('2026-11-30T23:59:59Z') })
    .parse(req.query);
  return getBalanceSheetF1(db, { organizationId: orgId, asOfDate });
});

app.get('/api/statutory/income-f2', async (req) => {
  assertReqPerm(req, 'ACCOUNTING');
  const orgId = await getOrgId(req);
  const q = z
    .object({
      dateFrom: z.string().optional().default('2026-10-01T00:00:00Z'),
      dateTo: z.string().optional().default('2026-11-30T23:59:59Z'),
    })
    .parse(req.query);
  return getIncomeStatementF2(db, { organizationId: orgId, ...q });
});

app.get('/api/statutory/vat-declaration', async (req) => {
  assertReqPerm(req, 'ACCOUNTING');
  const orgId = await getOrgId(req);
  const q = z
    .object({
      dateFrom: z.string().optional().default('2026-11-01T00:00:00Z'),
      dateTo: z.string().optional().default('2026-11-30T23:59:59Z'),
    })
    .parse(req.query);
  return getVatDeclaration(db, { organizationId: orgId, ...q });
});

app.get('/api/statutory/single-tax', async (req) => {
  assertReqPerm(req, 'ACCOUNTING');
  const orgId = await getOrgId(req);
  const q = z
    .object({
      dateFrom: z.string().optional().default('2026-11-01T00:00:00Z'),
      dateTo: z.string().optional().default('2026-11-30T23:59:59Z'),
      taxRatePercent: z.coerce.number().optional().default(5),
    })
    .parse(req.query);
  return getSingleTaxDeclaration(db, { organizationId: orgId, ...q });
});

app.get('/api/statutory/unified-esv', async (req) => {
  assertReqPerm(req, 'ACCOUNTING');
  const orgId = await getOrgId(req);
  const q = z
    .object({
      dateFrom: z.string().optional().default('2026-11-01T00:00:00Z'),
      dateTo: z.string().optional().default('2026-11-30T23:59:59Z'),
    })
    .parse(req.query);
  return getUnifiedPayrollReport(db, { organizationId: orgId, ...q });
});

await app.listen({ port: PORT, host: HOST });
console.log(`[2C API v1.0.0] Running on http://${HOST}:${PORT} (db driver: ${dbHandle.driver})`);
