'use client';

import { useCallback, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { MUSIC_CHANGED_EVENT } from '../../hooks/useBackgroundMusic';

// Small "+" affordance shown next to <MusicButton>. Lets a logged-in user
// upload an audio file as the world's background music. The actual upload
// happens server-side in /api/music/upload (which has the service-role key).
export default function MusicUploadButton() {
  const { status } = useSession();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);

  const onPick = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-picking the same file later
    if (!file) return;

    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('kind', 'background');
      const resp = await fetch('/api/music/upload', { method: 'POST', body: fd });
      const json = (await resp.json()) as { error?: string };
      if (!resp.ok) throw new Error(json.error ?? `HTTP ${resp.status}`);
      toast.success('Background music updated.');
      window.dispatchEvent(new CustomEvent(MUSIC_CHANGED_EVENT));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, []);

  if (status !== 'authenticated') return null;

  return (
    <>
      <Button
        type="button"
        variant="game"
        size="game"
        className="hidden lg:inline-flex text-xl"
        title="Upload background music"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
      >
        <span className="inline-block bg-clay-700">
          <span className="inline-flex h-full items-center gap-2">
            {busy ? '…' : '+'}
            <span>Music</span>
          </span>
        </span>
      </Button>
      <input
        ref={inputRef}
        type="file"
        accept="audio/*"
        className="hidden"
        onChange={onPick}
      />
    </>
  );
}
