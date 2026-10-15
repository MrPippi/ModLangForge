import type { ReactNode } from 'react';

interface ModalProps {
  readonly title: string;
  readonly children: ReactNode;
  readonly wide?: boolean;
}

export function Modal({ title, children, wide = false }: ModalProps) {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`max-h-[90vh] w-full overflow-auto rounded-xl bg-white p-5 shadow-xl dark:bg-slate-800 ${wide ? 'max-w-2xl' : 'max-w-md'}`}
      >
        <h2 className="mb-3 text-lg font-bold">{title}</h2>
        {children}
      </div>
    </div>
  );
}
