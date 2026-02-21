import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ALLOWED_PREFIXES = ["lesson-audio/", "lesson-files/", "lesson-images/", "student-uploads/", "ai-covers/", "training-covers/", "lesson-covers/"];
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

  // Structure guard для student-uploads: student-uploads/{userId}/{lessonId}/{blockId}/{file}
  if (path.startsWith("student-uploads/")) {
    const segments = path.split("/");
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

    // Один adminClient на весь запрос
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Кешируем роль один раз
    const [{ data: isAdmin }, { data: isSuper }] = await Promise.all([
      adminClient.rpc("has_role_v2", { _user_id: user.id, _role_code: "admin" }),
      adminClient.rpc("has_role_v2", { _user_id: user.id, _role_code: "superadmin" }),
    ]);
    const isAdminOrSuper = !!(isAdmin || isSuper);

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

    // Фильтрация путей
    const lessonId = entity?.type === "lesson" ? entity?.id : undefined;
    const allowedPaths: string[] = [];
    const blockedPaths: string[] = [];

    for (const path of paths) {
      if (!isPathAllowed(path, lessonId)) {
        blockedPaths.push(path);
        continue;
      }
      // Owner/admin check для student-uploads
      if (path.startsWith("student-uploads/")) {
        const segments = path.split("/");
        const pathUserId = segments[1];
        if (user.id !== pathUserId && !isAdminOrSuper) {
          blockedPaths.push(path);
          continue;
        }
      }
      allowedPaths.push(path);
    }

    if (mode === "dry_run") {
      return new Response(
        JSON.stringify({
          mode: "dry_run",
          requested_paths_count: paths.length,
          allowed_count: allowedPaths.length,
          blocked_count: blockedPaths.length,
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
          requested_paths_count: paths.length,
          deleted_count: 0,
          blocked_count: blockedPaths.length,
          deleted_paths: [],
          blocked_paths: blockedPaths,
          errors: [],
          message: "No paths passed guards — nothing deleted",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Удаление ТОЛЬКО allowedPaths
    const { data: removeData, error: removeError } = await adminClient.storage
      .from("training-assets")
      .remove(allowedPaths);

    const deletedCount = removeData?.length ?? 0;
    const errors: string[] = [];
    if (removeError) {
      errors.push(removeError.message);
    }

    // Audit log — SYSTEM ACTOR, no PII
    await adminClient.from("audit_logs").insert({
      action: "training_assets_deleted",
      actor_type: "system",
      actor_user_id: null,
      actor_label: "training-assets-delete edge function",
      meta: {
        requested_paths_count: paths.length,
        allowed_count: allowedPaths.length,
        blocked_count: blockedPaths.length,
        deleted_count: deletedCount,
        errors,
        reason,
        entity: entity || null,
        initiated_by_user_id: user.id,
      },
    });

    return new Response(
      JSON.stringify({
        mode: "execute",
        requested_paths_count: paths.length,
        deleted_count: deletedCount,
        blocked_count: blockedPaths.length,
        deleted_paths: allowedPaths,
        blocked_paths: blockedPaths,
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
