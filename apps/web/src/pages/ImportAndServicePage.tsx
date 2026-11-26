import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Upload,
  RefreshCw,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  PlugZap,
  Landmark,
  Receipt,
  DatabaseZap,
  Save,
} from 'lucide-react';
import { apiFetch, fmtDate, type BootstrapData } from '../lib/api';
import { UniversalItemsImportModal } from '../components/UniversalItemsImportModal';

const SAMPLE_ITEMS_CSV = `Артикул;Найменування;Од. вим.;Тип
BAS-001;Маршрутизатор MikroTik hAP ax3;шт;Товар
BAS-002;ДБЖ APC Back-UPS 1200VA;шт;Товар
BAS-003;Монтаж локальної мережі;посл;Послуга`;

const SAMPLE_BALANCES_CSV = `Артикул;Найменування;Кількість;Собівартість
BAS-001;Маршрутизатор MikroTik hAP ax3;5;4800
BAS-002;ДБЖ APC Back-UPS 1200VA;3;7200`;

interface IntegrationsResponse {
  configs: Array<{
    id: string;
    provider: 'BAS_ODATA' | 'MONOBANK' | 'PRIVAT24' | 'CHECKBOX';
    mode: 'DEMO' | 'LIVE';
    config: Record<string, string>;
    lastSyncAt: string | null;
  }>;
  logs: Array<{
    id: string;
    provider: string;
    status: string;
    summary: string;
    createdAt: string;
  }>;
}

