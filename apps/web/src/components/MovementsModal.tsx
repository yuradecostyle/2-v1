import { useQuery } from '@tanstack/react-query';
import { X, FileText, Printer, Layers, Wallet, BookmarkCheck, Share2 } from 'lucide-react';
import {
  apiFetch,
  DOC_TYPE_META,
  fmtDate,
  fmtMoney,
  fmtQty,
  type DocumentSummary,
} from '../lib/api';
import { OverlayDialog } from './OverlayDialog';

interface MovementsResponse {
  accountingEntries: Array<{
    id: string;
    lineNo: number;
    debitAccountCode: string;
    creditAccountCode: string;
    debitSubkonto1Label: string;
    debitSubkonto2Label: string;
    creditSubkonto1Label: string;
    creditSubkonto2Label: string;
    qty: string;
    amount: string;
    description: string;
  }>;
  stockMovements: Array<{
    id: string;
    period: string;
    movementType: string;
    warehouseName: string;
    itemSku: string;
    itemName: string;
    qty: string;
  }>;
  stockReservations: Array<{
    id: string;
    period: string;
    movementType: string;
    warehouseName: string;
    itemSku: string;
    itemName: string;
    qty: string;
  }>;
  costBatches: Array<{
    id: string;
    period: string;
    movementType: string;
    warehouseName: string;
    itemName: string;
    batchDate: string;
    qty: string;
    costAmount: string;
  }>;
  settlements: Array<{
    id: string;
    period: string;
    counterpartyName: string;
    amount: string;
  }>;
  cashMovements: Array<{
    id: string;
    period: string;
    cashAccountName: string;
    cashflowCategoryName: string;
    amount: string;
  }>;
  pnlTurnover: Array<{
    id: string;
    period: string;
    pnlType: string;
    itemName: string;
    counterpartyName: string;
    cashflowCategoryName: string;
    qty: string;
    revenue: string;
    cogs: string;
    expense: string;
    profit: string;
  }>;
  itemPrices: Array<{
    id: string;
    effectiveAt: string;
    itemName: string;
    priceTypeName: string;
    price: string;
  }>;
}

