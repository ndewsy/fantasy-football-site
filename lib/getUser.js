import { createClient } from '@supabase/supabase-js';

let _supabase;
const supabase = () => (_supabase ??= createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY));

// Shared Bearer-token auth check for API routes (service-role client, since
// routes here don't run behind @supabase/ssr's cookie-based server client).
export async function getAuthedUser(request) {
  const authHeader = request.headers.get('Authorization');
  const token = authHeader?.replace('Bearer ', '');
  if (!token) return null;

  const { data: { user }, error } = await supabase().auth.getUser(token);
  if (error || !user) return null;

  return { user, token };
}
