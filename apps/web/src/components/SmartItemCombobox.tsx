import { useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Search, PackagePlus, Check, FolderPlus } from 'lucide-react';
import { apiFetch, fmtMoney, type BootstrapData } from '../lib/api';

interface Props {
  bootstrap: BootstrapData;
  value: string;
  onChange: (itemId: string) => void;
  latestPrices?: Record<string, string>;
  placeholder?: string;
  resetOnSelect?: boolean;
}

function generateAutoSku(name: string): string {
  const letters = name
    .replace(/[^a-zA-Z0-9А-Яа-яІіЇїЄє]/g, '')
    .slice(0, 4)
    .toUpperCase();
  const rnd = String(Math.floor(100 + Math.random() * 900));
  return `${letters || 'ITEM'}-${rnd}`;
}

export function SmartItemCombobox({
  bootstrap,
  value,
  onChange,
  latestPrices,
  placeholder = 'Пошук товару за назвою, артикулом або штрихкодом...',
  resetOnSelect = false,
}: Props) {
  const qc = useQueryClient();
  const containerRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlightIdx, setHighlightIdx] = useState(0);

  // Quick-create new item + category inline
  const [creatingMode, setCreatingMode] = useState(false);
  const [newName, setNewName] = useState('');
  const [newSku, setNewSku] = useState('');
  const [newCategoryId, setNewCategoryId] = useState(bootstrap.categories[0]?.id ?? '');
  const [newCategoryName, setNewCategoryName] = useState('');
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [newUnit, setNewUnit] = useState('шт');
  const [newItemType, setNewItemType] = useState<'GOODS' | 'SERVICE'>('GOODS');
  const [saving, setSaving] = useState(false);

  const catMap = useMemo(
    () => new Map(bootstrap.categories.map((c) => [c.id, c.name])),
    [bootstrap.categories]
  );

  const selected = useMemo(
    () => bootstrap.items.find((i) => i.id === value) ?? null,
    [bootstrap.items, value]
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
    if (tokens.length === 0) return bootstrap.items.slice(0, 14);
    return bootstrap.items
      .filter((it) => {
        const cat = it.categoryId ? (catMap.get(it.categoryId) ?? '') : '';
        const hay = `${it.name} ${it.sku} ${it.barcode} ${cat}`.toLowerCase();
        return tokens.every((t) => hay.includes(t));
      })
      .slice(0, 14);
  }, [bootstrap.items, catMap, query]);

  const openQuickCreate = () => {
    const baseName = query.trim();
    setNewName(baseName);
    setNewSku(generateAutoSku(baseName));
    setNewCategoryId(bootstrap.categories[0]?.id ?? '');
    setNewCategoryName('');
    setCreatingCategory(false);
    setNewUnit('шт');
    setNewItemType('GOODS');
    setCreatingMode(true);
  };

  const handleCreateItem = async () => {
    if (!newName.trim()) return;
    setSaving(true);
    try {
      let finalCatId: string | null = newCategoryId || null;
      if (creatingCategory && newCategoryName.trim()) {
        const createdCat = await apiFetch<{ id: string }>('/api/catalogs/categories', {
          method: 'POST',
          body: JSON.stringify({ name: newCategoryName.trim() }),
        });
        finalCatId = createdCat.id;
      }

      const createdItem = await apiFetch<{ id: string }>('/api/catalogs/items', {
        method: 'POST',
        body: JSON.stringify({
          sku: newSku.trim() || generateAutoSku(newName),
          name: newName.trim(),
          categoryId: finalCatId,
          unit: newUnit.trim() || 'шт',
          itemType: newItemType,
        }),
      });
      await qc.invalidateQueries({ queryKey: ['bootstrap'] });
      onChange(createdItem.id);
      setQuery('');
      setCreatingMode(false);
      setOpen(false);
    } finally {
      setSaving(false);
    }
  };

  const selectItem = (id: string) => {
    onChange(id);
    if (resetOnSelect) {
      setQuery('');
    } else {
      setQuery('');
      setOpen(false);
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
        selectItem(filtered[highlightIdx].id);
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
          value={
            open || resetOnSelect
              ? query
              : selected
                ? `[${selected.sku}] ${selected.name}`
                : ''
          }
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
          placeholder={selected && !resetOnSelect ? `[${selected.sku}] ${selected.name}` : placeholder}
          className="w-full rounded-lg border border-slate-200 bg-white py-1.5 pl-8 pr-2.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 focus:outline-none"
        />
      </div>

      {open && (
        <div className="animate-modal-in absolute left-0 right-0 z-50 mt-1 min-w-[320px] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl">
          {!creatingMode ? (
            <>
              <div className="max-h-60 overflow-y-auto p-1">
                {filtered.map((it, idx) => {
                  const cat = it.categoryId ? catMap.get(it.categoryId) : '';
                  const price = latestPrices?.[it.id];
                  return (
                    <button
                      key={it.id}
                      type="button"
                      onClick={() => selectItem(it.id)}
                      className={`flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition ${
                        idx === highlightIdx
                          ? 'bg-indigo-50 text-indigo-900'
                          : 'text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="truncate font-semibold text-slate-900">{it.name}</div>
                        <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
                          <span className="font-mono">{it.sku}</span>
                          {cat && (
                            <span className="rounded bg-slate-100 px-1.5 py-0.2 text-slate-600">
                              {cat}
                            </span>
                          )}
                          <span>· {it.unit}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {price && (
                          <span className="font-mono text-[11px] font-bold text-emerald-700">
                            {fmtMoney(price)}
                          </span>
                        )}
                        {it.id === value && !resetOnSelect && (
                          <Check className="h-3.5 w-3.5 text-indigo-600" />
                        )}
                      </div>
                    </button>
                  );
                })}
                {filtered.length === 0 && (
                  <div className="px-3 py-3 text-center text-xs text-slate-400">
                    Товар «{query}» відсутній у довіднику
                  </div>
                )}
              </div>

              <div className="border-t border-slate-100 bg-slate-50 p-1.5">
                <button
                  type="button"
                  onClick={openQuickCreate}
                  className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-700"
                >
                  <PackagePlus className="h-3.5 w-3.5" />
                  {query.trim()
                    ? `+ Створити товар «${query.trim()}» з категорією`
                    : '+ Створити новий товар'}
                </button>
              </div>
            </>
          ) : (
            <div className="space-y-2.5 p-3.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-bold text-indigo-700">Новий товар (додавання на льоту)</span>
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
                placeholder="Назва товару *"
                className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs focus:border-indigo-500 focus:outline-none"
              />

              {/* Категорія товару + можливість створити нову категорію одразу */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-medium text-slate-600">Категорія товару</label>
                  <button
                    type="button"
                    onClick={() => setCreatingCategory((v) => !v)}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-600 hover:underline"
                  >
                    <FolderPlus className="h-3 w-3" />
                    {creatingCategory ? 'Обрати існуючу' : '+ Нова категорія'}
                  </button>
                </div>
                {creatingCategory ? (
                  <input
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                    placeholder="Назва нової категорії (напр. Кабелі та адаптери)"
                    className="w-full rounded-lg border border-indigo-300 bg-indigo-50/30 px-2.5 py-1.5 text-xs focus:border-indigo-500 focus:outline-none"
                  />
                ) : (
                  <select
                    value={newCategoryId}
                    onChange={(e) => setNewCategoryId(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs"
                  >
                    <option value="">— Без категорії —</option>
                    {bootstrap.categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div className="grid grid-cols-3 gap-2">
                <input
                  value={newSku}
                  onChange={(e) => setNewSku(e.target.value)}
                  placeholder="Артикул"
                  className="rounded-lg border border-slate-300 px-2 py-1.5 font-mono text-xs"
                />
                <input
                  value={newUnit}
                  onChange={(e) => setNewUnit(e.target.value)}
                  placeholder="Од. (шт)"
                  className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs"
                />
                <select
                  value={newItemType}
                  onChange={(e) => setNewItemType(e.target.value as 'GOODS' | 'SERVICE')}
                  className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs"
                >
                  <option value="GOODS">Товар</option>
                  <option value="SERVICE">Послуга</option>
                </select>
              </div>

              <button
                type="button"
                disabled={saving || !newName.trim()}
                onClick={handleCreateItem}
                className="w-full rounded-lg bg-emerald-600 py-2 font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {saving ? 'Створення...' : 'Створити товар і додати в документ'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
