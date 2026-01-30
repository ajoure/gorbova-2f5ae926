import { createClient } from "npm:@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { 
      status: 405, 
      headers: { ...corsHeaders, "Content-Type": "application/json" } 
    });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { 
        status: 401, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");

    if (!lovableApiKey) {
      console.error("LOVABLE_API_KEY not configured");
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY not configured" }), { 
        status: 500, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }

    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // Verify user
    const { data: userData, error: authError } = await supabase.auth.getUser();
    if (authError || !userData?.user?.id) {
      console.error("Auth error:", authError);
      return new Response(JSON.stringify({ error: "Invalid token" }), { 
        status: 401, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }

    const body = await req.json();
    const { title, description, moduleId } = body;

    if (!title) {
      return new Response(JSON.stringify({ error: "Title is required" }), { 
        status: 400, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }

    // Generate prompt - thematic imagery based on content, NO TEXT
    const prompt = `Create a professional cover image for an educational video lesson about accounting and law.

Topics: "${title}"
${description ? `Details: ${description}` : ""}

CRITICAL REQUIREMENTS:
- NO TEXT whatsoever - absolutely no letters, numbers, words, or any written content on the image
- NO logos, NO watermarks, NO captions, NO titles
- Only meaningful visual imagery that represents the topic
- Use symbolic icons and illustrations: documents, calculators, coins, charts, scales of justice, buildings, computers, folders, contracts, stamps, office desk items
- Professional business illustration style
- Clean, modern aesthetic with soft gradients
- Light, professional color palette (blues, teals, soft purples, whites)
- 16:9 aspect ratio (1200x630 pixels)
- High quality, sharp imagery
- Ultra high resolution

The image should convey the topic through visual symbols only, without any text.`;

    console.log("Generating cover with prompt:", prompt.slice(0, 100) + "...");

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
      return new Response(JSON.stringify({ error: "AI generation failed", details: errorText }), { 
        status: 500, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }

    const aiData = await aiResponse.json();
    console.log("AI response structure:", JSON.stringify(aiData).slice(0, 800));

    // Extract image from response - check multiple possible locations
    let imageData: string | undefined;
    
    // Try standard image_url format first
    imageData = aiData.choices?.[0]?.message?.images?.[0]?.image_url?.url;
    
    // Try inline_data format (alternative structure)
    if (!imageData) {
      const inlineData = aiData.choices?.[0]?.message?.images?.[0]?.inline_data;
      if (inlineData?.data && inlineData?.mime_type) {
        imageData = `data:${inlineData.mime_type};base64,${inlineData.data}`;
      }
    }
    
    // Try content parts format (Gemini native)
    if (!imageData && aiData.choices?.[0]?.message?.content) {
      const parts = aiData.choices?.[0]?.message?.parts;
      if (Array.isArray(parts)) {
        for (const part of parts) {
          if (part.inline_data?.data) {
            imageData = `data:${part.inline_data.mime_type || 'image/png'};base64,${part.inline_data.data}`;
            break;
          }
        }
      }
    }
    
    if (!imageData) {
      console.error("No image in AI response. Full response:", JSON.stringify(aiData));
      return new Response(JSON.stringify({ 
        error: "No image generated", 
        details: "AI returned text without image. Try again or use a different title.",
        aiResponse: aiData.choices?.[0]?.message?.content?.slice(0, 200)
      }), { 
        status: 500, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }
    
    console.log("Image data extracted, length:", imageData.length);

    // Parse base64 data
    const base64Match = imageData.match(/^data:image\/(\w+);base64,(.+)$/);
    if (!base64Match) {
      return new Response(JSON.stringify({ error: "Invalid image data format" }), { 
        status: 500, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
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
      return new Response(JSON.stringify({ error: "Failed to upload image", details: uploadError.message }), { 
        status: 500, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from("training-assets")
      .getPublicUrl(fileName);

    console.log("Cover generated and uploaded:", urlData.publicUrl);

    return new Response(JSON.stringify({ 
      success: true,
      url: urlData.publicUrl,
    }), { 
      status: 200, 
      headers: { ...corsHeaders, "Content-Type": "application/json" } 
    });

  } catch (error: unknown) {
    console.error("Error in generate-cover:", error);
    const message = error instanceof Error ? error.message : "Internal error";
    return new Response(JSON.stringify({ error: message }), { 
      status: 500, 
      headers: { ...corsHeaders, "Content-Type": "application/json" } 
    });
  }
});
