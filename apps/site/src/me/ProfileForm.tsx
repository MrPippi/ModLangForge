import { useState } from 'react';
import { DISPLAY_NAME_MAX } from '@mlf/core/review';
import type { MeApi, UserProfile } from './meApi';
import NoticeLine, { type Notice } from './NoticeLine';
import { m } from './strings';

interface Props {
  readonly api: MeApi;
  readonly profile: UserProfile;
  readonly onSaved: (profile: UserProfile) => void;
}

export default function ProfileForm({ api, profile, onSaved }: Props) {
  const [name, setName] = useState(profile.displayName);
  const [isPublic, setIsPublic] = useState(profile.isPublic);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);

  const submit = async () => {
    if (busy) return;
    if (name !== profile.displayName && [...name.trim()].length > DISPLAY_NAME_MAX) {
      return setNotice({ kind: 'error', text: m.displayNameTooLong });
    }
    setBusy(true);
    setNotice(null);
    // 名稱沒改就不送：登入來源給的名稱可能超過 32 字，不能因此擋住公開設定
    const r = await api.updateProfile(name === profile.displayName ? { isPublic } : { displayName: name, isPublic });
    setBusy(false);
    if (!r.ok) return setNotice({ kind: 'error', text: r.message });
    onSaved(r.data.profile);
    setName(r.data.profile.displayName);
    setNotice({ kind: 'ok', text: m.saved });
  };

  return (
    <form className="grid max-w-md gap-2" aria-labelledby="profile-title" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
      <h2 id="profile-title" className="text-lg font-bold">{m.profileTitle}</h2>
      <label className="flex flex-col gap-1 text-sm">{m.displayName}
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <p className="text-xs text-muted">{m.displayNameHint}</p>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} />{m.isPublic}
      </label>
      <p className="text-xs text-muted">{m.isPublicHint}</p>
      <div><button type="submit" className="btn btn-primary" disabled={busy}>{busy ? m.saving : m.save}</button></div>
      <NoticeLine notice={notice} />
    </form>
  );
}
