import { useEffect, useState } from 'react';
import {
  X,
  Share2,
  Copy,
  Check,
  ExternalLink,
  RefreshCw,
  Send,
  MessageCircle,
  Phone,
} from 'lucide-react';
import {
  apiFetch,
  DOC_TYPE_META,
  fmtDate,
  fmtMoney,
  type DocumentType,
} from '../lib/api';
import { OverlayDialog } from './OverlayDialog';

interface ShareResponse {
  shareToken: string;
  documentId: string;
  docType: DocumentType;
  docNumber: string;
  docDate: string;
  totalAmount: string;
  status: string;
  organizationName: string;
  counterpartyName: string;
  counterpartyPhone: string;
}

interface Props {
  documentId: string;
  docNumber?: string;
  onClose: () => void;
}

export function ShareDocumentModal({ documentId, docNumber, onClose }: Props) {
  const [data, setData] = useState<ShareResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [regenerating, setRegenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copiedMsg, setCopiedMsg] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    apiFetch<ShareResponse>(`/api/documents/${documentId}/share`, {
      method: 'POST',
    })
      .then((res) => setData(res))
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false));
  }, [documentId]);

  const shareUrl = data
    ? `${window.location.origin}/share/${data.shareToken}`
    : '';

  const docLabel = data ? DOC_TYPE_META[data.docType]?.label ?? 'Документ' : 'Документ';
  const shareMessage = data
    ? `Вітаємо! ${data.organizationName} надсилає документ: ${docLabel} №${data.docNumber} від ${fmtDate(data.docDate)} на суму ${fmtMoney(data.totalAmount)}.\nПереглянути онлайн та завантажити PDF: ${shareUrl}`
    : '';

  const handleCopyUrl = async () => {
    if (!shareUrl) return;
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  const handleCopyMessage = async () => {
    if (!shareMessage) return;
    await navigator.clipboard.writeText(shareMessage);
    setCopiedMsg(true);
    window.setTimeout(() => setCopiedMsg(false), 2000);
  };

  const handleRegenerate = async () => {
    if (
      !confirm(
        'Оновити посилання? Попереднє посилання перестане відкриватися для клієнтів.'
      )
    ) {
      return;
    }
    setRegenerating(true);
    try {
      const res = await apiFetch<{ shareToken: string }>(
        `/api/documents/${documentId}/share/regenerate`,
        { method: 'POST' }
      );
      setData((prev) => (prev ? { ...prev, shareToken: res.shareToken } : prev));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setRegenerating(false);
    }
  };

  const telegramHref = shareUrl
    ? `https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(
        `${data?.organizationName}: ${docLabel} №${data?.docNumber} на суму ${fmtMoney(data?.totalAmount)}`
      )}`
    : '#';

  const viberHref = shareMessage
    ? `viber://forward?text=${encodeURIComponent(shareMessage)}`
    : '#';

  const cleanPhone = (data?.counterpartyPhone ?? '').replace(/[^\d]/g, '');
  const whatsappHref = shareMessage
    ? `https://wa.me/${cleanPhone}?text=${encodeURIComponent(shareMessage)}`
    : '#';

  return (
    <OverlayDialog
      ariaLabel={`Поділитися документом №${docNumber ?? data?.docNumber ?? ''}`}
      variant="center"
      maxWidthClass="max-w-[560px]"
      onClose={onClose}
    >
      {(requestClose) => (
        <div className="flex flex-col gap-5 overflow-y-auto p-6">
          {/* Header */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <span
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl"
                style={{
                  background: 'var(--primary-soft)',
                  color: 'var(--primary)',
                }}
              >
                <Share2 className="h-5 w-5" aria-hidden="true" />
              </span>
              <div>
                <div className="overline-label" style={{ color: 'var(--primary)' }}>
                  Відкрите посилання для клієнта
                </div>
                <h2
                  className="font-display font-extrabold"
                  style={{ fontSize: '20px', color: 'var(--text)' }}
                >
                  Надіслати в месенджер
                </h2>
              </div>
            </div>
            <button
              type="button"
              onClick={requestClose}
              aria-label="Закрити"
              className="flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-full"
              style={{
                background: 'var(--surface-2)',
                border: '1px solid var(--border)',
                color: 'var(--muted)',
              }}
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>

          {loading && (
            <div className="py-8 text-center text-[14px]" style={{ color: 'var(--muted)' }}>
              Генерація відкритого онлайн-посилання...
            </div>
          )}

          {error && (
            <div
              className="p-3.5 text-[13px] font-semibold"
              style={{
                background: 'var(--neg-soft)',
                color: 'var(--neg-ink)',
                borderRadius: 'var(--r-md)',
              }}
            >
              {error}
            </div>
          )}

          {data && (
            <>
              {/* Document Summary Card */}
              <div
                className="flex flex-wrap items-center justify-between gap-2 p-4"
                style={{
                  background: 'var(--surface-2)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--r-md)',
                }}
              >
                <div>
                  <div className="text-[14px] font-bold" style={{ color: 'var(--text)' }}>
                    {docLabel} <span className="font-mono">№{data.docNumber}</span>
                  </div>
                  <div className="mt-0.5 text-[12px]" style={{ color: 'var(--muted)' }}>
                    {fmtDate(data.docDate)}
                    {data.counterpartyName ? ` · ${data.counterpartyName}` : ''}
                  </div>
                </div>
                <div className="font-mono text-[18px] font-bold" style={{ color: 'var(--text)' }}>
                  {fmtMoney(data.totalAmount)}
                </div>
              </div>

              {/* Public Link Input + Copy */}
              <div className="space-y-1.5">
                <label
                  htmlFor="public-share-url"
                  className="block text-[12px] font-bold"
                  style={{ color: 'var(--text-2)' }}
                >
                  Пряме посилання (клієнт відкриє без логіну, зможе скопіювати IBAN і зберегти PDF)
                </label>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <input
                    id="public-share-url"
                    type="text"
                    readOnly
                    value={shareUrl}
                    onFocus={(e) => e.currentTarget.select()}
                    className="min-h-[44px] flex-1 px-3.5 font-mono text-[12.5px]"
                    style={{
                      background: 'var(--surface-2)',
                      border: '1px solid var(--border-strong)',
                      borderRadius: 'var(--r-sm)',
                      color: 'var(--text)',
                    }}
                  />
                  <button
                    type="button"
                    data-autofocus="true"
                    onClick={handleCopyUrl}
                    className="inline-flex min-h-[44px] shrink-0 items-center justify-center gap-1.5 px-4 text-[13px] font-extrabold transition"
                    style={{
                      borderRadius: 'var(--r-sm)',
                      background: copied
                        ? 'var(--pos)'
                        : 'linear-gradient(135deg, var(--primary), var(--primary-2))',
                      color: 'var(--surface)',
                    }}
                  >
                    {copied ? (
                      <>
                        <Check className="h-4 w-4" aria-hidden="true" />
                        <span>Скопійовано</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-4 w-4" aria-hidden="true" />
                        <span>Копіювати</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Messenger Buttons */}
              <div className="space-y-2">
                <div className="overline-label" style={{ color: 'var(--muted)' }}>
                  Надіслати в месенджер в 1 клік
                </div>
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                  <a
                    href={telegramHref}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex min-h-[44px] items-center justify-center gap-2 px-3 text-[13px] font-bold transition"
                    style={{
                      borderRadius: 'var(--r-sm)',
                      background: 'var(--info-soft)',
                      color: 'var(--info-ink)',
                    }}
                  >
                    <Send className="h-4 w-4" aria-hidden="true" />
                    <span>Telegram</span>
                  </a>
                  <a
                    href={viberHref}
                    className="inline-flex min-h-[44px] items-center justify-center gap-2 px-3 text-[13px] font-bold transition"
                    style={{
                      borderRadius: 'var(--r-sm)',
                      background: 'var(--violet-soft)',
                      color: 'var(--violet-ink)',
                    }}
                  >
                    <Phone className="h-4 w-4" aria-hidden="true" />
                    <span>Viber</span>
                  </a>
                  <a
                    href={whatsappHref}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex min-h-[44px] items-center justify-center gap-2 px-3 text-[13px] font-bold transition"
                    style={{
                      borderRadius: 'var(--r-sm)',
                      background: 'var(--pos-soft)',
                      color: 'var(--pos-ink)',
                    }}
                  >
                    <MessageCircle className="h-4 w-4" aria-hidden="true" />
                    <span>WhatsApp</span>
                  </a>
                </div>
              </div>

              {/* Footer Actions: Preview Online, Copy Full Text, Regenerate */}
              <div
                className="flex flex-wrap items-center justify-between gap-2 pt-3"
                style={{ borderTop: '1px solid var(--border)' }}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <a
                    href={shareUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex min-h-[40px] items-center gap-1.5 px-3 text-[12px] font-bold"
                    style={{
                      borderRadius: 'var(--r-sm)',
                      border: '1px solid var(--border-strong)',
                      background: 'var(--surface)',
                      color: 'var(--text)',
                    }}
                  >
                    <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Відкрити як клієнт</span>
                  </a>
                  <button
                    type="button"
                    onClick={handleCopyMessage}
                    className="inline-flex min-h-[40px] items-center gap-1.5 px-3 text-[12px] font-bold"
                    style={{
                      borderRadius: 'var(--r-sm)',
                      border: '1px solid var(--border-strong)',
                      background: 'var(--surface)',
                      color: 'var(--text-2)',
                    }}
                  >
                    {copiedMsg ? (
                      <>
                        <Check className="h-3.5 w-3.5" style={{ color: 'var(--pos)' }} aria-hidden="true" />
                        <span>Текст скопійовано</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>Копіювати повідомлення</span>
                      </>
                    )}
                  </button>
                </div>

                <button
                  type="button"
                  disabled={regenerating}
                  onClick={handleRegenerate}
                  className="inline-flex min-h-[40px] items-center gap-1.5 px-2.5 text-[12px] font-semibold"
                  style={{ color: 'var(--muted)' }}
                  title="Анулювати старе посилання і створити нове"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${regenerating ? 'animate-spin' : ''}`} aria-hidden="true" />
                  <span>Оновити лінк</span>
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </OverlayDialog>
  );
}
