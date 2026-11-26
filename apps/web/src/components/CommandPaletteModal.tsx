import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Search,
  ShoppingBag,
  Scale,
  FileCode2,
  Users,
  Package,
  FileText,
  ArrowRight,
  ShoppingCart,
} from 'lucide-react';
import {
  apiFetch,
  DOC_TYPE_META,
  fmtDate,
  fmtMoney,
  fmtQty,
  type BootstrapData,
  type DocumentType,
} from '../lib/api';
import { OverlayDialog } from './OverlayDialog';

interface SearchResponse {
  items: Array<{
    id: string;
    sku: string;
    barcode: string;
    name: string;
    unit: string;
    itemType: string;
    categoryName: string;
    stockQty: number;
    freeQty: number;
  }>;
  counterparties: Array<{
    id: string;
    name: string;
    edrpou: string;
    phone: string;
    isCustomer: boolean;
    isSupplier: boolean;
  }>;
  documents: Array<{
    id: string;
    docType: DocumentType;
    docNumber: string;
    docDate: string;
    status: string;
    totalAmount: string;
    counterpartyName: string;
    comment: string;
  }>;
  leads: Array<{
    id: string;
    title: string;
    contactName: string;
    stage: string;
    expectedAmount: string;
  }>;
  accounts: Array<{
    code: string;
    name: string;
    classNo: number;
  }>;
}

type NavTarget =
  | 'dashboard'
  | 'crm'
  | 'documents'
  | 'assets'
  | 'accounting'
  | 'statutory'
  | 'reports'
  | 'catalogs'
  | 'service';

interface FlatEntry {
  key: string;
  onSelect: () => void;
}

