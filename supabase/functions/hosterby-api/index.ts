import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

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

// MD5 implementation (pure JS — Deno SubtleCrypto не поддерживает MD5)
// Compact safe implementation based on RFC 1321
function md5(input: Uint8Array): Uint8Array {
  const M = new Uint32Array([
    0xd76aa478, 0xe8c7b756, 0x242070db, 0xc1bdceee, 0xf57c0faf, 0x4787c62a,
    0xa8304613, 0xfd469501, 0x698098d8, 0x8b44f7af, 0xffff5bb1, 0x895cd7be,
    0x6b901122, 0xfd987193, 0xa679438e, 0x49b40821, 0xf61e2562, 0xc040b340,
    0x265e5a51, 0xe9b6c7aa, 0xd62f105d, 0x02441453, 0xd8a1e681, 0xe7d3fbc8,
    0x21e1cde6, 0xc33707d6, 0xf4d50d87, 0x455a14ed, 0xa9e3e905, 0xfcefa3f8,
    0x676f02d9, 0x8d2a4c8a, 0xfffa3942, 0x8771f681, 0x6d9d6122, 0xfde5380c,
    0xa4beea44, 0x4bdecfa9, 0xf6bb4b60, 0xbebfbc70, 0x289b7ec6, 0xeaa127fa,
    0xd4ef3085, 0x04881d05, 0xd9d4d039, 0xe6db99e5, 0x1fa27cf8, 0xc4ac5665,
    0xf4292244, 0x432aff97, 0xab9423a7, 0xfc93a039, 0x655b59c3, 0x8f0ccc92,
    0xffeff47d, 0x85845dd1, 0x6fa87e4f, 0xfe2ce6e0, 0xa3014314, 0x4e0811a1,
    0xf7537e82, 0xbd3af235, 0x2ad7d2bb, 0xeb86d391,
  ]);
  const S = new Uint8Array([
    7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20,
    5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 4, 11, 16, 23, 4, 11, 16, 23,
    4, 11, 16, 23, 4, 11, 16, 23, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
    6, 10, 15, 21,
  ]);

  const origLen = input.length;
  // Padding
  const paddedLen = Math.ceil((origLen + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLen);
  padded.set(input);
  padded[origLen] = 0x80;
  const bitLen = BigInt(origLen) * 8n;
  for (let i = 0; i < 8; i++) {
    padded[paddedLen - 8 + i] = Number((bitLen >> BigInt(i * 8)) & 0xffn);
  }

  let a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476;

  for (let chunk = 0; chunk < paddedLen; chunk += 64) {
    const W = new Uint32Array(16);
    for (let i = 0; i < 16; i++) {
      W[i] =
        padded[chunk + i * 4] |
        (padded[chunk + i * 4 + 1] << 8) |
        (padded[chunk + i * 4 + 2] << 16) |
        (padded[chunk + i * 4 + 3] << 24);
    }
    let A = a0, B = b0, C = c0, D = d0;

    for (let i = 0; i < 64; i++) {
      let F: number, g: number;
      if (i < 16) {
        F = (B & C) | (~B & D);
        g = i;
      } else if (i < 32) {
        F = (D & B) | (~D & C);
        g = (5 * i + 1) % 16;
      } else if (i < 48) {
        F = B ^ C ^ D;
        g = (3 * i + 5) % 16;
      } else {
        F = C ^ (B | ~D);
        g = (7 * i) % 16;
      }
      F = (F + A + M[i] + W[g]) >>> 0;
      A = D;
      D = C;
      C = B;
      const s = S[i];
      B = ((B + ((F << s) | (F >>> (32 - s)))) >>> 0);
    }
    a0 = (a0 + A) >>> 0;
    b0 = (b0 + B) >>> 0;
    c0 = (c0 + C) >>> 0;
    d0 = (d0 + D) >>> 0;
  }

  const result = new Uint8Array(16);
  for (let i = 0; i < 4; i++) {
    result[i]      = (a0 >> (i * 8)) & 0xff;
    result[i + 4]  = (b0 >> (i * 8)) & 0xff;
    result[i + 8]  = (c0 >> (i * 8)) & 0xff;
    result[i + 12] = (d0 >> (i * 8)) & 0xff;
  }
  return result;
}

function md5Base64(body: string): string {
  const bytes = new TextEncoder().encode(body);
  const hash = md5(bytes);
  return btoa(String.fromCharCode(...hash));
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
// Run inline at startup in dev; нe влияет на production flow.
// Добавьте реальные векторы из hoster.by sandbox при получении примеров.
// ============================================================
async function runSigningTests(): Promise<void> {
  // Vector 1: GET без тела
  const sig1 = await buildHosterSignature("GET", "/v1/cloud/vms", "", "test_secret_key");
  console.log("[SIGNING TEST] vector1 GET /v1/cloud/vms:", sig1);

  // Vector 2: POST с телом
  const body2 = '{"name":"test"}';
  const sig2 = await buildHosterSignature("POST", "/v1/cloud/vms", body2, "test_secret_key");
  console.log("[SIGNING TEST] vector2 POST /v1/cloud/vms body:", sig2);

  // Vector 3: MD5 пустой строки → base64 должен быть "1B2M2Y8AsgTpgAmY7PhCfg=="
  const emptyMd5 = md5Base64("");
  const expectedEmptyMd5 = "1B2M2Y8AsgTpgAmY7PhCfg==";
  if (emptyMd5 !== expectedEmptyMd5) {
    console.error(`[SIGNING TEST] FAIL: MD5("") expected ${expectedEmptyMd5} got ${emptyMd5}`);
  } else {
    console.log("[SIGNING TEST] PASS: MD5 empty string OK");
  }
}

// Run tests on cold start
runSigningTests().catch((e) => console.error("[SIGNING TEST] Error:", e));

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
// hoster.by API request helper
// ============================================================
async function hosterRequest(
  method: string,
  path: string,
  body: string,
  accessKey: string,
  secretKey: string,
  timeoutMs = 15000
): Promise<{ ok: boolean; status: number; data: unknown; error?: string }> {
  const signature = await buildHosterSignature(method, path, body, secretKey);
  const url = `${HOSTERBY_API_BASE}${path}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const resp = await fetch(url, {
      method,
      headers: {
        "X-API-KEY": accessKey,
        "X-API-SIGN": signature,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
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

        const result = await hosterRequest("GET", "/v1/cloud/vms", "", accessKey, secretKey);

        if (result.error === "TIMEOUT") {
          return jsonResp({ success: false, error: "Timeout при подключении к hoster.by", code: "TIMEOUT" });
        }

        if (!result.ok) {
          // SIGNING_MISMATCH detection
          if (result.status === 401 || result.status === 403) {
            return jsonResp({
              success: false,
              error: "Ошибка авторизации hoster.by (возможно SIGNING_MISMATCH). Проверьте ключи и схему подписи по: serviceapi.hoster.by/rest_api_docs.html секция Authentication",
              code: "SIGNING_MISMATCH",
              http_status: result.status,
            });
          }
          return jsonResp({
            success: false,
            error: `hoster.by API вернул HTTP ${result.status}`,
            http_status: result.status,
          });
        }

        const vms = Array.isArray(result.data) ? result.data : [];
        const metadata = {
          vms_count: vms.length,
          keys_configured: true,
          cloud_access_key_last4: accessKey.slice(-4),
        };

        // Update instance metadata (без ключей)
        if (hosterInstance?.id) {
          await supabaseAdmin.from("integration_instances").update({
            status: "connected",
            last_check_at: new Date().toISOString(),
            error_message: null,
            config: {
              ...instanceConfig,
              vms_count: vms.length,
              last_check_meta: metadata,
            },
          }).eq("id", hosterInstance.id as string);
        }

        return jsonResp({ success: true, data: metadata });
      }

      // ---- list_vms -------------------------------------------------
      case "list_vms": {
        if (!accessKey || !secretKey) {
          return jsonResp({ success: false, error: "API ключи не настроены", code: "KEYS_MISSING" });
        }

        const cloudId = payload.cloud_id as string | undefined;
        const path = cloudId ? `/v1/cloud/vms?cloud_id=${cloudId}` : "/v1/cloud/vms";
        const result = await hosterRequest("GET", path, "", accessKey, secretKey);

        if (!result.ok) {
          if (result.status === 401 || result.status === 403) {
            return jsonResp({ success: false, error: "SIGNING_MISMATCH или неверные ключи", code: "SIGNING_MISMATCH" });
          }
          return jsonResp({ success: false, error: `HTTP ${result.status}` });
        }

        const vms = Array.isArray(result.data) ? result.data : [];
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

        return jsonResp({ success: true, vms: safevms });
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
          return jsonResp({ success: false, error: "cloud_access_key и cloud_secret_key обязательны" });
        }

        // Validate key format (basic check — не пустые, min 8 символов)
        if (newAccessKey.length < 8 || newSecretKey.length < 8) {
          return jsonResp({ success: false, error: "Ключи слишком короткие (мин. 8 символов)" });
        }

        // Test connection before saving
        const testResult = await hosterRequest("GET", "/v1/cloud/vms", "", newAccessKey, newSecretKey);

        if (!testResult.ok) {
          if (testResult.error === "TIMEOUT") {
            return jsonResp({ success: false, error: "Timeout при проверке ключей" });
          }
          const errMsg = (testResult.status === 401 || testResult.status === 403)
            ? "Ключи не прошли проверку: SIGNING_MISMATCH или неверные ключи"
            : `Ключи не прошли проверку: HTTP ${testResult.status}`;
          return jsonResp({ success: false, error: errMsg, dry_run_result: "validation_failed" });
        }

        const vms = Array.isArray(testResult.data) ? testResult.data : [];

        if (dry_run) {
          return jsonResp({
            success: true,
            dry_run: true,
            dry_run_result: "keys_valid",
            vms_count: vms.length,
            cloud_access_key_last4: newAccessKey.slice(-4),
            cloud_secret_key_last4: newSecretKey.slice(-4),
          });
        }

        // Execute: save to DB
        const configToSave: Record<string, unknown> = {
          cloud_access_key: newAccessKey,
          cloud_secret_key: newSecretKey,
          cloud_access_key_last4: newAccessKey.slice(-4),
          cloud_secret_key_last4: newSecretKey.slice(-4),
          keys_configured: true,
          vms_count: vms.length,
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

        await writeAuditLog(supabaseAdmin, "hosterby.keys_saved", {
          instance_id: savedInstanceId,
          cloud_access_key_last4: newAccessKey.slice(-4),
          vms_count: vms.length,
          dns_configured: !!(newDnsAccessKey && newDnsSecretKey),
          // НЕ хранить полные ключи!
        }, userId);

        return jsonResp({
          success: true,
          instance_id: savedInstanceId,
          vms_count: vms.length,
          cloud_access_key_last4: newAccessKey.slice(-4),
          cloud_secret_key_last4: newSecretKey.slice(-4),
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

        if (!baseUrl || !egressToken || !targetUrl) {
          return jsonResp({ success: false, error: "Обязательные поля: base_url, token, target_url" });
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
        const egressToken = payload.egress_token as string | undefined;
        const egressAllowlist = payload.egress_allowlist as string | undefined;
        const egressEnabled = payload.egress_enabled !== false;

        if (!egressBaseUrl || !egressToken) {
          return jsonResp({ success: false, error: "egress_base_url и egress_token обязательны" });
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
              egress_token_last4: egressToken.slice(-4),
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
          egress_token: egressToken,
          egress_token_last4: egressToken.slice(-4),
          egress_allowlist: egressAllowlist || "nbrb.by,nalog.gov.by,ssf.gov.by,kgk.gov.by,gtk.gov.by,minfin.gov.by,economy.gov.by,pravo.by",
          egress_enabled: egressEnabled,
        };

        await supabaseAdmin.from("integration_instances").update({
          config: updatedConfig,
        }).eq("id", hosterInstance.id as string);

        await writeAuditLog(supabaseAdmin, "hosterby.by_egress_config_saved", {
          instance_id: hosterInstance.id,
          egress_base_url: egressBaseUrl,
          egress_token_last4: egressToken.slice(-4),
          egress_enabled: egressEnabled,
          // НЕ хранить полный токен!
        }, userId);

        return jsonResp({ success: true, egress_token_last4: egressToken.slice(-4), egress_enabled: egressEnabled });
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
