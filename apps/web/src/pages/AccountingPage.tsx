import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BookOpenCheck,
  CheckCircle2,
  Download,
  FileCode2,
  ListTree,
  Plus,
  Scale,
} from 'lucide-react';
import {
  apiFetch,
  downloadCsv,
  downloadTextFile,
  fmtDate,
  fmtMoney,
  fmtQty,
  DOC_TYPE_META,
  type BootstrapData,
  type DocumentType,
} from '../lib/api';
import { DocumentEditorModal } from '../components/DocumentEditorModal';

type AccTab = 'trial-balance' | 'journal' | 'coa' | 'saft';

export function AccountingPage({ bootstrap }: { bootstrap: BootstrapData }) {
  const qc = useQueryClient();
  const [tab, setTab] = useState<AccTab>('trial-balance');
  const [dateFrom, setDateFrom] = useState('2026-10-01');
  const [dateTo, setDateTo] = useState('2026-11-30');
  const [selectedAccount, setSelectedAccount] = useState<string | null>('281');
  const [journalAccountFilter, setJournalAccountFilter] = useState<string>('');
  const [manualOpen, setManualOpen] = useState(false);

  const tb = useQuery({
    queryKey: ['trial-balance', dateFrom, dateTo],
    enabled: tab === 'trial-balance',
    queryFn: () =>
      apiFetch<{
        rows: Array<{
          accountCode: string;
          accountName: string;
          accountType: string;
          classNo: number;
          openingDebit: string;
          openingCredit: string;
          turnoverDebit: string;
          turnoverCredit: string;
          closingDebit: string;
          closingCredit: string;
        }>;
        totals: {
          openingDebit: string;
          openingCredit: string;
          turnoverDebit: string;
          turnoverCredit: string;
          closingDebit: string;
          closingCredit: string;
          isBalanced: boolean;
        };
      }>(`/api/accounting/trial-balance?dateFrom=${dateFrom}T00:00:00Z&dateTo=${dateTo}T23:59:59Z`),
  });

  const subkonto = useQuery({
    queryKey: ['acc-subkonto', selectedAccount, dateFrom, dateTo],
    enabled: tab === 'trial-balance' && Boolean(selectedAccount),
    queryFn: () =>
      apiFetch<{
        account?: { code: string; name: string; isQuantitative: boolean };
        rows: Array<{
          subkontoLabel: string;
          openingDebit: string;
          openingCredit: string;
          turnoverDebit: string;
          turnoverCredit: string;
          closingDebit: string;
          closingCredit: string;
          closingQty: string;
        }>;
      }>(
        `/api/accounting/subkonto?accountCode=${selectedAccount}&dateFrom=${dateFrom}T00:00:00Z&dateTo=${dateTo}T23:59:59Z`
      ),
  });

  const journal = useQuery({
    queryKey: ['acc-journal', dateFrom, dateTo, journalAccountFilter],
    enabled: tab === 'journal',
    queryFn: () =>
      apiFetch<
        Array<{
          id: string;
          period: string;
          docNumber: string;
          docType: DocumentType;
          debitAccountCode: string;
          creditAccountCode: string;
          debitSubkonto1Label: string;
          debitSubkonto2Label: string;
          creditSubkonto1Label: string;
          creditSubkonto2Label: string;
          qty: string;
          amount: string;
          description: string;
        }>
      >(
        `/api/accounting/journal?dateFrom=${dateFrom}T00:00:00Z&dateTo=${dateTo}T23:59:59Z${
          journalAccountFilter ? `&accountCode=${journalAccountFilter}` : ''
        }`
      ),
  });

  const saft = useQuery({
    queryKey: ['acc-saft', dateFrom, dateTo],
    enabled: tab === 'saft',
    queryFn: () =>
      apiFetch<{
        filename: string;
        xml: string;
        stats: {
          accountsCount: number;
          transactionsCount: number;
          entriesCount: number;
          totalDebit: string;
          totalCredit: string;
          isBalanced: boolean;
          salesInvoicesCount: number;
          purchaseInvoicesCount: number;
          paymentsCount: number;
        };
      }>(`/api/accounting/saft-ua?dateFrom=${dateFrom}T00:00:00Z&dateTo=${dateTo}T23:59:59Z`),
  });

  const exportTrialBalanceCsv = () => {
    if (!tb.data) return;
    downloadCsv(
      `OSV_${dateFrom}_${dateTo}.csv`,
      [
        'Рахунок',
        'Назва рахунку',
        'Сальдо поч. Дт',
        'Сальдо поч. Кт',
        'Оборот Дт',
        'Оборот Кт',
        'Сальдо кін. Дт',
        'Сальдо кін. Кт',
      ],
      tb.data.rows.map((r) => [
        r.accountCode,
        r.accountName,
        r.openingDebit,
        r.openingCredit,
        r.turnoverDebit,
        r.turnoverCredit,
        r.closingDebit,
        r.closingCredit,
      ])
    );
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Бухгалтерський облік (План рахунків №291 та SAF-T UA)
          </h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Подвійний запис Дт/Кт, багатовимірні субконто, Оборотно-сальдова відомість та е-аудит ДПС
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setManualOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-fuchsia-600 px-3.5 py-2 text-xs font-medium text-white shadow-xs hover:bg-fuchsia-700"
          >
            <Plus className="h-3.5 w-3.5" /> Операція Дт/Кт (вручну)
          </button>
          {tab === 'trial-balance' && (
            <button
              onClick={exportTrialBalanceCsv}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              <Download className="h-3.5 w-3.5" /> Експорт ОСВ (CSV)
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2">
        {[
          { id: 'trial-balance' as const, label: 'Оборотно-сальдова відомість (ОСВ)', icon: Scale },
          { id: 'journal' as const, label: 'Журнал проводок (Дт/Кт)', icon: BookOpenCheck },
          { id: 'coa' as const, label: 'План рахунків №291', icon: ListTree },
          { id: 'saft' as const, label: 'Експорт SAF-T UA v2.0 (XML)', icon: FileCode2 },
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

      {/* Date Filters */}
      {tab !== 'coa' && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-3.5 shadow-xs text-xs">
          <div className="flex flex-wrap items-center gap-3">
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
            {tab === 'journal' && (
              <label className="flex items-center gap-2">
                <span className="font-medium text-slate-600">Фільтр рахунку:</span>
                <select
                  value={journalAccountFilter}
                  onChange={(e) => setJournalAccountFilter(e.target.value)}
                  className="rounded-lg border border-slate-300 px-2.5 py-1.5"
                >
                  <option value="">Усі рахунки</option>
                  {bootstrap.chartOfAccounts.map((acc) => (
                    <option key={acc.code} value={acc.code}>
                      {acc.code} — {acc.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>

          {tb.data && tab === 'trial-balance' && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 font-semibold text-emerald-700">
              <CheckCircle2 className="h-3.5 w-3.5" />
              {tb.data.totals.isBalanced
                ? 'Подвійний запис збалансовано (Дт = Кт)'
                : 'Увага: порушення балансу'}
            </span>
          )}
        </div>
      )}

      {/* 1. ОСВ + Субконто */}
      {tab === 'trial-balance' && tb.data && (
        <div className="space-y-5">
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
                  <tr>
                    <th className="px-4 py-3">Рах.</th>
                    <th className="px-4 py-3">Найменування рахунку</th>
                    <th className="px-3 py-3 text-right">Сальдо поч. Дт</th>
                    <th className="px-3 py-3 text-right">Сальдо поч. Кт</th>
                    <th className="px-3 py-3 text-right bg-indigo-50/40">Оборот Дт</th>
                    <th className="px-3 py-3 text-right bg-indigo-50/40">Оборот Кт</th>
                    <th className="px-3 py-3 text-right">Сальдо кін. Дт</th>
                    <th className="px-3 py-3 text-right">Сальдо кін. Кт</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {tb.data.rows.map((r) => {
                    const isSelected = selectedAccount === r.accountCode;
                    return (
                      <tr
                        key={r.accountCode}
                        onClick={() => setSelectedAccount(r.accountCode)}
                        className={`cursor-pointer transition ${
                          isSelected ? 'bg-indigo-50/70' : 'hover:bg-slate-50'
                        }`}
                      >
                        <td className="px-4 py-2.5 font-mono font-bold text-indigo-700">
                          {r.accountCode}
                        </td>
                        <td className="px-4 py-2.5 font-medium text-slate-900">{r.accountName}</td>
                        <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                          {Number(r.openingDebit) > 0 ? fmtMoney(r.openingDebit, '') : '—'}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                          {Number(r.openingCredit) > 0 ? fmtMoney(r.openingCredit, '') : '—'}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono tabular-nums bg-indigo-50/20 font-medium">
                          {Number(r.turnoverDebit) > 0 ? fmtMoney(r.turnoverDebit, '') : '—'}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono tabular-nums bg-indigo-50/20 font-medium">
                          {Number(r.turnoverCredit) > 0 ? fmtMoney(r.turnoverCredit, '') : '—'}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono tabular-nums font-semibold text-slate-900">
                          {Number(r.closingDebit) > 0 ? fmtMoney(r.closingDebit, '') : '—'}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono tabular-nums font-semibold text-slate-900">
                          {Number(r.closingCredit) > 0 ? fmtMoney(r.closingCredit, '') : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="border-t-2 border-slate-300 bg-slate-100 font-bold text-slate-900">
                  <tr>
                    <td colSpan={2} className="px-4 py-3">
                      БАЛАНС (Усього по Головній книзі, ₴)
                    </td>
                    <td className="px-3 py-3 text-right font-mono tabular-nums">
                      {fmtMoney(tb.data.totals.openingDebit, '')}
                    </td>
                    <td className="px-3 py-3 text-right font-mono tabular-nums">
                      {fmtMoney(tb.data.totals.openingCredit, '')}
                    </td>
                    <td className="px-3 py-3 text-right font-mono tabular-nums text-indigo-700">
                      {fmtMoney(tb.data.totals.turnoverDebit, '')}
                    </td>
                    <td className="px-3 py-3 text-right font-mono tabular-nums text-indigo-700">
                      {fmtMoney(tb.data.totals.turnoverCredit, '')}
                    </td>
                    <td className="px-3 py-3 text-right font-mono tabular-nums text-emerald-700">
                      {fmtMoney(tb.data.totals.closingDebit, '')}
                    </td>
                    <td className="px-3 py-3 text-right font-mono tabular-nums text-emerald-700">
                      {fmtMoney(tb.data.totals.closingCredit, '')}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Деталізація обраного рахунку за Субконто */}
          {selectedAccount && subkonto.data && (
            <div className="rounded-2xl border border-indigo-200 bg-white p-5 shadow-xs">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">
                    ОСВ по рахунку {selectedAccount} «{subkonto.data.account?.name ?? ''}» у розрізі
                    Субконто
                  </h3>
                  <p className="text-xs text-slate-500">
                    Клікніть будь-який рахунок вище (напр. 281, 311, 361, 631, 702, 902), щоб
                    побачити аналітичну розшифровку
                  </p>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
                    <tr>
                      <th className="px-3 py-2">Аналітика (Субконто 1 / Субконто 2)</th>
                      <th className="px-3 py-2 text-right">Поч. Дт</th>
                      <th className="px-3 py-2 text-right">Поч. Кт</th>
                      <th className="px-3 py-2 text-right">Оборот Дт</th>
                      <th className="px-3 py-2 text-right">Оборот Кт</th>
                      <th className="px-3 py-2 text-right">Кін. Дт</th>
                      <th className="px-3 py-2 text-right">Кін. Кт</th>
                      {subkonto.data.account?.isQuantitative && (
                        <th className="px-3 py-2 text-right">Кін. к-сть</th>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {subkonto.data.rows.map((s, idx) => (
                      <tr key={idx} className="hover:bg-slate-50">
                        <td className="px-3 py-2 font-medium text-slate-800">{s.subkontoLabel}</td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums">
                          {Number(s.openingDebit) > 0 ? fmtMoney(s.openingDebit, '') : '—'}
                        </td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums">
                          {Number(s.openingCredit) > 0 ? fmtMoney(s.openingCredit, '') : '—'}
                        </td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums">
                          {Number(s.turnoverDebit) > 0 ? fmtMoney(s.turnoverDebit, '') : '—'}
                        </td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums">
                          {Number(s.turnoverCredit) > 0 ? fmtMoney(s.turnoverCredit, '') : '—'}
                        </td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums font-semibold text-emerald-700">
                          {Number(s.closingDebit) > 0 ? fmtMoney(s.closingDebit, '') : '—'}
                        </td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums font-semibold text-rose-700">
                          {Number(s.closingCredit) > 0 ? fmtMoney(s.closingCredit, '') : '—'}
                        </td>
                        {subkonto.data.account?.isQuantitative && (
                          <td className="px-3 py-2 text-right font-mono tabular-nums text-slate-700">
                            {fmtQty(s.closingQty)}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 2. Журнал проводок */}
      {tab === 'journal' && journal.data && (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-4 py-3">Дата</th>
                  <th className="px-4 py-3">Документ</th>
                  <th className="px-3 py-3">Дт</th>
                  <th className="px-3 py-3">Субконто Дт</th>
                  <th className="px-3 py-3">Кт</th>
                  <th className="px-3 py-3">Субконто Кт</th>
                  <th className="px-3 py-3 text-right">К-сть</th>
                  <th className="px-4 py-3 text-right">Сума</th>
                  <th className="px-4 py-3">Зміст</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {journal.data.map((e) => (
                  <tr key={e.id} className="hover:bg-slate-50">
                    <td className="px-4 py-2.5 font-mono text-slate-500">{fmtDate(e.period)}</td>
                    <td className="px-4 py-2.5 font-medium text-slate-800">
                      {DOC_TYPE_META[e.docType]?.short ?? e.docType} №{e.docNumber}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="rounded bg-indigo-50 px-2 py-0.5 font-mono font-bold text-indigo-700">
                        {e.debitAccountCode}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-slate-600">
                      {[e.debitSubkonto1Label, e.debitSubkonto2Label].filter(Boolean).join(' · ') ||
                        '—'}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="rounded bg-purple-50 px-2 py-0.5 font-mono font-bold text-purple-700">
                        {e.creditAccountCode}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-slate-600">
                      {[e.creditSubkonto1Label, e.creditSubkonto2Label]
                        .filter(Boolean)
                        .join(' · ') || '—'}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums text-slate-500">
                      {Number(e.qty) > 0 ? fmtQty(e.qty) : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono font-semibold tabular-nums text-slate-900">
                      {fmtMoney(e.amount)}
                    </td>
                    <td className="px-4 py-2.5 text-slate-500">{e.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 3. План рахунків Мінфіну №291 */}
      {tab === 'coa' && (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
              <tr>
                <th className="px-4 py-3">Код</th>
                <th className="px-4 py-3">Назва рахунку (Наказ Мінфіну №291)</th>
                <th className="px-4 py-3">Клас</th>
                <th className="px-4 py-3">Вид</th>
                <th className="px-4 py-3">Аналітика (Субконто)</th>
                <th className="px-4 py-3">Кількісний</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {bootstrap.chartOfAccounts.map((acc) => (
                <tr key={acc.code} className="hover:bg-slate-50">
                  <td className="px-4 py-2.5 font-mono font-bold text-indigo-700">{acc.code}</td>
                  <td className="px-4 py-2.5 font-medium text-slate-900">{acc.name}</td>
                  <td className="px-4 py-2.5 text-slate-500">Клас {acc.classNo}</td>
                  <td className="px-4 py-2.5">
                    <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700">
                      {acc.accountType === 'ACTIVE'
                        ? 'Активний'
                        : acc.accountType === 'PASSIVE'
                          ? 'Пасивний'
                          : 'Активно-пасивний'}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 font-mono text-slate-500">
                    {[acc.subkonto1Type, acc.subkonto2Type].filter(Boolean).join(', ') || '—'}
                  </td>
                  <td className="px-4 py-2.5 text-slate-600">
                    {acc.isQuantitative ? 'Так' : 'Ні'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 4. Експорт SAF-T UA v2.0 */}
      {tab === 'saft' && saft.data && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="text-xs text-slate-500">Рахунків / Проводок ГК</div>
              <div className="mt-1 text-xl font-bold text-slate-900">
                {saft.data.stats.accountsCount} / {saft.data.stats.entriesCount}
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="text-xs text-slate-500">Контроль TotalDebit = TotalCredit</div>
              <div className="mt-1 text-lg font-bold font-mono tabular-nums text-emerald-700">
                {fmtMoney(saft.data.stats.totalDebit)}
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="text-xs text-slate-500">Первинні накладні (Прод / Прих)</div>
              <div className="mt-1 text-xl font-bold text-slate-900">
                {saft.data.stats.salesInvoicesCount} / {saft.data.stats.purchaseInvoicesCount}
              </div>
            </div>
            <div className="flex items-center justify-center rounded-2xl border border-indigo-200 bg-indigo-50/50 p-4">
              <button
                onClick={() => downloadTextFile(saft.data!.filename, saft.data!.xml)}
                className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-semibold text-white shadow-xs hover:bg-indigo-700"
              >
                <Download className="h-4 w-4" /> Завантажити {saft.data.filename}
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-900 p-4 text-slate-100 shadow-xs">
            <div className="mb-2 flex items-center justify-between text-xs text-slate-400">
              <span>Попередній перегляд XML аудит-файлу ДПС (SAF-T UA v2.00)</span>
              <span className="text-emerald-400">
                {saft.data.stats.isBalanced ? '✓ XSD контрольні суми збігаються' : 'Помилка балансу'}
              </span>
            </div>
            <pre className="max-h-96 overflow-auto font-mono text-[11px] leading-relaxed text-slate-200">
              {saft.data.xml}
            </pre>
          </div>
        </div>
      )}

      {manualOpen && (
        <DocumentEditorModal
          bootstrap={bootstrap}
          docType="manual_journal"
          onClose={() => setManualOpen(false)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ['trial-balance'] });
            qc.invalidateQueries({ queryKey: ['acc-subkonto'] });
            qc.invalidateQueries({ queryKey: ['acc-journal'] });
            qc.invalidateQueries({ queryKey: ['acc-saft'] });
            qc.invalidateQueries({ queryKey: ['documents'] });
          }}
        />
      )}
    </div>
  );
}