export function CommandPaletteModal({
  bootstrap,
  onClose,
  onNavigate,
  onCreateDoc,
  onOpenDocument,
}: {
  bootstrap: BootstrapData;
  onClose: () => void;
  onNavigate: (tab: NavTarget) => void;
  onCreateDoc: (
    docType: DocumentType,
    preset?: { counterpartyId?: string; itemId?: string }
  ) => void;
  onOpenDocument?: (docId: string, docType: DocumentType) => void;
}) {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);

  const trimmed = query.trim();
  const perms = bootstrap.currentUser?.effectivePermissions;

  const { data, isFetching } = useQuery({
    queryKey: [
      'global-smart-search',
      bootstrap.organization.id,
      bootstrap.activeDepartmentId ?? 'ALL',
      trimmed,
    ],
    enabled: trimmed.length > 0,
    queryFn: () =>
      apiFetch<SearchResponse>(`/api/search?q=${encodeURIComponent(trimmed)}`),
    staleTime: 15_000,
  });

  const quickActions = useMemo(
    () =>
      [
        {
          id: 'qa-sale',
          allowed: !perms || perms.sales,
          label: 'Новий продаж',
          sub: 'Видаткова + FIFO',
          icon: ShoppingBag,
          bgVar: 'var(--info-soft)',
          inkVar: 'var(--info-ink)',
          run: () => onCreateDoc('sales_invoice'),
        },
        {
          id: 'qa-receipt',
          allowed: !perms || perms.purchases || perms.warehouse,
          label: 'Прихід товару',
          sub: 'Прибуткова накладна',
          icon: ShoppingCart,
          bgVar: 'var(--pos-soft)',
          inkVar: 'var(--pos-ink)',
          run: () => onCreateDoc('goods_receipt'),
        },
        {
          id: 'qa-osv',
          allowed: !perms || perms.accounting,
          label: 'ОСВ №291',
          sub: 'Баланс Дт = Кт',
          icon: Scale,
          bgVar: 'var(--primary-soft)',
          inkVar: 'var(--primary-ink)',
          run: () => onNavigate('accounting'),
        },
        {
          id: 'qa-saft',
          allowed: !perms || perms.accounting,
          label: 'SAF-T UA XML',
          sub: 'Е-аудит ДПС',
          icon: FileCode2,
          bgVar: 'var(--warn-soft)',
          inkVar: 'var(--warn-ink)',
          run: () => onNavigate('accounting'),
        },
        {
          id: 'qa-cp',
          allowed: !perms || perms.catalogs || perms.sales || perms.purchases || perms.crm,
          label: 'Контрагенти',
          sub: 'Покупці та постачальники',
          icon: Users,
          bgVar: 'var(--pos-soft)',
          inkVar: 'var(--pos-ink)',
          run: () => onNavigate('catalogs'),
        },
        {
          id: 'qa-stock',
          allowed: !perms || perms.warehouse || perms.purchases || perms.reports,
          label: 'Залишки на складі',
          sub: 'Відомість FIFO та резерви',
          icon: Package,
          bgVar: 'var(--violet-soft)',
          inkVar: 'var(--violet-ink)',
          run: () => onNavigate('reports'),
        },
      ].filter((a) => a.allowed),
    [onCreateDoc, onNavigate, perms]
  );

  // Build flat keyboard-selectable list
  const flatEntries = useMemo<FlatEntry[]>(() => {
    if (!trimmed) {
      return quickActions.map((a) => ({ key: a.id, onSelect: a.run }));
    }
    const list: FlatEntry[] = [];
    if (data) {
      for (const it of data.items) {
        list.push({
          key: `item-${it.id}`,
          onSelect: () => onCreateDoc('customer_order', { itemId: it.id }),
        });
      }
      for (const cp of data.counterparties) {
        list.push({
          key: `cp-${cp.id}`,
          onSelect: () => onCreateDoc('customer_order', { counterpartyId: cp.id }),
        });
      }
      for (const doc of data.documents) {
        list.push({
          key: `doc-${doc.id}`,
          onSelect: () => {
            if (onOpenDocument) {
              onOpenDocument(doc.id, doc.docType);
            } else {
              onNavigate('documents');
            }
          },
        });
      }
      for (const acc of data.accounts) {
        list.push({
          key: `acc-${acc.code}`,
          onSelect: () => onNavigate('accounting'),
        });
      }
    }
    return list;
  }, [trimmed, data, quickActions, onCreateDoc, onNavigate, onOpenDocument]);

  useEffect(() => {
    setActiveIndex(0);
  }, [trimmed, flatEntries.length]);

  const indexMap = useMemo(() => {
    const m = new Map<string, number>();
    flatEntries.forEach((e, idx) => m.set(e.key, idx));
    return m;
  }, [flatEntries]);

  const totalResults = data
    ? data.items.length +
      data.counterparties.length +
      data.documents.length +
      data.accounts.length
    : 0;

  return (
    <OverlayDialog
      ariaLabel="Командна палітра та розумний пошук"
      variant="top"
      maxWidthClass="max-w-[600px]"
      onClose={onClose}
    >
      {(requestClose) => {
        const triggerEntry = (entry: FlatEntry | undefined) => {
          if (!entry) return;
          requestClose();
          window.setTimeout(() => {
            entry.onSelect();
          }, 10);
        };

        const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActiveIndex((prev) =>
              flatEntries.length > 0 ? (prev + 1) % flatEntries.length : 0
            );
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActiveIndex((prev) =>
              flatEntries.length > 0
                ? (prev - 1 + flatEntries.length) % flatEntries.length
                : 0
            );
          } else if (e.key === 'Enter' && flatEntries.length > 0) {
            e.preventDefault();
            triggerEntry(flatEntries[activeIndex]);
          }
        };

        return (
          <div className="flex max-h-[calc(100vh-140px)] flex-col">
            {/* Search Input Bar */}
            <div
              className="flex items-center gap-3 px-5 py-3.5"
              style={{ borderBottom: '1px solid var(--border)' }}
            >
              <Search
                className="h-5 w-5 shrink-0"
                style={{ color: 'var(--primary)' }}
                aria-hidden="true"
              />
              <input
                type="text"
                data-autofocus="true"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleInputKeyDown}
                placeholder="Шукати товари, клієнтів, документи, рахунки..."
                aria-label="Пошук по системі"
                className="min-h-[44px] flex-1 bg-transparent text-[16px] font-medium focus:outline-none"
                style={{ color: 'var(--text)' }}
              />
              <button
                type="button"
                onClick={requestClose}
                aria-label="Закрити"
                className="flex min-h-[32px] items-center justify-center rounded-lg px-2.5 font-mono text-[11px] font-semibold"
                style={{
                  background: 'var(--neutral-soft)',
                  color: 'var(--muted)',
                  border: '1px solid var(--border)',
                }}
              >
                Esc
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 space-y-5 overflow-y-auto p-4">
              {!trimmed ? (
                <section>
                  <div
                    className="overline-label mb-2 px-2"
                    style={{ color: 'var(--muted)' }}
                  >
                    Швидкі переходи
                  </div>
                  <div className="space-y-1.5">
                    {quickActions.map((act) => {
                      const idx = indexMap.get(act.id) ?? -1;
                      const isActive = idx === activeIndex;
                      const Icon = act.icon;
                      return (
                        <button
                          key={act.id}
                          type="button"
                          onMouseEnter={() => setActiveIndex(idx)}
                          onClick={() => triggerEntry(flatEntries[idx])}
                          className="flex min-h-[48px] w-full items-center justify-between gap-3 px-3 py-2 text-left transition"
                          style={{
                            borderRadius: 'var(--r-md)',
                            background: isActive ? 'var(--primary-soft)' : 'transparent',
                            color: isActive ? 'var(--primary-ink)' : 'var(--text)',
                          }}
                        >
                          <span className="flex min-w-0 items-center gap-3">
                            <span
                              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
                              style={{
                                background: act.bgVar,
                                color: act.inkVar,
                              }}
                            >
                              <Icon className="h-4 w-4" aria-hidden="true" />
                            </span>
                            <span className="min-w-0">
                              <span className="block truncate text-[14px] font-bold">
                                {act.label}
                              </span>
                              <span
                                className="block truncate text-[12px]"
                                style={{ color: 'var(--muted)' }}
                              >
                                {act.sub}
                              </span>
                            </span>
                          </span>
                          <ArrowRight
                            className="h-4 w-4 shrink-0"
                            style={{ color: isActive ? 'var(--primary)' : 'var(--muted)' }}
                            aria-hidden="true"
                          />
                        </button>
                      );
                    })}
                  </div>
                </section>
              ) : (
                <>
                  {isFetching && !data && (
                    <div
                      className="py-8 text-center text-[13px] font-medium"
                      style={{ color: 'var(--muted)' }}
                    >
                      Пошук по базі...
                    </div>
                  )}

                  {data && totalResults === 0 && (
                    <div
                      className="rounded-2xl border border-dashed py-10 text-center text-[14px]"
                      style={{
                        borderColor: 'var(--border-strong)',
                        color: 'var(--muted)',
                      }}
                    >
                      За запитом «{trimmed}» нічого не знайдено.
                    </div>
                  )}

                  {/* Товари */}
                  {data && data.items.length > 0 && (
                    <section>
                      <div
                        className="overline-label mb-2 px-2"
                        style={{ color: 'var(--muted)' }}
                      >
                        Товари ({data.items.length})
                      </div>
                      <div className="space-y-1">
                        {data.items.map((it) => {
                          const idx = indexMap.get(`item-${it.id}`) ?? -1;
                          const isActive = idx === activeIndex;
                          return (
                            <button
                              key={it.id}
                              type="button"
                              onMouseEnter={() => setActiveIndex(idx)}
                              onClick={() => triggerEntry(flatEntries[idx])}
                              className="flex min-h-[48px] w-full items-center justify-between gap-3 px-3 py-2 text-left transition"
                              style={{
                                borderRadius: 'var(--r-md)',
                                background: isActive ? 'var(--primary-soft)' : 'var(--surface-2)',
                              }}
                            >
                              <span className="flex min-w-0 items-center gap-3">
                                <span
                                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
                                  style={{
                                    background: 'var(--pos-soft)',
                                    color: 'var(--pos-ink)',
                                  }}
                                >
                                  <Package className="h-4 w-4" aria-hidden="true" />
                                </span>
                                <span className="min-w-0">
                                  <span
                                    className="block truncate text-[14px] font-bold"
                                    style={{ color: 'var(--text)' }}
                                  >
                                    {it.name}
                                  </span>
                                  <span
                                    className="block truncate font-mono text-[11px]"
                                    style={{ color: 'var(--muted)' }}
                                  >
                                    {it.sku}
                                    {it.categoryName ? ` · ${it.categoryName}` : ''} · Вільно:{' '}
                                    {fmtQty(it.freeQty)} {it.unit}
                                  </span>
                                </span>
                              </span>
                              <span
                                className="inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold"
                                style={{
                                  background: 'var(--primary-soft)',
                                  color: 'var(--primary-ink)',
                                }}
                              >
                                <ShoppingCart className="h-3 w-3" aria-hidden="true" /> + Замовлення
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </section>
                  )}

                  {/* Клієнти */}
                  {data && data.counterparties.length > 0 && (
                    <section>
                      <div
                        className="overline-label mb-2 px-2"
                        style={{ color: 'var(--muted)' }}
                      >
                        Клієнти та постачальники ({data.counterparties.length})
                      </div>
                      <div className="space-y-1">
                        {data.counterparties.map((cp) => {
                          const idx = indexMap.get(`cp-${cp.id}`) ?? -1;
                          const isActive = idx === activeIndex;
                          return (
                            <button
                              key={cp.id}
                              type="button"
                              onMouseEnter={() => setActiveIndex(idx)}
                              onClick={() => triggerEntry(flatEntries[idx])}
                              className="flex min-h-[48px] w-full items-center justify-between gap-3 px-3 py-2 text-left transition"
                              style={{
                                borderRadius: 'var(--r-md)',
                                background: isActive ? 'var(--primary-soft)' : 'var(--surface-2)',
                              }}
                            >
                              <span className="flex min-w-0 items-center gap-3">
                                <span
                                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
                                  style={{
                                    background: 'var(--info-soft)',
                                    color: 'var(--info-ink)',
                                  }}
                                >
                                  <Users className="h-4 w-4" aria-hidden="true" />
                                </span>
                                <span className="min-w-0">
                                  <span
                                    className="block truncate text-[14px] font-bold"
                                    style={{ color: 'var(--text)' }}
                                  >
                                    {cp.name}
                                  </span>
                                  <span
                                    className="block truncate font-mono text-[11px]"
                                    style={{ color: 'var(--muted)' }}
                                  >
                                    {cp.edrpou ? `ЄДРПОУ ${cp.edrpou}` : ''}
                                    {cp.phone ? ` · ${cp.phone}` : ''}
                                  </span>
                                </span>
                              </span>
                              <ArrowRight
                                className="h-4 w-4 shrink-0"
                                style={{ color: 'var(--muted)' }}
                                aria-hidden="true"
                              />
                            </button>
                          );
                        })}
                      </div>
                    </section>
                  )}

                  {/* Документи */}
                  {data && data.documents.length > 0 && (
                    <section>
                      <div
                        className="overline-label mb-2 px-2"
                        style={{ color: 'var(--muted)' }}
                      >
                        Документи ({data.documents.length})
                      </div>
                      <div className="space-y-1">
                        {data.documents.map((doc) => {
                          const idx = indexMap.get(`doc-${doc.id}`) ?? -1;
                          const isActive = idx === activeIndex;
                          const meta = DOC_TYPE_META[doc.docType];
                          return (
                            <button
                              key={doc.id}
                              type="button"
                              onMouseEnter={() => setActiveIndex(idx)}
                              onClick={() => triggerEntry(flatEntries[idx])}
                              className="flex min-h-[48px] w-full items-center justify-between gap-3 px-3 py-2 text-left transition"
                              style={{
                                borderRadius: 'var(--r-md)',
                                background: isActive ? 'var(--primary-soft)' : 'var(--surface-2)',
                              }}
                            >
                              <span className="flex min-w-0 items-center gap-3">
                                <span
                                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
                                  style={{
                                    background: 'var(--violet-soft)',
                                    color: 'var(--violet-ink)',
                                  }}
                                >
                                  <FileText className="h-4 w-4" aria-hidden="true" />
                                </span>
                                <span className="min-w-0">
                                  <span
                                    className="block truncate text-[14px] font-bold"
                                    style={{ color: 'var(--text)' }}
                                  >
                                    {meta.short}{' '}
                                    <span className="font-mono">№{doc.docNumber}</span>
                                  </span>
                                  <span
                                    className="block truncate text-[12px]"
                                    style={{ color: 'var(--muted)' }}
                                  >
                                    {fmtDate(doc.docDate)}
                                    {doc.counterpartyName ? ` · ${doc.counterpartyName}` : ''}
                                  </span>
                                </span>
                              </span>
                              <span
                                className="shrink-0 font-mono text-[13px] font-bold"
                                style={{ color: 'var(--text)' }}
                              >
                                {fmtMoney(doc.totalAmount)}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </section>
                  )}

                  {/* Рахунки №291 */}
                  {data && data.accounts.length > 0 && (
                    <section>
                      <div
                        className="overline-label mb-2 px-2"
                        style={{ color: 'var(--muted)' }}
                      >
                        План рахунків №291 ({data.accounts.length})
                      </div>
                      <div className="space-y-1">
                        {data.accounts.map((acc) => {
                          const idx = indexMap.get(`acc-${acc.code}`) ?? -1;
                          const isActive = idx === activeIndex;
                          return (
                            <button
                              key={acc.code}
                              type="button"
                              onMouseEnter={() => setActiveIndex(idx)}
                              onClick={() => triggerEntry(flatEntries[idx])}
                              className="flex min-h-[44px] w-full items-center justify-between gap-3 px-3 py-2 text-left transition"
                              style={{
                                borderRadius: 'var(--r-md)',
                                background: isActive ? 'var(--primary-soft)' : 'var(--surface-2)',
                              }}
                            >
                              <span className="flex min-w-0 items-center gap-2.5">
                                <span
                                  className="rounded-lg px-2 py-0.5 font-mono text-[12px] font-bold"
                                  style={{
                                    background: 'var(--primary-soft)',
                                    color: 'var(--primary-ink)',
                                  }}
                                >
                                  {acc.code}
                                </span>
                                <span
                                  className="truncate text-[13px] font-semibold"
                                  style={{ color: 'var(--text)' }}
                                >
                                  {acc.name}
                                </span>
                              </span>
                              <ArrowRight
                                className="h-4 w-4 shrink-0"
                                style={{ color: 'var(--muted)' }}
                                aria-hidden="true"
                              />
                            </button>
                          );
                        })}
                      </div>
                    </section>
                  )}
                </>
              )}
            </div>

            {/* Footer Hints */}
            <div
              className="flex items-center justify-between px-5 py-2.5 text-[11px] font-medium"
              style={{
                borderTop: '1px solid var(--border)',
                background: 'var(--surface-2)',
                color: 'var(--muted)',
              }}
            >
              <span>↑ ↓ навігація · Enter вибір</span>
              <span className="font-mono">⌘K / Ctrl+K</span>
            </div>
          </div>
        );
      }}
    </OverlayDialog>
  );
}
