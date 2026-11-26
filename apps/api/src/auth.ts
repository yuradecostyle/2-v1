import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { and, asc, eq, gt } from 'drizzle-orm';
import {
  accessGroups,
  appUsers,
  authSessions,
  cashAccounts,
  crmLeads,
  DEFAULT_ROLE_PERMISSIONS,
  departments,
  documents,
  employees,
  organizations,
  resolveEffectivePermissions,
  warehouses,
  type AppDb,
  type DocumentType,
  type PermissionMap,
  type UserRole,
} from '@bas-alt/core';

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

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const derived = scryptSync(password, salt, 64).toString('hex');
  return `scrypt$${salt}$${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  if (!storedHash || !storedHash.startsWith('scrypt$')) return false;
  const parts = storedHash.split('$');
  if (parts.length !== 3) return false;
  const [, salt, hexHash] = parts;
  const derived = scryptSync(password, salt, 64);
  const expected = Buffer.from(hexHash, 'hex');
  if (derived.length !== expected.length) return false;
  return timingSafeEqual(derived, expected);
}

export function hashSessionToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex');
}

export function serializeAccessGroup(
  row: typeof accessGroups.$inferSelect,
  usersCount?: number
): AccessGroupDto {
  let rawPerms: Record<string, boolean> = {};
  try {
    const parsed = JSON.parse(row.permissionsJson || '{}');
    if (parsed && typeof parsed === 'object') rawPerms = parsed;
  } catch {}
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    baseRole: row.baseRole,
    permissions: resolveEffectivePermissions(row.baseRole, rawPerms, null),
    isSystem: row.isSystem,
    ...(usersCount !== undefined ? { usersCount } : {}),
    createdAt: row.createdAt.toISOString(),
  };
}

export function serializeUser(
  row: typeof appUsers.$inferSelect,
  groupRow?: typeof accessGroups.$inferSelect | null,
  deptRow?: typeof departments.$inferSelect | null
): AuthUserDto {
  let allowedOrgIds: string[] = [];
  let allowedDepartmentIds: string[] = [];
  let userOverrides: Record<string, boolean> = {};
  let groupPerms: Record<string, boolean> | null = null;

  try {
    const parsed = JSON.parse(row.allowedOrgIdsJson || '[]');
    if (Array.isArray(parsed)) allowedOrgIds = parsed.filter((x) => typeof x === 'string');
  } catch {}
  try {
    const parsed = JSON.parse(row.allowedDepartmentIdsJson || '[]');
    if (Array.isArray(parsed)) allowedDepartmentIds = parsed.filter((x) => typeof x === 'string');
  } catch {}
  try {
    const parsed = JSON.parse(row.permissionsJson || '{}');
    if (parsed && typeof parsed === 'object') userOverrides = parsed;
  } catch {}
  if (groupRow) {
    try {
      const parsed = JSON.parse(groupRow.permissionsJson || '{}');
      if (parsed && typeof parsed === 'object') groupPerms = parsed;
    } catch {}
  }

  const effectiveRole = groupRow ? groupRow.baseRole : row.role;
  const effectivePermissions = resolveEffectivePermissions(
    effectiveRole,
    groupPerms,
    userOverrides
  );

  return {
    id: row.id,
    organizationId: row.organizationId,
    departmentId: row.departmentId ?? null,
    departmentName: deptRow?.name ?? '',
    accessGroupId: row.accessGroupId ?? null,
    accessGroupName: groupRow?.name ?? '',
    fullName: row.fullName,
    login: row.login,
    email: row.email,
    role: row.role,
    allowedOrgIds,
    allowedDepartmentIds,
    permissions: userOverrides,
    effectivePermissions,
    isActive: row.isActive,
    lastLoginAt: row.lastLoginAt ? row.lastLoginAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function createSession(db: AppDb, userId: string): Promise<string> {
  const rawToken = randomBytes(32).toString('base64url');
  const tokenHash = hashSessionToken(rawToken);
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  await db.insert(authSessions).values({
    userId,
    tokenHash,
    expiresAt,
  });
  return rawToken;
}

export async function getUserBySessionToken(
  db: AppDb,
  rawToken: string
): Promise<AuthUserDto | null> {
  if (!rawToken) return null;
  const tokenHash = hashSessionToken(rawToken);
  const now = new Date();
  const [session] = await db
    .select()
    .from(authSessions)
    .where(and(eq(authSessions.tokenHash, tokenHash), gt(authSessions.expiresAt, now)))
    .limit(1);
  if (!session) return null;

  const [user] = await db
    .select()
    .from(appUsers)
    .where(eq(appUsers.id, session.userId))
    .limit(1);
  if (!user || !user.isActive) return null;

  let groupRow: typeof accessGroups.$inferSelect | null = null;
  if (user.accessGroupId) {
    const [g] = await db
      .select()
      .from(accessGroups)
      .where(eq(accessGroups.id, user.accessGroupId))
      .limit(1);
    groupRow = g ?? null;
  }
  let deptRow: typeof departments.$inferSelect | null = null;
  if (user.departmentId) {
    const [dp] = await db
      .select()
      .from(departments)
      .where(eq(departments.id, user.departmentId))
      .limit(1);
    deptRow = dp ?? null;
  }
  return serializeUser(user, groupRow, deptRow);
}

export async function deleteSessionByToken(db: AppDb, rawToken: string): Promise<void> {
  if (!rawToken) return;
  const tokenHash = hashSessionToken(rawToken);
  await db.delete(authSessions).where(eq(authSessions.tokenHash, tokenHash));
}

export async function revokeAllUserSessions(db: AppDb, userId: string): Promise<void> {
  await db.delete(authSessions).where(eq(authSessions.userId, userId));
}

export async function ensureDefaultAccessGroupsAndUsers(
  db: AppDb,
  defaultOrgId: string
): Promise<void> {
  // 1. Seed 5 built-in Access Groups if missing
  let groups = await db.select().from(accessGroups).orderBy(asc(accessGroups.createdAt));
  const defaultGroupSpecs: Array<{
    name: string;
    description: string;
    baseRole: UserRole;
  }> = [
    {
      name: 'Адміністратори (Повний доступ)',
      description: 'Повний контроль: усі розділи, організації/ФОП, користувачі, групи та налаштування',
      baseRole: 'OWNER',
    },
    {
      name: 'Менеджери з продажу',
      description: 'Продажні інструменти: CRM-воронка, замовлення покупців, продажі, рахунки, ПРРО, клієнти',
      baseRole: 'SALES_MANAGER',
    },
    {
      name: 'Менеджери із закупівель',
      description: 'Закупівлі: постачальники, прибуткові накладні, витрати, замовлення постачальникам і склад',
      baseRole: 'PURCHASE_MANAGER',
    },
    {
      name: 'Бухгалтери',
      description: 'Бухгалтерія №291, ОСВ, SAF-T UA, ПДВ, зарплата, ОЗ, валюта та звітність ДПС',
      baseRole: 'ACCOUNTANT',
    },
    {
      name: 'Комірники та виробництво',
      description: 'Складський облік, приймання товару, переміщення, інвентаризації та виробництво BOM',
      baseRole: 'STOREKEEPER',
    },
  ];

  for (const spec of defaultGroupSpecs) {
    if (!groups.some((g) => g.baseRole === spec.baseRole && g.isSystem)) {
      const [inserted] = await db
        .insert(accessGroups)
        .values({
          name: spec.name,
          description: spec.description,
          baseRole: spec.baseRole,
          permissionsJson: JSON.stringify(DEFAULT_ROLE_PERMISSIONS[spec.baseRole]),
          isSystem: true,
        })
        .returning();
      groups.push(inserted);
    }
  }

  const groupByRole = new Map<UserRole, string>();
  for (const g of groups) {
    if (g.isSystem && !groupByRole.has(g.baseRole)) {
      groupByRole.set(g.baseRole, g.id);
    }
  }

  // 2. Ensure default login accounts + starter purchase manager ("zakup")
  const allUsers = await db
    .select()
    .from(appUsers)
    .where(eq(appUsers.organizationId, defaultOrgId))
    .orderBy(asc(appUsers.createdAt));

  const envAdminLogin = (process.env.ADMIN_LOGIN || 'admin').trim().toLowerCase();
  const envAdminPassword = process.env.ADMIN_PASSWORD || 'admin123';

  const defaultCredsByRole: Record<UserRole, { login: string; password: string }> = {
    OWNER: { login: envAdminLogin, password: envAdminPassword },
    ACCOUNTANT: { login: 'buh', password: 'buh123' },
    SALES_MANAGER: { login: 'sales', password: 'sales123' },
    PURCHASE_MANAGER: { login: 'zakup', password: 'zakup123' },
    STOREKEEPER: { login: 'sklad', password: 'sklad123' },
    CUSTOM: { login: 'user', password: 'user123' },
  };

  if (allUsers.length === 0) {
    await db.insert(appUsers).values({
      organizationId: defaultOrgId,
      accessGroupId: groupByRole.get('OWNER') ?? null,
      fullName: 'Адміністратор (Власник)',
      login: envAdminLogin,
      email: `${envAdminLogin}@2c.ua`,
      passwordHash: hashPassword(envAdminPassword),
      role: 'OWNER',
      allowedOrgIdsJson: '[]',
      isActive: true,
    });
  } else {
    const usedLogins = new Set(allUsers.map((u) => u.login.toLowerCase()).filter(Boolean));
    for (const u of allUsers) {
      const def = defaultCredsByRole[u.role] ?? defaultCredsByRole.CUSTOM;
      const updates: Partial<typeof appUsers.$inferInsert> = {};
      if (!u.login) {
        let nextLogin = def.login;
        if (usedLogins.has(nextLogin.toLowerCase())) {
          nextLogin = `${def.login}_${u.id.slice(0, 4)}`;
        }
        usedLogins.add(nextLogin.toLowerCase());
        updates.login = nextLogin;
      }
      if (!u.passwordHash) {
        updates.passwordHash = hashPassword(def.password);
      }
      if (!u.accessGroupId && groupByRole.has(u.role)) {
        updates.accessGroupId = groupByRole.get(u.role)!;
      }
      if (Object.keys(updates).length > 0) {
        await db.update(appUsers).set(updates).where(eq(appUsers.id, u.id));
      }
    }
  }

  // Ensure a starter Purchase Manager account exists for quick testing
  const globalUsers = await db.select().from(appUsers);
  if (!globalUsers.some((u) => u.login.toLowerCase() === 'zakup')) {
    await db.insert(appUsers).values({
      organizationId: defaultOrgId,
      accessGroupId: groupByRole.get('PURCHASE_MANAGER') ?? null,
      fullName: 'Бондар Ігор (Менеджер із закупівель)',
      login: 'zakup',
      email: 'zakup@2c.ua',
      passwordHash: hashPassword('zakup123'),
      role: 'PURCHASE_MANAGER',
      allowedOrgIdsJson: '[]',
      isActive: true,
    });
  }
}

function defaultDeptCodeForDocType(docType: DocumentType): 'HQ' | 'SALES' | 'PURCH' | 'PROD' {
  switch (docType) {
    case 'customer_order':
    case 'sales_invoice':
    case 'tax_invoice':
    case 'price_setting':
    case 'money_in':
      return 'SALES';
    case 'goods_receipt':
    case 'stock_transfer':
    case 'inventory_count':
    case 'opening_balance':
      return 'PURCH';
    case 'production_order':
      return 'PROD';
    case 'payroll_sheet':
    case 'depreciation_run':
    case 'fx_revaluation':
    case 'money_out':
    case 'manual_journal':
      return 'HQ';
  }
}

export async function ensureDefaultDepartments(db: AppDb): Promise<void> {
  const allOrgs = await db.select().from(organizations).orderBy(asc(organizations.createdAt));

  for (const org of allOrgs) {
    let orgDepts = await db
      .select()
      .from(departments)
      .where(eq(departments.organizationId, org.id))
      .orderBy(asc(departments.createdAt));

    if (orgDepts.length === 0) {
      const specs =
        org.entityType === 'FOP'
          ? [
              {
                code: 'MAIN',
                name: 'Основний офіс ФОП',
                description: 'Адміністрація, фінанси та документи підприємця',
                headName: org.directorName || org.name,
                address: org.address || '',
              },
              {
                code: 'SALES',
                name: 'Торгова точка / Продажі',
                description: 'Замовлення клієнтів, продажі та каса',
                headName: org.directorName || org.name,
                address: org.address || '',
              },
            ]
          : [
              {
                code: 'HQ',
                name: 'Головний офіс',
                description: 'Дирекція, бухгалтерія, кадри та фінансовий облік',
                headName: org.directorName || 'Шевченко Андрій Іванович',
                address: org.address || 'м. Київ, вул. Хрещатик, 22',
              },
              {
                code: 'SALES',
                name: 'Відділ продажів',
                description: 'CRM-воронка, замовлення покупців, реалізація та роздріб',
                headName: 'Бондаренко Максим',
                address: 'м. Київ, офіс продажів',
              },
              {
                code: 'PURCH',
                name: 'Відділ закупівель і склад',
                description: 'Постачальники, надходження товарів, складські залишки',
                headName: 'Бондар Ігор',
                address: 'м. Київ, логістичний склад №1',
              },
              {
                code: 'PROD',
                name: 'Виробництво та сервіс',
                description: 'Виробничий цех, комплектація BOM і сервісні роботи',
                headName: 'Ткаченко Сергій',
                address: 'м. Київ, виробничий корпус',
              },
            ];

      orgDepts = await db
        .insert(departments)
        .values(specs.map((s) => ({ ...s, organizationId: org.id })))
        .returning();
    }

    const byCode = new Map(orgDepts.map((dp) => [dp.code.toUpperCase(), dp]));
    const mainDept = byCode.get('HQ') ?? byCode.get('MAIN') ?? orgDepts[0];
    const salesDept = byCode.get('SALES') ?? mainDept;
    const purchDept = byCode.get('PURCH') ?? mainDept;
    const prodDept = byCode.get('PROD') ?? mainDept;

    const resolveBucket = (code: 'HQ' | 'SALES' | 'PURCH' | 'PROD') => {
      if (code === 'SALES') return salesDept;
      if (code === 'PURCH') return purchDept;
      if (code === 'PROD') return prodDept;
      return mainDept;
    };

    // Backfill employees without departmentId
    const orgEmps = await db
      .select()
      .from(employees)
      .where(eq(employees.organizationId, org.id));
    for (const emp of orgEmps) {
      if (!emp.departmentId) {
        const target =
          emp.department === 'SALES'
            ? salesDept
            : emp.department === 'PRODUCTION'
              ? prodDept
              : mainDept;
        await db.update(employees).set({ departmentId: target.id }).where(eq(employees.id, emp.id));
      }
    }

    // Backfill warehouses without departmentId
    const orgWhs = await db
      .select()
      .from(warehouses)
      .where(eq(warehouses.organizationId, org.id));
    for (const wh of orgWhs) {
      if (!wh.departmentId) {
        const target = wh.type === 'RETAIL' ? salesDept : purchDept;
        await db
          .update(warehouses)
          .set({ departmentId: target.id })
          .where(eq(warehouses.id, wh.id));
      }
    }

    // Backfill cash accounts without departmentId
    const orgAccs = await db
      .select()
      .from(cashAccounts)
      .where(eq(cashAccounts.organizationId, org.id));
    for (const acc of orgAccs) {
      if (!acc.departmentId) {
        const target = acc.accountType === 'CASH' ? salesDept : mainDept;
        await db
          .update(cashAccounts)
          .set({ departmentId: target.id })
          .where(eq(cashAccounts.id, acc.id));
      }
    }

    // Backfill documents without departmentId
    const orgDocs = await db
      .select({ id: documents.id, docType: documents.docType, departmentId: documents.departmentId })
      .from(documents)
      .where(eq(documents.organizationId, org.id));
    for (const doc of orgDocs) {
      if (!doc.departmentId) {
        const target = resolveBucket(defaultDeptCodeForDocType(doc.docType));
        await db
          .update(documents)
          .set({ departmentId: target.id })
          .where(eq(documents.id, doc.id));
      }
    }

    // Backfill CRM leads without departmentId
    const orgLeads = await db
      .select({ id: crmLeads.id, departmentId: crmLeads.departmentId })
      .from(crmLeads)
      .where(eq(crmLeads.organizationId, org.id));
    for (const lead of orgLeads) {
      if (!lead.departmentId) {
        await db
          .update(crmLeads)
          .set({ departmentId: salesDept.id })
          .where(eq(crmLeads.id, lead.id));
      }
    }

    // Backfill users belonging to this org without departmentId
    const orgUsers = await db
      .select()
      .from(appUsers)
      .where(eq(appUsers.organizationId, org.id));
    for (const u of orgUsers) {
      if (!u.departmentId) {
        let homeDept = mainDept;
        let allowedIds: string[] = [];
        if (u.role === 'SALES_MANAGER') {
          homeDept = salesDept;
          allowedIds = [salesDept.id];
        } else if (u.role === 'PURCHASE_MANAGER') {
          homeDept = purchDept;
          allowedIds = [purchDept.id];
        } else if (u.role === 'STOREKEEPER') {
          homeDept = purchDept;
          allowedIds = purchDept.id === prodDept.id ? [purchDept.id] : [purchDept.id, prodDept.id];
        }
        await db
          .update(appUsers)
          .set({
            departmentId: homeDept.id,
            allowedDepartmentIdsJson: JSON.stringify(allowedIds),
          })
          .where(eq(appUsers.id, u.id));
      }
    }
  }

  // Ensure built-in demo accounts are anchored to the primary TOV org with 4 distinct subdivisions
  const primaryTov = allOrgs.find((o) => o.entityType === 'TOV') ?? allOrgs[0];
  if (primaryTov) {
    const tovDepts = await db
      .select()
      .from(departments)
      .where(eq(departments.organizationId, primaryTov.id))
      .orderBy(asc(departments.createdAt));
    const tovByCode = new Map(tovDepts.map((dp) => [dp.code.toUpperCase(), dp]));
    const hq = tovByCode.get('HQ') ?? tovDepts[0];
    const sales = tovByCode.get('SALES') ?? hq;
    const purch = tovByCode.get('PURCH') ?? hq;
    const prod = tovByCode.get('PROD') ?? hq;

    if (hq && sales && purch && prod) {
      const demoUsers = await db.select().from(appUsers);
      for (const u of demoUsers) {
        const login = u.login.trim().toLowerCase();
        if (!['admin', 'buh', 'sales', 'zakup', 'sklad'].includes(login)) continue;
        // Re-anchor if user was accidentally attached to another org (e.g., FOP)
        if (u.organizationId !== primaryTov.id) {
          let nextDept = hq.id;
          let nextAllowed: string[] = [];
          if (login === 'sales') {
            nextDept = sales.id;
            nextAllowed = [sales.id];
          } else if (login === 'zakup') {
            nextDept = purch.id;
            nextAllowed = [purch.id];
          } else if (login === 'sklad') {
            nextDept = purch.id;
            nextAllowed = purch.id === prod.id ? [purch.id] : [purch.id, prod.id];
          }
          await db
            .update(appUsers)
            .set({
              organizationId: primaryTov.id,
              departmentId: nextDept,
              allowedDepartmentIdsJson: JSON.stringify(nextAllowed),
            })
            .where(eq(appUsers.id, u.id));
        }
      }
    }
  }
}
