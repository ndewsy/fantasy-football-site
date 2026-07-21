import { createClient } from '@supabase/supabase-js';

let _supabase;
const supabase = () => (_supabase ??= createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY));

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const MAX_BYTES = 5 * 1024 * 1024;

export async function POST(request) {
  const authHeader = request.headers.get('Authorization');
  const token = authHeader?.replace('Bearer ', '');
  if (!token) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: { user }, error: authError } = await supabase().auth.getUser(token);
  if (authError || !user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: prof } = await supabase()
    .from('profiles')
    .select('creator_id, is_creator')
    .eq('id', user.id)
    .maybeSingle();

  if (!prof?.is_creator || !prof.creator_id) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  const formData = await request.formData();
  const file = formData.get('file');
  if (!file) return Response.json({ error: 'No file provided' }, { status: 400 });

  if (!ALLOWED_TYPES.includes(file.type)) {
    return Response.json({ error: 'Only JPEG, PNG, GIF, or WebP images are allowed.' }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return Response.json({ error: 'Image must be under 5 MB.' }, { status: 400 });
  }

  const ext = file.name.split('.').pop().toLowerCase();
  const path = `${prof.creator_id}/logo.${ext}`;

  const arrayBuffer = await file.arrayBuffer();

  const { error: uploadError } = await supabase().storage
    .from('avatars')
    .upload(path, Buffer.from(arrayBuffer), { contentType: file.type, upsert: true });

  if (uploadError) {
    console.error('[/api/avatar] upload failed:', uploadError);
    return Response.json({ error: uploadError.message }, { status: 500 });
  }

  const { data: { publicUrl } } = supabase().storage.from('avatars').getPublicUrl(path);

  const { error: updateError } = await supabase()
    .from('profiles')
    .update({ logo_url: publicUrl })
    .eq('id', user.id);

  if (updateError) {
    console.error('[/api/avatar] profile update failed:', updateError);
    return Response.json({ error: updateError.message }, { status: 500 });
  }

  return Response.json({ ok: true, publicUrl });
}
