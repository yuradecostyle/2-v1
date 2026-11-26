import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Plus,
  CheckCircle2,
  RotateCcw,
  Database,
  Pencil,
  Trash2,
  Clock,
  AlertCircle,
  Truck,
  Receipt,
  ExternalLink,
  Printer,
  FileCode2,
  GitBranch,
  Share2,
} from 'lucide-react';
import {
  apiFetch,
  canAccessDocType,
  downloadTextFile,
  DOC_TYPE_META,
  fmtDate,
  fmtMoney,
  ORDER_STATUS_META,
  type BootstrapData,
  type DocumentSummary,
  type DocumentType,
} from '../lib/api';
import { DocumentEditorModal } from '../components/DocumentEditorModal';
import { PrintableDocumentModal } from '../components/PrintableDocumentModal';
import { ShareDocumentModal } from '../components/ShareDocumentModal';

const CREATE_BUTTONS: Array<{ type: DocumentType; label: string }> = [
  { type: 'customer_order', label: 'Замовлення (Резерв)' },
  { type: 'goods_receipt', label: 'Прихід товару' },
  { type: 'sales_invoice', label: 'Продаж (Видаткова)' },
  { type: 'tax_invoice', label: 'Податкова (ПДВ)' },
  { type: 'production_order', label: 'Виробництво (BOM)' },
  { type: 'payroll_sheet', label: 'Зарплата (Відомість)' },
  { type: 'stock_transfer', label: 'Переміщення' },
  { type: 'inventory_count', label: 'Інвентаризація' },
  { type: 'money_in', label: 'Оплата (Вхід)' },
  { type: 'money_out', label: 'Виплата / Витрата' },
  { type: 'price_setting', label: 'Прайс' },
  { type: 'manual_journal', label: 'Операція Дт/Кт' },
  { type: 'opening_balance', label: 'Поч. залишки' },
];

