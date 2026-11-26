import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Wallet,
  Package,
  ArrowRight,
  Scale,
  FileCode2,
} from 'lucide-react';
import {
  apiFetch,
  downloadTextFile,
  DOC_TYPE_META,
  fmtDate,
  fmtMoney,
  type DepartmentDto,
  type DocumentSummary,
  type DocumentType,
  type OrganizationDto,
  type PermissionMap,
} from '../lib/api';

interface DashboardResponse {
  kpis: {
    revenue: string;
    grossProfit: string;
    netProfit: string;
    grossMarginPercent: string;
    cashBalance: string;
    inventoryValue: string;
    inventoryQty: string;
    reservedQty?: string;
    receivables: string;
    payables: string;
  };
  cashByAccount: Array<{
    cashAccountId: string;
    name: string;
    accountType: string;
    currency: string;
    opening: string;
    inflow: string;
    outflow: string;
    closing: string;
  }>;
  recentDocuments: DocumentSummary[];
}

type PeriodKey = 'q4' | 'nov' | 'year' | 'custom';

const PERIOD_PRESETS: Array<{
  key: PeriodKey;
  label: string;
  dateFrom: string;
  dateTo: string;
}> = [
  {
    key: 'q4',
    label: 'Q4 2026',
    dateFrom: '2026-10-01T00:00:00Z',
    dateTo: '2026-12-31T23:59:59Z',
  },
  {
    key: 'nov',
    label: 'Листопад',
    dateFrom: '2026-11-01T00:00:00Z',
    dateTo: '2026-11-30T23:59:59Z',
  },
  {
    key: 'year',
    label: '2026',
    dateFrom: '2026-01-01T00:00:00Z',
    dateTo: '2026-12-31T23:59:59Z',
  },
  {
    key: 'custom',
    label: 'Період…',
    dateFrom: '2026-10-01T00:00:00Z',
    dateTo: '2026-12-31T23:59:59Z',
  },
];

const DOC_BADGE_STYLE: Record<
  DocumentType,
  { code: string; bgVar: string; inkVar: string }
> = {
  depreciation_run: { code: 'АМ', bgVar: 'var(--neutral-soft)', inkVar: 'var(--neutral-ink)' },
  payroll_sheet: { code: 'ЗП', bgVar: 'var(--primary-soft)', inkVar: 'var(--primary-ink)' },
  fx_revaluation: { code: 'КР', bgVar: 'var(--warn-soft)', inkVar: 'var(--warn-ink)' },
  goods_receipt: { code: 'ПН', bgVar: 'var(--pos-soft)', inkVar: 'var(--pos-ink)' },
  sales_invoice: { code: 'ВН', bgVar: 'var(--info-soft)', inkVar: 'var(--info-ink)' },
  production_order: { code: 'ВР', bgVar: 'var(--violet-soft)', inkVar: 'var(--violet-ink)' },
  inventory_count: { code: 'ІН', bgVar: 'var(--neg-soft)', inkVar: 'var(--neg-ink)' },
  customer_order: { code: 'ЗМ', bgVar: 'var(--warn-soft)', inkVar: 'var(--warn-ink)' },
  money_in: { code: 'О+', bgVar: 'var(--pos-soft)', inkVar: 'var(--pos-ink)' },
  money_out: { code: 'В−', bgVar: 'var(--neg-soft)', inkVar: 'var(--neg-ink)' },
  tax_invoice: { code: 'ПД', bgVar: 'var(--info-soft)', inkVar: 'var(--info-ink)' },
  stock_transfer: { code: 'ПМ', bgVar: 'var(--violet-soft)', inkVar: 'var(--violet-ink)' },
  price_setting: { code: 'ВЦ', bgVar: 'var(--primary-soft)', inkVar: 'var(--primary-ink)' },
  manual_journal: { code: 'БО', bgVar: 'var(--violet-soft)', inkVar: 'var(--violet-ink)' },
  opening_balance: { code: 'ПЗ', bgVar: 'var(--neutral-soft)', inkVar: 'var(--neutral-ink)' },
};

