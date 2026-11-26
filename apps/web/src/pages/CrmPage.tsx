import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  PhoneCall,
  CheckSquare,
  Plus,
  ArrowRight,
  ShoppingBag,
  Clock,
  CheckCircle2,
  User,
  TrendingUp,
  Upload,
} from 'lucide-react';
import { apiFetch, fmtDate, fmtMoney, type BootstrapData } from '../lib/api';
import { SmartCounterpartyCombobox } from '../components/SmartCounterpartyCombobox';
import { UniversalCounterpartiesImportModal } from '../components/UniversalCounterpartiesImportModal';

type StageKey = 'NEW' | 'QUALIFIED' | 'PROPOSAL' | 'NEGOTIATION' | 'WON' | 'LOST';

const STAGES: Array<{ key: StageKey; label: string; accent: string; badge: string }> = [
  { key: 'NEW', label: 'Новий лід', accent: 'border-t-slate-400', badge: 'bg-slate-100 text-slate-700' },
  { key: 'QUALIFIED', label: 'Кваліфікація', accent: 'border-t-blue-500', badge: 'bg-blue-50 text-blue-700' },
  { key: 'PROPOSAL', label: 'Надіслано КП', accent: 'border-t-indigo-500', badge: 'bg-indigo-50 text-indigo-700' },
  { key: 'NEGOTIATION', label: 'Переговори', accent: 'border-t-amber-500', badge: 'bg-amber-50 text-amber-700' },
  { key: 'WON', label: 'Успішно', accent: 'border-t-emerald-500', badge: 'bg-emerald-50 text-emerald-700' },
];

interface CrmResponse {
  leads: Array<{
    id: string;
    title: string;
    contactName: string;
    phone: string;
    email: string;
    source: string;
    stage: StageKey;
    expectedAmount: string;
    assignedTo: string;
    notes: string;
    convertedOrderId: string | null;
    activities: Array<{
      id: string;
      activityType: 'CALL' | 'TASK' | 'MEETING' | 'EMAIL';
      subject: string;
      outcome: string;
      durationSec: number;
      dueAt: string | null;
      isDone: boolean;
      assignedTo: string;
      createdAt: string;
    }>;
  }>;
  activities: Array<{
    id: string;
    leadId: string;
    activityType: 'CALL' | 'TASK' | 'MEETING' | 'EMAIL';
    subject: string;
    outcome: string;
    durationSec: number;
    dueAt: string | null;
    isDone: boolean;
    assignedTo: string;
    createdAt: string;
  }>;
  metrics: {
    totalLeads: number;
    totalPipelineAmount: string;
    wonAmount: string;
    wonCount: number;
    conversionRate: string;
    openTasksCount: number;
    callsCount: number;
  };
}

