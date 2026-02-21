import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Строгий allowlist префиксов — только наши папки в training-assets
const ALLOWED_PREFIXES = ["lesson-audio/", "lesson-files/", "lesson-images/", "student-uploads/"];
const MAX_PATHS_PER_BATCH = 50;

interface DeleteRequest {
  mode: "dry_run" | "execute";
  paths: string[];
  reason: string;
  entity?: { type: string; id: string };
}

function isPathAllowed(path: string, lessonId?: string): boolean {
  if (!path || typeof path !== "string") return false;
  if (path.includes("..") || path.includes("//")) return false;
  if (path.startsWith("/")) return false;

  const prefixOk = ALLOWED_PREFIXES.some((prefix) => path.startsWith(prefix));
  if (!prefixOk) return false;

  // Ownership guard для lesson-* путей
  if (lessonId) {
    const lessonPrefixes = ["lesson-audio/", "lesson-files/", "lesson-images/"];
    if (lessonPrefixes.some((p) => path.startsWith(p))) {
      const ownedOk = lessonPrefixes.some((prefix) =>
        path.startsWith(`${prefix}${lessonId}/`)
      );
      if (!ownedOk) return false;
    }
  }

  // Ownership guard для student-uploads: student-uploads/{userId}/{lessonId}/{blockId}/{file}
  if (path.startsWith("student-uploads/")) {
    const segments = path.split("/");
    // Минимум 5 сегментов: prefix, userId, lessonId, blockId, filename
    if (segments.length < 5 || segments.some(s => s === "")) return false;
  }

  return true;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    // Аутентификация
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const anonClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!
    );
    const { data: { user }, error: authError } = await anonClient.auth.getUser(
      authHeader.replace("Bearer ", "")
    );
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body: DeleteRequest = await req.json();
    const { mode, paths, reason, entity } = body;

    // Валидация входных данных
    if (!mode || !["dry_run", "execute"].includes(mode)) {
      return new Response(
        JSON.stringify({ error: "Invalid mode: must be 'dry_run' or 'execute'" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!Array.isArray(paths)) {
      return new Response(
        JSON.stringify({ error: "paths must be an array" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // STOP: лимит батча
    if (paths.length > MAX_PATHS_PER_BATCH) {
      return new Response(
        JSON.stringify({ error: `Too many paths: max ${MAX_PATHS_PER_BATCH} per call` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!reason || typeof reason !== "string") {
      return new Response(
        JSON.stringify({ error: "reason is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Фильтрация путей через guards
    // lessonId берётся из entity.id только если тип = lesson
    const lessonId = entity?.type === "lesson" ? entity?.id : undefined;
    const allowedPaths: string[] = [];
    const blockedPaths: string[] = [];

    for (const path of paths) {
      if (isPathAllowed(path, lessonId)) {
        allowedPaths.push(path);
      } else {
        blockedPaths.push(path);
      }
    }

    if (mode === "dry_run") {
      return new Response(
        JSON.stringify({
          mode: "dry_run",
          requested: paths.length,
          allowed: allowedPaths.length,
          blocked: blockedPaths.length,
          would_delete: allowedPaths,
          blocked_paths: blockedPaths,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // mode === "execute"
    if (allowedPaths.length === 0) {
      return new Response(
        JSON.stringify({
          mode: "execute",
          requested: paths.length,
          allowed: 0,
          blocked: blockedPaths.length,
          deleted: 0,
          errors: [],
          message: "No paths passed guards — nothing deleted",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Удаление файлов
    const { data: removeData, error: removeError } = await adminClient.storage
      .from("training-assets")
      .remove(allowedPaths);

    const deletedCount = removeData?.length ?? 0;
    const errors: string[] = [];
    if (removeError) {
      errors.push(removeError.message);
    }

    // Запись в audit_logs — SYSTEM ACTOR proof
    await adminClient.from("audit_logs").insert({
      action: "training_assets_deleted",
      actor_type: "system",
      actor_user_id: null,
      actor_label: "training-assets-delete edge function",
      meta: {
        requested: paths.length,
        allowed: allowedPaths.length,
        blocked: blockedPaths.length,
        deleted: deletedCount,
        errors,
        reason,
        entity: entity || null,
        initiated_by_user_id: user.id,
        // No PII: не логируем email/имя пользователя
      },
    });

    return new Response(
      JSON.stringify({
        mode: "execute",
        requested: paths.length,
        allowed: allowedPaths.length,
        blocked: blockedPaths.length,
        deleted: deletedCount,
        errors,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Unexpected error in training-assets-delete:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
