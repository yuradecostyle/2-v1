import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  SlidersHorizontal,
  FileCog,
  Menu as MenuIcon,
  Upload,
  Save,
  RotateCcw,
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  ChevronDown,
  ChevronRight,
  Star,
  CheckCircle2,
  AlertCircle,
  Users,
  Package,
  Printer,
  Building2,
  Network,
  Shield,
} from 'lucide-react';
import {
  apiFetch,
  DOC_TYPE_META,
  type BasFeaturesConfig,
  type BasSettingsDto,
  type BootstrapData,
  type CustomDocFieldDef,
  type DocTypeFieldSettings,
  type DocumentType,
  type MenuCustomizationConfig,
} from '../lib/api';
import { MENU_SECTIONS, type BasSettingsTabKey } from '../lib/menuConfig';
import { UniversalItemsImportModal } from '../components/UniversalItemsImportModal';
import { UniversalCounterpartiesImportModal } from '../components/UniversalCounterpartiesImportModal';

const CONFIGURABLE_DOC_TYPES: DocumentType[] = [
  'customer_order',
  'sales_invoice',
  'goods_receipt',
  'money_in',
  'money_out',
  'stock_transfer',
  'inventory_count',
  'production_order',
  'payroll_sheet',
  'tax_invoice',
  'price_setting',
  'manual_journal',
  'opening_balance',
];

const FEATURE_GROUPS: Array<{
  title: string;
  subtitle: string;
  items: Array<{ key: keyof BasFeaturesConfig; label: string; hint: string; highlight?: boolean }>;
}> = [
  {
    title: 'Продажі, Замовлення та Відвантаження',
    subtitle: 'Робота з замовленнями покупців, знижками, доставкою і товарами під замовлення',
    items: [
      {
        key: 'allowOrderWithoutStock',
        label: 'Товар на замовлення — дозволити проводити в мінус (без залишку на складі)',
        hint: 'Замовлення покупців та відвантаження товарів «під замовлення» проводяться навіть при 0 на складі',
        highlight: true,
      },
      {
        key: 'useDiscounts',
        label: 'Знижки на товари у замовленнях та видаткових накладних',
        hint: 'Поле знижки % по кожному рядку + швидка знижка на документ і відображення на друкованій формі',
      },
      {
        key: 'useOrderStatuses',
        label: 'Статуси замовлень покупців',
        hint: 'Нове → В роботі → Очікує оплати → До відвантаження → Виконано',
      },
      {
        key: 'useContracts',
        label: 'Договори з покупцями і постачальниками',
        hint: 'Прив’язка документів і взаєморозрахунків до конкретного договору',
      },
      {
        key: 'useDeliveryAndTtn',
        label: 'Доставка, адреса та номери ТТН',
        hint: 'Спосіб доставки (Нова Пошта / Кур’єр / Самовивіз), адреса й ТТН у вікні документа',
      },
      {
        key: 'usePrroCheckbox',
        label: 'Роздріб та фіскалізація ПРРО Checkbox',
        hint: 'Швидка фіскалізація чеків ДПС із видаткових накладних',
      },
    ],
  },
  {
    title: 'Склад і Закупівлі',
    subtitle: 'Контроль залишків, резерви та робота з штрихкодами',
    items: [
      {
        key: 'allowNegativeStockGlobal',
        label: 'Дозволити списання в мінус по ВСІХ складських документах (глобально)',
        hint: 'Вимикає блокування нестачі товару для всіх продажів і переміщень організації',
      },
      {
        key: 'useWarehouseReserves',
        label: 'Резервування товарів на складах під замовлення',
        hint: 'Показує фізичний залишок, резерв та вільний залишок у звітах',
      },
      {
        key: 'useBarcodes',
        label: 'Штрихкоди та швидкий пошук товарів',
        hint: 'Пошук і підбір номенклатури за штрихкодом EAN-13 або артикулом',
      },
    ],
  },
  {
    title: 'Інтерфейс та Загальні опції BAS Малий бізнес',
    subtitle: 'Поведінка вікон документів, підрозділи, проєкти та додаткові реквізити',
    items: [
      {
        key: 'alwaysOpenDocsInModal',
        label: 'Відкривати створення кожного документа одразу у спливаючому вікні',
        hint: 'Без проміжних екранів — одразу повна картка документа з усіма полями',
      },
      {
        key: 'useDepartments',
        label: 'Підрозділи, філії та відділи компанії',
        hint: 'Розмежування документів, складів і доступу менеджерів по підрозділах',
      },
      {
        key: 'useProjects',
        label: 'Проєкти та об’єкти обліку',
        hint: 'Поле «Проєкт / Об’єкт» у замовленнях, накладних, платежах і виробництві',
      },
      {
        key: 'useCustomDocFields',
        label: 'Додаткові користувацькі реквізити в документах',
        hint: 'Дозволяє додавати власні поля (текст, число, дата, список) для будь-якого документа',
      },
    ],
  },
  {
    title: 'Розділи системи (CRM, Роботи, Виробництво, Фінанси)',
    subtitle: 'Вмикайте або вимикайте цілі модулі як у BAS Малий бізнес',
    items: [
      { key: 'useCrm', label: 'CRM-воронка (ліди, задачі, дзвінки)', hint: 'Управління лідами та конвертація в замовлення' },
      { key: 'useWorks', label: 'Роботи та послуги (замовлення-наряди, акти)', hint: 'Розділ «Роботи» у головному меню' },
      { key: 'useProductionBom', label: 'Виробництво та комплектація (BOM)', hint: 'Специфікації, списання сировини і випуск продукції' },
      { key: 'useMultiCurrency', label: 'Мультивалютність та курси НБУ (USD / EUR)', hint: 'Валютні рахунки й автоматична переоцінка' },
      { key: 'usePayroll', label: 'Персонал та Зарплата (ПДФО 18%, ВЗ 5%, ЄСВ 22%)', hint: 'Штатний розпис і розрахункові відомості' },
      { key: 'useVatAccounting', label: 'Податкові накладні ПДВ та ЄРПН (J1201015)', hint: 'Податковий облік у розділі Бухгалтерія' },
    ],
  },
];

