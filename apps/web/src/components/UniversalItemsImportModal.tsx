import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  X,
  Upload,
  FileSpreadsheet,
  FileCode2,
  FileText,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Trash2,
  Loader2,
} from 'lucide-react';
import {
  apiFetch,
  type BootstrapData,
  type ParsedImportItem,
  type UniversalCommitResult,
  type UniversalParseResult,
} from '../lib/api';
import { OverlayDialog } from './OverlayDialog';

interface SelectableImportRow extends ParsedImportItem {
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

export function UniversalItemsImportModal({
  bootstrap,
  onClose,
  onImported,
}: {
  bootstrap: BootstrapData;
  onClose: () => void;
  onImported?: (res: UniversalCommitResult) => void;
}) {
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [dragging, setDragging] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [parseResult, setParseResult] = useState<UniversalParseResult | null>(null);
  const [rows, setRows] = useState<SelectableImportRow[]>([]);
  const [defaultCategory, setDefaultCategory] = useState('');
  const [createPriceSetting, setCreatePriceSetting] = useState(true);
  const [priceTypeId, setPriceTypeId] = useState(bootstrap.priceTypes[0]?.id ?? '');
  const [error, setError] = useState<string | null>(null);
  const [commitResult, setCommitResult] = useState<UniversalCommitResult | null>(null);

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
      const parsed = await apiFetch<UniversalParseResult>('/api/import/items/parse-file', {
        method: 'POST',
        body: JSON.stringify({
          filename: file.name,
          contentBase64,
          mimeType: file.type || undefined,
        }),
      });
      setParseResult(parsed);
      setRows(parsed.items.map((it) => ({ ...it, selected: true })));
      if (parsed.items.length === 0 && parsed.warnings.length === 0) {
        setError(
          'Не вдалося знайти рядки товарів у файлі. Перевірте структуру колонок (Назва, Артикул, Ціна) або спробуйте інший файл.'
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
    if (file) {
      void processFile(file);
    }
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      void processFile(file);
    }
  };

  const selectedRows = rows.filter((r) => r.selected && r.name.trim().length > 0);
  const hasAnyPrice = selectedRows.some((r) => Number(r.price) > 0);
  const allSelected = rows.length > 0 && rows.every((r) => r.selected);

  const updateRow = (idx: number, patch: Partial<SelectableImportRow>) => {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };

  const removeRow = (idx: number) => {
    setRows((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleCommit = async () => {
    if (selectedRows.length === 0) {
      setError('Оберіть хоча б одну позицію для імпорту.');
      return;
    }
    setError(null);
    setCommitting(true);
    try {
      const res = await apiFetch<UniversalCommitResult>('/api/import/items/commit', {
        method: 'POST',
        body: JSON.stringify({
          items: selectedRows.map((r) => ({
            sku: r.sku.trim(),
            name: r.name.trim(),
            categoryName: r.categoryName.trim(),
            unit: r.unit.trim() || 'шт',
            price: Number(r.price) || 0,
            barcode: r.barcode.trim(),
            itemType: r.itemType,
          })),
          defaultCategoryName: defaultCategory.trim(),
          createPriceSetting: createPriceSetting && hasAnyPrice,
          priceTypeId: priceTypeId || null,
        }),
      });
      setCommitResult(res);
      qc.invalidateQueries({ queryKey: ['bootstrap'] });
      qc.invalidateQueries({ queryKey: ['documents'] });
      onImported?.(res);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCommitting(false);
    }
  };

  return (
    <OverlayDialog
      ariaLabel="Універсальний імпорт номенклатури з файлів"
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
                <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                Універсальний імпорт каталогу
              </div>
              <h2 className="mt-0.5 font-display text-lg font-extrabold" style={{ color: 'var(--text)' }}>
                Завантаження номенклатури з PDF, Excel (XLS/XLSX), CSV та XML
              </h2>
              <p className="text-xs" style={{ color: 'var(--muted)' }}>
                Підтримуються прайс-листи Excel, PDF-накладні/прайси, CSV (UTF-8 та Windows-1251),
                YML (Prom.ua / Rozetka) та 1С CommerceML XML
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
            {/* Format badges + Drop Zone */}
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
                accept=".pdf,.xlsx,.xls,.ods,.csv,.tsv,.xml,.yml,.txt"
                onChange={handleFileChange}
                className="hidden"
              />

              {parsing ? (
                <div className="flex flex-col items-center gap-2 py-2">
                  <Loader2 className="h-8 w-8 animate-spin" style={{ color: 'var(--primary)' }} />
                  <div className="text-sm font-bold" style={{ color: 'var(--text)' }}>
                    Розпізнаємо структуру файлу та позиції...
                  </div>
                </div>
              ) : (
                <>
                  <div
                    className="flex h-12 w-12 items-center justify-center rounded-2xl"
                    style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}
                  >
                    <Upload className="h-6 w-6" />
                  </div>
                  <div>
                    <div className="text-sm font-extrabold" style={{ color: 'var(--text)' }}>
                      Перетягніть файл сюди або натисніть, щоб обрати з комп’ютера
                    </div>
                    <div className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>
                      Ви зможете перевірити й відредагувати кожен товар перед додаванням у базу
                    </div>
                  </div>
                  <div className="flex flex-wrap justify-center gap-1.5">
                    {[
                      { label: 'PDF (прайси / накладні)', icon: FileText },
                      { label: 'XLSX / XLS / ODS', icon: FileSpreadsheet },
                      { label: 'CSV / TSV (1C / Excel)', icon: FileSpreadsheet },
                      { label: 'XML / YML (Prom / 1С)', icon: FileCode2 },
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
                    Імпорт виконано успішно! Створено нових товарів: {commitResult.created},
                    оновлено: {commitResult.updated}, створено категорій:{' '}
                    {commitResult.categoriesCreated}
                    {commitResult.priceDocNumber
                      ? `, проведено прайс-лист №${commitResult.priceDocNumber}`
                      : ''}
                    .
                  </span>
                </div>
                <button
                  type="button"
                  onClick={requestClose}
                  className="rounded-lg px-3 py-1 text-xs font-extrabold"
                  style={{ background: 'var(--surface)', color: 'var(--pos-ink)' }}
                >
                  Готово
                </button>
              </div>
            )}

            {parseResult && (
              <div className="space-y-3">
                {/* Summary bar */}
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
                      · Знайдено позицій: <strong>{rows.length}</strong> (обрано:{' '}
                      <strong>{selectedRows.length}</strong>)
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <label className="flex items-center gap-1.5">
                      <span className="font-semibold" style={{ color: 'var(--text-2)' }}>
                        Категорія за замовч.:
                      </span>
                      <input
                        type="text"
                        value={defaultCategory}
                        onChange={(e) => setDefaultCategory(e.target.value)}
                        placeholder="напр. Імпорт прайсу"
                        className="w-40 rounded-lg border px-2 py-1 text-xs"
                        style={{
                          borderColor: 'var(--border-strong)',
                          background: 'var(--surface)',
                          color: 'var(--text)',
                        }}
                      />
                    </label>

                    {hasAnyPrice && (
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={createPriceSetting}
                          onChange={(e) => setCreatePriceSetting(e.target.checked)}
                        />
                        <span className="font-semibold" style={{ color: 'var(--text-2)' }}>
                          Встановити ціни в прайс:
                        </span>
                        <select
                          value={priceTypeId}
                          onChange={(e) => setPriceTypeId(e.target.value)}
                          disabled={!createPriceSetting}
                          className="rounded-lg border px-2 py-1 text-xs"
                          style={{
                            borderColor: 'var(--border-strong)',
                            background: 'var(--surface)',
                            color: 'var(--text)',
                          }}
                        >
                          {bootstrap.priceTypes.map((pt) => (
                            <option key={pt.id} value={pt.id}>
                              {pt.name}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
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

                {/* Editable Preview Table */}
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
                          <th className="w-28 px-2 py-2">Артикул</th>
                          <th className="px-2 py-2">Найменування</th>
                          <th className="w-36 px-2 py-2">Категорія</th>
                          <th className="w-16 px-2 py-2">Од.</th>
                          <th className="w-24 px-2 py-2 text-right">Ціна (₴)</th>
                          <th className="w-24 px-2 py-2">Тип</th>
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
                                type="text"
                                value={r.sku}
                                onChange={(e) => updateRow(idx, { sku: e.target.value })}
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
                                type="text"
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
                                type="text"
                                value={r.categoryName}
                                onChange={(e) => updateRow(idx, { categoryName: e.target.value })}
                                placeholder={defaultCategory || 'Без категорії'}
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
                                type="text"
                                value={r.unit}
                                onChange={(e) => updateRow(idx, { unit: e.target.value })}
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
                                type="number"
                                step="0.01"
                                value={r.price}
                                onChange={(e) =>
                                  updateRow(idx, { price: Number(e.target.value) || 0 })
                                }
                                className="w-full rounded border px-1.5 py-1 text-right font-mono text-xs"
                                style={{
                                  borderColor: 'var(--border)',
                                  background: 'var(--surface)',
                                  color: 'var(--text)',
                                }}
                              />
                            </td>
                            <td className="px-2 py-1.5">
                              <select
                                value={r.itemType}
                                onChange={(e) =>
                                  updateRow(idx, {
                                    itemType: e.target.value as 'GOODS' | 'SERVICE',
                                  })
                                }
                                className="w-full rounded border px-1.5 py-1 text-xs"
                                style={{
                                  borderColor: 'var(--border)',
                                  background: 'var(--surface)',
                                  color: 'var(--text)',
                                }}
                              >
                                <option value="GOODS">Товар</option>
                                <option value="SERVICE">Послуга</option>
                              </select>
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
              <span>Імпортувати обрані ({selectedRows.length})</span>
            </button>
          </div>
        </div>
      )}
    </OverlayDialog>
  );
}
