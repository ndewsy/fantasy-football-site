import { syncPlayers } from '../../../../lib/syncPlayers';

export async function GET(request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await syncPlayers();
    console.log('[cron/sync-players]', result);
    return Response.json({ ok: true, ...result });
  } catch (err) {
    console.error('[cron/sync-players] failed:', err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
