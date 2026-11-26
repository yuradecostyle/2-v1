import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  X,
  Plus,
  Users,
  Shield,
  KeyRound,
  History,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
  Pencil,
  Trash2,
  Ban,
  Unlock,
  RefreshCw,
  FolderKey,
  Network,
} from 'lucide-react';
import {
  apiFetch,
  fmtDate,
  PERMISSION_CATALOG,
  USER_ROLE_META,
  type AccessGroupDto,
  type AuthUserDto,
  type DepartmentDto,
  type OrganizationDto,
  type PermissionKey,
  type PermissionMap,
  type UserRole,
} from '../lib/api';
import { OverlayDialog } from './OverlayDialog';

interface AuditLogRow {
  id: string;
  userName: string;
  userRole: string;
  action: string;
  entityType: string;
  summary: string;
  createdAt: string;
}

interface Props {
  currentUser: AuthUserDto;
  organizations: OrganizationDto[];
  departments?: DepartmentDto[];
  initialTab?: 'users' | 'groups' | 'password' | 'audit';
  onClose: () => void;
}

function generateRandomPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  let out = '';
  for (let i = 0; i < 10; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

function makePermMap(enabled: PermissionKey[]): PermissionMap {
  const set = new Set(enabled);
  const out = {} as PermissionMap;
  for (const item of PERMISSION_CATALOG) {
    out[item.key] = set.has(item.key);
  }
  return out;
}

const PRESET_ALL = makePermMap(PERMISSION_CATALOG.map((p) => p.key));
const PRESET_SALES = makePermMap(['dashboard', 'crm', 'sales', 'catalogs', 'reports', 'canPostDocs']);
const PRESET_PURCHASES = makePermMap(['dashboard', 'purchases', 'warehouse', 'catalogs', 'reports', 'canPostDocs']);
const PRESET_EMPTY = makePermMap(['dashboard']);

function PermissionCheckboxes({
  value,
  onChange,
}: {
  value: PermissionMap;
  onChange: (next: PermissionMap) => void;
}) {
  const sections = PERMISSION_CATALOG.filter((p) => p.group === 'sections');
  const actions = PERMISSION_CATALOG.filter((p) => p.group === 'actions');

  const toggle = (k: PermissionKey) => {
    onChange({ ...value, [k]: !value[k] });
  };

  return (
    <div
      className="space-y-3 p-4"
      style={{
        background: 'var(--surface-2)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--r-md)',
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-[13px] font-extrabold" style={{ color: 'var(--text)' }}>
          Права доступу (галочки на розділи та дії)
        </div>
        <div className="flex flex-wrap gap-1.5">
          {[
            { label: 'Продажі', preset: PRESET_SALES },
            { label: 'Закупівлі', preset: PRESET_PURCHASES },
            { label: 'Усі права', preset: PRESET_ALL },
            { label: 'Мінімум', preset: PRESET_EMPTY },
          ].map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => onChange({ ...p.preset })}
              className="rounded-full px-2.5 py-1 text-[11px] font-bold transition"
              style={{
                background: 'var(--surface)',
                border: '1px solid var(--border-strong)',
                color: 'var(--primary-ink)',
              }}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="overline-label mb-1.5" style={{ color: 'var(--muted)' }}>
          Розділи та інструменти
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {sections.map((perm) => {
            const checked = Boolean(value[perm.key]);
            return (
              <label
                key={perm.key}
                className="flex cursor-pointer items-start gap-2.5 px-3 py-2.5 transition"
                style={{
                  background: checked ? 'var(--primary-soft)' : 'var(--surface)',
                  border: checked
                    ? '1px solid var(--primary)'
                    : '1px solid var(--border)',
                  borderRadius: 'var(--r-sm)',
                }}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggle(perm.key)}
                  className="mt-0.5 h-4 w-4 shrink-0"
                />
                <span className="min-w-0">
                  <span
                    className="block text-[12.5px] font-bold leading-tight"
                    style={{ color: checked ? 'var(--primary-ink)' : 'var(--text)' }}
                  >
                    {perm.label}
                  </span>
                  <span className="mt-0.5 block text-[11px] leading-snug" style={{ color: 'var(--muted)' }}>
                    {perm.hint}
                  </span>
                </span>
              </label>
            );
          })}
        </div>
      </div>

      <div>
        <div className="overline-label mb-1.5" style={{ color: 'var(--muted)' }}>
          Операційні дії та адміністрування
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {actions.map((perm) => {
            const checked = Boolean(value[perm.key]);
            return (
              <label
                key={perm.key}
                className="flex cursor-pointer items-start gap-2.5 px-3 py-2.5 transition"
                style={{
                  background: checked ? 'var(--pos-soft)' : 'var(--surface)',
                  border: checked
                    ? '1px solid var(--pos)'
                    : '1px solid var(--border)',
                  borderRadius: 'var(--r-sm)',
                }}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggle(perm.key)}
                  className="mt-0.5 h-4 w-4 shrink-0"
                />
                <span className="min-w-0">
                  <span
                    className="block text-[12.5px] font-bold leading-tight"
                    style={{ color: checked ? 'var(--pos-ink)' : 'var(--text)' }}
                  >
                    {perm.label}
                  </span>
                  <span className="mt-0.5 block text-[11px] leading-snug" style={{ color: 'var(--muted)' }}>
                    {perm.hint}
                  </span>
                </span>
              </label>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function UsersAndRightsModal({
  currentUser,
  organizations,
  departments: initialDepartments = [],
  initialTab = 'users',
  onClose,
}: Props) {
  const qc = useQueryClient();
  const canManageUsers = Boolean(
    currentUser.effectivePermissions?.canManageUsers || currentUser.role === 'OWNER'
  );
  const [tab, setTab] = useState<'users' | 'groups' | 'password' | 'audit'>(
    !canManageUsers && (initialTab === 'users' || initialTab === 'groups')
      ? 'password'
      : initialTab
  );
  const [userFormMode, setUserFormMode] = useState<'list' | 'create' | 'edit'>('list');
  const [groupFormMode, setGroupFormMode] = useState<'list' | 'create' | 'edit'>('list');
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [createdCredentials, setCreatedCredentials] = useState<{
    fullName: string;
    login: string;
    password: string;
  } | null>(null);
  const [copiedCreds, setCopiedCreds] = useState(false);

  // Employee Form
  const [userForm, setUserForm] = useState({
    fullName: '',
    login: '',
    email: '',
    password: '',
    accessGroupId: '' as string,
    departmentId: '' as string,
    deptScopeMode: 'own' as 'all' | 'own' | 'custom',
    allowedDepartmentIds: [] as string[],
    role: 'SALES_MANAGER' as UserRole,
    useCustomPerms: false,
    customPerms: { ...PRESET_SALES } as PermissionMap,
    allOrgs: true,
    allowedOrgIds: [] as string[],
    isActive: true,
  });

  // Access Group Form
  const [groupForm, setGroupForm] = useState({
    name: '',
    description: '',
    baseRole: 'CUSTOM' as UserRole,
    permissions: { ...PRESET_SALES } as PermissionMap,
  });

  // Self Password Change Form
  const [pwForm, setPwForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });

  const groupsQuery = useQuery({
    queryKey: ['access-groups'],
    enabled: canManageUsers,
    queryFn: () => apiFetch<AccessGroupDto[]>('/api/access-groups'),
  });

  const deptsQuery = useQuery({
    queryKey: ['all-departments-admin'],
    enabled: canManageUsers,
    queryFn: () => apiFetch<DepartmentDto[]>('/api/departments?scope=all'),
  });

  const usersQuery = useQuery({
    queryKey: ['admin-users'],
    enabled: canManageUsers && tab === 'users',
    queryFn: () => apiFetch<AuthUserDto[]>('/api/users'),
  });

  const auditQuery = useQuery({
    queryKey: ['audit-logs'],
    enabled: tab === 'audit',
    queryFn: () => apiFetch<AuditLogRow[]>('/api/audit-logs'),
  });

  const groups = groupsQuery.data ?? [];
  const allDepts = deptsQuery.data ?? initialDepartments;
  const deptNameMap = new Map(allDepts.map((d) => [d.id, d.name]));

  const openCreateUser = () => {
    setError(null);
    setNotice(null);
    setCreatedCredentials(null);
    setEditingUserId(null);
    const salesGroup = groups.find((g) => g.baseRole === 'SALES_MANAGER');
    const defaultDept = allDepts.find((d) => d.code === 'SALES') ?? allDepts[0];
    setUserForm({
      fullName: '',
      login: '',
      email: '',
      password: generateRandomPassword(),
      accessGroupId: salesGroup?.id ?? '',
      departmentId: defaultDept?.id ?? '',
      deptScopeMode: defaultDept ? 'own' : 'all',
      allowedDepartmentIds: defaultDept ? [defaultDept.id] : [],
      role: salesGroup?.baseRole ?? 'SALES_MANAGER',
      useCustomPerms: false,
      customPerms: salesGroup ? { ...salesGroup.permissions } : { ...PRESET_SALES },
      allOrgs: true,
      allowedOrgIds: [],
      isActive: true,
    });
    setUserFormMode('create');
  };

  const openEditUser = (u: AuthUserDto) => {
    setError(null);
    setNotice(null);
    setCreatedCredentials(null);
    setEditingUserId(u.id);
    const hasCustomOverrides = Object.keys(u.permissions ?? {}).length > 0;
    const allowedDepts = u.allowedDepartmentIds ?? [];
    const deptScopeMode: 'all' | 'own' | 'custom' =
      allowedDepts.length === 0
        ? 'all'
        : allowedDepts.length === 1 && u.departmentId && allowedDepts[0] === u.departmentId
          ? 'own'
          : 'custom';
    setUserForm({
      fullName: u.fullName,
      login: u.login,
      email: u.email,
      password: '',
      accessGroupId: u.accessGroupId ?? '',
      departmentId: u.departmentId ?? '',
      deptScopeMode,
      allowedDepartmentIds: allowedDepts,
      role: u.role,
      useCustomPerms: hasCustomOverrides || !u.accessGroupId,
      customPerms: { ...u.effectivePermissions },
      allOrgs: u.allowedOrgIds.length === 0,
      allowedOrgIds: u.allowedOrgIds,
      isActive: u.isActive,
    });
    setUserFormMode('edit');
  };

  const handleSelectUserGroup = (groupId: string) => {
    const grp = groups.find((g) => g.id === groupId);
    if (grp) {
      setUserForm((s) => ({
        ...s,
        accessGroupId: grp.id,
        role: grp.baseRole,
        customPerms: { ...grp.permissions },
      }));
    } else {
      setUserForm((s) => ({
        ...s,
        accessGroupId: '',
        role: 'CUSTOM',
        useCustomPerms: true,
      }));
    }
  };

  const toggleAllowedOrg = (orgId: string) => {
    setUserForm((s) => ({
      ...s,
      allowedOrgIds: s.allowedOrgIds.includes(orgId)
        ? s.allowedOrgIds.filter((id) => id !== orgId)
        : [...s.allowedOrgIds, orgId],
    }));
  };

  const toggleAllowedDept = (deptId: string) => {
    setUserForm((s) => ({
      ...s,
      allowedDepartmentIds: s.allowedDepartmentIds.includes(deptId)
        ? s.allowedDepartmentIds.filter((id) => id !== deptId)
        : [...s.allowedDepartmentIds, deptId],
    }));
  };

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setSaving(true);
    try {
      const allowedOrgIds = userForm.allOrgs ? [] : userForm.allowedOrgIds;
      const allowedDepartmentIds =
        userForm.deptScopeMode === 'all'
          ? []
          : userForm.deptScopeMode === 'own'
            ? userForm.departmentId
              ? [userForm.departmentId]
              : []
            : userForm.allowedDepartmentIds;
      const permissionsPayload = userForm.useCustomPerms ? userForm.customPerms : {};

      if (userFormMode === 'create') {
        const created = await apiFetch<AuthUserDto>('/api/users', {
          method: 'POST',
          body: JSON.stringify({
            fullName: userForm.fullName.trim(),
            login: userForm.login.trim(),
            email: userForm.email.trim(),
            password: userForm.password,
            accessGroupId: userForm.accessGroupId || null,
            departmentId: userForm.departmentId || null,
            role: userForm.accessGroupId ? userForm.role : 'CUSTOM',
            allowedOrgIds,
            allowedDepartmentIds,
            permissions: permissionsPayload,
            isActive: userForm.isActive,
          }),
        });
        setCreatedCredentials({
          fullName: created.fullName,
          login: created.login,
          password: userForm.password,
        });
        setNotice(`Користувача «${created.fullName}» створено! Доступ уже активний.`);
        setUserFormMode('list');
      } else if (userFormMode === 'edit' && editingUserId) {
        const updated = await apiFetch<AuthUserDto>(`/api/users/${editingUserId}`, {
          method: 'PATCH',
          body: JSON.stringify({
            fullName: userForm.fullName.trim(),
            login: userForm.login.trim(),
            email: userForm.email.trim(),
            accessGroupId: userForm.accessGroupId || null,
            departmentId: userForm.departmentId || null,
            role: userForm.accessGroupId ? userForm.role : 'CUSTOM',
            allowedOrgIds,
            allowedDepartmentIds,
            permissions: permissionsPayload,
            isActive: userForm.isActive,
            ...(userForm.password.trim() ? { newPassword: userForm.password.trim() } : {}),
          }),
        });
        if (userForm.password.trim()) {
          setCreatedCredentials({
            fullName: updated.fullName,
            login: updated.login,
            password: userForm.password.trim(),
          });
        }
        setNotice(`Права користувача «${updated.fullName}» збережено.`);
        setUserFormMode('list');
      }
      qc.invalidateQueries({ queryKey: ['admin-users'] });
      qc.invalidateQueries({ queryKey: ['access-groups'] });
      qc.invalidateQueries({ queryKey: ['bootstrap'] });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const openCreateGroup = () => {
    setError(null);
    setNotice(null);
    setEditingGroupId(null);
    setGroupForm({
      name: '',
      description: '',
      baseRole: 'CUSTOM',
      permissions: { ...PRESET_SALES },
    });
    setGroupFormMode('create');
  };

  const openEditGroup = (g: AccessGroupDto) => {
    setError(null);
    setNotice(null);
    setEditingGroupId(g.id);
    setGroupForm({
      name: g.name,
      description: g.description,
      baseRole: g.baseRole,
      permissions: { ...g.permissions },
    });
    setGroupFormMode('edit');
  };

  const handleSaveGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setSaving(true);
    try {
      if (groupFormMode === 'create') {
        const created = await apiFetch<AccessGroupDto>('/api/access-groups', {
          method: 'POST',
          body: JSON.stringify(groupForm),
        });
        setNotice(`Створено групу доступу «${created.name}»!`);
        setGroupFormMode('list');
      } else if (groupFormMode === 'edit' && editingGroupId) {
        const updated = await apiFetch<AccessGroupDto>(`/api/access-groups/${editingGroupId}`, {
          method: 'PATCH',
          body: JSON.stringify(groupForm),
        });
        setNotice(`Права групи «${updated.name}» оновлено для всіх учасників групи.`);
        setGroupFormMode('list');
      }
      qc.invalidateQueries({ queryKey: ['access-groups'] });
      qc.invalidateQueries({ queryKey: ['admin-users'] });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteGroup = async (g: AccessGroupDto) => {
    if (!confirm(`Видалити групу доступу «${g.name}»?`)) return;
    setError(null);
    try {
      await apiFetch(`/api/access-groups/${g.id}`, { method: 'DELETE' });
      setNotice(`Групу «${g.name}» видалено.`);
      qc.invalidateQueries({ queryKey: ['access-groups'] });
      qc.invalidateQueries({ queryKey: ['admin-users'] });
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleToggleBlock = async (u: AuthUserDto) => {
    setError(null);
    try {
      await apiFetch(`/api/users/${u.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: !u.isActive }),
      });
      setNotice(
        u.isActive
          ? `Користувача «${u.fullName}» заблоковано.`
          : `Доступ користувача «${u.fullName}» відновлено.`
      );
      qc.invalidateQueries({ queryKey: ['admin-users'] });
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleDeleteUser = async (u: AuthUserDto) => {
    if (!confirm(`Видалити користувача «${u.fullName}» (логін: ${u.login})?`)) return;
    setError(null);
    try {
      await apiFetch(`/api/users/${u.id}`, { method: 'DELETE' });
      setNotice(`Користувача «${u.fullName}» видалено.`);
      qc.invalidateQueries({ queryKey: ['admin-users'] });
      qc.invalidateQueries({ queryKey: ['access-groups'] });
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleChangeMyPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    if (pwForm.newPassword !== pwForm.confirmPassword) {
      setError('Новий пароль і підтвердження не збігаються');
      return;
    }
    setSaving(true);
    try {
      await apiFetch('/api/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({
          currentPassword: pwForm.currentPassword,
          newPassword: pwForm.newPassword,
        }),
      });
      setPwForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setNotice('Ваш пароль успішно змінено!');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const copyCredentials = async () => {
    if (!createdCredentials) return;
    const text = [
      `Доступ до системи 2С (${window.location.origin})`,
      `Користувач: ${createdCredentials.fullName}`,
      `Логін: ${createdCredentials.login}`,
      `Пароль: ${createdCredentials.password}`,
    ].join('\n');
    await navigator.clipboard.writeText(text);
    setCopiedCreds(true);
    window.setTimeout(() => setCopiedCreds(false), 2000);
  };

  const orgNameMap = new Map(organizations.map((o) => [o.id, o.name]));

  return (
    <OverlayDialog
      ariaLabel="Користувачі, групи доступу та права"
      variant="center"
      maxWidthClass="max-w-5xl"
      onClose={onClose}
    >
      {(requestClose) => (
        <div className="flex max-h-[90vh] flex-col">
          {/* Header */}
          <div
            className="flex flex-wrap items-center justify-between gap-3 px-6 py-4"
            style={{
              borderBottom: '1px solid var(--border)',
              background: 'var(--surface-2)',
            }}
          >
            <div className="flex items-center gap-3">
              <span
                className="flex h-10 w-10 items-center justify-center rounded-xl text-white"
                style={{
                  background: 'linear-gradient(135deg, var(--primary), var(--sky))',
                }}
              >
                <Shield className="h-5 w-5" aria-hidden="true" />
              </span>
              <div>
                <h2 className="font-display text-[18px] font-extrabold" style={{ color: 'var(--text)' }}>
                  Користувачі, групи доступу та права (2С)
                </h2>
                <p className="text-[12px]" style={{ color: 'var(--muted)' }}>
                  Призначайте готові групи або налаштовуйте індивідуальні галочки доступу по кожному працівнику
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {canManageUsers && tab === 'users' && userFormMode === 'list' && (
                <button
                  type="button"
                  onClick={openCreateUser}
                  className="inline-flex min-h-[40px] items-center gap-1.5 px-4 text-[13px] font-extrabold"
                  style={{
                    borderRadius: 'var(--r-sm)',
                    background: 'linear-gradient(135deg, var(--primary), var(--primary-2))',
                    color: 'var(--surface)',
                  }}
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  <span>Додати користувача</span>
                </button>
              )}
              {canManageUsers && tab === 'groups' && groupFormMode === 'list' && (
                <button
                  type="button"
                  onClick={openCreateGroup}
                  className="inline-flex min-h-[40px] items-center gap-1.5 px-4 text-[13px] font-extrabold"
                  style={{
                    borderRadius: 'var(--r-sm)',
                    background: 'linear-gradient(135deg, var(--primary), var(--primary-2))',
                    color: 'var(--surface)',
                  }}
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  <span>Нова група доступу</span>
                </button>
              )}
              <button
                type="button"
                onClick={requestClose}
                aria-label="Закрити"
                className="flex h-[44px] w-[44px] items-center justify-center rounded-full"
                style={{
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  color: 'var(--muted)',
                }}
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
          </div>

          {/* Tabs */}
          <div
            className="flex flex-wrap gap-2 px-6 py-3"
            style={{ borderBottom: '1px solid var(--border)' }}
          >
            {canManageUsers && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setTab('users');
                    setUserFormMode('list');
                  }}
                  className="inline-flex min-h-[38px] items-center gap-1.5 px-3.5 text-[13px] font-bold"
                  style={{
                    borderRadius: 'var(--r-pill)',
                    background: tab === 'users' ? 'var(--text)' : 'var(--surface-2)',
                    color: tab === 'users' ? 'var(--surface)' : 'var(--text-2)',
                  }}
                >
                  <Users className="h-4 w-4" aria-hidden="true" />
                  <span>Співробітники ({usersQuery.data?.length ?? '…'})</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setTab('groups');
                    setGroupFormMode('list');
                  }}
                  className="inline-flex min-h-[38px] items-center gap-1.5 px-3.5 text-[13px] font-bold"
                  style={{
                    borderRadius: 'var(--r-pill)',
                    background: tab === 'groups' ? 'var(--text)' : 'var(--surface-2)',
                    color: tab === 'groups' ? 'var(--surface)' : 'var(--text-2)',
                  }}
                >
                  <FolderKey className="h-4 w-4" aria-hidden="true" />
                  <span>Групи доступу ({groups.length})</span>
                </button>
              </>
            )}
            <button
              type="button"
              onClick={() => setTab('password')}
              className="inline-flex min-h-[38px] items-center gap-1.5 px-3.5 text-[13px] font-bold"
              style={{
                borderRadius: 'var(--r-pill)',
                background: tab === 'password' ? 'var(--text)' : 'var(--surface-2)',
                color: tab === 'password' ? 'var(--surface)' : 'var(--text-2)',
              }}
            >
              <KeyRound className="h-4 w-4" aria-hidden="true" />
              <span>Змінити мій пароль</span>
            </button>
            <button
              type="button"
              onClick={() => setTab('audit')}
              className="inline-flex min-h-[38px] items-center gap-1.5 px-3.5 text-[13px] font-bold"
              style={{
                borderRadius: 'var(--r-pill)',
                background: tab === 'audit' ? 'var(--text)' : 'var(--surface-2)',
                color: tab === 'audit' ? 'var(--surface)' : 'var(--text-2)',
              }}
            >
              <History className="h-4 w-4" aria-hidden="true" />
              <span>Журнал аудиту</span>
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 space-y-4 overflow-y-auto p-6">
            {error && (
              <div
                className="flex items-center gap-2 p-3.5 text-[13px] font-semibold"
                style={{
                  background: 'var(--neg-soft)',
                  color: 'var(--neg-ink)',
                  borderRadius: 'var(--r-md)',
                }}
              >
                <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{error}</span>
              </div>
            )}

            {notice && (
              <div
                className="flex items-center gap-2 p-3.5 text-[13px] font-semibold"
                style={{
                  background: 'var(--pos-soft)',
                  color: 'var(--pos-ink)',
                  borderRadius: 'var(--r-md)',
                }}
              >
                <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{notice}</span>
              </div>
            )}

            {createdCredentials && tab === 'users' && (
              <div
                className="flex flex-wrap items-center justify-between gap-3 p-4"
                style={{
                  background: 'var(--primary-soft)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--r-md)',
                }}
              >
                <div className="space-y-0.5 text-[13px]">
                  <div className="font-extrabold" style={{ color: 'var(--primary-ink)' }}>
                    Дані для входу працівника ({createdCredentials.fullName}):
                  </div>
                  <div className="font-mono" style={{ color: 'var(--text)' }}>
                    Логін: <strong>{createdCredentials.login}</strong> · Пароль:{' '}
                    <strong>{createdCredentials.password}</strong>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={copyCredentials}
                  className="inline-flex min-h-[40px] items-center gap-1.5 px-4 text-[12px] font-extrabold"
                  style={{
                    borderRadius: 'var(--r-sm)',
                    background: 'var(--surface)',
                    color: 'var(--primary-ink)',
                    border: '1px solid var(--border-strong)',
                  }}
                >
                  {copiedCreds ? (
                    <>
                      <Check className="h-4 w-4" style={{ color: 'var(--pos)' }} aria-hidden="true" />
                      <span>Скопійовано!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-4 w-4" aria-hidden="true" />
                      <span>Копіювати для месенджера</span>
                    </>
                  )}
                </button>
              </div>
            )}

            {/* TAB 1: USERS */}
            {tab === 'users' && canManageUsers && (
              <>
                {userFormMode !== 'list' ? (
                  <form onSubmit={handleSaveUser} className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-[15px] font-extrabold" style={{ color: 'var(--text)' }}>
                        {userFormMode === 'create'
                          ? 'Новий співробітник та налаштування доступу'
                          : 'Редагування співробітника, групи та галочок прав'}
                      </h3>
                      <button
                        type="button"
                        onClick={() => setUserFormMode('list')}
                        className="text-[13px] font-bold"
                        style={{ color: 'var(--muted)' }}
                      >
                        ← Назад до списку
                      </button>
                    </div>

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div className="sm:col-span-2">
                        <label className="mb-1 block text-[12px] font-bold" style={{ color: 'var(--text-2)' }}>
                          ПІБ / Ім’я працівника *
                        </label>
                        <input
                          required
                          value={userForm.fullName}
                          onChange={(e) => setUserForm((s) => ({ ...s, fullName: e.target.value }))}
                          placeholder="Напр. Бондар Ігор (Закупівлі)"
                          className="min-h-[44px] w-full px-3.5 text-[14px]"
                          style={{
                            borderRadius: 'var(--r-sm)',
                            border: '1px solid var(--border-strong)',
                            background: 'var(--surface)',
                          }}
                        />
                      </div>

                      <div>
                        <label className="mb-1 block text-[12px] font-bold" style={{ color: 'var(--text-2)' }}>
                          Логін для входу *
                        </label>
                        <input
                          required
                          value={userForm.login}
                          onChange={(e) => setUserForm((s) => ({ ...s, login: e.target.value }))}
                          placeholder="Напр. igor"
                          className="min-h-[44px] w-full px-3.5 font-mono text-[14px]"
                          style={{
                            borderRadius: 'var(--r-sm)',
                            border: '1px solid var(--border-strong)',
                            background: 'var(--surface)',
                          }}
                        />
                      </div>

                      <div>
                        <label className="mb-1 block text-[12px] font-bold" style={{ color: 'var(--text-2)' }}>
                          {userFormMode === 'create'
                            ? 'Пароль *'
                            : 'Новий пароль (залиште порожнім, щоб не змінювати)'}
                        </label>
                        <div className="flex gap-2">
                          <input
                            required={userFormMode === 'create'}
                            minLength={4}
                            value={userForm.password}
                            onChange={(e) => setUserForm((s) => ({ ...s, password: e.target.value }))}
                            placeholder={userFormMode === 'create' ? 'Мінімум 4 символи' : 'Новий пароль…'}
                            className="min-h-[44px] flex-1 px-3.5 font-mono text-[14px]"
                            style={{
                              borderRadius: 'var(--r-sm)',
                              border: '1px solid var(--border-strong)',
                              background: 'var(--surface)',
                            }}
                          />
                          <button
                            type="button"
                            onClick={() =>
                              setUserForm((s) => ({ ...s, password: generateRandomPassword() }))
                            }
                            className="inline-flex min-h-[44px] items-center gap-1 px-3 text-[12px] font-bold"
                            style={{
                              borderRadius: 'var(--r-sm)',
                              background: 'var(--surface-2)',
                              border: '1px solid var(--border-strong)',
                              color: 'var(--text-2)',
                            }}
                          >
                            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                            <span>Авто</span>
                          </button>
                        </div>
                      </div>

                      <div>
                        <label className="mb-1 block text-[12px] font-bold" style={{ color: 'var(--text-2)' }}>
                          Група доступу (готові права)
                        </label>
                        <select
                          value={userForm.accessGroupId}
                          onChange={(e) => handleSelectUserGroup(e.target.value)}
                          className="min-h-[44px] w-full px-3 text-[13px] font-bold"
                          style={{
                            borderRadius: 'var(--r-sm)',
                            border: '1px solid var(--border-strong)',
                            background: 'var(--surface)',
                          }}
                        >
                          <option value="">— Без групи (індивідуальні галочки) —</option>
                          {groups.map((g) => (
                            <option key={g.id} value={g.id}>
                              {g.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="mb-1 block text-[12px] font-bold" style={{ color: 'var(--text-2)' }}>
                          Підрозділ співробітника (де працює)
                        </label>
                        <select
                          value={userForm.departmentId}
                          onChange={(e) => {
                            const nextDeptId = e.target.value;
                            setUserForm((s) => ({
                              ...s,
                              departmentId: nextDeptId,
                              allowedDepartmentIds:
                                s.deptScopeMode === 'own'
                                  ? nextDeptId
                                    ? [nextDeptId]
                                    : []
                                  : s.allowedDepartmentIds,
                            }));
                          }}
                          className="min-h-[44px] w-full px-3 text-[13px] font-bold"
                          style={{
                            borderRadius: 'var(--r-sm)',
                            border: '1px solid var(--border-strong)',
                            background: 'var(--surface)',
                          }}
                        >
                          <option value="">— Не прив’язано до підрозділу —</option>
                          {allDepts.map((dp) => (
                            <option key={dp.id} value={dp.id}>
                              {dp.name}
                              {dp.organizationName ? ` (${dp.organizationName})` : ''}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="sm:col-span-2">
                        <label className="mb-1 block text-[12px] font-bold" style={{ color: 'var(--text-2)' }}>
                          Email (опційно)
                        </label>
                        <input
                          type="email"
                          value={userForm.email}
                          onChange={(e) => setUserForm((s) => ({ ...s, email: e.target.value }))}
                          placeholder="igor@2c.ua"
                          className="min-h-[44px] w-full px-3.5 text-[14px]"
                          style={{
                            borderRadius: 'var(--r-sm)',
                            border: '1px solid var(--border-strong)',
                            background: 'var(--surface)',
                          }}
                        />
                      </div>
                    </div>

                    {/* Department visibility scope */}
                    <div
                      className="space-y-3 p-4"
                      style={{
                        background: 'var(--surface-2)',
                        border: '1px solid var(--border)',
                        borderRadius: 'var(--r-md)',
                      }}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2 text-[13px] font-extrabold" style={{ color: 'var(--text)' }}>
                          <Network className="h-4 w-4" style={{ color: 'var(--primary)' }} aria-hidden="true" />
                          <span>Доступ до підрозділів (що бачить у програмі)</span>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {[
                            { id: 'all' as const, label: 'Усі підрозділи' },
                            { id: 'own' as const, label: 'Тільки свій підрозділ' },
                            { id: 'custom' as const, label: 'Обрати галочками' },
                          ].map((opt) => {
                            const active = userForm.deptScopeMode === opt.id;
                            return (
                              <button
                                key={opt.id}
                                type="button"
                                onClick={() =>
                                  setUserForm((s) => ({
                                    ...s,
                                    deptScopeMode: opt.id,
                                    allowedDepartmentIds:
                                      opt.id === 'all'
                                        ? []
                                        : opt.id === 'own'
                                          ? s.departmentId
                                            ? [s.departmentId]
                                            : []
                                          : s.allowedDepartmentIds.length > 0
                                            ? s.allowedDepartmentIds
                                            : s.departmentId
                                              ? [s.departmentId]
                                              : [],
                                  }))
                                }
                                className="rounded-full px-3 py-1 text-[11.5px] font-bold transition"
                                style={{
                                  background: active ? 'var(--primary)' : 'var(--surface)',
                                  color: active ? 'var(--surface)' : 'var(--text-2)',
                                  border: active
                                    ? '1px solid var(--primary)'
                                    : '1px solid var(--border-strong)',
                                }}
                              >
                                {opt.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {userForm.deptScopeMode === 'all' && (
                        <div className="text-[12px]" style={{ color: 'var(--muted)' }}>
                          Співробітник бачитиме дані всіх підрозділів і зможе вільно перемикатися між ними.
                        </div>
                      )}

                      {userForm.deptScopeMode === 'own' && (
                        <div className="text-[12px]" style={{ color: 'var(--primary-ink)' }}>
                          {userForm.departmentId ? (
                            <>
                              Бачитиме <strong>тільки</strong> документи, клієнтів, кадри й показники підрозділу{' '}
                              <strong>«{deptNameMap.get(userForm.departmentId) ?? 'Обраний підрозділ'}»</strong>.
                            </>
                          ) : (
                            'Оберіть вище «Підрозділ співробітника», щоб закріпити видимість лише за ним.'
                          )}
                        </div>
                      )}

                      {userForm.deptScopeMode === 'custom' && (
                        <div className="grid grid-cols-1 gap-2 pt-1 sm:grid-cols-2">
                          {allDepts.map((dp) => {
                            const checked = userForm.allowedDepartmentIds.includes(dp.id);
                            return (
                              <label
                                key={dp.id}
                                className="flex cursor-pointer items-center gap-2 px-3 py-2 text-[12.5px] font-semibold transition"
                                style={{
                                  background: checked ? 'var(--primary-soft)' : 'var(--surface)',
                                  border: checked
                                    ? '1px solid var(--primary)'
                                    : '1px solid var(--border)',
                                  borderRadius: 'var(--r-sm)',
                                  color: checked ? 'var(--primary-ink)' : 'var(--text)',
                                }}
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => toggleAllowedDept(dp.id)}
                                />
                                <span className="truncate">
                                  <span className="font-mono text-[10.5px] opacity-75">[{dp.code}]</span>{' '}
                                  {dp.name}
                                  {dp.organizationName ? ` · ${dp.organizationName}` : ''}
                                </span>
                              </label>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* Toggle Custom Checkboxes */}
                    <label
                      className="flex cursor-pointer items-center gap-2.5 p-3.5 text-[13px] font-bold"
                      style={{
                        background: userForm.useCustomPerms ? 'var(--primary-soft)' : 'var(--surface-2)',
                        border: '1px solid var(--border)',
                        borderRadius: 'var(--r-md)',
                        color: userForm.useCustomPerms ? 'var(--primary-ink)' : 'var(--text)',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={userForm.useCustomPerms}
                        onChange={(e) =>
                          setUserForm((s) => ({ ...s, useCustomPerms: e.target.checked }))
                        }
                        className="h-4 w-4"
                      />
                      <span>
                        Налаштувати індивідуальні права галочками для цього співробітника (кастомний доступ поверх групи)
                      </span>
                    </label>

                    {userForm.useCustomPerms && (
                      <PermissionCheckboxes
                        value={userForm.customPerms}
                        onChange={(next) => setUserForm((s) => ({ ...s, customPerms: next }))}
                      />
                    )}

                    {/* Organization / FOP access control */}
                    <div
                      className="space-y-2.5 p-4"
                      style={{
                        background: 'var(--surface-2)',
                        border: '1px solid var(--border)',
                        borderRadius: 'var(--r-md)',
                      }}
                    >
                      <div className="text-[13px] font-extrabold" style={{ color: 'var(--text)' }}>
                        Доступ до організацій та ФОП
                      </div>
                      <label className="flex cursor-pointer items-center gap-2 text-[13px] font-semibold">
                        <input
                          type="checkbox"
                          checked={userForm.allOrgs}
                          onChange={(e) =>
                            setUserForm((s) => ({ ...s, allOrgs: e.target.checked }))
                          }
                        />
                        <span>Дозволити роботу в усіх організаціях і ФОП</span>
                      </label>

                      {!userForm.allOrgs && (
                        <div className="grid grid-cols-1 gap-2 pt-1 sm:grid-cols-2">
                          {organizations.map((org) => (
                            <label
                              key={org.id}
                              className="flex cursor-pointer items-center gap-2 px-3 py-2 text-[13px] font-medium"
                              style={{
                                background: 'var(--surface)',
                                border: '1px solid var(--border)',
                                borderRadius: 'var(--r-sm)',
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={userForm.allowedOrgIds.includes(org.id)}
                                onChange={() => toggleAllowedOrg(org.id)}
                              />
                              <span className="truncate">
                                [{org.entityType === 'FOP' ? 'ФОП' : 'ТОВ'}] {org.name}
                              </span>
                            </label>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center justify-end gap-2.5 pt-2">
                      <button
                        type="button"
                        onClick={() => setUserFormMode('list')}
                        className="min-h-[44px] px-4 text-[13px] font-bold"
                        style={{
                          borderRadius: 'var(--r-sm)',
                          border: '1px solid var(--border-strong)',
                          background: 'var(--surface)',
                          color: 'var(--text-2)',
                        }}
                      >
                        Скасувати
                      </button>
                      <button
                        type="submit"
                        disabled={saving}
                        className="min-h-[44px] px-6 text-[13px] font-extrabold disabled:opacity-50"
                        style={{
                          borderRadius: 'var(--r-sm)',
                          background: 'linear-gradient(135deg, var(--primary), var(--primary-2))',
                          color: 'var(--surface)',
                        }}
                      >
                        {saving
                          ? 'Збереження...'
                          : userFormMode === 'create'
                            ? 'Створити користувача'
                            : 'Зберегти права'}
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="space-y-3">
                    {(usersQuery.data ?? []).map((u) => {
                      const roleMeta = USER_ROLE_META[u.role] ?? USER_ROLE_META.CUSTOM;
                      const isSelf = u.id === currentUser.id;
                      const enabledCount = PERMISSION_CATALOG.filter(
                        (p) => u.effectivePermissions?.[p.key]
                      ).length;
                      const hasCustom = Object.keys(u.permissions ?? {}).length > 0;
                      return (
                        <div
                          key={u.id}
                          className="flex flex-wrap items-center justify-between gap-3 p-4"
                          style={{
                            background: u.isActive ? 'var(--surface-2)' : 'var(--neg-soft)',
                            border: '1px solid var(--border)',
                            borderRadius: 'var(--r-md)',
                          }}
                        >
                          <div className="min-w-0 space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-[14px] font-extrabold" style={{ color: 'var(--text)' }}>
                                {u.fullName}
                              </span>
                              <span
                                className="rounded-full px-2.5 py-0.5 text-[11px] font-bold"
                                style={{
                                  background: roleMeta.bgVar,
                                  color: roleMeta.inkVar,
                                }}
                              >
                                {u.accessGroupName || roleMeta.short}
                              </span>
                              {hasCustom && (
                                <span
                                  className="rounded-full px-2 py-0.5 text-[10px] font-bold"
                                  style={{
                                    background: 'var(--warn-soft)',
                                    color: 'var(--warn-ink)',
                                  }}
                                >
                                  Кастомні галочки
                                </span>
                              )}
                              <span
                                className="rounded-full px-2 py-0.5 font-mono text-[10px] font-bold"
                                style={{
                                  background: 'var(--surface)',
                                  border: '1px solid var(--border)',
                                  color: 'var(--muted)',
                                }}
                              >
                                {enabledCount}/{PERMISSION_CATALOG.length} прав
                              </span>
                              {!u.isActive && (
                                <span
                                  className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase"
                                  style={{ background: 'var(--neg)', color: 'var(--surface)' }}
                                >
                                  Заблоковано
                                </span>
                              )}
                              {isSelf && (
                                <span
                                  className="rounded-full px-2 py-0.5 text-[10px] font-bold"
                                  style={{ background: 'var(--pos-soft)', color: 'var(--pos-ink)' }}
                                >
                                  Це ви
                                </span>
                              )}
                            </div>

                            <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12px]" style={{ color: 'var(--muted)' }}>
                              <span>
                                Логін: <strong className="font-mono" style={{ color: 'var(--text)' }}>{u.login}</strong>
                              </span>
                              <span>
                                Підрозділ:{' '}
                                <strong style={{ color: 'var(--text)' }}>
                                  {u.departmentName || 'Не вказано'}
                                </strong>
                              </span>
                              <span>
                                Бачить підрозділи:{' '}
                                <strong style={{ color: u.allowedDepartmentIds?.length ? 'var(--primary-ink)' : 'var(--pos-ink)' }}>
                                  {!u.allowedDepartmentIds || u.allowedDepartmentIds.length === 0
                                    ? 'Усі'
                                    : u.allowedDepartmentIds
                                        .map((did) => deptNameMap.get(did) ?? did.slice(0, 6))
                                        .join(', ')}
                                </strong>
                              </span>
                              <span>
                                ФОП/ТОВ:{' '}
                                {u.allowedOrgIds.length === 0
                                  ? 'Усі'
                                  : u.allowedOrgIds
                                      .map((oid) => orgNameMap.get(oid) ?? oid.slice(0, 6))
                                      .join(', ')}
                              </span>
                              {u.lastLoginAt && <span>Останній вхід: {fmtDate(u.lastLoginAt)}</span>}
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => openEditUser(u)}
                              className="inline-flex min-h-[38px] items-center gap-1 px-3 text-[12px] font-bold"
                              style={{
                                borderRadius: 'var(--r-sm)',
                                background: 'var(--surface)',
                                border: '1px solid var(--border-strong)',
                                color: 'var(--text)',
                              }}
                            >
                              <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                              <span>Права / Пароль</span>
                            </button>
                            {!isSelf && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handleToggleBlock(u)}
                                  title={u.isActive ? 'Заблокувати' : 'Розблокувати'}
                                  aria-label={u.isActive ? 'Заблокувати' : 'Розблокувати'}
                                  className="flex h-[38px] w-[38px] items-center justify-center"
                                  style={{
                                    borderRadius: 'var(--r-sm)',
                                    background: 'var(--surface)',
                                    border: '1px solid var(--border-strong)',
                                    color: u.isActive ? 'var(--warn-ink)' : 'var(--pos)',
                                  }}
                                >
                                  {u.isActive ? (
                                    <Ban className="h-4 w-4" aria-hidden="true" />
                                  ) : (
                                    <Unlock className="h-4 w-4" aria-hidden="true" />
                                  )}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteUser(u)}
                                  title="Видалити"
                                  aria-label="Видалити"
                                  className="flex h-[38px] w-[38px] items-center justify-center"
                                  style={{
                                    borderRadius: 'var(--r-sm)',
                                    background: 'var(--surface)',
                                    border: '1px solid var(--border-strong)',
                                    color: 'var(--neg)',
                                  }}
                                >
                                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}

            {/* TAB 2: ACCESS GROUPS */}
            {tab === 'groups' && canManageUsers && (
              <>
                {groupFormMode !== 'list' ? (
                  <form onSubmit={handleSaveGroup} className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-[15px] font-extrabold" style={{ color: 'var(--text)' }}>
                        {groupFormMode === 'create'
                          ? 'Нова група доступу'
                          : 'Редагування групи доступу'}
                      </h3>
                      <button
                        type="button"
                        onClick={() => setGroupFormMode('list')}
                        className="text-[13px] font-bold"
                        style={{ color: 'var(--muted)' }}
                      >
                        ← Назад до груп
                      </button>
                    </div>

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div>
                        <label className="mb-1 block text-[12px] font-bold" style={{ color: 'var(--text-2)' }}>
                          Назва групи *
                        </label>
                        <input
                          required
                          value={groupForm.name}
                          onChange={(e) => setGroupForm((s) => ({ ...s, name: e.target.value }))}
                          placeholder="Напр. Старший менеджер (Продажі + Закупівлі)"
                          className="min-h-[44px] w-full px-3.5 text-[14px]"
                          style={{
                            borderRadius: 'var(--r-sm)',
                            border: '1px solid var(--border-strong)',
                            background: 'var(--surface)',
                          }}
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-[12px] font-bold" style={{ color: 'var(--text-2)' }}>
                          Опис групи
                        </label>
                        <input
                          value={groupForm.description}
                          onChange={(e) =>
                            setGroupForm((s) => ({ ...s, description: e.target.value }))
                          }
                          placeholder="Коротко: за що відповідає група"
                          className="min-h-[44px] w-full px-3.5 text-[14px]"
                          style={{
                            borderRadius: 'var(--r-sm)',
                            border: '1px solid var(--border-strong)',
                            background: 'var(--surface)',
                          }}
                        />
                      </div>
                    </div>

                    <PermissionCheckboxes
                      value={groupForm.permissions}
                      onChange={(next) => setGroupForm((s) => ({ ...s, permissions: next }))}
                    />

                    <div className="flex items-center justify-end gap-2.5 pt-2">
                      <button
                        type="button"
                        onClick={() => setGroupFormMode('list')}
                        className="min-h-[44px] px-4 text-[13px] font-bold"
                        style={{
                          borderRadius: 'var(--r-sm)',
                          border: '1px solid var(--border-strong)',
                          background: 'var(--surface)',
                          color: 'var(--text-2)',
                        }}
                      >
                        Скасувати
                      </button>
                      <button
                        type="submit"
                        disabled={saving}
                        className="min-h-[44px] px-6 text-[13px] font-extrabold disabled:opacity-50"
                        style={{
                          borderRadius: 'var(--r-sm)',
                          background: 'linear-gradient(135deg, var(--primary), var(--primary-2))',
                          color: 'var(--surface)',
                        }}
                      >
                        {saving ? 'Збереження...' : 'Зберегти групу доступу'}
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2">
                    {groups.map((g) => {
                      const activePerms = PERMISSION_CATALOG.filter((p) => g.permissions[p.key]);
                      return (
                        <div
                          key={g.id}
                          className="flex flex-col justify-between gap-3 p-4"
                          style={{
                            background: 'var(--surface-2)',
                            border: '1px solid var(--border)',
                            borderRadius: 'var(--r-lg)',
                          }}
                        >
                          <div className="space-y-2">
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <div className="flex items-center gap-2">
                                  <h3 className="text-[15px] font-extrabold" style={{ color: 'var(--text)' }}>
                                    {g.name}
                                  </h3>
                                  <span
                                    className="rounded-full px-2 py-0.5 font-mono text-[10px] font-bold"
                                    style={{
                                      background: 'var(--primary-soft)',
                                      color: 'var(--primary-ink)',
                                    }}
                                  >
                                    {g.usersCount ?? 0} ос.
                                  </span>
                                </div>
                                {g.description && (
                                  <p className="mt-0.5 text-[12px]" style={{ color: 'var(--muted)' }}>
                                    {g.description}
                                  </p>
                                )}
                              </div>
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => openEditGroup(g)}
                                  title="Налаштувати права групи"
                                  className="flex h-9 w-9 items-center justify-center rounded-lg"
                                  style={{
                                    background: 'var(--surface)',
                                    border: '1px solid var(--border)',
                                    color: 'var(--text)',
                                  }}
                                >
                                  <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                                </button>
                                {!g.isSystem && (
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteGroup(g)}
                                    title="Видалити групу"
                                    className="flex h-9 w-9 items-center justify-center rounded-lg"
                                    style={{
                                      background: 'var(--surface)',
                                      border: '1px solid var(--border)',
                                      color: 'var(--neg)',
                                    }}
                                  >
                                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                                  </button>
                                )}
                              </div>
                            </div>

                            <div className="flex flex-wrap gap-1.5 pt-1">
                              {activePerms.map((p) => (
                                <span
                                  key={p.key}
                                  className="rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
                                  style={{
                                    background: 'var(--surface)',
                                    border: '1px solid var(--border)',
                                    color: 'var(--text-2)',
                                  }}
                                >
                                  ✓ {p.label}
                                </span>
                              ))}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}

            {/* TAB 3: CHANGE OWN PASSWORD */}
            {tab === 'password' && (
              <form onSubmit={handleChangeMyPassword} className="max-w-md space-y-4">
                <div>
                  <label className="mb-1 block text-[12px] font-bold" style={{ color: 'var(--text-2)' }}>
                    Поточний пароль
                  </label>
                  <input
                    type="password"
                    required
                    value={pwForm.currentPassword}
                    onChange={(e) => setPwForm((s) => ({ ...s, currentPassword: e.target.value }))}
                    className="min-h-[44px] w-full px-3.5 text-[14px]"
                    style={{
                      borderRadius: 'var(--r-sm)',
                      border: '1px solid var(--border-strong)',
                      background: 'var(--surface)',
                    }}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[12px] font-bold" style={{ color: 'var(--text-2)' }}>
                    Новий пароль (мінімум 4 символи)
                  </label>
                  <input
                    type="password"
                    required
                    minLength={4}
                    value={pwForm.newPassword}
                    onChange={(e) => setPwForm((s) => ({ ...s, newPassword: e.target.value }))}
                    className="min-h-[44px] w-full px-3.5 text-[14px]"
                    style={{
                      borderRadius: 'var(--r-sm)',
                      border: '1px solid var(--border-strong)',
                      background: 'var(--surface)',
                    }}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[12px] font-bold" style={{ color: 'var(--text-2)' }}>
                    Підтвердіть новий пароль
                  </label>
                  <input
                    type="password"
                    required
                    minLength={4}
                    value={pwForm.confirmPassword}
                    onChange={(e) => setPwForm((s) => ({ ...s, confirmPassword: e.target.value }))}
                    className="min-h-[44px] w-full px-3.5 text-[14px]"
                    style={{
                      borderRadius: 'var(--r-sm)',
                      border: '1px solid var(--border-strong)',
                      background: 'var(--surface)',
                    }}
                  />
                </div>
                <button
                  type="submit"
                  disabled={saving}
                  className="min-h-[44px] px-6 text-[13px] font-extrabold disabled:opacity-50"
                  style={{
                    borderRadius: 'var(--r-sm)',
                    background: 'linear-gradient(135deg, var(--primary), var(--primary-2))',
                    color: 'var(--surface)',
                  }}
                >
                  {saving ? 'Оновлення...' : 'Зберегти новий пароль'}
                </button>
              </form>
            )}

            {/* TAB 4: AUDIT LOG */}
            {tab === 'audit' && (
              <div className="space-y-2">
                {(auditQuery.data ?? []).map((log) => (
                  <div
                    key={log.id}
                    className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-[13px]"
                    style={{
                      background: 'var(--surface-2)',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--r-md)',
                    }}
                  >
                    <div>
                      <span
                        className="mr-2 rounded-md px-2 py-0.5 font-mono text-[11px] font-bold"
                        style={{
                          background: 'var(--primary-soft)',
                          color: 'var(--primary-ink)',
                        }}
                      >
                        {log.userRole}
                      </span>
                      <span className="font-bold" style={{ color: 'var(--text)' }}>
                        {log.userName}:
                      </span>{' '}
                      <span style={{ color: 'var(--text-2)' }}>{log.summary}</span>
                    </div>
                    <span className="font-mono text-[12px]" style={{ color: 'var(--muted)' }}>
                      {fmtDate(log.createdAt)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </OverlayDialog>
  );
}
