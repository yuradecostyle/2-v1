import type { DocumentType } from './api';

export type TopSectionKey =
  | 'dashboard'
  | 'crm'
  | 'sales'
  | 'purchases'
  | 'warehouse'
  | 'works'
  | 'production'
  | 'money'
  | 'hr'
  | 'company'
  | 'settings'
  | 'integrations';

export type TargetRoute =
  | { kind: 'dashboard' }
  | { kind: 'crm' }
  | { kind: 'documents'; docType?: DocumentType | ''; createType?: DocumentType }
  | { kind: 'catalogs'; tab?: 'items' | 'counterparties' | 'employees' | 'departments' | 'bom' | 'warehouses' | 'accounts' }
  | { kind: 'accounting' }
  | { kind: 'statutory' }
  | { kind: 'reports' }
  | { kind: 'assets' }
  | { kind: 'service' }
  | { kind: 'modal'; modal: 'organizations' | 'departments' | 'audit' | 'users' | 'password' | 'new-doc'; docType?: DocumentType }
  | {
      kind: 'module';
      description: string;
      relatedDocType?: DocumentType;
      relatedRouteLabel?: string;
      relatedPage?: 'crm' | 'documents' | 'catalogs' | 'accounting' | 'statutory' | 'reports' | 'assets' | 'service';
    };

export interface MenuSubItem {
  id: string;
  label: string;
  target: TargetRoute;
}

export interface MenuGroup {
  title: string;
  items: MenuSubItem[];
}

export interface MenuSection {
  id: TopSectionKey;
  label: string;
  subtitle: string;
  defaultTarget: TargetRoute;
  groups: MenuGroup[];
}

