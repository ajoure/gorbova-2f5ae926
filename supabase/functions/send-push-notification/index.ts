import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info, x-cron-secret, x-internal-key, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// Web Push implementation using raw crypto (no npm dependency needed in Deno)
async function sendWebPush(subscription: { endpoint: string; p256dh: string; auth: string }, payload: string) {
  const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY');
  const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY');
  const vapidSubject = Deno.env.get('VAPID_SUBJECT') || 'mailto:admin@gorbova.by';

  if (!vapidPublicKey || !vapidPrivateKey) {
    throw new Error('VAPID keys not configured');
  }

  // Use web-push via Deno-compatible approach
  // For Deno, we use the fetch API with proper VAPID JWT
  const jwt = await createVapidJwt(subscription.endpoint, vapidPublicKey, vapidPrivateKey, vapidSubject);

  // Encrypt payload using Web Push encryption
  const encrypted = await encryptPayload(subscription.p256dh, subscription.auth, payload);

  const response = await fetch(subscription.endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `vapid t=${jwt}, k=${vapidPublicKey}`,
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      'TTL': '86400',
      'Urgency': 'high',
    },
    body: encrypted,
  });

  return response;
}

function base64UrlEncode(data: Uint8Array): string {
  let binary = '';
  for (const byte of data) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(str: string): Uint8Array {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  const binary = atob(str);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function createVapidJwt(endpoint: string, publicKey: string, privateKey: string, subject: string): Promise<string> {
  const audience = new URL(endpoint).origin;
  const expiration = Math.floor(Date.now() / 1000) + 12 * 60 * 60; // 12 hours

  const header = { typ: 'JWT', alg: 'ES256' };
  const payload = { aud: audience, exp: expiration, sub: subject };

  const headerB64 = base64UrlEncode(new TextEncoder().encode(JSON.stringify(header)));
  const payloadB64 = base64UrlEncode(new TextEncoder().encode(JSON.stringify(payload)));
  const unsignedToken = `${headerB64}.${payloadB64}`;

  // Import private key
  const privateKeyBytes = base64UrlDecode(privateKey);
  
  // Build the JWK for P-256
  const publicKeyBytes = base64UrlDecode(publicKey);
  const x = base64UrlEncode(publicKeyBytes.slice(1, 33));
  const y = base64UrlEncode(publicKeyBytes.slice(33, 65));
  const d = base64UrlEncode(privateKeyBytes);

  const key = await crypto.subtle.importKey(
    'jwk',
    { kty: 'EC', crv: 'P-256', x, y, d },
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    new TextEncoder().encode(unsignedToken)
  );

  // Convert DER signature to raw r||s format expected by JWT
  const sigBytes = new Uint8Array(signature);
  const signatureB64 = base64UrlEncode(sigBytes);

  return `${unsignedToken}.${signatureB64}`;
}

async function encryptPayload(p256dhKey: string, authSecret: string, payload: string): Promise<Uint8Array> {
  // Import subscriber's public key
  const subscriberPublicKey = base64UrlDecode(p256dhKey);
  const subscriberAuth = base64UrlDecode(authSecret);

  // Generate local key pair
  const localKeyPair = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveBits']
  );

  // Export local public key
  const localPublicKeyRaw = new Uint8Array(await crypto.subtle.exportKey('raw', localKeyPair.publicKey));

  // Import subscriber public key
  const subscriberKey = await crypto.subtle.importKey(
    'raw',
    subscriberPublicKey,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    []
  );

  // Derive shared secret
  const sharedSecret = new Uint8Array(await crypto.subtle.deriveBits(
    { name: 'ECDH', public: subscriberKey },
    localKeyPair.privateKey,
    256
  ));

  // Generate salt
  const salt = crypto.getRandomValues(new Uint8Array(16));

  // HKDF to derive PRK from auth secret and shared secret
  const authInfo = new TextEncoder().encode('Content-Encoding: auth\0');
  const prkKey = await crypto.subtle.importKey('raw', subscriberAuth, { name: 'HKDF' }, false, ['deriveBits']);
  
  // IKM = shared secret
  const ikm = await crypto.subtle.importKey('raw', sharedSecret, { name: 'HKDF' }, false, ['deriveBits']);
  
  // Simplified: use HKDF with auth as salt to derive key material
  const keyInfoBuf = new Uint8Array([
    ...new TextEncoder().encode('Content-Encoding: aes128gcm\0'),
  ]);

  const prk = await crypto.subtle.importKey('raw', sharedSecret, { name: 'HKDF' }, false, ['deriveBits']);

  const derivedBits = new Uint8Array(await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: salt, info: keyInfoBuf },
    prk,
    128 + 96 // 16 bytes key + 12 bytes nonce
  ));

  const contentKey = derivedBits.slice(0, 16);
  const nonce = derivedBits.slice(16, 28);

  // Encrypt
  const aesKey = await crypto.subtle.importKey('raw', contentKey, { name: 'AES-GCM' }, false, ['encrypt']);
  
  const paddedPayload = new Uint8Array([...new TextEncoder().encode(payload), 2]); // 2 = record delimiter
  
  const encrypted = new Uint8Array(await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce },
    aesKey,
    paddedPayload
  ));

  // Build aes128gcm record
  const recordSize = 4096;
  const header = new Uint8Array(16 + 4 + 1 + localPublicKeyRaw.length);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, recordSize);
  header[20] = localPublicKeyRaw.length;
  header.set(localPublicKeyRaw, 21);

  const result = new Uint8Array(header.length + encrypted.length);
  result.set(header);
  result.set(encrypted, header.length);

  return result;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    // Auth: only service_role or X-Cron-Secret
    const authHeader = req.headers.get('authorization') || '';
    const cronSecret = req.headers.get('x-cron-secret');
    const expectedCronSecret = Deno.env.get('CRON_SECRET');
    
    const isServiceRole = authHeader.includes(supabaseServiceKey);
    const isCron = cronSecret && expectedCronSecret && cronSecret === expectedCronSecret;
    
    if (!isServiceRole && !isCron) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { user_ids, title, body, url, tag } = await req.json();

    if (!user_ids || !Array.isArray(user_ids) || user_ids.length === 0) {
      return new Response(JSON.stringify({ error: 'user_ids required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get all push subscriptions for these users
    const { data: subscriptions, error } = await supabase
      .from('push_subscriptions')
      .select('id, endpoint, p256dh, auth, user_id')
      .in('user_id', user_ids);

    if (error) {
      console.error('DB error:', error);
      return new Response(JSON.stringify({ error: 'DB error' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!subscriptions || subscriptions.length === 0) {
      return new Response(JSON.stringify({ ok: true, sent: 0, reason: 'no_subscriptions' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const payload = JSON.stringify({ title, body, url, tag });
    let sent = 0;
    let failed = 0;
    const expiredIds: string[] = [];

    for (const sub of subscriptions) {
      try {
        const response = await sendWebPush(
          { endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth },
          payload
        );

        if (response.status === 201) {
          sent++;
        } else if (response.status === 410 || response.status === 404) {
          // Subscription expired
          expiredIds.push(sub.id);
          failed++;
        } else {
          console.error(`Push failed for ${sub.endpoint}: ${response.status}`);
          failed++;
        }
      } catch (err) {
        console.error(`Push error for ${sub.endpoint}:`, err);
        failed++;
      }
    }

    // Cleanup expired subscriptions
    if (expiredIds.length > 0) {
      await supabase.from('push_subscriptions').delete().in('id', expiredIds);
      console.log(`Cleaned up ${expiredIds.length} expired push subscriptions`);
    }

    return new Response(JSON.stringify({ ok: true, sent, failed, expired: expiredIds.length }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('Send push error:', err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
