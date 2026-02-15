import { corsHeaders, handleCorsPreflightRequest, jsonResponse, errorResponse } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleCorsPreflightRequest();
  }

  const vapidKey = Deno.env.get('VAPID_PUBLIC_KEY');

  if (!vapidKey) {
    console.error('[get-vapid-key] VAPID_PUBLIC_KEY secret is not configured');
    return errorResponse('VAPID_PUBLIC_KEY not configured', 500);
  }

  return jsonResponse({ key: vapidKey });
});
