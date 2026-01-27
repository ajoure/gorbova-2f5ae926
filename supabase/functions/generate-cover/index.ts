import { Hono } from "https://deno.land/x/hono@v4.3.11/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const app = new Hono();

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

app.options("/*", (c) => {
  return c.text("", 204, corsHeaders);
});

app.post("/", async (c) => {
  try {
    const authHeader = c.req.header("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return c.json({ error: "Unauthorized" }, 401, corsHeaders);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");

    if (!lovableApiKey) {
      return c.json({ error: "LOVABLE_API_KEY not configured" }, 500, corsHeaders);
    }

    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // Verify user
    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error: authError } = await supabase.auth.getClaims(token);
    if (authError || !claims?.claims?.sub) {
      return c.json({ error: "Invalid token" }, 401, corsHeaders);
    }

    const body = await c.req.json();
    const { title, description, moduleId } = body;

    if (!title) {
      return c.json({ error: "Title is required" }, 400, corsHeaders);
    }

    // Generate prompt
    const prompt = `Create a minimalist, modern cover image for an educational module titled "${title}". 
${description ? `Description: ${description}. ` : ""}
Style: Clean gradient background with subtle abstract geometric shapes. 
Professional business education aesthetic. 
Modern, elegant, soft colors. 
Dimensions: 1200x630 pixels (16:9 aspect ratio).
NO text, NO letters, NO words on the image.
Ultra high resolution.`;

    console.log("Generating cover with prompt:", prompt);

    // Call Lovable AI
    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-image",
        messages: [{ role: "user", content: prompt }],
        modalities: ["image", "text"],
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error("AI API error:", errorText);
      return c.json({ error: "AI generation failed", details: errorText }, 500, corsHeaders);
    }

    const aiData = await aiResponse.json();
    console.log("AI response received");

    // Extract image from response
    const imageData = aiData.choices?.[0]?.message?.images?.[0]?.image_url?.url;
    
    if (!imageData) {
      console.error("No image in AI response:", JSON.stringify(aiData).slice(0, 500));
      return c.json({ error: "No image generated" }, 500, corsHeaders);
    }

    // Parse base64 data
    const base64Match = imageData.match(/^data:image\/(\w+);base64,(.+)$/);
    if (!base64Match) {
      return c.json({ error: "Invalid image data format" }, 500, corsHeaders);
    }

    const imageFormat = base64Match[1];
    const base64Data = base64Match[2];

    // Convert base64 to Uint8Array
    const binaryString = atob(base64Data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    // Upload to storage
    const fileName = `ai-covers/${moduleId || "temp"}-${Date.now()}.${imageFormat}`;
    
    const { error: uploadError } = await supabase.storage
      .from("training-assets")
      .upload(fileName, bytes, {
        contentType: `image/${imageFormat}`,
        upsert: true,
      });

    if (uploadError) {
      console.error("Upload error:", uploadError);
      return c.json({ error: "Failed to upload image", details: uploadError.message }, 500, corsHeaders);
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from("training-assets")
      .getPublicUrl(fileName);

    console.log("Cover generated and uploaded:", urlData.publicUrl);

    return c.json({ 
      success: true,
      url: urlData.publicUrl,
    }, 200, corsHeaders);

  } catch (error: unknown) {
    console.error("Error in generate-cover:", error);
    const message = error instanceof Error ? error.message : "Internal error";
    return c.json({ error: message }, 500, corsHeaders);
  }
});

Deno.serve(app.fetch);
