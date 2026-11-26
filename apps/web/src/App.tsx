import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Search,
  ChevronDown,
  CheckCircle2,
  Plus,
  ShoppingBag,
  PackagePlus,
  ClipboardList,
  CreditCard,
  Shield,
  LayoutGrid,
  LayoutDashboard,
  FileText,
  Kanban,
  Menu,
  ChevronUp,
  LogOut,
  KeyRound,
  Network,
  Lock,
} from 'lucide-react';
import {
  apiFetch,
  getAuthToken,
  setActiveDepartmentId,
  setActiveOrganizationId,
  setActiveUserContext,
  setAuthToken,
  setUnauthorizedHandler,
  TAX_SYSTEM_LABELS,
  USER_ROLE_META,
  type AuthUserDto,
  type BootstrapData,
  type DocumentSummary,
  type DocumentType,
  type PermissionKey,
  type PermissionMap,
} from './lib/api';
import {
  MENU_SECTIONS,
  type MenuSection,
  type MenuSubItem,
  type TargetRoute,
  type TopSectionKey,
} from './lib/menuConfig';
import { DashboardPage } from './pages/DashboardPage';
import { DocumentsPage } from './pages/DocumentsPage';
import { CatalogsPage, type CatalogTab } from './pages/CatalogsPage';
import { ReportsPage } from './pages/ReportsPage';
import { AccountingPage } from './pages/AccountingPage';
import { ImportAndServicePage } from './pages/ImportAndServicePage';
import { CrmPage } from './pages/CrmPage';
import { AssetsAndCurrencyPage } from './pages/AssetsAndCurrencyPage';
import { StatutoryReportsPage } from './pages/StatutoryReportsPage';
import { MovementsModal } from './components/MovementsModal';
import { DocumentEditorModal } from './components/DocumentEditorModal';
import { CommandPaletteModal } from './components/CommandPaletteModal';
import { OrganizationsManagerModal } from './components/OrganizationsManagerModal';
import { DepartmentsManagerModal } from './components/DepartmentsManagerModal';
import { NewDocumentLauncherModal } from './components/NewDocumentLauncherModal';
import { PrintableDocumentModal } from './components/PrintableDocumentModal';
import { SectionMegaMenuModal } from './components/SectionMegaMenuModal';
import { SectionModuleView } from './components/SectionModuleView';
import { ShareDocumentModal } from './components/ShareDocumentModal';
import { MobileMenuSheet } from './components/MobileMenuSheet';
import { UsersAndRightsModal } from './components/UsersAndRightsModal';
import { BrandLogo2C } from './components/BrandLogo2C';
import { PublicDocumentPage } from './pages/PublicDocumentPage';
import { LoginPage } from './pages/LoginPage';

type PageKey =
  | 'dashboard'
  | 'crm'
  | 'documents'
  | 'assets'
  | 'accounting'
  | 'statutory'
  | 'reports'
  | 'catalogs'
  | 'service'
  | 'module';

interface ActiveContext {
  sectionId: TopSectionKey;
  groupTitle?: string;
  item?: MenuSubItem;
}

const PAGE_TITLES: Record<Exclude<PageKey, 'module'>, { title: string; subtitle: string }> = {
  dashboard: { title: 'Огляд бізнесу', subtitle: 'Ключові фінансові показники та оперативний пульс' },
  crm: { title: 'CRM-воронка продажів', subtitle: 'Ліди, канбан-етапи, задачі менеджерам, дзвінки та конвертація в замовлення' },
  documents: { title: 'Журнал документів і ПРРО', subtitle: 'Первинні документи, резерви, зв’язки, ПРРО та друковані форми' },
  assets: { title: 'Основні засоби (10/13) та Валюта', subtitle: 'Амортизація за П(С)БО 7, курси НБУ (USD/EUR) та курсові різниці П(С)БО 21' },
  accounting: { title: 'Бухгалтерія №291 та SAF-T UA', subtitle: 'Головна книга, ОСВ, Субконто та е-аудит ДПС' },
  statutory: { title: 'Регламентована звітність ДПС', subtitle: 'Баланс Ф1, Фінрезультати Ф2, Декларація з ПДВ, Єдиний податок та Об’єднаний ЄСВ/4ДФ' },
  reports: { title: 'Управлінська аналітика та P&L', subtitle: 'Складські залишки FIFO, прибутковість, борги та Cash Flow' },
  catalogs: { title: 'Довідники та BOM', subtitle: 'Номенклатура, контрагенти, штатний розпис і специфікації BOM' },
  service: { title: 'Інтеграції та Сервіс', subtitle: 'BAS OData, Monobank, Приват24, Checkbox ПРРО та регламент' },
};

const DOCK_ACTIONS: Array<{
  label: string;
  docType: DocumentType;
  reqPerm: PermissionKey;
  icon: typeof ShoppingBag;
  bgVar: string;
  inkVar: string;
}> = [
  {
    label: 'Продаж',
    docType: 'sales_invoice',
    reqPerm: 'sales',
    icon: ShoppingBag,
    bgVar: 'var(--info-soft)',
    inkVar: 'var(--info-ink)',
  },
  {
    label: 'Прихід',
    docType: 'goods_receipt',
    reqPerm: 'purchases',
    icon: PackagePlus,
    bgVar: 'var(--pos-soft)',
    inkVar: 'var(--pos-ink)',
  },
  {
    label: 'Замовлення',
    docType: 'customer_order',
    reqPerm: 'sales',
    icon: ClipboardList,
    bgVar: 'var(--warn-soft)',
    inkVar: 'var(--warn-ink)',
  },
  {
    label: 'Платіж',
    docType: 'money_in',
    reqPerm: 'money',
    icon: CreditCard,
    bgVar: 'var(--violet-soft)',
    inkVar: 'var(--violet-ink)',
  },
];