export function CrmPage({ bootstrap }: { bootstrap: BootstrapData }) {
  const qc = useQueryClient();
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [newLead, setNewLead] = useState({
    title: '',
    counterpartyId: '',
    contactName: '',
    phone: '',
    expectedAmount: '50000',
    source: 'SITE',
  });
  const [newAct, setNewAct] = useState({
    activityType: 'CALL' as 'CALL' | 'TASK',
    subject: '',
    outcome: '',
    durationSec: 180,
  });
  const [notice, setNotice] = useState<string | null>(null);
  const [cpImportOpen, setCpImportOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['crm-pipeline', bootstrap.organization.id, bootstrap.activeDepartmentId ?? 'ALL'],
    queryFn: () => apiFetch<CrmResponse>('/api/crm/pipeline'),
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['crm-pipeline'] });
    qc.invalidateQueries({ queryKey: ['documents'] });
  };

  const handleCreateLead = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLead.title) return;
    await apiFetch('/api/crm/leads', {
      method: 'POST',
      body: JSON.stringify({
        ...newLead,
        departmentId: bootstrap.activeDepartmentId ?? bootstrap.departments[0]?.id ?? null,
        counterpartyId: newLead.counterpartyId || null,
      }),
    });
    setNewLead({
      title: '',
      counterpartyId: '',
      contactName: '',
      phone: '',
      expectedAmount: '50000',
      source: 'SITE',
    });
    setNotice('Новий лід додано у воронку продажів');
    refresh();
  };

  const handleMoveStage = async (leadId: string, stage: StageKey) => {
    await apiFetch(`/api/crm/leads/${leadId}/stage`, {
      method: 'PATCH',
      body: JSON.stringify({ stage }),
    });
    refresh();
  };

  const handleConvert = async (leadId: string, title: string) => {
    const order = await apiFetch<{ docNumber: string }>(`/api/crm/leads/${leadId}/convert`, {
      method: 'POST',
    });
    setNotice(`Угоду «${title}» переведено у Замовлення покупця №${order.docNumber}!`);
    refresh();
  };

  const handleAddActivity = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetId = selectedLeadId || data?.leads[0]?.id;
    if (!targetId || !newAct.subject) return;
    await apiFetch('/api/crm/activities', {
      method: 'POST',
      body: JSON.stringify({ leadId: targetId, ...newAct }),
    });
    setNewAct({ activityType: 'CALL', subject: '', outcome: '', durationSec: 180 });
    setNotice('Запис додано до історії комунікацій CRM');
    refresh();
  };

  const handleToggleTask = async (actId: string, isDone: boolean) => {
    await apiFetch(`/api/crm/activities/${actId}/toggle`, {
      method: 'PATCH',
      body: JSON.stringify({ isDone }),
    });
    refresh();
  };

  if (isLoading || !data) {
    return <div className="text-sm text-slate-500">Завантаження CRM-воронки...</div>;
  }

  const activeLead =
    data.leads.find((l) => l.id === selectedLeadId) ?? data.leads[0] ?? null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs font-semibold" style={{ color: 'var(--muted)' }}>
          База клієнтів: <strong>{bootstrap.counterparties.filter((c) => c.isCustomer).length}</strong> покупців
        </div>
        <button
          type="button"
          onClick={() => setCpImportOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-extrabold transition"
          style={{
            background: 'var(--pos-soft)',
            color: 'var(--pos-ink)',
            border: '1px solid var(--pos)',
          }}
        >
          <Upload className="h-3.5 w-3.5" />
          <span>Імпорт покупців (PDF / XLS / CSV / XML)</span>
        </button>
      </div>

      {/* Metrics Strip */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="erp-card p-4">
          <div className="text-[11px] font-semibold uppercase text-slate-500">
            Сума активної воронки
          </div>
          <div className="mt-2 font-mono text-2xl font-bold text-slate-900">
            {fmtMoney(data.metrics.totalPipelineAmount)}
          </div>
          <div className="mt-1 text-xs text-slate-500">Угод у роботі: {data.metrics.totalLeads}</div>
        </div>
        <div className="erp-card p-4">
          <div className="text-[11px] font-semibold uppercase text-slate-500">
            Виграно / Конверсія
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-mono text-2xl font-bold text-emerald-700">
              {fmtMoney(data.metrics.wonAmount)}
            </span>
          </div>
          <div className="mt-1 flex items-center gap-1 text-xs font-medium text-emerald-700">
            <TrendingUp className="h-3.5 w-3.5" /> Конверсія: {data.metrics.conversionRate}%
          </div>
        </div>
        <div className="erp-card p-4">
          <div className="text-[11px] font-semibold uppercase text-slate-500">
            Відкриті задачі менеджерів
          </div>
          <div className="mt-2 font-mono text-2xl font-bold text-amber-600">
            {data.metrics.openTasksCount}
          </div>
          <div className="mt-1 text-xs text-slate-500">Потребують виконання</div>
        </div>
        <div className="erp-card p-4">
          <div className="text-[11px] font-semibold uppercase text-slate-500">
            Зафіксовано дзвінків
          </div>
          <div className="mt-2 font-mono text-2xl font-bold text-indigo-700">
            {data.metrics.callsCount}
          </div>
          <div className="mt-1 text-xs text-slate-500">Повна історія по кожній угоді</div>
        </div>
      </div>

      {notice && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs font-medium text-emerald-800">
          <CheckCircle2 className="h-4 w-4 text-emerald-600" /> {notice}
        </div>
      )}

      {/* Quick Create Lead */}
      <form onSubmit={handleCreateLead} className="erp-card grid grid-cols-1 gap-3 p-4 sm:grid-cols-12">
        <input
          required
          placeholder="Назва угоди / ліда (напр. Поставка 10 ноутбуків)"
          value={newLead.title}
          onChange={(e) => setNewLead((s) => ({ ...s, title: e.target.value }))}
          className="rounded-lg border border-slate-300 px-3 py-2 text-xs sm:col-span-3"
        />
        <div className="sm:col-span-3">
          <SmartCounterpartyCombobox
            bootstrap={bootstrap}
            value={newLead.counterpartyId}
            onChange={(id) => {
              const cp = bootstrap.counterparties.find((c) => c.id === id);
              setNewLead((s) => ({
                ...s,
                counterpartyId: id,
                contactName: s.contactName || cp?.name || '',
                phone: s.phone || cp?.phone || '',
              }));
            }}
            defaultRole="customer"
            placeholder="Покупець (наберіть для пошуку або створення)..."
          />
        </div>
        <input
          placeholder="Контактна особа"
          value={newLead.contactName}
          onChange={(e) => setNewLead((s) => ({ ...s, contactName: e.target.value }))}
          className="rounded-lg border border-slate-300 px-3 py-2 text-xs sm:col-span-2"
        />
        <input
          placeholder="Телефон"
          value={newLead.phone}
          onChange={(e) => setNewLead((s) => ({ ...s, phone: e.target.value }))}
          className="rounded-lg border border-slate-300 px-3 py-2 text-xs sm:col-span-2"
        />
        <input
          type="number"
          placeholder="Бюджет (₴)"
          value={newLead.expectedAmount}
          onChange={(e) => setNewLead((s) => ({ ...s, expectedAmount: e.target.value }))}
          className="rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs sm:col-span-1"
        />
        <button
          type="submit"
          className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-700 sm:col-span-1"
        >
          <Plus className="h-3.5 w-3.5" /> Лід
        </button>
      </form>

      {/* Kanban Pipeline */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-5">
        {STAGES.map((stage, sIdx) => {
          const stageLeads = data.leads.filter((l) => l.stage === stage.key);
          const stageSum = stageLeads.reduce((acc, l) => acc + Number(l.expectedAmount), 0);
          const nextStage = STAGES[sIdx + 1]?.key;

          return (
            <div
              key={stage.key}
              className={`erp-card flex flex-col border-t-4 ${stage.accent} bg-slate-50/70 p-3`}
            >
              <div className="mb-3 flex items-center justify-between">
                <span className={`rounded-md px-2 py-0.5 text-[11px] font-bold ${stage.badge}`}>
                  {stage.label} ({stageLeads.length})
                </span>
                <span className="font-mono text-[11px] font-semibold text-slate-600">
                  {fmtMoney(stageSum)}
                </span>
              </div>

              <div className="space-y-2.5">
                {stageLeads.map((lead) => {
                  const isSel = activeLead?.id === lead.id;
                  return (
                    <div
                      key={lead.id}
                      onClick={() => setSelectedLeadId(lead.id)}
                      className={`cursor-pointer rounded-xl border bg-white p-3 transition ${
                        isSel
                          ? 'border-indigo-500 ring-2 ring-indigo-100'
                          : 'border-slate-200 hover:border-indigo-300'
                      }`}
                    >
                      <div className="text-xs font-bold text-slate-900">{lead.title}</div>
                      <div className="mt-1 flex items-center gap-1.5 text-[11px] text-slate-500">
                        <User className="h-3 w-3" /> {lead.contactName || 'Клієнт'}
                      </div>
                      <div className="mt-2 font-mono text-sm font-bold text-indigo-700">
                        {fmtMoney(lead.expectedAmount)}
                      </div>
                      <div className="mt-2.5 flex flex-wrap items-center justify-between gap-1 border-t border-slate-100 pt-2">
                        {nextStage && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleMoveStage(lead.id, nextStage);
                            }}
                            className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-700 hover:bg-indigo-100 hover:text-indigo-700"
                          >
                            Далі <ArrowRight className="h-2.5 w-2.5" />
                          </button>
                        )}
                        {!lead.convertedOrderId && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleConvert(lead.id, lead.title);
                            }}
                            className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-700 hover:bg-emerald-100"
                          >
                            <ShoppingBag className="h-2.5 w-2.5" /> У замовлення
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Activity Timeline: Calls & Manager Tasks */}
      {activeLead && (
        <div className="erp-card grid grid-cols-1 gap-6 p-6 lg:grid-cols-3">
          <div className="space-y-3">
            <h3 className="font-display text-sm font-bold text-slate-900">
              Комунікація: {activeLead.title}
            </h3>
            <div className="rounded-xl bg-slate-50 p-3 text-xs space-y-1">
              <div>
                <span className="text-slate-500">Контакт:</span>{' '}
                <strong>{activeLead.contactName || '—'}</strong>
              </div>
              <div>
                <span className="text-slate-500">Телефон:</span>{' '}
                <span className="font-mono">{activeLead.phone || '—'}</span>
              </div>
              <div>
                <span className="text-slate-500">Менеджер:</span> {activeLead.assignedTo}
              </div>
              {activeLead.notes && <div className="pt-1 text-slate-600">{activeLead.notes}</div>}
            </div>

            <form onSubmit={handleAddActivity} className="space-y-2.5 text-xs">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setNewAct((s) => ({ ...s, activityType: 'CALL' }))}
                  className={`flex-1 rounded-lg py-1.5 font-semibold ${
                    newAct.activityType === 'CALL'
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  📞 Записати дзвінок
                </button>
                <button
                  type="button"
                  onClick={() => setNewAct((s) => ({ ...s, activityType: 'TASK' }))}
                  className={`flex-1 rounded-lg py-1.5 font-semibold ${
                    newAct.activityType === 'TASK'
                      ? 'bg-amber-600 text-white'
                      : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  ☑ Поставити задачу
                </button>
              </div>
              <input
                required
                placeholder={
                  newAct.activityType === 'CALL'
                    ? 'Тема дзвінка (напр. Узгодження ціни)'
                    : 'Задача менеджеру (напр. Надіслати договір)'
                }
                value={newAct.subject}
                onChange={(e) => setNewAct((s) => ({ ...s, subject: e.target.value }))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
              />
              <input
                placeholder="Результат / примітка"
                value={newAct.outcome}
                onChange={(e) => setNewAct((s) => ({ ...s, outcome: e.target.value }))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
              />
              <button
                type="submit"
                className="w-full rounded-lg bg-slate-900 py-2 font-semibold text-white hover:bg-slate-800"
              >
                Зберегти в історію CRM
              </button>
            </form>
          </div>

          <div className="lg:col-span-2">
            <h3 className="mb-3 font-display text-sm font-bold text-slate-900">
              Історія дзвінків та задачі по угоді ({activeLead.activities.length})
            </h3>
            <div className="space-y-2.5">
              {activeLead.activities.map((a) => (
                <div
                  key={a.id}
                  className="flex items-start justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50/80 p-3.5 text-xs"
                >
                  <div className="flex items-start gap-3">
                    {a.activityType === 'CALL' ? (
                      <div className="rounded-lg bg-indigo-100 p-2 text-indigo-700">
                        <PhoneCall className="h-3.5 w-3.5" />
                      </div>
                    ) : (
                      <button
                        onClick={() => handleToggleTask(a.id, !a.isDone)}
                        className={`rounded-lg p-2 ${
                          a.isDone
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-amber-100 text-amber-700'
                        }`}
                      >
                        <CheckSquare className="h-3.5 w-3.5" />
                      </button>
                    )}
                    <div>
                      <div
                        className={`font-semibold ${
                          a.activityType === 'TASK' && a.isDone
                            ? 'line-through text-slate-400'
                            : 'text-slate-900'
                        }`}
                      >
                        {a.subject}
                      </div>
                      {a.outcome && <div className="mt-0.5 text-slate-600">{a.outcome}</div>}
                      <div className="mt-1 flex items-center gap-3 text-[11px] text-slate-400">
                        <span>{a.assignedTo}</span>
                        {a.durationSec > 0 && (
                          <span className="inline-flex items-center gap-1">
                            <Clock className="h-3 w-3" /> {Math.round(a.durationSec / 60)} хв
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <span className="font-mono text-[11px] text-slate-400">
                    {fmtDate(a.createdAt)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {cpImportOpen && (
        <UniversalCounterpartiesImportModal
          onClose={() => setCpImportOpen(false)}
          onImported={(res) => {
            setNotice(
              `Імпорт покупців завершено: додано ${res.created}, оновлено ${res.updated}, створено договорів: ${res.contractsCreated}.`
            );
            refresh();
          }}
        />
      )}
    </div>
  );
}
