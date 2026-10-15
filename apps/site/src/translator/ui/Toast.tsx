import { useEffect } from 'react';
import { type Toast as ToastData, useToasts } from '../store/toastStore';

const AUTO_DISMISS_MS = 6000;

function ToastItem({ toast }: { readonly toast: ToastData }) {
  const dismiss = useToasts((s) => s.dismiss);

  useEffect(() => {
    const timer = setTimeout(() => dismiss(toast.id), AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [toast.id, dismiss]);

  const color = toast.kind === 'error' ? 'bg-red-600' : 'bg-slate-700';
  return (
    <div role={toast.kind === 'error' ? 'alert' : 'status'} className={`${color} flex items-start gap-3 rounded-lg px-4 py-2 text-sm text-white shadow-lg`}>
      <span className="flex-1">{toast.message}</span>
      <button type="button" aria-label="關閉" onClick={() => dismiss(toast.id)}>
        ✕
      </button>
    </div>
  );
}

export function ToastContainer() {
  const toasts = useToasts((s) => s.toasts);
  return (
    <div className="fixed right-4 bottom-4 z-50 flex w-80 flex-col gap-2">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} />
      ))}
    </div>
  );
}