function canAccessSection(sectionId: TopSectionKey, perms?: PermissionMap): boolean {
  if (!perms) return true;
  switch (sectionId) {
    case 'dashboard':
      return Boolean(perms.dashboard);
    case 'crm':
      return Boolean(perms.crm);
    case 'sales':
      return Boolean(perms.sales);
    case 'purchases':
      return Boolean(perms.purchases);
    case 'warehouse':
      return Boolean(perms.warehouse || perms.catalogs);
    case 'works':
      return Boolean(perms.production || perms.sales);
    case 'production':
      return Boolean(perms.production);
    case 'money':
      return Boolean(perms.money);
    case 'hr':
      return Boolean(perms.hr);
    case 'company':
      return Boolean(perms.accounting || perms.canManageOrgs);
    case 'settings':
      return Boolean(perms.canManageUsers || perms.canManageOrgs || perms.integrations);
    case 'integrations':
      return Boolean(perms.integrations);
  }
}

function shortOrgLabel(name: string): string {
  return name
    .replace(/^ТОВ\s*/i, '')
    .replace(/^ФОП\s*/i, '')
    .replace(/[«»"]/g, '')
    .trim();
}

function getPublicShareTokenFromUrl(): string | null {
  if (typeof window === 'undefined') return null;
  const match = window.location.pathname.match(/^\/share\/([A-Za-z0-9_-]{8,64})\/?$/);
  if (match) return match[1];
  const qs = new URLSearchParams(window.location.search).get('share');
  if (qs && /^[A-Za-z0-9_-]{8,64}$/.test(qs)) return qs;
  return null;
}

export function App() {
  const publicShareToken = getPublicShareTokenFromUrl();
  if (publicShareToken) {
    return <PublicDocumentPage token={publicShareToken} />;
  }
  return <AuthGate />;
}

function AuthGate() {
  const qc = useQueryClient();
  const [authUser, setAuthUser] = useState<AuthUserDto | null>(null);
  const [checking, setChecking] = useState<boolean>(() => Boolean(getAuthToken()));

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setAuthUser(null);
      qc.clear();
    });
    return () => setUnauthorizedHandler(null);
  }, [qc]);

  useEffect(() => {
    if (!getAuthToken()) {
      setChecking(false);
      return;
    }
    apiFetch<{ user: AuthUserDto }>('/api/auth/me')
      .then((res) => {
        setAuthUser(res.user);
        setActiveUserContext(res.user.role, res.user.fullName);
      })
      .catch(() => {
        setAuthToken(null);
        setAuthUser(null);
      })
      .finally(() => setChecking(false));
  }, []);

  const handleLogout = async () => {
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' });
    } catch {}
    setAuthToken(null);
    setActiveDepartmentId(null);
    setAuthUser(null);
    qc.clear();
  };

  if (checking) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 p-6">
        <BrandLogo2C size={48} />
        <div className="text-[14px] font-semibold" style={{ color: 'var(--muted)' }}>
          Перевірка сесії доступу 2С...
        </div>
      </div>
    );
  }

  if (!authUser) {
    return (
      <LoginPage
        onSuccess={(user) => {
          qc.clear();
          setAuthUser(user);
        }}
      />
    );
  }

  return <ErpShell currentUser={authUser} onLogout={handleLogout} />;
}

