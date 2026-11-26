import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  X,
  Plus,
  Network,
  Pencil,
  Trash2,
  CheckCircle2,
  Users,
  FileText,
  UserCheck,
  MapPin,
  AlertCircle,
} from 'lucide-react';
import { apiFetch, type DepartmentDto, type OrganizationDto } from '../lib/api';
import { OverlayDialog } from './OverlayDialog';

interface Props {
  organization: OrganizationDto;
  activeDepartmentId: string | null;
  canSeeAllDepartments: boolean;
  onSelectDepartment: (deptId: string | null) => void;
  onClose: () => void;
}

export function DepartmentsManagerModal({
  organization,
  activeDepartmentId,
  canSeeAllDepartments,
  onSelectDepartment,
  onClose,
}: Props) {
  const qc = useQueryClient();
  const [mode, setMode] = useState<'list' | 'create' | 'edit'>('list');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [form, setForm] = useState({
    code: '',
    name: '',
    headName: '',
    address: '',
    description: '',
  });

  const { data: deptList = [], isLoading } = useQuery({
    queryKey: ['departments-manager', organization.id],
    queryFn: () => apiFetch<DepartmentDto[]>('/api/departments?scope=current'),
  });

  const refreshAll = () => {
    qc.invalidateQueries({ queryKey: ['departments-manager'] });
    qc.invalidateQueries({ queryKey: ['bootstrap'] });
    qc.invalidateQueries({ queryKey: ['users-admin'] });
  };

  const openCreate = () => {
    setForm({ code: '', name: '', headName: '', address: '', description: '' });
    setEditingId(null);
    setError(null);
    setNotice(null);
    setMode('create');
  };

  const openEdit = (dp: DepartmentDto) => {
    setForm({
      code: dp.code,
      name: dp.name,
      headName: dp.headName,
      address: dp.address,
      description: dp.description,
    });
    setEditingId(dp.id);
    setError(null);
    setNotice(null);
    setMode('edit');
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      if (mode === 'create') {
        await apiFetch('/api/departments', {
          method: 'POST',
          body: JSON.stringify({
            organizationId: organization.id,
            code: form.code.trim(),
            name: form.name.trim(),
            headName: form.headName.trim(),
            address: form.address.trim(),
            description: form.description.trim(),
          }),
        });
        setNotice(`Підрозділ «${form.name.trim()}» створено`);
      } else if (editingId) {
        await apiFetch(`/api/departments/${editingId}`, {
          method: 'PATCH',
          body: JSON.stringify({
            code: form.code.trim(),
            name: form.name.trim(),
            headName: form.headName.trim(),
            address: form.address.trim(),
            description: form.description.trim(),
          }),
        });
        setNotice(`Підрозділ «${form.name.trim()}» оновлено`);
      }
      setMode('list');
      setEditingId(null);
      refreshAll();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (dp: DepartmentDto) => {
    setError(null);
    setNotice(null);
    try {
      await apiFetch(`/api/departments/${dp.id}`, { method: 'DELETE' });
      if (activeDepartmentId === dp.id) {
        onSelectDepartment(null);
      }
      setNotice(`Підрозділ «${dp.name}» видалено`);
      refreshAll();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <OverlayDialog
      ariaLabel="Керування підрозділами компанії"
      variant="center"
      maxWidthClass="max-w-[780px]"
      onClose={onClose}
    >
      {(requestClose) => (
        <div className="flex max-h-[88vh] flex-col">
          {/* Header */}
          <div
            className="flex items-center justify-between gap-3 px-6 py-4"
            style={{ borderBottom: '1px solid var(--border)' }}
          >
            <div className="flex min-w-0 items-center gap-3">
              <span
                className="flex h-11 w-11 shrink-0 items-center justify-center"
                style={{
                  background: 'var(--primary-soft)',
                  color: 'var(--primary)',
                  borderRadius: 'var(--r-sm)',
                }}
              >
                <Network className="h-5 w-5" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <h2 className="truncate text-[18px] font-extrabold" style={{ color: 'var(--text)' }}>
                  Підрозділи та філії
                </h2>
                <p className="truncate text-[12px]" style={{ color: 'var(--muted)' }}>
                  {organization.name} · Перемикання, структура й розмежування доступу співробітників
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={requestClose}
              aria-label="Закрити"
              className="flex h-10 w-10 items-center justify-center rounded-xl transition"
              style={{
                background: 'var(--surface-2)',
                border: '1px solid var(--border)',
                color: 'var(--text-2)',
              }}
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 space-y-4 overflow-y-auto p-6">
            {error && (
              <div
                className="flex items-start gap-2.5 px-4 py-3 text-[13px] font-semibold"
                style={{
                  background: 'var(--neg-soft)',
                  color: 'var(--neg-ink)',
                  borderRadius: 'var(--r-sm)',
                }}
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{error}</span>
              </div>
            )}

            {notice && (
              <div
                className="flex items-start gap-2.5 px-4 py-3 text-[13px] font-semibold"
                style={{
                  background: 'var(--pos-soft)',
                  color: 'var(--pos-ink)',
                  borderRadius: 'var(--r-sm)',
                }}
              >
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{notice}</span>
              </div>
            )}

            {mode === 'list' ? (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-[13px] font-semibold" style={{ color: 'var(--muted)' }}>
                    Усього підрозділів: <strong style={{ color: 'var(--text)' }}>{deptList.length}</strong>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {canSeeAllDepartments && (
                      <button
                        type="button"
                        onClick={() => {
                          onSelectDepartment(null);
                          requestClose();
                        }}
                        className="inline-flex min-h-[40px] items-center gap-1.5 px-3.5 text-[13px] font-bold transition"
                        style={{
                          borderRadius: 'var(--r-sm)',
                          background: activeDepartmentId === null ? 'var(--primary-soft)' : 'var(--surface-2)',
                          color: activeDepartmentId === null ? 'var(--primary-ink)' : 'var(--text-2)',
                          border: activeDepartmentId === null ? '1px solid var(--primary)' : '1px solid var(--border)',
                        }}
                      >
                        <span>Усі підрозділи</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={openCreate}
                      className="inline-flex min-h-[40px] items-center gap-1.5 px-4 text-[13px] font-bold transition"
                      style={{
                        borderRadius: 'var(--r-sm)',
                        background: 'linear-gradient(135deg, var(--primary), var(--primary-2))',
                        color: 'var(--surface)',
                      }}
                    >
                      <Plus className="h-4 w-4" aria-hidden="true" />
                      <span>Додати підрозділ</span>
                    </button>
                  </div>
                </div>

                {isLoading ? (
                  <div className="py-8 text-center text-[13px]" style={{ color: 'var(--muted)' }}>
                    Завантаження підрозділів...
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {deptList.map((dp) => {
                      const isActive = activeDepartmentId === dp.id;
                      return (
                        <div
                          key={dp.id}
                          className="flex flex-col justify-between gap-3 p-4 transition"
                          style={{
                            background: isActive ? 'var(--primary-soft)' : 'var(--surface-2)',
                            border: isActive
                              ? '1.5px solid var(--primary)'
                              : '1px solid var(--border)',
                            borderRadius: 'var(--r-md)',
                          }}
                        >
                          <div className="space-y-2">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <span
                                    className="rounded-md px-2 py-0.5 font-mono text-[11px] font-bold uppercase"
                                    style={{
                                      background: 'var(--surface)',
                                      color: 'var(--primary-ink)',
                                      border: '1px solid var(--border)',
                                    }}
                                  >
                                    {dp.code}
                                  </span>
                                  <span
                                    className="truncate text-[14px] font-extrabold"
                                    style={{ color: 'var(--text)' }}
                                  >
                                    {dp.name}
                                  </span>
                                </div>
                                {dp.description && (
                                  <p className="mt-1 text-[12px] leading-snug" style={{ color: 'var(--muted)' }}>
                                    {dp.description}
                                  </p>
                                )}
                              </div>
                            </div>

                            <div className="space-y-1 text-[12px]" style={{ color: 'var(--text-2)' }}>
                              {dp.headName && (
                                <div className="flex items-center gap-1.5">
                                  <UserCheck className="h-3.5 w-3.5 shrink-0" style={{ color: 'var(--muted)' }} />
                                  <span>Керівник: <strong>{dp.headName}</strong></span>
                                </div>
                              )}
                              {dp.address && (
                                <div className="flex items-center gap-1.5">
                                  <MapPin className="h-3.5 w-3.5 shrink-0" style={{ color: 'var(--muted)' }} />
                                  <span className="truncate">{dp.address}</span>
                                </div>
                              )}
                            </div>

                            <div className="flex flex-wrap gap-1.5 pt-1">
                              <span
                                className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold"
                                style={{ background: 'var(--surface)', color: 'var(--text-2)' }}
                              >
                                <Users className="h-3 w-3" />
                                Штат: {dp.employeesCount ?? 0}
                              </span>
                              <span
                                className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold"
                                style={{ background: 'var(--surface)', color: 'var(--primary-ink)' }}
                              >
                                Логінів: {dp.usersCount ?? 0}
                              </span>
                              <span
                                className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold"
                                style={{ background: 'var(--surface)', color: 'var(--pos-ink)' }}
                              >
                                <FileText className="h-3 w-3" />
                                Документів: {dp.documentsCount ?? 0}
                              </span>
                            </div>
                          </div>

                          <div
                            className="flex items-center justify-between gap-2 pt-2.5"
                            style={{ borderTop: '1px solid var(--border)' }}
                          >
                            <button
                              type="button"
                              onClick={() => {
                                onSelectDepartment(dp.id);
                                requestClose();
                              }}
                              className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg px-3 text-[12px] font-bold transition"
                              style={{
                                background: isActive ? 'var(--primary)' : 'var(--surface)',
                                color: isActive ? 'var(--surface)' : 'var(--primary-ink)',
                                border: '1px solid var(--border-strong)',
                              }}
                            >
                              {isActive ? (
                                <>
                                  <CheckCircle2 className="h-3.5 w-3.5" />
                                  <span>Обрано</span>
                                </>
                              ) : (
                                <span>Переключитись</span>
                              )}
                            </button>

                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => openEdit(dp)}
                                title="Редагувати підрозділ"
                                className="flex h-9 w-9 items-center justify-center rounded-lg transition"
                                style={{
                                  background: 'var(--surface)',
                                  border: '1px solid var(--border)',
                                  color: 'var(--text-2)',
                                }}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                              {deptList.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => handleDelete(dp)}
                                  title="Видалити підрозділ"
                                  className="flex h-9 w-9 items-center justify-center rounded-lg transition"
                                  style={{
                                    background: 'var(--neg-soft)',
                                    color: 'var(--neg-ink)',
                                  }}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            ) : (
              <form onSubmit={handleSave} className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-[15px] font-extrabold" style={{ color: 'var(--text)' }}>
                    {mode === 'create' ? 'Новий підрозділ / філія' : 'Редагування підрозділу'}
                  </h3>
                  <button
                    type="button"
                    onClick={() => setMode('list')}
                    className="text-[12px] font-bold"
                    style={{ color: 'var(--muted)' }}
                  >
                    ← До списку
                  </button>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div className="sm:col-span-2">
                    <label className="mb-1 block text-[12px] font-bold" style={{ color: 'var(--text-2)' }}>
                      Назва підрозділу *
                    </label>
                    <input
                      type="text"
                      required
                      value={form.name}
                      onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))}
                      placeholder="Наприклад: Філія Львів або Відділ опту"
                      className="min-h-[44px] w-full rounded-xl px-3.5 text-[14px]"
                      style={{
                        background: 'var(--surface)',
                        border: '1px solid var(--border-strong)',
                        color: 'var(--text)',
                      }}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[12px] font-bold" style={{ color: 'var(--text-2)' }}>
                      Код (короткий)
                    </label>
                    <input
                      type="text"
                      value={form.code}
                      onChange={(e) => setForm((s) => ({ ...s, code: e.target.value }))}
                      placeholder="LVIV-1"
                      className="min-h-[44px] w-full rounded-xl px-3.5 font-mono text-[14px] uppercase"
                      style={{
                        background: 'var(--surface)',
                        border: '1px solid var(--border-strong)',
                        color: 'var(--text)',
                      }}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-[12px] font-bold" style={{ color: 'var(--text-2)' }}>
                      Керівник підрозділу
                    </label>
                    <input
                      type="text"
                      value={form.headName}
                      onChange={(e) => setForm((s) => ({ ...s, headName: e.target.value }))}
                      placeholder="ПІБ керівника"
                      className="min-h-[44px] w-full rounded-xl px-3.5 text-[14px]"
                      style={{
                        background: 'var(--surface)',
                        border: '1px solid var(--border-strong)',
                        color: 'var(--text)',
                      }}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[12px] font-bold" style={{ color: 'var(--text-2)' }}>
                      Адреса / локація
                    </label>
                    <input
                      type="text"
                      value={form.address}
                      onChange={(e) => setForm((s) => ({ ...s, address: e.target.value }))}
                      placeholder="м. Київ, вул. ..."
                      className="min-h-[44px] w-full rounded-xl px-3.5 text-[14px]"
                      style={{
                        background: 'var(--surface)',
                        border: '1px solid var(--border-strong)',
                        color: 'var(--text)',
                      }}
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-[12px] font-bold" style={{ color: 'var(--text-2)' }}>
                    Опис / призначення
                  </label>
                  <input
                    type="text"
                    value={form.description}
                    onChange={(e) => setForm((s) => ({ ...s, description: e.target.value }))}
                    placeholder="За що відповідає підрозділ"
                    className="min-h-[44px] w-full rounded-xl px-3.5 text-[14px]"
                    style={{
                      background: 'var(--surface)',
                      border: '1px solid var(--border-strong)',
                      color: 'var(--text)',
                    }}
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setMode('list')}
                    className="min-h-[44px] rounded-xl px-4 text-[13px] font-bold"
                    style={{
                      background: 'var(--surface-2)',
                      border: '1px solid var(--border)',
                      color: 'var(--text-2)',
                    }}
                  >
                    Скасувати
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="min-h-[44px] rounded-xl px-5 text-[13px] font-bold"
                    style={{
                      background: 'linear-gradient(135deg, var(--primary), var(--primary-2))',
                      color: 'var(--surface)',
                    }}
                  >
                    {saving ? 'Збереження...' : mode === 'create' ? 'Створити підрозділ' : 'Зберегти зміни'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </OverlayDialog>
  );
}
