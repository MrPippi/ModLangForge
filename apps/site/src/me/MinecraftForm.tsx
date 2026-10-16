import { useState } from 'react';
import { Avatar } from '../components/Avatar';
import type { MeApi, UserProfile } from './meApi';
import NoticeLine, { type Notice } from './NoticeLine';
import { m } from './strings';

interface Props {
  readonly api: MeApi;
  readonly profile: UserProfile;
  readonly onSaved: (profile: UserProfile) => void;
}

function Current({ profile }: { readonly profile: UserProfile }) {
  if (!profile.minecraftName) return null;
  return (
    <div className="flex items-center gap-3">
      <Avatar uuid={profile.minecraftUuid} name={profile.minecraftName} size={48} />
      <span className="font-semibold">{profile.minecraftName}</span>
      {!profile.minecraftVerified && <span className="rounded-sm border border-line px-1.5 text-xs text-muted">{m.unverified}</span>}
    </div>
  );
}

export default function MinecraftForm({ api, profile, onSaved }: Props) {
  const [name, setName] = useState(profile.minecraftName ?? '');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);

  const run = async (value: string | null) => {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    const r = await api.setMinecraft(value);
    setBusy(false);
    if (!r.ok) return setNotice({ kind: 'error', text: r.message });
    onSaved(r.data.profile);
    setName(r.data.profile.minecraftName ?? '');
    setNotice({ kind: 'ok', text: value === null ? m.mcCleared : m.saved });
  };

  return (
    <form className="grid max-w-md gap-2" aria-labelledby="mc-title" onSubmit={(e) => { e.preventDefault(); void run(name.trim() === '' ? null : name.trim()); }}>
      <h2 id="mc-title" className="text-lg font-bold">{m.mcTitle}</h2>
      <Current profile={profile} />
      <label className="flex flex-col gap-1 text-sm">{m.mcName}
        <input className="input" value={name} maxLength={16} autoComplete="off" spellCheck={false} onChange={(e) => setName(e.target.value)} />
      </label>
      <p className="text-xs text-muted">{m.mcHint}</p>
      <div className="flex gap-2">
        <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? m.checking : m.mcSave}</button>
        {profile.minecraftName && <button type="button" className="btn" disabled={busy} onClick={() => void run(null)}>{m.mcClear}</button>}
      </div>
      <NoticeLine notice={notice} />
    </form>
  );
}
