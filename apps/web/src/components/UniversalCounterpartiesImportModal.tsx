import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  X,
  Upload,
  Users,
  FileSpreadsheet,
  FileCode2,
  FileText,
  CheckCircle2,
  AlertCircle,
  Trash2,
  Loader2,
} from 'lucide-react';
import {
  apiFetch,
  type ParsedImportCounterparty,
  type UniversalCounterpartiesCommitResult,
  type UniversalCounterpartiesParseResult,
} from '../lib/api';
import { OverlayDialog } from './OverlayDialog';

interface SelectableCpRow extends ParsedImportCounterparty {
  selected: boolean;
}

function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  const chunkSize = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const slice = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...slice);
  }
  return btoa(binary);
}

export function UniversalCounterpartiesImportModal({
  onClose,
  onImported,
}: {
  onClose: () => void;
  onImported?: (res: UniversalCounterpartiesCommitResult) => void;
}) {
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [dragging, setDragging] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [parseResult, setParseResult] = useState<UniversalCounterpartiesParseResult | null>(null);
  const [rows, setRows] = useState<SelectableCpRow[]>([]);
  const [createDefaultContracts, setCreateDefaultContracts] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [commitResult, setCommitResult] = useState<UniversalCounterpartiesCommitResult | null>(null);

  const processFile = async (file: File) => {
    setError(null);
    setCommitResult(null);
    setParsing(true);
    try {
      if (file.size > 20 * 1024 * 1024) {
        throw new Error('Файл завеликий (максимум 20 МБ).');
      }
      const buffer = await file.arrayBuffer();
      const contentBase64 = arrayBufferToBase64(buffer);
      const parsed = await apiFetch<UniversalCounterpartiesParseResult>(
        '/api/import/counterparties/parse-file',
        {
          method: 'POST',
          body: JSON.stringify({
            filename: file.name,
            contentBase64,
            mimeType: file.type || undefined,
          }),
        }
      );
      setParseResult(parsed);
      setRows(parsed.counterparties.map((c) => ({ ...c, selected: true })));
      if (parsed.counterparties.length === 0 && parsed.warnings.length === 0) {
        setError(
          'Не вдалося знайти рядки покупців або контрагентів у файлі. Перевірте колонки (Назва / ЄДРПОУ / Телефон / Email).'
        );
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setParsing(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void processFile(file);
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void processFile(file);
  };

  const selectedRows = rows.filter((r) => r.selected && r.name.trim().length > 0);
  const allSelected = rows.length > 0 && rows.every((r) => r.selected);

  const updateRow = (idx: number, patch: Partial<SelectableCpRow>) => {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };

  const removeRow = (idx: number) => {
    setRows((prev) => prev.filter((_, i) => i !== idx));
  };

  const applyBulkRole = (mode: 'CUSTOMER' | 'SUPPLIER' | 'BOTH') => {
    setRows((prev) =>
      prev.map((r) => ({
        ...r,
        isCustomer: mode === 'CUSTOMER' || mode === 'BOTH',
        isSupplier: mode === 'SUPPLIER' || mode === 'BOTH',
      }))
    );
  };

  const handleCommit = async () => {
    if (selectedRows.length === 0) {
      setError('Оберіть хоча б одного контрагента для імпорту.');
      return;
    }
    setError(null);
    setCommitting(true);
    try {
      const res = await apiFetch<UniversalCounterpartiesCommitResult>(
        '/api/import/counterparties/commit',
        {
          method: 'POST',
          body: JSON.stringify({
            counterparties: selectedRows.map((r) => ({
              name: r.name.trim(),
              edrpou: r.edrpou.trim(),
              ipn: r.ipn.trim(),
              iban: r.iban.trim(),
              phone: r.phone.trim(),
              email: r.email.trim(),
              isCustomer: r.isCustomer,
              isSupplier: r.isSupplier,
            })),
            createDefaultContracts,
          }),
        }
      );
      setCommitResult(res);
      qc.invalidateQueries({ queryKey: ['bootstrap'] });
      onImported?.(res);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCommitting(false);
    }
  };

  return (
    <OverlayDialog
      ariaLabel="Універсальний імпорт покупців та контрагентів"
      variant="center"
      maxWidthClass="max-w-5xl"
      onClose={onClose}
    >
      {(requestClose) => (
        <div className="flex max-h-[90vh] flex-col">
          {/* Header */}
          <div
            className="flex items-center justify-between gap-3 px-6 py-4"
            style={{
              background: 'var(--surface-2)',
              borderBottom: '1px solid var(--border)',
            }}
          >
            <div>
              <div className="overline-label flex items-center gap-1.5" style={{ color: 'var(--primary)' }}>
                <Users className="h-3.5 w-3.5" aria-hidden="true" />
                База клієнтів і постачальників
              </div>
              <h2 className="mt-0.5 font-display text-lg font-extrabold" style={{ color: 'var(--text)' }}>
                Імпорт покупців та контрагентів із PDF, Excel (XLS/XLSX), CSV та XML
              </h2>
              <p className="text-xs" style={{ color: 'var(--muted)' }}>
                Автоматичне розпізнавання назв, ЄДРПОУ/ІПН, телефонів, E-mail, IBAN, ролей
                (Покупець/Постачальник) та створення договорів без дублікатів
              </p>
            </div>
            <button
              type="button"
              onClick={requestClose}
              aria-label="Закрити"
              className="flex h-10 w-10 items-center justify-center rounded-full"
              style={{
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                color: 'var(--muted)',
              }}
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 space-y-4 overflow-y-auto p-6">
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click();
              }}
              className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed p-6 text-center transition"
              style={{
                borderColor: dragging ? 'var(--primary)' : 'var(--border-strong)',
                background: dragging ? 'var(--primary-soft)' : 'var(--surface-2)',
              }}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.xlsx,.xls,.ods,.csv,.tsv,.xml,.txt"
                onChange={handleFileChange}
                className="hidden"
              />

              {parsing ? (
                <div className="flex flex-col items-center gap-2 py-2">
                  <Loader2 className="h-8 w-8 animate-spin" style={{ color: 'var(--primary)' }} />
                  <div className="text-sm font-bold" style={{ color: 'var(--text)' }}>
                    Розпізнаємо список покупців та контрагентів...
                  </div>
                </div>
              ) : (
                <>
                  <div
                    className="flex h-12 w-12 items-center justify-center rounded-2xl"
                    style={{ background: 'var(--pos-soft)', color: 'var(--pos-ink)' }}
                  >
                    <Upload className="h-6 w-6" />
                  </div>
                  <div>
                    <div className="text-sm font-extrabold" style={{ color: 'var(--text)' }}>
                      Перетягніть файл із клієнтами/постачальниками або натисніть для вибору
                    </div>
                    <div className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>
                      Вивантаження з 1С / BAS, Google Contacts, Excel-таблиці, PDF-реєстри або XML
                    </div>
                  </div>
                  <div className="flex flex-wrap justify-center gap-1.5">
                    {[
                      { label: 'Excel (XLSX / XLS)', icon: FileSpreadsheet },
                      { label: 'CSV / TSV (BAS / 1С)', icon: FileSpreadsheet },
                      { label: 'XML (1С / CRM)', icon: FileCode2 },
                      { label: 'PDF-списки', icon: FileText },
                    ].map((b) => (
                      <span
                        key={b.label}
                        className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold"
                        style={{
                          background: 'var(--surface)',
                          border: '1px solid var(--border)',
                          color: 'var(--text-2)',
                        }}
                      >
                        <b.icon className="h-3 w-3" style={{ color: 'var(--primary)' }} />
                        {b.label}
                      </span>
                    ))}
                  </div>
                </>
              )}
            </div>

            {error && (
              <div
                className="flex items-start gap-2 rounded-xl px-4 py-3 text-xs font-semibold"
                style={{ background: 'var(--neg-soft)', color: 'var(--neg-ink)' }}
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {commitResult && (
              <div
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl px-4 py-3 text-xs font-bold"
                style={{ background: 'var(--pos-soft)', color: 'var(--pos-ink)' }}
              >
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  <span>
                    Готово! Створено нових контрагентів: {commitResult.created}, оновлено:{' '}
                    {commitResult.updated}, створено договорів: {commitResult.contractsCreated}.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={requestClose}
                  className="rounded-lg px-3 py-1 text-xs font-extrabold"
                  style={{ background: 'var(--surface)', color: 'var(--pos-ink)' }}
                >
                  Закрити
                </button>
              </div>
            )}

            {parseResult && (
              <div className="space-y-3">
                <div
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl px-4 py-3 text-xs"
                  style={{
                    background: 'var(--surface-2)',
                    border: '1px solid var(--border)',
                  }}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className="rounded-md px-2 py-0.5 font-mono text-[11px] font-extrabold"
                      style={{ background: 'var(--primary-soft)', color: 'var(--primary-ink)' }}
                    >
                      {parseResult.format}
                    </span>
                    <span className="font-bold" style={{ color: 'var(--text)' }}>
                      {parseResult.filename}
                    </span>
                    <span style={{ color: 'var(--muted)' }}>
                      · Знайдено: <strong>{rows.length}</strong> (обрано:{' '}
                      <strong>{selectedRows.length}</strong>)
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold" style={{ color: 'var(--text-2)' }}>
                      Призначити всім:
                    </span>
                    <button
                      type="button"
                      onClick={() => applyBulkRole('CUSTOMER')}
                      className="rounded-lg px-2.5 py-1 text-[11px] font-bold"
                      style={{ background: 'var(--pos-soft)', color: 'var(--pos-ink)' }}
                    >
                      Покупці
                    </button>
                    <button
                      type="button"
                      onClick={() => applyBulkRole('SUPPLIER')}
                      className="rounded-lg px-2.5 py-1 text-[11px] font-bold"
                      style={{ background: 'var(--info-soft)', color: 'var(--info-ink)' }}
                    >
                      Постачальники
                    </button>
                    <button
                      type="button"
                      onClick={() => applyBulkRole('BOTH')}
                      className="rounded-lg px-2.5 py-1 text-[11px] font-bold"
                      style={{ background: 'var(--violet-soft)', color: 'var(--violet-ink)' }}
                    >
                      Обидва
                    </button>
                    <label className="ml-2 flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={createDefaultContracts}
                        onChange={(e) => setCreateDefaultContracts(e.target.checked)}
                      />
                      <span className="font-semibold" style={{ color: 'var(--text-2)' }}>
                        Створити договори
                      </span>
                    </label>
                  </div>
                </div>

                {parseResult.warnings.length > 0 && (
                  <div
                    className="space-y-1 rounded-xl px-4 py-2.5 text-xs"
                    style={{ background: 'var(--warn-soft)', color: 'var(--warn-ink)' }}
                  >
                    {parseResult.warnings.map((w, i) => (
                      <div key={i}>• {w}</div>
                    ))}
                  </div>
                )}

                {rows.length > 0 && (
                  <div
                    className="max-h-[380px] overflow-auto rounded-xl"
                    style={{ border: '1px solid var(--border)' }}
                  >
                    <table className="w-full text-left text-xs">
                      <thead
                        className="sticky top-0 z-10"
                        style={{
                          background: 'var(--surface-2)',
                          borderBottom: '1px solid var(--border)',
                          color: 'var(--muted)',
                        }}
                      >
                        <tr>
                          <th className="w-9 px-3 py-2 text-center">
                            <input
                              type="checkbox"
                              checked={allSelected}
                              onChange={(e) =>
                                setRows((prev) =>
                                  prev.map((r) => ({ ...r, selected: e.target.checked }))
                                )
                              }
                            />
                          </th>
                          <th className="px-2 py-2">Найменування / ПІБ</th>
                          <th className="w-28 px-2 py-2">ЄДРПОУ / ІПН</th>
                          <th className="w-32 px-2 py-2">Телефон</th>
                          <th className="w-36 px-2 py-2">E-mail</th>
                          <th className="w-40 px-2 py-2">IBAN</th>
                          <th className="w-32 px-2 py-2">Роль</th>
                          <th className="w-8 px-2 py-2"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((r, idx) => (
                          <tr
                            key={idx}
                            style={{
                              borderBottom: '1px solid var(--border)',
                              opacity: r.selected ? 1 : 0.45,
                            }}
                          >
                            <td className="px-3 py-1.5 text-center">
                              <input
                                type="checkbox"
                                checked={r.selected}
                                onChange={(e) =>
                                  updateRow(idx, { selected: e.target.checked })
                                }
                              />
                            </td>
                            <td className="px-2 py-1.5">
                              <input
                                value={r.name}
                                onChange={(e) => updateRow(idx, { name: e.target.value })}
                                className="w-full rounded border px-1.5 py-1 text-xs font-medium"
                                style={{
                                  borderColor: 'var(--border)',
                                  background: 'var(--surface)',
                                  color: 'var(--text)',
                                }}
                              />
                            </td>
                            <td className="px-2 py-1.5">
                              <input
                                value={r.edrpou}
                                onChange={(e) => updateRow(idx, { edrpou: e.target.value })}
                                className="w-full rounded border px-1.5 py-1 font-mono text-[11px]"
                                style={{
                                  borderColor: 'var(--border)',
                                  background: 'var(--surface)',
                                  color: 'var(--text)',
                                }}
                              />
                            </td>
                            <td className="px-2 py-1.5">
                              <input
                                value={r.phone}
                                onChange={(e) => updateRow(idx, { phone: e.target.value })}
                                className="w-full rounded border px-1.5 py-1 text-xs"
                                style={{
                                  borderColor: 'var(--border)',
                                  background: 'var(--surface)',
                                  color: 'var(--text)',
                                }}
                              />
                            </td>
                            <td className="px-2 py-1.5">
                              <input
                                value={r.email}
                                onChange={(e) => updateRow(idx, { email: e.target.value })}
                                className="w-full rounded border px-1.5 py-1 text-xs"
                                style={{
                                  borderColor: 'var(--border)',
                                  background: 'var(--surface)',
                                  color: 'var(--text)',
                                }}
                              />
                            </td>
                            <td className="px-2 py-1.5">
                              <input
                                value={r.iban}
                                onChange={(e) => updateRow(idx, { iban: e.target.value })}
                                className="w-full rounded border px-1.5 py-1 font-mono text-[11px]"
                                style={{
                                  borderColor: 'var(--border)',
                                  background: 'var(--surface)',
                                  color: 'var(--text)',
                                }}
                              />
                            </td>
                            <td className="px-2 py-1.5">
                              <div className="flex gap-2">
                                <label className="flex items-center gap-1 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={r.isCustomer}
                                    onChange={(e) =>
                                      updateRow(idx, { isCustomer: e.target.checked })
                                    }
                                  />
                                  <span>Пок.</span>
                                </label>
                                <label className="flex items-center gap-1 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={r.isSupplier}
                                    onChange={(e) =>
                                      updateRow(idx, { isSupplier: e.target.checked })
                                    }
                                  />
                                  <span>Пост.</span>
                                </label>
                              </div>
                            </td>
                            <td className="px-2 py-1.5 text-center">
                              <button
                                type="button"
                                onClick={() => removeRow(idx)}
                                aria-label="Видалити рядок"
                                className="rounded p-1"
                                style={{ color: 'var(--muted)' }}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <div
            className="flex flex-wrap items-center justify-between gap-2 px-6 py-3.5"
            style={{
              background: 'var(--surface-2)',
              borderTop: '1px solid var(--border)',
            }}
          >
            <button
              type="button"
              onClick={requestClose}
              className="rounded-xl px-4 py-2 text-xs font-bold"
              style={{
                background: 'var(--surface)',
                border: '1px solid var(--border-strong)',
                color: 'var(--text-2)',
              }}
            >
              Закрити
            </button>
            <button
              type="button"
              disabled={committing || selectedRows.length === 0}
              onClick={handleCommit}
              className="inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-xs font-extrabold transition disabled:opacity-45"
              style={{
                background: 'linear-gradient(135deg, var(--primary), var(--primary-2))',
                color: 'var(--surface)',
              }}
            >
              {committing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="h-4 w-4" />
              )}
              <span>Імпортувати контрагентів ({selectedRows.length})</span>
            </button>
          </div>
        </div>
      )}
    </OverlayDialog>
  );
}
