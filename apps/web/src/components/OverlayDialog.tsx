import { useEffect, useRef, useState, type ReactNode } from 'react';

interface OverlayDialogProps {
  ariaLabel: string;
  variant: 'center' | 'top' | 'drawer';
  maxWidthClass?: string;
  onClose: () => void;
  children: (requestClose: () => void) => ReactNode;
}

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

export function OverlayDialog({
  ariaLabel,
  variant,
  maxWidthClass,
  onClose,
  children,
}: OverlayDialogProps) {
  const [closing, setClosing] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const closingRef = useRef(false);

  const requestClose = () => {
    if (closingRef.current) return;
    closingRef.current = true;
    const prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) {
      onClose();
      return;
    }
    setClosing(true);
    window.setTimeout(() => {
      onClose();
    }, 150);
  };

  useEffect(() => {
    openerRef.current = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // Focus first focusable element (or the dialog itself)
    const timer = window.setTimeout(() => {
      const el = dialogRef.current;
      if (!el) return;
      const autoEl = el.querySelector<HTMLElement>('[data-autofocus="true"]');
      const firstFocusable = autoEl ?? el.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
      if (firstFocusable) {
        firstFocusable.focus();
      } else {
        el.focus();
      }
    }, 10);

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        requestClose();
        return;
      }

      if (e.key === 'Tab') {
        const el = dialogRef.current;
        if (!el) return;
        const focusables = Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
          (node) => node.offsetParent !== null
        );
        if (focusables.length === 0) {
          e.preventDefault();
          return;
        }
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey) {
          if (document.activeElement === first || !el.contains(document.activeElement)) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last || !el.contains(document.activeElement)) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = prevOverflow;
      openerRef.current?.focus();
    };
  }, []);

  if (variant === 'drawer') {
    return (
      <div
        className="backdrop fixed inset-0 z-50"
        data-closing={closing ? 'true' : undefined}
        style={{
          background: 'var(--backdrop-bg)',
          backdropFilter: 'blur(6px)',
        }}
        onClick={requestClose}
      >
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-label={ariaLabel}
          tabIndex={-1}
          data-closing={closing ? 'true' : undefined}
          onClick={(e) => e.stopPropagation()}
          className="drawer fixed flex flex-col overflow-hidden"
          style={{
            top: '16px',
            right: '16px',
            bottom: '16px',
            width: 'min(440px, calc(100% - 32px))',
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--r-xl)',
            boxShadow: 'var(--shadow-modal)',
          }}
        >
          {children(requestClose)}
        </div>
      </div>
    );
  }

  if (variant === 'top') {
    return (
      <div
        className="backdrop fixed inset-0 z-50 flex items-start justify-center px-3"
        data-closing={closing ? 'true' : undefined}
        style={{
          paddingTop: 'min(90px, 12vh)',
          background: 'var(--backdrop-bg)',
          backdropFilter: 'blur(6px)',
        }}
        onClick={requestClose}
      >
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-label={ariaLabel}
          tabIndex={-1}
          data-closing={closing ? 'true' : undefined}
          onClick={(e) => e.stopPropagation()}
          className={`popin flex w-full flex-col overflow-hidden ${maxWidthClass ?? 'max-w-[600px]'}`}
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: '24px',
            boxShadow: 'var(--shadow-modal)',
            maxHeight: 'calc(100vh - 120px)',
          }}
        >
          {children(requestClose)}
        </div>
      </div>
    );
  }

  return (
    <div
      className="backdrop fixed inset-0 z-50 flex items-center justify-center p-3"
      data-closing={closing ? 'true' : undefined}
      style={{
        background: 'var(--backdrop-bg)',
        backdropFilter: 'blur(6px)',
      }}
      onClick={requestClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        tabIndex={-1}
        data-closing={closing ? 'true' : undefined}
        onClick={(e) => e.stopPropagation()}
        className={`popin flex w-full flex-col overflow-hidden ${maxWidthClass ?? 'max-w-[640px]'}`}
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--r-xl)',
          boxShadow: 'var(--shadow-modal)',
          maxHeight: 'calc(100vh - 24px)',
        }}
      >
        {children(requestClose)}
      </div>
    </div>
  );
}
