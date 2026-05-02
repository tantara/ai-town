'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

// Replaces `useQuery(api.music.getBackgroundMusic)`. Returns the storage URL
// of the current background track from Supabase Storage.
//
// Re-fetches whenever the page emits an 'ai-zoo:music-changed' event so the
// upload UI can refresh the playing track without a page reload.
export const MUSIC_CHANGED_EVENT = 'ai-zoo:music-changed';

export function useBackgroundMusic(): string | undefined {
  const [url, setUrl] = useState<string | undefined>();

  useEffect(() => {
    let cancelled = false;
    const fetchLatest = async () => {
      const { data } = await supabase()
        .from('music')
        .select('storage_url')
        .eq('kind', 'background')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!cancelled && data) setUrl((data as any).storage_url);
    };
    void fetchLatest();
    const onChanged = () => void fetchLatest();
    window.addEventListener(MUSIC_CHANGED_EVENT, onChanged);
    return () => {
      cancelled = true;
      window.removeEventListener(MUSIC_CHANGED_EVENT, onChanged);
    };
  }, []);

  return url;
}
