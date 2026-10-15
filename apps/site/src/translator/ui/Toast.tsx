import { useEffect } from 'react';
import { PixelIcon } from '../../components/PixelIcon';
import { type Toast as ToastData, useToasts } from '../store/toastStore';

const AUTO_DISMISS_MS = 6000;

function ToastItem({ toast }: { readonly toast: ToastData }) {
  const dismiss = useToasts((s) => s.dismiss);

  useEffect(() => {
    const timer = setTimeout(() => dismiss(toast.id), AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [toast.id, dismiss]);

  const color = toast.kind === 'error' ? 'border-danger bg-danger text-on-danger' : 'border-line-strong bg-fg text-bg';
  return (
    <div role={toast.kind === 'error' ? 'alert' : 'status'} className={`${color} flex items-center gap-3 rounded-sm border-2 py-1 pr-1 pl-4 text-sm shadow-[4px_4px_0_0_var(--color-shadow)]`}>
      <span className="flex-1">{toast.message}</span>
      <button type="button" aria-label="關閉" className="flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-sm hover:bg-black/15" onClick={() => dismiss(toast.id)}>
        <PixelIcon name="close" size={14} />
      </button>
    </div>
  );
}

export function ToastContainer() {
  const toasts = useToasts((s) => s.toasts);
  return (
    <div className="fixed right-4 bottom-4 left-4 z-50 flex flex-col gap-2 sm:left-auto sm:w-80">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} />
      ))}
    </div>
  );
}
