// POST /api/music/upload — accepts a multipart audio file, uploads it into the
// `music` Supabase Storage bucket using the service-role key (server-side
// only), and inserts a row into public.music. NextAuth gates the route so
// only logged-in users can upload.

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

import { auth } from '../../../../../auth';

const MAX_BYTES = 25 * 1024 * 1024; // 25MB — keep uploads modest.
const ALLOWED_PREFIX = 'audio/';

function adminClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set on the server.');
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Expected multipart/form-data.' }, { status: 400 });
  }

  const file = form.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Missing "file" field.' }, { status: 400 });
  }
  if (!file.type.startsWith(ALLOWED_PREFIX)) {
    return NextResponse.json(
      { error: `Only audio files allowed (got "${file.type}").` },
      { status: 400 },
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: `File is ${(file.size / 1024 / 1024).toFixed(1)}MB, max is 25MB.` },
      { status: 413 },
    );
  }

  const kind = (form.get('kind') ?? 'background') as string;
  if (kind !== 'background' && kind !== 'player') {
    return NextResponse.json(
      { error: 'kind must be "background" or "player".' },
      { status: 400 },
    );
  }

  const db = adminClient();

  // Object key — keep the original extension (default to mp3) so MIME sniffing
  // works in browsers that need it. UUIDs prevent name collisions.
  const ext = (file.name.match(/\.([a-z0-9]+)$/i)?.[1] ?? 'mp3').toLowerCase();
  const objectKey = `${kind}/${crypto.randomUUID()}.${ext}`;

  const bytes = new Uint8Array(await file.arrayBuffer());
  const { error: uploadErr } = await db.storage
    .from('music')
    .upload(objectKey, bytes, { contentType: file.type, upsert: false });
  if (uploadErr) {
    return NextResponse.json(
      { error: `Storage upload failed: ${uploadErr.message}` },
      { status: 500 },
    );
  }

  const { data: publicUrlData } = db.storage.from('music').getPublicUrl(objectKey);
  const storageUrl = publicUrlData.publicUrl;

  const { data: row, error: insertErr } = await db
    .from('music')
    .insert({ kind, storage_url: storageUrl })
    .select('id, storage_url, kind, created_at')
    .single();
  if (insertErr) {
    // Best-effort cleanup so we don't leak orphan objects.
    await db.storage.from('music').remove([objectKey]);
    return NextResponse.json(
      { error: `DB insert failed: ${insertErr.message}` },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, music: row });
}