function ErpShell({
  currentUser,
  onLogout,
}: {
  currentUser: AuthUserDto;
  onLogout: () => void;
}) {
  const qc = useQueryClient();
  const [page, setPage] = useState<PageKey>('dashboard');
  const [activeCtx, setActiveCtx] = useState<ActiveContext>({ sectionId: 'dashboard' });
  const [docInitialType, setDocInitialType] = useState<string>('');
  const [catalogInitialTab, setCatalogInitialTab] = useState<CatalogTab>('items');
  const [megaMenuSection, setMegaMenuSection] = useState<MenuSection | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [movementsDoc, setMovementsDoc] = useState<DocumentSummary | null>(null);
  const [printDoc, setPrintDoc] = useState<DocumentSummary | null>(null);
  const [shareDoc, setShareDoc] = useState<DocumentSummary | null>(null);
  const [usersModal, setUsersModal] = useState<{
    open: boolean;
    tab: 'users' | 'groups' | 'password' | 'audit';
  }>({ open: false, tab: 'users' });
  const [cmdOpen, setCmdOpen] = useState(false);
  const [orgMenuOpen, setOrgMenuOpen] = useState(false);
  const [orgManagerOpen, setOrgManagerOpen] = useState(false);
  const [deptMenuOpen, setDeptMenuOpen] = useState(false);
  const [deptManagerOpen, setDeptManagerOpen] = useState(false);
  const [launcher, setLauncher] = useState<{ open: boolean; docType: DocumentType }>({
    open: false,
    docType: 'sales_invoice',
  });
  const [globalEditor, setGlobalEditor] = useState<{
    open: boolean;
    docType: DocumentType;
    documentId?: string | null;
    initialCounterpartyId?: string | null;
    initialItemId?: string | null;
    initialDate?: string | null;
    initialTab?: 'main' | 'relations' | 'history';
  }>({
    open: false,
    docType: 'sales_invoice',
    documentId: null,
    initialCounterpartyId: null,
    initialItemId: null,
    initialDate: null,
    initialTab: 'main',
  });

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCmdOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const { data: bootstrap, isLoading, error } = useQuery({
    queryKey: ['bootstrap', currentUser.id],
    queryFn: () => apiFetch<BootstrapData>('/api/bootstrap'),
  });

  if (isLoading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 p-6">
        <BrandLogo2C size={48} />
        <div className="text-[14px] font-semibold" style={{ color: 'var(--muted)' }}>
          Запуск облікового ядра 2С...
        </div>
      </div>
    );
  }

  if (error || !bootstrap) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div
          className="max-w-md p-6 text-[14px]"
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--r-lg)',
            boxShadow: 'var(--shadow-float)',
          }}
        >
          <div className="font-bold" style={{ color: 'var(--neg-ink)' }}>
            Немає зв’язку з сервером API
          </div>
          <p className="mt-1.5 text-[13px]" style={{ color: 'var(--muted)' }}>
            {(error as Error)?.message ?? 'Невідома помилка підключення'}
          </p>
        </div>
      </div>
    );
  }

  const handleSwitchOrg = (orgId: string) => {
    setActiveOrganizationId(orgId);
    setActiveDepartmentId(null);
    setOrgMenuOpen(false);
    setDeptMenuOpen(false);
    qc.invalidateQueries();
  };

  const handleSwitchDepartment = (deptId: string | null) => {
    setActiveDepartmentId(deptId ?? 'ALL');
    setDeptMenuOpen(false);
    qc.invalidateQueries();
  };

  const openQuickCreate = (
    docType: DocumentType,
    preset?: { counterpartyId?: string; itemId?: string; docDate?: string }
  ) => {
    setGlobalEditor({
      open: true,
      docType,
      documentId: null,
      initialCounterpartyId: preset?.counterpartyId ?? null,
      initialItemId: preset?.itemId ?? null,
      initialDate: preset?.docDate ?? null,
      initialTab: 'main',
    });
  };

  const openExistingDocument = (
    docId: string,
    docType: DocumentType,
    initialTab: 'main' | 'relations' | 'history' = 'main'
  ) => {
    setGlobalEditor({
      open: true,
      docType,
      documentId: docId,
      initialCounterpartyId: null,
      initialItemId: null,
      initialDate: null,
      initialTab,
    });
  };

  const navigateSimplePage = (
    targetPage: Exclude<PageKey, 'module'>,
    sectionId?: TopSectionKey
  ) => {
    const fallbackSectionMap: Record<Exclude<PageKey, 'module'>, TopSectionKey> = {
      dashboard: 'dashboard',
      crm: 'crm',
      documents: 'sales',
      assets: 'money',
      accounting: 'company',
      statutory: 'company',
      reports: 'company',
      catalogs: 'warehouse',
      service: 'integrations',
    };
    setPage(targetPage);
    if (targetPage === 'documents') setDocInitialType('');
    setActiveCtx({ sectionId: sectionId ?? fallbackSectionMap[targetPage] });
  };

  const applyTargetRoute = (
    target: TargetRoute,
    section: MenuSection,
    groupTitle?: string,
    item?: MenuSubItem
  ) => {
    if (target.kind === 'modal') {
      if (target.modal === 'organizations') setOrgManagerOpen(true);
      if (target.modal === 'departments') setDeptManagerOpen(true);
      if (target.modal === 'audit') setUsersModal({ open: true, tab: 'audit' });
      if (target.modal === 'users') setUsersModal({ open: true, tab: 'users' });
      if (target.modal === 'password') setUsersModal({ open: true, tab: 'password' });
      if (target.modal === 'new-doc') {
        setLauncher({ open: true, docType: target.docType ?? 'sales_invoice' });
      }
      return;
    }

    setActiveCtx({ sectionId: section.id, groupTitle, item });

    switch (target.kind) {
      case 'dashboard':
        setPage('dashboard');
        break;
      case 'crm':
        setPage('crm');
        break;
      case 'documents':
        setDocInitialType(target.docType ?? '');
        setPage('documents');
        break;
      case 'catalogs':
        setCatalogInitialTab(target.tab ?? 'items');
        setPage('catalogs');
        break;
      case 'accounting':
        setPage('accounting');
        break;
      case 'statutory':
        setPage('statutory');
        break;
      case 'reports':
        setPage('reports');
        break;
      case 'assets':
        setPage('assets');
        break;
      case 'service':
        setPage('service');
        break;
      case 'module':
        setPage('module');
        break;
    }
  };

  const handleTopSectionClick = (section: MenuSection) => {
    if (section.id === 'dashboard' || section.groups.length === 0) {
      setPage('dashboard');
      setActiveCtx({ sectionId: 'dashboard' });
      return;
    }
    setMegaMenuSection(section);
  };

  const liveUser = bootstrap.currentUser ?? currentUser;
  const perms = liveUser.effectivePermissions;
  const visibleSections = MENU_SECTIONS.filter((sec) => canAccessSection(sec.id, perms));
  const visibleDockActions = DOCK_ACTIONS.filter(
    (act) => !perms || perms[act.reqPerm] || (act.docType === 'money_in' && perms.sales)
  );
  const canManageUsers = Boolean(perms?.canManageUsers || liveUser.role === 'OWNER');
  const canManageOrgs = Boolean(perms?.canManageOrgs || liveUser.role === 'OWNER');
  const canManageDepts = canManageOrgs || canManageUsers;
  const activeDepartment =
    bootstrap.departments.find((dp) => dp.id === bootstrap.activeDepartmentId) ?? null;
  const canSwitchDepartments =
    bootstrap.departments.length > 1 || bootstrap.canSeeAllDepartments || canManageDepts;
  const activeDeptLabel = activeDepartment
    ? activeDepartment.name
    : bootstrap.canSeeAllDepartments
      ? 'Усі підрозділи'
      : bootstrap.departments.length > 1
        ? `Доступні (${bootstrap.departments.length})`
        : bootstrap.departments[0]?.name ?? 'Немає доступу';

  const isFop = bootstrap.organization.entityType === 'FOP';
  const activeSectionObj =
    MENU_SECTIONS.find((s) => s.id === activeCtx.sectionId) ?? MENU_SECTIONS[0];

  return (
    <div className="min-h-screen">
      <div className="app-shell">
        {/* 2.1 Верхня панель: Ряд 1 (Лого 2С + Пошук + Компанія), Ряд 2 (Навігація-«таблетка» дозволених розділів) */}
        <header className="mb-6 space-y-3 print:hidden">
          <div className="flex flex-wrap items-center justify-between gap-3">
            {/* Ліворуч: фірмовий логотип 2С */}
            <button
              type="button"
              onClick={() => navigateSimplePage('dashboard', 'dashboard')}
              className="flex min-h-[44px] shrink-0 items-center gap-3 rounded-2xl text-left"
            >
              <BrandLogo2C size={44} />
              <span className="min-w-0">
                <span
                  className="block font-display font-extrabold leading-tight"
                  style={{ fontSize: '20px', color: 'var(--text)', letterSpacing: '-0.03em' }}
                >
                  2С
                </span>
                <span
                  className="block text-[12px] font-medium leading-tight"
                  style={{ color: 'var(--muted)' }}
                >
                  Мульти-ФОП та ТОВ · ERP
                </span>
              </span>
            </button>

            {/* Праворуч: Пошук ⌘K + Перемикач підрозділу + Перемикач компанії */}
            <div className="flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setCmdOpen(true)}
                aria-label="Відкрити швидкий пошук (⌘K)"
                className="inline-flex min-h-[44px] items-center gap-2.5 px-3.5 text-[14px] font-bold transition"
                style={{
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--r-pill)',
                  color: 'var(--text-2)',
                  boxShadow: 'var(--shadow-soft)',
                }}
              >
                <Search className="h-4 w-4" style={{ color: 'var(--muted)' }} aria-hidden="true" />
                <span className="hidden sm:inline">Пошук</span>
                <kbd
                  className="rounded-md px-1.5 py-0.5 font-mono text-[11px] font-semibold"
                  style={{
                    background: 'var(--neutral-soft)',
                    color: 'var(--muted)',
                  }}
                >
                  ⌘K
                </kbd>
              </button>

              {/* Селектор підрозділу / філії */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => {
                    if (!canSwitchDepartments) return;
                    setOrgMenuOpen(false);
                    setDeptMenuOpen((v) => !v);
                  }}
                  aria-expanded={deptMenuOpen}
                  aria-haspopup={canSwitchDepartments ? 'menu' : undefined}
                  title={
                    canSwitchDepartments
                      ? 'Перемкнути активний підрозділ'
                      : `Доступ обмежено підрозділом: ${activeDeptLabel}`
                  }
                  className="inline-flex min-h-[44px] items-center gap-2 px-3 text-[13px] font-bold transition"
                  style={{
                    background: activeDepartment ? 'var(--primary-soft)' : 'var(--surface)',
                    border: activeDepartment
                      ? '1px solid var(--primary)'
                      : '1px solid var(--border)',
                    borderRadius: 'var(--r-pill)',
                    color: activeDepartment ? 'var(--primary-ink)' : 'var(--text)',
                    boxShadow: 'var(--shadow-soft)',
                    cursor: canSwitchDepartments ? 'pointer' : 'default',
                  }}
                >
                  <Network
                    className="h-3.5 w-3.5 shrink-0"
                    style={{ color: activeDepartment ? 'var(--primary)' : 'var(--muted)' }}
                    aria-hidden="true"
                  />
                  <span className="max-w-[125px] truncate sm:max-w-[175px]">
                    {activeDeptLabel}
                  </span>
                  {canSwitchDepartments ? (
                    <ChevronDown
                      className={`h-4 w-4 shrink-0 transition ${deptMenuOpen ? 'rotate-180' : ''}`}
                      style={{ color: 'var(--muted)' }}
                      aria-hidden="true"
                    />
                  ) : (
                    <Lock
                      className="h-3.5 w-3.5 shrink-0 opacity-75"
                      style={{ color: 'var(--primary)' }}
                      aria-hidden="true"
                    />
                  )}
                </button>

                {deptMenuOpen && canSwitchDepartments && (
                  <>
                    <div
                      className="fixed inset-0 z-30"
                      onClick={() => setDeptMenuOpen(false)}
                      aria-hidden="true"
                    />
                    <div
                      role="menu"
                      className="popin absolute right-0 z-40 mt-2 w-80 max-w-[calc(100vw-24px)] p-2.5"
                      style={{
                        background: 'var(--surface)',
                        border: '1px solid var(--border)',
                        borderRadius: 'var(--r-lg)',
                        boxShadow: 'var(--shadow-float)',
                      }}
                    >
                      <div
                        className="overline-label px-2.5 py-1.5"
                        style={{ color: 'var(--muted)' }}
                      >
                        Підрозділи ({bootstrap.departments.length})
                      </div>

                      <div className="max-h-64 space-y-1 overflow-y-auto">
                        {(bootstrap.canSeeAllDepartments || bootstrap.departments.length > 1) && (
                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => handleSwitchDepartment(null)}
                            className="flex min-h-[44px] w-full items-center justify-between gap-2 px-3 py-2 text-left transition"
                            style={{
                              borderRadius: 'var(--r-sm)',
                              background:
                                bootstrap.activeDepartmentId === null
                                  ? 'var(--primary-soft)'
                                  : 'transparent',
                              color:
                                bootstrap.activeDepartmentId === null
                                  ? 'var(--primary-ink)'
                                  : 'var(--text)',
                            }}
                          >
                            <span className="min-w-0">
                              <span className="block truncate text-[13px] font-bold">
                                {bootstrap.canSeeAllDepartments
                                  ? 'Усі підрозділи організації'
                                  : `Усі мої підрозділи (${bootstrap.departments.length})`}
                              </span>
                              <span className="block truncate text-[11px]" style={{ color: 'var(--muted)' }}>
                                Зведений перегляд даних і документів
                              </span>
                            </span>
                            {bootstrap.activeDepartmentId === null && (
                              <CheckCircle2
                                className="h-4 w-4 shrink-0"
                                style={{ color: 'var(--primary)' }}
                                aria-hidden="true"
                              />
                            )}
                          </button>
                        )}

                        {bootstrap.departments.map((dp) => {
                          const active = dp.id === bootstrap.activeDepartmentId;
                          return (
                            <button
                              key={dp.id}
                              type="button"
                              role="menuitem"
                              onClick={() => handleSwitchDepartment(dp.id)}
                              className="flex min-h-[44px] w-full items-center justify-between gap-2 px-3 py-2 text-left transition"
                              style={{
                                borderRadius: 'var(--r-sm)',
                                background: active ? 'var(--primary-soft)' : 'transparent',
                                color: active ? 'var(--primary-ink)' : 'var(--text)',
                              }}
                            >
                              <span className="min-w-0">
                                <span className="flex items-center gap-1.5">
                                  <span
                                    className="rounded px-1.5 py-0.5 font-mono text-[10px] font-extrabold uppercase"
                                    style={{
                                      background: 'var(--surface-2)',
                                      color: 'var(--primary-ink)',
                                      border: '1px solid var(--border)',
                                    }}
                                  >
                                    {dp.code}
                                  </span>
                                  <span className="truncate text-[13px] font-bold">{dp.name}</span>
                                </span>
                                {dp.headName && (
                                  <span
                                    className="mt-0.5 block truncate text-[11px]"
                                    style={{ color: 'var(--muted)' }}
                                  >
                                    Керівник: {dp.headName}
                                  </span>
                                )}
                              </span>
                              {active && (
                                <CheckCircle2
                                  className="h-4 w-4 shrink-0"
                                  style={{ color: 'var(--primary)' }}
                                  aria-hidden="true"
                                />
                              )}
                            </button>
                          );
                        })}
                      </div>

                      {canManageDepts && (
                        <div
                          className="mt-2 pt-2.5"
                          style={{ borderTop: '1px solid var(--border)' }}
                        >
                          <button
                            type="button"
                            onClick={() => {
                              setDeptMenuOpen(false);
                              setDeptManagerOpen(true);
                            }}
                            className="inline-flex min-h-[42px] w-full items-center justify-center gap-1.5 px-3 text-[13px] font-bold transition"
                            style={{
                              borderRadius: 'var(--r-sm)',
                              background: 'var(--surface-2)',
                              border: '1px solid var(--border-strong)',
                              color: 'var(--primary-ink)',
                            }}
                          >
                            <Plus className="h-4 w-4" aria-hidden="true" />
                            <span>Керувати підрозділами</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>

              {/* Селектор компанії / ФОП */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => {
                    setDeptMenuOpen(false);
                    setOrgMenuOpen((v) => !v);
                  }}
                  aria-expanded={orgMenuOpen}
                  aria-haspopup="menu"
                  className="inline-flex min-h-[44px] items-center gap-2 px-3 text-[13px] font-bold transition"
                  style={{
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--r-pill)',
                    color: 'var(--text)',
                    boxShadow: 'var(--shadow-soft)',
                  }}
                >
                  <span
                    className="rounded-full px-2 py-0.5 text-[11px] font-extrabold uppercase"
                    style={{
                      background: isFop ? 'var(--pos-soft)' : 'var(--primary-soft)',
                      color: isFop ? 'var(--pos-ink)' : 'var(--primary-ink)',
                    }}
                  >
                    {isFop ? 'ФОП' : 'ТОВ'}
                  </span>
                  <span className="max-w-[130px] truncate sm:max-w-[180px]">
                    {shortOrgLabel(bootstrap.organization.name)}
                  </span>
                  <ChevronDown
                    className={`h-4 w-4 shrink-0 transition ${orgMenuOpen ? 'rotate-180' : ''}`}
                    style={{ color: 'var(--muted)' }}
                    aria-hidden="true"
                  />
                </button>

                {orgMenuOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-30"
                      onClick={() => setOrgMenuOpen(false)}
                      aria-hidden="true"
                    />
                    <div
                      role="menu"
                      className="popin absolute right-0 z-40 mt-2 w-80 max-w-[calc(100vw-24px)] p-2.5"
                      style={{
                        background: 'var(--surface)',
                        border: '1px solid var(--border)',
                        borderRadius: 'var(--r-lg)',
                        boxShadow: 'var(--shadow-float)',
                      }}
                    >
                      <div
                        className="overline-label px-2.5 py-1.5"
                        style={{ color: 'var(--muted)' }}
                      >
                        Організації та ФОП ({bootstrap.organizations.length})
                      </div>
                      <div className="max-h-56 space-y-1 overflow-y-auto">
                        {bootstrap.organizations.map((org) => {
                          const active = org.id === bootstrap.organization.id;
                          const orgIsFop = org.entityType === 'FOP';
                          return (
                            <button
                              key={org.id}
                              type="button"
                              role="menuitem"
                              onClick={() => handleSwitchOrg(org.id)}
                              className="flex min-h-[44px] w-full items-center justify-between gap-2 px-3 py-2 text-left transition"
                              style={{
                                borderRadius: 'var(--r-sm)',
                                background: active ? 'var(--primary-soft)' : 'transparent',
                                color: active ? 'var(--primary-ink)' : 'var(--text)',
                              }}
                            >
                              <span className="min-w-0">
                                <span className="flex items-center gap-1.5">
                                  <span
                                    className="rounded px-1.5 py-0.5 text-[10px] font-extrabold uppercase"
                                    style={{
                                      background: orgIsFop
                                        ? 'var(--pos-soft)'
                                        : 'var(--primary-soft)',
                                      color: orgIsFop ? 'var(--pos-ink)' : 'var(--primary-ink)',
                                    }}
                                  >
                                    {orgIsFop ? 'ФОП' : 'ТОВ'}
                                  </span>
                                  <span className="truncate text-[13px] font-bold">{org.name}</span>
                                </span>
                                <span
                                  className="mt-0.5 block truncate text-[11px]"
                                  style={{ color: 'var(--muted)' }}
                                >
                                  {org.edrpou ? `Код ${org.edrpou} · ` : ''}
                                  {TAX_SYSTEM_LABELS[org.taxSystem] ?? ''}
                                </span>
                              </span>
                              {active && (
                                <CheckCircle2
                                  className="h-4 w-4 shrink-0"
                                  style={{ color: 'var(--primary)' }}
                                  aria-hidden="true"
                                />
                              )}
                            </button>
                          );
                        })}
                      </div>

                      <div
                        className="mt-2 space-y-2 pt-2.5"
                        style={{ borderTop: '1px solid var(--border)' }}
                      >
                        {canManageOrgs && (
                          <button
                            type="button"
                            onClick={() => {
                              setOrgMenuOpen(false);
                              setOrgManagerOpen(true);
                            }}
                            className="inline-flex min-h-[44px] w-full items-center justify-center gap-1.5 px-3 text-[13px] font-bold transition"
                            style={{
                              borderRadius: 'var(--r-sm)',
                              background: 'linear-gradient(135deg, var(--primary), var(--primary-2))',
                              color: 'var(--surface)',
                            }}
                          >
                            <Plus className="h-4 w-4" aria-hidden="true" />
                            <span>Додати ФОП / Керувати</span>
                          </button>
                        )}

                        {/* Поточний користувач, права та вихід */}
                        <div
                          className="space-y-2 p-3"
                          style={{
                            background: 'var(--surface-2)',
                            border: '1px solid var(--border)',
                            borderRadius: 'var(--r-sm)',
                          }}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="truncate text-[12px] font-extrabold" style={{ color: 'var(--text)' }}>
                                {liveUser.fullName}
                              </div>
                              <div className="truncate text-[11px]" style={{ color: 'var(--muted)' }}>
                                {liveUser.accessGroupName || USER_ROLE_META[liveUser.role]?.short} ·{' '}
                                <span className="font-mono">{liveUser.login}</span>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                setOrgMenuOpen(false);
                                onLogout();
                              }}
                              className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-bold"
                              style={{
                                background: 'var(--neg-soft)',
                                color: 'var(--neg-ink)',
                              }}
                            >
                              <LogOut className="h-3 w-3" aria-hidden="true" />
                              <span>Вийти</span>
                            </button>
                          </div>

                          <div className="grid grid-cols-2 gap-1.5">
                            {canManageUsers ? (
                              <button
                                type="button"
                                onClick={() => {
                                  setOrgMenuOpen(false);
                                  setUsersModal({ open: true, tab: 'users' });
                                }}
                                className="inline-flex min-h-[36px] items-center justify-center gap-1 rounded-lg px-2 text-[11px] font-bold"
                                style={{
                                  background: 'var(--primary-soft)',
                                  color: 'var(--primary-ink)',
                                }}
                              >
                                <Shield className="h-3.5 w-3.5" aria-hidden="true" />
                                <span>Користувачі</span>
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => {
                                  setOrgMenuOpen(false);
                                  setUsersModal({ open: true, tab: 'password' });
                                }}
                                className="inline-flex min-h-[36px] items-center justify-center gap-1 rounded-lg px-2 text-[11px] font-bold"
                                style={{
                                  background: 'var(--primary-soft)',
                                  color: 'var(--primary-ink)',
                                }}
                              >
                                <KeyRound className="h-3.5 w-3.5" aria-hidden="true" />
                                <span>Мій пароль</span>
                              </button>
                            )}
                            {canManageUsers ? (
                              <button
                                type="button"
                                onClick={() => {
                                  setOrgMenuOpen(false);
                                  setUsersModal({ open: true, tab: 'groups' });
                                }}
                                className="inline-flex min-h-[36px] items-center justify-center gap-1 rounded-lg px-2 text-[11px] font-bold"
                                style={{
                                  background: 'var(--surface)',
                                  border: '1px solid var(--border-strong)',
                                  color: 'var(--text-2)',
                                }}
                              >
                                <span>Групи прав</span>
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => {
                                  setOrgMenuOpen(false);
                                  setUsersModal({ open: true, tab: 'audit' });
                                }}
                                className="inline-flex min-h-[36px] items-center justify-center gap-1 rounded-lg px-2 text-[11px] font-bold"
                                style={{
                                  background: 'var(--surface)',
                                  border: '1px solid var(--border-strong)',
                                  color: 'var(--text-2)',
                                }}
                              >
                                <span>Аудит дій</span>
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Навігація-«таблетка» дозволених розділів */}
          <nav
            aria-label="Розділи системи"
            className={`nav-pill-bar desktop-nav-pill w-full ${
              visibleSections.length >= 8 ? 'justify-between' : 'justify-start'
            }`}
          >
            {visibleSections.map((sec) => {
              const isActive = activeCtx.sectionId === sec.id;
              const hasMenu = sec.groups.length > 0;
              return (
                <button
                  key={sec.id}
                  type="button"
                  data-active={isActive ? 'true' : undefined}
                  aria-current={isActive ? 'page' : undefined}
                  aria-haspopup={hasMenu ? 'dialog' : undefined}
                  onClick={() => handleTopSectionClick(sec)}
                  className="nav-pill-btn"
                >
                  <span>{sec.label}</span>
                  {hasMenu && (
                    <ChevronDown
                      className="h-3.5 w-3.5 opacity-65"
                      aria-hidden="true"
                    />
                  )}
                </button>
              );
            })}
          </nav>
        </header>

        {/* Підзаголовок та навігаційна крихта для відкритих розділів */}
        {page !== 'dashboard' && (
          <div className="mb-6 flex flex-wrap items-end justify-between gap-3 pt-1 print:hidden">
            <div className="min-w-0">
              <div className="overline-label" style={{ color: 'var(--primary)' }}>
                {activeSectionObj.label}
                {activeCtx.groupTitle ? ` · ${activeCtx.groupTitle}` : ''}
                {activeCtx.item ? ` · ${activeCtx.item.label}` : ''}
              </div>
              <h1
                className="mt-1 font-display font-extrabold tracking-tight"
                style={{
                  fontSize: 'clamp(24px, 3vw, 32px)',
                  color: 'var(--text)',
                  letterSpacing: '-0.02em',
                }}
              >
                {activeCtx.item
                  ? activeCtx.item.label
                  : page !== 'module'
                    ? PAGE_TITLES[page].title
                    : activeSectionObj.label}
              </h1>
              <p className="mt-0.5 text-[14px]" style={{ color: 'var(--muted)' }}>
                {page !== 'module' ? PAGE_TITLES[page].subtitle : activeSectionObj.subtitle}
              </p>
            </div>

            {activeSectionObj.groups.length > 0 && (
              <button
                type="button"
                onClick={() => setMegaMenuSection(activeSectionObj)}
                className="inline-flex min-h-[44px] items-center gap-2 px-4 text-[13px] font-bold transition"
                style={{
                  background: 'var(--surface)',
                  border: '1px solid var(--border-strong)',
                  borderRadius: 'var(--r-pill)',
                  color: 'var(--text)',
                  boxShadow: 'var(--shadow-soft)',
                }}
              >
                <LayoutGrid className="h-4 w-4" style={{ color: 'var(--primary)' }} aria-hidden="true" />
                <span>Усі пункти «{activeSectionObj.label}»</span>
                <ChevronDown className="h-3.5 w-3.5" style={{ color: 'var(--muted)' }} aria-hidden="true" />
              </button>
            )}
          </div>
        )}

        {/* Main Workspace Content */}
        <main>
          {page === 'dashboard' && (
            <DashboardPage
              organization={bootstrap.organization}
              activeDepartment={activeDepartment}
              activeDepartmentLabel={activeDeptLabel}
              permissions={perms}
              onOpenMovements={setMovementsDoc}
              onNavigateDocs={() => navigateSimplePage('documents', 'sales')}
              onNavigate={(target) => navigateSimplePage(target)}
            />
          )}
          {page === 'crm' && <CrmPage bootstrap={bootstrap} />}
          {page === 'documents' && (
            <DocumentsPage
              bootstrap={bootstrap}
              initialDocType={docInitialType}
              onOpenMovements={setMovementsDoc}
            />
          )}
          {page === 'assets' && <AssetsAndCurrencyPage />}
          {page === 'accounting' && <AccountingPage bootstrap={bootstrap} />}
          {page === 'statutory' && <StatutoryReportsPage />}
          {page === 'reports' && <ReportsPage bootstrap={bootstrap} />}
          {page === 'catalogs' && (
            <CatalogsPage bootstrap={bootstrap} initialTab={catalogInitialTab} />
          )}
          {page === 'service' && <ImportAndServicePage bootstrap={bootstrap} />}
          {page === 'module' && activeCtx.item && (
            <SectionModuleView
              section={activeSectionObj}
              groupTitle={activeCtx.groupTitle ?? ''}
              item={activeCtx.item}
              organization={bootstrap.organization}
              onSelectSibling={(sec, grp, it) => applyTargetRoute(it.target, sec, grp, it)}
              onCreateDoc={(dt) => setLauncher({ open: true, docType: dt })}
              onOpenRelatedPage={(p) => navigateSimplePage(p, activeSectionObj.id)}
            />
          )}
        </main>
      </div>

      {/* 3. Десктопний авто-схований док швидких дій (виїжджає при наведенні вниз) */}
      <div className="dock-hover-zone print:hidden">
        <div className="dock-peek-handle" aria-hidden="true">
          <span className="dock-peek-pill" />
          <span>Швидкі дії</span>
          <ChevronUp className="h-3.5 w-3.5" />
        </div>

        <div
          role="toolbar"
          aria-label="Швидкі дії створення документів"
          className="quick-dock"
        >
          {visibleDockActions.map((act) => {
            const Icon = act.icon;
            return (
              <button
                key={act.label}
                type="button"
                onClick={() => setLauncher({ open: true, docType: act.docType })}
                className="dock-item"
              >
                <span
                  className="flex h-[26px] w-[26px] items-center justify-center rounded-full"
                  style={{ background: act.bgVar, color: act.inkVar }}
                >
                  <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                </span>
                <span>{act.label}</span>
              </button>
            );
          })}

          <button
            type="button"
            onClick={() => setLauncher({ open: true, docType: 'sales_invoice' })}
            aria-label="Новий документ"
            className="dock-primary"
          >
            <Plus className="h-5 w-5" aria-hidden="true" />
            <span className="dock-primary-label">Новий документ</span>
          </button>
        </div>
      </div>

      {/* 3.1 Мобільна нижня панель навігації (<= 768px) */}
      <nav aria-label="Мобільна навігація" className="mobile-tab-bar print:hidden">
        <button
          type="button"
          data-active={page === 'dashboard' ? 'true' : undefined}
          onClick={() => navigateSimplePage('dashboard', 'dashboard')}
          className="mobile-tab-btn"
        >
          <LayoutDashboard className="h-5 w-5" aria-hidden="true" />
          <span>Огляд</span>
        </button>

        <button
          type="button"
          data-active={page === 'documents' ? 'true' : undefined}
          onClick={() => navigateSimplePage('documents', 'sales')}
          className="mobile-tab-btn"
        >
          <FileText className="h-5 w-5" aria-hidden="true" />
          <span>Документи</span>
        </button>

        <button
          type="button"
          aria-label="Створити новий документ"
          onClick={() => setLauncher({ open: true, docType: 'customer_order' })}
          className="mobile-tab-fab"
        >
          <Plus className="h-6 w-6" aria-hidden="true" />
        </button>

        <button
          type="button"
          data-active={page === 'crm' ? 'true' : undefined}
          onClick={() => navigateSimplePage('crm', 'crm')}
          className="mobile-tab-btn"
        >
          <Kanban className="h-5 w-5" aria-hidden="true" />
          <span>CRM</span>
        </button>

        <button
          type="button"
          data-active={mobileMenuOpen ? 'true' : undefined}
          onClick={() => setMobileMenuOpen(true)}
          className="mobile-tab-btn"
        >
          <Menu className="h-5 w-5" aria-hidden="true" />
          <span>Меню</span>
        </button>
      </nav>

      {/* Мобільна шторка дозволених розділів */}
      {mobileMenuOpen && (
        <MobileMenuSheet
          bootstrap={bootstrap}
          currentUser={liveUser}
          visibleSections={visibleSections}
          activeSectionId={activeCtx.sectionId}
          onSelectDepartment={handleSwitchDepartment}
          onOpenDepartmentsManager={() => setDeptManagerOpen(true)}
          onSelectItem={(sec, grp, it) => applyTargetRoute(it.target, sec, grp, it)}
          onSelectDashboard={() => navigateSimplePage('dashboard', 'dashboard')}
          onOpenOrgManager={() => setOrgManagerOpen(true)}
          onOpenUsersModal={(tab) => setUsersModal({ open: true, tab })}
          onLogout={onLogout}
          onClose={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Спливаюче мега-меню вибраного розділу */}
      {megaMenuSection && (
        <SectionMegaMenuModal
          section={megaMenuSection}
          activeItemId={activeCtx.item?.id ?? null}
          onSelectItem={(sec, grp, it) => applyTargetRoute(it.target, sec, grp, it)}
          onOpenSectionDefault={(sec) => applyTargetRoute(sec.defaultTarget, sec)}
          onClose={() => setMegaMenuSection(null)}
        />
      )}

      {/* 5.1 Модальне вікно «Новий документ» */}
      {launcher.open && (
        <NewDocumentLauncherModal
          bootstrap={bootstrap}
          initialDocType={launcher.docType}
          onClose={() => setLauncher((s) => ({ ...s, open: false }))}
          onProceed={({ docType, counterpartyId, docDate }) =>
            openQuickCreate(docType, { counterpartyId, docDate })
          }
        />
      )}

      {/* 5.2 Командна палітра «Розумний пошук» (⌘K) */}
      {cmdOpen && (
        <CommandPaletteModal
          bootstrap={bootstrap}
          onClose={() => setCmdOpen(false)}
          onNavigate={(target) => navigateSimplePage(target)}
          onCreateDoc={openQuickCreate}
          onOpenDocument={openExistingDocument}
        />
      )}

      {/* 5.3 Бічна панель «Проводки документа» */}
      {movementsDoc && (
        <MovementsModal
          doc={movementsDoc}
          onClose={() => setMovementsDoc(null)}
          onOpenDocument={(doc) => openExistingDocument(doc.id, doc.docType)}
          onPrintDocument={(doc) => setPrintDoc(doc)}
          onShareDocument={(doc) => setShareDoc(doc)}
        />
      )}

      {/* Поділитися відкритим посиланням у месенджер */}
      {shareDoc && (
        <ShareDocumentModal
          documentId={shareDoc.id}
          docNumber={shareDoc.docNumber}
          onClose={() => setShareDoc(null)}
        />
      )}

      {/* Повний редактор документа */}
      {globalEditor.open && (
        <DocumentEditorModal
          key={`${globalEditor.documentId ?? 'new'}-${globalEditor.docType}-${globalEditor.initialCounterpartyId ?? ''}-${globalEditor.initialItemId ?? ''}-${globalEditor.initialDate ?? ''}-${globalEditor.initialTab ?? 'main'}`}
          bootstrap={bootstrap}
          docType={globalEditor.docType}
          documentId={globalEditor.documentId}
          initialCounterpartyId={globalEditor.initialCounterpartyId}
          initialItemId={globalEditor.initialItemId}
          initialDate={globalEditor.initialDate}
          initialTab={globalEditor.initialTab}
          onClose={() => setGlobalEditor((s) => ({ ...s, open: false }))}
          onSaved={() => qc.invalidateQueries()}
        />
      )}

      {/* Друкована форма / PDF */}
      {printDoc && (
        <PrintableDocumentModal doc={printDoc} onClose={() => setPrintDoc(null)} />
      )}

      {/* Керування організаціями та ФОП */}
      {orgManagerOpen && (
        <OrganizationsManagerModal
          activeOrgId={bootstrap.organization.id}
          onSelectOrg={handleSwitchOrg}
          onClose={() => setOrgManagerOpen(false)}
        />
      )}

      {/* Керування підрозділами та філіями */}
      {deptManagerOpen && (
        <DepartmentsManagerModal
          organization={bootstrap.organization}
          activeDepartmentId={bootstrap.activeDepartmentId}
          canSeeAllDepartments={bootstrap.canSeeAllDepartments}
          onSelectDepartment={handleSwitchDepartment}
          onClose={() => setDeptManagerOpen(false)}
        />
      )}

      {/* Користувачі, групи доступу, права, зміна пароля та аудит */}
      {usersModal.open && (
        <UsersAndRightsModal
          currentUser={liveUser}
          organizations={bootstrap.organizations}
          departments={bootstrap.allDepartments}
          initialTab={usersModal.tab}
          onClose={() => setUsersModal((s) => ({ ...s, open: false }))}
        />
      )}
    </div>
  );
}
