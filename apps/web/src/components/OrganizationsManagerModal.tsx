import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  X,
  Plus,
  Building2,
  UserCheck,
  CheckCircle2,
  Pencil,
  Trash2,
  AlertCircle,
  Landmark,
  Warehouse,
  FileText,
  Sparkles,
} from 'lucide-react';
import {
  apiFetch,
  TAX_SYSTEM_LABELS,
  type OrgEntityType,
  type OrganizationDto,
  type TaxSystemType,
} from '../lib/api';

interface OrgStatsDto extends OrganizationDto {
  docsCount: number;
  postedDocsCount: number;
  warehousesCount: number;
  cashAccountsCount: number;
}

interface Props {
  activeOrgId: string;
  onSelectOrg: (orgId: string) => void;
  onClose: () => void;
}

const PRESETS: Array<{
  label: string;
  entityType: OrgEntityType;
  taxSystem: TaxSystemType;
  placeholderName: string;
}> = [
  {
    label: 'ФОП 3 гр. (5%)',
    entityType: 'FOP',
    taxSystem: 'EP_GROUP_3_5',
    placeholderName: 'ФОП Петренко Іван Сергійович',
  },
  {
    label: 'ФОП 2 гр. (ЄП)',
    entityType: 'FOP',
    taxSystem: 'EP_GROUP_2',
    placeholderName: 'ФОП Мельник Олена Вікторівна',
  },
  {
    label: 'ФОП 3 гр. (3% + ПДВ)',
    entityType: 'FOP',
    taxSystem: 'EP_GROUP_3_3_VAT',
    placeholderName: 'ФОП Сидоренко Олег Миколайович',
  },
  {
    label: 'ТОВ (ПДВ 20%)',
    entityType: 'TOV',
    taxSystem: 'GENERAL_VAT',
    placeholderName: 'ТОВ «Новий Бізнес Груп»',
  },
  {
    label: 'ТОВ (без ПДВ)',
    entityType: 'TOV',
    taxSystem: 'GENERAL_NO_VAT',
    placeholderName: 'ТОВ «Сервіс Плюс»',
  },
];