export function DocumentsPage({
  bootstrap,
  onOpenMovements,
  initialDocType = '',
}: {
  bootstrap: BootstrapData;
  onOpenMovements: (doc: DocumentSummary) => void;
  initialDocType?: string;
}) {
  const qc = useQueryClient();
  const [filterType, setFilterType] = useState<string>(initialDocType);
  useEffect(() => {
    setFilterType(initialDocType);
  }, [initialDocType]);
  const [orgScope, setOrgScope] = useState<'current' | 'all'>('current');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'POSTED' | 'DRAFT'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [editorState, setEditorState] = useState<{
    open: boolean;
    docType: DocumentType;
    documentId?: string | null;
    initialTab?: 'main' | 'relations' | 'history';
  }>({ open: false, docType: 'sales_invoice', documentId: null, initialTab: 'main' });
  const [printDoc, setPrintDoc] = useState<DocumentSummary | null>(null);
  const [shareDoc, setShareDoc] = useState<DocumentSummary | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const perms = bootstrap.currentUser?.effectivePermissions;
  const visibleCreateButtons = CREATE_BUTTONS.filter((btn) => canAccessDocType(perms, btn.type));
  const visibleDocTypes = (Object.keys(DOC_TYPE_META) as DocumentType[]).filter((t) =>
    canAccessDocType(perms, t)
  );

  const { data: rawDocs = [], isLoading } = useQuery({
    queryKey: [
      'documents',
      bootstrap.organization.id,
      bootstrap.activeDepartmentId ?? 'ALL',
      filterType,
      orgScope,
    ],
    queryFn: () => {
      const qs = new URLSearchParams();
      if (filterType) qs.set('docType', filterType);
      if (orgScope === 'all') qs.set('scope', 'all');
      const s = qs.toString();
      return apiFetch<DocumentSummary[]>(`/api/documents${s ? `?${s}` : ''}`);
    },
  });

  const q = searchQuery.trim().toLowerCase();
  const docs = rawDocs.filter((doc) => {
    if (statusFilter !== 'ALL' && doc.status !== statusFilter) return false;
    if (!q) return true;
    return (
      doc.docNumber.toLowerCase().includes(q) ||
      (doc.counterpartyName ?? '').toLowerCase().includes(q) ||
      (doc.warehouseName ?? '').toLowerCase().includes(q) ||
      (doc.comment ?? '').toLowerCase().includes(q)
    );
  });

  const refreshAll = () => {
    qc.invalidateQueries({ queryKey: ['documents'] });
    qc.invalidateQueries({ queryKey: ['dashboard'] });
    qc.invalidateQueries({ queryKey: ['trial-balance'] });
    qc.invalidateQueries({ queryKey: ['audit-logs'] });
  };

  const handlePost = async (id: string) => {
    setActionError(null);
    setActionSuccess(null);
    try {
      await apiFetch(`/api/documents/${id}/post`, { method: 'POST' });
      refreshAll();
    } catch (e) {
      setActionError((e as Error).message);
    }
  };

  const handleUnpost = async (id: string) => {
    setActionError(null);
    setActionSuccess(null);
    try {
      await apiFetch(`/api/documents/${id}/unpost`, { method: 'POST' });
      refreshAll();
    } catch (e) {
      setActionError((e as Error).message);
    }
  };

  const handleCreateInvoiceFromOrder = async (order: DocumentSummary) => {
    setActionError(null);
    setActionSuccess(null);
    try {
      const inv = await apiFetch<DocumentSummary>(
        `/api/documents/${order.id}/create-invoice-from-order`,
        {
          method: 'POST',
          body: JSON.stringify({ autoPost: true }),
        }
      );
      setActionSuccess(
        `Створено та проведено видаткову накладну №${inv.docNumber} на підставі замовлення №${order.docNumber} (резерв знято).`
      );
      refreshAll();
    } catch (e) {
      setActionError((e as Error).message);
    }
  };

  const handleCreateTaxInvoice = async (doc: DocumentSummary) => {
    setActionError(null);
    setActionSuccess(null);
    try {
      const tax = await apiFetch<DocumentSummary>(
        `/api/documents/${doc.id}/create-tax-invoice`,
        { method: 'POST' }
      );
      setActionSuccess(
        `Сформовано та проведено Податкову накладну №${tax.docNumber} (ПДВ: ${fmtMoney(
          tax.vatAmount
        )}) за першою подією!`
      );
      refreshAll();
    } catch (e) {
      setActionError((e as Error).message);
    }
  };

  const handleDownloadTaxXml = async (doc: DocumentSummary) => {
    setActionError(null);
    try {
      const res = await apiFetch<{ filename: string; xml: string }>(
        `/api/documents/${doc.id}/tax-xml`
      );
      downloadTextFile(res.filename, res.xml);
    } catch (e) {
      setActionError((e as Error).message);
    }
  };

  const handleFiscalize = async (doc: DocumentSummary) => {
    setActionError(null);
    setActionSuccess(null);
    try {
      const res = await apiFetch<{ fiscalCode: string; fiscalUrl: string }>(
        `/api/documents/${doc.id}/fiscalize`,
        {
          method: 'POST',
          body: JSON.stringify({ paymentType: 'CASHLESS' }),
        }
      );
      setActionSuccess(
        `Накладну №${doc.docNumber} успішно фіскалізовано в ПРРО Checkbox! Фіскальний номер чека ДПС: ${res.fiscalCode}`
      );
      refreshAll();
    } catch (e) {
      setActionError((e as Error).message);
    }
  };

  const handleDelete = async (doc: DocumentSummary) => {
    if (!confirm(`Видалити документ №${doc.docNumber}?`)) return;
    setActionError(null);
    try {
      await apiFetch(`/api/documents/${doc.id}`, { method: 'DELETE' });
      refreshAll();
    } catch (e) {
      setActionError((e as Error).message);
    }
  };

  return (
    <div className="space-y-5">
      {/* Панель швидкого створення документів (лише дозволені правами типи) */}
      <div className="erp-card flex flex-nowrap gap-1.5 overflow-x-auto p-3 md:flex-wrap">
        {visibleCreateButtons.map((btn) => (
          <button
            key={btn.type}
            onClick={() =>
              setEditorState({ open: true, docType: btn.type, documentId: null })
            }
            className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700"
          >
            <Plus className="h-3.5 w-3.5" /> {btn.label}
          </button>
        ))}
      </div>

      {/* Фільтри, пошук та статус */}
      <div className="erp-card flex flex-col gap-3 p-3.5 md:flex-row md:flex-wrap md:items-center md:justify-between">
        <div className="flex flex-nowrap items-center gap-1.5 overflow-x-auto pb-0.5 md:flex-wrap md:pb-0">
          <button
            onClick={() => setFilterType('')}
            className={`shrink-0 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-xs font-semibold ${
              filterType === ''
                ? 'bg-slate-900 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            Усі ({docs.length})
          </button>
          {visibleDocTypes.map((t) => (
            <button
              key={t}
              onClick={() => setFilterType(t)}
              className={`shrink-0 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-xs font-medium transition ${
                filterType === t
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'bg-white text-slate-600 border border-slate-200 hover:border-indigo-200 hover:text-indigo-700'
              }`}
            >
              {DOC_TYPE_META[t].short}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {bootstrap.organizations.length > 1 && (
            <div className="flex rounded-lg border border-indigo-200 bg-indigo-50/50 p-0.5 text-[11px]">
              <button
                onClick={() => setOrgScope('current')}
                className={`rounded-md px-2.5 py-1 font-semibold transition ${
                  orgScope === 'current'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-indigo-700 hover:bg-indigo-100/70'
                }`}
              >
                {bootstrap.organization.entityType === 'FOP' ? 'Поточний ФОП' : 'Поточна ТОВ'}
              </button>
              <button
                onClick={() => setOrgScope('all')}
                className={`rounded-md px-2.5 py-1 font-semibold transition ${
                  orgScope === 'all'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-indigo-700 hover:bg-indigo-100/70'
                }`}
              >
                Усі ({bootstrap.organizations.length})
              </button>
            </div>
          )}
          <div className="flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-[11px]">
            {(
              [
                { id: 'ALL', label: 'Всі' },
                { id: 'POSTED', label: 'Проведені' },
                { id: 'DRAFT', label: 'Чернетки' },
              ] as const
            ).map((st) => (
              <button
                key={st.id}
                onClick={() => setStatusFilter(st.id)}
                className={`rounded-md px-2.5 py-1 font-medium transition ${
                  statusFilter === st.id
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                {st.label}
              </button>
            ))}
          </div>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Пошук №, контрагента, примітки..."
            className="w-56 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs focus:border-indigo-400 focus:bg-white focus:outline-none"
          />
        </div>
      </div>

      {actionSuccess && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
          <span>{actionSuccess}</span>
        </div>
      )}

      {actionError && (
        <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
          <span>{actionError}</span>
        </div>
      )}

      {/* Мобільні картки документів (<= 768px) */}
      <div className="space-y-3 md:hidden">
        {isLoading && (
          <div className="erp-card py-8 text-center text-xs text-slate-400">
            Завантаження журналу...
          </div>
        )}
        {!isLoading && docs.length === 0 && (
          <div className="erp-card py-8 text-center text-xs text-slate-400">
            Документів за цим фільтром ще немає
          </div>
        )}
        {docs.map((doc) => {
          const meta = DOC_TYPE_META[doc.docType];
          const isPosted = doc.status === 'POSTED';
          return (
            <div key={doc.id} className="erp-card space-y-3 p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className={`rounded border px-1.5 py-0.5 text-[11px] font-semibold ${meta.color}`}>
                      {meta.short}
                    </span>
                    <span className="font-mono text-sm font-bold text-slate-900">
                      №{doc.docNumber}
                    </span>
                  </div>
                  <div className="mt-1 text-xs font-semibold text-slate-800">
                    {doc.counterpartyName || doc.cashAccountName || doc.priceTypeName || '—'}
                  </div>
                  <div className="mt-0.5 font-mono text-[11px] text-slate-500">
                    {fmtDate(doc.docDate)}
                    {orgScope === 'all' && doc.organizationName ? ` · ${doc.organizationName}` : ''}
                  </div>
                </div>

                <div className="text-right">
                  <div className="font-mono text-base font-bold text-slate-900">
                    {fmtMoney(doc.totalAmount)}
                  </div>
                  <span
                    className={`mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                      isPosted
                        ? 'bg-emerald-50 text-emerald-700'
                        : 'bg-amber-50 text-amber-700'
                    }`}
                  >
                    {isPosted ? 'Проведений' : 'Чернетка'}
                  </span>
                </div>
              </div>

              {doc.comment && (
                <div className="truncate text-xs text-slate-500">{doc.comment}</div>
              )}

              <div className="grid grid-cols-4 gap-1.5 border-t border-slate-100 pt-2.5">
                <button
                  type="button"
                  onClick={() => setShareDoc(doc)}
                  className="inline-flex min-h-[40px] items-center justify-center gap-1 rounded-xl bg-emerald-50 px-2 text-[11px] font-bold text-emerald-700"
                >
                  <Share2 className="h-3.5 w-3.5" /> Лінк
                </button>
                <button
                  type="button"
                  onClick={() => onOpenMovements(doc)}
                  className="inline-flex min-h-[40px] items-center justify-center gap-1 rounded-xl bg-indigo-50 px-2 text-[11px] font-bold text-indigo-700"
                >
                  <Database className="h-3.5 w-3.5" /> Дт/Кт
                </button>
                <button
                  type="button"
                  onClick={() => setPrintDoc(doc)}
                  className="inline-flex min-h-[40px] items-center justify-center gap-1 rounded-xl bg-slate-100 px-2 text-[11px] font-bold text-slate-700"
                >
                  <Printer className="h-3.5 w-3.5" /> PDF
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setEditorState({
                      open: true,
                      docType: doc.docType,
                      documentId: doc.id,
                      initialTab: 'main',
                    })
                  }
                  className="inline-flex min-h-[40px] items-center justify-center gap-1 rounded-xl bg-slate-900 px-2 text-[11px] font-bold text-white"
                >
                  <Pencil className="h-3.5 w-3.5" /> Відкр.
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Таблиця документів (Десктоп >= 768px) */}
      <div className="hidden overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs md:block">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
              <tr>
                <th className="px-4 py-3">Статус</th>
                <th className="px-4 py-3">Дата</th>
                <th className="px-4 py-3">Номер / Тип</th>
                <th className="px-4 py-3">Контрагент / Рахунок</th>
                <th className="px-4 py-3">Склад / Фіскалізація ПРРО</th>
                <th className="px-4 py-3 text-right">Сума</th>
                <th className="px-4 py-3 text-right">Дії</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                    Завантаження журналу...
                  </td>
                </tr>
              )}
              {!isLoading && docs.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                    Документів за цим фільтром ще немає
                  </td>
                </tr>
              )}
              {docs.map((doc) => {
                const meta = DOC_TYPE_META[doc.docType];
                return (
                  <tr key={doc.id} className="hover:bg-slate-50/80">
                    <td className="px-4 py-3">
                      {doc.status === 'POSTED' ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700">
                          <CheckCircle2 className="h-3 w-3" /> Проведений
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-medium text-slate-600">
                          <Clock className="h-3 w-3" /> Чернетка
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-slate-600 tabular-nums">
                      {fmtDate(doc.docDate)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span
                          className={`rounded border px-1.5 py-0.5 text-[11px] font-medium ${meta.color}`}
                        >
                          {meta.short}
                        </span>
                        <span className="font-mono font-semibold text-slate-900">
                          {doc.docNumber}
                        </span>
                      </div>
                      {doc.parentDocNumber && (
                        <div className="mt-0.5 text-[11px] text-cyan-700">
                          Підстава: №{doc.parentDocNumber}
                        </div>
                      )}
                      {doc.departmentName && (
                        <div className="mt-0.5">
                          <span className="inline-flex items-center rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
                            {doc.departmentName}
                          </span>
                        </div>
                      )}
                      {orgScope === 'all' && doc.organizationName && (
                        <div className="mt-0.5">
                          <span
                            className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                              doc.organizationEntityType === 'FOP'
                                ? 'bg-emerald-50 text-emerald-700'
                                : 'bg-indigo-50 text-indigo-700'
                            }`}
                          >
                            {doc.organizationName}
                          </span>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-800">
                        {doc.counterpartyName || doc.cashAccountName || doc.priceTypeName || '—'}
                      </div>
                      {doc.cashflowCategoryName && (
                        <div className="text-[11px] text-slate-400">{doc.cashflowCategoryName}</div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-slate-700">
                        {doc.warehouseName}
                        {doc.targetWarehouseName && doc.targetWarehouseName !== doc.warehouseName
                          ? ` → ${doc.targetWarehouseName}`
                          : ''}
                      </div>
                      {doc.fiscalCode && (
                        <a
                          href={doc.fiscalUrl || '#'}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-0.5 inline-flex items-center gap-1 rounded bg-emerald-50 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-emerald-700 hover:underline"
                        >
                          <Receipt className="h-2.5 w-2.5" /> Чек ДПС №{doc.fiscalCode}
                          <ExternalLink className="h-2.5 w-2.5" />
                        </a>
                      )}
                      {doc.comment && (
                        <div className="max-w-xs truncate text-[11px] text-slate-400">
                          {doc.comment}
                        </div>
                      )}
                      {(doc.meta?.orderStatus || doc.meta?.isBackorder || doc.meta?.allowNegativeStock) && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {doc.docType === 'customer_order' && doc.meta?.orderStatus && ORDER_STATUS_META[doc.meta.orderStatus] && (
                            <span
                              className="rounded-full px-2 py-0.5 text-[10px] font-bold"
                              style={{
                                background: ORDER_STATUS_META[doc.meta.orderStatus].bgVar,
                                color: ORDER_STATUS_META[doc.meta.orderStatus].inkVar,
                              }}
                            >
                              {ORDER_STATUS_META[doc.meta.orderStatus].label}
                            </span>
                          )}
                          {(doc.meta?.isBackorder || doc.meta?.allowNegativeStock) && (
                            <span
                              className="rounded-full px-2 py-0.5 text-[10px] font-bold"
                              style={{ background: 'var(--warn-soft)', color: 'var(--warn-ink)' }}
                            >
                              Під замовлення
                            </span>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-semibold tabular-nums text-slate-900">
                      <div>{fmtMoney(doc.totalAmount)}</div>
                      {Number(doc.discountTotal ?? 0) > 0 && (
                        <div className="text-[10px] font-semibold" style={{ color: 'var(--neg-ink)' }}>
                          Знижка: −{fmtMoney(doc.discountTotal)}
                        </div>
                      )}
                      {doc.docType === 'tax_invoice' && Number(doc.vatAmount ?? 0) > 0 && (
                        <div className="text-[10px] text-sky-700">
                          ПДВ: {fmtMoney(doc.vatAmount)}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        {doc.docType === 'customer_order' && doc.status === 'POSTED' && (
                          <button
                            title="Створити та провести Видаткову накладну на підставі замовлення"
                            onClick={() => handleCreateInvoiceFromOrder(doc)}
                            className="inline-flex items-center gap-1 rounded-lg border border-cyan-200 bg-cyan-50 px-2 py-1 text-[11px] font-medium text-cyan-800 hover:bg-cyan-100"
                          >
                            <Truck className="h-3 w-3" /> Відвантажити
                          </button>
                        )}
                        {doc.docType === 'sales_invoice' && doc.status === 'POSTED' && (
                          <>
                            {!doc.fiscalCode && (
                              <button
                                title="Фіскалізувати чек у ПРРО Checkbox"
                                onClick={() => handleFiscalize(doc)}
                                className="inline-flex items-center gap-1 rounded-lg border border-teal-200 bg-teal-50 px-2 py-1 text-[11px] font-medium text-teal-800 hover:bg-teal-100"
                              >
                                <Receipt className="h-3 w-3" /> ПРРО
                              </button>
                            )}
                            <button
                              title="Сформувати Податкову накладну ПДВ"
                              onClick={() => handleCreateTaxInvoice(doc)}
                              className="inline-flex items-center gap-1 rounded-lg border border-sky-200 bg-sky-50 px-2 py-1 text-[11px] font-medium text-sky-800 hover:bg-sky-100"
                            >
                              + ПН
                            </button>
                          </>
                        )}
                        {doc.docType === 'tax_invoice' && (
                          <button
                            title="Завантажити XML J1201015 (ЄРПН ДПС)"
                            onClick={() => handleDownloadTaxXml(doc)}
                            className="inline-flex items-center gap-1 rounded-lg border border-sky-200 bg-sky-50 px-2 py-1 text-[11px] font-medium text-sky-800 hover:bg-sky-100"
                          >
                            <FileCode2 className="h-3 w-3" /> XML
                          </button>
                        )}
                        {doc.status === 'POSTED' ? (
                          <button
                            title="Скасувати проведення"
                            onClick={() => handleUnpost(doc.id)}
                            className="rounded-lg border border-amber-200 bg-amber-50 p-1.5 text-amber-700 hover:bg-amber-100"
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
                          </button>
                        ) : (
                          <button
                            title="Провести документ"
                            onClick={() => handlePost(doc.id)}
                            className="rounded-lg border border-emerald-200 bg-emerald-50 p-1.5 text-emerald-700 hover:bg-emerald-100"
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                        <button
                          title="Поділитися відкритим посиланням у месенджер (Telegram / Viber / WhatsApp)"
                          onClick={() => setShareDoc(doc)}
                          className="rounded-lg border border-emerald-200 bg-emerald-50 p-1.5 text-emerald-700 hover:bg-emerald-100"
                        >
                          <Share2 className="h-3.5 w-3.5" />
                        </button>
                        <button
                          title="Друкована форма (Рахунок / Накладна / Акт / PDF)"
                          onClick={() => setPrintDoc(doc)}
                          className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-600 hover:bg-slate-100"
                        >
                          <Printer className="h-3.5 w-3.5" />
                        </button>
                        <button
                          title="Зв’язки, Створити на підставі та Історія документа"
                          onClick={() =>
                            setEditorState({
                              open: true,
                              docType: doc.docType,
                              documentId: doc.id,
                              initialTab: 'relations',
                            })
                          }
                          className="rounded-lg border border-cyan-200 bg-cyan-50 p-1.5 text-cyan-700 hover:bg-cyan-100"
                        >
                          <GitBranch className="h-3.5 w-3.5" />
                        </button>
                        <button
                          title="Проводки Дт/Кт та Рухи по регістрах"
                          onClick={() => onOpenMovements(doc)}
                          className="rounded-lg border border-indigo-200 bg-indigo-50 p-1.5 text-indigo-700 hover:bg-indigo-100"
                        >
                          <Database className="h-3.5 w-3.5" />
                        </button>
                        <button
                          title="Редагувати"
                          onClick={() =>
                            setEditorState({
                              open: true,
                              docType: doc.docType,
                              documentId: doc.id,
                              initialTab: 'main',
                            })
                          }
                          className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-600 hover:bg-slate-100"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          title="Видалити"
                          onClick={() => handleDelete(doc)}
                          className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-500 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {editorState.open && (
        <DocumentEditorModal
          key={`${editorState.documentId ?? 'new'}-${editorState.docType}-${editorState.initialTab ?? 'main'}`}
          bootstrap={bootstrap}
          docType={editorState.docType}
          documentId={editorState.documentId}
          initialTab={editorState.initialTab}
          onClose={() => setEditorState((s) => ({ ...s, open: false }))}
          onSaved={refreshAll}
        />
      )}

      {printDoc && (
        <PrintableDocumentModal doc={printDoc} onClose={() => setPrintDoc(null)} />
      )}

      {shareDoc && (
        <ShareDocumentModal
          documentId={shareDoc.id}
          docNumber={shareDoc.docNumber}
          onClose={() => setShareDoc(null)}
        />
      )}
    </div>
  );
}
