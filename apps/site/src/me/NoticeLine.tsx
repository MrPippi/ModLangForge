export type Notice = { readonly kind: 'ok' | 'error'; readonly text: string } | null;

export default function NoticeLine({ notice }: { readonly notice: Notice }) {
  if (!notice) return null;
  const error = notice.kind === 'error';
  return <p role={error ? 'alert' : 'status'} className={error ? 'text-sm text-danger' : 'text-sm'}>{notice.text}</p>;
}
