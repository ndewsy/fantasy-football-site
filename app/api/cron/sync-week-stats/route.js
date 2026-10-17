import { syncWeekStats } from '@/lib/syncWeekStats';

export async function GET(request) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await syncWeekStats();
    return Response.json(result);
  } catch (err) {
    console.error('[/api/cron/sync-week-stats] failed:', err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
