"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

// The one feedback channel for the whole app: toasts for outcomes
// (saved, booked, blocked, failed) and a promise-based confirm/prompt
// dialog in place of window.confirm/prompt. Mounted once in the root
// layout; everything else calls useNotify()/useConfirm(). Server actions
// go through notify.run(), which turns the UserError message that
// unwrap() rethrows into an error toast — so a permission, plan-limit or
// lockout message reads the same on every page without per-feature code.

export type ToastKind = "success" | "error" | "warning" | "info";
export type ToastInput = { title?: string; action?: { label: string; onClick: () => void }; sticky?: boolean; duration?: number };
type Toast = ToastInput & { id: number; kind: ToastKind; message: string };

export type ConfirmOptions = {
  title: string;
  body?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  // With `input`, resolves to the entered string (or null on cancel)
  // instead of a boolean — the window.prompt replacement.
  input?: { label?: string; placeholder?: string; defaultValue?: string; required?: boolean };
};

type RunOptions = { success?: string; error?: string };

export type Notify = {
  success: (message: string, opts?: ToastInput) => void;
  error: (message: string, opts?: ToastInput) => void;
  warning: (message: string, opts?: ToastInput) => void;
  info: (message: string, opts?: ToastInput) => void;
  dismiss: (id: number) => void;
  // Await an action: success toast if `success` given, error toast on
  // throw (the thrown message, or `error` as fallback). Resolves to the
  // value, or undefined when it failed — callers branch on that.
  run: <T>(fn: () => Promise<T>, opts?: RunOptions) => Promise<T | undefined>;
};

type ConfirmFn = {
  (opts: ConfirmOptions & { input: NonNullable<ConfirmOptions["input"]> }): Promise<string | null>;
  (opts: ConfirmOptions): Promise<boolean>;
};

const NotifyContext = createContext<Notify | null>(null);
const ConfirmContext = createContext<ConfirmFn | null>(null);

export type NotificationLabels = { confirm: string; cancel: string; close: string; errorGeneric: string };

// success/info fade on their own; warnings a little later; errors stay
// until read — a blocked action shouldn't vanish while someone reaches
// for the phone.
const DURATION: Record<ToastKind, number> = { success: 4000, info: 4500, warning: 6500, error: 0 };
const MAX_VISIBLE = 3;

export function NotificationsProvider({ labels, children }: { labels: NotificationLabels; children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => setToasts((list) => list.filter((t) => t.id !== id)), []);

  const push = useCallback(
    (kind: ToastKind, message: string, opts: ToastInput = {}) => {
      const id = nextId.current++;
      setToasts((list) => [...list, { id, kind, message, ...opts }].slice(-MAX_VISIBLE));
    },
    [],
  );

  const notify = useMemo<Notify>(
    () => ({
      success: (m, o) => push("success", m, o),
      error: (m, o) => push("error", m, o),
      warning: (m, o) => push("warning", m, o),
      info: (m, o) => push("info", m, o),
      dismiss,
      run: async (fn, opts = {}) => {
        try {
          const value = await fn();
          if (opts.success) push("success", opts.success);
          return value;
        } catch (e) {
          push("error", (e instanceof Error && e.message) || opts.error || labels.errorGeneric);
          return undefined;
        }
      },
    }),
    [push, dismiss, labels.errorGeneric],
  );

  // Confirm dialog state: one at a time, resolved by the buttons.
  const [pending, setPending] = useState<{ opts: ConfirmOptions; resolve: (v: boolean | string | null) => void } | null>(null);
  const confirm = useCallback((opts: ConfirmOptions) => new Promise<boolean | string | null>((resolve) => setPending({ opts, resolve })), []) as ConfirmFn;

  return (
    <NotifyContext.Provider value={notify}>
      <ConfirmContext.Provider value={confirm}>
        {children}
        <Toaster toasts={toasts} dismiss={dismiss} closeLabel={labels.close} />
        {pending && (
          <ConfirmDialog
            opts={pending.opts}
            labels={labels}
            onClose={(v) => {
              pending.resolve(v);
              setPending(null);
            }}
          />
        )}
      </ConfirmContext.Provider>
    </NotifyContext.Provider>
  );
}