export const MENU_SECTIONS: MenuSection[] = [
  {
    id: 'dashboard',
    label: 'Дашборд',
    subtitle: 'Огляд бізнесу та ключові фінансові показники',
    defaultTarget: { kind: 'dashboard' },
    groups: [],
  },
  {
    id: 'crm',
    label: 'CRM',
    subtitle: 'Ліди, покупці, події, канали продажів та воронка',
    defaultTarget: { kind: 'crm' },
    groups: [
      {
        title: 'CRM',
        items: [
          { id: 'crm-contact-center', label: 'Контакт-центр', target: { kind: 'crm' } },
          { id: 'crm-leads', label: 'Ліди', target: { kind: 'crm' } },
          { id: 'crm-contacts', label: 'Контакти', target: { kind: 'catalogs', tab: 'counterparties' } },
          { id: 'crm-buyers', label: 'Покупці', target: { kind: 'catalogs', tab: 'counterparties' } },
          {
            id: 'crm-contracts',
            label: 'Договори',
            target: {
              kind: 'module',
              description: 'Реєстр договорів із покупцями та контроль умов оплати й валюти розрахунків.',
              relatedDocType: 'customer_order',
              relatedRouteLabel: 'Перейти до контрагентів',
              relatedPage: 'catalogs',
            },
          },
          { id: 'crm-events', label: 'Події', target: { kind: 'crm' } },
        ],
      },
      {
        title: 'Події',
        items: [
          { id: 'crm-calls', label: 'Дзвінки', target: { kind: 'crm' } },
          { id: 'crm-emails', label: 'Листи', target: { kind: 'crm' } },
          { id: 'crm-sms', label: 'SMS', target: { kind: 'crm' } },
          { id: 'crm-meetings', label: 'Зустрічі', target: { kind: 'crm' } },
          { id: 'crm-notes', label: 'Записи', target: { kind: 'crm' } },
          { id: 'crm-other-events', label: 'Інші', target: { kind: 'crm' } },
        ],
      },
      {
        title: 'Замовлення й рахунки',
        items: [
          { id: 'crm-orders', label: 'Замовлення покупців', target: { kind: 'documents', docType: 'customer_order' } },
          { id: 'crm-invoices', label: 'Рахунки на оплату', target: { kind: 'documents', docType: 'customer_order' } },
        ],
      },
      {
        title: 'Товари і послуги',
        items: [{ id: 'crm-items', label: 'Номенклатура', target: { kind: 'catalogs', tab: 'items' } }],
      },
      {
        title: 'Планування',
        items: [
          {
            id: 'crm-booking',
            label: 'Журнал запису',
            target: {
              kind: 'module',
              description: 'Календар запису клієнтів на послуги, консультації та сервісне обслуговування.',
              relatedDocType: 'customer_order',
              relatedRouteLabel: 'Відкрити CRM-воронку',
              relatedPage: 'crm',
            },
          },
          {
            id: 'crm-sales-plans',
            label: 'Плани продажів',
            target: {
              kind: 'module',
              description: 'Планування обсягів продажів по менеджерах, підрозділах та категоріях товарів.',
              relatedRouteLabel: 'Відкрити аналітику продажів',
              relatedPage: 'reports',
            },
          },
          {
            id: 'crm-resources',
            label: 'Ресурси',
            target: {
              kind: 'module',
              description: 'Довідник ресурсів компанії (фахівці, обладнання, робочі пости) для журналу запису.',
              relatedRouteLabel: 'Перейти до співробітників',
              relatedPage: 'catalogs',
            },
          },
        ],
      },
      {
        title: 'Канали продажів',
        items: [
          {
            id: 'crm-webforms',
            label: 'Контактні форми',
            target: {
              kind: 'module',
              description: 'Підключення форм заявок із сайту з автоматичним створенням лідів у CRM-воронці.',
              relatedRouteLabel: 'Відкрити інтеграції',
              relatedPage: 'service',
            },
          },
          {
            id: 'crm-eshop',
            label: 'Інтернет-магазин',
            target: {
              kind: 'module',
              description: 'Синхронізація каталогу товарів, залишків та онлайн-замовлень з інтернет-магазином.',
              relatedRouteLabel: 'Налаштувати обмін',
              relatedPage: 'service',
            },
          },
        ],
      },
      {
        title: 'Аналітика',
        items: [
          { id: 'crm-funnel', label: 'Воронка продажів', target: { kind: 'crm' } },
          { id: 'crm-reports', label: 'Звіти', target: { kind: 'reports' } },
        ],
      },
      {
        title: 'Сервіс',
        items: [
          {
            id: 'crm-mailings',
            label: 'Масові розсилання (E-mail, SMS)',
            target: {
              kind: 'module',
              description: 'Сегментація клієнтської бази та масові інформаційні й тригерні E-mail / SMS розсилки.',
              relatedRouteLabel: 'База покупців',
              relatedPage: 'catalogs',
            },
          },
          {
            id: 'crm-workflows',
            label: 'Правила робочого процесу',
            target: {
              kind: 'module',
              description: 'Автоматичні сценарії: створення задач менеджеру, нагадування та зміна етапів ліда.',
              relatedRouteLabel: 'CRM-воронка',
              relatedPage: 'crm',
            },
          },
          {
            id: 'crm-doc-templates',
            label: 'Шаблони КП і договорів',
            target: {
              kind: 'module',
              description: 'Готові шаблони комерційних пропозицій, рахунків і договорів із автопідстановкою реквізитів.',
              relatedRouteLabel: 'Журнал документів',
              relatedPage: 'documents',
            },
          },
          {
            id: 'crm-msg-templates',
            label: 'Шаблони листів, SMS',
            target: {
              kind: 'module',
              description: 'Текстові шаблони повідомлень клієнтам про статус замовлення, оплату та відвантаження.',
              relatedRouteLabel: 'CRM-воронка',
              relatedPage: 'crm',
            },
          },
        ],
      },
    ],
  },
  {
    id: 'sales',
    label: 'Продажі',
    subtitle: 'Реалізація, роздріб і ПРРО, ПДВ, прайси та розрахунки з покупцями',
    defaultTarget: { kind: 'documents', docType: 'sales_invoice' },
    groups: [
      {
        title: 'Продажі',
        items: [
          { id: 'sales-buyers', label: 'Покупці', target: { kind: 'catalogs', tab: 'counterparties' } },
          { id: 'sales-orders', label: 'Замовлення покупців', target: { kind: 'documents', docType: 'customer_order' } },
          { id: 'sales-invoices', label: 'Рахунки на оплату', target: { kind: 'documents', docType: 'customer_order' } },
          { id: 'sales-out', label: 'Видаткові накладні', target: { kind: 'documents', docType: 'sales_invoice' } },
          { id: 'sales-acts', label: 'Акти виконаних робіт', target: { kind: 'documents', docType: 'sales_invoice' } },
          { id: 'sales-corr', label: 'Коригування реалізацій', target: { kind: 'documents', docType: 'sales_invoice' } },
          {
            id: 'sales-projects',
            label: 'Проекти',
            target: {
              kind: 'module',
              description: 'Облік доходів, витрат і рентабельності в розрізі клієнтських проектів.',
              relatedDocType: 'customer_order',
              relatedRouteLabel: 'Відкрити звіти P&L',
              relatedPage: 'reports',
            },
          },
          {
            id: 'sales-discrepancy',
            label: 'Акти про розбіжності (отримані)',
            target: {
              kind: 'module',
              description: 'Реєстрація розбіжностей при прийманні товару покупцем та формування коригувань.',
              relatedDocType: 'sales_invoice',
              relatedRouteLabel: 'Видаткові накладні',
              relatedPage: 'documents',
            },
          },
          { id: 'sales-vat-app1', label: 'Додаток № 1 до под.накладної', target: { kind: 'documents', docType: 'tax_invoice' } },
          { id: 'sales-vat-app2', label: 'Додаток № 2 до под.накладної', target: { kind: 'documents', docType: 'tax_invoice' } },
          { id: 'sales-vat', label: 'Податкові накладні', target: { kind: 'documents', docType: 'tax_invoice' } },
        ],
      },
      {
        title: 'Продаж у роздріб',
        items: [
          { id: 'sales-checks', label: 'Чеки ККМ', target: { kind: 'documents', docType: 'sales_invoice' } },
          { id: 'sales-retail-rep', label: 'Звіти про роздрібні продажі', target: { kind: 'reports' } },
          { id: 'sales-reprice', label: 'Переоцінка в роздробі (сумовий облік)', target: { kind: 'documents', docType: 'price_setting' } },
          {
            id: 'sales-pos',
            label: 'Робоче місце касира (РМК)',
            target: {
              kind: 'module',
              description: 'Швидке оформлення роздрібних продажів зі сканером штрихкодів та фіскалізацією чеків у ПРРО Checkbox.',
              relatedDocType: 'sales_invoice',
              relatedRouteLabel: 'Документи та ПРРО',
              relatedPage: 'documents',
            },
          },
        ],
      },
      {
        title: 'Розрахунки з покупцями',
        items: [
          { id: 'sales-recon', label: 'Звірки взаєморозрахунків', target: { kind: 'reports' } },
          { id: 'sales-debt-adj', label: 'Коригування боргу', target: { kind: 'documents', docType: 'manual_journal' } },
        ],
      },
      {
        title: 'Товари і послуги',
        items: [
          { id: 'sales-items', label: 'Номенклатура', target: { kind: 'catalogs', tab: 'items' } },
          {
            id: 'sales-vmd',
            label: 'Номера ВМД',
            target: {
              kind: 'module',
              description: 'Облік номерів вантажних митних декларацій (ВМД) та кодів УКТЗЕД для імпортних товарів.',
              relatedRouteLabel: 'Довідник номенклатури',
              relatedPage: 'catalogs',
            },
          },
        ],
      },
      {
        title: 'Ціни і знижки',
        items: [
          { id: 'sales-price-set', label: 'Установка цін', target: { kind: 'documents', docType: 'price_setting' } },
          { id: 'sales-price-types', label: 'Види цін', target: { kind: 'documents', docType: 'price_setting' } },
          { id: 'sales-pricelists', label: 'Прайс-листи', target: { kind: 'reports' } },
          {
            id: 'sales-discounts',
            label: 'Знижки',
            target: {
              kind: 'module',
              description: 'Автоматичні й ручні знижки, націнки та умови надання бонусів покупцям.',
              relatedDocType: 'price_setting',
              relatedRouteLabel: 'Установка цін',
              relatedPage: 'documents',
            },
          },
        ],
      },
      {
        title: 'Планування',
        items: [
          {
            id: 'sales-plans',
            label: 'Плани продажів',
            target: {
              kind: 'module',
              description: 'План-фактний аналіз продажів по періодах та категоріях номенклатури.',
              relatedRouteLabel: 'Управлінські звіти',
              relatedPage: 'reports',
            },
          },
        ],
      },
      {
        title: 'Доставка',
        items: [
          {
            id: 'sales-routes',
            label: 'Маршрутні листи',
            target: {
              kind: 'module',
              description: 'Формування маршрутних листів доставки замовлень покупцям та контроль ТТН.',
              relatedDocType: 'customer_order',
              relatedRouteLabel: 'Замовлення покупців',
              relatedPage: 'documents',
            },
          },
        ],
      },
      {
        title: 'Довідники',
        items: [
          {
            id: 'sales-civil-contracts',
            label: 'Види договорів згідно за Цивільним Кодексом',
            target: {
              kind: 'module',
              description: 'Класифікатор видів договорів ЦКУ (купівля-продаж, поставка, надання послуг, підряд) для ПН.',
              relatedRouteLabel: 'Довідники',
              relatedPage: 'catalogs',
            },
          },
          {
            id: 'sales-koatuu',
            label: 'Класифікатор КОАТУУ',
            target: {
              kind: 'module',
              description: 'Довідник кодів адміністративно-територіальних одиниць (КОАТУУ / КАТОТТГ) для звітності ДПС.',
              relatedRouteLabel: 'Звітність ДПС',
              relatedPage: 'statutory',
            },
          },
          {
            id: 'sales-pn-codes',
            label: 'Класифікатор кодів для ПН',
            target: {
              kind: 'module',
              description: 'Коди УКТЗЕД та ДКПП послуг для коректної реєстрації Податкових накладних у ЄРПН.',
              relatedRouteLabel: 'Податкові накладні',
              relatedPage: 'documents',
            },
          },
          {
            id: 'sales-tax-offices',
            label: 'Податкові інспекції',
            target: {
              kind: 'module',
              description: 'Довідник державних податкових інспекцій (ДПІ) для реквізитів організацій та декларацій.',
              relatedRouteLabel: 'Звітність ДПС',
              relatedPage: 'statutory',
            },
          },
        ],
      },
      {
        title: 'Аналітика',
        items: [{ id: 'sales-reports', label: 'Звіти', target: { kind: 'reports' } }],
      },
      {
        title: 'Сервіс',
        items: [
          {
            id: 'sales-labels',
            label: 'Друк етикеток і цінників',
            target: {
              kind: 'module',
              description: 'Формування та друк цінників і штрихкод-етикеток за прайс-листом або прибутковою накладною.',
              relatedRouteLabel: 'Номенклатура',
              relatedPage: 'catalogs',
            },
          },
        ],
      },
    ],
  },
  {
    id: 'purchases',
    label: 'Закупівлі',
    subtitle: 'Постачальники, надходження товарів, імпорт та розрахунки',
    defaultTarget: { kind: 'documents', docType: 'goods_receipt' },
    groups: [
      {
        title: 'Закупівлі',
        items: [
          { id: 'pur-suppliers', label: 'Постачальники', target: { kind: 'catalogs', tab: 'counterparties' } },
          { id: 'pur-orders', label: 'Замовлення постачальникам', target: { kind: 'documents', docType: 'goods_receipt' } },
          { id: 'pur-bills', label: 'Рахунки на оплату (отримані)', target: { kind: 'documents', docType: 'goods_receipt' } },
          { id: 'pur-receipts', label: 'Прибуткові накладні', target: { kind: 'documents', docType: 'goods_receipt' } },
          { id: 'pur-extra-costs', label: 'Додаткові витрати', target: { kind: 'documents', docType: 'money_out' } },
          {
            id: 'pur-proxy',
            label: 'Довіреність',
            target: {
              kind: 'module',
              description: 'Оформлення та облік довіреностей співробітникам на отримання ТМЦ від постачальників.',
              relatedDocType: 'goods_receipt',
              relatedRouteLabel: 'Прибуткові накладні',
              relatedPage: 'documents',
            },
          },
          { id: 'pur-corr', label: 'Коригування надходжень', target: { kind: 'documents', docType: 'goods_receipt' } },
          {
            id: 'pur-discrepancy',
            label: 'Акти про розбіжності',
            target: {
              kind: 'module',
              description: 'Фіксація нестач або надлишків при прийманні товарів від постачальника.',
              relatedDocType: 'goods_receipt',
              relatedRouteLabel: 'Прибуткові накладні',
              relatedPage: 'documents',
            },
          },
          { id: 'pur-import-costs', label: 'Витрати при імпорті', target: { kind: 'assets' } },
          { id: 'pur-in-vat', label: 'Реєстрація вх. под. документа', target: { kind: 'documents', docType: 'tax_invoice' } },
        ],
      },
      {
        title: 'Розрахунки з постачальниками',
        items: [
          { id: 'pur-recon', label: 'Звірки взаєморозрахунків', target: { kind: 'reports' } },
          { id: 'pur-debt-adj', label: 'Коригування боргу', target: { kind: 'documents', docType: 'manual_journal' } },
        ],
      },
      {
        title: 'Товари і послуги',
        items: [
          { id: 'pur-items', label: 'Номенклатура', target: { kind: 'catalogs', tab: 'items' } },
          {
            id: 'pur-vmd',
            label: 'Номера ВМД',
            target: {
              kind: 'module',
              description: 'Облік номерів митних декларацій при імпортних поставках.',
              relatedRouteLabel: 'Номенклатура',
              relatedPage: 'catalogs',
            },
          },
        ],
      },
      {
        title: 'Ціни',
        items: [
          { id: 'pur-pricelists', label: 'Прайс-листи постачальників', target: { kind: 'documents', docType: 'price_setting' } },
          { id: 'pur-price-types', label: 'Види цін постачальників', target: { kind: 'documents', docType: 'price_setting' } },
        ],
      },
      {
        title: 'Планування',
        items: [
          {
            id: 'pur-needs',
            label: 'Розрахунок потреб',
            target: {
              kind: 'module',
              description: 'Автоматичний розрахунок дефіциту товарів за замовленнями покупців та мінімальними залишками.',
              relatedRouteLabel: 'Залишки та резерви',
              relatedPage: 'reports',
            },
          },
        ],
      },
      {
        title: 'Аналітика',
        items: [{ id: 'pur-reports', label: 'Звіти', target: { kind: 'reports' } }],
      },
      {
        title: 'Сервіс',
        items: [
          {
            id: 'pur-tsd',
            label: 'Вивантаження товарів в ТЗД',
            target: {
              kind: 'module',
              description: 'Обмін номенклатурою, штрихкодами та завданнями приймання з терміналом збору даних (ТЗД).',
              relatedRouteLabel: 'Інтеграції та обмін',
              relatedPage: 'service',
            },
          },
        ],
      },
    ],
  },
  {
    id: 'warehouse',
    label: 'Склад',
    subtitle: 'Переміщення, комплектації, інвентаризація, залишки FIFO та штрихкоди',
    defaultTarget: { kind: 'reports' },
    groups: [
      {
        title: 'Склад',
        items: [
          { id: 'wh-transfer-ord', label: 'Замовлення на переміщення', target: { kind: 'documents', docType: 'stock_transfer' } },
          { id: 'wh-transfer', label: 'Переміщення', target: { kind: 'documents', docType: 'stock_transfer' } },
          { id: 'wh-kitting', label: 'Комплектації', target: { kind: 'documents', docType: 'production_order' } },
          { id: 'wh-inventory', label: 'Інвентаризації', target: { kind: 'documents', docType: 'inventory_count' } },
          { id: 'wh-regrade', label: 'Пересортиця', target: { kind: 'documents', docType: 'inventory_count' } },
          { id: 'wh-acts', label: 'Складські акти', target: { kind: 'documents', docType: 'inventory_count' } },
          { id: 'wh-surplus', label: 'Оприбуткування', target: { kind: 'documents', docType: 'goods_receipt' } },
          { id: 'wh-writeoff', label: 'Списання', target: { kind: 'documents', docType: 'inventory_count' } },
        ],
      },
      {
        title: 'Товари і послуги',
        items: [
          { id: 'wh-items', label: 'Номенклатура', target: { kind: 'catalogs', tab: 'items' } },
          {
            id: 'wh-vmd',
            label: 'Номера ВМД',
            target: {
              kind: 'module',
              description: 'Реєстр митних декларацій по партіях імпортного товару на складах.',
              relatedRouteLabel: 'Номенклатура',
              relatedPage: 'catalogs',
            },
          },
          { id: 'wh-barcodes', label: 'Штрихкоди', target: { kind: 'catalogs', tab: 'items' } },
        ],
      },
      {
        title: 'Планування',
        items: [
          {
            id: 'wh-needs',
            label: 'Розрахунок потреб',
            target: {
              kind: 'module',
              description: 'Аналіз вільного залишку, резервів та потреб у поповненні складів.',
              relatedRouteLabel: 'Складські залишки FIFO',
              relatedPage: 'reports',
            },
          },
        ],
      },
      {
        title: 'Аналітика',
        items: [{ id: 'wh-reports', label: 'Звіти', target: { kind: 'reports' } }],
      },
      {
        title: 'Сервіс',
        items: [
          {
            id: 'wh-tsd',
            label: 'Вивантаження товарів в ТЗД',
            target: {
              kind: 'module',
              description: 'Експорт номенклатури та прийом результатів інвентаризації з терміналу збору даних.',
              relatedRouteLabel: 'Інтеграції та обмін',
              relatedPage: 'service',
            },
          },
          {
            id: 'wh-labels',
            label: 'Друк етикеток і цінників',
            target: {
              kind: 'module',
              description: 'Друк штрихкодів EAN-13, етикеток маркування та цінників по вибраних позиціях.',
              relatedRouteLabel: 'Номенклатура',
              relatedPage: 'catalogs',
            },
          },
        ],
      },
    ],
  },
  {
    id: 'works',
    label: 'Роботи',
    subtitle: 'Замовлення-наряди, виконання робіт, облік часу та акти',
    defaultTarget: { kind: 'documents', docType: 'customer_order' },
    groups: [
      {
        title: 'Роботи та послуги',
        items: [
          { id: 'works-orders', label: 'Замовлення-наряди', target: { kind: 'documents', docType: 'customer_order' } },
          { id: 'works-acts', label: 'Акти виконаних робіт', target: { kind: 'documents', docType: 'sales_invoice' } },
          {
            id: 'works-tasks',
            label: 'Завдання на роботу',
            target: {
              kind: 'module',
              description: 'Розподіл сервісних та проектних робіт по виконавцях і контроль термінів.',
              relatedDocType: 'customer_order',
              relatedRouteLabel: 'Перейти до CRM-задач',
              relatedPage: 'crm',
            },
          },
          {
            id: 'works-timelog',
            label: 'Облік часу',
            target: {
              kind: 'module',
              description: 'Фіксація витрачених годин виконавців для білінгу клієнтам та розрахунку відрядної оплати.',
              relatedRouteLabel: 'Співробітники',
              relatedPage: 'catalogs',
            },
          },
        ],
      },
      {
        title: 'Аналітика',
        items: [{ id: 'works-reports', label: 'Звіти по роботах', target: { kind: 'reports' } }],
      },
    ],
  },
  {
    id: 'production',
    label: 'Виробництво',
    subtitle: 'Замовлення на виробництво, специфікації BOM, розподіл витрат і наряди',
    defaultTarget: { kind: 'documents', docType: 'production_order' },
    groups: [
      {
        title: 'Виробництво',
        items: [
          { id: 'prod-orders', label: 'Замовлення на виробництво', target: { kind: 'documents', docType: 'production_order' } },
          { id: 'prod-runs', label: 'Виробництво', target: { kind: 'documents', docType: 'production_order' } },
          { id: 'prod-alloc', label: 'Розподіл витрат', target: { kind: 'documents', docType: 'manual_journal' } },
          { id: 'prod-transfers', label: 'Переміщення', target: { kind: 'documents', docType: 'stock_transfer' } },
        ],
      },
      {
        title: 'Завдання й наряди',
        items: [
          {
            id: 'prod-tasks',
            label: 'Завдання на роботу',
            target: {
              kind: 'module',
              description: 'Операційні виробничі завдання цехам та бригадам із контролем виконання.',
              relatedDocType: 'production_order',
              relatedRouteLabel: 'Виробничі документи',
              relatedPage: 'documents',
            },
          },
          {
            id: 'prod-time',
            label: 'Облік часу',
            target: {
              kind: 'module',
              description: 'Облік відпрацьованих нормо-годин у виробництві для калькуляції собівартості.',
              relatedDocType: 'production_order',
              relatedRouteLabel: 'Специфікації BOM',
              relatedPage: 'catalogs',
            },
          },
        ],
      },
      {
        title: 'Планування',
        items: [
          {
            id: 'prod-needs',
            label: 'Розрахунок потреб',
            target: {
              kind: 'module',
              description: 'Розрахунок потреби у сировині та комплектуючих на основі специфікацій BOM.',
              relatedRouteLabel: 'Специфікації BOM',
              relatedPage: 'catalogs',
            },
          },
        ],
      },
      {
        title: 'Довідники',
        items: [
          { id: 'prod-items', label: 'Номенклатура', target: { kind: 'catalogs', tab: 'items' } },
          { id: 'prod-bom', label: 'Специфікації', target: { kind: 'catalogs', tab: 'bom' } },
          {
            id: 'prod-schedules',
            label: 'Графіки роботи',
            target: {
              kind: 'module',
              description: 'Змінні та виробничі графіки роботи підрозділів і цехів.',
              relatedRouteLabel: 'Співробітники',
              relatedPage: 'catalogs',
            },
          },
          {
            id: 'prod-brigades',
            label: 'Бригади',
            target: {
              kind: 'module',
              description: 'Склад виробничих бригад та коефіцієнти трудової участі (КТУ).',
              relatedRouteLabel: 'Співробітники',
              relatedPage: 'catalogs',
            },
          },
        ],
      },
      {
        title: 'Аналітика',
        items: [{ id: 'prod-reports', label: 'Звіти', target: { kind: 'reports' } }],
      },
    ],
  },
  {
    id: 'money',
    label: 'Кошти',
    subtitle: 'Банк, каса, еквайринг, кредити, платіжний календар та валюти',
    defaultTarget: { kind: 'documents', docType: 'money_in' },
    groups: [
      {
        title: 'Кошти',
        items: [
          { id: 'money-bank-cash', label: 'Банк і каса', target: { kind: 'documents', docType: 'money_in' } },
          { id: 'money-transfer', label: 'Переміщення коштів', target: { kind: 'documents', docType: 'manual_journal' } },
        ],
      },
      {
        title: 'Банк',
        items: [
          { id: 'money-bank-docs', label: 'Документи банку', target: { kind: 'documents', docType: 'money_in' } },
          { id: 'money-pay-orders', label: 'Платіжні доручення', target: { kind: 'documents', docType: 'money_out' } },
          { id: 'money-bank-in', label: 'Надходження на рахунок', target: { kind: 'documents', docType: 'money_in' } },
          { id: 'money-bank-out', label: 'Витрата з рахунку', target: { kind: 'documents', docType: 'money_out' } },
        ],
      },
      {
        title: 'Каса',
        items: [
          { id: 'money-cash-docs', label: 'Документи каси', target: { kind: 'documents', docType: 'money_in' } },
          { id: 'money-cash-in', label: 'Надходження в касу', target: { kind: 'documents', docType: 'money_in' } },
          { id: 'money-cash-out', label: 'Витрата з каси', target: { kind: 'documents', docType: 'money_out' } },
          { id: 'money-advance', label: 'Авансові звіти', target: { kind: 'documents', docType: 'money_out' } },
        ],
      },
      {
        title: 'Еквайринг',
        items: [
          { id: 'money-acquiring', label: 'Операції з платіжними картками', target: { kind: 'documents', docType: 'money_in' } },
        ],
      },
      {
        title: 'Кредити й позики',
        items: [
          {
            id: 'money-loans',
            label: 'Договори кредитів і позик',
            target: {
              kind: 'module',
              description: 'Облік банківських кредитів, поворотної фінансової допомоги та графіків погашення.',
              relatedDocType: 'money_in',
              relatedRouteLabel: 'Бухгалтерія №291',
              relatedPage: 'accounting',
            },
          },
          {
            id: 'money-loan-accruals',
            label: 'Нарахування за кредитами і позиками',
            target: {
              kind: 'module',
              description: 'Щомісячне нарахування відсотків та комісій за договорами кредитів і позик.',
              relatedDocType: 'manual_journal',
              relatedRouteLabel: 'Операції Дт/Кт',
              relatedPage: 'documents',
            },
          },
        ],
      },
      {
        title: 'Планування',
        items: [
          {
            id: 'money-plan-docs',
            label: 'Документи планування коштів',
            target: {
              kind: 'module',
              description: 'Планування грошових потоків (Cash Flow) та контроль касових розривів.',
              relatedRouteLabel: 'Звіт Cash Flow / P&L',
              relatedPage: 'reports',
            },
          },
          {
            id: 'money-plan-in',
            label: 'Надходження коштів (план)',
            target: {
              kind: 'module',
              description: 'Очікувані надходження оплат від покупців за виставленими рахунками та замовленнями.',
              relatedRouteLabel: 'Взаєморозрахунки',
              relatedPage: 'reports',
            },
          },
          {
            id: 'money-plan-move',
            label: 'Переміщення коштів (план)',
            target: {
              kind: 'module',
              description: 'Планові перекази між рахунками, інкасація та купівля/продаж валюти.',
              relatedRouteLabel: 'Валюта та курси НБУ',
              relatedPage: 'assets',
            },
          },
          {
            id: 'money-pay-req',
            label: 'Заявки на витрату коштів',
            target: {
              kind: 'module',
              description: 'Погодження заявок на оплату постачальникам, податків та операційних витрат.',
              relatedDocType: 'money_out',
              relatedRouteLabel: 'Виплати та витрати',
              relatedPage: 'documents',
            },
          },
          {
            id: 'money-calendar',
            label: 'Платіжний календар',
            target: {
              kind: 'module',
              description: 'Календарний прогноз залишків на рахунках по днях із попередженням касових розривів.',
              relatedRouteLabel: 'Звіт Cash Flow',
              relatedPage: 'reports',
            },
          },
        ],
      },
      {
        title: 'Довідники',
        items: [
          { id: 'money-currencies', label: 'Валюти', target: { kind: 'assets' } },
          { id: 'money-cashes', label: 'Каси', target: { kind: 'catalogs', tab: 'warehouses' } },
          { id: 'money-cf-cats', label: 'Статті руху коштів', target: { kind: 'reports' } },
        ],
      },
      {
        title: 'Аналітика',
        items: [{ id: 'money-reports', label: 'Звіти', target: { kind: 'reports' } }],
      },
    ],
  },
  {
    id: 'hr',
    label: 'Персонал',
    subtitle: 'Кадровий облік, нарахування зарплати, ПДФО/ВЗ/ЄСВ, табелі та премії',
    defaultTarget: { kind: 'catalogs', tab: 'employees' },
    groups: [
      {
        title: 'Кадровий облік',
        items: [
          { id: 'hr-employees', label: 'Співробітники', target: { kind: 'catalogs', tab: 'employees' } },
          {
            id: 'hr-docs',
            label: 'Кадрові документи',
            target: {
              kind: 'module',
              description: 'Журнал усіх кадрових наказів підприємства (прийом, переведення, відпустки, звільнення).',
              relatedRouteLabel: 'Штатний розпис',
              relatedPage: 'catalogs',
            },
          },
          {
            id: 'hr-bonus-policy',
            label: 'Положення про преміювання',
            target: {
              kind: 'module',
              description: 'Налаштування KPI та відсоткових схем преміювання відділів продажів і виробництва.',
              relatedRouteLabel: 'Співробітники',
              relatedPage: 'catalogs',
            },
          },
          {
            id: 'hr-hires',
            label: 'Прийоми на роботу',
            target: {
              kind: 'module',
              description: 'Оформлення прийому співробітників, призначення посади, окладу та подання повідомлення в ДПС.',
              relatedRouteLabel: 'Співробітники',
              relatedPage: 'catalogs',
            },
          },
          {
            id: 'hr-transfers',
            label: 'Кадрові переміщення',
            target: {
              kind: 'module',
              description: 'Переведення працівників між підрозділами та зміна посадових окладів.',
              relatedRouteLabel: 'Співробітники',
              relatedPage: 'catalogs',
            },
          },
          {
            id: 'hr-dismissals',
            label: 'Звільнення',
            target: {
              kind: 'module',
              description: 'Оформлення звільнення та розрахунок компенсації невикористаної відпустки.',
              relatedRouteLabel: 'Співробітники',
              relatedPage: 'catalogs',
            },
          },
        ],
      },
      {
        title: 'Зарплата',
        items: [
          { id: 'hr-payroll-docs', label: 'Зарплатні документи', target: { kind: 'documents', docType: 'payroll_sheet' } },
          { id: 'hr-payroll-accrual', label: 'Нарахування зарплати', target: { kind: 'documents', docType: 'payroll_sheet' } },
          { id: 'hr-pay-sheets', label: 'Платіжні відомості', target: { kind: 'documents', docType: 'payroll_sheet' } },
          {
            id: 'hr-timesheets',
            label: 'Табелі',
            target: {
              kind: 'module',
              description: 'Табель обліку робочого часу (відпрацьовані дні, лікарняні, відпустки) для розрахунку ЗП.',
              relatedDocType: 'payroll_sheet',
              relatedRouteLabel: 'Відомості зарплати',
              relatedPage: 'documents',
            },
          },
        ],
      },
      {
        title: 'Позики',
        items: [
          {
            id: 'hr-loans',
            label: 'Договори кредитів і позик',
            target: {
              kind: 'module',
              description: 'Позики співробітникам із автоматичним утриманням платежів із заробітної плати.',
              relatedDocType: 'payroll_sheet',
              relatedRouteLabel: 'Відомості зарплати',
              relatedPage: 'documents',
            },
          },
        ],
      },
      {
        title: 'Довідники',
        items: [
          {
            id: 'hr-accrual-types',
            label: 'Види нарахувань і утримань',
            target: {
              kind: 'module',
              description: 'Оклад, премії, відпускні, ПДФО 18%, військовий збір 5%, ЄСВ 22% (рахунки 661 / 6411 / 642 / 651).',
              relatedRouteLabel: 'Об’єднаний звіт ЄСВ/4ДФ',
              relatedPage: 'statutory',
            },
          },
          {
            id: 'hr-worktime-types',
            label: 'Види робочого часу',
            target: {
              kind: 'module',
              description: 'Коди табеля: явки, нічні, надурочні, відрядження, відпустки та лікарняні.',
              relatedRouteLabel: 'Співробітники',
              relatedPage: 'catalogs',
            },
          },
          {
            id: 'hr-schedules',
            label: 'Графіки роботи',
            target: {
              kind: 'module',
              description: 'П’ятиденний, змінний та індивідуальний графіки робочого часу.',
              relatedRouteLabel: 'Співробітники',
              relatedPage: 'catalogs',
            },
          },
          {
            id: 'hr-calc-params',
            label: 'Параметри розрахунків',
            target: {
              kind: 'module',
              description: 'Мінімальна зарплата, прожитковий мінімум, ставки ПДФО 18%, ВЗ 5% та ЄСВ 22%.',
              relatedRouteLabel: 'Звітність ДПС',
              relatedPage: 'statutory',
            },
          },
          { id: 'hr-persons', label: 'Фізичні особи', target: { kind: 'catalogs', tab: 'employees' } },
          { id: 'hr-positions', label: 'Посади', target: { kind: 'catalogs', tab: 'employees' } },
        ],
      },
      {
        title: 'Нарахування й утримання',
        items: [
          {
            id: 'hr-accruals-2',
            label: 'Види нарахувань і утримань',
            target: {
              kind: 'module',
              description: 'Налаштування формул нарахувань та податкових утримань із фонду оплати праці.',
              relatedDocType: 'payroll_sheet',
              relatedRouteLabel: 'Нарахування зарплати',
              relatedPage: 'documents',
            },
          },
          {
            id: 'hr-params-2',
            label: 'Параметри розрахунків',
            target: {
              kind: 'module',
              description: 'Глобальні ставки та пороги оподаткування заробітної плати.',
              relatedRouteLabel: 'Звітність ДПС',
              relatedPage: 'statutory',
            },
          },
          {
            id: 'hr-bonus-rules',
            label: 'Правила розрахунку премій',
            target: {
              kind: 'module',
              description: 'Формули бонусів від маржі, виручки або виконання плану.',
              relatedRouteLabel: 'Управлінські звіти',
              relatedPage: 'reports',
            },
          },
          {
            id: 'hr-bonus-conds',
            label: 'Умови нарахування премій',
            target: {
              kind: 'module',
              description: 'Пороги виконання плану та умови активації преміальних виплат.',
              relatedRouteLabel: 'CRM-воронка',
              relatedPage: 'crm',
            },
          },
        ],
      },
      {
        title: 'Аналітика',
        items: [{ id: 'hr-reports', label: 'Звіти', target: { kind: 'statutory' } }],
      },
    ],
  },
  {
    id: 'company',
    label: 'Компанія',
    subtitle: 'Організації та ФОП, бухгалтерія №291, податки, ОЗ, закриття місяця та початкові залишки',
    defaultTarget: { kind: 'accounting' },
    groups: [
      {
        title: 'Компанія',
        items: [
          { id: 'co-orgs', label: 'Організації', target: { kind: 'modal', modal: 'organizations' } },
          { id: 'co-banks', label: 'Банківські рахунки', target: { kind: 'catalogs', tab: 'warehouses' } },
          { id: 'co-warehouses', label: 'Склади і магазини', target: { kind: 'catalogs', tab: 'warehouses' } },
          { id: 'co-departments', label: 'Підрозділи', target: { kind: 'modal', modal: 'departments' } },
          { id: 'co-employees', label: 'Співробітники', target: { kind: 'catalogs', tab: 'employees' } },
          { id: 'co-coa', label: 'План рахунків', target: { kind: 'catalogs', tab: 'accounts' } },
          { id: 'co-all-catalogs', label: 'Всі довідники', target: { kind: 'catalogs', tab: 'items' } },
        ],
      },
      {
        title: 'Фінансові операції',
        items: [
          { id: 'co-ops', label: 'Операції', target: { kind: 'documents', docType: 'manual_journal' } },
          { id: 'co-other-exp', label: 'Інші витрати', target: { kind: 'documents', docType: 'money_out' } },
          { id: 'co-taxes', label: 'Нарахування податків', target: { kind: 'statutory' } },
          { id: 'co-month-close', label: 'Закриття місяця', target: { kind: 'assets' } },
        ],
      },
      {
        title: 'Розвиток бізнесу',
        items: [
          { id: 'co-biz-analysis', label: 'Аналіз бізнесу', target: { kind: 'reports' } },
          { id: 'co-biz-kpi', label: 'Показники бізнесу', target: { kind: 'dashboard' } },
        ],
      },
      {
        title: 'Аналітика',
        items: [
          { id: 'co-state', label: 'Стан компанії', target: { kind: 'accounting' } },
          { id: 'co-reports', label: 'Звіти', target: { kind: 'statutory' } },
        ],
      },
      {
        title: 'Початкові залишки',
        items: [
          { id: 'co-ob', label: 'Введення початкових залишків', target: { kind: 'documents', docType: 'opening_balance' } },
          { id: 'co-excel-import', label: 'Завантаження даних з Excel', target: { kind: 'service' } },
          { id: 'co-site-import', label: 'Завантаження даних з сайту', target: { kind: 'service' } },
        ],
      },
    ],
  },
  {
    id: 'settings',
    label: 'Налаштування',
    subtitle: 'Адміністрування, користувачі і права RBAC, обслуговування та параметри системи',
    defaultTarget: { kind: 'service' },
    groups: [
      {
        title: 'Налаштування',
        items: [
          {
            id: 'set-more',
            label: 'Ще більше можливостей',
            target: {
              kind: 'module',
              description: 'Увімкнення додаткових модулів: мультивалютність НБУ, ОЗ (10/13), BOM-виробництво, ПРРО Checkbox.',
              relatedRouteLabel: 'ОЗ і валюта',
              relatedPage: 'assets',
            },
          },
          {
            id: 'set-missing',
            label: 'Не знайшли потрібну можливість?',
            target: {
              kind: 'module',
              description: 'Керування функціональними опціями інтерфейсу та замовлення індивідуальних доробок під ваш бізнес.',
              relatedRouteLabel: 'Інтеграції та сервіс',
              relatedPage: 'service',
            },
          },
          { id: 'set-all-catalogs', label: 'Всі довідники', target: { kind: 'catalogs', tab: 'items' } },
        ],
      },
      {
        title: 'Персональні налаштування',
        items: [
          { id: 'set-my', label: 'Мої налаштування', target: { kind: 'modal', modal: 'organizations' } },
          {
            id: 'set-google',
            label: 'Обмін з Google',
            target: {
              kind: 'module',
              description: 'Синхронізація контактів, Google Календаря та вивантаження звітів у Google Таблиці.',
              relatedRouteLabel: 'Інтеграції',
              relatedPage: 'service',
            },
          },
          {
            id: 'set-mail-sms',
            label: 'Пошта і SMS',
            target: {
              kind: 'module',
              description: 'Налаштування SMTP-пошти та SMS-шлюзів (TurboSMS, AlphaSMS) для автоматичних повідомлень клієнтам.',
              relatedRouteLabel: 'Інтеграції',
              relatedPage: 'service',
            },
          },
        ],
      },
      {
        title: 'Адміністрування',
        items: [
          { id: 'set-maint', label: 'Обслуговування', target: { kind: 'service' } },
          { id: 'set-support', label: 'Інтернет-підтримка і сервіси', target: { kind: 'service' } },
          { id: 'set-rbac', label: 'Налаштування користувачів і прав', target: { kind: 'modal', modal: 'users' } },
          {
            id: 'set-files',
            label: 'Налаштування роботи з файлами',
            target: {
              kind: 'module',
              description: 'Параметри зберігання сканів первинних документів, договорів та XML-файлів SAF-T / ЄРПН.',
              relatedRouteLabel: 'Сервіс та обслуговування',
              relatedPage: 'service',
            },
          },
          { id: 'set-general', label: 'Загальні налаштування', target: { kind: 'modal', modal: 'organizations' } },
          { id: 'set-data-fix', label: 'Коригування даних', target: { kind: 'service' } },
          { id: 'set-print-forms', label: 'Друковані форми, звіти і обробки', target: { kind: 'documents' } },
          {
            id: 'set-cloud',
            label: 'Робота в хмарі',
            target: {
              kind: 'module',
              description: 'Параметри веб-доступу, резервного копіювання PostgreSQL/PGlite та підключення зовнішніх API.',
              relatedRouteLabel: 'Сервіс та інтеграції',
              relatedPage: 'service',
            },
          },
          {
            id: 'set-pos-hw',
            label: 'РМК і торгове обладнання',
            target: {
              kind: 'module',
              description: 'Підключення сканерів штрихкодів, принтерів чеків, етикеток та ПРРО Checkbox.',
              relatedRouteLabel: 'Налаштувати Checkbox ПРРО',
              relatedPage: 'service',
            },
          },
        ],
      },
      {
        title: 'Інтеграції',
        items: [
          { id: 'set-sync', label: 'Синхронізація даних', target: { kind: 'service' } },
          { id: 'set-channels', label: 'Канали продажів', target: { kind: 'service' } },
          { id: 'set-mailings', label: 'Пошта, розсилки і SMS', target: { kind: 'service' } },
        ],
      },
      {
        title: 'Аналітика',
        items: [{ id: 'set-reports', label: 'Звіти', target: { kind: 'reports' } }],
      },
      {
        title: 'Сервіс',
        items: [
          { id: 'set-password', label: 'Змінити пароль', target: { kind: 'modal', modal: 'password' } },
          {
            id: 'set-delete-objs',
            label: 'Вилучення об’єктів',
            target: {
              kind: 'module',
              description: 'Контроль посилальної цілісності та безпечне очищення помічених на вилучення документів і довідників.',
              relatedRouteLabel: 'Сервіс та регламент',
              relatedPage: 'service',
            },
          },
          {
            id: 'set-collapse-db',
            label: 'Згортка інформаційної бази',
            target: {
              kind: 'module',
              description: 'Перерахунок місячних підсумків, перепроведення послідовності FIFO та закриття минулих періодів.',
              relatedRouteLabel: 'Перепроведення і підсумки',
              relatedPage: 'service',
            },
          },
        ],
      },
    ],
  },
  {
    id: 'integrations',
    label: 'Інтеграції',
    subtitle: 'BAS OData, Monobank, Приват24, Checkbox ПРРО, НБУ та імпорт CSV/Excel',
    defaultTarget: { kind: 'service' },
    groups: [
      {
        title: 'Банки та ПРРО',
        items: [
          { id: 'int-mono', label: 'Monobank (автовиписка)', target: { kind: 'service' } },
          { id: 'int-privat', label: 'Приват24 для бізнесу', target: { kind: 'service' } },
          { id: 'int-checkbox', label: 'Checkbox ПРРО (фіскалізація)', target: { kind: 'service' } },
          { id: 'int-nbu', label: 'Курси валют НБУ (USD / EUR)', target: { kind: 'assets' } },
        ],
      },
      {
        title: 'Обмін даними та ДПС',
        items: [
          { id: 'int-bas-odata', label: 'Прямий обмін BAS / 1С (OData)', target: { kind: 'service' } },
          { id: 'int-csv', label: 'Імпорт із Excel / CSV', target: { kind: 'service' } },
          { id: 'int-saft', label: 'SAF-T UA v2.0 та ЄРПН XML', target: { kind: 'accounting' } },
          { id: 'int-dps', label: 'Електронна звітність ДПС (Ф1/Ф2/ПДВ/ЄП)', target: { kind: 'statutory' } },
        ],
      },
    ],
  },
];
