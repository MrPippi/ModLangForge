import type { ReactNode } from 'react';

interface ModalProps {
  readonly title: string;
  readonly children: ReactNode;
  readonly wide?: boolean;
}

export function Modal({ title, children, wide = false }: ModalProps) {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`max-h-[90vh] w-full overflow-auto rounded-sm border-2 border-line-strong bg-surface p-5 shadow-[6px_6px_0_0_var(--color-shadow)] ${wide ? 'max-w-2xl' : 'max-w-md'}`}
      >
        <h2 className="mb-4 text-[1.375rem]">{title}</h2>
        {children}
      </div>
    </div>
  );
}
