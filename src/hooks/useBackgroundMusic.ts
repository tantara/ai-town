'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

// Replaces `useQuery(api.music.getBackgroundMusic)`. Returns the storage URL
// of the current background track from Supabase Storage.
export function useBackgroundMusic(): string | undefined {
  const [url, setUrl] = useState<string | undefined>();
  useEffect(() => {
    (async () => {
      const { data } = await supabase()
        .from('music')
        .select('storage_url')
        .eq('kind', 'background')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (data) setUrl((data as any).storage_url);
    })();
  }, []);
  return url;
}