export function useNotify(): Notify {
  const ctx = useContext(NotifyContext);
  if (!ctx) throw new Error("useNotify() needs <NotificationsProvider> (mounted in the root layout)");
  return ctx;
}

export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm() needs <NotificationsProvider> (mounted in the root layout)");
  return ctx;
}

function Toaster({ toasts, dismiss, closeLabel }: { toasts: Toast[]; dismiss: (id: number) => void; closeLabel: string }) {
  return (
    <div className="toaster" aria-live="polite">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} dismiss={() => dismiss(t.id)} closeLabel={closeLabel} />
      ))}
    </div>
  );
}

function ToastItem({ toast, dismiss, closeLabel }: { toast: Toast; dismiss: () => void; closeLabel: string }) {
  const [paused, setPaused] = useState(false);
  const duration = toast.sticky ? 0 : (toast.duration ?? DURATION[toast.kind]);

  useEffect(() => {
    if (!duration || paused) return;
    const id = setTimeout(dismiss, duration);
    return () => clearTimeout(id);
  }, [duration, paused, dismiss]);

  return (
    <div
      className={`toast toast-${toast.kind}`}
      role={toast.kind === "error" ? "alert" : "status"}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <i className="corner tl" /><i className="corner tr" /><i className="corner bl" /><i className="corner br" />
      <span className="toast-mark" aria-hidden="true">{MARK[toast.kind]}</span>
      <div className="toast-text">
        {toast.title && <div className="toast-title">{toast.title}</div>}
        <div>{toast.message}</div>
        {toast.action && (
          <button type="button" className="toast-action" onClick={() => { toast.action?.onClick(); dismiss(); }}>
            {toast.action.label}
          </button>
        )}
      </div>
      <button type="button" className="toast-close" onClick={dismiss} aria-label={closeLabel}>×</button>
    </div>
  );
}

const MARK: Record<ToastKind, string> = { success: "✓", error: "!", warning: "!", info: "i" };

function ConfirmDialog({ opts, labels, onClose }: { opts: ConfirmOptions; labels: NotificationLabels; onClose: (v: boolean | string | null) => void }) {
  const [value, setValue] = useState(opts.input?.defaultValue ?? "");
  const primary = useRef<HTMLButtonElement>(null);
  const field = useRef<HTMLInputElement>(null);

  useEffect(() => {
    (opts.input ? field.current : primary.current)?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose(opts.input ? null : false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [opts.input, onClose]);

  const disabled = !!opts.input?.required && !value.trim();
  const submit = () => {
    if (disabled) return;
    onClose(opts.input ? value.trim() : true);
  };

  return (
    <div className="dialog-backdrop" style={{ position: "fixed", zIndex: 80 }} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(opts.input ? null : false); }}>
      <div className="dialog blueprint" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
        <i className="corner tl" /><i className="corner tr" /><i className="corner bl" /><i className="corner br" />
        <div className="dialog-title" id="confirm-title">{opts.title}</div>
        {opts.body && <div className="dialog-body">{opts.body}</div>}
        {opts.input && (
          <form className="field" onSubmit={(e) => { e.preventDefault(); submit(); }}>
            {opts.input.label && <label>{opts.input.label}</label>}
            <input ref={field} className="input" type="text" value={value} placeholder={opts.input.placeholder} onChange={(e) => setValue(e.target.value)} />
          </form>
        )}
        <div className="dialog-actions">
          <button type="button" className="btn btn-secondary" onClick={() => onClose(opts.input ? null : false)} style={{ flex: 1 }}>
            {opts.cancelLabel ?? labels.cancel}
          </button>
          <button ref={primary} type="button" className={opts.danger ? "btn btn-danger" : "btn btn-primary"} onClick={submit} disabled={disabled} style={{ flex: 1 }}>
            {opts.confirmLabel ?? labels.confirm}
          </button>
        </div>
      </div>
    </div>
  );
}
