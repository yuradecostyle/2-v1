import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  X,
  Plus,
  Trash2,
  CheckCircle2,
  Save,
  AlertCircle,
  RefreshCw,
  Cpu,
  Users,
  GitBranch,
  History,
  FileText,
  ArrowRight,
  Link2,
  Sparkles,
  Building2,
  Share2,
} from 'lucide-react';
import {
  apiFetch,
  DOC_TYPE_META,
  fmtDate,
  fmtMoney,
  fmtQty,
  TAX_SYSTEM_LABELS,
  type BootstrapData,
  type DocumentFull,
  type DocumentLineDto,
  type DocumentType,
} from '../lib/api';
import { SmartCounterpartyCombobox } from './SmartCounterpartyCombobox';
import { SmartItemCombobox } from './SmartItemCombobox';
import { ShareDocumentModal } from './ShareDocumentModal';

interface ActiveOrder {
  id: string;
  docNumber: string;
  warehouseId: string | null;
  counterpartyId: string | null;
  counterpartyName: string;
  remainingReservedQty: string;
  isFulfilled: boolean;
  lines: DocumentLineDto[];
}

interface RelatedDocNode {
  id: string;
  docType: DocumentType;
  docNumber: string;
  docDate: string;
  status: string;
  totalAmount: string;
  counterpartyName: string;
  comment: string;
}

interface RelationsAndHistoryResponse {
  current: RelatedDocNode;
  parent: RelatedDocNode | null;
  children: RelatedDocNode[];
  siblings: RelatedDocNode[];
  history: Array<{
    id: string;
    at: string;
    actor: string;
    role: string;
    action: string;
    summary: string;
  }>;
  availableNextActions: Array<{ targetType: DocumentType; label: string }>;
  linkableDocuments: RelatedDocNode[];
}

interface Props {
  bootstrap: BootstrapData;
  docType: DocumentType;
  documentId?: string | null;
  initialCounterpartyId?: string | null;
  initialItemId?: string | null;
  initialDate?: string | null;
  initialTab?: 'main' | 'relations' | 'history';
  onClose: () => void;
  onSaved: () => void;
}

