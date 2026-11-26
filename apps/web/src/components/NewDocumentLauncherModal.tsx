import { useState } from 'react';
import {
  X,
  ShoppingBag,
  PackagePlus,
  ClipboardList,
  CreditCard,
  RotateCcw,
  Banknote,
  Users,
  ClipboardCheck,
} from 'lucide-react';
import { canAccessDocType, type BootstrapData, type DocumentType } from '../lib/api';
import { OverlayDialog } from './OverlayDialog';
import { SmartCounterpartyCombobox } from './SmartCounterpartyCombobox';

export interface DocLauncherTile {
  id: string;
  label: string;
  docType: DocumentType;
  icon: typeof ShoppingBag;
  bgVar: string;
  inkVar: string;
}

const LAUNCHER_TILES: DocLauncherTile[] = [
  {
    id: 'sales',
    label: 'Продаж',
    docType: 'sales_invoice',
    icon: ShoppingBag,
    bgVar: 'var(--info-soft)',
    inkVar: 'var(--info-ink)',
  },
  {
    id: 'receipt',
    label: 'Прихід',
    docType: 'goods_receipt',
    icon: PackagePlus,
    bgVar: 'var(--pos-soft)',
    inkVar: 'var(--pos-ink)',
  },
  {
    id: 'order',
    label: 'Замовлення',
    docType: 'customer_order',
    icon: ClipboardList,
    bgVar: 'var(--warn-soft)',
    inkVar: 'var(--warn-ink)',
  },
  {
    id: 'payment',
    label: 'Платіж',
    docType: 'money_in',
    icon: CreditCard,
    bgVar: 'var(--violet-soft)',
    inkVar: 'var(--violet-ink)',
  },
  {
    id: 'return',
    label: 'Повернення',
    docType: 'stock_transfer',
    icon: RotateCcw,
    bgVar: 'var(--neg-soft)',
    inkVar: 'var(--neg-ink)',
  },
  {
    id: 'cash',
    label: 'Каса',
    docType: 'money_out',
    icon: Banknote,
    bgVar: 'var(--pos-soft)',
    inkVar: 'var(--pos-ink)',
  },
  {
    id: 'payroll',
    label: 'Зарплата',
    docType: 'payroll_sheet',
    icon: Users,
    bgVar: 'var(--primary-soft)',
    inkVar: 'var(--primary-ink)',
  },
  {
    id: 'inventory',
    label: 'Інвентаризація',
    docType: 'inventory_count',
    icon: ClipboardCheck,
    bgVar: 'var(--neutral-soft)',
    inkVar: 'var(--neutral-ink)',
  },
];

interface Props {
  bootstrap: BootstrapData;
  initialDocType?: DocumentType;
  onClose: () => void;
  onProceed: (params: {
    docType: DocumentType;
    counterpartyId?: string;
    docDate?: string;
  }) => void;
}