export function DashboardPage({
  organization,
  activeDepartment,
  activeDepartmentLabel,
  permissions,
  onOpenMovements,
  onNavigateDocs,
  onNavigate,
}: {
  organization: OrganizationDto;
  activeDepartment?: DepartmentDto | null;
  activeDepartmentLabel?: string;
  permissions?: PermissionMap;
  onOpenMovements: (doc: DocumentSummary) => void;
  onNavigateDocs: () => void;
  onNavigate?: (
    tab:
      | 'dashboard'
      | 'crm'
      | 'documents'
      | 'assets'
      | 'accounting'
      | 'statutory'
      | 'reports'
      | 'catalogs'
      | 'service'
  ) => void;
}) {
  const [periodKey, setPeriodKey] = useState<PeriodKey>('q4');
  const [customFrom, setCustomFrom] = useState('2026-10-01');
  const [customTo, setCustomTo] = useState('2026-12-31');
  const [exportingSaft, setExportingSaft] = useState(false);

  const activePreset = PERIOD_PRESETS.find((p) => p.key === periodKey) ?? PERIOD_PRESETS[0];
  const dateFrom =
    periodKey === 'custom' ? `${customFrom}T00:00:00Z` : activePreset.dateFrom;
  const dateTo =
    periodKey === 'custom' ? `${customTo}T23:59:59Z` : activePreset.dateTo;
  const periodLabel =
    periodKey === 'custom' ? `${customFrom} — ${customTo}` : activePreset.label;

  const { data, isLoading } = useQuery({
    queryKey: ['dashboard', organization.id, activeDepartment?.id ?? 'ALL', dateFrom, dateTo],
    queryFn: () =>
      apiFetch<DashboardResponse>(
        `/api/dashboard?dateFrom=${encodeURIComponent(dateFrom)}&dateTo=${encodeURIComponent(dateTo)}`
      ),
  });

  const canSeeRevenue = !permissions || permissions.sales || permissions.accounting;
  const canSeeMoney = !permissions || permissions.money || permissions.accounting;
  const canSeeStock =
    !permissions ||
    permissions.warehouse ||
    permissions.purchases ||
    permissions.sales ||
    permissions.production ||
    permissions.accounting;
  const canSeeSettlements =
    !permissions ||
    permissions.sales ||
    permissions.purchases ||
    permissions.money ||
    permissions.accounting;
  const canSeeAccounting = !permissions || permissions.accounting;

  const handleDownloadSaft = async () => {
    setExportingSaft(true);
    try {
      const res = await apiFetch<{ filename: string; xml: string }>(
        `/api/accounting/saft-ua?dateFrom=${encodeURIComponent(dateFrom)}&dateTo=${encodeURIComponent(dateTo)}`
      );
      downloadTextFile(res.filename, res.xml);
    } catch {
      onNavigate?.('accounting');
    } finally {
      setExportingSaft(false);
    }
  };

  const vatLabel = organization.isVatPayer
    ? `ПДВ ${organization.vatRate}%`
    : 'Без ПДВ';

  if (isLoading || !data) {
    return (
      <div className="space-y-6">
        <div className="h-20 w-2/3 animate-pulse rounded-2xl" style={{ background: 'var(--border)' }} />
        <div className="bento-grid">
          <div className="bento-span-2 h-64 animate-pulse" style={{ background: 'var(--border)', borderRadius: 'var(--r-xl)' }} />
          <div className="h-64 animate-pulse" style={{ background: 'var(--border)', borderRadius: 'var(--r-xl)' }} />
          <div className="h-64 animate-pulse" style={{ background: 'var(--border)', borderRadius: 'var(--r-xl)' }} />
        </div>
      </div>
    );
  }

  const { kpis } = data;
  const revNum = Number(kpis.revenue || 0);
  const grossNum = Number(kpis.grossProfit || 0);
  const cogsNum = Math.max(revNum - grossNum, 0);
  const netNum = Number(kpis.netProfit || 0);
  const opExNum = Math.max(grossNum - netNum, 0);

  const invQty = Number(kpis.inventoryQty || 0);
  const resQty = Number(kpis.reservedQty || 0);
  const resPct = invQty > 0 ? Math.min(Math.round((resQty / invQty) * 100), 100) : 0;

  const recNum = Number(kpis.receivables || 0);
  const payNum = Number(kpis.payables || 0);
  const netSettlements = recNum - payNum;

  return (
    <div className="space-y-6">
      {/* 2.2 Привітання та перемикач періоду */}
      <section className="flex flex-wrap items-end justify-between gap-4 pt-2">
        <div className="min-w-0">
          <div className="overline-label" style={{ color: 'var(--primary)' }}>
            Огляд · {periodLabel} · {vatLabel}
            {activeDepartmentLabel ? ` · Підрозділ: ${activeDepartmentLabel}` : ''}
          </div>
          <h1
            className="mt-1.5 font-display font-extrabold tracking-tight"
            style={{
              fontSize: 'clamp(28px, 3.6vw, 40px)',
              lineHeight: 1.12,
              letterSpacing: '-0.03em',
              color: 'var(--text)',
            }}
          >
            Добрий день! Ось стан бізнесу сьогодні
          </h1>
        </div>

        <div className="flex flex-col items-end gap-2">
          <div
            role="group"
            aria-label="Вибір періоду"
            className="inline-flex flex-wrap items-center gap-1 p-1.5"
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--r-pill)',
              boxShadow: 'var(--shadow-soft)',
            }}
          >
            {PERIOD_PRESETS.map((p) => {
              const active = periodKey === p.key;
              return (
                <button
                  key={p.key}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setPeriodKey(p.key)}
                  className="min-h-[36px] px-3.5 text-[13px] font-bold transition"
                  style={{
                    borderRadius: 'var(--r-pill)',
                    background: active ? 'var(--primary-soft)' : 'transparent',
                    color: active ? 'var(--primary-ink)' : 'var(--text-2)',
                  }}
                >
                  {p.label}
                </button>
              );
            })}
          </div>

          {periodKey === 'custom' && (
            <div
              className="flex flex-wrap items-center gap-2 px-3 py-2 text-[12px]"
              style={{
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--r-md)',
              }}
            >
              <label className="flex items-center gap-1.5 font-semibold" style={{ color: 'var(--muted)' }}>
                Від
                <input
                  type="date"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  className="min-h-[36px] rounded-lg px-2 font-mono text-[12px]"
                  style={{
                    border: '1px solid var(--border-strong)',
                    color: 'var(--text)',
                    background: 'var(--surface-2)',
                  }}
                />
              </label>
              <label className="flex items-center gap-1.5 font-semibold" style={{ color: 'var(--muted)' }}>
                До
                <input
                  type="date"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                  className="min-h-[36px] rounded-lg px-2 font-mono text-[12px]"
                  style={{
                    border: '1px solid var(--border-strong)',
                    color: 'var(--text)',
                    background: 'var(--surface-2)',
                  }}
                />
              </label>
            </div>
          )}
        </div>
      </section>

      {/* 2.3 Bento Grid */}
      <section aria-label="Ключові показники" className="bento-grid">
        {/* 1. Виручка (span 2, hero gradient) */}
        {canSeeRevenue && (
        <article className="bento-hero bento-span-2 lift rise flex flex-col justify-between gap-5">
          {/* Decorative translucent circle */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -top-16 -right-16 h-60 w-60 rounded-full"
            style={{ background: 'var(--glass-tile)' }}
          />

          <div className="relative z-10">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="overline-label" style={{ opacity: 0.9 }}>
                Виручка · {periodLabel}
              </span>
              <span
                className="inline-flex items-center gap-1 rounded-full px-3 py-1 font-mono text-[12px] font-bold"
                style={{
                  background: 'var(--glass-tile)',
                  border: '1px solid var(--glass-border)',
                }}
              >
                ▲ маржа {kpis.grossMarginPercent}%
              </span>
            </div>

            <div
              className="mt-3 font-mono font-bold tracking-tight"
              style={{
                fontSize: 'clamp(34px, 4.2vw, 52px)',
                lineHeight: 1.08,
                letterSpacing: '-0.02em',
              }}
            >
              {fmtMoney(kpis.revenue)}
            </div>
          </div>

          <div className="relative z-10 grid grid-cols-1 gap-3 sm:grid-cols-3">
            {[
              { label: 'Собівартість FIFO (902)', val: fmtMoney(cogsNum) },
              { label: 'Валовий прибуток', val: fmtMoney(grossNum) },
              { label: 'Опер. витрати (92/93)', val: fmtMoney(opExNum) },
            ].map((item) => (
              <div
                key={item.label}
                className="px-4 py-3"
                style={{
                  background: 'var(--glass-tile)',
                  border: '1px solid var(--glass-border)',
                  borderRadius: 'var(--r-md)',
                }}
              >
                <div className="text-[12px] font-medium" style={{ opacity: 0.85 }}>
                  {item.label}
                </div>
                <div className="mt-1 font-mono text-[17px] font-bold">{item.val}</div>
              </div>
            ))}
          </div>

          <div className="relative z-10 flex items-center justify-start">
            <button
              type="button"
              onClick={() => onNavigate?.('reports')}
              className="inline-flex min-h-[44px] items-center gap-2 px-5 text-[14px] font-extrabold transition"
              style={{
                background: 'var(--surface)',
                color: 'var(--primary-ink)',
                borderRadius: 'var(--r-pill)',
              }}
            >
              <span>Розгорнути P&amp;L</span>
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </article>
        )}

        {/* 2. Гроші на рахунках */}
        {canSeeMoney && (
        <article className="bento-tile lift rise rise-d1 flex flex-col justify-between gap-4">
          <div className="flex items-start justify-between gap-3">
            <span className="overline-label" style={{ color: 'var(--muted)' }}>
              Гроші на рахунках
            </span>
            <span
              className="flex h-11 w-11 shrink-0 items-center justify-center"
              style={{
                background: 'var(--primary-soft)',
                color: 'var(--primary)',
                borderRadius: 'var(--r-sm)',
              }}
            >
              <Wallet className="h-5 w-5" aria-hidden="true" />
            </span>
          </div>

          <div
            className="font-mono font-bold tracking-tight"
            style={{ fontSize: '30px', lineHeight: 1.15, color: 'var(--text)' }}
          >
            {fmtMoney(kpis.cashBalance)}
          </div>

          <div
            className="flex flex-wrap items-center justify-between gap-2 pt-3"
            style={{ borderTop: '1px solid var(--border)' }}
          >
            <span className="text-[13px] font-semibold" style={{ color: 'var(--muted)' }}>
              Фін. результат (P&amp;L)
            </span>
            <span
              className="rounded-full px-3 py-1 font-mono text-[13px] font-bold"
              style={{
                background: netNum >= 0 ? 'var(--pos-soft)' : 'var(--neg-soft)',
                color: netNum >= 0 ? 'var(--pos)' : 'var(--neg)',
              }}
            >
              {netNum >= 0 ? `+${fmtMoney(netNum)}` : `−${fmtMoney(Math.abs(netNum))}`}
            </span>
          </div>
        </article>
        )}

        {/* 3. Товарний запас · FIFO */}
        {canSeeStock && (
        <article className="bento-tile lift rise rise-d2 flex flex-col justify-between gap-4">
          <div className="flex items-start justify-between gap-3">
            <span className="overline-label" style={{ color: 'var(--muted)' }}>
              Товарний запас · FIFO
            </span>
            <span
              className="flex h-11 w-11 shrink-0 items-center justify-center"
              style={{
                background: 'var(--pos-soft)',
                color: 'var(--pos)',
                borderRadius: 'var(--r-sm)',
              }}
            >
              <Package className="h-5 w-5" aria-hidden="true" />
            </span>
          </div>

          <div
            className="font-mono font-bold tracking-tight"
            style={{ fontSize: '30px', lineHeight: 1.15, color: 'var(--text)' }}
          >
            {fmtMoney(kpis.inventoryValue)}
          </div>

          <div className="space-y-2.5">
            <div
              className="h-[8px] w-full overflow-hidden rounded-full"
              style={{ background: 'var(--neutral-soft)' }}
              aria-label={`У резерві ${resPct}% товарів`}
            >
              <div
                className="h-full rounded-full"
                style={{
                  width: `${Math.max(resPct, invQty > 0 ? 8 : 0)}%`,
                  background: 'linear-gradient(90deg, var(--pos), var(--sky))',
                }}
              />
            </div>
            <div className="flex items-center justify-between text-[13px] font-semibold">
              <span style={{ color: 'var(--text-2)' }}>
                Всього:{' '}
                <strong className="font-mono" style={{ color: 'var(--text)' }}>
                  {kpis.inventoryQty} од.
                </strong>
              </span>
              <span className="font-mono" style={{ color: 'var(--primary-ink)' }}>
                Резерв: {kpis.reservedQty ?? '0'} од.
              </span>
            </div>
          </div>
        </article>
        )}

        {/* 4. Взаєморозрахунки (span 2, flex wrap) */}
        {canSeeSettlements && (
        <article className="bento-tile bento-span-2 lift rise rise-d3 flex flex-wrap items-center justify-between gap-5">
          <div className="min-w-[180px] space-y-1.5">
            <span className="overline-label" style={{ color: 'var(--muted)' }}>
              Взаєморозрахунки
            </span>
            <div className="text-[20px] font-extrabold" style={{ color: 'var(--text)' }}>
              Баланс боргів
            </div>
            <div className="text-[14px] font-semibold" style={{ color: 'var(--text-2)' }}>
              Сальдо:{' '}
              <span
                className="font-mono font-bold"
                style={{ color: netSettlements >= 0 ? 'var(--pos)' : 'var(--neg)' }}
              >
                {netSettlements >= 0
                  ? `+${fmtMoney(netSettlements)}`
                  : `−${fmtMoney(Math.abs(netSettlements))}`}
              </span>
            </div>
          </div>

          <div className="flex flex-1 flex-wrap gap-3 sm:min-w-[320px]">
            <div
              className="flex-1 min-w-[155px] px-4 py-3.5"
              style={{
                background: 'var(--pos-soft)',
                color: 'var(--pos-ink)',
                borderRadius: 'var(--r-md)',
              }}
            >
              <div className="text-[12px] font-bold">↙ Нам винні</div>
              <div className="mt-1 font-mono text-[22px] font-bold">
                {fmtMoney(kpis.receivables)}
              </div>
            </div>

            <div
              className="flex-1 min-w-[155px] px-4 py-3.5"
              style={{
                background: 'var(--neg-soft)',
                color: 'var(--neg-ink)',
                borderRadius: 'var(--r-md)',
              }}
            >
              <div className="text-[12px] font-bold">↗ Ми винні</div>
              <div className="mt-1 font-mono text-[22px] font-bold">
                {fmtMoney(kpis.payables)}
              </div>
            </div>
          </div>
        </article>
        )}

        {/* 5. Звітність ДПС (warm card) */}
        {canSeeAccounting && (
        <article className="bento-warm bento-span-2 lift rise rise-d4 flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-[200px]">
            <span className="overline-label" style={{ color: 'var(--warn-ink)' }}>
              Звітність ДПС
            </span>
            <h2
              className="mt-1.5 font-display text-[20px] font-extrabold leading-snug"
              style={{ color: 'var(--text)' }}
            >
              ОСВ №291 і SAF-T UA XML
            </h2>
            <p className="mt-1 text-[13px]" style={{ color: 'var(--muted)' }}>
              Оборотно-сальдова відомість та файл електронного аудиту
            </p>
          </div>

          <div className="flex flex-wrap gap-2.5">
            <button
              type="button"
              onClick={() => onNavigate?.('accounting')}
              className="inline-flex min-h-[44px] items-center justify-center gap-2 whitespace-nowrap px-4 text-[13px] font-bold transition"
              style={{
                borderRadius: 'var(--r-sm)',
                border: '1px solid var(--warm-btn)',
                background: 'var(--surface)',
                color: 'var(--warn-ink)',
              }}
            >
              <Scale className="h-4 w-4" aria-hidden="true" />
              <span>ОСВ Дт = Кт</span>
            </button>
            <button
              type="button"
              disabled={exportingSaft}
              onClick={handleDownloadSaft}
              className="inline-flex min-h-[44px] items-center justify-center gap-2 whitespace-nowrap px-4 text-[13px] font-bold transition disabled:opacity-60"
              style={{
                borderRadius: 'var(--r-sm)',
                background: 'var(--warm-btn)',
                color: 'var(--surface)',
              }}
            >
              <FileCode2 className="h-4 w-4" aria-hidden="true" />
              <span>{exportingSaft ? 'Генерація...' : 'Е-аудит XML'}</span>
            </button>
          </div>
        </article>
        )}
      </section>

      {/* 2.4 Нижній ряд: Каси та банки + Останні господарські операції */}
      <section className="flex flex-wrap gap-[18px]">
        {/* Ліворуч: Каси та банки */}
        {canSeeMoney && (
        <div className="flex flex-col gap-3.5" style={{ flex: '1 1 300px', minWidth: 0 }}>
          <div className="flex items-baseline justify-between px-1">
            <h2
              className="font-display font-extrabold"
              style={{ fontSize: '20px', color: 'var(--text)' }}
            >
              Каси та банки
            </h2>
            <span className="font-mono text-[12px] font-semibold" style={{ color: 'var(--muted)' }}>
              301 / 311 / 312
            </span>
          </div>

          <div className="space-y-3">
            {data.cashByAccount.map((acc) => {
              const isCash = acc.accountType === 'CASH';
              const isForeign = acc.currency !== 'UAH';
              const badgeBg = isForeign
                ? 'var(--warn-soft)'
                : isCash
                  ? 'var(--pos-soft)'
                  : 'var(--primary-soft)';
              const badgeInk = isForeign
                ? 'var(--warn-ink)'
                : isCash
                  ? 'var(--pos-ink)'
                  : 'var(--primary-ink)';
              const badgeText = isForeign ? acc.currency : isCash ? 'Каса' : 'UAH';

              return (
                <div
                  key={acc.cashAccountId}
                  className="lift p-5"
                  style={{
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--r-lg)',
                  }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-[14px] font-bold" style={{ color: 'var(--text)' }}>
                      {acc.name}
                    </span>
                    <span
                      className="shrink-0 rounded-full px-2.5 py-0.5 font-mono text-[11px] font-bold"
                      style={{ background: badgeBg, color: badgeInk }}
                    >
                      {badgeText}
                    </span>
                  </div>

                  <div
                    className="mt-3 font-mono font-bold tracking-tight"
                    style={{ fontSize: '24px', color: 'var(--text)' }}
                  >
                    {fmtMoney(acc.closing, acc.currency === 'UAH' ? '₴' : acc.currency)}
                  </div>

                  <div
                    className="mt-3 flex flex-wrap items-center justify-between gap-2 pt-2.5 font-mono text-[12px] font-semibold"
                    style={{ borderTop: '1px solid var(--border)' }}
                  >
                    <span style={{ color: 'var(--pos)' }}>
                      + {fmtMoney(acc.inflow, acc.currency === 'UAH' ? '₴' : acc.currency)}
                    </span>
                    <span style={{ color: 'var(--neg)' }}>
                      − {fmtMoney(acc.outflow, acc.currency === 'UAH' ? '₴' : acc.currency)}
                    </span>
                  </div>
                </div>
              );
            })}
            {data.cashByAccount.length === 0 && (
              <div
                className="p-5 text-center text-[13px]"
                style={{
                  background: 'var(--surface)',
                  border: '1px dashed var(--border-strong)',
                  borderRadius: 'var(--r-lg)',
                  color: 'var(--muted)',
                }}
              >
                У цьому підрозділі немає закріплених кас або рахунків
              </div>
            )}
          </div>
        </div>
        )}

        {/* Праворуч: Останні господарські операції */}
        <div
          className="bento-tile flex flex-col gap-4"
          style={{ flex: '999 1 560px', minWidth: 0 }}
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2
                className="font-display font-extrabold"
                style={{ fontSize: '20px', color: 'var(--text)' }}
              >
                Останні господарські операції
              </h2>
              <p className="mt-0.5 text-[13px]" style={{ color: 'var(--muted)' }}>
                Натисніть рядок — проводки Дт/Кт відкриються збоку
              </p>
            </div>

            <button
              type="button"
              onClick={onNavigateDocs}
              className="inline-flex min-h-[44px] items-center gap-1.5 px-3.5 text-[13px] font-bold transition"
              style={{
                borderRadius: 'var(--r-pill)',
                background: 'var(--primary-soft)',
                color: 'var(--primary-ink)',
              }}
            >
              <span>Усі документи</span>
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          <div className="space-y-2.5">
            {data.recentDocuments.length === 0 ? (
              <div
                className="border-2 border-dashed py-10 text-center text-[14px]"
                style={{
                  borderColor: 'var(--border-strong)',
                  borderRadius: 'var(--r-md)',
                  color: 'var(--muted)',
                }}
              >
                Операцій за обраний період ще немає
              </div>
            ) : (
              data.recentDocuments.map((doc) => {
                const meta = DOC_TYPE_META[doc.docType];
                const badge = DOC_BADGE_STYLE[doc.docType] ?? {
                  code: 'ДК',
                  bgVar: 'var(--neutral-soft)',
                  inkVar: 'var(--neutral-ink)',
                };
                const isPosted = doc.status === 'POSTED';

                return (
                  <button
                    key={doc.id}
                    type="button"
                    onClick={() => onOpenMovements(doc)}
                    className="op-row"
                  >
                    {/* Col 1: 44x44 square badge */}
                    <span
                      className="flex h-[44px] w-[44px] items-center justify-center font-mono text-[13px] font-bold"
                      style={{
                        borderRadius: '14px',
                        background: badge.bgVar,
                        color: badge.inkVar,
                      }}
                    >
                      {badge.code}
                    </span>

                    {/* Col 2: Type + number + date + 1-line ellipsis comment */}
                    <span className="min-w-0">
                      <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                        <span
                          className="text-[14px] font-bold"
                          style={{ color: 'var(--text)' }}
                        >
                          {meta.short}
                        </span>
                        <span
                          className="font-mono text-[12px] font-medium"
                          style={{ color: 'var(--muted)' }}
                        >
                          №{doc.docNumber} · {fmtDate(doc.docDate)}
                        </span>
                        {doc.departmentName && !activeDepartment && (
                          <span
                            className="rounded-full px-2 py-0.5 text-[10px] font-bold"
                            style={{
                              background: 'var(--primary-soft)',
                              color: 'var(--primary-ink)',
                            }}
                          >
                            {doc.departmentName}
                          </span>
                        )}
                      </span>
                      <span
                        className="mt-0.5 block truncate text-[13px]"
                        style={{ color: 'var(--muted)' }}
                      >
                        {doc.comment || doc.counterpartyName || meta.label}
                      </span>
                    </span>

                    {/* Col 3: Sum + Status */}
                    <span className="flex flex-col items-end gap-1 text-right">
                      <span
                        className="font-mono text-[14px] font-bold whitespace-nowrap"
                        style={{ color: 'var(--text)' }}
                      >
                        {fmtMoney(doc.totalAmount)}
                      </span>
                      <span
                        className="inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-bold whitespace-nowrap"
                        style={{
                          background: isPosted ? 'var(--pos-soft)' : 'var(--warn-soft)',
                          color: isPosted ? 'var(--pos-ink)' : 'var(--warn-ink)',
                        }}
                      >
                        {isPosted ? 'Проведений' : 'Чернетка'}
                      </span>
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
