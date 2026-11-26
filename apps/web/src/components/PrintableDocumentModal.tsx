import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { X, Printer, FileCode2 } from 'lucide-react';
import {
  apiFetch,
  downloadTextFile,
  DOC_TYPE_META,
  fmtDate,
  fmtMoney,
  fmtQty,
  type DocumentSummary,
} from '../lib/api';

interface PrintableResponse {
  document: DocumentSummary;
  organization: {
    name: string;
    edrpou: string;
    iban: string;
    bankName: string;
    isVatPayer: boolean;
  };
  counterparty: {
    name: string;
    edrpou: string;
    phone: string;
  } | null;
  warehouseName: string;
  targetWarehouseName: string;
  totals: {
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
    amount: string;
    costAmount: string;
    taxAmount: string;
    notes: string;
  }>;
}

export function PrintableDocumentModal({
  doc,
  onClose,
}: {
  doc: DocumentSummary;
  onClose: () => void;
}) {
  const [templateType, setTemplateType] = useState<'PRIMARY' | 'INVOICE' | 'ACT'>('PRIMARY');

  const { data, isLoading } = useQuery({
    queryKey: ['doc-print', doc.id],
    queryFn: () => apiFetch<PrintableResponse>(`/api/documents/${doc.id}/print`),
  });

  const handleDownloadTaxXml = async () => {
    const res = await apiFetch<{ filename: string; xml: string }>(
      `/api/documents/${doc.id}/tax-xml`
    );
    downloadTextFile(res.filename, res.xml);
  };

  const getFormTitle = () => {
    if (templateType === 'INVOICE') {
      return `РАХУНОК-ФАКТУРА № ${doc.docNumber} від ${fmtDate(doc.docDate)} р.`;
    }
    if (templateType === 'ACT') {
      return `АКТ здачі-прийняття робіт (надання послуг) № ${doc.docNumber} від ${fmtDate(
        doc.docDate
      )} р.`;
    }
    return `${DOC_TYPE_META[doc.docType].label.toUpperCase()} № ${doc.docNumber} від ${fmtDate(
      doc.docDate
    )} р.`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
      <div className="flex max-h-[92vh] w-full max-w-4xl flex-col rounded-2xl bg-white shadow-2xl">
        {/* Top Toolbar (non-printed) */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-6 py-3.5 print:hidden">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-slate-800">Друкована форма:</span>
            <button
              onClick={() => setTemplateType('PRIMARY')}
              className={`rounded-lg px-2.5 py-1 text-xs font-medium ${
                templateType === 'PRIMARY'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-100 text-slate-700'
              }`}
            >
              Основний бланк
            </button>
            {(doc.docType === 'sales_invoice' || doc.docType === 'customer_order') && (
              <>
                <button
                  onClick={() => setTemplateType('INVOICE')}
                  className={`rounded-lg px-2.5 py-1 text-xs font-medium ${
                    templateType === 'INVOICE'
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-100 text-slate-700'
                  }`}
                >
                  Рахунок-фактура
                </button>
                <button
                  onClick={() => setTemplateType('ACT')}
                  className={`rounded-lg px-2.5 py-1 text-xs font-medium ${
                    templateType === 'ACT'
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-100 text-slate-700'
                  }`}
                >
                  Акт послуг
                </button>
              </>
            )}
          </div>

          <div className="flex items-center gap-2">
            {(doc.docType === 'tax_invoice' || doc.docType === 'sales_invoice') && (
              <button
                onClick={handleDownloadTaxXml}
                className="inline-flex items-center gap-1.5 rounded-lg border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-medium text-sky-800 hover:bg-sky-100"
              >
                <FileCode2 className="h-3.5 w-3.5" /> XML ЄРПН (J1201015)
              </button>
            )}
            <button
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-slate-800"
            >
              <Printer className="h-3.5 w-3.5" /> Друкувати / PDF
            </button>
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Printable Sheet */}
        <div className="flex-1 overflow-y-auto p-8 text-slate-900">
          {isLoading || !data ? (
            <div className="text-sm text-slate-500">Формування друкованого бланка...</div>
          ) : (
            <div className="mx-auto max-w-3xl space-y-6 border border-slate-300 bg-white p-8 shadow-xs">
              {/* Parties header */}
              <div className="grid grid-cols-2 gap-6 border-b-2 border-slate-900 pb-4 text-xs">
                <div>
                  <div className="font-bold uppercase text-slate-500">
                    {doc.docType === 'goods_receipt' ? 'Одержувач:' : 'Постачальник (Виконавець):'}
                  </div>
                  <div className="mt-1 text-sm font-bold">{data.organization.name}</div>
                  <div>Код за ЄДРПОУ: {data.organization.edrpou}</div>
                  <div>IBAN: {data.organization.iban}</div>
                  <div>Банк: {data.organization.bankName}</div>
                </div>
                {data.counterparty && (
                  <div>
                    <div className="font-bold uppercase text-slate-500">
                      {doc.docType === 'goods_receipt'
                        ? 'Постачальник:'
                        : 'Покупець (Замовник):'}
                    </div>
                    <div className="mt-1 text-sm font-bold">{data.counterparty.name}</div>
                    {data.counterparty.edrpou && (
                      <div>Код за ЄДРПОУ / ІПН: {data.counterparty.edrpou}</div>
                    )}
                    {data.counterparty.phone && <div>Тел.: {data.counterparty.phone}</div>}
                  </div>
                )}
              </div>

              {/* Document Title */}
              <div className="text-center">
                <h1 className="text-lg font-bold tracking-tight text-slate-900">
                  {getFormTitle()}
                </h1>
                {data.warehouseName && (
                  <p className="mt-0.5 text-xs text-slate-600">
                    Місце складання / Склад: {data.warehouseName}
                    {data.targetWarehouseName ? ` → ${data.targetWarehouseName}` : ''}
                  </p>
                )}
              </div>

              {/* Table */}
              {data.lines.length > 0 && (
                <table className="w-full border-collapse border border-slate-400 text-xs">
                  <thead className="bg-slate-100">
                    <tr>
                      <th className="border border-slate-400 px-2 py-1.5 text-center">№</th>
                      <th className="border border-slate-400 px-2 py-1.5 text-left">Артикул</th>
                      <th className="border border-slate-400 px-2 py-1.5 text-left">
                        {doc.docType === 'payroll_sheet'
                          ? 'ПІБ співробітника / Розшифровка'
                          : 'Найменування товару (робіт, послуг)'}
                      </th>
                      <th className="border border-slate-400 px-2 py-1.5 text-center">Од.</th>
                      <th className="border border-slate-400 px-2 py-1.5 text-right">К-сть</th>
                      <th className="border border-slate-400 px-2 py-1.5 text-right">Ціна, грн</th>
                      <th className="border border-slate-400 px-2 py-1.5 text-right">Сума, грн</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.lines.map((l, i) => (
                      <tr key={l.id || i}>
                        <td className="border border-slate-400 px-2 py-1.5 text-center">
                          {i + 1}
                        </td>
                        <td className="border border-slate-400 px-2 py-1.5 font-mono">
                          {l.itemSku || l.lineRole}
                        </td>
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
                        <td className="border border-slate-400 px-2 py-1.5 text-right font-mono font-semibold">
                          {fmtMoney(l.amount, '')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {/* Totals + Amount in words */}
              <div className="space-y-2 text-xs">
                <div className="flex flex-col items-end space-y-1">
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
                  <div className="text-sm font-bold">
                    Усього до сплати з ПДВ:{' '}
                    <span className="ml-2 font-mono">{fmtMoney(data.totals.grossAmount)}</span>
                  </div>
                </div>

                <div className="rounded-lg bg-slate-50 p-3 border border-slate-200">
                  <div className="text-[11px] text-slate-500">
                    Всього найменувань {data.lines.length}, на суму {fmtMoney(data.totals.grossAmount)}
                  </div>
                  <div className="mt-0.5 font-semibold text-slate-900">
                    Сума прописом: {data.totals.amountInWords}
                  </div>
                </div>
              </div>

              {/* Signatures */}
              <div className="grid grid-cols-2 gap-8 pt-6 text-xs">
                <div className="border-t border-slate-400 pt-2">
                  <span className="font-semibold">Відвантажив (Виконавець):</span> ______________ /
                  Шевченко А. В. /
                </div>
                <div className="border-t border-slate-400 pt-2">
                  <span className="font-semibold">Отримав (Замовник):</span> ______________ /
                  __________________ /
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
