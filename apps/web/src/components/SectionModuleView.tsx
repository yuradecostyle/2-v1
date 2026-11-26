import { ArrowRight, Plus, Layers, Building2 } from 'lucide-react';
import {
  DOC_TYPE_META,
  type DocumentType,
  type OrganizationDto,
} from '../lib/api';
import { type MenuSection, type MenuSubItem } from '../lib/menuConfig';

interface Props {
  section: MenuSection;
  groupTitle: string;
  item: MenuSubItem;
  organization: OrganizationDto;
  onSelectSibling: (section: MenuSection, groupTitle: string, item: MenuSubItem) => void;
  onCreateDoc: (docType: DocumentType) => void;
  onOpenRelatedPage: (
    page: 'crm' | 'documents' | 'catalogs' | 'accounting' | 'statutory' | 'reports' | 'assets' | 'service'
  ) => void;
}

export function SectionModuleView({
  section,
  groupTitle,
  item,
  organization,
  onSelectSibling,
  onCreateDoc,
  onOpenRelatedPage,
}: Props) {
  const mod = item.target.kind === 'module' ? item.target : null;
  const currentGroup = section.groups.find((g) => g.title === groupTitle);

  return (
    <div className="space-y-6">
      {/* Main Module Card */}
      <section className="bento-tile rise flex flex-col gap-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 max-w-2xl">
            <div className="overline-label" style={{ color: 'var(--primary)' }}>
              {section.label} · {groupTitle}
            </div>
            <h2
              className="mt-1.5 font-display font-extrabold"
              style={{ fontSize: '26px', color: 'var(--text)', letterSpacing: '-0.02em' }}
            >
              {item.label}
            </h2>
            {mod?.description && (
              <p className="mt-2 text-[15px] leading-relaxed" style={{ color: 'var(--text-2)' }}>
                {mod.description}
              </p>
            )}
          </div>

          <span
            className="inline-flex items-center gap-2 px-3.5 py-2 text-[12px] font-bold"
            style={{
              background:
                organization.entityType === 'FOP' ? 'var(--pos-soft)' : 'var(--primary-soft)',
              color:
                organization.entityType === 'FOP' ? 'var(--pos-ink)' : 'var(--primary-ink)',
              borderRadius: 'var(--r-pill)',
            }}
          >
            <Building2 className="h-4 w-4" aria-hidden="true" />
            <span>{organization.name}</span>
          </span>
        </div>

        {/* Action buttons */}
        <div className="flex flex-wrap items-center gap-3 pt-1">
          {mod?.relatedDocType && (
            <button
              type="button"
              onClick={() => onCreateDoc(mod.relatedDocType!)}
              className="inline-flex min-h-[44px] items-center gap-2 px-5 text-[14px] font-extrabold transition"
              style={{
                borderRadius: 'var(--r-sm)',
                background: 'linear-gradient(135deg, var(--primary), var(--primary-2))',
                color: 'var(--surface)',
                boxShadow: 'var(--shadow-primary)',
              }}
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              <span>Створити: {DOC_TYPE_META[mod.relatedDocType].short}</span>
            </button>
          )}

          {mod?.relatedPage && (
            <button
              type="button"
              onClick={() => onOpenRelatedPage(mod.relatedPage!)}
              className="inline-flex min-h-[44px] items-center gap-2 px-5 text-[14px] font-bold transition"
              style={{
                borderRadius: 'var(--r-sm)',
                background: 'var(--primary-soft)',
                color: 'var(--primary-ink)',
              }}
            >
              <span>{mod.relatedRouteLabel ?? 'Відкрити пов’язаний журнал'}</span>
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
        </div>
      </section>

      {/* Sibling links in this group for fast switching */}
      {currentGroup && currentGroup.items.length > 1 && (
        <section className="bento-tile space-y-3">
          <div className="flex items-center gap-2">
            <Layers className="h-4 w-4" style={{ color: 'var(--primary)' }} aria-hidden="true" />
            <h3 className="overline-label" style={{ color: 'var(--muted)' }}>
              Інші підпункти групи «{currentGroup.title}»
            </h3>
          </div>
          <div className="flex flex-wrap gap-2">
            {currentGroup.items.map((sib) => {
              const active = sib.id === item.id;
              return (
                <button
                  key={sib.id}
                  type="button"
                  onClick={() => onSelectSibling(section, currentGroup.title, sib)}
                  className="min-h-[40px] px-4 text-[13px] font-bold transition"
                  style={{
                    borderRadius: 'var(--r-pill)',
                    background: active ? 'var(--text)' : 'var(--surface-2)',
                    color: active ? 'var(--surface)' : 'var(--text-2)',
                    border: '1px solid var(--border)',
                  }}
                >
                  {sib.label}
                </button>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
