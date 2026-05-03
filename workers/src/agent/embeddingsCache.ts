// Cached embedding lookup.

import type { DB } from '../../../shared/db/supabase';
import { fetchEmbedding } from '../../../shared/util/llm';
import { xxHash32 } from '../../../shared/util/xxhash';
import type { Env } from '../env';

function hashKey(text: string): Uint8Array {
  // 4-byte xxhash → bytea key.
  const h = xxHash32(text);
  const buf = new Uint8Array(4);
  new DataView(buf.buffer).setUint32(0, h, true);
  return buf;
}

function bytesToHex(b: Uint8Array): string {
  return '\\x' + Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
}

export async function fetch(env: Env, db: DB, text: string): Promise<number[]> {
  const key = hashKey(text);
  const hex = bytesToHex(key);

  const { data: existing } = await db
    .from('embeddings_cache')
    .select('embedding')
    .eq('text_hash', hex)
    .maybeSingle();
  if (existing?.embedding) {
    // Supabase returns vector as string "[1, 2, ...]" — parse it.
    return parseVector(existing.embedding);
  }

  const { embedding } = await fetchEmbedding(env, text);
  await db
    .from('embeddings_cache')
    .upsert({ text_hash: hex, embedding: embedding as any }, { onConflict: 'text_hash' });
  return embedding;
}

function parseVector(raw: any): number[] {
  if (Array.isArray(raw)) return raw;
  if (typeof raw !== 'string') return [];
  return raw
    .replace(/^\[|\]$/g, '')
    .split(',')
    .map((s) => parseFloat(s.trim()));
}
