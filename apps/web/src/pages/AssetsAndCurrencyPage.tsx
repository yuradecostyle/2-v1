import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Building2,
  Coins,
  Plus,
  RefreshCw,
  Calculator,
  CheckCircle2,
  ArrowRightLeft,
} from 'lucide-react';
import { apiFetch, fmtDate, fmtMoney } from '../lib/api';

interface FixedAssetsResponse {
  rows: Array<{
    id: string;
    inventoryNumber: string;
    name: string;
    accountCode: string;
    expenseAccountCode: string;
    commissioningDate: string;
    initialCost: string;
    residualValue: string;
    usefulLifeMonths: number;
    accumulatedDepreciation: string;
    monthlyDepreciation: string;
    bookValue: string;
  }>;
  totals: {
    totalInitialCost: string;
    totalAccumulatedDepreciation: string;
    totalBookValue: string;
    totalMonthlyDepreciation: string;
  };
}

interface CurrencyRatesResponse {
  latest: { USD: string; EUR: string };
  history: Array<{
    id: string;
    currencyCode: string;
    rateDate: string;
    rate: string;
    source: string;
  }>;
}

interface FxBalanceRow {
  cashAccountId: string;
  name: string;
  currency: string;
  iban: string;
  foreignBalance: string;
  uahBookBalance: string;
  currentRate: string;
  uahRevaluedBalance: string;
  unrealizedFxDiff: string;
}

