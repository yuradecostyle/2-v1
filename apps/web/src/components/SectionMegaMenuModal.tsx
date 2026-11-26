import { useMemo, useState } from 'react';
import { X, Search, ArrowRight, Sparkles, Plus, SlidersHorizontal } from 'lucide-react';
import type { DocumentType } from '../lib/api';
import { type MenuSection, type MenuSubItem } from '../lib/menuConfig';
import { OverlayDialog } from './OverlayDialog';

interface Props {
  section: MenuSection;
  activeItemId?: string | null;
  onSelectItem: (section: MenuSection, groupTitle: string, item: MenuSubItem) => void;
  onOpenSectionDefault: (section: MenuSection) => void;
  onQuickCreateDoc?: (docType: DocumentType) => void;
  onOpenMenuSettings?: () => void;
  onClose: () => void;
}

export function SectionMegaMenuModal({
  section,
  activeItemId,
  onSelectItem,
  onOpenSectionDefault,
  onQuickCreateDoc,
  onOpenMenuSettings,
  onClose,
}: Props) {
  const [filter, setFilter] = useState('');

  const filteredGroups = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return section.groups;
    return section.groups
      .map((g) => ({
        ...g,
        items: g.items.filter(
          (it) =>
            it.label.toLowerCase().includes(q) || g.title.toLowerCase().includes(q)
        ),
      }))
      .filter((g) => g.items.length > 0);
  }, [section.groups, filter]);

  const totalItems = section.groups.reduce((acc, g) => acc + g.items.length, 0);

  return (
    <OverlayDialog
      ariaLabel={`Меню розділу ${section.label}`}
      variant="top"
      maxWidthClass="max-w-[980px]"
      onClose={onClose}
    >
      {(requestClose) => (
        <div className="flex max-h-[calc(100vh-130px)] flex-col">
          {/* Header */}
          <div
            className="flex flex-wrap items-center justify-between gap-3 px-6 py-4"
            style={{
              borderBottom: '1px solid var(--border)',
              background: 'var(--surface-2)',
            }}
          >
            <div className="min-w-0">
              <div className="overline-label" style={{ color: 'var(--primary)' }}>
                Розділ · {totalItems} пунктів
              </div>
              <h2
                className="mt-0.5 font-display font-extrabold"
                style={{ fontSize: '22px', color: 'var(--text)', letterSpacing: '-0.02em' }}
              >
                {section.label}
              </h2>
              <p className="text-[13px]" style={{ color: 'var(--muted)' }}>
                {section.subtitle}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              {/* Quick filter inside this section */}
              <div
                className="flex min-h-[44px] items-center gap-2 px-3.5"
                style={{
                  background: 'var(--surface)',
                  border: '1px solid var(--border-strong)',
                  borderRadius: 'var(--r-pill)',
                }}
              >
                <Search className="h-4 w-4" style={{ color: 'var(--muted)' }} aria-hidden="true" />
                <input
                  type="text"
                  data-autofocus="true"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  placeholder={`Пошук у «${section.label}»...`}
                  aria-label={`Пошук пунктів у розділі ${section.label}`}
                  className="w-44 bg-transparent text-[13px] font-medium focus:outline-none sm:w-52"
                  style={{ color: 'var(--text)' }}
                />
              </div>

              {onOpenMenuSettings && (
                <button
                  type="button"
                  onClick={() => {
                    requestClose();
                    window.setTimeout(onOpenMenuSettings, 10);
                  }}
                  title="Налаштувати пункти цього меню"
                  className="inline-flex min-h-[44px] items-center gap-1.5 px-3.5 text-[12px] font-bold transition"
                  style={{
                    borderRadius: 'var(--r-pill)',
                    background: 'var(--surface)',
                    border: '1px solid var(--border-strong)',
                    color: 'var(--text-2)',
                  }}
                >
                  <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
                  <span className="hidden sm:inline">Налаштувати меню</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => {
                  requestClose();
                  window.setTimeout(() => onOpenSectionDefault(section), 10);
                }}
                className="inline-flex min-h-[44px] items-center gap-1.5 px-4 text-[13px] font-bold transition"
                style={{
                  borderRadius: 'var(--r-pill)',
                  background: 'var(--primary-soft)',
                  color: 'var(--primary-ink)',
                }}
              >
                <span>Основний екран</span>
                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </button>

              <button
                type="button"
                onClick={requestClose}
                aria-label="Закрити"
                className="flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-full"
                style={{
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  color: 'var(--muted)',
                }}
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
          </div>

          {/* Multi-column Groups Grid */}
          <div className="flex-1 overflow-y-auto p-6">
            {filteredGroups.length === 0 ? (
              <div
                className="border-2 border-dashed py-10 text-center text-[14px]"
                style={{
                  borderColor: 'var(--border-strong)',
                  borderRadius: 'var(--r-md)',
                  color: 'var(--muted)',
                }}
              >
                У розділі «{section.label}» не знайдено пунктів за запитом «{filter}».
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {filteredGroups.map((group) => (
                  <section
                    key={group.title}
                    className="flex flex-col gap-2 p-4"
                    style={{
                      background: 'var(--surface-2)',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--r-lg)',
                    }}
                  >
                    <h3
                      className="overline-label px-2 pb-1.5"
                      style={{
                        color: 'var(--primary)',
                        borderBottom: '1px solid var(--border)',
                      }}
                    >
                      {group.title}
                    </h3>

                    <div className="space-y-0.5">
                      {group.items.map((item) => {
                        const isCurrent = item.id === activeItemId;
                        const isDirectCore = item.target.kind !== 'module';
                        const docTypeToCreate =
                          item.target.kind === 'documents' && item.target.docType
                            ? (item.target.docType as DocumentType)
                            : null;
                        return (
                          <div
                            key={item.id}
                            className="flex items-center gap-1"
                            style={{
                              borderRadius: 'var(--r-sm)',
                              background: isCurrent ? 'var(--primary-soft)' : 'transparent',
                            }}
                          >
                            <button
                              type="button"
                              onClick={() => {
                                requestClose();
                                window.setTimeout(
                                  () => onSelectItem(section, group.title, item),
                                  10
                                );
                              }}
                              className="group flex min-h-[38px] min-w-0 flex-1 items-center justify-between gap-2 px-2.5 py-1.5 text-left text-[13.5px] font-semibold transition"
                              style={{
                                color: isCurrent ? 'var(--primary-ink)' : 'var(--text)',
                              }}
                            >
                              <span className="min-w-0 truncate">{item.label}</span>
                              {!docTypeToCreate && isDirectCore && (
                                <Sparkles
                                  className="h-3.5 w-3.5 shrink-0 opacity-60"
                                  style={{ color: 'var(--primary)' }}
                                  aria-hidden="true"
                                />
                              )}
                            </button>
                            {docTypeToCreate && onQuickCreateDoc && (
                              <button
                                type="button"
                                title={`Створити «${item.label}» у спливаючому вікні`}
                                aria-label={`Створити ${item.label}`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  requestClose();
                                  window.setTimeout(() => onQuickCreateDoc(docTypeToCreate), 10);
                                }}
                                className="mr-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition"
                                style={{
                                  background: 'var(--primary-soft)',
                                  color: 'var(--primary-ink)',
                                }}
                              >
                                <Plus className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </section>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </OverlayDialog>
  );
}
