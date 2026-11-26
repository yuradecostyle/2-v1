import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Plus, Package, Users, Warehouse, Wallet, UserCheck, Cpu, Network } from 'lucide-react';
import { apiFetch, fmtMoney, fmtQty, type BootstrapData } from '../lib/api';

export type CatalogTab = 'items' | 'counterparties' | 'employees' | 'departments' | 'bom' | 'warehouses' | 'accounts';

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

  // Quick-add forms
  const [newItem, setNewItem] = useState({
    sku: '',
    name: '',
    unit: 'шт',
    itemType: 'GOODS' as 'GOODS' | 'SERVICE',
  });
  const [newCp, setNewCp] = useState({
    name: '',
    edrpou: '',
    phone: '',
    isCustomer: true,
    isSupplier: false,
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
  const [msg, setMsg] = useState<string | null>(null);

  const refresh = () => qc.invalidateQueries({ queryKey: ['bootstrap'] });

  const createItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItem.sku || !newItem.name) return;
    await apiFetch('/api/catalogs/items', { method: 'POST', body: JSON.stringify(newItem) });
    setNewItem({ sku: '', name: '', unit: 'шт', itemType: 'GOODS' });
    setMsg('Номенклатуру додано');
    refresh();
  };

  const createCp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCp.name) return;
    await apiFetch('/api/catalogs/counterparties', { method: 'POST', body: JSON.stringify(newCp) });
    setNewCp({ name: '', edrpou: '', phone: '', isCustomer: true, isSupplier: false });
    setMsg('Контрагента додано');
    refresh();
  };

  const createEmp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmp.fullName) return;
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
    if (!newDept.name.trim()) return;
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
  };

  const createWh = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWh.code || !newWh.name) return;
    await apiFetch('/api/catalogs/warehouses', { method: 'POST', body: JSON.stringify(newWh) });
    setNewWh({ code: '', name: '', type: 'WHOLESALE' });
    setMsg('Склад додано');
    refresh();
  };

  const createAcc = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAcc.name) return;
    await apiFetch('/api/catalogs/cash-accounts', { method: 'POST', body: JSON.stringify(newAcc) });
    setNewAcc({ name: '', accountType: 'BANK', iban: '' });
    setMsg('Рахунок / касу додано');
    refresh();
  };

  const q = search.toLowerCase().trim();
  const itemMap = new Map(bootstrap.items.map((i) => [i.id, i]));

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Довідники (НДІ)</h1>
        <p className="mt-0.5 text-sm text-slate-500">
          Номенклатура, контрагенти, кадри (штатний розпис), специфікації BOM, склади та рахунки
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {[
            { id: 'items' as const, label: `Номенклатура (${bootstrap.items.length})`, icon: Package },
            {
              id: 'counterparties' as const,
              label: `Контрагенти (${bootstrap.counterparties.length})`,
              icon: Users,
            },
            {
              id: 'employees' as const,
              label: `Співробітники (${bootstrap.employees.length})`,
              icon: UserCheck,
            },
            {
              id: 'departments' as const,
              label: `Підрозділи (${bootstrap.departments.length})`,
              icon: Network,
            },
            {
              id: 'bom' as const,
              label: `Специфікації BOM (${bootstrap.bomSpecs.length})`,
              icon: Cpu,
            },
            {
              id: 'warehouses' as const,
              label: `Склади (${bootstrap.warehouses.length})`,
              icon: Warehouse,
            },
            {
              id: 'accounts' as const,
              label: `Каси та банки (${bootstrap.cashAccounts.length})`,
              icon: Wallet,
            },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => {
                setTab(t.id);
                setMsg(null);
              }}
              className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-medium ${
                tab === t.id
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              <t.icon className="h-3.5 w-3.5" /> {t.label}
            </button>
          ))}
        </div>

        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Пошук у довіднику..."
          className="rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs focus:border-indigo-500 focus:outline-none"
        />
      </div>

      {msg && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs font-medium text-emerald-800">
          {msg}
        </div>
      )}

      {/* TAB: Номенклатура */}
      {tab === 'items' && (
        <div className="space-y-4">
          <form
            onSubmit={createItem}
            className="grid grid-cols-1 gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs sm:grid-cols-5"
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

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-4 py-3">Артикул</th>
                  <th className="px-4 py-3">Найменування</th>
                  <th className="px-4 py-3">Штрихкод</th>
                  <th className="px-4 py-3">Од. вим.</th>
                  <th className="px-4 py-3">Тип</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {bootstrap.items
                  .filter(
                    (i) =>
                      !q ||
                      i.name.toLowerCase().includes(q) ||
                      i.sku.toLowerCase().includes(q)
                  )
                  .map((it) => (
                    <tr key={it.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-mono font-medium text-slate-600">{it.sku}</td>
                      <td className="px-4 py-3 font-medium text-slate-900">{it.name}</td>
                      <td className="px-4 py-3 font-mono text-slate-400">{it.barcode || '—'}</td>
                      <td className="px-4 py-3 text-slate-600">{it.unit}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                            it.itemType === 'GOODS'
                              ? 'bg-blue-50 text-blue-700'
                              : 'bg-purple-50 text-purple-700'
                          }`}
                        >
                          {it.itemType === 'GOODS' ? 'Товар' : 'Послуга'}
                        </span>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB: Контрагенти */}
      {tab === 'counterparties' && (
        <div className="space-y-4">
          <form
            onSubmit={createCp}
            className="grid grid-cols-1 gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs sm:grid-cols-5"
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

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-4 py-3">Найменування</th>
                  <th className="px-4 py-3">ЄДРПОУ / ІПН</th>
                  <th className="px-4 py-3">Контакти</th>
                  <th className="px-4 py-3">Ролі</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {bootstrap.counterparties
                  .filter(
                    (c) =>
                      !q ||
                      c.name.toLowerCase().includes(q) ||
                      c.edrpou.toLowerCase().includes(q)
                  )
                  .map((cp) => (
                    <tr key={cp.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-medium text-slate-900">{cp.name}</td>
                      <td className="px-4 py-3 font-mono text-slate-600">{cp.edrpou || '—'}</td>
                      <td className="px-4 py-3 text-slate-500">
                        {cp.phone || cp.email ? `${cp.phone} ${cp.email}` : '—'}
                      </td>
                      <td className="px-4 py-3 space-x-1">
                        {cp.isCustomer && (
                          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                            Покупець
                          </span>
                        )}
                        {cp.isSupplier && (
                          <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700">
                            Постачальник
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB: Співробітники */}
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
              className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono"
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
              className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono"
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

      {/* TAB: Підрозділи */}
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

      {/* TAB: Специфікації BOM */}
      {tab === 'bom' && (
        <div className="space-y-4">
          {bootstrap.bomSpecs.map((spec) => {
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
          })}
        </div>
      )}

      {/* TAB: Склади */}
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

      {/* TAB: Каси та банки */}
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
              className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono"
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
    </div>
  );
}