export function ImportAndServicePage({ bootstrap }: { bootstrap: BootstrapData }) {
  const qc = useQueryClient();
  const [importKind, setImportKind] = useState<'items' | 'counterparties' | 'opening-balances'>(
    'opening-balances'
  );
  const [csvText, setCsvText] = useState(SAMPLE_BALANCES_CSV);
  const [warehouseId, setWarehouseId] = useState(bootstrap.warehouses[0]?.id ?? '');
  const [docDate, setDocDate] = useState('2026-11-24');
  const [repostDate, setRepostDate] = useState('2026-10-01');
  const [allowNeg, setAllowNeg] = useState(bootstrap.organization.allowNegativeStock);
  const [lockDate, setLockDate] = useState(
    bootstrap.organization.lockDate ? bootstrap.organization.lockDate.slice(0, 10) : ''
  );

  // Локальні форми налаштувань інтеграцій
  const [odataMode, setOdataMode] = useState<'DEMO' | 'LIVE'>('DEMO');
  const [odataUrl, setOdataUrl] = useState('http://127.0.0.1:8080/bas_ut/odata/standard.odata');
  const [odataUser, setOdataUser] = useState('Адміністратор');
  const [odataPass, setOdataPass] = useState('');

  const [monoMode, setMonoMode] = useState<'DEMO' | 'LIVE'>('DEMO');
  const [monoToken, setMonoToken] = useState('');
  const [monoAccount, setMonoAccount] = useState('0');

  const [p24Mode, setP24Mode] = useState<'DEMO' | 'LIVE'>('DEMO');
  const [p24ClientId, setP24ClientId] = useState('');
  const [p24Token, setP24Token] = useState('');
  const [p24Iban, setP24Iban] = useState('UA213052990000026007015012345');

  const [cbxMode, setCbxMode] = useState<'DEMO' | 'LIVE'>('DEMO');
  const [cbxLicense, setCbxLicense] = useState('');
  const [cbxLogin, setCbxLogin] = useState('');
  const [cbxPass, setCbxPass] = useState('');

  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [universalImportOpen, setUniversalImportOpen] = useState(false);

  const integrations = useQuery({
    queryKey: ['integrations'],
    queryFn: () => apiFetch<IntegrationsResponse>('/api/integrations'),
  });

  useEffect(() => {
    if (!integrations.data) return;
    for (const c of integrations.data.configs) {
      if (c.provider === 'BAS_ODATA') {
        setOdataMode(c.mode);
        setOdataUrl(c.config.baseUrl || odataUrl);
        setOdataUser(c.config.username || 'Адміністратор');
      } else if (c.provider === 'MONOBANK') {
        setMonoMode(c.mode);
        setMonoToken(c.config.token || '');
        setMonoAccount(c.config.accountId || '0');
      } else if (c.provider === 'PRIVAT24') {
        setP24Mode(c.mode);
        setP24ClientId(c.config.clientId || '');
        setP24Token(c.config.token || '');
        setP24Iban(c.config.iban || p24Iban);
      } else if (c.provider === 'CHECKBOX') {
        setCbxMode(c.mode);
        setCbxLicense(c.config.licenseKey || '');
        setCbxLogin(c.config.login || '');
      }
    }
  }, [integrations.data]);

  const refreshAll = () => {
    qc.invalidateQueries();
  };

  const saveProvider = async (
    provider: 'BAS_ODATA' | 'MONOBANK' | 'PRIVAT24' | 'CHECKBOX',
    mode: 'DEMO' | 'LIVE',
    config: Record<string, string>
  ) => {
    setBusy(true);
    setErrorMsg(null);
    try {
      await apiFetch(`/api/integrations/${provider}`, {
        method: 'PUT',
        body: JSON.stringify({ mode, config }),
      });
      setStatusMsg(`Налаштування інтеграції ${provider} збережено (${mode}).`);
      refreshAll();
    } catch (e) {
      setErrorMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handleOdataSync = async () => {
    setBusy(true);
    setStatusMsg(null);
    setErrorMsg(null);
    try {
      await apiFetch('/api/integrations/BAS_ODATA', {
        method: 'PUT',
        body: JSON.stringify({
          mode: odataMode,
          config: { baseUrl: odataUrl, username: odataUser, password: odataPass },
        }),
      });
      const res = await apiFetch<{ summary: string }>('/api/integrations/bas-odata/sync', {
        method: 'POST',
        body: JSON.stringify({ warehouseId }),
      });
      setStatusMsg(res.summary);
      refreshAll();
    } catch (e) {
      setErrorMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handleBankSync = async (provider: 'MONOBANK' | 'PRIVAT24') => {
    setBusy(true);
    setStatusMsg(null);
    setErrorMsg(null);
    try {
      if (provider === 'MONOBANK') {
        await apiFetch('/api/integrations/MONOBANK', {
          method: 'PUT',
          body: JSON.stringify({
            mode: monoMode,
            config: { token: monoToken, accountId: monoAccount },
          }),
        });
      } else {
        await apiFetch('/api/integrations/PRIVAT24', {
          method: 'PUT',
          body: JSON.stringify({
            mode: p24Mode,
            config: { clientId: p24ClientId, token: p24Token, iban: p24Iban },
          }),
        });
      }
      const res = await apiFetch<{ summary: string }>('/api/integrations/bank/sync', {
        method: 'POST',
        body: JSON.stringify({ provider }),
      });
      setStatusMsg(res.summary);
      refreshAll();
    } catch (e) {
      setErrorMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const runImport = async () => {
    setBusy(true);
    setStatusMsg(null);
    setErrorMsg(null);
    try {
      if (importKind === 'items') {
        const res = await apiFetch<{ created: number; updated: number }>('/api/import/items', {
          method: 'POST',
          body: JSON.stringify({ csvText }),
        });
        setStatusMsg(
          `Імпорт номенклатури завершено: створено ${res.created}, оновлено ${res.updated}.`
        );
      } else if (importKind === 'counterparties') {
        const res = await apiFetch<{ created: number; updated: number }>(
          '/api/import/counterparties',
          {
            method: 'POST',
            body: JSON.stringify({ csvText }),
          }
        );
        setStatusMsg(
          `Імпорт контрагентів завершено: створено ${res.created}, оновлено ${res.updated}.`
        );
      } else {
        const res = await apiFetch<{
          docNumber?: string;
          linesCount: number;
          itemsAutoCreated: number;
          totalAmount?: string;
        }>('/api/import/opening-balances', {
          method: 'POST',
          body: JSON.stringify({
            warehouseId,
            docDate: `${docDate}T09:00:00Z`,
            csvText,
            autoPost: true,
          }),
        });
        setStatusMsg(
          `Створено та проведено документ ${res.docNumber ?? ''} (${res.linesCount} позицій, автостворено товарів: ${res.itemsAutoCreated}, сума: ${res.totalAmount ?? '0'} ₴).`
        );
      }
      refreshAll();
    } catch (e) {
      setErrorMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const runRepost = async () => {
    setBusy(true);
    setStatusMsg(null);
    setErrorMsg(null);
    try {
      const res = await apiFetch<{ repostedCount: number }>('/api/service/repost-from-date', {
        method: 'POST',
        body: JSON.stringify({ fromDate: `${repostDate}T00:00:00Z` }),
      });
      setStatusMsg(
        `Хронологічне перепроведення виконано успішно: перепроведено ${res.repostedCount} документів (FIFO + Дт/Кт).`
      );
      refreshAll();
    } catch (e) {
      setErrorMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const runRebuildTotals = async () => {
    setBusy(true);
    setStatusMsg(null);
    setErrorMsg(null);
    try {
      const res = await apiFetch<{ rowsRebuilt: number }>('/api/service/rebuild-totals', {
        method: 'POST',
      });
      setStatusMsg(
        `Таблицю місячних підсумків перераховано (${res.rowsRebuilt} агрегованих записів).`
      );
      refreshAll();
    } catch (e) {
      setErrorMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const saveOrgSettings = async () => {
    setBusy(true);
    setStatusMsg(null);
    setErrorMsg(null);
    try {
      await apiFetch('/api/organization', {
        method: 'PATCH',
        body: JSON.stringify({
          allowNegativeStock: allowNeg,
          lockDate: lockDate ? `${lockDate}T23:59:59Z` : null,
        }),
      });
      setStatusMsg('Параметри облікової політики збережено.');
      refreshAll();
    } catch (e) {
      setErrorMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Інтеграції (BAS OData, Банки, Checkbox ПРРО) та Сервіс
          </h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Кожен конектор працює в режимі DEMO (тест у 1 клік) або LIVE (пряме підключення за токенами)
          </p>
        </div>
        <button
          type="button"
          onClick={() => setUniversalImportOpen(true)}
          className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-extrabold shadow-xs transition"
          style={{
            background: 'linear-gradient(135deg, var(--primary), var(--primary-2))',
            color: 'var(--surface)',
          }}
        >
          <Upload className="h-4 w-4" />
          <span>Імпорт номенклатури з PDF / XLS / CSV / XML</span>
        </button>
      </div>

      {statusMsg && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
          <span>{statusMsg}</span>
        </div>
      )}
      {errorMsg && (
        <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* 4 Integration Cards */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* 1. BAS OData */}
        <div className="erp-card erp-card-hover relative overflow-hidden p-5 space-y-3">
          <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-indigo-500 to-blue-500" />
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <DatabaseZap className="h-5 w-5 text-indigo-600" />
              <h2 className="text-sm font-semibold text-slate-900">
                Прямий імпорт із бази 1С / BAS (Standard OData)
              </h2>
            </div>
            <select
              value={odataMode}
              onChange={(e) => setOdataMode(e.target.value as 'DEMO' | 'LIVE')}
              className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium"
            >
              <option value="DEMO">DEMO симулятор</option>
              <option value="LIVE">LIVE сервер BAS</option>
            </select>
          </div>
          <p className="text-xs text-slate-500">
            Ідемпотентна синхронізація `Catalog_Номенклатура`, `Catalog_Контрагенти` та залишків по
            `Ref_Key` GUID без дублювання при повторних запусках.
          </p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 text-xs">
            <input
              value={odataUrl}
              onChange={(e) => setOdataUrl(e.target.value)}
              placeholder="http://server/base/odata/standard.odata"
              className="rounded-lg border border-slate-300 px-2.5 py-1.5 font-mono sm:col-span-3"
            />
            <input
              value={odataUser}
              onChange={(e) => setOdataUser(e.target.value)}
              placeholder="Користувач BAS"
              className="rounded-lg border border-slate-300 px-2.5 py-1.5"
            />
            <input
              type="password"
              value={odataPass}
              onChange={(e) => setOdataPass(e.target.value)}
              placeholder="Пароль"
              className="rounded-lg border border-slate-300 px-2.5 py-1.5"
            />
            <button
              disabled={busy}
              onClick={handleOdataSync}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              <PlugZap className="h-3.5 w-3.5" /> Синхронізувати OData
            </button>
          </div>
        </div>

        {/* 2. Monobank */}
        <div className="erp-card erp-card-hover relative overflow-hidden p-5 space-y-3">
          <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-slate-900 to-slate-600" />
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Landmark className="h-5 w-5 text-slate-900" />
              <h2 className="text-sm font-semibold text-slate-900">
                Monobank API (Автоімпорт банківської виписки)
              </h2>
            </div>
            <select
              value={monoMode}
              onChange={(e) => setMonoMode(e.target.value as 'DEMO' | 'LIVE')}
              className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium"
            >
              <option value="DEMO">DEMO виписка</option>
              <option value="LIVE">LIVE X-Token</option>
            </select>
          </div>
          <p className="text-xs text-slate-500">
            Автоматично розпізнає контрагентів за ЄДРПОУ, створює та проводить `Надходження` /
            `Списання коштів` із проводками Дт/Кт на рахунок 311.
          </p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 text-xs">
            <input
              type="password"
              value={monoToken}
              onChange={(e) => setMonoToken(e.target.value)}
              placeholder="X-Token (api.monobank.ua)"
              className="rounded-lg border border-slate-300 px-2.5 py-1.5 font-mono sm:col-span-2"
            />
            <button
              disabled={busy}
              onClick={() => handleBankSync('MONOBANK')}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 font-medium text-white hover:bg-slate-800 disabled:opacity-50"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Завантажити виписку
            </button>
          </div>
        </div>

        {/* 3. Приват24 для бізнесу */}
        <div className="erp-card erp-card-hover relative overflow-hidden p-5 space-y-3">
          <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-emerald-500 to-lime-500" />
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Landmark className="h-5 w-5 text-emerald-600" />
              <h2 className="text-sm font-semibold text-slate-900">
                Приват24 для бізнесу (Autoclient API)
              </h2>
            </div>
            <select
              value={p24Mode}
              onChange={(e) => setP24Mode(e.target.value as 'DEMO' | 'LIVE')}
              className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium"
            >
              <option value="DEMO">DEMO виписка</option>
              <option value="LIVE">LIVE Автоклієнт</option>
            </select>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 text-xs">
            <input
              value={p24Iban}
              onChange={(e) => setP24Iban(e.target.value)}
              placeholder="IBAN рахунку"
              className="rounded-lg border border-slate-300 px-2.5 py-1.5 font-mono sm:col-span-3"
            />
            <input
              value={p24ClientId}
              onChange={(e) => setP24ClientId(e.target.value)}
              placeholder="Client ID"
              className="rounded-lg border border-slate-300 px-2.5 py-1.5"
            />
            <input
              type="password"
              value={p24Token}
              onChange={(e) => setP24Token(e.target.value)}
              placeholder="Token Автоклієнта"
              className="rounded-lg border border-slate-300 px-2.5 py-1.5"
            />
            <button
              disabled={busy}
              onClick={() => handleBankSync('PRIVAT24')}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Синхронізувати П24
            </button>
          </div>
        </div>

        {/* 4. Checkbox ПРРО */}
        <div className="erp-card erp-card-hover relative overflow-hidden p-5 space-y-3">
          <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-teal-500 to-cyan-400" />
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Receipt className="h-5 w-5 text-teal-600" />
              <h2 className="text-sm font-semibold text-slate-900">
                Checkbox ПРРО (Фіскалізація чеків у ДПС)
              </h2>
            </div>
            <select
              value={cbxMode}
              onChange={(e) => setCbxMode(e.target.value as 'DEMO' | 'LIVE')}
              className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium"
            >
              <option value="DEMO">DEMO пісочниця</option>
              <option value="LIVE">LIVE каса Checkbox</option>
            </select>
          </div>
          <p className="text-xs text-slate-500">
            Натискайте кнопку «ПРРО» навпроти будь-якої Видаткової накладної в Журналі документів
            для миттєвої фіскалізації чека.
          </p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-4 text-xs">
            <input
              value={cbxLicense}
              onChange={(e) => setCbxLicense(e.target.value)}
              placeholder="X-License-Key каси"
              className="rounded-lg border border-slate-300 px-2.5 py-1.5 font-mono sm:col-span-2"
            />
            <input
              value={cbxLogin}
              onChange={(e) => setCbxLogin(e.target.value)}
              placeholder="Логін касира"
              className="rounded-lg border border-slate-300 px-2.5 py-1.5"
            />
            <button
              disabled={busy}
              onClick={() =>
                saveProvider('CHECKBOX', cbxMode, {
                  licenseKey: cbxLicense,
                  login: cbxLogin,
                  password: cbxPass,
                })
              }
              className="inline-flex items-center justify-center gap-1 rounded-lg bg-teal-600 px-3 py-1.5 font-medium text-white hover:bg-teal-700 disabled:opacity-50"
            >
              <Save className="h-3.5 w-3.5" /> Зберегти
            </button>
          </div>
        </div>
      </div>

      {/* Журнал синхронізацій */}
      {integrations.data && integrations.data.logs.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
          <h3 className="text-sm font-semibold text-slate-900">
            Журнал обміну даними та фіскалізацій
          </h3>
          <div className="mt-3 space-y-1.5 text-xs">
            {integrations.data.logs.slice(0, 8).map((log) => (
              <div
                key={log.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2"
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-bold ${
                      log.status === 'SUCCESS'
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-rose-100 text-rose-800'
                    }`}
                  >
                    {log.provider}
                  </span>
                  <span className="text-slate-700">{log.summary}</span>
                </div>
                <span className="font-mono text-[11px] text-slate-400">
                  {fmtDate(log.createdAt)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* CSV Importer + Service */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Upload className="h-5 w-5 text-indigo-600" />
              <h2 className="text-base font-semibold text-slate-900">
                Файловий імпорт (PDF / XLS / CSV / XML)
              </h2>
            </div>
            <button
              type="button"
              onClick={() => setUniversalImportOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold"
              style={{
                background: 'var(--primary-soft)',
                color: 'var(--primary-ink)',
              }}
            >
              <Upload className="h-3.5 w-3.5" /> Завантажити файл
            </button>
          </div>

          <div className="flex flex-wrap gap-2">
            {[
              {
                id: 'opening-balances' as const,
                label: 'Початкові залишки',
                sample: SAMPLE_BALANCES_CSV,
              },
              { id: 'items' as const, label: 'Номенклатура', sample: SAMPLE_ITEMS_CSV },
              {
                id: 'counterparties' as const,
                label: 'Контрагенти',
                sample: `Контрагент;ЄДРПОУ;Телефон;Роль\nТОВ «Веста Логістик»;39012345;+380671234567;Покупець`,
              },
            ].map((k) => (
              <button
                key={k.id}
                onClick={() => {
                  setImportKind(k.id);
                  setCsvText(k.sample);
                }}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
                  importKind === k.id
                    ? 'bg-indigo-600 text-white'
                    : 'border border-slate-200 bg-slate-50 text-slate-700'
                }`}
              >
                {k.label}
              </button>
            ))}
          </div>

          {importKind === 'opening-balances' && (
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <label className="mb-1 block font-medium text-slate-600">Склад за замовчуванням</label>
                <select
                  value={warehouseId}
                  onChange={(e) => setWarehouseId(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-2.5 py-2"
                >
                  {bootstrap.warehouses.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block font-medium text-slate-600">Дата вводу залишків</label>
                <input
                  type="date"
                  value={docDate}
                  onChange={(e) => setDocDate(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-2.5 py-2"
                />
              </div>
            </div>
          )}

          <textarea
            rows={5}
            value={csvText}
            onChange={(e) => setCsvText(e.target.value)}
            className="w-full rounded-xl border border-slate-300 p-3 font-mono text-xs focus:border-indigo-500 focus:outline-none"
          />

          <button
            disabled={busy}
            onClick={runImport}
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            <Upload className="h-4 w-4" /> Завантажити CSV у базу
          </button>
        </div>

        <div className="space-y-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs space-y-4">
            <div className="flex items-center gap-2">
              <RefreshCw className="h-5 w-5 text-violet-600" />
              <h2 className="text-base font-semibold text-slate-900">
                Відновлення послідовності партій та проводок Дт/Кт
              </h2>
            </div>
            <p className="text-xs text-slate-500">
              Перепроводить усі документи в хронологічному порядку починаючи з вказаної дати,
              перераховуючи партії FIFO, резерви та бухгалтерські проводки за Планом рахунків №291.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <input
                type="date"
                value={repostDate}
                onChange={(e) => setRepostDate(e.target.value)}
                className="rounded-lg border border-slate-300 px-3 py-2 text-xs"
              />
              <button
                disabled={busy}
                onClick={runRepost}
                className="rounded-xl bg-violet-600 px-4 py-2 text-xs font-medium text-white hover:bg-violet-700 disabled:opacity-50"
              >
                Перепровести з дати
              </button>
              <button
                disabled={busy}
                onClick={runRebuildTotals}
                className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Перерахувати підсумки
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs space-y-4">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-emerald-600" />
              <h2 className="text-base font-semibold text-slate-900">Облікова політика</h2>
            </div>

            <label className="flex items-center gap-3 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={allowNeg}
                onChange={(e) => setAllowNeg(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-indigo-600"
              />
              Дозволити списання товару в «мінус» (відключити контроль залишків і резервів)
            </label>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">
                Дата заборони редагування (Закритий період)
              </label>
              <input
                type="date"
                value={lockDate}
                onChange={(e) => setLockDate(e.target.value)}
                className="rounded-lg border border-slate-300 px-3 py-2 text-xs"
              />
            </div>

            <button
              disabled={busy}
              onClick={saveOrgSettings}
              className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50"
            >
              Зберегти налаштування
            </button>
          </div>
        </div>
      </div>

      {universalImportOpen && (
        <UniversalItemsImportModal
          bootstrap={bootstrap}
          onClose={() => setUniversalImportOpen(false)}
          onImported={(res) => {
            setStatusMsg(
              `Універсальний імпорт завершено: створено ${res.created}, оновлено ${res.updated}, категорій +${res.categoriesCreated}${
                res.priceDocNumber ? `, проведено прайс-лист №${res.priceDocNumber}` : ''
              }.`
            );
            refreshAll();
          }}
        />
      )}
    </div>
  );
}
