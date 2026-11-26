import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Plus,
  Package,
  Users,
  Warehouse,
  Wallet,
  UserCheck,
  Cpu,
  Network,
  FolderTree,
  FileSignature,
  Tags,
  Printer,
  Upload,
  Pencil,
  Check,
  X,
  Save,
  RotateCcw,
} from 'lucide-react';
import {
  apiFetch,
  fmtMoney,
  fmtQty,
  type BootstrapData,
  type PrintTemplateDto,
} from '../lib/api';
import type { CatalogTabKey } from '../lib/menuConfig';
import { UniversalItemsImportModal } from '../components/UniversalItemsImportModal';

export type CatalogTab = CatalogTabKey;

export function CatalogsPage({
  bootstrap,
  initialTab = 'items',
}: {
  bootstrap: BootstrapData;
  initialTab?: CatalogTab;
}) {
  const qc = useQueryClient();
  const [tab, setTab] = useState<CatalogTab>(initialTab);
  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);
  const [search, setSearch] = useState('');
  const [importModalOpen, setImportModalOpen] = useState(false);

  // Quick-add forms
  const [newItem, setNewItem] = useState({
    sku: '',
    name: '',
    categoryId: '',
    unit: 'шт',
    itemType: 'GOODS' as 'GOODS' | 'SERVICE',
  });
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editItemDraft, setEditItemDraft] = useState({
    sku: '',
    barcode: '',
    name: '',
    categoryId: '',
    unit: 'шт',
    itemType: 'GOODS' as 'GOODS' | 'SERVICE',
  });

  const [newCategoryName, setNewCategoryName] = useState('');

  const [newCp, setNewCp] = useState({
    name: '',
    edrpou: '',
    phone: '',
    iban: '',
    isCustomer: true,
    isSupplier: false,
  });
  const [editingCpId, setEditingCpId] = useState<string | null>(null);
  const [editCpDraft, setEditCpDraft] = useState({
    name: '',
    edrpou: '',
    iban: '',
    phone: '',
    email: '',
    isCustomer: true,
    isSupplier: false,
  });

  const [newContract, setNewContract] = useState({
    counterpartyId: bootstrap.counterparties[0]?.id ?? '',
    name: '',
    currency: 'UAH',
    contractType: 'CUSTOMER' as 'CUSTOMER' | 'SUPPLIER',
  });

  const [newEmp, setNewEmp] = useState({
    fullName: '',
    rnokpp: '',
    position: '',
    department: 'ADMIN' as 'ADMIN' | 'SALES' | 'PRODUCTION',
    departmentId: bootstrap.activeDepartmentId ?? bootstrap.departments[0]?.id ?? '',
    baseSalary: '30000',
  });
  const [newDept, setNewDept] = useState({
    code: '',
    name: '',
    headName: '',
    address: '',
  });
  const [newWh, setNewWh] = useState({
    code: '',
    name: '',
    type: 'WHOLESALE' as 'WHOLESALE' | 'RETAIL',
  });
  const [newAcc, setNewAcc] = useState({
    name: '',
    accountType: 'BANK' as 'BANK' | 'CASH',
    iban: '',
  });
  const [newCfCat, setNewCfCat] = useState({
    name: '',
    direction: 'OUT' as 'IN' | 'OUT',
    isOperatingExpense: true,
  });
  const [newPriceType, setNewPriceType] = useState({
    code: '',
    name: '',
    currency: 'UAH',
  });

  // Print templates state
  const [selectedTplKey, setSelectedTplKey] = useState<string>('sales_waybill');
  const [tplDraft, setTplDraft] = useState<PrintTemplateDto | null>(null);
  const [savingTpl, setSavingTpl] = useState(false);

  const [msg, setMsg] = useState<string | null>(null);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  const templatesQuery = useQuery({
    queryKey: ['print-templates', bootstrap.organization.id],
    enabled: tab === 'templates',
    queryFn: () => apiFetch<PrintTemplateDto[]>('/api/print-templates'),
  });

  useEffect(() => {
    if (!templatesQuery.data?.length) return;
    const found =
      templatesQuery.data.find((t) => t.templateKey === selectedTplKey) ?? templatesQuery.data[0];
    if (found) {
      setSelectedTplKey(found.templateKey);
      setTplDraft({ ...found });
    }
  }, [templatesQuery.data, selectedTplKey]);

  const refresh = () => qc.invalidateQueries({ queryKey: ['bootstrap'] });

  const createItem = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrMsg(null);
    if (!newItem.sku || !newItem.name) return;
    try {
      await apiFetch('/api/catalogs/items', {
        method: 'POST',
        body: JSON.stringify({
          ...newItem,
          categoryId: newItem.categoryId || null,
        }),
      });
      setNewItem({ sku: '', name: '', categoryId: '', unit: 'шт', itemType: 'GOODS' });
      setMsg('Номенклатуру додано');
      refresh();
    } catch (e) {
      setErrMsg((e as Error).message);
    }
  };

  const startEditItem = (it: BootstrapData['items'][number]) => {
    setEditingItemId(it.id);
    setEditItemDraft({
      sku: it.sku,
      barcode: it.barcode || '',
      name: it.name,
      categoryId: it.categoryId || '',
      unit: it.unit,
      itemType: it.itemType,
    });
  };

  const saveEditItem = async (id: string) => {
    setErrMsg(null);
    try {
      await apiFetch(`/api/catalogs/items/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          ...editItemDraft,
          categoryId: editItemDraft.categoryId || null,
        }),
      });
      setEditingItemId(null);
      setMsg('Номенклатуру оновлено');
      refresh();
    } catch (e) {
      setErrMsg((e as Error).message);
    }
  };

  const createCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrMsg(null);
    if (!newCategoryName.trim()) return;
    try {
      await apiFetch('/api/catalogs/categories', {
        method: 'POST',
        body: JSON.stringify({ name: newCategoryName.trim() }),
      });
      setNewCategoryName('');
      setMsg('Категорію створено');
      refresh();
    } catch (e) {
      setErrMsg((e as Error).message);
    }
  };

  const createCp = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrMsg(null);
    if (!newCp.name) return;
    try {
      await apiFetch('/api/catalogs/counterparties', {
        method: 'POST',
        body: JSON.stringify(newCp),
      });
      setNewCp({ name: '', edrpou: '', phone: '', iban: '', isCustomer: true, isSupplier: false });
      setMsg('Контрагента додано');
      refresh();
    } catch (e) {
      setErrMsg((e as Error).message);
    }
  };

  const startEditCp = (cp: BootstrapData['counterparties'][number]) => {
    setEditingCpId(cp.id);
    setEditCpDraft({
      name: cp.name,
      edrpou: cp.edrpou || '',
      iban: cp.iban || '',
      phone: cp.phone || '',
      email: cp.email || '',
      isCustomer: cp.isCustomer,
      isSupplier: cp.isSupplier,
    });
  };

  const saveEditCp = async (id: string) => {
    setErrMsg(null);
    try {
      await apiFetch(`/api/catalogs/counterparties/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(editCpDraft),
      });
      setEditingCpId(null);
      setMsg('Дані контрагента оновлено');
      refresh();
    } catch (e) {
      setErrMsg((e as Error).message);
    }
  };

  const createContract = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrMsg(null);
    if (!newContract.counterpartyId || !newContract.name.trim()) return;
    try {
      await apiFetch('/api/catalogs/contracts', {
        method: 'POST',
        body: JSON.stringify(newContract),
      });
      setNewContract((s) => ({ ...s, name: '' }));
      setMsg('Договір створено');
      refresh();
    } catch (e) {
      setErrMsg((e as Error).message);
    }
  };

  const createEmp = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrMsg(null);
    if (!newEmp.fullName) return;
    try {
      await apiFetch('/api/catalogs/employees', {
        method: 'POST',
        body: JSON.stringify({
          ...newEmp,
          departmentId: newEmp.departmentId || null,
        }),
      });
      setNewEmp({
        fullName: '',
        rnokpp: '',
        position: '',
        department: 'ADMIN',
        departmentId: bootstrap.activeDepartmentId ?? bootstrap.departments[0]?.id ?? '',
        baseSalary: '30000',
      });
      setMsg('Співробітника додано до штатного розпису');
      refresh();
    } catch (e) {
      setErrMsg((e as Error).message);
    }
  };

  const changeEmployeeDept = async (empId: string, departmentId: string) => {
    await apiFetch(`/api/catalogs/employees/${empId}`, {
      method: 'PATCH',
      body: JSON.stringify({ departmentId: departmentId || null }),
    });
    setMsg('Підрозділ співробітника оновлено');
    refresh();
  };

  const createDept = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrMsg(null);
    if (!newDept.name.trim()) return;
    try {
      await apiFetch('/api/departments', {
        method: 'POST',
        body: JSON.stringify({
          organizationId: bootstrap.organization.id,
          ...newDept,
        }),
      });
      setNewDept({ code: '', name: '', headName: '', address: '' });
      setMsg('Підрозділ створено');
      refresh();
    } catch (e) {
      setErrMsg((e as Error).message);
    }
  };

  const createWh = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrMsg(null);
    if (!newWh.code || !newWh.name) return;
    try {
      await apiFetch('/api/catalogs/warehouses', { method: 'POST', body: JSON.stringify(newWh) });
      setNewWh({ code: '', name: '', type: 'WHOLESALE' });
      setMsg('Склад додано');
      refresh();
    } catch (e) {
      setErrMsg((e as Error).message);
    }
  };

  const createAcc = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrMsg(null);
    if (!newAcc.name) return;
    try {
      await apiFetch('/api/catalogs/cash-accounts', { method: 'POST', body: JSON.stringify(newAcc) });
      setNewAcc({ name: '', accountType: 'BANK', iban: '' });
      setMsg('Рахунок / касу додано');
      refresh();
    } catch (e) {
      setErrMsg((e as Error).message);
    }
  };

  const createCfCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrMsg(null);
    if (!newCfCat.name.trim()) return;
    try {
      await apiFetch('/api/catalogs/cashflow-categories', {
        method: 'POST',
        body: JSON.stringify(newCfCat),
      });
      setNewCfCat({ name: '', direction: 'OUT', isOperatingExpense: true });
      setMsg('Статтю руху коштів додано');
      refresh();
    } catch (e) {
      setErrMsg((e as Error).message);
    }
  };

  const createPriceType = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrMsg(null);
    if (!newPriceType.code.trim() || !newPriceType.name.trim()) return;
    try {
      await apiFetch('/api/catalogs/price-types', {
        method: 'POST',
        body: JSON.stringify(newPriceType),
      });
      setNewPriceType({ code: '', name: '', currency: 'UAH' });
      setMsg('Вид цін додано');
      refresh();
    } catch (e) {
      setErrMsg((e as Error).message);
    }
  };

  const saveTemplate = async () => {
    if (!tplDraft) return;
    setSavingTpl(true);
    setMsg(null);
    setErrMsg(null);
    try {
      const saved = await apiFetch<PrintTemplateDto>(
        `/api/print-templates/${encodeURIComponent(tplDraft.templateKey)}`,
        {
          method: 'PUT',
          body: JSON.stringify({
            docType: tplDraft.docType,
            name: tplDraft.name,
            standardCode: tplDraft.standardCode,
            titleText: tplDraft.titleText,
            subtitleText: tplDraft.subtitleText,
            headerNote: tplDraft.headerNote,
            footerNote: tplDraft.footerNote,
            signLeftLabel: tplDraft.signLeftLabel,
            signRightLabel: tplDraft.signRightLabel,
            showDiscountColumn: tplDraft.showDiscountColumn,
            showVatBlock: tplDraft.showVatBlock,
            showIbanBlock: tplDraft.showIbanBlock,
            showStampArea: tplDraft.showStampArea,
            showSkuColumn: tplDraft.showSkuColumn,
          }),
        }
      );
      setTplDraft(saved);
      setMsg(`Шаблон друкованої форми «${saved.name}» збережено`);
      qc.invalidateQueries({ queryKey: ['print-templates'] });
    } catch (e) {
      setErrMsg((e as Error).message);
    } finally {
      setSavingTpl(false);
    }
  };

  const resetTemplate = async () => {
    if (!tplDraft) return;
    setSavingTpl(true);
    setMsg(null);
    setErrMsg(null);
    try {
      const reset = await apiFetch<PrintTemplateDto>(
        `/api/print-templates/${encodeURIComponent(tplDraft.templateKey)}/reset`,
        { method: 'POST' }
      );
      setTplDraft(reset);
      setMsg('Шаблон скинуто до українського бухгалтерського стандарту');
      qc.invalidateQueries({ queryKey: ['print-templates'] });
    } catch (e) {
      setErrMsg((e as Error).message);
    } finally {
      setSavingTpl(false);
    }
  };

  const q = search.toLowerCase().trim();
  const itemMap = new Map(bootstrap.items.map((i) => [i.id, i]));
  const catMap = new Map(bootstrap.categories.map((c) => [c.id, c.name]));
  const cpMap = new Map(bootstrap.counterparties.map((c) => [c.id, c.name]));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Довідники (НДІ) та Друковані форми</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Номенклатура (імпорт PDF/XLS/CSV/XML), категорії, контрагенти, договори, кадри, склади,
            рахунки, статті РГК та редаговані бланки UA
          </p>
        </div>
        <button
          type="button"
          onClick={() => setImportModalOpen(true)}
          className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-extrabold shadow-xs transition"
          style={{
            background: 'linear-gradient(135deg, var(--primary), var(--primary-2))',
            color: 'var(--surface)',
          }}
        >
          <Upload className="h-4 w-4" />
          <span>Імпорт номенклатури (PDF / XLS / CSV / XML)</span>
        </button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {[
            { id: 'items' as const, label: `Номенклатура (${bootstrap.items.length})`, icon: Package },
            { id: 'categories' as const, label: `Категорії (${bootstrap.categories.length})`, icon: FolderTree },
            { id: 'counterparties' as const, label: `Контрагенти (${bootstrap.counterparties.length})`, icon: Users },
            { id: 'contracts' as const, label: `Договори (${bootstrap.contracts.length})`, icon: FileSignature },
            { id: 'employees' as const, label: `Співробітники (${bootstrap.employees.length})`, icon: UserCheck },
            { id: 'departments' as const, label: `Підрозділи (${bootstrap.departments.length})`, icon: Network },
            { id: 'warehouses' as const, label: `Склади (${bootstrap.warehouses.length})`, icon: Warehouse },
            { id: 'accounts' as const, label: `Каси та банки (${bootstrap.cashAccounts.length})`, icon: Wallet },
            { id: 'finance' as const, label: 'РГК і Види цін', icon: Tags },
            { id: 'bom' as const, label: `BOM (${bootstrap.bomSpecs.length})`, icon: Cpu },
            { id: 'templates' as const, label: 'Друковані форми UA', icon: Printer },
          ].map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                setTab(t.id);
                setMsg(null);
                setErrMsg(null);
              }}
              className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold transition"
              style={{
                background: tab === t.id ? 'var(--primary)' : 'var(--surface)',
                color: tab === t.id ? 'var(--surface)' : 'var(--text-2)',
                border: tab === t.id ? '1px solid var(--primary)' : '1px solid var(--border)',
              }}
            >
              <t.icon className="h-3.5 w-3.5" /> {t.label}
            </button>
          ))}
        </div>

        {tab !== 'templates' && (
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Пошук у довіднику..."
            className="rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs focus:border-indigo-500 focus:outline-none"
          />
        )}
      </div>

      {msg && (
        <div
          className="rounded-xl px-4 py-2.5 text-xs font-semibold"
          style={{ background: 'var(--pos-soft)', color: 'var(--pos-ink)' }}
        >
          {msg}
        </div>
      )}
      {errMsg && (
        <div
          className="rounded-xl px-4 py-2.5 text-xs font-semibold"
          style={{ background: 'var(--neg-soft)', color: 'var(--neg-ink)' }}
        >
          {errMsg}
        </div>
      )}

      {/* TAB 1: Номенклатура */}
      {tab === 'items' && (
        <div className="space-y-4">
          <form
            onSubmit={createItem}
            className="grid grid-cols-1 gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs sm:grid-cols-6"
          >
            <input
              placeholder="Артикул (SKU)"
              value={newItem.sku}
              onChange={(e) => setNewItem((s) => ({ ...s, sku: e.target.value }))}
              className="rounded-lg border border-slate-300 px-3 py-2 text-xs"
              required
            />
            <input
              placeholder="Найменування товару або послуги"
              value={newItem.name}
              onChange={(e) => setNewItem((s) => ({ ...s, name: e.target.value }))}
              className="rounded-lg border border-slate-300 px-3 py-2 text-xs sm:col-span-2"
              required
            />
            <select
              value={newItem.categoryId}
              onChange={(e) => setNewItem((s) => ({ ...s, categoryId: e.target.value }))}
              className="rounded-lg border border-slate-300 px-2.5 py-2 text-xs"
            >
              <option value="">— Без категорії —</option>
              {bootstrap.categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <div className="flex gap-2">
              <input
                placeholder="Од."
                value={newItem.unit}
                onChange={(e) => setNewItem((s) => ({ ...s, unit: e.target.value }))}
                className="w-16 rounded-lg border border-slate-300 px-2 py-2 text-xs"
              />
              <select
                value={newItem.itemType}
                onChange={(e) =>
                  setNewItem((s) => ({ ...s, itemType: e.target.value as 'GOODS' | 'SERVICE' }))
                }
                className="flex-1 rounded-lg border border-slate-300 px-2 py-2 text-xs"
              >
                <option value="GOODS">Товар</option>
                <option value="SERVICE">Послуга</option>
              </select>
            </div>
            <button
              type="submit"
              className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-medium text-white hover:bg-indigo-700"
            >
              <Plus className="h-3.5 w-3.5" /> Додати
            </button>
          </form>

          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-xs">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-4 py-3">Артикул</th>
                  <th className="px-4 py-3">Найменування</th>
                  <th className="px-4 py-3">Категорія</th>
                  <th className="px-4 py-3">Штрихкод</th>
                  <th className="px-4 py-3">Од. вим.</th>
                  <th className="px-4 py-3">Тип</th>
                  <th className="w-20 px-3 py-3 text-right">Дії</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {bootstrap.items
                  .filter(
                    (i) =>
                      !q ||
                      i.name.toLowerCase().includes(q) ||
                      i.sku.toLowerCase().includes(q) ||
                      (i.categoryId ? (catMap.get(i.categoryId) ?? '').toLowerCase().includes(q) : false)
                  )
                  .map((it) => {
                    const editing = editingItemId === it.id;
                    return (
                      <tr key={it.id} className="hover:bg-slate-50">
                        <td className="px-4 py-2.5 font-mono font-medium text-slate-600">
                          {editing ? (
                            <input
                              value={editItemDraft.sku}
                              onChange={(e) => setEditItemDraft((s) => ({ ...s, sku: e.target.value }))}
                              className="w-24 rounded border border-indigo-300 px-1.5 py-1 font-mono text-xs"
                            />
                          ) : (
                            it.sku
                          )}
                        </td>
                        <td className="px-4 py-2.5 font-medium text-slate-900">
                          {editing ? (
                            <input
                              value={editItemDraft.name}
                              onChange={(e) => setEditItemDraft((s) => ({ ...s, name: e.target.value }))}
                              className="w-full rounded border border-indigo-300 px-2 py-1 text-xs"
                            />
                          ) : (
                            it.name
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-slate-600">
                          {editing ? (
                            <select
                              value={editItemDraft.categoryId}
                              onChange={(e) =>
                                setEditItemDraft((s) => ({ ...s, categoryId: e.target.value }))
                              }
                              className="rounded border border-indigo-300 px-1.5 py-1 text-xs"
                            >
                              <option value="">—</option>
                              {bootstrap.categories.map((c) => (
                                <option key={c.id} value={c.id}>
                                  {c.name}
                                </option>
                              ))}
                            </select>
                          ) : (
                            (it.categoryId && catMap.get(it.categoryId)) || '—'
                          )}
                        </td>
                        <td className="px-4 py-2.5 font-mono text-slate-400">
                          {editing ? (
                            <input
                              value={editItemDraft.barcode}
                              onChange={(e) =>
                                setEditItemDraft((s) => ({ ...s, barcode: e.target.value }))
                              }
                              className="w-28 rounded border border-indigo-300 px-1.5 py-1 font-mono text-xs"
                            />
                          ) : (
                            it.barcode || '—'
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-slate-600">
                          {editing ? (
                            <input
                              value={editItemDraft.unit}
                              onChange={(e) => setEditItemDraft((s) => ({ ...s, unit: e.target.value }))}
                              className="w-14 rounded border border-indigo-300 px-1.5 py-1 text-xs"
                            />
                          ) : (
                            it.unit
                          )}
                        </td>
                        <td className="px-4 py-2.5">
                          {editing ? (
                            <select
                              value={editItemDraft.itemType}
                              onChange={(e) =>
                                setEditItemDraft((s) => ({
                                  ...s,
                                  itemType: e.target.value as 'GOODS' | 'SERVICE',
                                }))
                              }
                              className="rounded border border-indigo-300 px-1.5 py-1 text-xs"
                            >
                              <option value="GOODS">Товар</option>
                              <option value="SERVICE">Послуга</option>
                            </select>
                          ) : (
                            <span
                              className="rounded-full px-2 py-0.5 text-[11px] font-medium"
                              style={{
                                background:
                                  it.itemType === 'GOODS' ? 'var(--info-soft)' : 'var(--violet-soft)',
                                color:
                                  it.itemType === 'GOODS' ? 'var(--info-ink)' : 'var(--violet-ink)',
                              }}
                            >
                              {it.itemType === 'GOODS' ? 'Товар' : 'Послуга'}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          {editing ? (
                            <div className="inline-flex gap-1">
                              <button
                                type="button"
                                onClick={() => saveEditItem(it.id)}
                                className="rounded p-1"
                                style={{ background: 'var(--pos-soft)', color: 'var(--pos-ink)' }}
                              >
                                <Check className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingItemId(null)}
                                className="rounded p-1"
                                style={{ background: 'var(--neutral-soft)', color: 'var(--muted)' }}
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => startEditItem(it)}
                              title="Редагувати позицію"
                              className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-indigo-600"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: Категорії товарів */}
      {tab === 'categories' && (
        <div className="space-y-4">
          <form
            onSubmit={createCategory}
            className="flex flex-wrap gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs"
          >
            <input
              placeholder="Назва нової категорії товарів / послуг..."
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              className="min-w-[240px] flex-1 rounded-lg border border-slate-300 px-3 py-2 text-xs"
              required
            />
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-medium text-white hover:bg-indigo-700"
            >
              <Plus className="h-3.5 w-3.5" /> Додати категорію
            </button>
          </form>

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-4 py-3">Назва категорії</th>
                  <th className="px-4 py-3 text-right">Кількість позицій номенклатури</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {bootstrap.categories
                  .filter((c) => !q || c.name.toLowerCase().includes(q))
                  .map((cat) => {
                    const count = bootstrap.items.filter((i) => i.categoryId === cat.id).length;
                    return (
                      <tr key={cat.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3 font-semibold text-slate-900">{cat.name}</td>
                        <td className="px-4 py-3 text-right font-mono font-bold text-indigo-700">
                          {count}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: Контрагенти */}
      {tab === 'counterparties' && (
        <div className="space-y-4">
          <form
            onSubmit={createCp}
            className="grid grid-cols-1 gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs sm:grid-cols-6"
          >
            <input
              placeholder="Назва контрагента / ФОП"
              value={newCp.name}
              onChange={(e) => setNewCp((s) => ({ ...s, name: e.target.value }))}
              className="rounded-lg border border-slate-300 px-3 py-2 text-xs sm:col-span-2"
              required
            />
            <input
              placeholder="ЄДРПОУ / ІПН"
              value={newCp.edrpou}
              onChange={(e) => setNewCp((s) => ({ ...s, edrpou: e.target.value }))}
              className="rounded-lg border border-slate-300 px-3 py-2 text-xs"
            />
            <input
              placeholder="Телефон"
              value={newCp.phone}
              onChange={(e) => setNewCp((s) => ({ ...s, phone: e.target.value }))}
              className="rounded-lg border border-slate-300 px-3 py-2 text-xs"
            />
            <div className="flex items-center gap-3 text-xs text-slate-700">
              <label className="flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={newCp.isCustomer}
                  onChange={(e) => setNewCp((s) => ({ ...s, isCustomer: e.target.checked }))}
                />
                Покупець
              </label>
              <label className="flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={newCp.isSupplier}
                  onChange={(e) => setNewCp((s) => ({ ...s, isSupplier: e.target.checked }))}
                />
                Постачальник
              </label>
            </div>
            <button
              type="submit"
              className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-medium text-white hover:bg-indigo-700"
            >
              <Plus className="h-3.5 w-3.5" /> Додати
            </button>
          </form>

          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-xs">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-4 py-3">Найменування</th>
                  <th className="px-4 py-3">ЄДРПОУ / ІПН</th>
                  <th className="px-4 py-3">IBAN</th>
                  <th className="px-4 py-3">Контакти</th>
                  <th className="px-4 py-3">Ролі</th>
                  <th className="w-20 px-3 py-3 text-right">Дії</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {bootstrap.counterparties
                  .filter(
                    (c) =>
                      !q ||
                      c.name.toLowerCase().includes(q) ||
                      c.edrpou.toLowerCase().includes(q) ||
                      c.phone.toLowerCase().includes(q)
                  )
                  .map((cp) => {
                    const editing = editingCpId === cp.id;
                    return (
                      <tr key={cp.id} className="hover:bg-slate-50">
                        <td className="px-4 py-2.5 font-medium text-slate-900">
                          {editing ? (
                            <input
                              value={editCpDraft.name}
                              onChange={(e) => setEditCpDraft((s) => ({ ...s, name: e.target.value }))}
                              className="w-full rounded border border-indigo-300 px-2 py-1 text-xs"
                            />
                          ) : (
                            cp.name
                          )}
                        </td>
                        <td className="px-4 py-2.5 font-mono text-slate-600">
                          {editing ? (
                            <input
                              value={editCpDraft.edrpou}
                              onChange={(e) =>
                                setEditCpDraft((s) => ({ ...s, edrpou: e.target.value }))
                              }
                              className="w-28 rounded border border-indigo-300 px-1.5 py-1 font-mono text-xs"
                            />
                          ) : (
                            cp.edrpou || '—'
                          )}
                        </td>
                        <td className="px-4 py-2.5 font-mono text-[11px] text-slate-500">
                          {editing ? (
                            <input
                              value={editCpDraft.iban}
                              onChange={(e) => setEditCpDraft((s) => ({ ...s, iban: e.target.value }))}
                              placeholder="UA..."
                              className="w-44 rounded border border-indigo-300 px-1.5 py-1 font-mono text-[11px]"
                            />
                          ) : (
                            cp.iban || '—'
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-slate-500">
                          {editing ? (
                            <input
                              value={editCpDraft.phone}
                              onChange={(e) => setEditCpDraft((s) => ({ ...s, phone: e.target.value }))}
                              className="w-32 rounded border border-indigo-300 px-1.5 py-1 text-xs"
                            />
                          ) : (
                            cp.phone || cp.email ? `${cp.phone} ${cp.email}`.trim() : '—'
                          )}
                        </td>
                        <td className="px-4 py-2.5 space-x-1">
                          {editing ? (
                            <div className="flex gap-2">
                              <label className="flex items-center gap-1">
                                <input
                                  type="checkbox"
                                  checked={editCpDraft.isCustomer}
                                  onChange={(e) =>
                                    setEditCpDraft((s) => ({ ...s, isCustomer: e.target.checked }))
                                  }
                                />
                                Пок.
                              </label>
                              <label className="flex items-center gap-1">
                                <input
                                  type="checkbox"
                                  checked={editCpDraft.isSupplier}
                                  onChange={(e) =>
                                    setEditCpDraft((s) => ({ ...s, isSupplier: e.target.checked }))
                                  }
                                />
                                Пост.
                              </label>
                            </div>
                          ) : (
                            <>
                              {cp.isCustomer && (
                                <span
                                  className="rounded-full px-2 py-0.5 text-[11px] font-medium"
                                  style={{ background: 'var(--pos-soft)', color: 'var(--pos-ink)' }}
                                >
                                  Покупець
                                </span>
                              )}
                              {cp.isSupplier && (
                                <span
                                  className="rounded-full px-2 py-0.5 text-[11px] font-medium"
                                  style={{ background: 'var(--info-soft)', color: 'var(--info-ink)' }}
                                >
                                  Постачальник
                                </span>
                              )}
                            </>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          {editing ? (
                            <div className="inline-flex gap-1">
                              <button
                                type="button"
                                onClick={() => saveEditCp(cp.id)}
                                className="rounded p-1"
                                style={{ background: 'var(--pos-soft)', color: 'var(--pos-ink)' }}
                              >
                                <Check className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingCpId(null)}
                                className="rounded p-1"
                                style={{ background: 'var(--neutral-soft)', color: 'var(--muted)' }}
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => startEditCp(cp)}
                              title="Редагувати контрагента"
                              className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-indigo-600"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 4: Договори */}
      {tab === 'contracts' && (
        <div className="space-y-4">
          <form
            onSubmit={createContract}
            className="grid grid-cols-1 gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs sm:grid-cols-5"
          >
            <select
              value={newContract.counterpartyId}
              onChange={(e) => setNewContract((s) => ({ ...s, counterpartyId: e.target.value }))}
              className="rounded-lg border border-slate-300 px-3 py-2 text-xs"
              required
            >
              <option value="">— Оберіть контрагента —</option>
              {bootstrap.counterparties.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <input
              placeholder="Назва / номер договору (напр. Договір поставки №12)"
              value={newContract.name}
              onChange={(e) => setNewContract((s) => ({ ...s, name: e.target.value }))}
              className="rounded-lg border border-slate-300 px-3 py-2 text-xs sm:col-span-2"
              required
            />
            <div className="flex gap-2">
              <select
                value={newContract.currency}
                onChange={(e) => setNewContract((s) => ({ ...s, currency: e.target.value }))}
                className="w-20 rounded-lg border border-slate-300 px-2 py-2 font-mono text-xs"
              >
                <option value="UAH">UAH</option>
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
              </select>
              <select
                value={newContract.contractType}
                onChange={(e) =>
                  setNewContract((s) => ({
                    ...s,
                    contractType: e.target.value as 'CUSTOMER' | 'SUPPLIER',
                  }))
                }
                className="flex-1 rounded-lg border border-slate-300 px-2 py-2 text-xs"
              >
                <option value="CUSTOMER">З покупцем</option>
                <option value="SUPPLIER">З постачальником</option>
              </select>
            </div>
            <button
              type="submit"
              className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-medium text-white hover:bg-indigo-700"
            >
              <Plus className="h-3.5 w-3.5" /> Додати договір
            </button>
          </form>

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-4 py-3">Договір</th>
                  <th className="px-4 py-3">Контрагент</th>
                  <th className="px-4 py-3">Тип</th>
                  <th className="px-4 py-3">Валюта</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {bootstrap.contracts
                  .filter(
                    (c) =>
                      !q ||
                      c.name.toLowerCase().includes(q) ||
                      (cpMap.get(c.counterpartyId) ?? '').toLowerCase().includes(q)
                  )
                  .map((ctr) => (
                    <tr key={ctr.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-semibold text-slate-900">{ctr.name}</td>
                      <td className="px-4 py-3 text-slate-700">
                        {cpMap.get(ctr.counterpartyId) ?? '—'}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className="rounded-full px-2 py-0.5 text-[11px] font-medium"
                          style={{
                            background:
                              ctr.contractType === 'CUSTOMER'
                                ? 'var(--pos-soft)'
                                : 'var(--info-soft)',
                            color:
                              ctr.contractType === 'CUSTOMER'
                                ? 'var(--pos-ink)'
                                : 'var(--info-ink)',
                          }}
                        >
                          {ctr.contractType === 'CUSTOMER' ? 'З покупцем' : 'З постачальником'}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono font-semibold text-slate-700">
                        {ctr.currency}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 5: Співробітники */}
      {tab === 'employees' && (
        <div className="space-y-4">
          <form
            onSubmit={createEmp}
            className="grid grid-cols-1 gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs sm:grid-cols-7"
          >
            <input
              placeholder="ПІБ співробітника"
              value={newEmp.fullName}
              onChange={(e) => setNewEmp((s) => ({ ...s, fullName: e.target.value }))}
              className="rounded-lg border border-slate-300 px-3 py-2 text-xs sm:col-span-2"
              required
            />
            <input
              placeholder="РНОКПП (ІПН)"
              value={newEmp.rnokpp}
              onChange={(e) => setNewEmp((s) => ({ ...s, rnokpp: e.target.value }))}
              className="rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs"
            />
            <input
              placeholder="Посада"
              value={newEmp.position}
              onChange={(e) => setNewEmp((s) => ({ ...s, position: e.target.value }))}
              className="rounded-lg border border-slate-300 px-3 py-2 text-xs"
            />
            <select
              value={newEmp.departmentId}
              onChange={(e) => setNewEmp((s) => ({ ...s, departmentId: e.target.value }))}
              className="rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs font-medium"
            >
              <option value="">Без підрозділу</option>
              {bootstrap.departments.map((dp) => (
                <option key={dp.id} value={dp.id}>
                  {dp.name}
                </option>
              ))}
            </select>
            <input
              type="number"
              placeholder="Оклад (₴)"
              value={newEmp.baseSalary}
              onChange={(e) => setNewEmp((s) => ({ ...s, baseSalary: e.target.value }))}
              className="rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs"
            />
            <button
              type="submit"
              className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-medium text-white hover:bg-indigo-700"
            >
              <Plus className="h-3.5 w-3.5" /> Додати
            </button>
          </form>

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-4 py-3">ПІБ</th>
                  <th className="px-4 py-3">РНОКПП (ІПН)</th>
                  <th className="px-4 py-3">Посада</th>
                  <th className="px-4 py-3">Підрозділ (віднесення)</th>
                  <th className="px-4 py-3 text-right">Базовий оклад</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {bootstrap.employees.map((emp) => (
                  <tr key={emp.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-900">{emp.fullName}</td>
                    <td className="px-4 py-3 font-mono text-slate-500">{emp.rnokpp || '—'}</td>
                    <td className="px-4 py-3 text-slate-700">{emp.position}</td>
                    <td className="px-4 py-3">
                      <select
                        value={emp.departmentId ?? ''}
                        onChange={(e) => changeEmployeeDept(emp.id, e.target.value)}
                        className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:border-indigo-300"
                      >
                        <option value="">— Не призначено —</option>
                        {bootstrap.departments.map((dp) => (
                          <option key={dp.id} value={dp.id}>
                            {dp.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-semibold text-slate-900">
                      {fmtMoney(emp.baseSalary)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 6: Підрозділи */}
      {tab === 'departments' && (
        <div className="space-y-4">
          <form
            onSubmit={createDept}
            className="grid grid-cols-1 gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs sm:grid-cols-5"
          >
            <input
              placeholder="Код (напр. LVIV)"
              value={newDept.code}
              onChange={(e) => setNewDept((s) => ({ ...s, code: e.target.value }))}
              className="rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs uppercase"
            />
            <input
              placeholder="Назва підрозділу *"
              value={newDept.name}
              onChange={(e) => setNewDept((s) => ({ ...s, name: e.target.value }))}
              className="rounded-lg border border-slate-300 px-3 py-2 text-xs"
              required
            />
            <input
              placeholder="Керівник"
              value={newDept.headName}
              onChange={(e) => setNewDept((s) => ({ ...s, headName: e.target.value }))}
              className="rounded-lg border border-slate-300 px-3 py-2 text-xs"
            />
            <input
              placeholder="Адреса / локація"
              value={newDept.address}
              onChange={(e) => setNewDept((s) => ({ ...s, address: e.target.value }))}
              className="rounded-lg border border-slate-300 px-3 py-2 text-xs"
            />
            <button
              type="submit"
              className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-medium text-white hover:bg-indigo-700"
            >
              <Plus className="h-3.5 w-3.5" /> Додати підрозділ
            </button>
          </form>

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-4 py-3">Код</th>
                  <th className="px-4 py-3">Підрозділ</th>
                  <th className="px-4 py-3">Керівник</th>
                  <th className="px-4 py-3">Адреса</th>
                  <th className="px-4 py-3">Опис</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {bootstrap.departments.map((dp) => (
                  <tr key={dp.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-mono font-bold text-indigo-700">{dp.code}</td>
                    <td className="px-4 py-3 font-semibold text-slate-900">{dp.name}</td>
                    <td className="px-4 py-3 text-slate-700">{dp.headName || '—'}</td>
                    <td className="px-4 py-3 text-slate-500">{dp.address || '—'}</td>
                    <td className="px-4 py-3 text-slate-500">{dp.description || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 7: Склади */}
      {tab === 'warehouses' && (
        <div className="space-y-4">
          <form
            onSubmit={createWh}
            className="grid grid-cols-1 gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs sm:grid-cols-4"
          >
            <input
              placeholder="Код (напр. WH-03)"
              value={newWh.code}
              onChange={(e) => setNewWh((s) => ({ ...s, code: e.target.value }))}
              className="rounded-lg border border-slate-300 px-3 py-2 text-xs"
              required
            />
            <input
              placeholder="Назва складу"
              value={newWh.name}
              onChange={(e) => setNewWh((s) => ({ ...s, name: e.target.value }))}
              className="rounded-lg border border-slate-300 px-3 py-2 text-xs"
              required
            />
            <select
              value={newWh.type}
              onChange={(e) =>
                setNewWh((s) => ({ ...s, type: e.target.value as 'WHOLESALE' | 'RETAIL' }))
              }
              className="rounded-lg border border-slate-300 px-3 py-2 text-xs"
            >
              <option value="WHOLESALE">Оптовий склад</option>
              <option value="RETAIL">Роздрібний магазин</option>
            </select>
            <button
              type="submit"
              className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-medium text-white hover:bg-indigo-700"
            >
              <Plus className="h-3.5 w-3.5" /> Додати склад
            </button>
          </form>

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-4 py-3">Код</th>
                  <th className="px-4 py-3">Назва</th>
                  <th className="px-4 py-3">Тип</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {bootstrap.warehouses.map((w) => (
                  <tr key={w.id}>
                    <td className="px-4 py-3 font-mono text-slate-600">{w.code}</td>
                    <td className="px-4 py-3 font-medium text-slate-900">{w.name}</td>
                    <td className="px-4 py-3 text-slate-600">
                      {w.type === 'WHOLESALE' ? 'Оптовий' : 'Роздрібний'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 8: Каси та банки */}
      {tab === 'accounts' && (
        <div className="space-y-4">
          <form
            onSubmit={createAcc}
            className="grid grid-cols-1 gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs sm:grid-cols-4"
          >
            <input
              placeholder="Назва рахунку або каси"
              value={newAcc.name}
              onChange={(e) => setNewAcc((s) => ({ ...s, name: e.target.value }))}
              className="rounded-lg border border-slate-300 px-3 py-2 text-xs"
              required
            />
            <select
              value={newAcc.accountType}
              onChange={(e) =>
                setNewAcc((s) => ({ ...s, accountType: e.target.value as 'BANK' | 'CASH' }))
              }
              className="rounded-lg border border-slate-300 px-3 py-2 text-xs"
            >
              <option value="BANK">Банківський рахунок</option>
              <option value="CASH">Готівкова каса</option>
            </select>
            <input
              placeholder="IBAN (необов'язково)"
              value={newAcc.iban}
              onChange={(e) => setNewAcc((s) => ({ ...s, iban: e.target.value }))}
              className="rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs"
            />
            <button
              type="submit"
              className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-medium text-white hover:bg-indigo-700"
            >
              <Plus className="h-3.5 w-3.5" /> Додати
            </button>
          </form>

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-4 py-3">Назва</th>
                  <th className="px-4 py-3">Тип</th>
                  <th className="px-4 py-3">IBAN</th>
                  <th className="px-4 py-3">Валюта</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {bootstrap.cashAccounts.map((a) => (
                  <tr key={a.id}>
                    <td className="px-4 py-3 font-medium text-slate-900">{a.name}</td>
                    <td className="px-4 py-3 text-slate-600">
                      {a.accountType === 'BANK' ? 'Банк' : 'Каса'}
                    </td>
                    <td className="px-4 py-3 font-mono text-slate-500">{a.iban || '—'}</td>
                    <td className="px-4 py-3 font-mono text-slate-700">{a.currency}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 9: Статті РГК і Види цін */}
      {tab === 'finance' && (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          {/* Cashflow Categories */}
          <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                Статті руху грошових коштів (Cash Flow)
              </h2>
              <p className="text-xs text-slate-500">
                Використовуються у ПКО/ВКО, банківських платежах та P&L
              </p>
            </div>
            <form onSubmit={createCfCategory} className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <input
                placeholder="Назва статті (напр. Реклама)"
                value={newCfCat.name}
                onChange={(e) => setNewCfCat((s) => ({ ...s, name: e.target.value }))}
                className="rounded-lg border border-slate-300 px-3 py-2 text-xs sm:col-span-2"
                required
              />
              <select
                value={newCfCat.direction}
                onChange={(e) =>
                  setNewCfCat((s) => ({ ...s, direction: e.target.value as 'IN' | 'OUT' }))
                }
                className="rounded-lg border border-slate-300 px-2.5 py-2 text-xs"
              >
                <option value="OUT">Витрата (−)</option>
                <option value="IN">Надходження (+)</option>
              </select>
              <label className="flex items-center gap-2 text-xs text-slate-700 sm:col-span-2">
                <input
                  type="checkbox"
                  checked={newCfCat.isOperatingExpense}
                  onChange={(e) =>
                    setNewCfCat((s) => ({ ...s, isOperatingExpense: e.target.checked }))
                  }
                />
                Враховувати як операційні витрати в P&L
              </label>
              <button
                type="submit"
                className="inline-flex items-center justify-center gap-1 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-medium text-white hover:bg-indigo-700"
              >
                <Plus className="h-3.5 w-3.5" /> Додати
              </button>
            </form>
            <div className="overflow-hidden rounded-xl border border-slate-200">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th className="px-3 py-2">Стаття</th>
                    <th className="px-3 py-2">Напрямок</th>
                    <th className="px-3 py-2">P&L</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {bootstrap.cashflowCategories.map((cf) => (
                    <tr key={cf.id}>
                      <td className="px-3 py-2 font-medium text-slate-900">{cf.name}</td>
                      <td className="px-3 py-2">
                        <span
                          className="rounded-full px-2 py-0.5 text-[10px] font-bold"
                          style={{
                            background: cf.direction === 'IN' ? 'var(--pos-soft)' : 'var(--warn-soft)',
                            color: cf.direction === 'IN' ? 'var(--pos-ink)' : 'var(--warn-ink)',
                          }}
                        >
                          {cf.direction === 'IN' ? 'Надходження' : 'Витрата'}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-slate-500">
                        {cf.isOperatingExpense ? 'Витрати' : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Price Types */}
          <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
            <div>
              <h2 className="text-sm font-bold text-slate-900">Види цін (Прайс-листи)</h2>
              <p className="text-xs text-slate-500">
                Роздрібна, оптова, дилерська або партнерська цінова колонка
              </p>
            </div>
            <form onSubmit={createPriceType} className="grid grid-cols-1 gap-2 sm:grid-cols-4">
              <input
                placeholder="Код (VIP)"
                value={newPriceType.code}
                onChange={(e) => setNewPriceType((s) => ({ ...s, code: e.target.value }))}
                className="rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs uppercase"
                required
              />
              <input
                placeholder="Назва виду ціни"
                value={newPriceType.name}
                onChange={(e) => setNewPriceType((s) => ({ ...s, name: e.target.value }))}
                className="rounded-lg border border-slate-300 px-3 py-2 text-xs sm:col-span-2"
                required
              />
              <button
                type="submit"
                className="inline-flex items-center justify-center gap-1 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-medium text-white hover:bg-indigo-700"
              >
                <Plus className="h-3.5 w-3.5" /> Додати
              </button>
            </form>
            <div className="overflow-hidden rounded-xl border border-slate-200">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th className="px-3 py-2">Код</th>
                    <th className="px-3 py-2">Назва</th>
                    <th className="px-3 py-2">Валюта</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {bootstrap.priceTypes.map((pt) => (
                    <tr key={pt.id}>
                      <td className="px-3 py-2 font-mono font-bold text-indigo-700">{pt.code}</td>
                      <td className="px-3 py-2 font-medium text-slate-900">{pt.name}</td>
                      <td className="px-3 py-2 font-mono text-slate-600">{pt.currency}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 10: Специфікації BOM */}
      {tab === 'bom' && (
        <div className="space-y-4">
          {bootstrap.bomSpecs.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-xs text-slate-500">
              Специфікації BOM поки відсутні.
            </div>
          ) : (
            bootstrap.bomSpecs.map((spec) => {
              const outItem = itemMap.get(spec.outputItemId);
              return (
                <div
                  key={spec.id}
                  className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
                    <div>
                      <span className="mr-2 rounded bg-lime-100 px-2 py-0.5 font-mono text-xs font-bold text-lime-800">
                        {spec.code}
                      </span>
                      <span className="text-sm font-semibold text-slate-900">{spec.name}</span>
                    </div>
                    <div className="text-xs text-slate-600">
                      Готовий виріб:{' '}
                      <span className="font-semibold text-emerald-700">
                        {outItem?.name ?? spec.outputItemId} ({fmtQty(spec.outputQty)}{' '}
                        {outItem?.unit ?? 'шт'})
                      </span>
                    </div>
                  </div>
                  <table className="mt-3 w-full text-left text-xs">
                    <thead className="text-slate-500">
                      <tr>
                        <th className="py-1.5">#</th>
                        <th className="py-1.5">Артикул компонента</th>
                        <th className="py-1.5">Сировина / Комплектуюча</th>
                        <th className="py-1.5 text-right">Норма витрати</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {spec.lines.map((l) => {
                        const comp = itemMap.get(l.componentItemId);
                        return (
                          <tr key={l.id}>
                            <td className="py-2 text-slate-400">{l.lineNo}</td>
                            <td className="py-2 font-mono text-slate-500">{comp?.sku ?? ''}</td>
                            <td className="py-2 font-medium text-slate-800">
                              {comp?.name ?? l.componentItemId}
                            </td>
                            <td className="py-2 text-right font-mono font-semibold">
                              {fmtQty(l.qty)} {comp?.unit ?? 'шт'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* TAB 11: Друковані форми (10 українських стандартів — редактор шаблонів) */}
      {tab === 'templates' && (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
          {/* Left: Template list */}
          <div className="space-y-2 lg:col-span-4">
            <div className="text-xs font-bold uppercase tracking-wide text-slate-500">
              Стандартні бланки України ({templatesQuery.data?.length ?? 10})
            </div>
            {(templatesQuery.data ?? []).map((t) => {
              const active = t.templateKey === selectedTplKey;
              return (
                <button
                  key={t.templateKey}
                  type="button"
                  onClick={() => {
                    setSelectedTplKey(t.templateKey);
                    setTplDraft({ ...t });
                    setMsg(null);
                    setErrMsg(null);
                  }}
                  className="w-full rounded-xl p-3 text-left transition"
                  style={{
                    background: active ? 'var(--primary-soft)' : 'var(--surface)',
                    border: active ? '1px solid var(--primary)' : '1px solid var(--border)',
                  }}
                >
                  <div
                    className="text-xs font-extrabold"
                    style={{ color: active ? 'var(--primary-ink)' : 'var(--text)' }}
                  >
                    {t.name}
                  </div>
                  <div className="mt-0.5 line-clamp-2 text-[11px]" style={{ color: 'var(--muted)' }}>
                    {t.standardCode}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Right: Editor */}
          <div className="lg:col-span-8">
            {tplDraft ? (
              <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 pb-3">
                  <div>
                    <div className="overline-label" style={{ color: 'var(--primary)' }}>
                      Редагування українського взірця
                    </div>
                    <h2 className="mt-0.5 text-base font-extrabold text-slate-900">
                      {tplDraft.name}
                    </h2>
                    <p className="mt-0.5 text-[11px] text-slate-500">
                      Плейсхолдери автопідстановки:{' '}
                      <code className="font-mono">{'{{docNumber}}'}</code>,{' '}
                      <code className="font-mono">{'{{docDate}}'}</code>,{' '}
                      <code className="font-mono">{'{{orgName}}'}</code>,{' '}
                      <code className="font-mono">{'{{orgAddress}}'}</code>,{' '}
                      <code className="font-mono">{'{{orgIpn}}'}</code>,{' '}
                      <code className="font-mono">{'{{counterpartyName}}'}</code>,{' '}
                      <code className="font-mono">{'{{warehouseName}}'}</code>,{' '}
                      <code className="font-mono">{'{{totalWords}}'}</code>
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={savingTpl}
                      onClick={resetTemplate}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                    >
                      <RotateCcw className="h-3.5 w-3.5" /> Скинути до стандарту UA
                    </button>
                    <button
                      type="button"
                      disabled={savingTpl}
                      onClick={saveTemplate}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-indigo-700 disabled:opacity-50"
                    >
                      <Save className="h-3.5 w-3.5" /> Зберегти шаблон
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 text-xs">
                  <label className="block">
                    <span className="mb-1 block font-semibold text-slate-700">Назва форми</span>
                    <input
                      value={tplDraft.name}
                      onChange={(e) => setTplDraft((s) => (s ? { ...s, name: e.target.value } : s))}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block font-semibold text-slate-700">
                      Нормативний гриф / стандарт
                    </span>
                    <input
                      value={tplDraft.standardCode}
                      onChange={(e) =>
                        setTplDraft((s) => (s ? { ...s, standardCode: e.target.value } : s))
                      }
                      className="w-full rounded-lg border border-slate-300 px-3 py-2"
                    />
                  </label>
                  <label className="block sm:col-span-2">
                    <span className="mb-1 block font-semibold text-slate-700">
                      Заголовок документа
                    </span>
                    <input
                      value={tplDraft.titleText}
                      onChange={(e) =>
                        setTplDraft((s) => (s ? { ...s, titleText: e.target.value } : s))
                      }
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 font-semibold"
                    />
                  </label>
                  <label className="block sm:col-span-2">
                    <span className="mb-1 block font-semibold text-slate-700">
                      Підзаголовок (підстава / авто / водій / рахунки Дт-Кт)
                    </span>
                    <input
                      value={tplDraft.subtitleText}
                      onChange={(e) =>
                        setTplDraft((s) => (s ? { ...s, subtitleText: e.target.value } : s))
                      }
                      className="w-full rounded-lg border border-slate-300 px-3 py-2"
                    />
                  </label>
                  <label className="block sm:col-span-2">
                    <span className="mb-1 block font-semibold text-slate-700">
                      Текст у шапці документа
                    </span>
                    <textarea
                      rows={2}
                      value={tplDraft.headerNote}
                      onChange={(e) =>
                        setTplDraft((s) => (s ? { ...s, headerNote: e.target.value } : s))
                      }
                      className="w-full rounded-lg border border-slate-300 px-3 py-2"
                    />
                  </label>
                  <label className="block sm:col-span-2">
                    <span className="mb-1 block font-semibold text-slate-700">
                      Примітка / Призначення платежу / Відривна квитанція
                    </span>
                    <textarea
                      rows={3}
                      value={tplDraft.footerNote}
                      onChange={(e) =>
                        setTplDraft((s) => (s ? { ...s, footerNote: e.target.value } : s))
                      }
                      className="w-full rounded-lg border border-slate-300 px-3 py-2"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block font-semibold text-slate-700">Лівий підпис</span>
                    <input
                      value={tplDraft.signLeftLabel}
                      onChange={(e) =>
                        setTplDraft((s) => (s ? { ...s, signLeftLabel: e.target.value } : s))
                      }
                      className="w-full rounded-lg border border-slate-300 px-3 py-2"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block font-semibold text-slate-700">Правий підпис</span>
                    <input
                      value={tplDraft.signRightLabel}
                      onChange={(e) =>
                        setTplDraft((s) => (s ? { ...s, signRightLabel: e.target.value } : s))
                      }
                      className="w-full rounded-lg border border-slate-300 px-3 py-2"
                    />
                  </label>
                </div>

                {/* Toggle checkboxes */}
                <div className="flex flex-wrap gap-4 rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-xs">
                  {(
                    [
                      ['showDiscountColumn', 'Колонка «Знижка»'],
                      ['showSkuColumn', 'Колонка «Артикул»'],
                      ['showVatBlock', 'Блок ПДВ'],
                      ['showIbanBlock', 'Реквізити IBAN'],
                      ['showStampArea', 'Місце М.П.'],
                    ] as const
                  ).map(([field, label]) => (
                    <label key={field} className="flex items-center gap-1.5 font-medium text-slate-700">
                      <input
                        type="checkbox"
                        checked={Boolean(tplDraft[field])}
                        onChange={(e) =>
                          setTplDraft((s) => (s ? { ...s, [field]: e.target.checked } : s))
                        }
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-xs text-slate-500">
                Завантаження українських стандартних друкованих форм...
              </div>
            )}
          </div>
        </div>
      )}

      {/* Universal Import Modal */}
      {importModalOpen && (
        <UniversalItemsImportModal
          bootstrap={bootstrap}
          onClose={() => setImportModalOpen(false)}
          onImported={(res) => {
            setMsg(
              `Імпорт завершено: додано ${res.created}, оновлено ${res.updated}, категорій +${res.categoriesCreated}${
                res.priceDocNumber ? `, прайс-лист №${res.priceDocNumber}` : ''
              }`
            );
          }}
        />
      )}
    </div>
  );
}
