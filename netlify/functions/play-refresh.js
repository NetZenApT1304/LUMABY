// netlify/functions/play-refresh.js
// Daily (see netlify.toml): re-check Google Play subscriptions that are near
// the end of their period, so renewals extend Premium and cancellations,
// refunds and failed payments end it, even if the user never opens the app.
const { createClient } = require('@supabase/supabase-js');
const { verifyAndSave } = require('../lib/play');

async function run() {
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });
  const soon = new Date(Date.now() + 4 * 86400000).toISOString();
  const { data, error } = await supabase.from('subscriptions').select('user_id, play_purchase_token')
    .eq('provider', 'play').neq('status', 'expired').not('play_purchase_token', 'is', null)
    .or(`expires_at.is.null,expires_at.lt.${soon}`).limit(1000);
  if (error) throw error;
  let checked = 0, failed = 0;
  for (const row of data) {
    try { await verifyAndSave(supabase, row.user_id, row.play_purchase_token); checked++; }
    catch (e) {
      failed++;
      if (e.code === 'invalid_token') {
        await supabase.from('subscriptions').update({ status: 'expired', updated_at: new Date().toISOString() }).eq('user_id', row.user_id);
      } else console.error('[Lumaby] play-refresh', row.user_id, e.message || e);
    }
  }
  return { due: data.length, checked, failed };
}

exports.handler = async () => {
  try { const r = await run(); console.log('[Lumaby] Play refresh:', JSON.stringify(r)); return { statusCode: 200, body: JSON.stringify(r) }; }
  catch (e) { console.error('[Lumaby] Play refresh failed:', e); return { statusCode: 500, body: '{"error":"refresh failed"}' }; }
};
exports.run = run;
