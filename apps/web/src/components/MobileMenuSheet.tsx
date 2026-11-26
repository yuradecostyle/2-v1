import { useMemo, useState } from 'react';
import {
  X,
  Search,
  ChevronDown,
  Building2,
  Plus,
  LayoutDashboard,
  Shield,
  LogOut,
  Network,
} from 'lucide-react';
import {
  TAX_SYSTEM_LABELS,
  USER_ROLE_META,
  type AuthUserDto,
  type BootstrapData,
} from '../lib/api';
import {
  type MenuSection,
  type MenuSubItem,
} from '../lib/menuConfig';
import { OverlayDialog } from './OverlayDialog';

interface Props {
  bootstrap: BootstrapData;
  currentUser: AuthUserDto;
  visibleSections: MenuSection[];
  activeSectionId: string;
  onSelectDepartment: (deptId: string | null) => void;
  onOpenDepartmentsManager: () => void;
  onSelectItem: (section: MenuSection, groupTitle: string, item: MenuSubItem) => void;
  onSelectDashboard: () => void;
  onOpenOrgManager: () => void;
  onOpenUsersModal: (tab: 'users' | 'groups' | 'password' | 'audit') => void;
  onLogout: () => void;
  onClose: () => void;
}

export function MobileMenuSheet({
  bootstrap,
  currentUser,
  visibleSections,
  activeSectionId,
  onSelectDepartment,
  onOpenDepartmentsManager,
  onSelectItem,
  onSelectDashboard,
  onOpenOrgManager,
  onOpenUsersModal,
  onLogout,
  onClose,
}: Props) {
  const [query, setQuery] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(
    activeSectionId !== 'dashboard' ? activeSectionId : visibleSections.find((s) => s.groups.length > 0)?.id ?? null
  );

  const sectionsWithGroups = useMemo(
    () => visibleSections.filter((s) => s.groups.length > 0),
    [visibleSections]
  );

  const filteredSections = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sectionsWithGroups;
    return sectionsWithGroups
      .map((sec) => ({
        ...sec,
        groups: sec.groups
          .map((g) => ({
            ...g,
            items: g.items.filter(
              (it) =>
                it.label.toLowerCase().includes(q) ||
                g.title.toLowerCase().includes(q) ||
                sec.label.toLowerCase().includes(q)
            ),
          }))
          .filter((g) => g.items.length > 0),
      }))
      .filter((sec) => sec.groups.length > 0);
  }, [sectionsWithGroups, query]);

  const isFop = bootstrap.organization.entityType === 'FOP';

  return (
    <OverlayDialog
      ariaLabel="Мобільне меню розділів"
      variant="drawer"
      onClose={onClose}
    >
      {(requestClose) => (
        <div className="flex h-full flex-col">
          {/* Header */}
          <div
            className="flex items-center justify-between gap-2 px-5 pt-5 pb-3.5"
            style={{ borderBottom: '1px solid var(--border)' }}
          >
            <div>
              <div className="overline-label" style={{ color: 'var(--primary)' }}>
                Навігація
              </div>
              <h2 className="font-display text-[20px] font-extrabold" style={{ color: 'var(--text)' }}>
                Усі розділи системи
              </h2>
            </div>
            <button
              type="button"
              onClick={requestClose}
              aria-label="Закрити"
              className="flex h-[44px] w-[44px] items-center justify-center rounded-full"
              style={{
                background: 'var(--surface-2)',
                border: '1px solid var(--border)',
                color: 'var(--muted)',
              }}
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>

          {/* Search & Org card */}
          <div className="space-y-3 px-5 pt-4 pb-3" style={{ borderBottom: '1px solid var(--border)' }}>
            {/* Org Switcher Card */}
            <button
              type="button"
              onClick={() => {
                requestClose();
                window.setTimeout(onOpenOrgManager, 10);
              }}
              className="flex min-h-[52px] w-full items-center justify-between gap-2 px-3.5 py-2.5 text-left"
              style={{
                background: 'var(--surface-2)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--r-md)',
              }}
            >
              <span className="flex min-w-0 items-center gap-2.5">
                <span
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
                  style={{
                    background: isFop ? 'var(--pos-soft)' : 'var(--primary-soft)',
                    color: isFop ? 'var(--pos-ink)' : 'var(--primary-ink)',
                  }}
                >
                  <Building2 className="h-4 w-4" aria-hidden="true" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-bold" style={{ color: 'var(--text)' }}>
                    {bootstrap.organization.name}
                  </span>
                  <span className="block truncate text-[11px]" style={{ color: 'var(--muted)' }}>
                    {TAX_SYSTEM_LABELS[bootstrap.organization.taxSystem] ?? ''}
                  </span>
                </span>
              </span>
              <span
                className="inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold"
                style={{
                  background: 'var(--primary-soft)',
                  color: 'var(--primary-ink)',
                }}
              >
                <Plus className="h-3 w-3" aria-hidden="true" /> Змінити
              </span>
            </button>

            {/* Department Switcher */}
            {bootstrap.departments.length > 0 && (
              <div
                className="space-y-2 p-3"
                style={{
                  background: 'var(--surface-2)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--r-md)',
                }}
              >
                <div className="flex items-center justify-between gap-2">
                  <span
                    className="inline-flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wider"
                    style={{ color: 'var(--muted)' }}
                  >
                    <Network className="h-3.5 w-3.5" style={{ color: 'var(--primary)' }} />
                    Підрозділ
                  </span>
                  {(currentUser.effectivePermissions?.canManageOrgs ||
                    currentUser.effectivePermissions?.canManageUsers ||
                    currentUser.role === 'OWNER') && (
                    <button
                      type="button"
                      onClick={() => {
                        requestClose();
                        window.setTimeout(onOpenDepartmentsManager, 10);
                      }}
                      className="text-[11px] font-bold"
                      style={{ color: 'var(--primary-ink)' }}
                    >
                      Керувати
                    </button>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {(bootstrap.canSeeAllDepartments || bootstrap.departments.length > 1) && (
                    <button
                      type="button"
                      onClick={() => {
                        onSelectDepartment(null);
                        requestClose();
                      }}
                      className="rounded-full px-2.5 py-1 text-[11.5px] font-bold"
                      style={{
                        background:
                          bootstrap.activeDepartmentId === null
                            ? 'var(--primary)'
                            : 'var(--surface)',
                        color:
                          bootstrap.activeDepartmentId === null
                            ? 'var(--surface)'
                            : 'var(--text-2)',
                        border: '1px solid var(--border-strong)',
                      }}
                    >
                      {bootstrap.canSeeAllDepartments ? 'Усі' : `Мої (${bootstrap.departments.length})`}
                    </button>
                  )}
                  {bootstrap.departments.map((dp) => {
                    const active = dp.id === bootstrap.activeDepartmentId;
                    return (
                      <button
                        key={dp.id}
                        type="button"
                        onClick={() => {
                          onSelectDepartment(dp.id);
                          requestClose();
                        }}
                        className="rounded-full px-2.5 py-1 text-[11.5px] font-bold"
                        style={{
                          background: active ? 'var(--primary)' : 'var(--surface)',
                          color: active ? 'var(--surface)' : 'var(--text-2)',
                          border: '1px solid var(--border-strong)',
                        }}
                      >
                        {dp.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Quick filter */}
            <div
              className="flex min-h-[44px] items-center gap-2 px-3.5"
              style={{
                background: 'var(--surface)',
                border: '1px solid var(--border-strong)',
                borderRadius: 'var(--r-sm)',
              }}
            >
              <Search className="h-4 w-4 shrink-0" style={{ color: 'var(--muted)' }} aria-hidden="true" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Знайти розділ або пункт меню..."
                aria-label="Пошук у меню"
                className="w-full bg-transparent text-[14px] focus:outline-none"
                style={{ color: 'var(--text)' }}
              />
            </div>
          </div>

          {/* Scrollable Accordion List */}
          <div className="flex-1 space-y-2 overflow-y-auto px-5 py-4">
            {!query.trim() && (
              <button
                type="button"
                onClick={() => {
                  requestClose();
                  window.setTimeout(onSelectDashboard, 10);
                }}
                className="flex min-h-[46px] w-full items-center gap-3 px-3.5 text-[14px] font-bold"
                style={{
                  borderRadius: 'var(--r-md)',
                  background:
                    activeSectionId === 'dashboard' ? 'var(--text)' : 'var(--surface-2)',
                  color:
                    activeSectionId === 'dashboard' ? 'var(--surface)' : 'var(--text)',
                }}
              >
                <LayoutDashboard className="h-4 w-4" aria-hidden="true" />
                <span>Дашборд (Огляд бізнесу)</span>
              </button>
            )}

            {filteredSections.map((sec) => {
              const isOpen = query.trim().length > 0 || expandedId === sec.id;
              return (
                <div
                  key={sec.id}
                  style={{
                    background: 'var(--surface-2)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--r-md)',
                  }}
                >
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    onClick={() => setExpandedId(isOpen ? null : sec.id)}
                    className="flex min-h-[48px] w-full items-center justify-between gap-2 px-4 text-left text-[15px] font-extrabold"
                    style={{ color: 'var(--text)' }}
                  >
                    <span>{sec.label}</span>
                    <ChevronDown
                      className={`h-4 w-4 transition ${isOpen ? 'rotate-180' : ''}`}
                      style={{ color: 'var(--muted)' }}
                      aria-hidden="true"
                    />
                  </button>

                  {isOpen && (
                    <div
                      className="space-y-3 px-4 pb-4 pt-1"
                      style={{ borderTop: '1px solid var(--border)' }}
                    >
                      {sec.groups.map((grp) => (
                        <div key={grp.title} className="space-y-1">
                          <div
                            className="overline-label pt-1"
                            style={{ color: 'var(--primary)' }}
                          >
                            {grp.title}
                          </div>
                          <div className="space-y-0.5">
                            {grp.items.map((it) => (
                              <button
                                key={it.id}
                                type="button"
                                onClick={() => {
                                  requestClose();
                                  window.setTimeout(
                                    () => onSelectItem(sec, grp.title, it),
                                    10
                                  );
                                }}
                                className="flex min-h-[40px] w-full items-center px-2.5 text-left text-[14px] font-semibold"
                                style={{
                                  borderRadius: 'var(--r-sm)',
                                  color: 'var(--text-2)',
                                }}
                              >
                                {it.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Footer: Logged-in user, Users & Rights, Logout */}
          <div
            className="space-y-2.5 px-5 py-3.5"
            style={{
              borderTop: '1px solid var(--border)',
              background: 'var(--surface)',
            }}
          >
            <div className="flex items-center justify-between gap-2 text-[12px]">
              <div className="min-w-0">
                <div className="truncate font-extrabold" style={{ color: 'var(--text)' }}>
                  {currentUser.fullName}
                </div>
                <div className="truncate text-[11px]" style={{ color: 'var(--muted)' }}>
                  {currentUser.accessGroupName || USER_ROLE_META[currentUser.role]?.short} · {currentUser.login}
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  requestClose();
                  window.setTimeout(onLogout, 10);
                }}
                className="inline-flex min-h-[38px] shrink-0 items-center gap-1 px-3 text-[12px] font-bold"
                style={{
                  borderRadius: 'var(--r-sm)',
                  background: 'var(--neg-soft)',
                  color: 'var(--neg-ink)',
                }}
              >
                <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Вийти</span>
              </button>
            </div>
            <button
              type="button"
              onClick={() => {
                requestClose();
                window.setTimeout(
                  () =>
                    onOpenUsersModal(
                      currentUser.effectivePermissions?.canManageUsers ? 'users' : 'password'
                    ),
                  10
                );
              }}
              className="inline-flex min-h-[42px] w-full items-center justify-center gap-2 text-[13px] font-bold"
              style={{
                borderRadius: 'var(--r-sm)',
                background: 'var(--primary-soft)',
                color: 'var(--primary-ink)',
              }}
            >
              <Shield className="h-4 w-4" aria-hidden="true" />
              <span>
                {currentUser.effectivePermissions?.canManageUsers
                  ? 'Користувачі, групи та права'
                  : 'Мій пароль та аудит'}
              </span>
            </button>
          </div>
        </div>
      )}
    </OverlayDialog>
  );
}
