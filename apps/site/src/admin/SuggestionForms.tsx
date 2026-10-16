import { useState } from 'react';
import { s } from './strings';

export function EditForm({ initial, onConfirm, onCancel }: {
  readonly initial: string;
  readonly onConfirm: (text: string) => void;
  readonly onCancel: () => void;
}) {
  const [text, setText] = useState(initial);
  return (
    <div className="mt-2 flex flex-col gap-2">
      <textarea className="input min-h-20" aria-label={s.editLabel} value={text} onChange={(e) => setText(e.target.value)} />
      <div className="flex gap-2">
        <button type="button" className="btn btn-primary" onClick={() => onConfirm(text)}>{s.confirmApprove}</button>
        <button type="button" className="btn" onClick={onCancel}>{s.cancel}</button>
      </div>
    </div>
  );
}

export function RejectForm({ onConfirm, onCancel }: {
  readonly onConfirm: (reason: string | undefined) => void;
  readonly onCancel: () => void;
}) {
  const [reason, setReason] = useState('');
  return (
    <div className="mt-2 flex flex-col gap-2">
      <input className="input" aria-label={s.reasonLabel} value={reason} onChange={(e) => setReason(e.target.value)} />
      <div className="flex gap-2">
        <button type="button" className="btn" onClick={() => onConfirm(reason.trim() || undefined)}>{s.confirmReject}</button>
        <button type="button" className="btn" onClick={onCancel}>{s.cancel}</button>
      </div>
    </div>
  );
}