export function DocumentEditorModal({
  bootstrap,
  docType: initialDocType,
  documentId: initialDocumentId,
  initialCounterpartyId,
  initialItemId,
  initialDate,
  initialTab = 'main',
  onClose,
  onSaved,
}: Props) {
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<'main' | 'relations' | 'history'>(initialTab);
  const [currentDocId, setCurrentDocId] = useState<string | null>(initialDocumentId ?? null);
  const [docOrgId, setDocOrgId] = useState<string>(bootstrap.organization.id);
  const [docDeptId, setDocDeptId] = useState<string>(
    bootstrap.activeDepartmentId ?? bootstrap.departments[0]?.id ?? ''
  );
  const [docType, setDocType] = useState<DocumentType>(initialDocType);
  const [docNumber, setDocNumber] = useState('');
  const [docDate, setDocDate] = useState(() => initialDate || new Date().toISOString().slice(0, 16));
  const [parentDocId, setParentDocId] = useState<string>('');
  const [bomSpecId, setBomSpecId] = useState<string>(bootstrap.bomSpecs[0]?.id ?? '');
  const [vatRate, setVatRate] = useState<number>(
    bootstrap.organization.isVatPayer ? bootstrap.organization.vatRate : 0
  );
  const [warehouseId, setWarehouseId] = useState<string>(bootstrap.warehouses[0]?.id ?? '');
  const [targetWarehouseId, setTargetWarehouseId] = useState<string>(
    bootstrap.warehouses[1]?.id ?? bootstrap.warehouses[0]?.id ?? ''
  );
  const [counterpartyId, setCounterpartyId] = useState<string>(initialCounterpartyId ?? '');
  const [cashAccountId, setCashAccountId] = useState<string>(bootstrap.cashAccounts[0]?.id ?? '');

  const selectedOrg =
    bootstrap.organizations.find((o) => o.id === docOrgId) ?? bootstrap.organization;
  const orgDepartments = (bootstrap.allDepartments ?? bootstrap.departments).filter(
    (dp) => dp.organizationId === docOrgId
  );
  const orgWarehouses = (bootstrap.allWarehouses ?? bootstrap.warehouses).filter(
    (w) => !w.organizationId || w.organizationId === docOrgId
  );
  const orgCashAccounts = (bootstrap.allCashAccounts ?? bootstrap.cashAccounts).filter(
    (a) => !a.organizationId || a.organizationId === docOrgId
  );

  const handleSelectDocOrg = (nextOrgId: string) => {
    setDocOrgId(nextOrgId);
    const nextOrg = bootstrap.organizations.find((o) => o.id === nextOrgId);
    if (nextOrg) {
      setVatRate(nextOrg.isVatPayer ? nextOrg.vatRate : 0);
    }
    const nextDepts = (bootstrap.allDepartments ?? []).filter(
      (dp) => dp.organizationId === nextOrgId
    );
    setDocDeptId(nextDepts[0]?.id ?? '');
    const nextWhs = (bootstrap.allWarehouses ?? []).filter((w) => w.organizationId === nextOrgId);
    setWarehouseId(nextWhs[0]?.id ?? '');
    setTargetWarehouseId(nextWhs[1]?.id ?? nextWhs[0]?.id ?? '');
    const nextAccs = (bootstrap.allCashAccounts ?? []).filter(
      (a) => a.organizationId === nextOrgId
    );
    setCashAccountId(nextAccs[0]?.id ?? '');
  };
  const [cashflowCategoryId, setCashflowCategoryId] = useState<string>('');
  const [priceTypeId, setPriceTypeId] = useState<string>(bootstrap.priceTypes[0]?.id ?? '');
  const [totalAmount, setTotalAmount] = useState<string>('0');
  const [comment, setComment] = useState('');
  const [lines, setLines] = useState<DocumentLineDto[]>([]);
  const [latestPrices, setLatestPrices] = useState<Record<string, string>>({});
  const [activeOrders, setActiveOrders] = useState<ActiveOrder[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);
  const [linkSelectId, setLinkSelectId] = useState<string>('');
  const [shareOpen, setShareOpen] = useState(false);

  const isCashDoc = docType === 'money_in' || docType === 'money_out';
  const isPriceDoc = docType === 'price_setting';
  const isTransferDoc = docType === 'stock_transfer';
  const isInventoryDoc = docType === 'inventory_count';
  const isProductionDoc = docType === 'production_order';
  const isPayrollDoc = docType === 'payroll_sheet';
  const isTaxInvoiceDoc = docType === 'tax_invoice';
  const isManualJournal = docType === 'manual_journal';
  const isOrderDoc = docType === 'customer_order';
  const isTradeDoc =
    docType === 'goods_receipt' || docType === 'sales_invoice' || isOrderDoc || isTaxInvoiceDoc;

  const relationsQuery = useQuery({
    queryKey: ['doc-relations', currentDocId],
    enabled: Boolean(currentDocId),
    queryFn: () =>
      apiFetch<RelationsAndHistoryResponse>(`/api/documents/${currentDocId}/relations-and-history`),
  });

  useEffect(() => {
    if (relationsQuery.data) {
      setLinkSelectId(relationsQuery.data.parent?.id ?? '');
    }
  }, [relationsQuery.data]);

  useEffect(() => {
    if (docType === 'sales_invoice') {
      apiFetch<ActiveOrder[]>('/api/orders/active')
        .then(setActiveOrders)
        .catch(() => {});
    }
  }, [docType]);

  const fillFromBomSpec = (specId: string) => {
    const spec = bootstrap.bomSpecs.find((b) => b.id === specId);
    if (!spec) return;
    setBomSpecId(spec.id);
    setComment(`Виробництво за специфікацією ${spec.code}: ${spec.name}`);
    setLines([
      {
        lineRole: 'OUTPUT',
        itemId: spec.outputItemId,
        qty: Number(spec.outputQty),
        price: 0,
        amount: 0,
      },
      ...spec.lines.map((c) => ({
        lineRole: 'COMPONENT',
        itemId: c.componentItemId,
        qty: Number(c.qty),
        price: 0,
        amount: 0,
      })),
    ]);
  };

  const fillPayrollFromStaff = () => {
    setLines(
      bootstrap.employees.map((emp) => ({
        lineRole: 'EMPLOYEE',
        itemId: null,
        employeeId: emp.id,
        qty: 1,
        price: Number(emp.baseSalary),
        amount: Number(emp.baseSalary),
        notes: `${emp.fullName} (${emp.position})`,
      }))
    );
  };

  useEffect(() => {
    if (!currentDocId) {
      if (!isCashDoc && lines.length === 0) {
        if (isManualJournal) {
          setLines([
            {
              itemId: null,
              debitAccountCode: '92',
              creditAccountCode: '651',
              qty: 0,
              price: 0,
              amount: 1000,
              notes: 'Нарахування ЄСВ',
            },
          ]);
        } else if (isProductionDoc && bootstrap.bomSpecs[0]) {
          fillFromBomSpec(bootstrap.bomSpecs[0].id);
        } else if (isPayrollDoc) {
          fillPayrollFromStaff();
        } else if (initialItemId) {
          setLines([
            {
              lineRole: 'ITEM',
              itemId: initialItemId,
              bookQty: 0,
              qty: 1,
              price: 0,
              amount: 0,
            },
          ]);
        }
      }
      return;
    }

    apiFetch<DocumentFull>(`/api/documents/${currentDocId}`).then((doc) => {
      if (doc.organizationId) {
        setDocOrgId(doc.organizationId);
      }
      if (doc.departmentId !== undefined) {
        setDocDeptId(doc.departmentId ?? '');
      }
      setDocType(doc.docType);
      setDocNumber(doc.docNumber);
      setDocDate(new Date(doc.docDate).toISOString().slice(0, 16));
      setParentDocId(doc.parentDocId ?? '');
      setBomSpecId(doc.bomSpecId ?? '');
      setVatRate(doc.vatRate ?? 20);
      setWarehouseId(doc.warehouseId ?? '');
      setTargetWarehouseId(doc.targetWarehouseId ?? '');
      setCounterpartyId(doc.counterpartyId ?? '');
      setCashAccountId(doc.cashAccountId ?? '');
      setCashflowCategoryId(doc.cashflowCategoryId ?? '');
      setPriceTypeId(doc.priceTypeId ?? '');
      setTotalAmount(doc.totalAmount);
      setComment(doc.comment);
      setLines(doc.lines);
    });
  }, [currentDocId]);

  useEffect(() => {
    if ((docType !== 'sales_invoice' && docType !== 'customer_order') || !priceTypeId) return;
    const iso = new Date(docDate).toISOString();
    apiFetch<Record<string, string>>(
      `/api/prices/latest?priceTypeId=${priceTypeId}&asOfDate=${encodeURIComponent(iso)}`
    )
      .then((prices) => {
        setLatestPrices(prices);
        // Якщо є попередньо вибраний товар з ціною 0 — підставляємо актуальну ціну
        setLines((prev) =>
          prev.map((l) => {
            if (l.itemId && Number(l.price) === 0 && prices[l.itemId]) {
              const p = Number(prices[l.itemId]);
              return { ...l, price: p, amount: Number((Number(l.qty || 1) * p).toFixed(2)) };
            }
            return l;
          })
        );
      })
      .catch(() => {});
  }, [docType, priceTypeId, docDate]);

  // Супер-швидке додавання товару з верхньої панелі пошуку: якщо товар вже є — збільшує к-сть на +1!
  const quickAddItemToOrder = (itemId: string) => {
    const autoPrice = latestPrices[itemId] ? Number(latestPrices[itemId]) : 0;
    setLines((prev) => {
      const existingIdx = prev.findIndex(
        (l) => l.itemId === itemId && (!isProductionDoc || l.lineRole === 'COMPONENT')
      );
      if (existingIdx >= 0 && !isPriceDoc && !isInventoryDoc) {
        return prev.map((l, i) => {
          if (i !== existingIdx) return l;
          const nextQty = Number(l.qty || 0) + 1;
          const p = Number(l.price || autoPrice);
          return { ...l, qty: nextQty, price: p, amount: Number((nextQty * p).toFixed(2)) };
        });
      }
      return [
        ...prev,
        {
          lineRole: isProductionDoc ? 'COMPONENT' : 'ITEM',
          itemId,
          bookQty: 0,
          qty: 1,
          price: autoPrice,
          amount: autoPrice,
        },
      ];
    });
  };

  const handleSelectOrderBasis = (orderId: string) => {
    setParentDocId(orderId);
    const found = activeOrders.find((o) => o.id === orderId);
    if (found) {
      if (found.warehouseId) setWarehouseId(found.warehouseId);
      if (found.counterpartyId) setCounterpartyId(found.counterpartyId);
      setComment(`Відвантаження за замовленням №${found.docNumber}`);
      if (found.lines.length > 0) {
        setLines(
          found.lines.map((l) => ({
            lineRole: 'ITEM',
            itemId: l.itemId,
            qty: l.qty,
            price: l.price,
            amount: l.amount,
          }))
        );
      }
    }
  };

  const handleFillInventoryFromStock = async () => {
    if (!warehouseId) return;
    const iso = new Date(docDate).toISOString();
    const rows = await apiFetch<
      Array<{ itemId: string; bookQty: string; qty: string; price: string }>
    >(
      `/api/inventory/book-balances?warehouseId=${warehouseId}&asOfDate=${encodeURIComponent(iso)}`
    );
    if (rows.length === 0) {
      setError('На обраному складі на цю дату немає залишків для заповнення');
      return;
    }
    setError(null);
    setLines(
      rows.map((r) => ({
        lineRole: 'ITEM',
        itemId: r.itemId,
        bookQty: Number(r.bookQty),
        qty: Number(r.qty),
        price: Number(r.price),
        amount: 0,
      }))
    );
  };

  const computedLinesTotal = lines.reduce((sum, l) => sum + Number(l.amount || 0), 0);

  const updateLine = (idx: number, patch: Partial<DocumentLineDto>) => {
    setLines((prev) =>
      prev.map((l, i) => {
        if (i !== idx) return l;
        const next = { ...l, ...patch };
        if (patch.employeeId) {
          const emp = bootstrap.employees.find((e) => e.id === patch.employeeId);
          if (emp) {
            next.price = Number(emp.baseSalary);
            next.amount = Number(emp.baseSalary);
          }
        }
        if (
          patch.itemId &&
          (docType === 'sales_invoice' || docType === 'customer_order') &&
          latestPrices[patch.itemId]
        ) {
          next.price = Number(latestPrices[patch.itemId]);
        }
        if (
          !isManualJournal &&
          !isPayrollDoc &&
          (patch.qty !== undefined || patch.price !== undefined || patch.itemId !== undefined)
        ) {
          const q = Number(next.qty || 0);
          const p = Number(next.price || 0);
          next.amount = Number((q * p).toFixed(2));
        }
        return next;
      })
    );
  };

  const addLine = () => {
    if (isManualJournal) {
      setLines((prev) => [
        ...prev,
        {
          itemId: null,
          debitAccountCode: '92',
          creditAccountCode: '631',
          qty: 0,
          price: 0,
          amount: 0,
          notes: '',
        },
      ]);
      return;
    }
    if (isPayrollDoc) {
      const emp = bootstrap.employees[0];
      setLines((prev) => [
        ...prev,
        {
          lineRole: 'EMPLOYEE',
          itemId: null,
          employeeId: emp?.id ?? null,
          qty: 1,
          price: Number(emp?.baseSalary ?? 25000),
          amount: Number(emp?.baseSalary ?? 25000),
        },
      ]);
      return;
    }
    setLines((prev) => [
      ...prev,
      {
        lineRole: isProductionDoc ? 'COMPONENT' : 'ITEM',
        itemId: null,
        bookQty: 0,
        qty: 1,
        price: 0,
        amount: 0,
      },
    ]);
  };

  const removeLine = (idx: number) => {
    setLines((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSubmit = async (autoPost: boolean, closeAfter = true) => {
    setError(null);
    setInfoMsg(null);
    setSaving(true);
    try {
      const needsWarehouse =
        (isTradeDoc && !isTaxInvoiceDoc) ||
        isTransferDoc ||
        isInventoryDoc ||
        isProductionDoc ||
        docType === 'opening_balance';

      const payload = {
        organizationId: docOrgId,
        departmentId: docDeptId || null,
        docType,
        docNumber: docNumber.trim() || undefined,
        docDate: new Date(docDate).toISOString(),
        parentDocId: parentDocId || null,
        bomSpecId: isProductionDoc && bomSpecId ? bomSpecId : null,
        vatRate,
        warehouseId: needsWarehouse ? warehouseId || null : null,
        targetWarehouseId:
          isTransferDoc || isProductionDoc ? targetWarehouseId || warehouseId || null : null,
        counterpartyId: isTradeDoc || isCashDoc ? counterpartyId || null : null,
        cashAccountId: isCashDoc ? cashAccountId || null : null,
        cashflowCategoryId: isCashDoc ? cashflowCategoryId || null : null,
        priceTypeId:
          isPriceDoc || docType === 'sales_invoice' || isOrderDoc ? priceTypeId || null : null,
        totalAmount: isCashDoc ? Number(totalAmount) : undefined,
        comment,
        lines: isCashDoc ? [] : lines,
        autoPost,
      };

      let savedDoc: DocumentFull;
      if (currentDocId) {
        savedDoc = await apiFetch<DocumentFull>(`/api/documents/${currentDocId}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
      } else {
        savedDoc = await apiFetch<DocumentFull>('/api/documents', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        setCurrentDocId(savedDoc.id);
      }
      onSaved();
      qc.invalidateQueries({ queryKey: ['doc-relations', savedDoc.id] });
      if (closeAfter) {
        onClose();
      } else {
        setInfoMsg(`Документ №${savedDoc.docNumber} збережено!`);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleLinkParent = async () => {
    if (!currentDocId) return;
    setError(null);
    setInfoMsg(null);
    try {
      await apiFetch(`/api/documents/${currentDocId}/link-parent`, {
        method: 'PATCH',
        body: JSON.stringify({ parentDocId: linkSelectId || null }),
      });
      setParentDocId(linkSelectId);
      setInfoMsg(linkSelectId ? 'Документ-підставу прив’язано!' : 'Прив’язку знято');
      qc.invalidateQueries({ queryKey: ['doc-relations', currentDocId] });
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const handleCreateRelated = async (targetDocType: DocumentType) => {
    if (!currentDocId) return;
    setError(null);
    setInfoMsg(null);
    setSaving(true);
    try {
      const created = await apiFetch<DocumentFull>(
        `/api/documents/${currentDocId}/create-related`,
        {
          method: 'POST',
          body: JSON.stringify({ targetDocType, autoPost: false }),
        }
      );
      onSaved();
      qc.invalidateQueries({ queryKey: ['doc-relations', currentDocId] });
      // Одразу відкриваємо створений зв'язаний документ у цьому ж вікні!
      setCurrentDocId(created.id);
      setDocType(created.docType);
      setActiveTab('main');
      setInfoMsg(
        `Створено пов’язаний документ ${DOC_TYPE_META[created.docType].label} №${created.docNumber}. Перевірте та натисніть «Провести».`
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const jumpToDocument = (target: RelatedDocNode) => {
    setCurrentDocId(target.id);
    setDocType(target.docType);
    setActiveTab('main');
    setInfoMsg(null);
    setError(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-xs">
      <div className="animate-modal-in flex max-h-[92vh] w-full max-w-5xl flex-col rounded-2xl border border-slate-200 bg-white shadow-2xl">
        {/* Modal Header + Tabs */}
        <div className="border-b border-slate-200 px-6 pt-4 pb-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span
                  className={`rounded-md border px-2 py-0.5 text-[11px] font-semibold ${DOC_TYPE_META[docType].color}`}
                >
                  {DOC_TYPE_META[docType].short}
                </span>
                <h2 className="font-display text-base font-bold text-slate-900">
                  {currentDocId
                    ? `${DOC_TYPE_META[docType].label} №${docNumber || '...'}`
                    : `Новий документ: ${DOC_TYPE_META[docType].label}`}
                </h2>
              </div>
              <p className="mt-0.5 text-xs text-slate-500">
                Швидкий пошук клієнтів і товарів зі створенням на льоту · Зв’язки та історія змін
              </p>
            </div>
            <div className="flex items-center gap-2">
              {currentDocId && (
                <button
                  type="button"
                  onClick={() => setShareOpen(true)}
                  className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700 ring-1 ring-inset ring-emerald-200 hover:bg-emerald-100"
                >
                  <Share2 className="h-3.5 w-3.5" /> Поділитися
                </button>
              )}
              <button
                onClick={onClose}
                aria-label="Закрити"
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* Document Tabs */}
          <div className="mt-3 flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setActiveTab('main')}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                activeTab === 'main'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <FileText className="h-3.5 w-3.5" /> Основне та товари
            </button>
            <button
              type="button"
              disabled={!currentDocId}
              onClick={() => setActiveTab('relations')}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition disabled:opacity-40 ${
                activeTab === 'relations'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <GitBranch className="h-3.5 w-3.5" /> Зв’язки та Створити на підставі
              {relationsQuery.data &&
                relationsQuery.data.children.length + (relationsQuery.data.parent ? 1 : 0) > 0 && (
                  <span className="rounded-full bg-white/25 px-1.5 py-0.2 font-mono text-[10px]">
                    {relationsQuery.data.children.length + (relationsQuery.data.parent ? 1 : 0)}
                  </span>
                )}
            </button>
            <button
              type="button"
              disabled={!currentDocId}
              onClick={() => setActiveTab('history')}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition disabled:opacity-40 ${
                activeTab === 'history'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <History className="h-3.5 w-3.5" /> Історія документа
              {relationsQuery.data && (
                <span className="rounded-full bg-white/25 px-1.5 py-0.2 font-mono text-[10px]">
                  {relationsQuery.data.history.length}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 space-y-5 overflow-y-auto p-6">
          {infoMsg && (
            <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-medium text-emerald-800">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
              <span>{infoMsg}</span>
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
              <span>{error}</span>
            </div>
          )}

          {/* TAB 1: ОСНОВНЕ */}
          {activeTab === 'main' && (
            <>
              {/* ВИБІР ОРГАНІЗАЦІЇ / ФОП (ВІД КОГО ДОКУМЕНТ) */}
              {bootstrap.organizations.length > 0 && (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-indigo-200/80 bg-gradient-to-r from-indigo-50/70 via-white to-emerald-50/50 px-4 py-2.5">
                  <div className="flex items-center gap-2 text-xs">
                    <Building2 className="h-4 w-4 text-indigo-600" />
                    <span className="font-semibold text-slate-700">
                      Від якої організації / ФОП:
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {!currentDocId && bootstrap.organizations.length > 1 ? (
                      <select
                        value={docOrgId}
                        onChange={(e) => handleSelectDocOrg(e.target.value)}
                        className="rounded-lg border border-indigo-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-900 shadow-2xs focus:border-indigo-500 focus:outline-none"
                      >
                        {bootstrap.organizations.map((o) => (
                          <option key={o.id} value={o.id}>
                            [{o.entityType === 'FOP' ? 'ФОП' : 'ТОВ'}] {o.name} —{' '}
                            {TAX_SYSTEM_LABELS[o.taxSystem] ?? ''}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-bold ${
                          selectedOrg.entityType === 'FOP'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-indigo-100 text-indigo-800'
                        }`}
                      >
                        {selectedOrg.entityType === 'FOP' ? 'ФОП' : 'ТОВ'} · {selectedOrg.name}
                      </span>
                    )}
                    <span className="rounded-md bg-slate-100 px-2 py-1 font-mono text-[10px] font-semibold text-slate-600">
                      {selectedOrg.isVatPayer ? `ПДВ ${selectedOrg.vatRate}%` : 'Без ПДВ'}
                    </span>
                    {orgDepartments.length > 0 && (
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] font-semibold text-slate-500">Підрозділ:</span>
                        {orgDepartments.length > 1 ? (
                          <select
                            value={docDeptId}
                            onChange={(e) => setDocDeptId(e.target.value)}
                            className="rounded-lg border border-indigo-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-800 focus:border-indigo-500 focus:outline-none"
                          >
                            {orgDepartments.map((dp) => (
                              <option key={dp.id} value={dp.id}>
                                {dp.name}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="rounded-md bg-indigo-50 px-2 py-1 text-[11px] font-bold text-indigo-800">
                            {orgDepartments[0].name}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">
                    Номер (авто, якщо порожньо)
                  </label>
                  <input
                    type="text"
                    value={docNumber}
                    onChange={(e) => setDocNumber(e.target.value)}
                    placeholder="Автонумерація"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">
                    Дата та час
                  </label>
                  <input
                    type="datetime-local"
                    value={docDate}
                    onChange={(e) => setDocDate(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                  />
                </div>

                {/* РОЗУМНИЙ ПОШУК ТА ШВИДКЕ СТВОРЕННЯ ПОКУПЦЯ / ПОСТАЧАЛЬНИКА */}
                {(isTradeDoc || isCashDoc) && (
                  <div className="md:col-span-1">
                    <label className="mb-1 block text-xs font-semibold text-indigo-700">
                      {docType === 'goods_receipt'
                        ? 'Постачальник (пошук / створити)'
                        : docType === 'sales_invoice' || isOrderDoc || isTaxInvoiceDoc
                          ? 'Покупець / Клієнт (пошук / створити)'
                          : 'Контрагент (пошук / створити)'}
                    </label>
                    <SmartCounterpartyCombobox
                      bootstrap={bootstrap}
                      value={counterpartyId}
                      onChange={setCounterpartyId}
                      defaultRole={docType === 'goods_receipt' ? 'supplier' : 'customer'}
                    />
                  </div>
                )}

                {isProductionDoc && (
                  <div>
                    <label className="mb-1 block text-xs font-medium text-lime-800">
                      Специфікація BOM
                    </label>
                    <select
                      value={bomSpecId}
                      onChange={(e) => fillFromBomSpec(e.target.value)}
                      className="w-full rounded-lg border border-lime-300 bg-lime-50/40 px-3 py-2 text-sm"
                    >
                      <option value="">— Вручну —</option>
                      {bootstrap.bomSpecs.map((b) => (
                        <option key={b.id} value={b.id}>
                          [{b.code}] {b.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {isTaxInvoiceDoc && (
                  <div>
                    <label className="mb-1 block text-xs font-medium text-sky-800">
                      Ставка ПДВ (%)
                    </label>
                    <select
                      value={vatRate}
                      onChange={(e) => setVatRate(Number(e.target.value))}
                      className="w-full rounded-lg border border-sky-300 bg-sky-50/40 px-3 py-2 text-sm"
                    >
                      <option value={20}>20% (Основна ставка ПДВ)</option>
                      <option value={7}>7% (Пільгова ставка)</option>
                      <option value={0}>0% (Нульова)</option>
                    </select>
                  </div>
                )}

                {docType === 'sales_invoice' && (
                  <div>
                    <label className="mb-1 block text-xs font-medium text-cyan-700">
                      На підставі замовлення (зняття резерву)
                    </label>
                    <select
                      value={parentDocId}
                      onChange={(e) => handleSelectOrderBasis(e.target.value)}
                      className="w-full rounded-lg border border-cyan-300 bg-cyan-50/40 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                    >
                      <option value="">— Без замовлення —</option>
                      {activeOrders.map((o) => (
                        <option key={o.id} value={o.id}>
                          №{o.docNumber} · {o.counterpartyName} (резерв:{' '}
                          {fmtQty(o.remainingReservedQty)})
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {((isTradeDoc && !isTaxInvoiceDoc) ||
                  isTransferDoc ||
                  isInventoryDoc ||
                  isProductionDoc ||
                  docType === 'opening_balance') && (
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600">
                      {isTransferDoc
                        ? 'Склад-відправник'
                        : isProductionDoc
                          ? 'Склад сировини'
                          : isOrderDoc
                            ? 'Склад резервування'
                            : 'Склад'}
                    </label>
                    <select
                      value={warehouseId}
                      onChange={(e) => setWarehouseId(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                    >
                      <option value="">— Оберіть склад —</option>
                      {orgWarehouses.map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {isTransferDoc && (
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600">
                      Склад-отримувач
                    </label>
                    <select
                      value={targetWarehouseId}
                      onChange={(e) => setTargetWarehouseId(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    >
                      <option value="">— Оберіть склад —</option>
                      {orgWarehouses.map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {(isPriceDoc || docType === 'sales_invoice' || isOrderDoc) && (
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600">
                      Тип цін (автопідстановка)
                    </label>
                    <select
                      value={priceTypeId}
                      onChange={(e) => setPriceTypeId(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    >
                      <option value="">— Вручну —</option>
                      {bootstrap.priceTypes.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {isCashDoc && (
                  <>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-600">
                        Каса / Банківський рахунок
                      </label>
                      <select
                        value={cashAccountId}
                        onChange={(e) => setCashAccountId(e.target.value)}
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      >
                        {orgCashAccounts.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.name} ({a.currency})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-600">
                        Стаття РГК (Cash Flow)
                      </label>
                      <select
                        value={cashflowCategoryId}
                        onChange={(e) => setCashflowCategoryId(e.target.value)}
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      >
                        <option value="">— Оберіть статтю —</option>
                        {bootstrap.cashflowCategories
                          .filter((c) => c.direction === (docType === 'money_in' ? 'IN' : 'OUT'))
                          .map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name} {c.isOperatingExpense ? '(витрати P&L)' : ''}
                            </option>
                          ))}
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-600">
                        Сума документа
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        value={totalAmount}
                        onChange={(e) => setTotalAmount(e.target.value)}
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm"
                      />
                    </div>
                  </>
                )}
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Коментар</label>
                <input
                  type="text"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Призначення операції або примітка..."
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                />
              </div>

              {/* ЗАРПЛАТА */}
              {isPayrollDoc && (
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-slate-800">
                      Розрахункова відомість (ПДФО 18%, ВЗ 5%, ЄСВ 22%)
                    </h3>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={fillPayrollFromStaff}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-medium text-rose-800 hover:bg-rose-100"
                      >
                        <Users className="h-3.5 w-3.5" /> Заповнити за штатом
                      </button>
                      <button
                        type="button"
                        onClick={addLine}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-700"
                      >
                        <Plus className="h-3.5 w-3.5" /> Додати
                      </button>
                    </div>
                  </div>
                  <div className="overflow-x-auto rounded-xl border border-slate-200">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 text-slate-600">
                        <tr>
                          <th className="w-8 px-3 py-2">#</th>
                          <th className="px-3 py-2">Співробітник</th>
                          <th className="w-32 px-3 py-2 text-right">Нараховано (₴)</th>
                          <th className="w-28 px-3 py-2 text-right">ПДФО 18%</th>
                          <th className="w-24 px-3 py-2 text-right">ВЗ 5%</th>
                          <th className="w-28 px-3 py-2 text-right text-emerald-700">На руки</th>
                          <th className="w-28 px-3 py-2 text-right text-indigo-700">ЄСВ 22%</th>
                          <th className="w-10 px-2 py-2"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {lines.map((line, idx) => {
                          const gross = Number(line.amount || line.price || 0);
                          const pdfo = Number((gross * 0.18).toFixed(2));
                          const vz = Number((gross * 0.05).toFixed(2));
                          const net = Number((gross - pdfo - vz).toFixed(2));
                          const esv = Number((gross * 0.22).toFixed(2));
                          return (
                            <tr key={idx}>
                              <td className="px-3 py-2 text-slate-400">{idx + 1}</td>
                              <td className="px-3 py-2">
                                <select
                                  value={line.employeeId ?? ''}
                                  onChange={(e) => updateLine(idx, { employeeId: e.target.value })}
                                  className="w-full rounded-md border border-slate-200 px-2 py-1.5 text-xs"
                                >
                                  <option value="">— Співробітник —</option>
                                  {bootstrap.employees.map((emp) => (
                                    <option key={emp.id} value={emp.id}>
                                      {emp.fullName} — {emp.position}
                                    </option>
                                  ))}
                                </select>
                              </td>
                              <td className="px-3 py-2">
                                <input
                                  type="number"
                                  step="100"
                                  value={line.amount}
                                  onChange={(e) =>
                                    updateLine(idx, {
                                      amount: e.target.value,
                                      price: e.target.value,
                                    })
                                  }
                                  className="w-full rounded-md border border-slate-200 px-2 py-1.5 text-right font-mono text-xs"
                                />
                              </td>
                              <td className="px-3 py-2 text-right font-mono text-rose-700">
                                {fmtMoney(pdfo, '')}
                              </td>
                              <td className="px-3 py-2 text-right font-mono text-rose-700">
                                {fmtMoney(vz, '')}
                              </td>
                              <td className="px-3 py-2 text-right font-mono font-bold text-emerald-700">
                                {fmtMoney(net, '')}
                              </td>
                              <td className="px-3 py-2 text-right font-mono text-indigo-700">
                                {fmtMoney(esv, '')}
                              </td>
                              <td className="px-2 py-2 text-center">
                                <button
                                  type="button"
                                  onClick={() => removeLine(idx)}
                                  className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* РУЧНІ ПРОВОДКИ */}
              {isManualJournal && (
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-slate-800">
                      Бухгалтерські проводки (План рахунків №291)
                    </h3>
                    <button
                      type="button"
                      onClick={addLine}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-fuchsia-50 px-3 py-1.5 text-xs font-medium text-fuchsia-700 hover:bg-fuchsia-100"
                    >
                      <Plus className="h-3.5 w-3.5" /> Додати проводку
                    </button>
                  </div>
                  <div className="overflow-x-auto rounded-xl border border-slate-200">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 text-slate-600">
                        <tr>
                          <th className="w-8 px-3 py-2">#</th>
                          <th className="px-3 py-2">Рахунок Дт</th>
                          <th className="px-3 py-2">Рахунок Кт</th>
                          <th className="w-32 px-3 py-2 text-right">Сума (₴)</th>
                          <th className="px-3 py-2">Зміст</th>
                          <th className="w-10 px-2 py-2"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {lines.map((line, idx) => (
                          <tr key={idx}>
                            <td className="px-3 py-2 text-slate-400">{idx + 1}</td>
                            <td className="px-3 py-2">
                              <select
                                value={line.debitAccountCode ?? ''}
                                onChange={(e) =>
                                  updateLine(idx, { debitAccountCode: e.target.value })
                                }
                                className="w-full rounded-md border border-slate-200 px-2 py-1.5 font-mono text-xs"
                              >
                                {bootstrap.chartOfAccounts.map((acc) => (
                                  <option key={acc.code} value={acc.code}>
                                    {acc.code} — {acc.name}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td className="px-3 py-2">
                              <select
                                value={line.creditAccountCode ?? ''}
                                onChange={(e) =>
                                  updateLine(idx, { creditAccountCode: e.target.value })
                                }
                                className="w-full rounded-md border border-slate-200 px-2 py-1.5 font-mono text-xs"
                              >
                                {bootstrap.chartOfAccounts.map((acc) => (
                                  <option key={acc.code} value={acc.code}>
                                    {acc.code} — {acc.name}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td className="px-3 py-2">
                              <input
                                type="number"
                                step="0.01"
                                value={line.amount}
                                onChange={(e) => updateLine(idx, { amount: e.target.value })}
                                className="w-full rounded-md border border-slate-200 px-2 py-1.5 text-right font-mono text-xs"
                              />
                            </td>
                            <td className="px-3 py-2">
                              <input
                                type="text"
                                value={line.notes ?? ''}
                                onChange={(e) => updateLine(idx, { notes: e.target.value })}
                                className="w-full rounded-md border border-slate-200 px-2 py-1.5 text-xs"
                              />
                            </td>
                            <td className="px-2 py-2 text-center">
                              <button
                                type="button"
                                onClick={() => removeLine(idx)}
                                className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* ТОВАРНІ ДОКУМЕНТИ — ЗІ ШВИДКИМ ПОШУКОМ ТА СТВОРЕННЯМ НОВОГО ТОВАРУ + КАТЕГОРІЇ */}
              {!isCashDoc && !isManualJournal && !isPayrollDoc && (
                <div className="space-y-3">
                  {/* Панель супер-швидкого додавання товару */}
                  <div className="rounded-xl border border-indigo-200 bg-indigo-50/40 p-3">
                    <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
                      <span className="flex items-center gap-1.5 text-xs font-bold text-indigo-900">
                        <Sparkles className="h-3.5 w-3.5 text-indigo-600" />
                        Швидко додати товар (введіть назву / артикул — якщо немає, створіть одразу з
                        категорією)
                      </span>
                      <div className="flex items-center gap-2">
                        {isInventoryDoc && (
                          <button
                            type="button"
                            onClick={handleFillInventoryFromStock}
                            className="inline-flex items-center gap-1 rounded-lg border border-orange-200 bg-orange-50 px-2.5 py-1 text-[11px] font-semibold text-orange-800 hover:bg-orange-100"
                          >
                            <RefreshCw className="h-3 w-3" /> Заповнити залишками
                          </button>
                        )}
                        {isProductionDoc && bomSpecId && (
                          <button
                            type="button"
                            onClick={() => fillFromBomSpec(bomSpecId)}
                            className="inline-flex items-center gap-1 rounded-lg border border-lime-200 bg-lime-50 px-2.5 py-1 text-[11px] font-semibold text-lime-800 hover:bg-lime-100"
                          >
                            <Cpu className="h-3 w-3" /> За специфікацією BOM
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={addLine}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
                        >
                          <Plus className="h-3 w-3" /> Порожній рядок
                        </button>
                      </div>
                    </div>
                    <SmartItemCombobox
                      bootstrap={bootstrap}
                      value=""
                      onChange={quickAddItemToOrder}
                      latestPrices={latestPrices}
                      resetOnSelect
                      placeholder="Почніть друкувати назву товару, артикул або штрихкод і натисніть Enter..."
                    />
                  </div>

                  <div className="overflow-visible rounded-xl border border-slate-200">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 text-slate-600">
                        <tr>
                          <th className="w-8 px-3 py-2">#</th>
                          {isProductionDoc && <th className="w-32 px-3 py-2">Роль</th>}
                          <th className="px-3 py-2">Номенклатура (пошук / створити новий)</th>
                          {isInventoryDoc && (
                            <th className="w-24 px-3 py-2 text-right">Облік</th>
                          )}
                          {!isPriceDoc && (
                            <th className="w-24 px-3 py-2 text-right">
                              {isInventoryDoc ? 'Факт' : 'К-сть'}
                            </th>
                          )}
                          {isInventoryDoc && (
                            <th className="w-24 px-3 py-2 text-right">Різниця</th>
                          )}
                          {!isTransferDoc && !isProductionDoc && (
                            <th className="w-28 px-3 py-2 text-right">Ціна (₴)</th>
                          )}
                          {!isPriceDoc && !isTransferDoc && !isInventoryDoc && !isProductionDoc && (
                            <th className="w-32 px-3 py-2 text-right">Сума (₴)</th>
                          )}
                          <th className="w-10 px-2 py-2"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {lines.length === 0 && (
                          <tr>
                            <td colSpan={7} className="px-4 py-6 text-center text-xs text-slate-400">
                              Скористайтеся рядком пошуку вище, щоб миттєво додати товари в документ
                            </td>
                          </tr>
                        )}
                        {lines.map((line, idx) => {
                          const invDiff = Number(line.qty || 0) - Number(line.bookQty || 0);
                          return (
                            <tr key={idx}>
                              <td className="px-3 py-2 text-slate-400">{idx + 1}</td>
                              {isProductionDoc && (
                                <td className="px-3 py-2">
                                  <select
                                    value={line.lineRole ?? 'COMPONENT'}
                                    onChange={(e) => updateLine(idx, { lineRole: e.target.value })}
                                    className={`w-full rounded-md border px-2 py-1 text-xs font-medium ${
                                      line.lineRole === 'OUTPUT'
                                        ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                                        : 'border-amber-300 bg-amber-50 text-amber-800'
                                    }`}
                                  >
                                    <option value="OUTPUT">Випуск</option>
                                    <option value="COMPONENT">Компонент</option>
                                  </select>
                                </td>
                              )}
                              <td className="px-3 py-2">
                                <SmartItemCombobox
                                  bootstrap={bootstrap}
                                  value={line.itemId ?? ''}
                                  onChange={(id) => updateLine(idx, { itemId: id })}
                                  latestPrices={latestPrices}
                                />
                              </td>
                              {isInventoryDoc && (
                                <td className="px-3 py-2 text-right font-mono text-slate-500">
                                  {fmtQty(line.bookQty ?? 0)}
                                </td>
                              )}
                              {!isPriceDoc && (
                                <td className="px-3 py-2">
                                  <input
                                    type="number"
                                    step="0.01"
                                    value={line.qty}
                                    onChange={(e) => updateLine(idx, { qty: e.target.value })}
                                    className="w-full rounded-md border border-slate-200 px-2 py-1.5 text-right font-mono text-xs tabular-nums focus:border-indigo-500 focus:outline-none"
                                  />
                                </td>
                              )}
                              {isInventoryDoc && (
                                <td
                                  className={`px-3 py-2 text-right font-mono font-semibold ${
                                    invDiff > 0
                                      ? 'text-emerald-700'
                                      : invDiff < 0
                                        ? 'text-rose-700'
                                        : 'text-slate-400'
                                  }`}
                                >
                                  {invDiff > 0 ? `+${fmtQty(invDiff)}` : fmtQty(invDiff)}
                                </td>
                              )}
                              {!isTransferDoc && !isProductionDoc && (
                                <td className="px-3 py-2">
                                  <input
                                    type="number"
                                    step="0.01"
                                    value={line.price}
                                    onChange={(e) => updateLine(idx, { price: e.target.value })}
                                    className="w-full rounded-md border border-slate-200 px-2 py-1.5 text-right font-mono text-xs tabular-nums focus:border-indigo-500 focus:outline-none"
                                  />
                                </td>
                              )}
                              {!isPriceDoc &&
                                !isTransferDoc &&
                                !isInventoryDoc &&
                                !isProductionDoc && (
                                  <td className="px-3 py-2 text-right font-mono font-semibold tabular-nums text-slate-900">
                                    {fmtMoney(line.amount, '')}
                                  </td>
                                )}
                              <td className="px-2 py-2 text-center">
                                <button
                                  type="button"
                                  onClick={() => removeLine(idx)}
                                  className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {!isPriceDoc && !isTransferDoc && !isInventoryDoc && !isProductionDoc && (
                    <div className="flex justify-end text-sm font-bold text-slate-900">
                      Разом по документу:{' '}
                      <span className="ml-2 font-mono tabular-nums text-indigo-700">
                        {fmtMoney(computedLinesTotal)}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {/* TAB 2: ЗВ'ЯЗКИ ДОКУМЕНТА ТА «СТВОРИТИ НА ПІДСТАВІ» */}
          {activeTab === 'relations' && relationsQuery.data && (
            <div className="space-y-6">
              {/* Створити новий документ на підставі поточного */}
              <div className="rounded-2xl border border-indigo-200 bg-indigo-50/40 p-5">
                <h3 className="font-display text-sm font-bold text-indigo-950">
                  Створити інший документ на основі №{docNumber}
                </h3>
                <p className="mt-0.5 text-xs text-slate-600">
                  Усі реквізити (клієнт, склад, товари, сума) перенесуться автоматично, а документи
                  зв’яжуться в дерево підпорядкованості
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {relationsQuery.data.availableNextActions.map((act) => (
                    <button
                      key={act.targetType}
                      type="button"
                      disabled={saving}
                      onClick={() => handleCreateRelated(act.targetType)}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3.5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-indigo-700 disabled:opacity-50"
                    >
                      <Plus className="h-3.5 w-3.5" /> {act.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Прив'язка документа-підстави */}
              <div className="rounded-2xl border border-slate-200 bg-white p-5">
                <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900">
                  <Link2 className="h-4 w-4 text-indigo-600" /> Прив’язати документ-підставу
                </h3>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <select
                    value={linkSelectId}
                    onChange={(e) => setLinkSelectId(e.target.value)}
                    className="min-w-[300px] flex-1 rounded-lg border border-slate-300 px-3 py-2 text-xs"
                  >
                    <option value="">— Без документа-підстави —</option>
                    {relationsQuery.data.linkableDocuments.map((dRow) => (
                      <option key={dRow.id} value={dRow.id}>
                        {DOC_TYPE_META[dRow.docType]?.short} №{dRow.docNumber} від{' '}
                        {fmtDate(dRow.docDate)} · {dRow.counterpartyName || '—'} (
                        {fmtMoney(dRow.totalAmount)})
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={handleLinkParent}
                    className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800"
                  >
                    Зберегти зв’язок
                  </button>
                </div>
              </div>

              {/* Дерево підпорядкованості */}
              <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
                <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900">
                  <GitBranch className="h-4 w-4 text-emerald-600" /> Структура підпорядкованості
                  документів
                </h3>

                {/* Батьківський документ */}
                {relationsQuery.data.parent ? (
                  <div>
                    <div className="mb-1 text-[11px] font-semibold uppercase text-slate-400">
                      Документ-підстава (Батьківський)
                    </div>
                    <button
                      type="button"
                      onClick={() => jumpToDocument(relationsQuery.data!.parent!)}
                      className="flex w-full items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-left text-xs hover:border-indigo-300 hover:bg-indigo-50/40"
                    >
                      <div>
                        <span className="font-bold text-slate-900">
                          {DOC_TYPE_META[relationsQuery.data.parent.docType]?.label} №
                          {relationsQuery.data.parent.docNumber}
                        </span>
                        <span className="ml-2 text-slate-500">
                          від {fmtDate(relationsQuery.data.parent.docDate)} ·{' '}
                          {relationsQuery.data.parent.counterpartyName}
                        </span>
                      </div>
                      <span className="flex items-center gap-2 font-mono font-bold text-indigo-700">
                        {fmtMoney(relationsQuery.data.parent.totalAmount)}{' '}
                        <ArrowRight className="h-3.5 w-3.5" />
                      </span>
                    </button>
                  </div>
                ) : (
                  <div className="text-xs text-slate-400">
                    Це кореневий документ (не має батьківського документа-підстави).
                  </div>
                )}

                {/* Поточний документ */}
                <div className="ml-4 border-l-2 border-indigo-400 pl-4">
                  <div className="rounded-xl border-2 border-indigo-500 bg-indigo-50/50 px-4 py-3 text-xs">
                    <span className="font-bold text-indigo-900">
                      ▶ Поточний: {DOC_TYPE_META[docType].label} №{docNumber}
                    </span>
                    <span className="ml-2 font-mono font-bold text-indigo-700">
                      ({fmtMoney(computedLinesTotal || totalAmount)})
                    </span>
                  </div>

                  {/* Дочірні документи */}
                  <div className="mt-3 ml-4 space-y-2 border-l-2 border-emerald-300 pl-4">
                    <div className="text-[11px] font-semibold uppercase text-slate-400">
                      Пов’язані дочірні документи ({relationsQuery.data.children.length})
                    </div>
                    {relationsQuery.data.children.length === 0 ? (
                      <div className="text-xs text-slate-400">
                        На підставі цього документа ще нічого не створено.
                      </div>
                    ) : (
                      relationsQuery.data.children.map((ch) => (
                        <button
                          key={ch.id}
                          type="button"
                          onClick={() => jumpToDocument(ch)}
                          className="flex w-full items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50/40 px-4 py-2.5 text-left text-xs hover:bg-emerald-50"
                        >
                          <div>
                            <span className="font-bold text-slate-900">
                              {DOC_TYPE_META[ch.docType]?.label} №{ch.docNumber}
                            </span>
                            <span className="ml-2 text-slate-500">
                              від {fmtDate(ch.docDate)} ·{' '}
                              {ch.status === 'POSTED' ? 'Проведений' : 'Чернетка'}
                            </span>
                          </div>
                          <span className="flex items-center gap-2 font-mono font-bold text-emerald-700">
                            {fmtMoney(ch.totalAmount)} <ArrowRight className="h-3.5 w-3.5" />
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: ІСТОРІЯ ДОКУМЕНТА */}
          {activeTab === 'history' && relationsQuery.data && (
            <div className="space-y-3">
              <h3 className="font-display text-sm font-bold text-slate-900">
                Повна хронологія змін документа №{docNumber}
              </h3>
              <div className="space-y-2.5">
                {relationsQuery.data.history.map((h) => (
                  <div
                    key={h.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-xs"
                  >
                    <div>
                      <span className="mr-2 rounded bg-indigo-100 px-1.5 py-0.5 font-mono text-[10px] font-bold text-indigo-800">
                        {h.action}
                      </span>
                      <span className="font-semibold text-slate-900">{h.actor}</span>{' '}
                      <span className="text-slate-600">— {h.summary}</span>
                    </div>
                    <span className="font-mono text-[11px] text-slate-400">
                      {new Date(h.at).toLocaleString('uk-UA')}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 bg-slate-50 px-6 py-4 rounded-b-2xl">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Закрити
          </button>
          {activeTab === 'main' && (
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                disabled={saving}
                onClick={() => handleSubmit(false, false)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
              >
                <Save className="h-4 w-4" /> Зберегти чернетку
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => handleSubmit(true, true)}
                className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-xs hover:bg-indigo-700 disabled:opacity-50"
              >
                <CheckCircle2 className="h-4 w-4" /> Провести і закрити
              </button>
            </div>
          )}
        </div>
      </div>

      {shareOpen && currentDocId && (
        <ShareDocumentModal
          documentId={currentDocId}
          docNumber={docNumber}
          onClose={() => setShareOpen(false)}
        />
      )}
    </div>
  );
}
