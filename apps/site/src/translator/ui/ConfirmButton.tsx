import { useEffect, useState } from 'react';

const RESET_MS = 3000;

interface ConfirmButtonProps {
  readonly label: string;
  readonly confirmLabel: string;
  readonly onConfirm: () => void;
  readonly className?: string;
}

/** 第一次點擊顯示確認文字，3 秒內再點一次才執行 */
export function ConfirmButton({ label, confirmLabel, onConfirm, className = '' }: ConfirmButtonProps) {
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (!armed) return undefined;
    const timer = setTimeout(() => setArmed(false), RESET_MS);
    return () => clearTimeout(timer);
  }, [armed]);

  return (
    <button
      type="button"
      className={`${className} ${armed ? 'text-danger font-semibold' : ''}`}
      onClick={(e) => {
        e.stopPropagation();
        if (armed) {
          setArmed(false);
          onConfirm();
        } else {
          setArmed(true);
        }
      }}
    >
      {armed ? confirmLabel : label}
    </button>
  );
}
