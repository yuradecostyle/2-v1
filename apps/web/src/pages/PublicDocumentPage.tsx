import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Printer,
  Copy,
  Check,
  Building2,
  User,
  Receipt,
  ExternalLink,
  Landmark,
  ShieldCheck,
  AlertCircle,
} from 'lucide-react';
import { BrandLogo2C } from '../components/BrandLogo2C';
import {
  fmtDate,
  fmtMoney,
  fmtQty,
  TAX_SYSTEM_LABELS,
  type DocumentType,
  type OrgEntityType,
  type TaxSystemType,
} from '../lib/api';

interface PublicDocumentResponse {
  document: {
    id: string;
    docType: DocumentType;
    docNumber: string;
    docDate: string;
    status: 'DRAFT' | 'POSTED' | 'CANCELLED';
    totalAmount: string;
    vatAmount: string;
    vatRate: number;
    fiscalCode?: string;
    fiscalUrl?: string;
    comment: string;
  };
  organization: {
    name: string;
    entityType?: OrgEntityType;
    taxSystem?: TaxSystemType;
    edrpou: string;
    ipn?: string;
    iban: string;
    bankName: string;
    address?: string;
    directorName?: string;
    isVatPayer: boolean;
    vatRate: number;
  };
  counterparty: {
    name: string;
    edrpou: string;
    phone: string;
    email: string;
    iban: string;
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
    itemSku: string;
    itemName: string;
    unit: string;
    qty: string;
    price: string;
    amount: string;
  }>;
}

const PUBLIC_DOC_TITLES: Record<DocumentType, string> = {
  customer_order: 'Замовлення покупця / Рахунок на оплату',
  sales_invoice: 'Видаткова накладна',
  goods_receipt: 'Прибуткова накладна',
  money_in: 'Прибутковий касовий ордер / Оплата',
  money_out: 'Видатковий касовий ордер / Виплата',
  tax_invoice: 'Податкова накладна (ПДВ)',
  stock_transfer: 'Накладна на переміщення',
  inventory_count: 'Акт інвентаризації',
  production_order: 'Акт виробництва / комплектації',
  payroll_sheet: 'Розрахункова відомість',
  price_setting: 'Прайс-лист / Установка цін',
  manual_journal: 'Бухгалтерська довідка',
  opening_balance: 'Акт початкових залишків',
  depreciation_run: 'Відомість амортизації ОЗ',
  fx_revaluation: 'Довідка курсових різниць',
};

