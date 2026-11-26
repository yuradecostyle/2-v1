import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  X,
  Printer,
  FileCode2,
  SlidersHorizontal,
  PencilLine,
  Save,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import {
  apiFetch,
  downloadTextFile,
  fmtDate,
  fmtMoney,
  fmtQty,
  type DocumentSummary,
  type DocumentType,
  type PrintTemplateDto,
} from '../lib/api';

interface PrintableResponse {
  document: DocumentSummary;
  organization: {
    name: string;
    edrpou: string;
    ipn?: string;
    iban: string;
    bankName: string;
    address?: string;
    directorName?: string;
    isVatPayer: boolean;
  };
  counterparty: {
    name: string;
    edrpou: string;
    ipn?: string;
    iban?: string;
    phone: string;
  } | null;
  warehouseName: string;
  targetWarehouseName: string;
  cashAccount?: {
    id: string;
    name: string;
    accountType: string;
    iban: string;
    currency: string;
  } | null;
  cashflowCategoryName?: string;
  templates: PrintTemplateDto[];
  totals: {
    subtotalBeforeDiscount: string;
    discountTotal: string;
    hasDiscount: boolean;
    netAmount: string;
    vatRate: number;
    vatAmount: string;
    grossAmount: string;
    amountInWords: string;
  };
  lines: Array<{
    id: string;
    lineNo: number;
    lineRole: string;
    itemSku: string;
    itemName: string;
    unit: string;
    bookQty: string;
    qty: string;
    diffQty: string;
    price: string;
    grossLineAmount: string;
    discountPercent: string;
    discountAmount: string;
    amount: string;
    costAmount: string;
    taxAmount: string;
    employeePosition?: string;
    employeeRnokpp?: string;
    notes: string;
  }>;
}

function defaultTemplateKeyForDocType(docType: DocumentType): string {
  switch (docType) {
    case 'customer_order':
      return 'invoice_payment';
    case 'sales_invoice':
      return 'sales_waybill';
    case 'goods_receipt':
      return 'goods_receipt_m4';
    case 'money_in':
      return 'pko_cash_in';
    case 'money_out':
      return 'vko_cash_out';
    case 'inventory_count':
      return 'inventory_inv1';
    case 'payroll_sheet':
      return 'payroll_p6';
    case 'tax_invoice':
      return 'tax_invoice_ua';
    default:
      return 'sales_waybill';
  }
}

function quickKeysForDocType(docType: DocumentType): string[] {
  switch (docType) {
    case 'sales_invoice':
      return ['sales_waybill', 'invoice_payment', 'work_act', 'ttn_waybill', 'tax_invoice_ua'];
    case 'customer_order':
      return ['invoice_payment', 'sales_waybill', 'work_act'];
    case 'goods_receipt':
      return ['goods_receipt_m4', 'ttn_waybill'];
    case 'money_in':
      return ['pko_cash_in', 'invoice_payment'];
    case 'money_out':
      return ['vko_cash_out'];
    case 'inventory_count':
      return ['inventory_inv1'];
    case 'payroll_sheet':
      return ['payroll_p6'];
    case 'tax_invoice':
      return ['tax_invoice_ua', 'sales_waybill'];
    default:
      return ['sales_waybill', 'invoice_payment', 'work_act'];
  }
}

const SHORT_TAB_LABELS: Record<string, string> = {
  invoice_payment: 'Рахунок',
  sales_waybill: 'Видаткова М-11',
  work_act: 'Акт робіт/послуг',
  ttn_waybill: 'ТТН (1-ТН)',
  pko_cash_in: 'ПКО (КО-1)',
  vko_cash_out: 'ВКО (КО-2)',
  goods_receipt_m4: 'Прибуткова М-4',
  inventory_inv1: 'Інв. опис №572',
  payroll_p6: 'Відомість П-6',
  tax_invoice_ua: 'Податкова ПН',
};

function interpolateTemplate(text: string, data: PrintableResponse): string {
  if (!text) return '';
  const vars: Record<string, string> = {
    docNumber: data.document.docNumber,
    docDate: fmtDate(data.document.docDate),
    orgName: data.organization.name,
    orgAddress: data.organization.address || 'Україна',
    orgIpn: data.organization.ipn || data.organization.edrpou || '—',
    counterpartyName: data.counterparty?.name || 'Кінцевий покупець',
    warehouseName: data.warehouseName || 'Основний склад',
    comment: data.document.comment || data.cashflowCategoryName || 'Основна господарська операція',
    totalWords: data.totals.amountInWords,
  };
  return text.replace(/\{\{(\w+)\}\}/g, (_, k: string) => vars[k] ?? '');
}

