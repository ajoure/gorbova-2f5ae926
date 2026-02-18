import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

// Строгий allowlist префиксов — только наши папки в training-assets
const ALLOWED_PREFIXES = ["lesson-audio/", "lesson-files/", "lesson-images/"];

function isPathAllowed(path: string): boolean {
  if (!path || typeof path !== "string") return false;
  // Запрет path traversal
  if (path.includes("..") || path.includes("//")) return false;
  // Запрет leading slash
  if (path.startsWith("/")) return false;
  return ALLOWED_PREFIXES.some((prefix) => path.startsWith(prefix));
}

Deno.serve(async (req: Request) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const url = new URL(req.url);
    const path = url.searchParams.get("path") || "";
    const name = url.searchParams.get("name") || "file";

    // Guard: проверяем path
    if (!isPathAllowed(path)) {
      return new Response(
        JSON.stringify({ error: "Invalid or forbidden path" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Аутентификация: проверяем JWT (опционально — файлы из публичного бакета)
    // Для максимальной безопасности можно включить; пока пропускаем т.к. training-assets публичный
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Верификация JWT через anon клиент
    const anonClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
    );
    const { data: { user }, error: authError } = await anonClient.auth.getUser(
      authHeader.replace("Bearer ", "")
    );
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // service_role клиент для скачивания
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: fileData, error: downloadError } = await adminClient.storage
      .from("training-assets")
      .download(path);

    if (downloadError || !fileData) {
      console.error("Download error:", downloadError);
      return new Response(
        JSON.stringify({ error: "File not found or download failed" }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Безопасное имя для Content-Disposition
    const safeName = name
      .replace(/[^\w.\-_а-яёА-ЯЁ\s]/g, "_")
      .replace(/_{2,}/g, "_")
      .substring(0, 200);

    // Определяем Content-Type из blob
    const contentType = fileData.type || "application/octet-stream";

    return new Response(fileData, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${encodeURIComponent(safeName)}"`,
        "Cache-Control": "private, no-cache",
      },
    });
  } catch (err) {
    console.error("Unexpected error in training-assets-download:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
