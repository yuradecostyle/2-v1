import { useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Search, UserPlus, Check, X } from 'lucide-react';
import { apiFetch, type BootstrapData } from '../lib/api';

interface Props {
  bootstrap: BootstrapData;
  value: string;
  onChange: (counterpartyId: string) => void;
  placeholder?: string;
  defaultRole?: 'customer' | 'supplier' | 'both';
}

export function SmartCounterpartyCombobox({
  bootstrap,
  value,
  onChange,
  placeholder = 'Почніть вводити клієнта, телефон або ЄДРПОУ...',
  defaultRole = 'customer',
}: Props) {
  const qc = useQueryClient();
  const containerRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlightIdx, setHighlightIdx] = useState(0);

  // Quick-create inline state
  const [creatingMode, setCreatingMode] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newEdrpou, setNewEdrpou] = useState('');
  const [isCustomer, setIsCustomer] = useState(defaultRole !== 'supplier');
  const [isSupplier, setIsSupplier] = useState(defaultRole !== 'customer');
  const [saving, setSaving] = useState(false);

  const selected = useMemo(
    () => bootstrap.counterparties.find((c) => c.id === value) ?? null,
    [bootstrap.counterparties, value]
  );

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setCreatingMode(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const filtered = useMemo(() => {
    const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return bootstrap.counterparties.slice(0, 12);
    return bootstrap.counterparties
      .filter((c) => {
        const hay = `${c.name} ${c.edrpou} ${c.phone} ${c.email}`.toLowerCase();
        return tokens.every((t) => hay.includes(t));
      })
      .slice(0, 12);
  }, [bootstrap.counterparties, query]);

  const openQuickCreate = () => {
    setNewName(query.trim());
    setNewPhone('');
    setNewEdrpou('');
    setIsCustomer(defaultRole !== 'supplier');
    setIsSupplier(defaultRole !== 'customer');
    setCreatingMode(true);
  };

  const handleQuickCreate = async () => {
    if (!newName.trim()) return;
    setSaving(true);
    try {
      const created = await apiFetch<{ id: string }>('/api/catalogs/counterparties', {
        method: 'POST',
        body: JSON.stringify({
          name: newName.trim(),
          phone: newPhone.trim(),
          edrpou: newEdrpou.trim(),
          isCustomer,
          isSupplier,
        }),
      });
      await qc.invalidateQueries({ queryKey: ['bootstrap'] });
      onChange(created.id);
      setQuery('');
      setCreatingMode(false);
      setOpen(false);
    } finally {
      setSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (creatingMode) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIdx((i) => Math.min(i + 1, filtered.length));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filtered[highlightIdx]) {
        onChange(filtered[highlightIdx].id);
        setQuery('');
        setOpen(false);
      } else if (query.trim()) {
        openQuickCreate();
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <div className="relative flex items-center">
        <Search className="pointer-events-none absolute left-2.5 h-3.5 w-3.5 text-slate-400" />
        <input
          type="text"
          value={open ? query : selected ? selected.name : ''}
          onFocus={() => {
            setOpen(true);
            setHighlightIdx(0);
          }}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setCreatingMode(false);
            setHighlightIdx(0);
          }}
          onKeyDown={handleKeyDown}
          placeholder={selected ? selected.name : placeholder}
          className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-8 pr-7 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 focus:outline-none"
        />
        {value && (
          <button
            type="button"
            title="Очистити"
            onClick={() => {
              onChange('');
              setQuery('');
              setOpen(true);
            }}
            className="absolute right-2 rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {open && (
        <div className="animate-modal-in absolute left-0 right-0 z-50 mt-1.5 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
          {!creatingMode ? (
            <>
              <div className="max-h-56 overflow-y-auto p-1">
                {filtered.map((cp, idx) => (
                  <button
                    key={cp.id}
                    type="button"
                    onClick={() => {
                      onChange(cp.id);
                      setQuery('');
                      setOpen(false);
                    }}
                    className={`flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-xs transition ${
                      idx === highlightIdx
                        ? 'bg-indigo-50 text-indigo-900'
                        : 'text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="truncate font-semibold text-slate-900">{cp.name}</div>
                      <div className="truncate text-[11px] text-slate-500">
                        {cp.edrpou ? `ЄДРПОУ: ${cp.edrpou}` : ''}
                        {cp.phone ? ` · ${cp.phone}` : ''}
                      </div>
                    </div>
                    {cp.id === value && <Check className="h-3.5 w-3.5 shrink-0 text-indigo-600" />}
                  </button>
                ))}
                {filtered.length === 0 && (
                  <div className="px-3 py-3 text-center text-xs text-slate-400">
                    Клієнта «{query}» не знайдено в базі
                  </div>
                )}
              </div>

              <div className="border-t border-slate-100 bg-slate-50 p-1.5">
                <button
                  type="button"
                  onClick={openQuickCreate}
                  className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-700"
                >
                  <UserPlus className="h-3.5 w-3.5" />
                  {query.trim()
                    ? `Швидко створити «${query.trim()}»`
                    : '+ Створити нового клієнта / контрагента'}
                </button>
              </div>
            </>
          ) : (
            <div className="space-y-2.5 p-3 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-bold text-indigo-700">Швидке створення контрагента</span>
                <button
                  type="button"
                  onClick={() => setCreatingMode(false)}
                  className="text-slate-400 hover:text-slate-600"
                >
                  Назад
                </button>
              </div>
              <input
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Назва / ПІБ клієнта *"
                className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs focus:border-indigo-500 focus:outline-none"
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                  placeholder="Телефон (+380...)"
                  className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs focus:border-indigo-500 focus:outline-none"
                />
                <input
                  value={newEdrpou}
                  onChange={(e) => setNewEdrpou(e.target.value)}
                  placeholder="ЄДРПОУ / ІПН (опц.)"
                  className="rounded-lg border border-slate-300 px-2.5 py-1.5 font-mono text-xs focus:border-indigo-500 focus:outline-none"
                />
              </div>
              <div className="flex items-center gap-4 text-[11px] text-slate-600">
                <label className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={isCustomer}
                    onChange={(e) => setIsCustomer(e.target.checked)}
                  />
                  Покупець
                </label>
                <label className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={isSupplier}
                    onChange={(e) => setIsSupplier(e.target.checked)}
                  />
                  Постачальник
                </label>
              </div>
              <button
                type="button"
                disabled={saving || !newName.trim()}
                onClick={handleQuickCreate}
                className="w-full rounded-lg bg-emerald-600 py-2 font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {saving ? 'Створення...' : 'Створити і вибрати'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
