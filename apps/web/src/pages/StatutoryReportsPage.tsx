import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  FileSpreadsheet,
  Scale,
  TrendingUp,
  Percent,
  Users,
  Download,
  CheckCircle2,
  Printer,
} from 'lucide-react';
import { apiFetch, downloadTextFile, fmtMoney } from '../lib/api';

type StatTab = 'f1' | 'f2' | 'vat' | 'ep' | 'esv';

export function StatutoryReportsPage() {
  const [tab, setTab] = useState<StatTab>('f1');
  const [dateFrom, setDateFrom] = useState('2026-10-01');
  const [dateTo, setDateTo] = useState('2026-11-30');
  const [epRate, setEpRate] = useState<number>(5);

  const f1 = useQuery({
    queryKey: ['stat-f1', dateTo],
    enabled: tab === 'f1',
    queryFn: () =>
      apiFetch<{
        formCode: string;
        assets: Array<{ code: string; name: string; amount: string; isBold?: boolean; isTotal?: boolean }>;
        liabilities: Array<{ code: string; name: string; amount: string; isBold?: boolean; isTotal?: boolean }>;
        totalAssets: string;
        totalLiabilitiesAndEquity: string;
        isBalanced: boolean;
      }>(`/api/statutory/balance-f1?asOfDate=${dateTo}T23:59:59Z`),
  });

  const f2 = useQuery({
    queryKey: ['stat-f2', dateFrom, dateTo],
    enabled: tab === 'f2',
    queryFn: () =>
      apiFetch<{
        formCode: string;
        rows: Array<{ code: string; name: string; amount: string; isBold?: boolean; isTotal?: boolean }>;
      }>(`/api/statutory/income-f2?dateFrom=${dateFrom}T00:00:00Z&dateTo=${dateTo}T23:59:59Z`),
  });

  const vat = useQuery({
    queryKey: ['stat-vat', dateFrom, dateTo],
    enabled: tab === 'vat',
    queryFn: () =>
      apiFetch<{
        formCode: string;
        rows: Array<{ code: string; name: string; base: string; vat: string; isBold?: boolean; isTotal?: boolean }>;
        filename: string;
        xml: string;
      }>(`/api/statutory/vat-declaration?dateFrom=${dateFrom}T00:00:00Z&dateTo=${dateTo}T23:59:59Z`),
  });

  const ep = useQuery({
    queryKey: ['stat-ep', dateFrom, dateTo, epRate],
    enabled: tab === 'ep',
    queryFn: () =>
      apiFetch<{
        formCode: string;
        rows: Array<{ code: string; name: string; amount: string; isBold?: boolean; isTotal?: boolean }>;
        filename: string;
        xml: string;
      }>(
        `/api/statutory/single-tax?dateFrom=${dateFrom}T00:00:00Z&dateTo=${dateTo}T23:59:59Z&taxRatePercent=${epRate}`
      ),
  });

  const esv = useQuery({
    queryKey: ['stat-esv', dateFrom, dateTo],
    enabled: tab === 'esv',
    queryFn: () =>
      apiFetch<{
        formCode: string;
        rows: Array<{
          employeeId: string;
          fullName: string;
          rnokpp: string;
          position: string;
          gross: string;
          pdfo: string;
          vz: string;
          esv: string;
          netPay: string;
        }>;
        totals: { gross: string; pdfo: string; vz: string; esv: string; netPay: string };
        filename: string;
        xml: string;
      }>(`/api/statutory/unified-esv?dateFrom=${dateFrom}T00:00:00Z&dateTo=${dateTo}T23:59:59Z`),
  });

  return (
    <div className="space-y-5">
      {/* Tabs */}
      <div className="flex flex-wrap gap-2">
        {[
          { id: 'f1' as const, label: 'Баланс (Форма №1)', icon: Scale },
          { id: 'f2' as const, label: 'Фінрезультати (Форма №2)', icon: TrendingUp },
          { id: 'vat' as const, label: 'Декларація з ПДВ (J0200125)', icon: Percent },
          { id: 'ep' as const, label: 'Єдиний податок 3 гр. (F0103308)', icon: FileSpreadsheet },
          { id: 'esv' as const, label: 'Об’єднаний ЄСВ + 4ДФ (J0500109)', icon: Users },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-semibold ${
              tab === t.id
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            <t.icon className="h-3.5 w-3.5" /> {t.label}
          </button>
        ))}
      </div>

      {/* Period & Actions Bar */}
      <div className="erp-card flex flex-wrap items-center justify-between gap-3 p-3.5 text-xs">
        <div className="flex flex-wrap items-center gap-3">
          {tab !== 'f1' && (
            <label className="flex items-center gap-2">
              <span className="font-medium text-slate-600">Період з:</span>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="rounded-lg border border-slate-300 px-2.5 py-1.5"
              />
            </label>
          )}
          <label className="flex items-center gap-2">
            <span className="font-medium text-slate-600">
              {tab === 'f1' ? 'Станом на дату:' : 'по:'}
            </span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="rounded-lg border border-slate-300 px-2.5 py-1.5"
            />
          </label>
          {tab === 'ep' && (
            <select
              value={epRate}
              onChange={(e) => setEpRate(Number(e.target.value))}
              className="rounded-lg border border-slate-300 px-2.5 py-1.5 font-medium"
            >
              <option value={5}>Ставка 5% (без ПДВ) + 1% ВЗ</option>
              <option value={3}>Ставка 3% (з ПДВ) + 1% ВЗ</option>
            </select>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-50"
          >
            <Printer className="h-3.5 w-3.5" /> Друк / PDF
          </button>
          {tab === 'vat' && vat.data && (
            <button
              onClick={() => downloadTextFile(vat.data!.filename, vat.data!.xml)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 font-semibold text-white hover:bg-indigo-700"
            >
              <Download className="h-3.5 w-3.5" /> XML для ДПС ({vat.data.filename})
            </button>
          )}
          {tab === 'ep' && ep.data && (
            <button
              onClick={() => downloadTextFile(ep.data!.filename, ep.data!.xml)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 font-semibold text-white hover:bg-indigo-700"
            >
              <Download className="h-3.5 w-3.5" /> XML для ДПС ({ep.data.filename})
            </button>
          )}
          {tab === 'esv' && esv.data && (
            <button
              onClick={() => downloadTextFile(esv.data!.filename, esv.data!.xml)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 font-semibold text-white hover:bg-indigo-700"
            >
              <Download className="h-3.5 w-3.5" /> XML для ДПС ({esv.data.filename})
            </button>
          )}
        </div>
      </div>

      {/* 1. БАЛАНС ФОРМА №1 */}
      {tab === 'f1' && f1.data && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">{f1.data.formCode}</span>
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${
                f1.data.isBalanced
                  ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
                  : 'bg-rose-50 text-rose-700'
              }`}
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              {f1.data.isBalanced
                ? `Баланс зійшовся: Актив (${fmtMoney(f1.data.totalAssets)}) = Пасив (${fmtMoney(
                    f1.data.totalLiabilitiesAndEquity
                  )})`
                : 'Увага: розбіжність Активу і Пасиву'}
            </span>
          </div>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            {[
              { title: 'АКТИВ', rows: f1.data.assets },
              { title: 'ПАСИВ', rows: f1.data.liabilities },
            ].map((side) => (
              <div key={side.title} className="erp-card overflow-hidden">
                <div className="border-b border-slate-200 bg-slate-50 px-5 py-3 font-display text-sm font-bold text-slate-900">
                  {side.title}
                </div>
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-slate-100 text-slate-500">
                    <tr>
                      <th className="w-16 px-4 py-2">Код</th>
                      <th className="px-4 py-2">Стаття балансу</th>
                      <th className="px-4 py-2 text-right">Сума (₴)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {side.rows.map((r) => (
                      <tr
                        key={r.code}
                        className={
                          r.isTotal
                            ? 'bg-indigo-50/70 font-bold text-slate-950'
                            : r.isBold
                              ? 'font-semibold text-slate-900'
                              : 'text-slate-700'
                        }
                      >
                        <td className="px-4 py-2.5 font-mono text-indigo-700">{r.code}</td>
                        <td className="px-4 py-2.5 whitespace-pre">{r.name}</td>
                        <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                          {fmtMoney(r.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 2. ФОРМА №2 */}
      {tab === 'f2' && f2.data && (
        <div className="erp-card overflow-hidden">
          <div className="border-b border-slate-200 bg-slate-50 px-5 py-3 font-display text-sm font-bold text-slate-900">
            Звіт про фінансові результати — {f2.data.formCode}
          </div>
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-100 text-slate-500">
              <tr>
                <th className="w-20 px-5 py-2.5">Код рядка</th>
                <th className="px-5 py-2.5">Стаття</th>
                <th className="px-5 py-2.5 text-right">За звітний період (₴)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {f2.data.rows.map((r) => (
                <tr
                  key={r.code}
                  className={
                    r.isTotal
                      ? 'bg-emerald-50/70 font-bold text-slate-950'
                      : r.isBold
                        ? 'bg-slate-50/60 font-semibold text-slate-900'
                        : 'text-slate-700'
                  }
                >
                  <td className="px-5 py-2.5 font-mono text-indigo-700">{r.code}</td>
                  <td className="px-5 py-2.5">{r.name}</td>
                  <td className="px-5 py-2.5 text-right font-mono tabular-nums">
                    {fmtMoney(r.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 3. ДЕКЛАРАЦІЯ З ПДВ */}
      {tab === 'vat' && vat.data && (
        <div className="erp-card overflow-hidden">
          <div className="border-b border-slate-200 bg-slate-50 px-5 py-3 font-display text-sm font-bold text-slate-900">
            {vat.data.formCode}
          </div>
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-100 text-slate-500">
              <tr>
                <th className="w-20 px-5 py-2.5">Рядок</th>
                <th className="px-5 py-2.5">Показник декларації</th>
                <th className="px-5 py-2.5 text-right">Обсяг без ПДВ (₴)</th>
                <th className="px-5 py-2.5 text-right">Сума ПДВ (₴)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {vat.data.rows.map((r) => (
                <tr
                  key={r.code}
                  className={
                    r.isTotal
                      ? 'bg-sky-50 font-bold text-slate-950'
                      : r.isBold
                        ? 'bg-slate-50 font-semibold'
                        : ''
                  }
                >
                  <td className="px-5 py-2.5 font-mono text-sky-700">{r.code}</td>
                  <td className="px-5 py-2.5">{r.name}</td>
                  <td className="px-5 py-2.5 text-right font-mono tabular-nums">
                    {r.base === '—' ? '—' : fmtMoney(r.base)}
                  </td>
                  <td className="px-5 py-2.5 text-right font-mono font-semibold tabular-nums">
                    {fmtMoney(r.vat)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 4. ДЕКЛАРАЦІЯ ЄДИНОГО ПОДАТКУ */}
      {tab === 'ep' && ep.data && (
        <div className="erp-card overflow-hidden">
          <div className="border-b border-slate-200 bg-slate-50 px-5 py-3 font-display text-sm font-bold text-slate-900">
            {ep.data.formCode}
          </div>
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-100 text-slate-500">
              <tr>
                <th className="w-20 px-5 py-2.5">Рядок</th>
                <th className="px-5 py-2.5">Показник</th>
                <th className="px-5 py-2.5 text-right">Сума (₴)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {ep.data.rows.map((r) => (
                <tr
                  key={r.code}
                  className={
                    r.isTotal
                      ? 'bg-emerald-50 font-bold text-slate-950'
                      : r.isBold
                        ? 'font-semibold'
                        : ''
                  }
                >
                  <td className="px-5 py-2.5 font-mono text-indigo-700">{r.code}</td>
                  <td className="px-5 py-2.5">{r.name}</td>
                  <td className="px-5 py-2.5 text-right font-mono tabular-nums">
                    {fmtMoney(r.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 5. ОБ'ЄДНАНИЙ ЗВІТ ЄСВ + 4ДФ */}
      {tab === 'esv' && esv.data && (
        <div className="erp-card overflow-hidden">
          <div className="border-b border-slate-200 bg-slate-50 px-5 py-3 font-display text-sm font-bold text-slate-900">
            {esv.data.formCode}
          </div>
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-100 text-slate-500">
              <tr>
                <th className="px-4 py-2.5">РНОКПП (ІПН)</th>
                <th className="px-4 py-2.5">ПІБ співробітника</th>
                <th className="px-4 py-2.5 text-right">Нараховано</th>
                <th className="px-4 py-2.5 text-right">ПДФО 18%</th>
                <th className="px-4 py-2.5 text-right">ВЗ 5%</th>
                <th className="px-4 py-2.5 text-right">На руки</th>
                <th className="px-4 py-2.5 text-right text-indigo-700">ЄСВ 22%</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {esv.data.rows.map((r) => (
                <tr key={r.employeeId} className="hover:bg-slate-50">
                  <td className="px-4 py-2.5 font-mono text-slate-500">{r.rnokpp}</td>
                  <td className="px-4 py-2.5 font-medium text-slate-900">
                    <div>{r.fullName}</div>
                    <div className="text-[11px] text-slate-400">{r.position}</div>
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                    {fmtMoney(r.gross)}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums text-rose-700">
                    {fmtMoney(r.pdfo)}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums text-rose-700">
                    {fmtMoney(r.vz)}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono font-bold tabular-nums text-emerald-700">
                    {fmtMoney(r.netPay)}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono font-semibold tabular-nums text-indigo-700">
                    {fmtMoney(r.esv)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t-2 border-slate-200 bg-slate-50 font-bold text-slate-900">
              <tr>
                <td colSpan={2} className="px-4 py-3">
                  Разом по підприємству ({esv.data.rows.length} осіб)
                </td>
                <td className="px-4 py-3 text-right font-mono tabular-nums">
                  {fmtMoney(esv.data.totals.gross)}
                </td>
                <td className="px-4 py-3 text-right font-mono tabular-nums text-rose-700">
                  {fmtMoney(esv.data.totals.pdfo)}
                </td>
                <td className="px-4 py-3 text-right font-mono tabular-nums text-rose-700">
                  {fmtMoney(esv.data.totals.vz)}
                </td>
                <td className="px-4 py-3 text-right font-mono tabular-nums text-emerald-700">
                  {fmtMoney(esv.data.totals.netPay)}
                </td>
                <td className="px-4 py-3 text-right font-mono tabular-nums text-indigo-700">
                  {fmtMoney(esv.data.totals.esv)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
