import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { encodeBase64 } from "https://deno.land/std@0.224.0/encoding/base64.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const HOSTERBY_API_BASE = "https://serviceapi.hoster.by";

// ============================================================
// Signing — строго по документации serviceapi.hoster.by
// https://serviceapi.hoster.by/rest_api_docs.html
//
// Алгоритм:
//   1. MD5(body_bytes) → base64  (для GET пустое тело → MD5("") = base64)
//   2. canonical_string = METHOD + "\n" + URI_PATH + "\n" + md5_base64
//   3. signature = HMAC-SHA256(secret_key, canonical_string) → HEX
//   4. Headers: X-API-KEY: {access_key}, X-API-SIGN: {hex_signature}
// ============================================================

// ============================================================
// MD5 — чистая реализация без BigInt и без внешних npm (стабильна в edge runtime)
// Для GET без тела: md5Base64("") === "1B2M2Y8AsgTpgAmY7PhCfg=="
// encodeBase64 надёжнее btoa(String.fromCharCode(...spread)) для больших буферов
// ============================================================
function computeMd5(input: Uint8Array): Uint8Array {
  // Таблица T[i] = floor(abs(sin(i+1)) * 2^32) — вычисляется один раз
  const T = new Uint32Array(64);
  for (let i = 0; i < 64; i++) T[i] = (Math.abs(Math.sin(i + 1)) * 0x100000000) >>> 0;

  const S = [7,12,17,22,7,12,17,22,7,12,17,22,7,12,17,22,
             5,9,14,20,5,9,14,20,5,9,14,20,5,9,14,20,
             4,11,16,23,4,11,16,23,4,11,16,23,4,11,16,23,
             6,10,15,21,6,10,15,21,6,10,15,21,6,10,15,21];

  const origLen = input.length;
  const paddedLen = Math.ceil((origLen + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLen);
  padded.set(input);
  padded[origLen] = 0x80;
  // Длина в битах, little-endian 64 bit — без BigInt
  const bitLenLo = (origLen * 8) >>> 0;
  const bitLenHi = Math.floor(origLen / 0x20000000) >>> 0;
  for (let i = 0; i < 4; i++) {
    padded[paddedLen - 8 + i] = (bitLenLo >>> (i * 8)) & 0xff;
    padded[paddedLen - 4 + i] = (bitLenHi >>> (i * 8)) & 0xff;
  }

  let a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476;
  for (let chunk = 0; chunk < paddedLen; chunk += 64) {
    const W = new Uint32Array(16);
    for (let i = 0; i < 16; i++) {
      W[i] = padded[chunk + i*4]
           | (padded[chunk + i*4 + 1] << 8)
           | (padded[chunk + i*4 + 2] << 16)
           | (padded[chunk + i*4 + 3] << 24);
    }
    let A = a0, B = b0, C = c0, D = d0;
    for (let i = 0; i < 64; i++) {
      let F: number, g: number;
      if (i < 16)      { F = (B & C) | (~B & D);  g = i; }
      else if (i < 32) { F = (D & B) | (~D & C);  g = (5*i + 1) % 16; }
      else if (i < 48) { F = B ^ C ^ D;            g = (3*i + 5) % 16; }
      else             { F = C ^ (B | ~D);          g = (7*i) % 16; }
      const s = S[i];
      F = (F + A + T[i] + W[g]) >>> 0;
      A = D; D = C; C = B;
      B = ((B + ((F << s) | (F >>> (32 - s)))) >>> 0);
    }
    a0 = (a0 + A) >>> 0; b0 = (b0 + B) >>> 0;
    c0 = (c0 + C) >>> 0; d0 = (d0 + D) >>> 0;
  }
  const result = new Uint8Array(16);
  for (let i = 0; i < 4; i++) {
    result[i]      = (a0 >>> (i * 8)) & 0xff;
    result[i + 4]  = (b0 >>> (i * 8)) & 0xff;
    result[i + 8]  = (c0 >>> (i * 8)) & 0xff;
    result[i + 12] = (d0 >>> (i * 8)) & 0xff;
  }
  return result;
}

function md5Base64(body: string): string {
  const bytes = new TextEncoder().encode(body);
  return encodeBase64(computeMd5(bytes)); // encodeBase64 надёжнее btoa(...spread)
}

async function buildHosterSignature(
  method: string,
  path: string,
  body: string,
  secretKey: string
): Promise<string> {
  const bodyMd5 = md5Base64(body);
  const canonical = `${method.toUpperCase()}\n${path}\n${bodyMd5}`;
  const keyBytes = new TextEncoder().encode(secretKey);
  const msgBytes = new TextEncoder().encode(canonical);
  const key = await crypto.subtle.importKey(
    "raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, msgBytes);
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ============================================================
// UNIT TESTS — signing vectors
// Запускаются ТОЛЬКО при HOSTERBY_SIGN_TESTS=1 (не в проде по умолчанию).
// Внутри try/catch — никогда не бросают исключение наружу.
// ============================================================
async function runSigningTests(): Promise<void> {
  try {
    // Vector 3: MD5 пустой строки → base64 ДОЛЖЕН быть "1B2M2Y8AsgTpgAmY7PhCfg=="
    const emptyMd5 = md5Base64("");
    const expectedEmptyMd5 = "1B2M2Y8AsgTpgAmY7PhCfg==";
    if (emptyMd5 !== expectedEmptyMd5) {
      console.error(`[SIGNING TEST] FAIL: MD5("") expected=${expectedEmptyMd5} got=${emptyMd5}`);
    } else {
      console.log("[SIGNING TEST] PASS: MD5 empty string OK");
    }

    // Vector 1: GET без тела
    const sig1 = await buildHosterSignature("GET", "/v1/cloud/vms", "", "test_secret_key");
    console.log("[SIGNING TEST] vector1 GET /v1/cloud/vms:", sig1);

    // Vector 2: POST с телом
    const body2 = '{"name":"test"}';
    const sig2 = await buildHosterSignature("POST", "/v1/cloud/vms", body2, "test_secret_key");
    console.log("[SIGNING TEST] vector2 POST /v1/cloud/vms body:", sig2);
  } catch (e) {
    // Никогда не бросаем наружу — тесты не должны убивать edge function
    console.error("[SIGNING TEST] ERROR (non-fatal):", e);
  }
}

// Запускать только при явном флаге — НЕ на cold start в проде
if (Deno.env.get("HOSTERBY_SIGN_TESTS") === "1") {
  runSigningTests().catch((e) => console.error("[SIGNING TEST] Error:", e));
}

// ============================================================
// SSRF Guard
// ============================================================
function isSsrfSafe(url: string): boolean {
  try {
    const parsed = new URL(url);
    const h = parsed.hostname.toLowerCase();
    // Block private/loopback/link-local
    if (h === "localhost" || h === "::1") return false;
    if (/^127\./.test(h)) return false;
    if (/^10\./.test(h)) return false;
    if (/^192\.168\./.test(h)) return false;
    if (/^172\.(1[6-9]|2[0-9]|3[01])\./.test(h)) return false;
    if (/^169\.254\./.test(h)) return false; // link-local / AWS metadata
    if (/^100\.64\./.test(h)) return false; // CGNAT
    if (h === "metadata.google.internal") return false;
    return true;
  } catch {
    return false;
  }
}

function isDomainAllowed(url: string, allowlist: string[]): boolean {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return allowlist.some(
      (d) => hostname === d.toLowerCase() || hostname.endsWith("." + d.toLowerCase())
    );
  } catch {
    return false;
  }
}

// ============================================================
// hoster.by API request helper — dual-mode auth
// Attempt A: HMAC (X-API-KEY + X-API-SIGN)
// Attempt B: Bearer (Authorization: Bearer {accessKey})
// Attempt C: Access-Token header (Access-Token: {accessKey})
// Возвращает auth_mode_used + нормализованный code
// ============================================================
type HosterCode =
  | "OK"
  | "UNAUTHORIZED"
  | "HOSTERBY_ROUTE_MISSING"
  | "HOSTERBY_520"
  | "TIMEOUT"
  | "EDGE_CRASH"
  | "KEYS_MISSING"
  | "NETWORK_ERROR";

interface HosterResult {
  ok: boolean;
  status: number;
  data: unknown;
  error?: string;
  code?: HosterCode;
  auth_mode_used?: string;
}

function normalizeHosterBody(data: unknown): { code: HosterCode; ok: boolean } | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  const httpCode = d.httpCode;
  const statusCode = d.statusCode;

  // httpCode=200 + statusCode=ok → OK
  if (httpCode === 200 && statusCode === "ok") return { code: "OK", ok: true };

  // httpCode=520 → hoster.by уровень, не edge-runtime
  if (httpCode === 520) {
    const errMsg = (d.messageList as Record<string, unknown>)?.error as Record<string, string> | undefined;
    const unknownErr = errMsg?.unknown_error ?? "";
    if (unknownErr.includes("Matched route") || unknownErr.includes("handler")) {
      return { code: "HOSTERBY_ROUTE_MISSING", ok: false };
    }
    return { code: "HOSTERBY_520", ok: false };
  }

  // httpCode=401/403 → UNAUTHORIZED (иногда API возвращает это в теле при 200)
  if (httpCode === 401 || httpCode === 403) return { code: "UNAUTHORIZED", ok: false };

  return null;
}

async function attemptHosterRequest(
  method: string,
  path: string,
  body: string,
  headers: Record<string, string>,
  timeoutMs: number
): Promise<{ ok: boolean; status: number; data: unknown; error?: string }> {
  const url = `${HOSTERBY_API_BASE}${path}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(url, {
      method,
      headers: { ...headers, ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body || undefined,
      signal: controller.signal,
    });
    const text = await resp.text();
    let data: unknown = text;
    try { data = JSON.parse(text); } catch { /* keep as text */ }
    return { ok: resp.ok, status: resp.status, data };
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      return { ok: false, status: 0, data: null, error: "TIMEOUT" };
    }
    return { ok: false, status: 0, data: null, error: String(e) };
  } finally {
    clearTimeout(timer);
  }
}

async function hosterRequest(
  method: string,
  path: string,
  body: string,
  accessKey: string,
  secretKey: string,
  timeoutMs = 15000
): Promise<HosterResult> {
  // --- Attempt A: HMAC ---
  const signature = await buildHosterSignature(method, path, body, secretKey);
  const resultA = await attemptHosterRequest(method, path, body, {
    "X-API-KEY": accessKey,
    "X-API-SIGN": signature,
  }, timeoutMs);

  if (resultA.error === "TIMEOUT") {
    return { ok: false, status: 0, data: null, error: "TIMEOUT", code: "TIMEOUT", auth_mode_used: "none" };
  }

  // Проверяем тело ответа на hoster.by-level коды
  if (resultA.ok || resultA.status >= 200) {
    const bodyNorm = normalizeHosterBody(resultA.data);
    if (bodyNorm) {
      if (bodyNorm.ok) return { ...resultA, ok: true, code: "OK", auth_mode_used: "hmac" };
      // HMAC сработал (HTTP ок), но hoster.by вернул ошибку маршрута/520
      if (bodyNorm.code === "HOSTERBY_ROUTE_MISSING" || bodyNorm.code === "HOSTERBY_520") {
        return { ...resultA, ok: false, code: bodyNorm.code, auth_mode_used: "hmac" };
      }
    }
    // HTTP 2xx без структурированного тела — считаем OK
    if (resultA.ok) return { ...resultA, code: "OK", auth_mode_used: "hmac" };
  }

  // HTTP 401/403 от HMAC → пробуем Bearer
  // Другие HTTP-ошибки → тоже пробуем (API может не поддерживать HMAC)
  console.log(`[hosterby-api] HMAC attempt: status=${resultA.status}, trying Bearer...`);

  // --- Attempt B: Authorization: Bearer ---
  const resultB = await attemptHosterRequest(method, path, body, {
    "Authorization": `Bearer ${accessKey}`,
  }, timeoutMs);

  if (resultB.error === "TIMEOUT") {
    return { ok: false, status: 0, data: null, error: "TIMEOUT", code: "TIMEOUT", auth_mode_used: "none" };
  }

  if (resultB.ok) {
    const bodyNorm = normalizeHosterBody(resultB.data);
    if (!bodyNorm || bodyNorm.ok) return { ...resultB, code: "OK", auth_mode_used: "bearer" };
    if (bodyNorm.code !== "UNAUTHORIZED") return { ...resultB, ok: false, code: bodyNorm.code, auth_mode_used: "bearer" };
  }

  // --- Attempt C: Access-Token header ---
  console.log(`[hosterby-api] Bearer attempt: status=${resultB.status}, trying Access-Token header...`);
  const resultC = await attemptHosterRequest(method, path, body, {
    "Access-Token": accessKey,
  }, timeoutMs);

  if (resultC.error === "TIMEOUT") {
    return { ok: false, status: 0, data: null, error: "TIMEOUT", code: "TIMEOUT", auth_mode_used: "none" };
  }

  if (resultC.ok) {
    const bodyNorm = normalizeHosterBody(resultC.data);
    if (!bodyNorm || bodyNorm.ok) return { ...resultC, code: "OK", auth_mode_used: "access-token-header" };
    if (bodyNorm.code !== "UNAUTHORIZED") return { ...resultC, ok: false, code: bodyNorm.code, auth_mode_used: "access-token-header" };
  }

  // Все 3 попытки провалились — определяем итоговый код
  const finalResult = resultC;
  const bodyNormFinal = normalizeHosterBody(finalResult.data);

  if (bodyNormFinal) {
    return { ...finalResult, ok: false, code: bodyNormFinal.code, auth_mode_used: "none" };
  }
  if (finalResult.status === 401 || finalResult.status === 403 ||
      resultA.status === 401 || resultA.status === 403) {
    return { ...finalResult, ok: false, code: "UNAUTHORIZED", auth_mode_used: "none" };
  }

  return {
    ok: false,
    status: finalResult.status,
    data: finalResult.data,
    error: finalResult.error || `HTTP ${finalResult.status}`,
    code: "NETWORK_ERROR",
    auth_mode_used: "none",
  };
}

// ============================================================
// Audit log helper (строго по стандарту SYSTEM ACTOR / ADMIN ACTOR)
// ============================================================
async function writeAuditLog(
  supabaseAdmin: ReturnType<typeof createClient>,
  action: string,
  meta: Record<string, unknown>,
  actorUserId: string | null
): Promise<void> {
  await supabaseAdmin.from("audit_logs").insert({
    actor_user_id: actorUserId,
    actor_type: actorUserId ? "admin" : "system",
    actor_label: "hosterby-api",
    action,
    meta,
  });
}

// ============================================================
// fetch with timeout helper for egress checks
// ============================================================
async function fetchWithTimeout(url: string, init: RequestInit, ms: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// ============================================================
// Main handler
// ============================================================
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const jsonResp = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabaseAuth = createClient(supabaseUrl, anonKey);
    const supabaseAdmin = createClient(supabaseUrl, serviceKey);

    // --- AUTH GUARD: superadmin only ---
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return jsonResp({ success: false, error: "Unauthorized" }, 401);
    }

    const token = authHeader.slice(7).trim();
    const { data: userData, error: userError } = await supabaseAuth.auth.getUser(token);
    if (userError || !userData?.user?.id) {
      return jsonResp({ success: false, error: "Invalid token" }, 401);
    }

    const userId = userData.user.id;

    const { data: isSuperAdmin, error: roleErr } = await supabaseAdmin.rpc("has_role", {
      _user_id: userId,
      _role: "superadmin",
    });

    if (roleErr) {
      return jsonResp({ success: false, error: "Role check failed" }, 500);
    }
    if (isSuperAdmin !== true) {
      return jsonResp({ success: false, error: "Superadmin access required" }, 403);
    }
    // --- END AUTH GUARD ---

    const body = await req.json();
    const { action, instance_id, dry_run = false, payload = {} } = body as {
      action: string;
      instance_id?: string;
      dry_run?: boolean;
      payload?: Record<string, unknown>;
    };

    console.log(`[hosterby-api] action=${action} instance_id=${instance_id} dry_run=${dry_run}`);

    // ---- Resolve hosterby instance ----
    // Ключи НИКОГДА не передаются из UI в body — всегда читаем из БД.
    let hosterInstance: Record<string, unknown> | null = null;

    if (action !== "save_hoster_keys" || instance_id) {
      const query = instance_id
        ? supabaseAdmin.from("integration_instances").select("id, config, status").eq("id", instance_id).single()
        : supabaseAdmin.from("integration_instances").select("id, config, status").eq("provider", "hosterby").eq("category", "other").maybeSingle();

      const { data: inst } = await query;
      hosterInstance = inst as Record<string, unknown> | null;
    }

    const instanceConfig = (hosterInstance?.config as Record<string, unknown>) ?? {};
    const accessKey = instanceConfig.cloud_access_key as string | undefined;
    const secretKey = instanceConfig.cloud_secret_key as string | undefined;

    // ================================================================
    switch (action) {

      // ---- test_connection -------------------------------------------
      case "test_connection": {
        if (!accessKey || !secretKey) {
          return jsonResp({ success: false, error: "API ключи не настроены", code: "KEYS_MISSING" });
        }

        // Корректный endpoint: /cloud/orders (без /v1)
        const result = await hosterRequest("GET", "/cloud/orders", "", accessKey, secretKey);

        if (result.code === "TIMEOUT") {
          return jsonResp({ success: false, error: "Timeout при подключении к hoster.by", code: "TIMEOUT" });
        }

        if (!result.ok) {
          const code = result.code ?? "NETWORK_ERROR";
          let userError = `hoster.by API вернул HTTP ${result.status}`;
          if (code === "UNAUTHORIZED") userError = "Ключи не подходят или нет доступа (UNAUTHORIZED)";
          else if (code === "HOSTERBY_ROUTE_MISSING") userError = "Неверный endpoint/маршрут hoster.by API";
          else if (code === "HOSTERBY_520") userError = "Ошибка hoster.by API (520)";
          return jsonResp({
            success: false,
            error: userError,
            code,
            endpoint_used: "/cloud/orders",
            auth_mode_used: result.auth_mode_used ?? "none",
          });
        }

        // Парсим реальный ответ /cloud/orders
        const d = result.data as Record<string, unknown> | null;
        const orders = (d?.payload as Record<string, unknown>)?.orders;
        const ordersCount = Array.isArray(orders) ? orders.length : 0;

        const metadata = {
          orders_count: ordersCount,
          keys_configured: true,
          cloud_access_key_last4: accessKey.slice(-4),
          endpoint_used: "/cloud/orders",
          auth_mode_used: result.auth_mode_used ?? "hmac",
        };

        // Update instance metadata (без ключей)
        if (hosterInstance?.id) {
          await supabaseAdmin.from("integration_instances").update({
            status: "connected",
            last_check_at: new Date().toISOString(),
            error_message: null,
            config: {
              ...instanceConfig,
              orders_count: ordersCount,
              auth_mode_used: result.auth_mode_used,
              last_check_meta: metadata,
            },
          }).eq("id", hosterInstance.id as string);
        }

        return jsonResp({
          success: true,
          data: metadata,
          code: "OK",
          endpoint_used: "/cloud/orders",
          auth_mode_used: result.auth_mode_used ?? "hmac",
          orders_count: ordersCount,
          access_key_last4: accessKey.slice(-4),
        });
      }

      // ---- list_vms -------------------------------------------------
      case "list_vms": {
        if (!accessKey || !secretKey) {
          return jsonResp({ success: false, error: "API ключи не настроены", code: "KEYS_MISSING" });
        }

        const cloudId = payload.cloud_id as string | undefined;
        let orderId = cloudId;
        let ordersCount = 0;

        // Если cloud_id не передан — получаем список облаков и берём первый orderId
        if (!orderId) {
          const ordersResult = await hosterRequest("GET", "/cloud/orders", "", accessKey, secretKey);
          if (!ordersResult.ok) {
            const code = ordersResult.code ?? "NETWORK_ERROR";
            return jsonResp({ success: false, error: `Ошибка получения списка облаков: ${code}`, code });
          }
          const ordersData = ordersResult.data as Record<string, unknown> | null;
          const ordersList = (ordersData?.payload as Record<string, unknown>)?.orders;
          const orders = Array.isArray(ordersList) ? ordersList : [];
          ordersCount = orders.length;
          if (!orders.length) {
            return jsonResp({ success: true, vms: [], orders_count: 0, cloud_id_used: null });
          }
          orderId = String((orders[0] as Record<string, unknown>).id);
        }

        const vmsResult = await hosterRequest("GET", `/cloud/orders/${orderId}/vm`, "", accessKey, secretKey);
        if (!vmsResult.ok) {
          const code = vmsResult.code ?? "NETWORK_ERROR";
          return jsonResp({ success: false, error: `Ошибка получения VM: ${code}`, code });
        }

        const vmsData = vmsResult.data as Record<string, unknown> | null;
        const vmsList = (vmsData?.payload as Record<string, unknown>)?.vms;
        const vms = Array.isArray(vmsList) ? vmsList : [];

        // Возвращаем только безопасные поля
        const safevms = vms.map((v: Record<string, unknown>) => ({
          id: v.id,
          name: v.name,
          status: v.status,
          public_ip: v.public_ip ?? v.ip,
          cpu: v.cpu,
          ram: v.ram,
          os: v.os,
        }));

        return jsonResp({ success: true, vms: safevms, orders_count: ordersCount, cloud_id_used: orderId });
      }

      // ---- save_hoster_keys -----------------------------------------
      // dry_run=true: валидирует ключи без сохранения
      // dry_run=false: сохраняет в integration_instances + audit_log
      case "save_hoster_keys": {
        const newAccessKey = payload.cloud_access_key as string | undefined;
        const newSecretKey = payload.cloud_secret_key as string | undefined;
        const newDnsAccessKey = payload.dns_access_key as string | undefined;
        const newDnsSecretKey = payload.dns_secret_key as string | undefined;
        const alias = (payload.alias as string | undefined) || "hoster.by";

        if (!newAccessKey || !newSecretKey) {
          return jsonResp({ success: false, error: "cloud_access_key и cloud_secret_key обязательны", code: "KEYS_MISSING" });
        }

        // Validate key format (basic check — не пустые, min 8 символов)
        if (newAccessKey.length < 8 || newSecretKey.length < 8) {
          return jsonResp({ success: false, error: "Ключи слишком короткие (мин. 8 символов)" });
        }

        // Test connection via /cloud/orders (корректный endpoint)
        const testResult = await hosterRequest("GET", "/cloud/orders", "", newAccessKey, newSecretKey);

        if (!testResult.ok) {
          if (testResult.code === "TIMEOUT") {
            return jsonResp({ success: false, error: "Timeout при проверке ключей", code: "TIMEOUT" });
          }
          const code = testResult.code ?? "NETWORK_ERROR";
          let errMsg = `Ключи не прошли проверку (${code})`;
          if (code === "UNAUTHORIZED") errMsg = "Ключи не подходят или нет доступа";
          else if (code === "HOSTERBY_ROUTE_MISSING") errMsg = "Неверный маршрут hoster.by API";
          else if (code === "HOSTERBY_520") errMsg = "Ошибка hoster.by API (520)";
          return jsonResp({
            success: false,
            error: errMsg,
            code,
            endpoint_used: "/cloud/orders",
            auth_mode_used: testResult.auth_mode_used ?? "none",
          });
        }

        // Парсим orders_count из реального ответа
        const testData = testResult.data as Record<string, unknown> | null;
        const testOrders = (testData?.payload as Record<string, unknown>)?.orders;
        const ordersCount = Array.isArray(testOrders) ? testOrders.length : 0;

        if (dry_run) {
          return jsonResp({
            success: true,
            dry_run: true,
            dry_run_result: "keys_valid",
            orders_count: ordersCount,
            cloud_access_key_last4: newAccessKey.slice(-4),
            cloud_secret_key_last4: newSecretKey.slice(-4),
            endpoint_used: "/cloud/orders",
            auth_mode_used: testResult.auth_mode_used ?? "hmac",
            code: "OK",
          });
        }

        // Execute: save to DB
        const configToSave: Record<string, unknown> = {
          cloud_access_key: newAccessKey,
          cloud_secret_key: newSecretKey,
          cloud_access_key_last4: newAccessKey.slice(-4),
          cloud_secret_key_last4: newSecretKey.slice(-4),
          keys_configured: true,
          orders_count: ordersCount,
          auth_mode_used: testResult.auth_mode_used,
        };
        if (newDnsAccessKey) {
          configToSave.dns_access_key = newDnsAccessKey;
          configToSave.dns_access_key_last4 = newDnsAccessKey.slice(-4);
        }
        if (newDnsSecretKey) {
          configToSave.dns_secret_key = newDnsSecretKey;
          configToSave.dns_secret_key_last4 = newDnsSecretKey.slice(-4);
        }

        // Merge with existing egress config if present
        if (instanceConfig.egress_base_url) {
          configToSave.egress_base_url = instanceConfig.egress_base_url;
          configToSave.egress_token = instanceConfig.egress_token;
          configToSave.egress_token_last4 = instanceConfig.egress_token_last4;
          configToSave.egress_allowlist = instanceConfig.egress_allowlist;
          configToSave.egress_enabled = instanceConfig.egress_enabled;
        }

        let savedInstanceId: string;
        if (hosterInstance?.id) {
          await supabaseAdmin.from("integration_instances").update({
            config: configToSave,
            status: "connected",
            last_check_at: new Date().toISOString(),
            error_message: null,
            alias,
          }).eq("id", hosterInstance.id as string);
          savedInstanceId = hosterInstance.id as string;
        } else {
          const { data: created, error: createErr } = await supabaseAdmin
            .from("integration_instances")
            .insert({
              category: "other",
              provider: "hosterby",
              alias,
              is_default: true,
              status: "connected",
              last_check_at: new Date().toISOString(),
              config: configToSave,
              error_message: null,
            })
            .select("id")
            .single();
          if (createErr || !created) {
            return jsonResp({ success: false, error: "Ошибка сохранения: " + (createErr?.message ?? "unknown") });
          }
          savedInstanceId = created.id;
        }

        // SYSTEM ACTOR Proof: actor_type='system', actor_user_id=NULL, actor_label='hosterby-api'
        await writeAuditLog(supabaseAdmin, "hosterby.save_keys", {
          instance_id: savedInstanceId,
          cloud_access_key_last4: newAccessKey.slice(-4),
          orders_count: ordersCount,
          dns_configured: !!(newDnsAccessKey && newDnsSecretKey),
          auth_mode_used: testResult.auth_mode_used,
          endpoint_used: "/cloud/orders",
          // НЕ хранить полные ключи!
        }, null); // null = SYSTEM ACTOR (actor_type='system', actor_user_id=NULL)

        return jsonResp({
          success: true,
          code: "OK",
          instance_id: savedInstanceId,
          orders_count: ordersCount,
          cloud_access_key_last4: newAccessKey.slice(-4),
          cloud_secret_key_last4: newSecretKey.slice(-4),
          auth_mode_used: testResult.auth_mode_used,
          endpoint_used: "/cloud/orders",
        });
      }

      // ---- by_egress_check_health -----------------------------------
      case "by_egress_check_health": {
        const baseUrl = (payload.base_url as string | undefined) || (instanceConfig.egress_base_url as string | undefined);
        if (!baseUrl) {
          return jsonResp({ success: false, error: "BY_EGRESS_BASE_URL не задан" });
        }

        if (!isSsrfSafe(baseUrl)) {
          return jsonResp({ success: false, error: "SSRF_BLOCKED: URL указывает на внутренний адрес" });
        }

        try {
          const resp = await fetchWithTimeout(`${baseUrl}/health`, {}, 10000);
          return jsonResp({
            success: resp.ok,
            http_status: resp.status,
            message: resp.ok ? "Fetch-service доступен" : `HTTP ${resp.status}`,
          });
        } catch (e) {
          return jsonResp({
            success: false,
            error: e instanceof Error && e.name === "AbortError" ? "TIMEOUT" : String(e),
          });
        }
      }

      // ---- by_egress_test_url --------------------------------------
      // Протокол: GET /fetch + X-Target-URL header + Authorization: Bearer {token}
      case "by_egress_test_url": {
        const baseUrl = (payload.base_url as string | undefined) || (instanceConfig.egress_base_url as string | undefined);
        const egressToken = (payload.token as string | undefined) || (instanceConfig.egress_token as string | undefined);
        const targetUrl = payload.target_url as string | undefined;
        const rawAllowlist = (payload.allowlist as string | undefined) || (instanceConfig.egress_allowlist as string | undefined) || "";
        const allowlist = rawAllowlist.split(",").map((d: string) => d.trim()).filter(Boolean);

        // Раздельная валидация: base_url/target_url обязательны, token — отдельно
        if (!baseUrl || !targetUrl) {
          return jsonResp({ success: false, error: "Обязательные поля: base_url, target_url" });
        }
        if (!egressToken) {
          return jsonResp({ success: false, code: "TOKEN_MISSING", error: "BY_EGRESS_TOKEN не задан. Введите токен или сохраните конфигурацию egress." });
        }

        // SSRF guard на egress endpoint
        if (!isSsrfSafe(baseUrl)) {
          return jsonResp({ success: false, error: "SSRF_BLOCKED: egress base_url внутренний" });
        }

        // Allowlist check
        if (allowlist.length > 0 && !isDomainAllowed(targetUrl, allowlist)) {
          return jsonResp({
            success: false,
            error: `Домен не в allowlist. Allowlist: ${allowlist.join(", ")}`,
            code: "NOT_IN_ALLOWLIST",
          });
        }

        try {
          const resp = await fetchWithTimeout(`${baseUrl}/fetch`, {
            method: "GET",
            headers: {
              "Authorization": `Bearer ${egressToken}`,
              "X-Target-URL": targetUrl,
            },
          }, 15000);

          return jsonResp({
            success: resp.ok || resp.status === 301 || resp.status === 302,
            http_status: resp.status,
            content_length: resp.headers.get("content-length") || "unknown",
            target_domain: new URL(targetUrl).hostname,
          });
        } catch (e) {
          return jsonResp({
            success: false,
            error: e instanceof Error && e.name === "AbortError" ? "TIMEOUT" : String(e),
          });
        }
      }

      // ---- by_egress_save_config -----------------------------------
      case "by_egress_save_config": {
        const egressBaseUrl = payload.egress_base_url as string | undefined;
        // Fallback: если токен не передан — использовать сохранённый из instanceConfig
        const egressTokenNew = payload.egress_token as string | undefined;
        const egressToken = egressTokenNew || (instanceConfig.egress_token as string | undefined);
        // last4: из нового токена или из сохранённого
        const egressTokenLast4 =
          egressTokenNew
            ? egressTokenNew.slice(-4)
            : (instanceConfig.egress_token_last4 as string | undefined)
              ?? (instanceConfig.egress_token ? String(instanceConfig.egress_token).slice(-4) : "????");
        const egressAllowlist = payload.egress_allowlist as string | undefined;
        const egressEnabled = payload.egress_enabled !== false;

        if (!egressBaseUrl) {
          return jsonResp({ success: false, error: "egress_base_url обязателен" });
        }
        if (!egressToken) {
          return jsonResp({ success: false, code: "TOKEN_MISSING", error: "BY_EGRESS_TOKEN не задан. Введите токен в форме." });
        }

        if (!isSsrfSafe(egressBaseUrl)) {
          return jsonResp({ success: false, error: "SSRF_BLOCKED: egress_base_url внутренний" });
        }

        if (dry_run) {
          return jsonResp({
            success: true,
            dry_run: true,
            dry_run_result: {
              egress_base_url: egressBaseUrl,
              egress_token_last4: egressTokenLast4,
              egress_allowlist: egressAllowlist,
              egress_enabled: egressEnabled,
            },
          });
        }

        if (!hosterInstance?.id) {
          return jsonResp({ success: false, error: "Сначала сохраните API ключи hoster.by" });
        }

        const updatedConfig = {
          ...instanceConfig,
          egress_base_url: egressBaseUrl,
          egress_token: egressToken,           // полный токен (защищён RLS)
          egress_token_last4: egressTokenLast4, // используем вычисленный last4
          egress_allowlist: egressAllowlist || "nbrb.by,nalog.gov.by,ssf.gov.by,kgk.gov.by,gtk.gov.by,minfin.gov.by,economy.gov.by,pravo.by",
          egress_enabled: egressEnabled,
        };

        await supabaseAdmin.from("integration_instances").update({
          config: updatedConfig,
        }).eq("id", hosterInstance.id as string);

        await writeAuditLog(supabaseAdmin, "hosterby.by_egress_config_saved", {
          instance_id: hosterInstance.id,
          egress_base_url: egressBaseUrl,
          egress_token_last4: egressTokenLast4, // НЕ хранить полный токен!
          egress_enabled: egressEnabled,
          token_changed: !!egressTokenNew,
        }, null); // SYSTEM ACTOR: actor_type='system', actor_user_id=NULL

        return jsonResp({ success: true, egress_token_last4: egressTokenLast4, egress_enabled: egressEnabled });
      }

      // ---- by_egress_toggle ----------------------------------------
      case "by_egress_toggle": {
        const enabled = payload.enabled as boolean;
        if (typeof enabled !== "boolean") {
          return jsonResp({ success: false, error: "enabled должен быть boolean" });
        }
        if (!hosterInstance?.id) {
          return jsonResp({ success: false, error: "hoster.by instance не найден" });
        }

        await supabaseAdmin.from("integration_instances").update({
          config: { ...instanceConfig, egress_enabled: enabled },
        }).eq("id", hosterInstance.id as string);

        await writeAuditLog(supabaseAdmin, "hosterby.by_egress_enabled_toggled", {
          instance_id: hosterInstance.id,
          egress_enabled: enabled,
        }, userId);

        return jsonResp({ success: true, egress_enabled: enabled });
      }

      default:
        return jsonResp({ success: false, error: `Неизвестное действие: ${action}` }, 400);
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[hosterby-api] Unhandled error:", msg);
    return jsonResp({ success: false, error: "Внутренняя ошибка сервера" }, 500);
  }
});