export function BasSettingsPage({
  bootstrap,
  initialTab = 'features',
  onOpenPrintTemplates,
  onOpenModal,
}: {
  bootstrap: BootstrapData;
  initialTab?: BasSettingsTabKey;
  onOpenPrintTemplates: () => void;
  onOpenModal: (modal: 'organizations' | 'departments' | 'users') => void;
}) {
  const qc = useQueryClient();
  const [tab, setTab] = useState<BasSettingsTabKey>(initialTab);
  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);

  const serverSettings = bootstrap.basSettings;
  const [features, setFeatures] = useState<BasFeaturesConfig>(
    () =>
      serverSettings?.features ?? {
        alwaysOpenDocsInModal: true,
        useDepartments: true,
        useProjects: true,
        useCustomDocFields: true,
        allowOrderWithoutStock: true,
        useDiscounts: true,
        useOrderStatuses: true,
        useContracts: true,
        useDeliveryAndTtn: true,
        usePrroCheckbox: true,
        allowNegativeStockGlobal: false,
        useWarehouseReserves: true,
        useBarcodes: true,
        useCrm: true,
        useWorks: true,
        useProductionBom: true,
        useMultiCurrency: true,
        usePayroll: true,
        useVatAccounting: true,
      }
  );
  const [docFields, setDocFields] = useState<Record<DocumentType, DocTypeFieldSettings>>(
    () => (serverSettings?.docFields ? structuredClone(serverSettings.docFields) : ({} as Record<DocumentType, DocTypeFieldSettings>))
  );
  const [menuConfig, setMenuConfig] = useState<MenuCustomizationConfig>(
    () =>
      serverSettings?.menuConfig
        ? structuredClone(serverSettings.menuConfig)
        : { sections: {}, items: {} }
  );

  useEffect(() => {
    if (!serverSettings) return;
    setFeatures(serverSettings.features);
    setDocFields(structuredClone(serverSettings.docFields));
    setMenuConfig(structuredClone(serverSettings.menuConfig));
  }, [serverSettings]);

  const [selectedDocType, setSelectedDocType] = useState<DocumentType>('customer_order');
  const [newCustomField, setNewCustomField] = useState<{
    label: string;
    type: CustomDocFieldDef['type'];
    optionsText: string;
    required: boolean;
  }>({ label: '', type: 'text', optionsText: '', required: false });

  const [expandedSectionId, setExpandedSectionId] = useState<string>('sales');
  const [saving, setSaving] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [itemsImportOpen, setItemsImportOpen] = useState(false);
  const [cpImportOpen, setCpImportOpen] = useState(false);

  const savePatch = async (
    payload: {
      features?: Partial<BasFeaturesConfig>;
      docFields?: Record<DocumentType, DocTypeFieldSettings>;
      menuConfig?: MenuCustomizationConfig;
    },
    successText: string
  ) => {
    setSaving(true);
    setStatusMsg(null);
    setErrorMsg(null);
    try {
      await apiFetch<BasSettingsDto>('/api/bas-settings', {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
      await qc.invalidateQueries({ queryKey: ['bootstrap'] });
      setStatusMsg(successText);
    } catch (e) {
      setErrorMsg((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const resetScope = async (scope: 'all' | 'features' | 'docFields' | 'menuConfig') => {
    setSaving(true);
    setStatusMsg(null);
    setErrorMsg(null);
    try {
      await apiFetch<BasSettingsDto>('/api/bas-settings/reset', {
        method: 'POST',
        body: JSON.stringify({ scope }),
      });
      await qc.invalidateQueries({ queryKey: ['bootstrap'] });
      setStatusMsg('Налаштування скинуто до стандартних значень BAS Малий бізнес.');
    } catch (e) {
      setErrorMsg((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  // Doc field helpers
  const activeDocConfig = docFields[selectedDocType];
  const updateStdField = (
    fieldKey: string,
    patch: { visible?: boolean; required?: boolean; label?: string }
  ) => {
    setDocFields((prev) => {
      const cur = prev[selectedDocType];
      if (!cur) return prev;
      return {
        ...prev,
        [selectedDocType]: {
          ...cur,
          fields: cur.fields.map((f) => (f.key === fieldKey ? { ...f, ...patch } : f)),
        },
      };
    });
  };

  const addCustomField = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCustomField.label.trim()) return;
    const id = `cf_${Date.now().toString(36)}`;
    const options =
      newCustomField.type === 'select'
        ? newCustomField.optionsText
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
        : undefined;
    setDocFields((prev) => {
      const cur = prev[selectedDocType];
      if (!cur) return prev;
      return {
        ...prev,
        [selectedDocType]: {
          ...cur,
          customFields: [
            ...cur.customFields,
            {
              id,
              label: newCustomField.label.trim(),
              type: newCustomField.type,
              options,
              required: newCustomField.required,
            },
          ],
        },
      };
    });
    setNewCustomField({ label: '', type: 'text', optionsText: '', required: false });
  };

  const removeCustomField = (id: string) => {
    setDocFields((prev) => {
      const cur = prev[selectedDocType];
      if (!cur) return prev;
      return {
        ...prev,
        [selectedDocType]: {
          ...cur,
          customFields: cur.customFields.filter((cf) => cf.id !== id),
        },
      };
    });
  };

  // Menu customization helpers
  const orderedSections = [...MENU_SECTIONS]
    .map((sec, idx) => ({
      sec,
      order: menuConfig.sections[sec.id]?.order ?? idx,
    }))
    .sort((a, b) => a.order - b.order);

  const moveSection = (index: number, direction: -1 | 1) => {
    const targetIdx = index + direction;
    if (targetIdx < 0 || targetIdx >= orderedSections.length) return;
    const copy = orderedSections.map((e) => e.sec.id);
    const [moved] = copy.splice(index, 1);
    copy.splice(targetIdx, 0, moved);
    setMenuConfig((prev) => {
      const nextSections = { ...prev.sections };
      copy.forEach((secId, idx) => {
        nextSections[secId] = { ...(nextSections[secId] ?? {}), order: idx };
      });
      return { ...prev, sections: nextSections };
    });
  };

  const updateSectionOv = (
    secId: string,
    patch: { visible?: boolean; label?: string }
  ) => {
    setMenuConfig((prev) => ({
      ...prev,
      sections: {
        ...prev.sections,
        [secId]: { ...(prev.sections[secId] ?? {}), ...patch },
      },
    }));
  };

  const updateItemOv = (
    itemId: string,
    patch: { visible?: boolean; label?: string; pinned?: boolean }
  ) => {
    setMenuConfig((prev) => ({
      ...prev,
      items: {
        ...prev.items,
        [itemId]: { ...(prev.items[itemId] ?? {}), ...patch },
      },
    }));
  };

  return (
    <div className="space-y-5">
      {/* Tabs bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {[
            { id: 'features' as const, label: 'Ще більше можливостей (BAS)', icon: SlidersHorizontal },
            { id: 'doc-fields' as const, label: 'Поля документів (Конструктор)', icon: FileCog },
            { id: 'menu' as const, label: 'Меню та підменю (Навігація)', icon: MenuIcon },
            { id: 'import' as const, label: 'Імпорт товарів і покупців', icon: Upload },
          ].map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                setTab(t.id);
                setStatusMsg(null);
                setErrorMsg(null);
              }}
              className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition"
              style={{
                background: tab === t.id ? 'var(--primary)' : 'var(--surface)',
                color: tab === t.id ? 'var(--surface)' : 'var(--text-2)',
                border: tab === t.id ? '1px solid var(--primary)' : '1px solid var(--border)',
                boxShadow: 'var(--shadow-soft)',
              }}
            >
              <t.icon className="h-4 w-4" />
              <span>{t.label}</span>
            </button>
          ))}
        </div>
      </div>

      {statusMsg && (
        <div
          className="flex items-center gap-2 rounded-xl px-4 py-3 text-xs font-bold"
          style={{ background: 'var(--pos-soft)', color: 'var(--pos-ink)' }}
        >
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>{statusMsg}</span>
        </div>
      )}
      {errorMsg && (
        <div
          className="flex items-center gap-2 rounded-xl px-4 py-3 text-xs font-bold"
          style={{ background: 'var(--neg-soft)', color: 'var(--neg-ink)' }}
        >
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* TAB 1: ЩЕ БІЛЬШЕ МОЖЛИВОСТЕЙ (ФУНКЦІЇ BAS МАЛИЙ БІЗНЕС) */}
      {tab === 'features' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs" style={{ color: 'var(--muted)' }}>
              Налаштуйте функціональні опції системи під ваш бізнес — точно так само, як у розділі
              «Ще більше можливостей» в BAS Малий бізнес.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={saving}
                onClick={() => resetScope('features')}
                className="inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold"
                style={{
                  background: 'var(--surface)',
                  border: '1px solid var(--border-strong)',
                  color: 'var(--text-2)',
                }}
              >
                <RotateCcw className="h-3.5 w-3.5" /> За замовчуванням
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() =>
                  savePatch(
                    { features },
                    'Функціональні опції BAS Малий бізнес збережено та застосовано!'
                  )
                }
                className="inline-flex items-center gap-1.5 rounded-xl px-5 py-2 text-xs font-extrabold"
                style={{
                  background: 'linear-gradient(135deg, var(--primary), var(--primary-2))',
                  color: 'var(--surface)',
                }}
              >
                <Save className="h-4 w-4" /> Зберегти опції
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {FEATURE_GROUPS.map((grp) => (
              <section
                key={grp.title}
                className="space-y-3 rounded-2xl p-5"
                style={{
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  boxShadow: 'var(--shadow-soft)',
                }}
              >
                <div style={{ borderBottom: '1px solid var(--border)', paddingBottom: '10px' }}>
                  <h2 className="text-sm font-extrabold" style={{ color: 'var(--text)' }}>
                    {grp.title}
                  </h2>
                  <p className="mt-0.5 text-xs" style={{ color: 'var(--muted)' }}>
                    {grp.subtitle}
                  </p>
                </div>

                <div className="space-y-2.5">
                  {grp.items.map((opt) => (
                    <label
                      key={opt.key}
                      className="flex cursor-pointer items-start gap-3 rounded-xl p-2.5 transition"
                      style={{
                        background: opt.highlight ? 'var(--pos-soft)' : 'var(--surface-2)',
                        border: opt.highlight
                          ? '1px solid var(--pos)'
                          : '1px solid var(--border)',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={Boolean(features[opt.key])}
                        onChange={(e) =>
                          setFeatures((prev) => ({ ...prev, [opt.key]: e.target.checked }))
                        }
                        className="mt-0.5 h-4 w-4 shrink-0"
                      />
                      <span className="min-w-0">
                        <span
                          className="block text-xs font-bold"
                          style={{ color: opt.highlight ? 'var(--pos-ink)' : 'var(--text)' }}
                        >
                          {opt.label}
                        </span>
                        <span className="mt-0.5 block text-[11px]" style={{ color: 'var(--muted)' }}>
                          {opt.hint}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>
      )}

      {/* TAB 2: КОНСТРУКТОР ПОЛІВ ПО КОЖНОМУ ДОКУМЕНТУ */}
      {tab === 'doc-fields' && (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
          {/* Left: Document types list */}
          <div className="space-y-1.5 lg:col-span-4">
            <div className="overline-label px-1 pb-1" style={{ color: 'var(--muted)' }}>
              Оберіть документ ({CONFIGURABLE_DOC_TYPES.length})
            </div>
            {CONFIGURABLE_DOC_TYPES.map((dt) => {
              const active = selectedDocType === dt;
              const cfg = docFields[dt];
              const visibleCount = cfg?.fields.filter((f) => f.visible).length ?? 0;
              const customCount = cfg?.customFields.length ?? 0;
              return (
                <button
                  key={dt}
                  type="button"
                  onClick={() => setSelectedDocType(dt)}
                  className="flex w-full items-center justify-between gap-2 rounded-xl px-3.5 py-2.5 text-left transition"
                  style={{
                    background: active ? 'var(--primary-soft)' : 'var(--surface)',
                    border: active ? '1px solid var(--primary)' : '1px solid var(--border)',
                  }}
                >
                  <div className="min-w-0">
                    <div
                      className="truncate text-xs font-extrabold"
                      style={{ color: active ? 'var(--primary-ink)' : 'var(--text)' }}
                    >
                      {DOC_TYPE_META[dt].label}
                    </div>
                    <div className="text-[11px]" style={{ color: 'var(--muted)' }}>
                      Активних полів: {visibleCount}
                      {customCount > 0 ? ` · Власних: +${customCount}` : ''}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Right: Fields editor for selected docType */}
          <div className="space-y-4 lg:col-span-8">
            {activeDocConfig && (
              <div
                className="space-y-4 rounded-2xl p-5"
                style={{
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  boxShadow: 'var(--shadow-soft)',
                }}
              >
                <div
                  className="flex flex-wrap items-center justify-between gap-2 pb-3"
                  style={{ borderBottom: '1px solid var(--border)' }}
                >
                  <div>
                    <div className="overline-label" style={{ color: 'var(--primary)' }}>
                      Налаштування форми документа
                    </div>
                    <h2 className="mt-0.5 text-base font-extrabold" style={{ color: 'var(--text)' }}>
                      {DOC_TYPE_META[selectedDocType].label}
                    </h2>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => resetScope('docFields')}
                      className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold"
                      style={{
                        background: 'var(--surface-2)',
                        border: '1px solid var(--border-strong)',
                        color: 'var(--text-2)',
                      }}
                    >
                      <RotateCcw className="h-3.5 w-3.5" /> Скинути
                    </button>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() =>
                        savePatch(
                          { docFields },
                          `Налаштування полів для «${DOC_TYPE_META[selectedDocType].label}» збережено!`
                        )
                      }
                      className="inline-flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-xs font-extrabold"
                      style={{
                        background: 'var(--primary)',
                        color: 'var(--surface)',
                      }}
                    >
                      <Save className="h-3.5 w-3.5" /> Зберегти поля
                    </button>
                  </div>
                </div>

                {/* Standard fields table */}
                <div className="overflow-x-auto rounded-xl" style={{ border: '1px solid var(--border)' }}>
                  <table className="w-full text-left text-xs">
                    <thead
                      style={{
                        background: 'var(--surface-2)',
                        borderBottom: '1px solid var(--border)',
                        color: 'var(--muted)',
                      }}
                    >
                      <tr>
                        <th className="w-24 px-3 py-2 text-center">Показувати</th>
                        <th className="w-24 px-3 py-2 text-center">Обов’язкове</th>
                        <th className="px-3 py-2">Назва поля у вікні документа (можна змінити)</th>
                        <th className="w-28 px-3 py-2">Розташування</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activeDocConfig.fields.map((fld) => (
                        <tr key={fld.key} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td className="px-3 py-2 text-center">
                            <input
                              type="checkbox"
                              checked={fld.visible}
                              onChange={(e) =>
                                updateStdField(fld.key, { visible: e.target.checked })
                              }
                            />
                          </td>
                          <td className="px-3 py-2 text-center">
                            <input
                              type="checkbox"
                              checked={fld.required}
                              disabled={!fld.visible}
                              onChange={(e) =>
                                updateStdField(fld.key, { required: e.target.checked })
                              }
                            />
                          </td>
                          <td className="px-3 py-1.5">
                            <input
                              type="text"
                              value={fld.label}
                              onChange={(e) =>
                                updateStdField(fld.key, { label: e.target.value })
                              }
                              className="w-full rounded-lg border px-2.5 py-1 text-xs font-semibold"
                              style={{
                                borderColor: 'var(--border)',
                                background: 'var(--surface)',
                                color: fld.visible ? 'var(--text)' : 'var(--muted)',
                              }}
                            />
                          </td>
                          <td className="px-3 py-2">
                            <span
                              className="rounded-full px-2 py-0.5 text-[10px] font-bold"
                              style={{
                                background:
                                  fld.group === 'header'
                                    ? 'var(--primary-soft)'
                                    : fld.group === 'line'
                                      ? 'var(--violet-soft)'
                                      : 'var(--neutral-soft)',
                                color:
                                  fld.group === 'header'
                                    ? 'var(--primary-ink)'
                                    : fld.group === 'line'
                                      ? 'var(--violet-ink)'
                                      : 'var(--text-2)',
                              }}
                            >
                              {fld.group === 'header'
                                ? 'Шапка'
                                : fld.group === 'line'
                                  ? 'Таблиця'
                                  : 'Додатково'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Custom user-defined fields */}
                <div
                  className="space-y-3 rounded-xl p-4"
                  style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
                >
                  <div>
                    <div className="text-xs font-extrabold" style={{ color: 'var(--text)' }}>
                      Власні додаткові поля (реквізити) для «{DOC_TYPE_META[selectedDocType].short}»
                    </div>
                    <p className="text-[11px]" style={{ color: 'var(--muted)' }}>
                      Додайте будь-яке поле (напр. «Код дизайнера», «Поверх доставки», «Джерело
                      замовлення») — воно автоматично з’явиться у спливаючому вікні документа
                    </p>
                  </div>

                  {activeDocConfig.customFields.length > 0 && (
                    <div className="space-y-1.5">
                      {activeDocConfig.customFields.map((cf) => (
                        <div
                          key={cf.id}
                          className="flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-xs"
                          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
                        >
                          <div>
                            <span className="font-bold" style={{ color: 'var(--text)' }}>
                              {cf.label}
                            </span>
                            <span className="ml-2 font-mono text-[11px]" style={{ color: 'var(--muted)' }}>
                              [{cf.type}]
                              {cf.options?.length ? ` (${cf.options.join(', ')})` : ''}
                              {cf.required ? ' · обов’язкове' : ''}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => removeCustomField(cf.id)}
                            className="rounded p-1"
                            style={{ color: 'var(--neg-ink)' }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  <form onSubmit={addCustomField} className="grid grid-cols-1 gap-2 sm:grid-cols-12 text-xs">
                    <input
                      placeholder="Назва нового поля (напр. Номер об’єкта)"
                      value={newCustomField.label}
                      onChange={(e) =>
                        setNewCustomField((s) => ({ ...s, label: e.target.value }))
                      }
                      className="rounded-lg border px-2.5 py-1.5 sm:col-span-4"
                      style={{
                        borderColor: 'var(--border-strong)',
                        background: 'var(--surface)',
                        color: 'var(--text)',
                      }}
                      required
                    />
                    <select
                      value={newCustomField.type}
                      onChange={(e) =>
                        setNewCustomField((s) => ({
                          ...s,
                          type: e.target.value as CustomDocFieldDef['type'],
                        }))
                      }
                      className="rounded-lg border px-2 py-1.5 sm:col-span-2"
                      style={{
                        borderColor: 'var(--border-strong)',
                        background: 'var(--surface)',
                        color: 'var(--text)',
                      }}
                    >
                      <option value="text">Текст</option>
                      <option value="number">Число</option>
                      <option value="date">Дата</option>
                      <option value="select">Список</option>
                    </select>
                    <input
                      placeholder={
                        newCustomField.type === 'select'
                          ? 'Варіанти через кому'
                          : 'Опції (для списку)'
                      }
                      disabled={newCustomField.type !== 'select'}
                      value={newCustomField.optionsText}
                      onChange={(e) =>
                        setNewCustomField((s) => ({ ...s, optionsText: e.target.value }))
                      }
                      className="rounded-lg border px-2.5 py-1.5 disabled:opacity-45 sm:col-span-3"
                      style={{
                        borderColor: 'var(--border-strong)',
                        background: 'var(--surface)',
                        color: 'var(--text)',
                      }}
                    />
                    <label className="flex items-center justify-center gap-1 sm:col-span-1">
                      <input
                        type="checkbox"
                        checked={newCustomField.required}
                        onChange={(e) =>
                          setNewCustomField((s) => ({ ...s, required: e.target.checked }))
                        }
                      />
                      <span>Обов.</span>
                    </label>
                    <button
                      type="submit"
                      className="inline-flex items-center justify-center gap-1 rounded-lg px-2.5 py-1.5 font-bold sm:col-span-2"
                      style={{ background: 'var(--primary-soft)', color: 'var(--primary-ink)' }}
                    >
                      <Plus className="h-3.5 w-3.5" /> Додати
                    </button>
                  </form>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: НАЛАШТУВАННЯ КОЖНОГО ПУНКТУ МЕНЮ ТА ПІДМЕНЮ */}
      {tab === 'menu' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs" style={{ color: 'var(--muted)' }}>
              Керуйте кожним розділом і кожним підпунктом меню: приховуйте зайве, перейменовуйте під
              термінологію вашого бізнесу, змінюйте порядок та закріплюйте зірочкою у швидку панель.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={saving}
                onClick={() => resetScope('menuConfig')}
                className="inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold"
                style={{
                  background: 'var(--surface)',
                  border: '1px solid var(--border-strong)',
                  color: 'var(--text-2)',
                }}
              >
                <RotateCcw className="h-3.5 w-3.5" /> Скинути меню
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() =>
                  savePatch(
                    { menuConfig },
                    'Налаштування меню та підменю збережено й одразу застосовано!'
                  )
                }
                className="inline-flex items-center gap-1.5 rounded-xl px-5 py-2 text-xs font-extrabold"
                style={{
                  background: 'linear-gradient(135deg, var(--primary), var(--primary-2))',
                  color: 'var(--surface)',
                }}
              >
                <Save className="h-4 w-4" /> Зберегти меню
              </button>
            </div>
          </div>

          <div className="space-y-2.5">
            {orderedSections.map(({ sec }, idx) => {
              const secOv = menuConfig.sections[sec.id] ?? {};
              const canHide = sec.id !== 'dashboard' && sec.id !== 'settings';
              const secVisible = canHide ? secOv.visible !== false : true;
              const isExpanded = expandedSectionId === sec.id;
              const totalSubItems = sec.groups.reduce((s, g) => s + g.items.length, 0);

              return (
                <div
                  key={sec.id}
                  className="overflow-hidden rounded-2xl"
                  style={{
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    opacity: secVisible ? 1 : 0.6,
                  }}
                >
                  {/* Section header row */}
                  <div
                    className="flex flex-wrap items-center justify-between gap-2 px-4 py-3"
                    style={{ background: 'var(--surface-2)' }}
                  >
                    <div className="flex flex-1 flex-wrap items-center gap-2.5">
                      <div className="flex gap-1">
                        <button
                          type="button"
                          disabled={idx === 0}
                          onClick={() => moveSection(idx, -1)}
                          aria-label="Перемістити вище"
                          className="rounded border p-1 disabled:opacity-30"
                          style={{
                            borderColor: 'var(--border-strong)',
                            background: 'var(--surface)',
                            color: 'var(--text-2)',
                          }}
                        >
                          <ArrowUp className="h-3 w-3" />
                        </button>
                        <button
                          type="button"
                          disabled={idx === orderedSections.length - 1}
                          onClick={() => moveSection(idx, 1)}
                          aria-label="Перемістити нижче"
                          className="rounded border p-1 disabled:opacity-30"
                          style={{
                            borderColor: 'var(--border-strong)',
                            background: 'var(--surface)',
                            color: 'var(--text-2)',
                          }}
                        >
                          <ArrowDown className="h-3 w-3" />
                        </button>
                      </div>

                      <label className="flex items-center gap-1.5 text-xs font-bold">
                        <input
                          type="checkbox"
                          checked={secVisible}
                          disabled={!canHide}
                          onChange={(e) =>
                            updateSectionOv(sec.id, { visible: e.target.checked })
                          }
                        />
                        <span style={{ color: 'var(--muted)' }}>Показ.</span>
                      </label>

                      <input
                        type="text"
                        value={secOv.label ?? sec.label}
                        onChange={(e) => updateSectionOv(sec.id, { label: e.target.value })}
                        aria-label={`Назва розділу ${sec.label}`}
                        className="w-48 rounded-lg border px-2.5 py-1 text-xs font-extrabold"
                        style={{
                          borderColor: 'var(--border-strong)',
                          background: 'var(--surface)',
                          color: 'var(--text)',
                        }}
                      />

                      <span className="text-[11px]" style={{ color: 'var(--muted)' }}>
                        {totalSubItems > 0 ? `${totalSubItems} підпунктів` : 'Головний екран'}
                      </span>
                    </div>

                    {sec.groups.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setExpandedSectionId(isExpanded ? '' : sec.id)}
                        className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-bold"
                        style={{
                          background: 'var(--surface)',
                          border: '1px solid var(--border-strong)',
                          color: 'var(--primary-ink)',
                        }}
                      >
                        {isExpanded ? (
                          <>
                            <ChevronDown className="h-3.5 w-3.5" /> Згорнути підменю
                          </>
                        ) : (
                          <>
                            <ChevronRight className="h-3.5 w-3.5" /> Налаштувати підменю
                          </>
                        )}
                      </button>
                    )}
                  </div>

                  {/* Expanded submenu items */}
                  {isExpanded && sec.groups.length > 0 && (
                    <div
                      className="grid grid-cols-1 gap-4 p-4 md:grid-cols-2 lg:grid-cols-3"
                      style={{ borderTop: '1px solid var(--border)' }}
                    >
                      {sec.groups.map((grp) => (
                        <div
                          key={grp.title}
                          className="space-y-2 rounded-xl p-3"
                          style={{
                            background: 'var(--surface-2)',
                            border: '1px solid var(--border)',
                          }}
                        >
                          <div className="overline-label" style={{ color: 'var(--primary)' }}>
                            {grp.title}
                          </div>
                          <div className="space-y-1.5">
                            {grp.items.map((it) => {
                              const ov = menuConfig.items[it.id] ?? {};
                              const itemVisible = ov.visible !== false;
                              const isPinned = Boolean(ov.pinned);
                              return (
                                <div
                                  key={it.id}
                                  className="flex items-center gap-1.5 rounded-lg p-1.5"
                                  style={{
                                    background: 'var(--surface)',
                                    border: '1px solid var(--border)',
                                    opacity: itemVisible ? 1 : 0.5,
                                  }}
                                >
                                  <input
                                    type="checkbox"
                                    checked={itemVisible}
                                    onChange={(e) =>
                                      updateItemOv(it.id, { visible: e.target.checked })
                                    }
                                    title="Показувати пункт у підменю"
                                  />
                                  <input
                                    type="text"
                                    value={ov.label ?? it.label}
                                    onChange={(e) =>
                                      updateItemOv(it.id, { label: e.target.value })
                                    }
                                    className="min-w-0 flex-1 bg-transparent px-1 text-xs font-medium focus:outline-none"
                                    style={{ color: 'var(--text)' }}
                                  />
                                  <button
                                    type="button"
                                    onClick={() => updateItemOv(it.id, { pinned: !isPinned })}
                                    title={
                                      isPinned
                                        ? 'Прибрати з панелі «Обране»'
                                        : 'Закріпити в швидку панель «Обране»'
                                    }
                                    className="rounded p-1 transition"
                                    style={{
                                      color: isPinned ? 'var(--warn)' : 'var(--muted)',
                                      background: isPinned ? 'var(--warn-soft)' : 'transparent',
                                    }}
                                  >
                                    <Star
                                      className="h-3.5 w-3.5"
                                      fill={isPinned ? 'currentColor' : 'none'}
                                    />
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 4: ІМПОРТ ТА ШВИДКИЙ СТАРТ */}
      {tab === 'import' && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          <button
            type="button"
            onClick={() => setItemsImportOpen(true)}
            className="flex flex-col items-start gap-2 rounded-2xl p-5 text-left transition"
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              boxShadow: 'var(--shadow-soft)',
            }}
          >
            <span
              className="flex h-11 w-11 items-center justify-center rounded-xl"
              style={{ background: 'var(--primary-soft)', color: 'var(--primary-ink)' }}
            >
              <Package className="h-5 w-5" />
            </span>
            <div className="text-sm font-extrabold" style={{ color: 'var(--text)' }}>
              Імпорт номенклатури (PDF / Excel / CSV / XML)
            </div>
            <div className="text-xs" style={{ color: 'var(--muted)' }}>
              Завантажуйте прайси постачальників, YML, 1С CommerceML або PDF-каталоги з
              автостворенням категорій і цін.
            </div>
          </button>

          <button
            type="button"
            onClick={() => setCpImportOpen(true)}
            className="flex flex-col items-start gap-2 rounded-2xl p-5 text-left transition"
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              boxShadow: 'var(--shadow-soft)',
            }}
          >
            <span
              className="flex h-11 w-11 items-center justify-center rounded-xl"
              style={{ background: 'var(--pos-soft)', color: 'var(--pos-ink)' }}
            >
              <Users className="h-5 w-5" />
            </span>
            <div className="text-sm font-extrabold" style={{ color: 'var(--text)' }}>
              Імпорт покупців і контрагентів (PDF / XLS / CSV / XML)
            </div>
            <div className="text-xs" style={{ color: 'var(--muted)' }}>
              Перенесення клієнтської бази та постачальників із ЄДРПОУ, телефонами, E-mail, IBAN і
              договорами.
            </div>
          </button>

          <button
            type="button"
            onClick={onOpenPrintTemplates}
            className="flex flex-col items-start gap-2 rounded-2xl p-5 text-left transition"
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              boxShadow: 'var(--shadow-soft)',
            }}
          >
            <span
              className="flex h-11 w-11 items-center justify-center rounded-xl"
              style={{ background: 'var(--info-soft)', color: 'var(--info-ink)' }}
            >
              <Printer className="h-5 w-5" />
            </span>
            <div className="text-sm font-extrabold" style={{ color: 'var(--text)' }}>
              Друковані форми (10 стандартів України)
            </div>
            <div className="text-xs" style={{ color: 'var(--muted)' }}>
              Редагування всіх шаблонів: Рахунок, М-11, Акт, ТТН 1-ТН, ПКО КО-1, ВКО КО-2, М-4,
              Інвентаризація, П-6, ПН.
            </div>
          </button>

          <button
            type="button"
            onClick={() => onOpenModal('organizations')}
            className="flex flex-col items-start gap-2 rounded-2xl p-5 text-left transition"
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              boxShadow: 'var(--shadow-soft)',
            }}
          >
            <span
              className="flex h-11 w-11 items-center justify-center rounded-xl"
              style={{ background: 'var(--violet-soft)', color: 'var(--violet-ink)' }}
            >
              <Building2 className="h-5 w-5" />
            </span>
            <div className="text-sm font-extrabold" style={{ color: 'var(--text)' }}>
              Організації та ФОП ({bootstrap.organizations.length})
            </div>
            <div className="text-xs" style={{ color: 'var(--muted)' }}>
              Реквізити, IBAN, система оподаткування, ставки ПДВ, дата заборони редагування.
            </div>
          </button>

          <button
            type="button"
            onClick={() => onOpenModal('departments')}
            className="flex flex-col items-start gap-2 rounded-2xl p-5 text-left transition"
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              boxShadow: 'var(--shadow-soft)',
            }}
          >
            <span
              className="flex h-11 w-11 items-center justify-center rounded-xl"
              style={{ background: 'var(--warn-soft)', color: 'var(--warn-ink)' }}
            >
              <Network className="h-5 w-5" />
            </span>
            <div className="text-sm font-extrabold" style={{ color: 'var(--text)' }}>
              Підрозділи та філії ({bootstrap.departments.length})
            </div>
            <div className="text-xs" style={{ color: 'var(--muted)' }}>
              Структура відділів продажів, складів, магазинів та розмежування видимості.
            </div>
          </button>

          <button
            type="button"
            onClick={() => onOpenModal('users')}
            className="flex flex-col items-start gap-2 rounded-2xl p-5 text-left transition"
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              boxShadow: 'var(--shadow-soft)',
            }}
          >
            <span
              className="flex h-11 w-11 items-center justify-center rounded-xl"
              style={{ background: 'var(--neutral-soft)', color: 'var(--text)' }}
            >
              <Shield className="h-5 w-5" />
            </span>
            <div className="text-sm font-extrabold" style={{ color: 'var(--text)' }}>
              Користувачі, Бухгалтер та Права (RBAC)
            </div>
            <div className="text-xs" style={{ color: 'var(--muted)' }}>
              Створення логінів, окремих доступів для бухгалтера, менеджерів і комірників.
            </div>
          </button>
        </div>
      )}

      {itemsImportOpen && (
        <UniversalItemsImportModal
          bootstrap={bootstrap}
          onClose={() => setItemsImportOpen(false)}
          onImported={(res) =>
            setStatusMsg(
              `Імпорт номенклатури завершено: створено ${res.created}, оновлено ${res.updated}, категорій +${res.categoriesCreated}.`
            )
          }
        />
      )}

      {cpImportOpen && (
        <UniversalCounterpartiesImportModal
          onClose={() => setCpImportOpen(false)}
          onImported={(res) =>
            setStatusMsg(
              `Імпорт покупців/контрагентів завершено: створено ${res.created}, оновлено ${res.updated}, договорів +${res.contractsCreated}.`
            )
          }
        />
      )}
    </div>
  );
}