export function PublicDocumentPage({ token }: { token: string }) {
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ['public-document', token],
    retry: false,
    queryFn: async () => {
      const res = await fetch(`/api/public/documents/${encodeURIComponent(token)}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json.message || 'Документ не знайдено або посилання недійсне');
      }
      return json as PublicDocumentResponse;
    },
  });

  const copyText = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(key);
      window.setTimeout(() => setCopiedField(null), 2000);
    } catch {}
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 p-6">
        <BrandLogo2C size={48} />
        <p className="text-[14px] font-semibold" style={{ color: 'var(--muted)' }}>
          Завантаження електронного документа 2С...
        </p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex min-h-screen items-center justify-center p-5">
        <div
          className="w-full max-w-md space-y-3 p-6 text-center"
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--r-xl)',
            boxShadow: 'var(--shadow-float)',
          }}
        >
          <div
            className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl"
            style={{ background: 'var(--neg-soft)', color: 'var(--neg)' }}
          >
            <AlertCircle className="h-6 w-6" aria-hidden="true" />
          </div>
          <h1 className="text-[18px] font-extrabold" style={{ color: 'var(--text)' }}>
            Посилання недоступне
          </h1>
          <p className="text-[14px]" style={{ color: 'var(--muted)' }}>
            {(error as Error)?.message || 'Документ не знайдено або посилання було анульовано.'}
          </p>
        </div>
      </div>
    );
  }

  const { document: doc, organization: org, counterparty: cp, totals, lines } = data;
  const title = PUBLIC_DOC_TITLES[doc.docType] ?? 'Електронний документ';
  const isCashDoc = doc.docType === 'money_in' || doc.docType === 'money_out';
  const isPosted = doc.status === 'POSTED';
  const paymentPurpose = `Оплата згідно ${title} №${doc.docNumber} від ${fmtDate(doc.docDate)}${org.isVatPayer ? `, у т.ч. ПДВ ${totals.vatRate}%` : ', без ПДВ'}`;
  const fullRequisitesText = [
    `Отримувач: ${org.name}`,
    `${org.entityType === 'FOP' ? 'РНОКПП (ІПН)' : 'ЄДРПОУ'}: ${org.edrpou || '—'}`,
    `IBAN: ${org.iban}`,
    `Банк: ${org.bankName}`,
    `Сума до сплати: ${fmtMoney(totals.grossAmount)}`,
    `Призначення платежу: ${paymentPurpose}`,
  ].join('\n');

  return (
    <div className="min-h-screen px-3 py-5 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-[880px] space-y-4">
        {/* Top Client Toolbar */}
        <header className="flex flex-wrap items-center justify-between gap-3 print:hidden">
          <div className="flex items-center gap-2.5">
            <BrandLogo2C size={40} />
            <div>
              <div className="text-[15px] font-extrabold" style={{ color: 'var(--text)' }}>
                2С · Електронний документ
              </div>
              <div className="inline-flex items-center gap-1 text-[12px]" style={{ color: 'var(--pos)' }}>
                <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                Офіційний онлайн-перегляд
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => copyText('all', fullRequisitesText)}
              className="inline-flex min-h-[44px] items-center gap-2 px-4 text-[13px] font-bold transition"
              style={{
                borderRadius: 'var(--r-pill)',
                background: 'var(--surface)',
                border: '1px solid var(--border-strong)',
                color: 'var(--text)',
              }}
            >
              {copiedField === 'all' ? (
                <>
                  <Check className="h-4 w-4" style={{ color: 'var(--pos)' }} aria-hidden="true" />
                  <span>Скопійовано!</span>
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4" style={{ color: 'var(--muted)' }} aria-hidden="true" />
                  <span>Реквізити</span>
                </>
              )}
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex min-h-[44px] items-center gap-2 px-5 text-[13px] font-extrabold transition"
              style={{
                borderRadius: 'var(--r-pill)',
                background: 'linear-gradient(135deg, var(--primary), var(--primary-2))',
                color: 'var(--surface)',
                boxShadow: 'var(--shadow-primary)',
              }}
            >
              <Printer className="h-4 w-4" aria-hidden="true" />
              <span>Друк / PDF</span>
            </button>
          </div>
        </header>

        {/* Main Document Sheet */}
        <article
          className="overflow-hidden"
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--r-xl)',
            boxShadow: 'var(--shadow-float)',
          }}
        >
          {/* Document Hero Strip */}
          <div
            className="p-5 sm:p-7"
            style={{
              background: 'linear-gradient(140deg, var(--primary) 0%, var(--primary-2) 60%, var(--sky) 100%)',
              color: 'var(--surface)',
            }}
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="overline-label" style={{ opacity: 0.9 }}>
                  {org.name} · {fmtDate(doc.docDate)}
                </div>
                <h1
                  className="mt-1.5 font-display font-extrabold leading-tight"
                  style={{ fontSize: 'clamp(22px, 3.6vw, 30px)' }}
                >
                  {title} <span className="font-mono">№{doc.docNumber}</span>
                </h1>
              </div>

              <div className="flex flex-col items-start gap-1.5 sm:items-end">
                <span
                  className="rounded-full px-3 py-1 text-[12px] font-bold"
                  style={{
                    background: 'var(--glass-tile)',
                    border: '1px solid var(--glass-border)',
                  }}
                >
                  {isPosted ? 'Підтверджено / Проведено' : 'Попередній документ (Чернетка)'}
                </span>
                <div className="font-mono text-[28px] font-bold sm:text-[32px]">
                  {fmtMoney(totals.grossAmount)}
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-6 p-5 sm:p-7">
            {/* Seller & Buyer Details */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div
                className="space-y-1.5 p-4"
                style={{
                  background: 'var(--surface-2)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--r-md)',
                }}
              >
                <div
                  className="overline-label flex items-center gap-1.5"
                  style={{ color: 'var(--primary)' }}
                >
                  <Building2 className="h-3.5 w-3.5" aria-hidden="true" />
                  {doc.docType === 'goods_receipt' ? 'Отримувач' : 'Постачальник / Виконавець'}
                </div>
                <div className="text-[15px] font-extrabold" style={{ color: 'var(--text)' }}>
                  {org.name}
                </div>
                <div className="space-y-0.5 text-[13px]" style={{ color: 'var(--text-2)' }}>
                  <div>
                    {org.entityType === 'FOP' ? 'РНОКПП (ІПН):' : 'ЄДРПОУ:'}{' '}
                    <span className="font-mono font-semibold">{org.edrpou || '—'}</span>
                  </div>
                  {org.taxSystem && (
                    <div>{TAX_SYSTEM_LABELS[org.taxSystem] ?? ''}</div>
                  )}
                  {org.address && <div style={{ color: 'var(--muted)' }}>{org.address}</div>}
                </div>
              </div>

              <div
                className="space-y-1.5 p-4"
                style={{
                  background: 'var(--surface-2)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--r-md)',
                }}
              >
                <div
                  className="overline-label flex items-center gap-1.5"
                  style={{ color: 'var(--muted)' }}
                >
                  <User className="h-3.5 w-3.5" aria-hidden="true" />
                  {doc.docType === 'money_out'
                    ? 'Отримувач коштів'
                    : doc.docType === 'goods_receipt'
                      ? 'Постачальник'
                      : 'Покупець / Платник'}
                </div>
                <div className="text-[15px] font-extrabold" style={{ color: 'var(--text)' }}>
                  {cp?.name || 'Кінцевий покупець'}
                </div>
                <div className="space-y-0.5 text-[13px]" style={{ color: 'var(--text-2)' }}>
                  {cp?.edrpou && (
                    <div>
                      ЄДРПОУ / ІПН: <span className="font-mono font-semibold">{cp.edrpou}</span>
                    </div>
                  )}
                  {cp?.phone && (
                    <div>
                      Телефон: <span className="font-mono">{cp.phone}</span>
                    </div>
                  )}
                  {data.warehouseName && (
                    <div style={{ color: 'var(--muted)' }}>Склад: {data.warehouseName}</div>
                  )}
                </div>
              </div>
            </div>

            {/* IBAN Payment Box (for Orders / Invoices / Cash Orders) */}
            {(doc.docType === 'customer_order' ||
              doc.docType === 'sales_invoice' ||
              isCashDoc) &&
              org.iban && (
                <div
                  className="flex flex-wrap items-center justify-between gap-3 p-4"
                  style={{
                    background: 'var(--primary-soft)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--r-md)',
                  }}
                >
                  <div className="min-w-0 space-y-1">
                    <div
                      className="overline-label flex items-center gap-1.5"
                      style={{ color: 'var(--primary-ink)' }}
                    >
                      <Landmark className="h-3.5 w-3.5" aria-hidden="true" />
                      Реквізити для оплати (IBAN)
                    </div>
                    <div
                      className="break-all font-mono text-[14px] font-bold sm:text-[15px]"
                      style={{ color: 'var(--text)' }}
                    >
                      {data.cashAccount?.iban || org.iban}
                    </div>
                    <div className="text-[12px]" style={{ color: 'var(--text-2)' }}>
                      {data.cashAccount?.name || org.bankName} · {paymentPurpose}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => copyText('iban', data.cashAccount?.iban || org.iban)}
                    className="inline-flex min-h-[44px] shrink-0 items-center gap-1.5 px-4 text-[13px] font-bold print:hidden"
                    style={{
                      borderRadius: 'var(--r-sm)',
                      background: 'var(--surface)',
                      color: 'var(--primary-ink)',
                      border: '1px solid var(--border-strong)',
                    }}
                  >
                    {copiedField === 'iban' ? (
                      <>
                        <Check className="h-4 w-4" style={{ color: 'var(--pos)' }} aria-hidden="true" />
                        <span>IBAN скопійовано</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-4 w-4" aria-hidden="true" />
                        <span>Копіювати IBAN</span>
                      </>
                    )}
                  </button>
                </div>
              )}

            {/* Cash Order Details */}
            {isCashDoc && (
              <div
                className="space-y-3 p-5"
                style={{
                  background: 'var(--surface-2)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--r-md)',
                }}
              >
                <div className="overline-label" style={{ color: 'var(--primary)' }}>
                  {doc.docType === 'money_in'
                    ? 'Деталі надходження коштів (ПКО)'
                    : 'Деталі виплати коштів (ВКО)'}
                </div>
                <dl className="grid grid-cols-1 gap-3 text-[14px] sm:grid-cols-2">
                  <div>
                    <dt className="text-[12px] font-semibold" style={{ color: 'var(--muted)' }}>
                      Каса / Банківський рахунок
                    </dt>
                    <dd className="mt-0.5 font-bold" style={{ color: 'var(--text)' }}>
                      {data.cashAccount?.name || org.bankName}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[12px] font-semibold" style={{ color: 'var(--muted)' }}>
                      Стаття руху коштів / Підстава
                    </dt>
                    <dd className="mt-0.5 font-bold" style={{ color: 'var(--text)' }}>
                      {data.cashflowCategoryName || doc.comment || 'Розрахунки з контрагентом'}
                    </dd>
                  </div>
                  {doc.comment && (
                    <div className="sm:col-span-2">
                      <dt className="text-[12px] font-semibold" style={{ color: 'var(--muted)' }}>
                        Призначення платежу / Коментар
                      </dt>
                      <dd className="mt-0.5" style={{ color: 'var(--text-2)' }}>
                        {doc.comment}
                      </dd>
                    </div>
                  )}
                </dl>
              </div>
            )}

            {/* Line Items Table (Desktop) + Cards (Mobile) */}
            {lines.length > 0 && (
              <div className="space-y-3">
                <div className="overline-label" style={{ color: 'var(--muted)' }}>
                  Товари та послуги ({lines.length})
                </div>

                {/* Desktop Table */}
                <div
                  className="hidden overflow-x-auto sm:block"
                  style={{
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--r-md)',
                  }}
                >
                  <table className="w-full text-left text-[13px]">
                    <thead
                      style={{
                        background: 'var(--surface-2)',
                        borderBottom: '1px solid var(--border)',
                        color: 'var(--muted)',
                      }}
                    >
                      <tr>
                        <th className="px-4 py-3 font-bold">№</th>
                        <th className="px-4 py-3 font-bold">Найменування</th>
                        <th className="px-4 py-3 text-right font-bold">К-сть</th>
                        <th className="px-4 py-3 text-right font-bold">Ціна</th>
                        <th className="px-4 py-3 text-right font-bold">Сума</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lines.map((l) => (
                        <tr
                          key={l.id}
                          style={{ borderBottom: '1px solid var(--border)' }}
                        >
                          <td className="px-4 py-3 font-mono" style={{ color: 'var(--muted)' }}>
                            {l.lineNo}
                          </td>
                          <td className="px-4 py-3">
                            <div className="font-bold" style={{ color: 'var(--text)' }}>
                              {l.itemName}
                            </div>
                            {l.itemSku && (
                              <div className="font-mono text-[11px]" style={{ color: 'var(--muted)' }}>
                                Артикул: {l.itemSku}
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right font-mono font-semibold">
                            {fmtQty(l.qty)} {l.unit}
                          </td>
                          <td className="px-4 py-3 text-right font-mono">
                            {fmtMoney(l.price)}
                          </td>
                          <td
                            className="px-4 py-3 text-right font-mono font-bold"
                            style={{ color: 'var(--text)' }}
                          >
                            {fmtMoney(l.amount)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Mobile Item Cards */}
                <div className="space-y-2.5 sm:hidden">
                  {lines.map((l) => (
                    <div
                      key={l.id}
                      className="p-3.5"
                      style={{
                        background: 'var(--surface-2)',
                        border: '1px solid var(--border)',
                        borderRadius: 'var(--r-md)',
                      }}
                    >
                      <div className="text-[14px] font-bold" style={{ color: 'var(--text)' }}>
                        {l.lineNo}. {l.itemName}
                      </div>
                      <div className="mt-2 flex items-center justify-between text-[13px]">
                        <span className="font-mono" style={{ color: 'var(--muted)' }}>
                          {fmtQty(l.qty)} {l.unit} × {fmtMoney(l.price)}
                        </span>
                        <span className="font-mono font-bold" style={{ color: 'var(--text)' }}>
                          {fmtMoney(l.amount)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Totals & Amount in Words */}
            <div
              className="space-y-2 p-4 sm:p-5"
              style={{
                background: 'var(--surface-2)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--r-md)',
              }}
            >
              {totals.vatRate > 0 && (
                <div className="flex items-center justify-between text-[13px]" style={{ color: 'var(--text-2)' }}>
                  <span>Сума без ПДВ:</span>
                  <span className="font-mono font-semibold">{fmtMoney(totals.netAmount)}</span>
                </div>
              )}
              {totals.vatRate > 0 && (
                <div className="flex items-center justify-between text-[13px]" style={{ color: 'var(--text-2)' }}>
                  <span>ПДВ ({totals.vatRate}%):</span>
                  <span className="font-mono font-semibold">{fmtMoney(totals.vatAmount)}</span>
                </div>
              )}
              <div
                className="flex items-baseline justify-between pt-2"
                style={{
                  borderTop: totals.vatRate > 0 ? '1px solid var(--border)' : undefined,
                }}
              >
                <span className="text-[15px] font-extrabold" style={{ color: 'var(--text)' }}>
                  Всього {totals.vatRate > 0 ? 'з ПДВ' : '(без ПДВ)'}:
                </span>
                <span className="font-mono text-[22px] font-bold" style={{ color: 'var(--text)' }}>
                  {fmtMoney(totals.grossAmount)}
                </span>
              </div>
              <div className="pt-1 text-[13px] font-medium" style={{ color: 'var(--muted)' }}>
                Сума прописом: <strong style={{ color: 'var(--text)' }}>{totals.amountInWords}</strong>
              </div>
            </div>

            {/* Fiscal Receipt Badge if fiscalized */}
            {doc.fiscalCode && (
              <div
                className="flex flex-wrap items-center justify-between gap-3 p-4"
                style={{
                  background: 'var(--pos-soft)',
                  borderRadius: 'var(--r-md)',
                  color: 'var(--pos-ink)',
                }}
              >
                <div className="flex items-center gap-2.5 text-[13px] font-bold">
                  <Receipt className="h-5 w-5 shrink-0" aria-hidden="true" />
                  <span>
                    Фіскалізовано у ПРРО Checkbox · Чек ДПС №{' '}
                    <span className="font-mono">{doc.fiscalCode}</span>
                  </span>
                </div>
                {doc.fiscalUrl && (
                  <a
                    href={doc.fiscalUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex min-h-[40px] items-center gap-1.5 rounded-full px-3.5 text-[12px] font-extrabold"
                    style={{ background: 'var(--surface)', color: 'var(--pos-ink)' }}
                  >
                    <span>Перевірити чек</span>
                    <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                  </a>
                )}
              </div>
            )}

            {doc.comment && !isCashDoc && (
              <div className="text-[13px]" style={{ color: 'var(--muted)' }}>
                <strong style={{ color: 'var(--text-2)' }}>Примітка:</strong> {doc.comment}
              </div>
            )}

            {/* Footer Signature */}
            <div
              className="flex flex-wrap items-center justify-between gap-2 pt-4 text-[12px]"
              style={{ borderTop: '1px solid var(--border)', color: 'var(--muted)' }}
            >
              <span>
                Відповідальна особа: <strong style={{ color: 'var(--text)' }}>{org.directorName || org.name}</strong>
              </span>
              <span>Сформовано онлайн у системі 2С</span>
            </div>
          </div>
        </article>
      </div>
    </div>
  );
}