export function NewDocumentLauncherModal({
  bootstrap,
  initialDocType = 'sales_invoice',
  onClose,
  onProceed,
}: Props) {
  const perms = bootstrap.currentUser?.effectivePermissions;
  const visibleTiles = LAUNCHER_TILES.filter((t) => canAccessDocType(perms, t.docType));
  const tilesToRender = visibleTiles.length > 0 ? visibleTiles : LAUNCHER_TILES;
  const initialTile =
    tilesToRender.find((t) => t.docType === initialDocType) ?? tilesToRender[0];
  const [selectedId, setSelectedId] = useState<string>(initialTile.id);
  const [counterpartyId, setCounterpartyId] = useState<string>('');
  const [dateStr, setDateStr] = useState<string>(() => new Date().toISOString().slice(0, 10));

  const selectedTile =
    tilesToRender.find((t) => t.id === selectedId) ?? tilesToRender[0];

  const handleSubmit = (e: React.FormEvent, requestClose: () => void) => {
    e.preventDefault();
    const docDateIso = dateStr ? `${dateStr}T${new Date().toTimeString().slice(0, 5)}` : undefined;
    requestClose();
    window.setTimeout(() => {
      onProceed({
        docType: selectedTile.docType,
        counterpartyId: counterpartyId || undefined,
        docDate: docDateIso,
      });
    }, 10);
  };

  return (
    <OverlayDialog
      ariaLabel="Новий документ"
      variant="center"
      maxWidthClass="max-w-[640px]"
      onClose={onClose}
    >
      {(requestClose) => (
        <form
          onSubmit={(e) => handleSubmit(e, requestClose)}
          className="flex flex-col overflow-y-auto"
          style={{ padding: '26px', gap: '20px' }}
        >
          {/* Header */}
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="overline-label" style={{ color: 'var(--primary)' }}>
                Швидке оформлення
              </div>
              <h2
                className="font-display font-extrabold"
                style={{ fontSize: '22px', color: 'var(--text)', letterSpacing: '-0.02em' }}
              >
                Новий документ
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

          {/* 4x2 Grid of Document Types */}
          <div>
            <div className="mb-2.5 text-[13px] font-bold" style={{ color: 'var(--text-2)' }}>
              Тип документа
            </div>
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              {tilesToRender.map((tile) => {
                const isSelected = tile.id === selectedTile.id;
                const Icon = tile.icon;
                return (
                  <button
                    key={tile.id}
                    type="button"
                    data-autofocus={isSelected ? 'true' : undefined}
                    onClick={() => setSelectedId(tile.id)}
                    aria-pressed={isSelected}
                    className="flex h-[76px] flex-col items-center justify-center gap-1.5 px-2 text-center transition"
                    style={{
                      borderRadius: 'var(--r-md)',
                      background: isSelected ? 'var(--primary-soft)' : 'var(--surface-2)',
                      border: isSelected
                        ? '2px solid var(--primary)'
                        : '1px solid var(--border)',
                      color: isSelected ? 'var(--primary-ink)' : 'var(--text)',
                    }}
                  >
                    <span
                      className="flex h-7 w-7 items-center justify-center rounded-full"
                      style={{
                        background: tile.bgVar,
                        color: tile.inkVar,
                      }}
                    >
                      <Icon className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <span className="text-[12px] font-bold leading-tight">{tile.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Counterparty & Date fields */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor="launcher-cp"
                className="mb-1.5 block text-[13px] font-bold"
                style={{ color: 'var(--text-2)' }}
              >
                Контрагент
              </label>
              <div id="launcher-cp">
                <SmartCounterpartyCombobox
                  bootstrap={bootstrap}
                  value={counterpartyId}
                  onChange={setCounterpartyId}
                  defaultRole={selectedTile.docType === 'goods_receipt' ? 'supplier' : 'customer'}
                  placeholder="Пошук або швидке створення..."
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="launcher-date"
                className="mb-1.5 block text-[13px] font-bold"
                style={{ color: 'var(--text-2)' }}
              >
                Дата
              </label>
              <input
                id="launcher-date"
                type="date"
                value={dateStr}
                onChange={(e) => setDateStr(e.target.value)}
                className="min-h-[44px] w-full px-3.5 text-[14px] font-mono"
                style={{
                  borderRadius: 'var(--r-sm)',
                  border: '1px solid var(--border-strong)',
                  background: 'var(--surface)',
                  color: 'var(--text)',
                }}
              />
            </div>
          </div>

          {/* Actions */}
          <div
            className="flex flex-wrap items-center justify-end gap-3 pt-4"
            style={{ borderTop: '1px solid var(--border)' }}
          >
            <button
              type="button"
              onClick={requestClose}
              className="min-h-[44px] px-5 text-[14px] font-bold transition"
              style={{
                borderRadius: 'var(--r-sm)',
                border: '1px solid var(--border-strong)',
                background: 'var(--surface)',
                color: 'var(--text-2)',
              }}
            >
              Скасувати
            </button>
            <button
              type="submit"
              className="min-h-[44px] px-6 text-[14px] font-extrabold transition"
              style={{
                borderRadius: 'var(--r-sm)',
                background: 'linear-gradient(135deg, var(--primary), var(--primary-2))',
                color: 'var(--surface)',
                boxShadow: 'var(--shadow-primary)',
              }}
            >
              Створити: {selectedTile.label}
            </button>
          </div>
        </form>
      )}
    </OverlayDialog>
  );
}