export function OrganizationsManagerModal({ activeOrgId, onSelectOrg, onClose }: Props) {
  const qc = useQueryClient();
  const [formMode, setFormMode] = useState<'list' | 'create' | 'edit'>('list');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: '',
    entityType: 'FOP' as OrgEntityType,
    taxSystem: 'EP_GROUP_3_5' as TaxSystemType,
    edrpou: '',
    ipn: '',
    iban: '',
    bankName: 'АТ КБ «ПриватБанк»',
    address: '',
    directorName: '',
    switchAfterCreate: true,
  });

  const { data: orgs = [], isLoading } = useQuery({
    queryKey: ['organizations-list'],
    queryFn: () => apiFetch<OrgStatsDto[]>('/api/organizations'),
  });

  const openCreateForm = (preset?: (typeof PRESETS)[number]) => {
    setError(null);
    setEditingId(null);
    setForm({
      name: '',
      entityType: preset?.entityType ?? 'FOP',
      taxSystem: preset?.taxSystem ?? 'EP_GROUP_3_5',
      edrpou: '',
      ipn: '',
      iban: '',
      bankName: 'АТ «Універсал Банк» (Monobank)',
      address: '',
      directorName: '',
      switchAfterCreate: true,
    });
    setFormMode('create');
  };

  const openEditForm = (org: OrgStatsDto) => {
    setError(null);
    setEditingId(org.id);
    setForm({
      name: org.name,
      entityType: org.entityType,
      taxSystem: org.taxSystem,
      edrpou: org.edrpou,
      ipn: org.ipn ?? '',
      iban: org.iban ?? '',
      bankName: org.bankName ?? '',
      address: org.address ?? '',
      directorName: org.directorName ?? '',
      switchAfterCreate: false,
    });
    setFormMode('edit');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      if (formMode === 'create') {
        const created = await apiFetch<OrganizationDto>('/api/organizations', {
          method: 'POST',
          body: JSON.stringify({
            name: form.name.trim(),
            entityType: form.entityType,
            taxSystem: form.taxSystem,
            edrpou: form.edrpou.trim(),
            ipn: form.ipn.trim(),
            iban: form.iban.trim(),
            bankName: form.bankName.trim(),
            address: form.address.trim(),
            directorName: form.directorName.trim(),
          }),
        });
        await qc.invalidateQueries({ queryKey: ['organizations-list'] });
        if (form.switchAfterCreate) {
          onSelectOrg(created.id);
          onClose();
          return;
        }
        setNotice(
          `Створено «${created.name}» з автоматичним складом, банківським рахунком IBAN та касою!`
        );
        setFormMode('list');
      } else if (formMode === 'edit' && editingId) {
        await apiFetch<OrganizationDto>(`/api/organizations/${editingId}`, {
          method: 'PATCH',
          body: JSON.stringify({
            name: form.name.trim(),
            entityType: form.entityType,
            taxSystem: form.taxSystem,
            edrpou: form.edrpou.trim(),
            ipn: form.ipn.trim(),
            iban: form.iban.trim(),
            bankName: form.bankName.trim(),
            address: form.address.trim(),
            directorName: form.directorName.trim(),
          }),
        });
        await qc.invalidateQueries({ queryKey: ['organizations-list'] });
        await qc.invalidateQueries({ queryKey: ['bootstrap'] });
        setNotice(`Оновлено реквізити «${form.name.trim()}»`);
        setFormMode('list');
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (org: OrgStatsDto) => {
    if (!confirm(`Видалити організацію «${org.name}»?`)) return;
    setError(null);
    try {
      await apiFetch(`/api/organizations/${org.id}`, { method: 'DELETE' });
      await qc.invalidateQueries({ queryKey: ['organizations-list'] });
      await qc.invalidateQueries({ queryKey: ['bootstrap'] });
      setNotice(`Організацію «${org.name}» видалено`);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        className="animate-modal-in flex max-h-[88vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50/80 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 to-emerald-500 text-white shadow-xs">
              <Building2 className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-display text-base font-bold text-slate-900">
                Організації та ФОП у системі ({orgs.length})
              </h2>
              <p className="text-xs text-slate-500">
                Ведіть кілька ФОП та ТОВ в одній базі: спільні товари й клієнти, окремі склади, рахунки, документи та звітність ДПС
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {formMode === 'list' && (
              <button
                onClick={() => openCreateForm()}
                className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-emerald-700"
              >
                <Plus className="h-4 w-4" /> Додати ФОП / ТОВ
              </button>
            )}
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-200/70 hover:text-slate-700"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {error && (
            <div className="mb-4 flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-medium text-rose-800">
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
              <span>{error}</span>
            </div>
          )}

          {notice && (
            <div className="mb-4 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-medium text-emerald-800">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
              <span>{notice}</span>
            </div>
          )}

          {formMode !== 'list' ? (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-900">
                  {formMode === 'create'
                    ? 'Нова організація / ФОП'
                    : 'Редагування реквізитів організації / ФОП'}
                </h3>
                <button
                  type="button"
                  onClick={() => setFormMode('list')}
                  className="text-xs font-medium text-slate-500 hover:text-slate-800"
                >
                  ← Повернутися до списку
                </button>
              </div>

              {formMode === 'create' && (
                <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-3">
                  <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold text-indigo-800">
                    <Sparkles className="h-3.5 w-3.5" /> Швидкий шаблон (система оподаткування):
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {PRESETS.map((p) => {
                      const active =
                        form.entityType === p.entityType && form.taxSystem === p.taxSystem;
                      return (
                        <button
                          key={p.label}
                          type="button"
                          onClick={() =>
                            setForm((s) => ({
                              ...s,
                              entityType: p.entityType,
                              taxSystem: p.taxSystem,
                            }))
                          }
                          className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${
                            active
                              ? 'bg-indigo-600 text-white shadow-xs'
                              : 'border border-slate-200 bg-white text-slate-700 hover:border-indigo-300'
                          }`}
                        >
                          {p.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-xs font-semibold text-slate-700">
                    Повна назва (ФОП або ТОВ) *
                  </label>
                  <input
                    required
                    value={form.name}
                    onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))}
                    placeholder={
                      form.entityType === 'FOP'
                        ? 'Напр. ФОП Петренко Іван Сергійович'
                        : 'Напр. ТОВ «Альфа Трейд Україна»'
                    }
                    className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm focus:border-indigo-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">
                    Форма власності
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setForm((s) => ({ ...s, entityType: 'FOP' }))}
                      className={`flex items-center justify-center gap-1.5 rounded-xl border py-2 text-xs font-semibold ${
                        form.entityType === 'FOP'
                          ? 'border-emerald-500 bg-emerald-50 text-emerald-800'
                          : 'border-slate-200 bg-white text-slate-600'
                      }`}
                    >
                      <UserCheck className="h-3.5 w-3.5" /> ФОП
                    </button>
                    <button
                      type="button"
                      onClick={() => setForm((s) => ({ ...s, entityType: 'TOV' }))}
                      className={`flex items-center justify-center gap-1.5 rounded-xl border py-2 text-xs font-semibold ${
                        form.entityType === 'TOV'
                          ? 'border-indigo-500 bg-indigo-50 text-indigo-800'
                          : 'border-slate-200 bg-white text-slate-600'
                      }`}
                    >
                      <Building2 className="h-3.5 w-3.5" /> ТОВ / Юрособа
                    </button>
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">
                    Система оподаткування
                  </label>
                  <select
                    value={form.taxSystem}
                    onChange={(e) =>
                      setForm((s) => ({ ...s, taxSystem: e.target.value as TaxSystemType }))
                    }
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-medium focus:border-indigo-500 focus:outline-none"
                  >
                    {(Object.keys(TAX_SYSTEM_LABELS) as TaxSystemType[]).map((k) => (
                      <option key={k} value={k}>
                        {TAX_SYSTEM_LABELS[k]}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">
                    {form.entityType === 'FOP' ? 'РНОКПП (ІПН 10 цифр)' : 'Код ЄДРПОУ (8 цифр)'}
                  </label>
                  <input
                    value={form.edrpou}
                    onChange={(e) => setForm((s) => ({ ...s, edrpou: e.target.value }))}
                    placeholder={form.entityType === 'FOP' ? '3184509214' : '44556677'}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 font-mono text-xs focus:border-indigo-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">
                    ІПН платника ПДВ (якщо платник)
                  </label>
                  <input
                    value={form.ipn}
                    onChange={(e) => setForm((s) => ({ ...s, ipn: e.target.value }))}
                    placeholder="Опційно"
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 font-mono text-xs focus:border-indigo-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">
                    Основний IBAN рахунок
                  </label>
                  <input
                    value={form.iban}
                    onChange={(e) => setForm((s) => ({ ...s, iban: e.target.value }))}
                    placeholder="UA000000000000000000000000000"
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 font-mono text-xs focus:border-indigo-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">
                    Назва банку
                  </label>
                  <input
                    value={form.bankName}
                    onChange={(e) => setForm((s) => ({ ...s, bankName: e.target.value }))}
                    placeholder="АТ КБ «ПриватБанк» / Monobank"
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs focus:border-indigo-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">
                    Юридична адреса
                  </label>
                  <input
                    value={form.address}
                    onChange={(e) => setForm((s) => ({ ...s, address: e.target.value }))}
                    placeholder="м. Київ, вул. ..."
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs focus:border-indigo-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">
                    Директор / Підписант
                  </label>
                  <input
                    value={form.directorName}
                    onChange={(e) => setForm((s) => ({ ...s, directorName: e.target.value }))}
                    placeholder="ПІБ для друкованих форм"
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs focus:border-indigo-500 focus:outline-none"
                  />
                </div>
              </div>

              {formMode === 'create' && (
                <label className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50/70 px-3.5 py-2.5 text-xs font-medium text-emerald-900">
                  <input
                    type="checkbox"
                    checked={form.switchAfterCreate}
                    onChange={(e) =>
                      setForm((s) => ({ ...s, switchAfterCreate: e.target.checked }))
                    }
                    className="rounded border-emerald-400 text-emerald-600"
                  />
                  <span>
                    Одразу переключитися на нову організацію після створення (склад, рахунок IBAN та каса створюються автоматично)
                  </span>
                </label>
              )}

              <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-4">
                <button
                  type="button"
                  onClick={() => setFormMode('list')}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Скасувати
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-xl bg-indigo-600 px-5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-indigo-700 disabled:opacity-50"
                >
                  {saving
                    ? 'Збереження...'
                    : formMode === 'create'
                      ? 'Створити організацію / ФОП'
                      : 'Зберегти зміни'}
                </button>
              </div>
            </form>
          ) : (
            <div className="space-y-3">
              {isLoading && (
                <div className="py-8 text-center text-xs text-slate-400">
                  Завантаження списку організацій...
                </div>
              )}

              <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2">
                {orgs.map((org) => {
                  const isActive = org.id === activeOrgId;
                  const isFop = org.entityType === 'FOP';
                  return (
                    <div
                      key={org.id}
                      className={`relative flex flex-col justify-between rounded-2xl border p-4 transition ${
                        isActive
                          ? 'border-indigo-500 bg-indigo-50/30 ring-2 ring-indigo-100'
                          : 'border-slate-200 bg-white hover:border-slate-300'
                      }`}
                    >
                      <div>
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span
                              className={`rounded-md px-2 py-0.5 text-[10px] font-bold uppercase ${
                                isFop
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : 'bg-indigo-100 text-indigo-800'
                              }`}
                            >
                              {isFop ? 'ФОП' : 'ТОВ'}
                            </span>
                            <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                              {TAX_SYSTEM_LABELS[org.taxSystem] ?? org.taxSystem}
                            </span>
                            {isActive && (
                              <span className="inline-flex items-center gap-1 rounded-md bg-indigo-600 px-2 py-0.5 text-[10px] font-bold text-white">
                                <CheckCircle2 className="h-3 w-3" /> Активна
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1">
                            <button
                              title="Редагувати реквізити"
                              onClick={() => openEditForm(org)}
                              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            {orgs.length > 1 && org.docsCount === 0 && (
                              <button
                                title="Видалити організацію"
                                onClick={() => handleDelete(org)}
                                className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        </div>

                        <h3 className="mt-2.5 text-sm font-bold text-slate-900">{org.name}</h3>

                        <div className="mt-2 space-y-1 text-[11px] text-slate-500">
                          <div>
                            {isFop ? 'РНОКПП (ІПН):' : 'ЄДРПОУ:'}{' '}
                            <span className="font-mono font-semibold text-slate-700">
                              {org.edrpou || '—'}
                            </span>
                            {org.isVatPayer ? (
                              <span className="ml-2 rounded bg-sky-50 px-1.5 py-0.5 text-[10px] font-semibold text-sky-700">
                                Платник ПДВ {org.vatRate}%
                              </span>
                            ) : (
                              <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                                Без ПДВ
                              </span>
                            )}
                          </div>
                          {org.iban && (
                            <div className="truncate font-mono text-[10px] text-slate-500">
                              IBAN: {org.iban}
                            </div>
                          )}
                        </div>

                        <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-2.5 text-[11px] text-slate-500">
                          <span className="inline-flex items-center gap-1">
                            <FileText className="h-3 w-3 text-slate-400" />
                            Документів: <strong className="text-slate-700">{org.docsCount}</strong>
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <Warehouse className="h-3 w-3 text-slate-400" />
                            Складів: <strong className="text-slate-700">{org.warehousesCount}</strong>
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <Landmark className="h-3 w-3 text-slate-400" />
                            Рахунків:{' '}
                            <strong className="text-slate-700">{org.cashAccountsCount}</strong>
                          </span>
                        </div>
                      </div>

                      <div className="mt-4 flex items-center gap-2">
                        {isActive ? (
                          <button
                            onClick={onClose}
                            className="w-full rounded-xl bg-slate-900 py-2 text-xs font-semibold text-white hover:bg-slate-800"
                          >
                            Продовжити роботу
                          </button>
                        ) : (
                          <button
                            onClick={() => {
                              onSelectOrg(org.id);
                              onClose();
                            }}
                            className="w-full rounded-xl bg-indigo-600 py-2 text-xs font-semibold text-white hover:bg-indigo-700"
                          >
                            Переключитися та працювати
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