export function MovementsModal({
  doc,
  onClose,
  onOpenDocument,
  onPrintDocument,
  onShareDocument,
}: {
  doc: DocumentSummary;
  onClose: () => void;
  onOpenDocument?: (doc: DocumentSummary) => void;
  onPrintDocument?: (doc: DocumentSummary) => void;
  onShareDocument?: (doc: DocumentSummary) => void;
}) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['doc-movements', doc.id],
    queryFn: () => apiFetch<MovementsResponse>(`/api/documents/${doc.id}/movements`),
  });

  const meta = DOC_TYPE_META[doc.docType];
  const isPosted = doc.status === 'POSTED';
  const hasAnyRegisters =
    data &&
    (data.stockMovements.length > 0 ||
      data.stockReservations.length > 0 ||
      data.cashMovements.length > 0);

  return (
    <OverlayDialog
      ariaLabel={`Проводки документа №${doc.docNumber}`}
      variant="drawer"
      onClose={onClose}
    >
      {(requestClose) => (
        <>
          {/* Drawer Header */}
          <div
            className="flex items-start justify-between gap-3 px-6 pt-6 pb-4"
            style={{ borderBottom: '1px solid var(--border)' }}
          >
            <div className="min-w-0">
              <div className="overline-label" style={{ color: 'var(--primary)' }}>
                {meta.short} · {fmtDate(doc.docDate)}
              </div>
              <h2
                className="mt-1 truncate font-mono font-bold"
                style={{ fontSize: '22px', color: 'var(--text)' }}
              >
                №{doc.docNumber}
              </h2>
            </div>
            <button
              type="button"
              onClick={requestClose}
              aria-label="Закрити"
              className="flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-full transition"
              style={{
                background: 'var(--surface-2)',
                border: '1px solid var(--border)',
                color: 'var(--muted)',
              }}
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>

          {/* Scrollable Body */}
          <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
            {/* Summary strip: comment, status & total */}
            <div
              className="space-y-3 p-4"
              style={{
                background: 'var(--surface-2)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--r-md)',
              }}
            >
              {doc.comment && (
                <p className="text-[13px] leading-relaxed" style={{ color: 'var(--text-2)' }}>
                  {doc.comment}
                </p>
              )}
              <div className="flex items-center justify-between gap-3">
                <span
                  className="inline-flex items-center rounded-full px-3 py-1 text-[12px] font-bold"
                  style={{
                    background: isPosted ? 'var(--pos-soft)' : 'var(--warn-soft)',
                    color: isPosted ? 'var(--pos-ink)' : 'var(--warn-ink)',
                  }}
                >
                  {isPosted ? 'Проведений' : 'Чернетка'}
                </span>
                <span
                  className="font-mono text-[20px] font-bold"
                  style={{ color: 'var(--text)' }}
                >
                  {fmtMoney(doc.totalAmount)}
                </span>
              </div>
            </div>

            {isLoading && (
              <div className="space-y-2.5">
                {[1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="h-20 animate-pulse"
                    style={{
                      background: 'var(--entry-bg)',
                      borderRadius: 'var(--r-md)',
                    }}
                  />
                ))}
              </div>
            )}

            {error && (
              <div
                className="p-3.5 text-[13px] font-medium"
                style={{
                  background: 'var(--neg-soft)',
                  color: 'var(--neg-ink)',
                  borderRadius: 'var(--r-md)',
                }}
              >
                {(error as Error).message}
              </div>
            )}

            {/* Проводки (Дт / Кт) */}
            {data && (
              <section className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <h3 className="overline-label" style={{ color: 'var(--muted)' }}>
                    Проводки Дт / Кт
                  </h3>
                  <span
                    className="font-mono text-[12px] font-semibold"
                    style={{ color: 'var(--muted)' }}
                  >
                    {data.accountingEntries.length} шт.
                  </span>
                </div>

                {!isPosted || data.accountingEntries.length === 0 ? (
                  <div
                    className="border-2 border-dashed px-4 py-8 text-center text-[13px] font-medium"
                    style={{
                      borderColor: 'var(--border-strong)',
                      borderRadius: 'var(--r-md)',
                      color: 'var(--muted)',
                      background: 'var(--surface-2)',
                    }}
                  >
                    {!isPosted
                      ? 'Чернетка ще не проведена — проводок немає'
                      : 'По цьому документу немає бухгалтерських проводок Дт/Кт (перегляньте оперативні регістри нижче)'}
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {data.accountingEntries.map((entry) => {
                      const subkonto = [
                        entry.debitSubkonto1Label,
                        entry.creditSubkonto1Label,
                      ]
                        .filter(Boolean)
                        .join(' → ');
                      return (
                        <div
                          key={entry.id}
                          className="p-3.5"
                          style={{
                            background: 'var(--entry-bg)',
                            border: '1px solid var(--border)',
                            borderRadius: 'var(--r-md)',
                          }}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span
                                className="rounded-lg px-2 py-1 font-mono text-[12px] font-bold"
                                style={{
                                  background: 'var(--primary-soft)',
                                  color: 'var(--primary-ink)',
                                }}
                              >
                                Дт {entry.debitAccountCode}
                              </span>
                              <span
                                className="rounded-lg px-2 py-1 font-mono text-[12px] font-bold"
                                style={{
                                  background: 'var(--warn-soft)',
                                  color: 'var(--warn-ink)',
                                }}
                              >
                                Кт {entry.creditAccountCode}
                              </span>
                            </div>
                            <span
                              className="font-mono text-[15px] font-bold"
                              style={{ color: 'var(--text)' }}
                            >
                              {fmtMoney(entry.amount)}
                            </span>
                          </div>
                          {(entry.description || subkonto) && (
                            <p
                              className="mt-2 text-[12px] leading-snug"
                              style={{ color: 'var(--muted)' }}
                            >
                              {entry.description || subkonto}
                              {entry.description && subkonto ? ` · ${subkonto}` : ''}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            )}

            {/* Оперативні регістри (Склад / Резерви / Кошти) */}
            {hasAnyRegisters && data && (
              <section className="space-y-2.5">
                <h3 className="overline-label" style={{ color: 'var(--muted)' }}>
                  Оперативні регістри
                </h3>

                {data.stockMovements.map((m) => (
                  <div
                    key={m.id}
                    className="flex items-center justify-between gap-3 p-3 text-[12px]"
                    style={{
                      background: 'var(--surface-2)',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--r-sm)',
                    }}
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <Layers
                        className="h-4 w-4 shrink-0"
                        style={{ color: 'var(--info-ink)' }}
                        aria-hidden="true"
                      />
                      <div className="min-w-0">
                        <div className="truncate font-bold" style={{ color: 'var(--text)' }}>
                          {m.itemName}
                        </div>
                        <div className="truncate" style={{ color: 'var(--muted)' }}>
                          {m.warehouseName}
                        </div>
                      </div>
                    </div>
                    <span
                      className="shrink-0 font-mono font-bold"
                      style={{
                        color: m.movementType === 'IN' ? 'var(--pos)' : 'var(--neg)',
                      }}
                    >
                      {Number(m.qty) > 0 ? `+${fmtQty(m.qty)}` : fmtQty(m.qty)} шт
                    </span>
                  </div>
                ))}

                {data.stockReservations.map((r) => (
                  <div
                    key={r.id}
                    className="flex items-center justify-between gap-3 p-3 text-[12px]"
                    style={{
                      background: 'var(--surface-2)',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--r-sm)',
                    }}
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <BookmarkCheck
                        className="h-4 w-4 shrink-0"
                        style={{ color: 'var(--warn-ink)' }}
                        aria-hidden="true"
                      />
                      <div className="min-w-0">
                        <div className="truncate font-bold" style={{ color: 'var(--text)' }}>
                          Резерв: {r.itemName}
                        </div>
                        <div className="truncate" style={{ color: 'var(--muted)' }}>
                          {r.warehouseName}
                        </div>
                      </div>
                    </div>
                    <span
                      className="shrink-0 font-mono font-bold"
                      style={{ color: 'var(--warn-ink)' }}
                    >
                      {Number(r.qty) > 0 ? `+${fmtQty(r.qty)}` : fmtQty(r.qty)} шт
                    </span>
                  </div>
                ))}

                {data.cashMovements.map((c) => (
                  <div
                    key={c.id}
                    className="flex items-center justify-between gap-3 p-3 text-[12px]"
                    style={{
                      background: 'var(--surface-2)',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--r-sm)',
                    }}
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <Wallet
                        className="h-4 w-4 shrink-0"
                        style={{ color: 'var(--pos)' }}
                        aria-hidden="true"
                      />
                      <div className="min-w-0">
                        <div className="truncate font-bold" style={{ color: 'var(--text)' }}>
                          {c.cashAccountName}
                        </div>
                        <div className="truncate" style={{ color: 'var(--muted)' }}>
                          {c.cashflowCategoryName || 'Рух коштів'}
                        </div>
                      </div>
                    </div>
                    <span
                      className="shrink-0 font-mono font-bold"
                      style={{
                        color: Number(c.amount) >= 0 ? 'var(--pos)' : 'var(--neg)',
                      }}
                    >
                      {Number(c.amount) >= 0 ? `+${fmtMoney(c.amount)}` : fmtMoney(c.amount)}
                    </span>
                  </div>
                ))}
              </section>
            )}
          </div>

          {/* Drawer Footer */}
          <div
            className="space-y-2.5 px-6 py-4"
            style={{
              borderTop: '1px solid var(--border)',
              background: 'var(--surface)',
            }}
          >
            {onShareDocument && (
              <button
                type="button"
                onClick={() => {
                  requestClose();
                  window.setTimeout(() => {
                    onShareDocument(doc);
                  }, 10);
                }}
                className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 px-3 text-[13px] font-bold transition"
                style={{
                  borderRadius: 'var(--r-sm)',
                  background: 'var(--pos-soft)',
                  color: 'var(--pos-ink)',
                }}
              >
                <Share2 className="h-4 w-4" aria-hidden="true" />
                Поділитися посиланням у месенджер
              </button>
            )}
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => {
                  requestClose();
                  window.setTimeout(() => {
                    onOpenDocument?.(doc);
                  }, 10);
                }}
                className="inline-flex min-h-[44px] items-center justify-center gap-2 px-3 text-[13px] font-bold transition"
                style={{
                  borderRadius: 'var(--r-sm)',
                  background: 'linear-gradient(135deg, var(--primary), var(--primary-2))',
                  color: 'var(--surface)',
                  boxShadow: 'var(--shadow-primary)',
                }}
              >
                <FileText className="h-4 w-4" aria-hidden="true" />
                Відкрити
              </button>
              <button
                type="button"
                onClick={() => {
                  requestClose();
                  window.setTimeout(() => {
                    onPrintDocument?.(doc);
                  }, 10);
                }}
                className="inline-flex min-h-[44px] items-center justify-center gap-2 px-3 text-[13px] font-bold transition"
                style={{
                  borderRadius: 'var(--r-sm)',
                  border: '1px solid var(--border-strong)',
                  background: 'var(--surface)',
                  color: 'var(--text)',
                }}
              >
                <Printer className="h-4 w-4" aria-hidden="true" />
                Друк / PDF
              </button>
            </div>
          </div>
        </>
      )}
    </OverlayDialog>
  );
}
