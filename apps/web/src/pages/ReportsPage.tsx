import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, BarChart3, Layers, ArrowRightLeft, Wallet, FileSpreadsheet } from 'lucide-react';
import {
  apiFetch,
  downloadCsv,
  fmtDate,
  fmtMoney,
  fmtQty,
  DOC_TYPE_META,
  type BootstrapData,
  type DocumentType,
} from '../lib/api';

type ReportTab = 'stock-balances' | 'stock-turnover' | 'gross-profit' | 'settlements' | 'cashflow-pnl';

export function ReportsPage({ bootstrap }: { bootstrap: BootstrapData }) {
  const [tab, setTab] = useState<ReportTab>('stock-balances');
  const [asOfDate, setAsOfDate] = useState('2026-11-30');
  const [dateFrom, setDateFrom] = useState('2026-11-01');
  const [dateTo, setDateTo] = useState('2026-11-30');
  const [warehouseId, setWarehouseId] = useState('');
  const [groupBy, setGroupBy] = useState<'item' | 'counterparty' | 'warehouse'>('item');
  const [selectedCpId, setSelectedCpId] = useState<string | null>(null);

  const stockBalances = useQuery({
    queryKey: ['report-stock-balances', asOfDate, warehouseId],
    enabled: tab === 'stock-balances',
    queryFn: () =>
      apiFetch<{
        rows: Array<{
          warehouseName: string;
          itemSku: string;
          itemName: string;
          unit: string;
          qty: string;
          reservedQty: string;
          freeQty: string;
          costAmount: string;
          avgCost: string;
        }>;
        totalQty: string;
        totalReservedQty: string;
        totalFreeQty: string;
        totalCost: string;
      }>(
        `/api/reports/stock-balances?asOfDate=${asOfDate}T23:59:59Z${
          warehouseId ? `&warehouseId=${warehouseId}` : ''
        }`
      ),
  });

  const stockTurnover = useQuery({
    queryKey: ['report-stock-turnover', dateFrom, dateTo, warehouseId],
    enabled: tab === 'stock-turnover',
    queryFn: () =>
      apiFetch<{
        rows: Array<{
          warehouseName: string;
          itemSku: string;
          itemName: string;
          unit: string;
          openingQty: string;
          inQty: string;
          outQty: string;
          closingQty: string;
        }>;
      }>(
        `/api/reports/stock-turnover?dateFrom=${dateFrom}T00:00:00Z&dateTo=${dateTo}T23:59:59Z${
          warehouseId ? `&warehouseId=${warehouseId}` : ''
        }`
      ),
  });

  const grossProfit = useQuery({
    queryKey: ['report-gross-profit', dateFrom, dateTo, groupBy],
    enabled: tab === 'gross-profit',
    queryFn: () =>
      apiFetch<{
        rows: Array<{
          groupId: string;
          groupName: string;
          groupCode: string;
          qty: string;
          revenue: string;
          cogs: string;
          profit: string;
          marginPercent: string;
        }>;
        totals: { qty: string; revenue: string; cogs: string; profit: string; marginPercent: string };
      }>(
        `/api/reports/gross-profit?dateFrom=${dateFrom}T00:00:00Z&dateTo=${dateTo}T23:59:59Z&groupBy=${groupBy}`
      ),
  });

  const settlements = useQuery({
    queryKey: ['report-settlements', asOfDate],
    enabled: tab === 'settlements',
    queryFn: () =>
      apiFetch<{
        rows: Array<{
          counterpartyId: string;
          counterpartyName: string;
          edrpou: string;
          balance: string;
          receivable: string;
          payable: string;
        }>;
        totalReceivable: string;
        totalPayable: string;
        netBalance: string;
      }>(`/api/reports/settlements?asOfDate=${asOfDate}T23:59:59Z`),
  });

  const cpCard = useQuery({
    queryKey: ['report-cp-card', selectedCpId, dateFrom, dateTo],
    enabled: tab === 'settlements' && Boolean(selectedCpId),
    queryFn: () =>
      apiFetch<{
        openingBalance: string;
        closingBalance: string;
        entries: Array<{
          id: string;
          date: string;
          docType: DocumentType;
          docNumber: string;
          comment: string;
          debit: string;
          credit: string;
          runningBalance: string;
        }>;
      }>(
        `/api/reports/counterparty-card?counterpartyId=${selectedCpId}&dateFrom=2026-10-01T00:00:00Z&dateTo=${asOfDate}T23:59:59Z`
      ),
  });

  const cashflowPnl = useQuery({
    queryKey: ['report-cashflow-pnl', dateFrom, dateTo],
    enabled: tab === 'cashflow-pnl',
    queryFn: () =>
      apiFetch<{
        cashByAccount: Array<{
          cashAccountId: string;
          name: string;
          accountType: string;
          opening: string;
          inflow: string;
          outflow: string;
          closing: string;
        }>;
        totalClosingCash: string;
        cashflowByCategory: Array<{
          categoryId: string;
          categoryName: string;
          direction: string;
          amount: string;
        }>;
        pnl: {
          revenue: string;
          cogs: string;
          grossProfit: string;
          otherIncome: string;
          operatingExpenses: string;
          netProfit: string;
          grossMarginPercent: string;
          netMarginPercent: string;
          expensesByCategory: Array<{ categoryId: string; categoryName: string; amount: string }>;
        };
      }>(`/api/reports/cashflow-pnl?dateFrom=${dateFrom}T00:00:00Z&dateTo=${dateTo}T23:59:59Z`),
  });

  const exportCurrentCsv = () => {
    if (tab === 'stock-balances' && stockBalances.data) {
      downloadCsv(
        `stock-balances-${asOfDate}.csv`,
        ['Склад', 'Артикул', 'Номенклатура', 'Од.', 'Кількість', 'Сер. собівартість', 'Сума (FIFO)'],
        stockBalances.data.rows.map((r) => [
          r.warehouseName,
          r.itemSku,
          r.itemName,
          r.unit,
          r.qty,
          r.avgCost,
          r.costAmount,
        ])
      );
    } else if (tab === 'gross-profit' && grossProfit.data) {
      downloadCsv(
        `gross-profit-${dateFrom}-${dateTo}.csv`,
        ['Аналітика', 'Код', 'Кількість', 'Виручка', 'Собівартість', 'Прибуток', 'Маржа %'],
        grossProfit.data.rows.map((r) => [
          r.groupName,
          r.groupCode,
          r.qty,
          r.revenue,
          r.cogs,
          r.profit,
          r.marginPercent,
        ])
      );
    } else if (tab === 'settlements' && settlements.data) {
      downloadCsv(
        `settlements-${asOfDate}.csv`,
        ['Контрагент', 'ЄДРПОУ', 'Нам винні (Дебіторка)', 'Ми винні (Кредиторка)', 'Сальдо'],
        settlements.data.rows.map((r) => [
          r.counterpartyName,
          r.edrpou,
          r.receivable,
          r.payable,
          r.balance,
        ])
      );
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Управлінські звіти</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Миттєві зрізи через віртуальні таблиці регістрів та місячні підсумки
          </p>
        </div>
        <button
          onClick={exportCurrentCsv}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          <Download className="h-3.5 w-3.5" /> Експорт CSV (Excel)
        </button>
      </div>

      {/* Report Tabs */}
      <div className="flex flex-wrap gap-2">
        {[
          { id: 'stock-balances' as const, label: 'Залишки товарів', icon: Layers },
          { id: 'stock-turnover' as const, label: 'Відомість по складах', icon: FileSpreadsheet },
          { id: 'gross-profit' as const, label: 'Валовий прибуток', icon: BarChart3 },
          { id: 'settlements' as const, label: 'Взаєморозрахунки', icon: ArrowRightLeft },
          { id: 'cashflow-pnl' as const, label: 'Cash Flow та P&L', icon: Wallet },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
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

      {/* Filters bar */}
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3.5 shadow-xs text-xs">
        {(tab === 'stock-balances' || tab === 'settlements') && (
          <label className="flex items-center gap-2">
            <span className="font-medium text-slate-600">Станом на дату:</span>
            <input
              type="date"
              value={asOfDate}
              onChange={(e) => setAsOfDate(e.target.value)}
              className="rounded-lg border border-slate-300 px-2.5 py-1.5"
            />
          </label>
        )}
        {(tab === 'stock-turnover' || tab === 'gross-profit' || tab === 'cashflow-pnl') && (
          <>
            <label className="flex items-center gap-2">
              <span className="font-medium text-slate-600">Період з:</span>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="rounded-lg border border-slate-300 px-2.5 py-1.5"
              />
            </label>
            <label className="flex items-center gap-2">
              <span className="font-medium text-slate-600">по:</span>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="rounded-lg border border-slate-300 px-2.5 py-1.5"
              />
            </label>
          </>
        )}
        {(tab === 'stock-balances' || tab === 'stock-turnover') && (
          <label className="flex items-center gap-2">
            <span className="font-medium text-slate-600">Склад:</span>
            <select
              value={warehouseId}
              onChange={(e) => setWarehouseId(e.target.value)}
              className="rounded-lg border border-slate-300 px-2.5 py-1.5"
            >
              <option value="">Усі склади</option>
              {bootstrap.warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {tab === 'gross-profit' && (
          <label className="flex items-center gap-2">
            <span className="font-medium text-slate-600">Групування:</span>
            <select
              value={groupBy}
              onChange={(e) => setGroupBy(e.target.value as 'item' | 'counterparty' | 'warehouse')}
              className="rounded-lg border border-slate-300 px-2.5 py-1.5"
            >
              <option value="item">По номенклатурі</option>
              <option value="counterparty">По покупцях</option>
              <option value="warehouse">По складах</option>
            </select>
          </label>
        )}
      </div>

      {/* 1. Stock Balances */}
      {tab === 'stock-balances' && stockBalances.data && (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
              <tr>
                <th className="px-4 py-3">Склад</th>
                <th className="px-4 py-3">Артикул</th>
                <th className="px-4 py-3">Номенклатура</th>
                <th className="px-4 py-3 text-right">Фізично</th>
                <th className="px-4 py-3 text-right text-cyan-700">В резерві</th>
                <th className="px-4 py-3 text-right text-emerald-700">Вільно</th>
                <th className="px-4 py-3 text-right">Сер. собівартість</th>
                <th className="px-4 py-3 text-right">Сума (FIFO)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {stockBalances.data.rows.map((r, i) => (
                <tr key={i} className="hover:bg-slate-50">
                  <td className="px-4 py-2.5 text-slate-600">{r.warehouseName}</td>
                  <td className="px-4 py-2.5 font-mono text-slate-500">{r.itemSku}</td>
                  <td className="px-4 py-2.5 font-medium text-slate-900">{r.itemName}</td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums font-semibold">
                    {fmtQty(r.qty)} {r.unit}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums text-cyan-700">
                    {Number(r.reservedQty) > 0 ? fmtQty(r.reservedQty) : '—'}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums font-semibold text-emerald-700">
                    {fmtQty(r.freeQty)}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums text-slate-600">
                    {fmtMoney(r.avgCost)}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums font-semibold text-slate-900">
                    {fmtMoney(r.costAmount)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t-2 border-slate-200 bg-slate-50 font-semibold text-slate-900">
              <tr>
                <td colSpan={3} className="px-4 py-3">
                  Разом на {asOfDate}
                </td>
                <td className="px-4 py-3 text-right font-mono tabular-nums">
                  {fmtQty(stockBalances.data.totalQty)}
                </td>
                <td className="px-4 py-3 text-right font-mono tabular-nums text-cyan-700">
                  {fmtQty(stockBalances.data.totalReservedQty)}
                </td>
                <td className="px-4 py-3 text-right font-mono tabular-nums text-emerald-700">
                  {fmtQty(stockBalances.data.totalFreeQty)}
                </td>
                <td className="px-4 py-3"></td>
                <td className="px-4 py-3 text-right font-mono tabular-nums text-indigo-700">
                  {fmtMoney(stockBalances.data.totalCost)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* 2. Stock Turnover */}
      {tab === 'stock-turnover' && stockTurnover.data && (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
              <tr>
                <th className="px-4 py-3">Склад</th>
                <th className="px-4 py-3">Номенклатура</th>
                <th className="px-4 py-3 text-right">Поч. залишок</th>
                <th className="px-4 py-3 text-right text-emerald-700">+ Прихід</th>
                <th className="px-4 py-3 text-right text-rose-700">− Витрата</th>
                <th className="px-4 py-3 text-right">Кін. залишок</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {stockTurnover.data.rows.map((r, i) => (
                <tr key={i} className="hover:bg-slate-50">
                  <td className="px-4 py-2.5 text-slate-600">{r.warehouseName}</td>
                  <td className="px-4 py-2.5 font-medium text-slate-900">
                    <span className="mr-2 font-mono text-slate-400">{r.itemSku}</span>
                    {r.itemName}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                    {fmtQty(r.openingQty)}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums text-emerald-700">
                    {Number(r.inQty) > 0 ? `+${fmtQty(r.inQty)}` : '0'}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums text-rose-700">
                    {Number(r.outQty) > 0 ? `−${fmtQty(r.outQty)}` : '0'}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums font-bold text-slate-900">
                    {fmtQty(r.closingQty)} {r.unit}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 3. Gross Profit */}
      {tab === 'gross-profit' && grossProfit.data && (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
              <tr>
                <th className="px-4 py-3">Аналітика</th>
                <th className="px-4 py-3 text-right">К-сть</th>
                <th className="px-4 py-3 text-right">Виручка</th>
                <th className="px-4 py-3 text-right">Собівартість (FIFO)</th>
                <th className="px-4 py-3 text-right">Валовий прибуток</th>
                <th className="px-4 py-3 text-right">Маржа %</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {grossProfit.data.rows.map((r) => (
                <tr key={r.groupId} className="hover:bg-slate-50">
                  <td className="px-4 py-2.5 font-medium text-slate-900">
                    {r.groupCode && (
                      <span className="mr-2 font-mono text-slate-400">{r.groupCode}</span>
                    )}
                    {r.groupName}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums">{fmtQty(r.qty)}</td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                    {fmtMoney(r.revenue)}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums text-slate-600">
                    {fmtMoney(r.cogs)}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums font-semibold text-emerald-700">
                    {fmtMoney(r.profit)}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                    <span className="rounded-full bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-700">
                      {r.marginPercent}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t-2 border-slate-200 bg-slate-50 font-semibold text-slate-900">
              <tr>
                <td className="px-4 py-3">Разом за період</td>
                <td className="px-4 py-3 text-right font-mono tabular-nums">
                  {fmtQty(grossProfit.data.totals.qty)}
                </td>
                <td className="px-4 py-3 text-right font-mono tabular-nums">
                  {fmtMoney(grossProfit.data.totals.revenue)}
                </td>
                <td className="px-4 py-3 text-right font-mono tabular-nums">
                  {fmtMoney(grossProfit.data.totals.cogs)}
                </td>
                <td className="px-4 py-3 text-right font-mono tabular-nums text-emerald-700">
                  {fmtMoney(grossProfit.data.totals.profit)}
                </td>
                <td className="px-4 py-3 text-right font-mono tabular-nums text-indigo-700">
                  {grossProfit.data.totals.marginPercent}%
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* 4. Settlements + Counterparty Card */}
      {tab === 'settlements' && settlements.data && (
        <div className="space-y-4">
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-4 py-3">Контрагент</th>
                  <th className="px-4 py-3">ЄДРПОУ</th>
                  <th className="px-4 py-3 text-right">Нам винні (Дебіторка)</th>
                  <th className="px-4 py-3 text-right">Ми винні (Кредиторка)</th>
                  <th className="px-4 py-3 text-right">Деталізація</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {settlements.data.rows.map((r) => (
                  <tr key={r.counterpartyId} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-900">{r.counterpartyName}</td>
                    <td className="px-4 py-3 font-mono text-slate-500">{r.edrpou || '—'}</td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums font-semibold text-emerald-700">
                      {Number(r.receivable) > 0 ? fmtMoney(r.receivable) : '—'}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums font-semibold text-rose-700">
                      {Number(r.payable) > 0 ? fmtMoney(r.payable) : '—'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => setSelectedCpId(r.counterpartyId)}
                        className="rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-[11px] font-medium text-indigo-700 hover:bg-indigo-100"
                      >
                        Акт звірки
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t-2 border-slate-200 bg-slate-50 font-semibold">
                <tr>
                  <td colSpan={2} className="px-4 py-3">
                    Разом
                  </td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums text-emerald-700">
                    {fmtMoney(settlements.data.totalReceivable)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums text-rose-700">
                    {fmtMoney(settlements.data.totalPayable)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-slate-700">
                    Сальдо: {fmtMoney(settlements.data.netBalance)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {selectedCpId && cpCard.data && (
            <div className="rounded-2xl border border-indigo-200 bg-white p-5 shadow-xs">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-900">
                  Акт звірки —{' '}
                  {bootstrap.counterparties.find((c) => c.id === selectedCpId)?.name}
                </h3>
                <span className="text-xs font-mono font-semibold text-indigo-700">
                  Кінцеве сальдо: {fmtMoney(cpCard.data.closingBalance)}
                </span>
              </div>
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
                  <tr>
                    <th className="px-3 py-2">Дата</th>
                    <th className="px-3 py-2">Документ</th>
                    <th className="px-3 py-2 text-right">Дебет (Борг +)</th>
                    <th className="px-3 py-2 text-right">Кредит (Оплата / Прихід −)</th>
                    <th className="px-3 py-2 text-right">Сальдо</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {cpCard.data.entries.map((e) => (
                    <tr key={e.id}>
                      <td className="px-3 py-2 font-mono text-slate-500">{fmtDate(e.date)}</td>
                      <td className="px-3 py-2">
                        <span className="font-medium text-slate-800">
                          {DOC_TYPE_META[e.docType]?.label ?? e.docType} №{e.docNumber}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums text-emerald-700">
                        {Number(e.debit) > 0 ? fmtMoney(e.debit) : '—'}
                      </td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums text-rose-700">
                        {Number(e.credit) > 0 ? fmtMoney(e.credit) : '—'}
                      </td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums font-semibold">
                        {fmtMoney(e.runningBalance)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* 5. Cash Flow & P&L */}
      {tab === 'cashflow-pnl' && cashflowPnl.data && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
            <h3 className="text-sm font-semibold text-slate-900">
              Звіт про прибутки та збитки (P&amp;L)
            </h3>
            <div className="mt-4 space-y-2.5 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-600">Виручка від реалізації</span>
                <span className="font-mono font-semibold tabular-nums">
                  {fmtMoney(cashflowPnl.data.pnl.revenue)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Собівартість реалізованих товарів (FIFO)</span>
                <span className="font-mono tabular-nums text-rose-700">
                  −{fmtMoney(cashflowPnl.data.pnl.cogs)}
                </span>
              </div>
              <div className="flex justify-between border-t border-slate-200 pt-2 font-semibold">
                <span>Валовий прибуток ({cashflowPnl.data.pnl.grossMarginPercent}%)</span>
                <span className="font-mono tabular-nums text-emerald-700">
                  {fmtMoney(cashflowPnl.data.pnl.grossProfit)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Операційні витрати</span>
                <span className="font-mono tabular-nums text-rose-700">
                  −{fmtMoney(cashflowPnl.data.pnl.operatingExpenses)}
                </span>
              </div>
              {cashflowPnl.data.pnl.expensesByCategory.map((e) => (
                <div key={e.categoryId} className="flex justify-between pl-4 text-xs text-slate-500">
                  <span>· {e.categoryName}</span>
                  <span className="font-mono tabular-nums">{fmtMoney(e.amount)}</span>
                </div>
              ))}
              <div className="flex justify-between border-t-2 border-slate-900 pt-3 text-base font-bold">
                <span>Чистий прибуток ({cashflowPnl.data.pnl.netMarginPercent}%)</span>
                <span
                  className={`font-mono tabular-nums ${
                    Number(cashflowPnl.data.pnl.netProfit) >= 0
                      ? 'text-emerald-700'
                      : 'text-rose-700'
                  }`}
                >
                  {fmtMoney(cashflowPnl.data.pnl.netProfit)}
                </span>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
              <h3 className="text-sm font-semibold text-slate-900">
                Рух грошових коштів за статтями (Cash Flow)
              </h3>
              <div className="mt-3 space-y-2 text-xs">
                {cashflowPnl.data.cashflowByCategory.map((c) => (
                  <div
                    key={c.categoryId}
                    className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2"
                  >
                    <span className="font-medium text-slate-700">{c.categoryName}</span>
                    <span
                      className={`font-mono font-semibold tabular-nums ${
                        Number(c.amount) >= 0 ? 'text-emerald-700' : 'text-rose-700'
                      }`}
                    >
                      {Number(c.amount) > 0 ? `+${fmtMoney(c.amount)}` : fmtMoney(c.amount)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
              <h3 className="text-sm font-semibold text-slate-900">
                Залишки на рахунках (Всього: {fmtMoney(cashflowPnl.data.totalClosingCash)})
              </h3>
              <div className="mt-3 space-y-2 text-xs">
                {cashflowPnl.data.cashByAccount.map((a) => (
                  <div
                    key={a.cashAccountId}
                    className="flex items-center justify-between border-b border-slate-100 py-2 last:border-0"
                  >
                    <div>
                      <div className="font-medium text-slate-800">{a.name}</div>
                      <div className="text-[11px] text-slate-400">
                        Поч: {fmtMoney(a.opening)} · +{fmtMoney(a.inflow)} / −{fmtMoney(a.outflow)}
                      </div>
                    </div>
                    <div className="font-mono font-bold tabular-nums text-slate-900">
                      {fmtMoney(a.closing)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