export function AssetsAndCurrencyPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<'assets' | 'currency'>('assets');
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [newAsset, setNewAsset] = useState({
    inventoryNumber: 'ОЗ-0003',
    name: '',
    accountCode: '104' as '104' | '106',
    expenseAccountCode: '92' as '92' | '93',
    commissioningDate: '2026-11-26',
    initialCost: '60000',
    usefulLifeMonths: 48,
  });

  const [manualUsd, setManualUsd] = useState('41.85');
  const [manualEur, setManualEur] = useState('45.10');

  const assets = useQuery({
    queryKey: ['fixed-assets'],
    queryFn: () => apiFetch<FixedAssetsResponse>('/api/fixed-assets'),
  });

  const rates = useQuery({
    queryKey: ['fx-rates'],
    queryFn: () => apiFetch<CurrencyRatesResponse>('/api/currency/rates'),
  });

  const fxBalances = useQuery({
    queryKey: ['fx-balances'],
    queryFn: () => apiFetch<FxBalanceRow[]>('/api/currency/balances?asOfDate=2026-12-31T23:59:59Z'),
  });

  const refreshAll = () => {
    qc.invalidateQueries({ queryKey: ['fixed-assets'] });
    qc.invalidateQueries({ queryKey: ['fx-rates'] });
    qc.invalidateQueries({ queryKey: ['fx-balances'] });
    qc.invalidateQueries({ queryKey: ['trial-balance'] });
    qc.invalidateQueries({ queryKey: ['documents'] });
  };

  const handleAddAsset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAsset.name) return;
    setBusy(true);
    try {
      await apiFetch('/api/fixed-assets', {
        method: 'POST',
        body: JSON.stringify({
          ...newAsset,
          commissioningDate: `${newAsset.commissioningDate}T09:00:00Z`,
        }),
      });
      setNewAsset((s) => ({ ...s, name: '', inventoryNumber: `ОЗ-00${Math.floor(Math.random() * 89 + 10)}` }));
      setNotice('Основний засіб введено в експлуатацію (сформовано проводку Дт 104/106 Кт 00)');
      refreshAll();
    } finally {
      setBusy(false);
    }
  };

  const handleRunDepreciation = async () => {
    setBusy(true);
    try {
      const doc = await apiFetch<{ docNumber: string; totalAmount: string }>(
        '/api/fixed-assets/depreciate',
        { method: 'POST', body: JSON.stringify({ periodDate: new Date().toISOString() }) }
      );
      setNotice(
        `Нараховано амортизацію документом №${doc.docNumber} на суму ${fmtMoney(
          doc.totalAmount
        )} (Дт 92/93 — Кт 131)`
      );
      refreshAll();
    } finally {
      setBusy(false);
    }
  };

  const handleSyncNbu = async (useManual: boolean) => {
    setBusy(true);
    try {
      const res = await apiFetch<{ USD: string; EUR: string; source: string }>(
        '/api/currency/sync-nbu',
        {
          method: 'POST',
          body: JSON.stringify(
            useManual
              ? { manualRates: { USD: Number(manualUsd), EUR: Number(manualEur) } }
              : {}
          ),
        }
      );
      setNotice(
        `Курси валют оновлено (${res.source}): USD = ${Number(res.USD).toFixed(4)} ₴, EUR = ${Number(
          res.EUR
        ).toFixed(4)} ₴`
      );
      refreshAll();
    } finally {
      setBusy(false);
    }
  };

  const handleRevalueFx = async () => {
    setBusy(true);
    try {
      const doc = await apiFetch<{ docNumber: string; totalAmount: string }>(
        '/api/currency/revalue',
        { method: 'POST', body: JSON.stringify({ asOfDate: new Date().toISOString() }) }
      );
      setNotice(
        `Переоцінку валютних рахунків проведено (№${doc.docNumber}, курсова різниця: ${fmtMoney(
          doc.totalAmount
        )} на 312 / 714 / 945)`
      );
      refreshAll();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setTab('assets')}
          className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-semibold ${
            tab === 'assets'
              ? 'bg-indigo-600 text-white shadow-xs'
              : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
          }`}
        >
          <Building2 className="h-4 w-4" /> Основні засоби та Амортизація (104 / 106 / 131)
        </button>
        <button
          onClick={() => setTab('currency')}
          className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-semibold ${
            tab === 'currency'
              ? 'bg-indigo-600 text-white shadow-xs'
              : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
          }`}
        >
          <Coins className="h-4 w-4" /> Мультивалютність (USD/EUR), Курси НБУ та Курсові різниці
        </button>
      </div>

      {notice && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-medium text-emerald-800">
          <CheckCircle2 className="h-4 w-4 text-emerald-600" /> {notice}
        </div>
      )}

      {/* TAB 1: ОСНОВНІ ЗАСОБИ */}
      {tab === 'assets' && assets.data && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
            <div className="erp-card p-4">
              <div className="text-[11px] font-semibold uppercase text-slate-500">
                Первісна вартість (104/106)
              </div>
              <div className="mt-2 font-mono text-xl font-bold text-slate-900">
                {fmtMoney(assets.data.totals.totalInitialCost)}
              </div>
            </div>
            <div className="erp-card p-4">
              <div className="text-[11px] font-semibold uppercase text-slate-500">
                Накопичений знос (131)
              </div>
              <div className="mt-2 font-mono text-xl font-bold text-amber-700">
                {fmtMoney(assets.data.totals.totalAccumulatedDepreciation)}
              </div>
            </div>
            <div className="erp-card p-4">
              <div className="text-[11px] font-semibold uppercase text-slate-500">
                Залишкова вартість (Ф1 р.1010)
              </div>
              <div className="mt-2 font-mono text-xl font-bold text-emerald-700">
                {fmtMoney(assets.data.totals.totalBookValue)}
              </div>
            </div>
            <div className="erp-card flex flex-col justify-between p-4">
              <div className="text-[11px] font-semibold uppercase text-slate-500">
                Місячна амортизація
              </div>
              <button
                disabled={busy}
                onClick={handleRunDepreciation}
                className="mt-2 inline-flex items-center justify-center gap-1.5 rounded-xl bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                <Calculator className="h-3.5 w-3.5" /> Нарахувати (
                {fmtMoney(assets.data.totals.totalMonthlyDepreciation)})
              </button>
            </div>
          </div>

          <form onSubmit={handleAddAsset} className="erp-card grid grid-cols-1 gap-3 p-4 sm:grid-cols-6">
            <input
              required
              placeholder="Інв. №"
              value={newAsset.inventoryNumber}
              onChange={(e) => setNewAsset((s) => ({ ...s, inventoryNumber: e.target.value }))}
              className="rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs"
            />
            <input
              required
              placeholder="Назва основного засобу (напр. Генератор 15кВт)"
              value={newAsset.name}
              onChange={(e) => setNewAsset((s) => ({ ...s, name: e.target.value }))}
              className="rounded-lg border border-slate-300 px-3 py-2 text-xs sm:col-span-2"
            />
            <input
              type="number"
              placeholder="Вартість (₴)"
              value={newAsset.initialCost}
              onChange={(e) => setNewAsset((s) => ({ ...s, initialCost: e.target.value }))}
              className="rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs"
            />
            <input
              type="number"
              placeholder="Строк (міс.)"
              value={newAsset.usefulLifeMonths}
              onChange={(e) =>
                setNewAsset((s) => ({ ...s, usefulLifeMonths: Number(e.target.value) }))
              }
              className="rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs"
            />
            <button
              disabled={busy}
              type="submit"
              className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800"
            >
              <Plus className="h-3.5 w-3.5" /> Ввести в експл.
            </button>
          </form>

          <div className="erp-card overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-4 py-3">Інв. №</th>
                  <th className="px-4 py-3">Найменування ОЗ</th>
                  <th className="px-4 py-3">Рах. ОЗ / Витрат</th>
                  <th className="px-4 py-3">Введено</th>
                  <th className="px-4 py-3 text-right">Первісна</th>
                  <th className="px-4 py-3 text-right">Знос (131)</th>
                  <th className="px-4 py-3 text-right">Залишкова</th>
                  <th className="px-4 py-3 text-right">Аморт./міс</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {assets.data.rows.map((fa) => (
                  <tr key={fa.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-mono font-semibold text-indigo-700">
                      {fa.inventoryNumber}
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-900">{fa.name}</td>
                    <td className="px-4 py-3 font-mono text-slate-500">
                      {fa.accountCode} → {fa.expenseAccountCode}
                    </td>
                    <td className="px-4 py-3 font-mono text-slate-500">
                      {fmtDate(fa.commissioningDate)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums">
                      {fmtMoney(fa.initialCost)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-amber-700">
                      {fmtMoney(fa.accumulatedDepreciation)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-bold tabular-nums text-emerald-700">
                      {fmtMoney(fa.bookValue)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-600">
                      {fmtMoney(fa.monthlyDepreciation)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: МУЛЬТИВАЛЮТНІСТЬ ТА КУРСИ НБУ */}
      {tab === 'currency' && rates.data && fxBalances.data && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="erp-card p-5">
              <div className="text-[11px] font-semibold uppercase text-slate-500">
                Офіційний курс НБУ — USD ($)
              </div>
              <div className="mt-2 font-mono text-3xl font-bold text-slate-900">
                {Number(rates.data.latest.USD).toFixed(4)} <span className="text-base text-slate-400">₴</span>
              </div>
            </div>
            <div className="erp-card p-5">
              <div className="text-[11px] font-semibold uppercase text-slate-500">
                Офіційний курс НБУ — EUR (€)
              </div>
              <div className="mt-2 font-mono text-3xl font-bold text-slate-900">
                {Number(rates.data.latest.EUR).toFixed(4)} <span className="text-base text-slate-400">₴</span>
              </div>
            </div>
            <div className="erp-card space-y-2.5 p-5">
              <button
                disabled={busy}
                onClick={() => handleSyncNbu(false)}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                <RefreshCw className="h-3.5 w-3.5" /> Завантажити курси з API НБУ (bank.gov.ua)
              </button>
              <div className="flex gap-2 text-xs">
                <input
                  value={manualUsd}
                  onChange={(e) => setManualUsd(e.target.value)}
                  className="w-20 rounded-lg border border-slate-300 px-2 py-1.5 font-mono"
                  placeholder="USD"
                />
                <input
                  value={manualEur}
                  onChange={(e) => setManualEur(e.target.value)}
                  className="w-20 rounded-lg border border-slate-300 px-2 py-1.5 font-mono"
                  placeholder="EUR"
                />
                <button
                  disabled={busy}
                  onClick={() => handleSyncNbu(true)}
                  className="flex-1 rounded-lg border border-slate-300 bg-white px-2 py-1.5 font-medium text-slate-700 hover:bg-slate-50"
                >
                  Встановити вручну
                </button>
              </div>
            </div>
          </div>

          <div className="erp-card overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-4">
              <div>
                <h3 className="font-display text-sm font-bold text-slate-900">
                  Валютні рахунки (Рахунок 312) та Переоцінка за П(С)БО 21
                </h3>
                <p className="text-xs text-slate-500">
                  Позитивна різниця → Дт 312 Кт 714 · Від’ємна різниця → Дт 945 Кт 312
                </p>
              </div>
              <button
                disabled={busy}
                onClick={handleRevalueFx}
                className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                <ArrowRightLeft className="h-3.5 w-3.5" /> Провести переоцінку валюти
              </button>
            </div>
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-4 py-3">Валютний рахунок</th>
                  <th className="px-4 py-3">Валюта</th>
                  <th className="px-4 py-3 text-right">Залишок у валюті</th>
                  <th className="px-4 py-3 text-right">Обліковий екв. (₴)</th>
                  <th className="px-4 py-3 text-right">Курс НБУ</th>
                  <th className="px-4 py-3 text-right">Переоцінений екв. (₴)</th>
                  <th className="px-4 py-3 text-right">Курсова різниця</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {fxBalances.data.map((r) => (
                  <tr key={r.cashAccountId}>
                    <td className="px-4 py-3 font-medium text-slate-900">
                      <div>{r.name}</div>
                      <div className="font-mono text-[10px] text-slate-400">{r.iban}</div>
                    </td>
                    <td className="px-4 py-3 font-mono font-bold text-indigo-700">{r.currency}</td>
                    <td className="px-4 py-3 text-right font-mono font-bold">
                      {fmtMoney(r.foreignBalance, r.currency)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono">{fmtMoney(r.uahBookBalance)}</td>
                    <td className="px-4 py-3 text-right font-mono text-slate-500">
                      {Number(r.currentRate).toFixed(4)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-semibold">
                      {fmtMoney(r.uahRevaluedBalance)}
                    </td>
                    <td
                      className={`px-4 py-3 text-right font-mono font-bold ${
                        Number(r.unrealizedFxDiff) > 0
                          ? 'text-emerald-700'
                          : Number(r.unrealizedFxDiff) < 0
                            ? 'text-rose-700'
                            : 'text-slate-400'
                      }`}
                    >
                      {Number(r.unrealizedFxDiff) > 0
                        ? `+${fmtMoney(r.unrealizedFxDiff)}`
                        : fmtMoney(r.unrealizedFxDiff)}
                    </td>
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