export function PrintableDocumentModal({
  doc,
  onClose,
}: {
  doc: DocumentSummary;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [selectedKey, setSelectedKey] = useState<string>(() =>
    defaultTemplateKeyForDocType(doc.docType)
  );
  const [directEditMode, setDirectEditMode] = useState(false);
  const [templateEditorOpen, setTemplateEditorOpen] = useState(false);
  const [draftTemplate, setDraftTemplate] = useState<PrintTemplateDto | null>(null);
  const [savingTpl, setSavingTpl] = useState(false);
  const [tplStatus, setTplStatus] = useState<string | null>(null);
  const [tplError, setTplError] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['doc-print', doc.id],
    queryFn: () => apiFetch<PrintableResponse>(`/api/documents/${doc.id}/print`),
  });

  const activeTemplate = useMemo<PrintTemplateDto | null>(() => {
    if (!data?.templates?.length) return null;
    if (draftTemplate && draftTemplate.templateKey === selectedKey) {
      return draftTemplate;
    }
    return (
      data.templates.find((t) => t.templateKey === selectedKey) ??
      data.templates.find((t) => t.templateKey === defaultTemplateKeyForDocType(doc.docType)) ??
      data.templates[0]
    );
  }, [data?.templates, selectedKey, draftTemplate, doc.docType]);

  useEffect(() => {
    if (!data?.templates?.length) return;
    const found = data.templates.find((t) => t.templateKey === selectedKey);
    if (found) {
      setDraftTemplate({ ...found });
    }
  }, [data?.templates, selectedKey]);

  const handleDownloadTaxXml = async () => {
    const res = await apiFetch<{ filename: string; xml: string }>(
      `/api/documents/${doc.id}/tax-xml`
    );
    downloadTextFile(res.filename, res.xml);
  };

  const handleSaveTemplate = async () => {
    if (!draftTemplate) return;
    setSavingTpl(true);
    setTplStatus(null);
    setTplError(null);
    try {
      const saved = await apiFetch<PrintTemplateDto>(
        `/api/print-templates/${encodeURIComponent(draftTemplate.templateKey)}`,
        {
          method: 'PUT',
          body: JSON.stringify({
            docType: draftTemplate.docType,
            name: draftTemplate.name,
            standardCode: draftTemplate.standardCode,
            titleText: draftTemplate.titleText,
            subtitleText: draftTemplate.subtitleText,
            headerNote: draftTemplate.headerNote,
            footerNote: draftTemplate.footerNote,
            signLeftLabel: draftTemplate.signLeftLabel,
            signRightLabel: draftTemplate.signRightLabel,
            showDiscountColumn: draftTemplate.showDiscountColumn,
            showVatBlock: draftTemplate.showVatBlock,
            showIbanBlock: draftTemplate.showIbanBlock,
            showStampArea: draftTemplate.showStampArea,
            showSkuColumn: draftTemplate.showSkuColumn,
          }),
        }
      );
      setDraftTemplate(saved);
      setTplStatus(`Шаблон «${saved.name}» збережено в базі компанії!`);
      qc.invalidateQueries({ queryKey: ['doc-print', doc.id] });
      qc.invalidateQueries({ queryKey: ['print-templates'] });
    } catch (e) {
      setTplError((e as Error).message);
    } finally {
      setSavingTpl(false);
    }
  };

  const handleResetTemplate = async () => {
    if (!draftTemplate) return;
    setSavingTpl(true);
    setTplStatus(null);
    setTplError(null);
    try {
      const reset = await apiFetch<PrintTemplateDto>(
        `/api/print-templates/${encodeURIComponent(draftTemplate.templateKey)}/reset`,
        { method: 'POST' }
      );
      setDraftTemplate(reset);
      setTplStatus('Шаблон відновлено за українським бухгалтерським стандартом.');
      qc.invalidateQueries({ queryKey: ['doc-print', doc.id] });
      qc.invalidateQueries({ queryKey: ['print-templates'] });
    } catch (e) {
      setTplError((e as Error).message);
    } finally {
      setSavingTpl(false);
    }
  };

  const quickKeys = quickKeysForDocType(doc.docType);
  const showDiscountCol = Boolean(
    activeTemplate?.showDiscountColumn &&
      (data?.totals.hasDiscount ||
        doc.docType === 'customer_order' ||
        doc.docType === 'sales_invoice')
  );
  const isPko = selectedKey === 'pko_cash_in';
  const isVko = selectedKey === 'vko_cash_out';
  const isInventoryForm = selectedKey === 'inventory_inv1' || doc.docType === 'inventory_count';
  const isPayrollForm = selectedKey === 'payroll_p6' || doc.docType === 'payroll_sheet';
  const isCashOrderForm = isPko || isVko;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-3 backdrop-blur-xs sm:p-4 print:static print:bg-white print:p-0">
      <div
        className="flex max-h-[94vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl shadow-2xl print:max-h-none print:rounded-none print:shadow-none"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
      >
        {/* Top Toolbar (non-printed) */}
        <div
          className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 print:hidden"
          style={{
            background: 'var(--surface-2)',
            borderBottom: '1px solid var(--border)',
          }}
        >
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-xs font-bold" style={{ color: 'var(--text-2)' }}>
              Бланк UA:
            </span>
            {quickKeys.map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => {
                  setSelectedKey(k);
                  setTplStatus(null);
                  setTplError(null);
                }}
                className="rounded-lg px-2.5 py-1.5 text-xs font-bold transition"
                style={{
                  background: selectedKey === k ? 'var(--primary)' : 'var(--surface)',
                  color: selectedKey === k ? 'var(--surface)' : 'var(--text-2)',
                  border: '1px solid var(--border-strong)',
                }}
              >
                {SHORT_TAB_LABELS[k] ?? k}
              </button>
            ))}

            {data?.templates && data.templates.length > 0 && (
              <select
                value={selectedKey}
                onChange={(e) => {
                  setSelectedKey(e.target.value);
                  setTplStatus(null);
                  setTplError(null);
                }}
                aria-label="Обрати будь-яку українську стандартну форму"
                className="rounded-lg px-2.5 py-1.5 text-xs font-semibold"
                style={{
                  background: 'var(--surface)',
                  color: 'var(--text)',
                  border: '1px solid var(--border-strong)',
                }}
              >
                <optgroup label="Усі 10 стандартних українських форм">
                  {data.templates.map((t) => (
                    <option key={t.templateKey} value={t.templateKey}>
                      {t.name}
                    </option>
                  ))}
                </optgroup>
              </select>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setDirectEditMode((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition"
              style={{
                background: directEditMode ? 'var(--warn-soft)' : 'var(--surface)',
                color: directEditMode ? 'var(--warn-ink)' : 'var(--text-2)',
                border: directEditMode
                  ? '1px solid var(--warn)'
                  : '1px solid var(--border-strong)',
              }}
            >
              <PencilLine className="h-3.5 w-3.5" />
              {directEditMode ? 'Правка тексту: УВІМК' : 'Редагувати текст'}
            </button>

            <button
              type="button"
              onClick={() => setTemplateEditorOpen((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition"
              style={{
                background: templateEditorOpen ? 'var(--primary-soft)' : 'var(--surface)',
                color: templateEditorOpen ? 'var(--primary-ink)' : 'var(--text-2)',
                border: templateEditorOpen
                  ? '1px solid var(--primary)'
                  : '1px solid var(--border-strong)',
              }}
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              Шаблон форми
            </button>

            {(doc.docType === 'tax_invoice' || doc.docType === 'sales_invoice') && (
              <button
                type="button"
                onClick={handleDownloadTaxXml}
                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold"
                style={{
                  background: 'var(--info-soft)',
                  color: 'var(--info-ink)',
                }}
              >
                <FileCode2 className="h-3.5 w-3.5" /> XML ЄРПН
              </button>
            )}

            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-extrabold transition"
              style={{
                background: 'linear-gradient(135deg, var(--primary), var(--primary-2))',
                color: 'var(--surface)',
              }}
            >
              <Printer className="h-3.5 w-3.5" /> Друкувати / PDF
            </button>

            <button
              type="button"
              onClick={onClose}
              aria-label="Закрити"
              className="rounded-lg p-1.5"
              style={{ color: 'var(--muted)' }}
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Direct-edit hint strip */}
        {directEditMode && (
          <div
            className="flex items-center justify-between gap-2 px-5 py-2 text-xs font-semibold print:hidden"
            style={{
              background: 'var(--warn-soft)',
              color: 'var(--warn-ink)',
              borderBottom: '1px solid var(--border)',
            }}
          >
            <span>
              Режим вільного редагування бланка активний: клікніть будь-який текст, реквізит, авто
              чи підпис прямо на аркуші, щоб підправити його перед друком або збереженням у PDF.
            </span>
            <button
              type="button"
              onClick={() => setDirectEditMode(false)}
              className="shrink-0 rounded-md px-2.5 py-1 text-[11px] font-bold"
              style={{ background: 'var(--surface)', color: 'var(--text)' }}
            >
              Готово
            </button>
          </div>
        )}

        {/* Body: Split (Optional Template Editor + Printable Sheet) */}
        <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
          {/* Collapsible Template Editor Sidebar */}
          {templateEditorOpen && draftTemplate && (
            <aside
              className="w-full shrink-0 overflow-y-auto p-4 lg:w-[340px] print:hidden"
              style={{
                background: 'var(--surface-2)',
                borderRight: '1px solid var(--border)',
              }}
            >
              <div className="space-y-3">
                <div>
                  <div className="overline-label" style={{ color: 'var(--primary)' }}>
                    Конструктор друкованої форми
                  </div>
                  <div className="mt-0.5 text-sm font-extrabold" style={{ color: 'var(--text)' }}>
                    {draftTemplate.name}
                  </div>
                  <p className="mt-1 text-[11px]" style={{ color: 'var(--muted)' }}>
                    Доступні змінні: <code className="font-mono">{'{{docNumber}}'}</code>,{' '}
                    <code className="font-mono">{'{{docDate}}'}</code>,{' '}
                    <code className="font-mono">{'{{orgName}}'}</code>,{' '}
                    <code className="font-mono">{'{{counterpartyName}}'}</code>,{' '}
                    <code className="font-mono">{'{{warehouseName}}'}</code>,{' '}
                    <code className="font-mono">{'{{totalWords}}'}</code>
                  </p>
                </div>

                {tplStatus && (
                  <div
                    className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold"
                    style={{ background: 'var(--pos-soft)', color: 'var(--pos-ink)' }}
                  >
                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                    <span>{tplStatus}</span>
                  </div>
                )}
                {tplError && (
                  <div
                    className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold"
                    style={{ background: 'var(--neg-soft)', color: 'var(--neg-ink)' }}
                  >
                    <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                    <span>{tplError}</span>
                  </div>
                )}

                <div className="space-y-2.5 text-xs">
                  <label className="block">
                    <span className="mb-1 block font-bold" style={{ color: 'var(--text-2)' }}>
                      Назва форми
                    </span>
                    <input
                      type="text"
                      value={draftTemplate.name}
                      onChange={(e) =>
                        setDraftTemplate((s) => (s ? { ...s, name: e.target.value } : s))
                      }
                      className="w-full rounded-lg border px-2.5 py-1.5 text-xs"
                      style={{
                        borderColor: 'var(--border-strong)',
                        background: 'var(--surface)',
                        color: 'var(--text)',
                      }}
                    />
                  </label>

                  <label className="block">
                    <span className="mb-1 block font-bold" style={{ color: 'var(--text-2)' }}>
                      Нормативний стандарт (гриф)
                    </span>
                    <input
                      type="text"
                      value={draftTemplate.standardCode}
                      onChange={(e) =>
                        setDraftTemplate((s) => (s ? { ...s, standardCode: e.target.value } : s))
                      }
                      className="w-full rounded-lg border px-2.5 py-1.5 text-xs"
                      style={{
                        borderColor: 'var(--border-strong)',
                        background: 'var(--surface)',
                        color: 'var(--text)',
                      }}
                    />
                  </label>

                  <label className="block">
                    <span className="mb-1 block font-bold" style={{ color: 'var(--text-2)' }}>
                      Заголовок документа
                    </span>
                    <input
                      type="text"
                      value={draftTemplate.titleText}
                      onChange={(e) =>
                        setDraftTemplate((s) => (s ? { ...s, titleText: e.target.value } : s))
                      }
                      className="w-full rounded-lg border px-2.5 py-1.5 text-xs"
                      style={{
                        borderColor: 'var(--border-strong)',
                        background: 'var(--surface)',
                        color: 'var(--text)',
                      }}
                    />
                  </label>

                  <label className="block">
                    <span className="mb-1 block font-bold" style={{ color: 'var(--text-2)' }}>
                      Підзаголовок / реквізити (ТТН / підстава)
                    </span>
                    <input
                      type="text"
                      value={draftTemplate.subtitleText}
                      onChange={(e) =>
                        setDraftTemplate((s) => (s ? { ...s, subtitleText: e.target.value } : s))
                      }
                      className="w-full rounded-lg border px-2.5 py-1.5 text-xs"
                      style={{
                        borderColor: 'var(--border-strong)',
                        background: 'var(--surface)',
                        color: 'var(--text)',
                      }}
                    />
                  </label>

                  <label className="block">
                    <span className="mb-1 block font-bold" style={{ color: 'var(--text-2)' }}>
                      Текст шапки (над таблицею)
                    </span>
                    <textarea
                      rows={2}
                      value={draftTemplate.headerNote}
                      onChange={(e) =>
                        setDraftTemplate((s) => (s ? { ...s, headerNote: e.target.value } : s))
                      }
                      className="w-full rounded-lg border px-2.5 py-1.5 text-xs"
                      style={{
                        borderColor: 'var(--border-strong)',
                        background: 'var(--surface)',
                        color: 'var(--text)',
                      }}
                    />
                  </label>

                  <label className="block">
                    <span className="mb-1 block font-bold" style={{ color: 'var(--text-2)' }}>
                      Примітка / Квитанція (під таблицею)
                    </span>
                    <textarea
                      rows={3}
                      value={draftTemplate.footerNote}
                      onChange={(e) =>
                        setDraftTemplate((s) => (s ? { ...s, footerNote: e.target.value } : s))
                      }
                      className="w-full rounded-lg border px-2.5 py-1.5 text-xs"
                      style={{
                        borderColor: 'var(--border-strong)',
                        background: 'var(--surface)',
                        color: 'var(--text)',
                      }}
                    />
                  </label>

                  <div className="grid grid-cols-2 gap-2">
                    <label className="block">
                      <span className="mb-1 block font-bold" style={{ color: 'var(--text-2)' }}>
                        Лівий підпис
                      </span>
                      <input
                        type="text"
                        value={draftTemplate.signLeftLabel}
                        onChange={(e) =>
                          setDraftTemplate((s) =>
                            s ? { ...s, signLeftLabel: e.target.value } : s
                          )
                        }
                        className="w-full rounded-lg border px-2 py-1.5 text-xs"
                        style={{
                          borderColor: 'var(--border-strong)',
                          background: 'var(--surface)',
                          color: 'var(--text)',
                        }}
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1 block font-bold" style={{ color: 'var(--text-2)' }}>
                        Правий підпис
                      </span>
                      <input
                        type="text"
                        value={draftTemplate.signRightLabel}
                        onChange={(e) =>
                          setDraftTemplate((s) =>
                            s ? { ...s, signRightLabel: e.target.value } : s
                          )
                        }
                        className="w-full rounded-lg border px-2 py-1.5 text-xs"
                        style={{
                          borderColor: 'var(--border-strong)',
                          background: 'var(--surface)',
                          color: 'var(--text)',
                        }}
                      />
                    </label>
                  </div>

                  {/* Display Toggles */}
                  <div
                    className="space-y-1.5 rounded-xl p-3"
                    style={{
                      background: 'var(--surface)',
                      border: '1px solid var(--border)',
                    }}
                  >
                    <div className="text-[11px] font-bold uppercase" style={{ color: 'var(--muted)' }}>
                      Елементи бланка
                    </div>
                    {(
                      [
                        ['showDiscountColumn', 'Показувати колонку «Знижка»'],
                        ['showSkuColumn', 'Показувати колонку «Артикул»'],
                        ['showVatBlock', 'Показувати блок ПДВ'],
                        ['showIbanBlock', 'Показувати реквізити IBAN'],
                        ['showStampArea', 'Показувати місце для печатки (М.П.)'],
                      ] as const
                    ).map(([field, label]) => (
                      <label key={field} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={Boolean(draftTemplate[field])}
                          onChange={(e) =>
                            setDraftTemplate((s) =>
                              s ? { ...s, [field]: e.target.checked } : s
                            )
                          }
                        />
                        <span style={{ color: 'var(--text)' }}>{label}</span>
                      </label>
                    ))}
                  </div>

                  <div className="flex flex-col gap-2 pt-1">
                    <button
                      type="button"
                      disabled={savingTpl}
                      onClick={handleSaveTemplate}
                      className="inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-extrabold transition disabled:opacity-50"
                      style={{
                        background: 'var(--primary)',
                        color: 'var(--surface)',
                      }}
                    >
                      <Save className="h-3.5 w-3.5" />
                      Зберегти зміни шаблону
                    </button>
                    <button
                      type="button"
                      disabled={savingTpl}
                      onClick={handleResetTemplate}
                      className="inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold transition disabled:opacity-50"
                      style={{
                        background: 'var(--surface)',
                        color: 'var(--text-2)',
                        border: '1px solid var(--border-strong)',
                      }}
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      Скинути до взірця України
                    </button>
                  </div>
                </div>
              </div>
            </aside>
          )}

          {/* Printable A4 Sheet */}
          <div className="flex-1 overflow-y-auto bg-slate-100/70 p-4 sm:p-7 text-slate-900 print:overflow-visible print:bg-white print:p-0">
            {isLoading || !data || !activeTemplate ? (
              <div className="py-12 text-center text-sm text-slate-500">
                Формування українського стандартного бланка...
              </div>
            ) : (
              <div
                contentEditable={directEditMode}
                suppressContentEditableWarning
                className={`mx-auto max-w-3xl space-y-5 border bg-white p-6 sm:p-8 shadow-sm print:max-w-none print:border-0 print:p-0 print:shadow-none ${
                  directEditMode
                    ? 'border-amber-400 ring-2 ring-amber-200/70 outline-none'
                    : 'border-slate-300'
                }`}
              >
                {/* Top Standard Code (Ukrainian official form stamp) */}
                {activeTemplate.standardCode && (
                  <div className="flex items-start justify-between gap-4 border-b border-slate-300 pb-2 text-[10px] text-slate-600">
                    <div>
                      <span className="font-semibold">{data.organization.name}</span>
                      {data.organization.edrpou && (
                        <span> · Ідентифікаційний код ЄДРПОУ: {data.organization.edrpou}</span>
                      )}
                    </div>
                    <div className="max-w-xs text-right italic">{activeTemplate.standardCode}</div>
                  </div>
                )}

                {/* Parties Header */}
                <div className="grid grid-cols-1 gap-5 border-b-2 border-slate-900 pb-4 text-xs sm:grid-cols-2">
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
                      {doc.docType === 'goods_receipt'
                        ? 'Одержувач (Покупець):'
                        : isCashOrderForm
                          ? 'Підприємство / Організація:'
                          : 'Постачальник (Виконавець):'}
                    </div>
                    <div className="mt-1 text-sm font-bold text-slate-900">
                      {data.organization.name}
                    </div>
                    {data.organization.edrpou && (
                      <div>Код за ЄДРПОУ / РНОКПП: {data.organization.edrpou}</div>
                    )}
                    {data.organization.ipn && data.organization.isVatPayer && (
                      <div>ІПН платника ПДВ: {data.organization.ipn}</div>
                    )}
                    {activeTemplate.showIbanBlock && data.organization.iban && (
                      <div className="font-mono text-[11px]">IBAN: {data.organization.iban}</div>
                    )}
                    {activeTemplate.showIbanBlock && data.organization.bankName && (
                      <div>Банк: {data.organization.bankName}</div>
                    )}
                    {data.organization.address && <div>Адреса: {data.organization.address}</div>}
                  </div>

                  {data.counterparty && (
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
                        {doc.docType === 'goods_receipt'
                          ? 'Постачальник:'
                          : isPko
                            ? 'Прийнято від:'
                            : isVko
                              ? 'Видати:'
                              : 'Покупець (Замовник / Платник):'}
                      </div>
                      <div className="mt-1 text-sm font-bold text-slate-900">
                        {data.counterparty.name}
                      </div>
                      {data.counterparty.edrpou && (
                        <div>Код за ЄДРПОУ / ІПН: {data.counterparty.edrpou}</div>
                      )}
                      {data.counterparty.iban && activeTemplate.showIbanBlock && (
                        <div className="font-mono text-[11px]">IBAN: {data.counterparty.iban}</div>
                      )}
                      {data.counterparty.phone && <div>Тел.: {data.counterparty.phone}</div>}
                    </div>
                  )}
                </div>

                {/* Document Title + Subtitle */}
                <div className="text-center">
                  <h1 className="text-base font-extrabold tracking-tight text-slate-900 sm:text-lg">
                    {interpolateTemplate(activeTemplate.titleText, data)}
                  </h1>
                  {activeTemplate.subtitleText && (
                    <p className="mt-1 text-xs text-slate-600">
                      {interpolateTemplate(activeTemplate.subtitleText, data)}
                    </p>
                  )}
                  {data.warehouseName && !isCashOrderForm && !isPayrollForm && (
                    <p className="mt-0.5 text-[11px] text-slate-500">
                      Склад / Місце зберігання: {data.warehouseName}
                      {data.targetWarehouseName ? ` → ${data.targetWarehouseName}` : ''}
                    </p>
                  )}
                </div>

                {/* Header Note */}
                {activeTemplate.headerNote && (
                  <div className="rounded-md border border-slate-200 bg-slate-50/80 px-3.5 py-2 text-xs leading-relaxed text-slate-700">
                    {interpolateTemplate(activeTemplate.headerNote, data)}
                  </div>
                )}

                {/* SPECIAL LAYOUT 1: Cash Order (ПКО КО-1 / ВКО КО-2) */}
                {isCashOrderForm && (
                  <div className="space-y-4">
                    <table className="w-full border-collapse border border-slate-500 text-xs">
                      <thead className="bg-slate-100">
                        <tr>
                          <th className="border border-slate-500 px-2.5 py-1.5 text-center">
                            Номер документа
                          </th>
                          <th className="border border-slate-500 px-2.5 py-1.5 text-center">
                            Дата складання
                          </th>
                          <th className="border border-slate-500 px-2.5 py-1.5 text-center">
                            Каса / Рахунок
                          </th>
                          <th className="border border-slate-500 px-2.5 py-1.5 text-center">
                            Коресп. рахунок
                          </th>
                          <th className="border border-slate-500 px-2.5 py-1.5 text-right">
                            Сума, грн
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td className="border border-slate-500 px-2.5 py-2 text-center font-mono font-bold">
                            {data.document.docNumber}
                          </td>
                          <td className="border border-slate-500 px-2.5 py-2 text-center font-mono">
                            {fmtDate(data.document.docDate)}
                          </td>
                          <td className="border border-slate-500 px-2.5 py-2 text-center">
                            {data.cashAccount?.name || 'Основна каса'}
                          </td>
                          <td className="border border-slate-500 px-2.5 py-2 text-center font-mono font-bold">
                            {isPko ? 'Дт 301 / Кт 361' : 'Дт 631 / Кт 301'}
                          </td>
                          <td className="border border-slate-500 px-2.5 py-2 text-right font-mono font-bold">
                            {fmtMoney(data.totals.grossAmount, '')}
                          </td>
                        </tr>
                      </tbody>
                    </table>

                    <div className="space-y-1.5 text-xs">
                      <div>
                        <span className="font-semibold">
                          {isPko ? 'Прийнято від:' : 'Видати:'}
                        </span>{' '}
                        {data.counterparty?.name || '__________________________________________'}
                      </div>
                      <div>
                        <span className="font-semibold">Підстава:</span>{' '}
                        {data.cashflowCategoryName || data.document.comment || 'Розрахунки згідно договору'}
                      </div>
                      <div>
                        <span className="font-semibold">Сума прописом:</span>{' '}
                        <span className="font-bold">{data.totals.amountInWords}</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* SPECIAL LAYOUT 2: Payroll P-6/P-7 */}
                {!isCashOrderForm && isPayrollForm && data.lines.length > 0 && (
                  <table className="w-full border-collapse border border-slate-400 text-xs">
                    <thead className="bg-slate-100">
                      <tr>
                        <th className="border border-slate-400 px-2 py-1.5 text-center">№</th>
                        <th className="border border-slate-400 px-2 py-1.5 text-left">
                          ПІБ співробітника / Посада
                        </th>
                        <th className="border border-slate-400 px-2 py-1.5 text-center">РНОКПП</th>
                        <th className="border border-slate-400 px-2 py-1.5 text-right">Нараховано</th>
                        <th className="border border-slate-400 px-2 py-1.5 text-right">ПДФО 18%</th>
                        <th className="border border-slate-400 px-2 py-1.5 text-right">ВЗ 5%</th>
                        <th className="border border-slate-400 px-2 py-1.5 text-right">До видачі</th>
                        <th className="border border-slate-400 px-2 py-1.5 text-right">ЄСВ 22%</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.lines.map((l, i) => {
                        const gross = Number(l.amount || l.price || 0);
                        const pdfo = Number((gross * 0.18).toFixed(2));
                        const vz = Number((gross * 0.05).toFixed(2));
                        const net = Number((gross - pdfo - vz).toFixed(2));
                        const esv = Number((gross * 0.22).toFixed(2));
                        return (
                          <tr key={l.id || i}>
                            <td className="border border-slate-400 px-2 py-1.5 text-center">
                              {i + 1}
                            </td>
                            <td className="border border-slate-400 px-2 py-1.5">
                              <div className="font-semibold">{l.itemName}</div>
                              {l.employeePosition && (
                                <div className="text-[10px] text-slate-500">
                                  {l.employeePosition}
                                </div>
                              )}
                            </td>
                            <td className="border border-slate-400 px-2 py-1.5 text-center font-mono text-[11px]">
                              {l.employeeRnokpp || '—'}
                            </td>
                            <td className="border border-slate-400 px-2 py-1.5 text-right font-mono">
                              {fmtMoney(gross, '')}
                            </td>
                            <td className="border border-slate-400 px-2 py-1.5 text-right font-mono">
                              {fmtMoney(pdfo, '')}
                            </td>
                            <td className="border border-slate-400 px-2 py-1.5 text-right font-mono">
                              {fmtMoney(vz, '')}
                            </td>
                            <td className="border border-slate-400 px-2 py-1.5 text-right font-mono font-bold">
                              {fmtMoney(net, '')}
                            </td>
                            <td className="border border-slate-400 px-2 py-1.5 text-right font-mono">
                              {fmtMoney(esv, '')}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}

                {/* SPECIAL LAYOUT 3: Inventory Count (Наказ №572) */}
                {!isCashOrderForm && !isPayrollForm && isInventoryForm && data.lines.length > 0 && (
                  <table className="w-full border-collapse border border-slate-400 text-xs">
                    <thead className="bg-slate-100">
                      <tr>
                        <th className="border border-slate-400 px-2 py-1.5 text-center">№</th>
                        {activeTemplate.showSkuColumn && (
                          <th className="border border-slate-400 px-2 py-1.5 text-left">Артикул</th>
                        )}
                        <th className="border border-slate-400 px-2 py-1.5 text-left">
                          Найменування ТМЦ
                        </th>
                        <th className="border border-slate-400 px-2 py-1.5 text-center">Од.</th>
                        <th className="border border-slate-400 px-2 py-1.5 text-right">За обліком</th>
                        <th className="border border-slate-400 px-2 py-1.5 text-right">Фактично</th>
                        <th className="border border-slate-400 px-2 py-1.5 text-right">Відхилення</th>
                        <th className="border border-slate-400 px-2 py-1.5 text-right">Ціна, грн</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.lines.map((l, i) => {
                        const diff = Number(l.qty || 0) - Number(l.bookQty || 0);
                        return (
                          <tr key={l.id || i}>
                            <td className="border border-slate-400 px-2 py-1.5 text-center">
                              {i + 1}
                            </td>
                            {activeTemplate.showSkuColumn && (
                              <td className="border border-slate-400 px-2 py-1.5 font-mono">
                                {l.itemSku || '—'}
                              </td>
                            )}
                            <td className="border border-slate-400 px-2 py-1.5 font-medium">
                              {l.itemName}
                            </td>
                            <td className="border border-slate-400 px-2 py-1.5 text-center">
                              {l.unit}
                            </td>
                            <td className="border border-slate-400 px-2 py-1.5 text-right font-mono">
                              {fmtQty(l.bookQty)}
                            </td>
                            <td className="border border-slate-400 px-2 py-1.5 text-right font-mono font-bold">
                              {fmtQty(l.qty)}
                            </td>
                            <td className="border border-slate-400 px-2 py-1.5 text-right font-mono font-bold">
                              {diff > 0 ? `+${fmtQty(diff)}` : fmtQty(diff)}
                            </td>
                            <td className="border border-slate-400 px-2 py-1.5 text-right font-mono">
                              {fmtMoney(l.price, '')}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}

                {/* STANDARD GOODS/SERVICES TABLE (Рахунок, Видаткова М-11, Акт, ТТН 1-ТН, М-4, ПН) */}
                {!isCashOrderForm && !isPayrollForm && !isInventoryForm && data.lines.length > 0 && (
                  <table className="w-full border-collapse border border-slate-400 text-xs">
                    <thead className="bg-slate-100">
                      <tr>
                        <th className="border border-slate-400 px-2 py-1.5 text-center">№</th>
                        {activeTemplate.showSkuColumn && (
                          <th className="border border-slate-400 px-2 py-1.5 text-left">Артикул</th>
                        )}
                        <th className="border border-slate-400 px-2 py-1.5 text-left">
                          Найменування товару (робіт, послуг)
                        </th>
                        <th className="border border-slate-400 px-2 py-1.5 text-center">Од.</th>
                        <th className="border border-slate-400 px-2 py-1.5 text-right">К-сть</th>
                        <th className="border border-slate-400 px-2 py-1.5 text-right">Ціна, грн</th>
                        {showDiscountCol && (
                          <>
                            <th className="border border-slate-400 px-2 py-1.5 text-right">
                              Знижка %
                            </th>
                            <th className="border border-slate-400 px-2 py-1.5 text-right">
                              Знижка, грн
                            </th>
                          </>
                        )}
                        <th className="border border-slate-400 px-2 py-1.5 text-right">
                          Сума, грн
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.lines.map((l, i) => (
                        <tr key={l.id || i}>
                          <td className="border border-slate-400 px-2 py-1.5 text-center">
                            {i + 1}
                          </td>
                          {activeTemplate.showSkuColumn && (
                            <td className="border border-slate-400 px-2 py-1.5 font-mono">
                              {l.itemSku || l.lineRole}
                            </td>
                          )}
                          <td className="border border-slate-400 px-2 py-1.5 font-medium">
                            {l.itemName}
                          </td>
                          <td className="border border-slate-400 px-2 py-1.5 text-center">
                            {l.unit}
                          </td>
                          <td className="border border-slate-400 px-2 py-1.5 text-right font-mono">
                            {fmtQty(l.qty)}
                          </td>
                          <td className="border border-slate-400 px-2 py-1.5 text-right font-mono">
                            {fmtMoney(l.price, '')}
                          </td>
                          {showDiscountCol && (
                            <>
                              <td className="border border-slate-400 px-2 py-1.5 text-right font-mono">
                                {Number(l.discountPercent || 0) > 0
                                  ? `${fmtQty(l.discountPercent)}%`
                                  : '—'}
                              </td>
                              <td className="border border-slate-400 px-2 py-1.5 text-right font-mono">
                                {Number(l.discountAmount || 0) > 0
                                  ? `−${fmtMoney(l.discountAmount, '')}`
                                  : '—'}
                              </td>
                            </>
                          )}
                          <td className="border border-slate-400 px-2 py-1.5 text-right font-mono font-semibold">
                            {fmtMoney(l.amount, '')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}

                {/* Totals + Discount Summary + Amount in words */}
                <div className="space-y-2 text-xs">
                  {!isCashOrderForm && (
                    <div className="flex flex-col items-end space-y-1">
                      {data.totals.hasDiscount && (
                        <>
                          <div className="text-slate-600">
                            Сума без знижки:{' '}
                            <span className="ml-2 font-mono font-semibold">
                              {fmtMoney(data.totals.subtotalBeforeDiscount)}
                            </span>
                          </div>
                          <div className="font-semibold text-rose-700">
                            Надана знижка:{' '}
                            <span className="ml-2 font-mono">
                              −{fmtMoney(data.totals.discountTotal)}
                            </span>
                          </div>
                        </>
                      )}
                      {activeTemplate.showVatBlock && data.totals.vatRate > 0 && (
                        <>
                          <div>
                            Разом без ПДВ:{' '}
                            <span className="ml-2 font-mono font-semibold">
                              {fmtMoney(data.totals.netAmount)}
                            </span>
                          </div>
                          <div>
                            ПДВ ({data.totals.vatRate}%):{' '}
                            <span className="ml-2 font-mono font-semibold">
                              {fmtMoney(data.totals.vatAmount)}
                            </span>
                          </div>
                        </>
                      )}
                      <div className="text-sm font-bold text-slate-900">
                        Усього до сплати{' '}
                        {activeTemplate.showVatBlock && data.totals.vatRate > 0
                          ? 'з ПДВ'
                          : '(без ПДВ)'}
                        :{' '}
                        <span className="ml-2 font-mono">
                          {fmtMoney(data.totals.grossAmount)}
                        </span>
                      </div>
                    </div>
                  )}

                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                    {!isCashOrderForm && (
                      <div className="text-[11px] text-slate-500">
                        Всього найменувань {data.lines.length}, на суму{' '}
                        {fmtMoney(data.totals.grossAmount)}
                        {data.totals.hasDiscount
                          ? ` (з урахуванням знижки ${fmtMoney(data.totals.discountTotal)})`
                          : ''}
                      </div>
                    )}
                    <div className="mt-0.5 font-semibold text-slate-900">
                      Сума прописом: {data.totals.amountInWords}
                    </div>
                  </div>
                </div>

                {/* Footer Note (or Tear-Off Receipt for PKO KO-1) */}
                {activeTemplate.footerNote && (
                  <div
                    className={
                      isPko
                        ? 'border-t-2 border-dashed border-slate-500 pt-4 text-xs leading-relaxed text-slate-800'
                        : 'text-xs leading-relaxed text-slate-700'
                    }
                  >
                    {isPko && (
                      <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                        Лінія відрізу — Відривна квитанція (Форма № КО-1)
                      </div>
                    )}
                    {interpolateTemplate(activeTemplate.footerNote, data)}
                  </div>
                )}

                {/* Signatures & Stamp Area */}
                <div className="grid grid-cols-1 gap-8 pt-6 text-xs sm:grid-cols-2">
                  <div className="border-t border-slate-500 pt-2">
                    <div className="font-semibold">{activeTemplate.signLeftLabel}:</div>
                    <div className="mt-3 flex items-end justify-between gap-2">
                      <span>_________________</span>
                      <span className="text-slate-600">
                        / {data.organization.directorName || '__________________'} /
                      </span>
                    </div>
                    {activeTemplate.showStampArea && (
                      <div className="mt-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                        М.П.
                      </div>
                    )}
                  </div>
                  <div className="border-t border-slate-500 pt-2">
                    <div className="font-semibold">{activeTemplate.signRightLabel}:</div>
                    <div className="mt-3 flex items-end justify-between gap-2">
                      <span>_________________</span>
                      <span className="text-slate-600">/ ______________________ /</span>
                    </div>
                    {activeTemplate.showStampArea && (
                      <div className="mt-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                        М.П.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
