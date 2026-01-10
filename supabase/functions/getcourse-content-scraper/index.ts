import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ParsedLesson {
  title: string;
  description?: string;
  content?: string;
  video_url?: string;
  content_type: "video" | "audio" | "article" | "document" | "mixed";
  duration_minutes?: number;
  attachments?: { file_name: string; file_url: string }[];
}

interface ParsedModule {
  title: string;
  description?: string;
  external_id: string;
  lessons: ParsedLesson[];
}

interface ParsedTraining {
  title: string;
  description?: string;
  external_id: string;
  modules: ParsedModule[];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, training_url } = await req.json();
    
    const email = Deno.env.get("GETCOURSE_EMAIL");
    const password = Deno.env.get("GETCOURSE_PASSWORD");
    const firecrawlApiKey = Deno.env.get("FIRECRAWL_API_KEY");

    if (!email || !password) {
      return new Response(
        JSON.stringify({ success: false, error: "GetCourse credentials not configured" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!firecrawlApiKey) {
      return new Response(
        JSON.stringify({ success: false, error: "Firecrawl API key not configured" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Determine base URL from training_url or use default
    const baseUrl = training_url 
      ? new URL(training_url).origin 
      : "https://gorbova.getcourse.ru";

    console.log("Base URL:", baseUrl);

    // Step 1: Login to GetCourse
    console.log("Logging into GetCourse...");
    const loginResponse = await fetch(`${baseUrl}/cms/system/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        email,
        password,
        action: "processXd498",
      }),
      redirect: "manual",
    });

    // Extract cookies from response
    const setCookieHeaders = loginResponse.headers.getSetCookie?.() || 
      loginResponse.headers.get("set-cookie")?.split(",") || [];
    
    const cookies = setCookieHeaders
      .map(c => c.split(";")[0])
      .filter(Boolean)
      .join("; ");

    if (!cookies.includes("PHPSESSID")) {
      console.error("Login failed - no session cookie received");
      return new Response(
        JSON.stringify({ success: false, error: "Login failed - check credentials" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Login successful, got session cookies");

    if (action === "list_trainings") {
      // Step 2: Get list of trainings
      console.log("Fetching training list...");
      const trainingsPage = await fetch(`${baseUrl}/teach/control/stream`, {
        headers: { Cookie: cookies },
      });
      const trainingsHtml = await trainingsPage.text();

      // Parse trainings from HTML using Firecrawl for better extraction
      const scrapeResponse = await fetch("https://api.firecrawl.dev/v1/scrape", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${firecrawlApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          url: `${baseUrl}/teach/control/stream`,
          formats: ["html", "markdown"],
          headers: { Cookie: cookies },
        }),
      });

      const scrapeData = await scrapeResponse.json();
      
      // Extract training links from the page
      const trainings: { id: string; title: string; url: string }[] = [];
      const html = scrapeData.data?.html || trainingsHtml;
      
      // Parse training links (GetCourse structure)
      const trainingRegex = /href="\/teach\/control\/stream\/view\/id\/(\d+)[^"]*"[^>]*>\s*<[^>]+>\s*([^<]+)/gi;
      let match;
      while ((match = trainingRegex.exec(html)) !== null) {
        trainings.push({
          id: match[1],
          title: match[2].trim(),
          url: `${baseUrl}/teach/control/stream/view/id/${match[1]}`,
        });
      }

      // Alternative parsing if above didn't work
      if (trainings.length === 0) {
        const altRegex = /\/teach\/control\/stream\/view\/id\/(\d+)[^"]*"[^>]*title="([^"]+)"/gi;
        while ((match = altRegex.exec(html)) !== null) {
          trainings.push({
            id: match[1],
            title: match[2].trim(),
            url: `${baseUrl}/teach/control/stream/view/id/${match[1]}`,
          });
        }
      }

      console.log(`Found ${trainings.length} trainings`);

      return new Response(
        JSON.stringify({ success: true, trainings }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "parse_training" && training_url) {
      // Step 3: Parse a specific training
      console.log("Parsing training:", training_url);

      // Get training page with structure
      const trainingResponse = await fetch("https://api.firecrawl.dev/v1/scrape", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${firecrawlApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          url: training_url,
          formats: ["html", "markdown"],
          headers: { Cookie: cookies },
          waitFor: 2000,
        }),
      });

      const trainingData = await trainingResponse.json();
      const html = trainingData.data?.html || "";
      const markdown = trainingData.data?.markdown || "";

      // Extract training title
      const titleMatch = html.match(/<h1[^>]*>([^<]+)<\/h1>/i) || 
                         html.match(/class="training-title[^>]*>([^<]+)/i);
      const trainingTitle = titleMatch ? titleMatch[1].trim() : "Untitled Training";

      // Extract training ID
      const idMatch = training_url.match(/\/id\/(\d+)/);
      const trainingId = idMatch ? idMatch[1] : "unknown";

      // Parse modules and lessons
      const modules: ParsedModule[] = [];
      
      // GetCourse structure: modules are in sections, lessons are links
      const moduleRegex = /class="[^"]*module[^"]*"[^>]*>[\s\S]*?<[^>]+title[^>]*>([^<]+)[\s\S]*?(<div class="lessons[\s\S]*?<\/div>)/gi;
      const lessonRegex = /href="([^"]*lesson[^"]*\/id\/(\d+)[^"]*)"[^>]*>[\s\S]*?<[^>]+>([^<]+)/gi;
      
      // Simpler approach: extract all lesson links with their sections
      const sectionRegex = /<div[^>]*class="[^"]*(?:block|section|module)[^"]*"[^>]*>[\s\S]*?<h[23][^>]*>([^<]+)<\/h[23]>[\s\S]*?(<(?:div|ul)[^>]*class="[^"]*(?:lessons|items)[^"]*"[\s\S]*?<\/(?:div|ul)>)/gi;
      
      let sectionMatch;
      let moduleIndex = 0;
      
      while ((sectionMatch = sectionRegex.exec(html)) !== null) {
        const moduleTitle = sectionMatch[1].trim();
        const lessonsHtml = sectionMatch[2];
        const lessons: ParsedLesson[] = [];
        
        let lessonMatch;
        lessonRegex.lastIndex = 0;
        
        while ((lessonMatch = lessonRegex.exec(lessonsHtml)) !== null) {
          lessons.push({
            title: lessonMatch[3].trim(),
            content_type: "video", // Default, will be updated when parsing individual lessons
          });
        }
        
        if (lessons.length > 0 || moduleTitle) {
          modules.push({
            title: moduleTitle || `Модуль ${moduleIndex + 1}`,
            external_id: `module_${moduleIndex}`,
            lessons,
          });
          moduleIndex++;
        }
      }

      // If no modules found with structure, try to extract flat lesson list
      if (modules.length === 0) {
        const flatLessons: ParsedLesson[] = [];
        const flatLessonRegex = /href="([^"]*\/lesson[^"]*\/id\/(\d+)[^"]*)"[^>]*>(?:<[^>]+>)*([^<]+)/gi;
        
        let flatMatch;
        while ((flatMatch = flatLessonRegex.exec(html)) !== null) {
          flatLessons.push({
            title: flatMatch[3].trim(),
            content_type: "video",
          });
        }
        
        if (flatLessons.length > 0) {
          modules.push({
            title: trainingTitle,
            external_id: `module_0`,
            lessons: flatLessons,
          });
        }
      }

      const training: ParsedTraining = {
        title: trainingTitle,
        external_id: trainingId,
        modules,
      };

      console.log(`Parsed training: ${trainingTitle} with ${modules.length} modules`);

      return new Response(
        JSON.stringify({ success: true, training }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "parse_lesson") {
      const { lesson_url } = await req.json();
      
      if (!lesson_url) {
        return new Response(
          JSON.stringify({ success: false, error: "Lesson URL required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      console.log("Parsing lesson:", lesson_url);

      // Scrape lesson content
      const lessonResponse = await fetch("https://api.firecrawl.dev/v1/scrape", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${firecrawlApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          url: lesson_url,
          formats: ["html", "markdown"],
          headers: { Cookie: cookies },
          waitFor: 3000,
        }),
      });

      const lessonData = await lessonResponse.json();
      const html = lessonData.data?.html || "";
      const markdown = lessonData.data?.markdown || "";

      // Extract lesson title
      const titleMatch = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
      const title = titleMatch ? titleMatch[1].trim() : "Untitled Lesson";

      // Extract Kinescope video
      let video_url: string | undefined;
      const kinescopeMatch = html.match(/kinescope\.io\/(?:embed\/)?([a-zA-Z0-9]+)/i);
      if (kinescopeMatch) {
        video_url = `https://kinescope.io/embed/${kinescopeMatch[1]}`;
      }

      // Try YouTube
      if (!video_url) {
        const youtubeMatch = html.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]+)/i);
        if (youtubeMatch) {
          video_url = `https://www.youtube.com/embed/${youtubeMatch[1]}`;
        }
      }

      // Try Vimeo
      if (!video_url) {
        const vimeoMatch = html.match(/(?:player\.)?vimeo\.com\/(?:video\/)?(\d+)/i);
        if (vimeoMatch) {
          video_url = `https://player.vimeo.com/video/${vimeoMatch[1]}`;
        }
      }

      // Extract text content
      const contentMatch = html.match(/<div[^>]*class="[^"]*(?:lesson-content|content-text|text-block)[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
      const content = contentMatch ? contentMatch[1] : undefined;

      // Extract attachments
      const attachments: { file_name: string; file_url: string }[] = [];
      const attachmentRegex = /href="([^"]+)"[^>]*download[^>]*>([^<]+)|href="([^"]+\.(?:pdf|doc|docx|xls|xlsx|ppt|pptx|zip|rar))"[^>]*>([^<]+)/gi;
      let attachMatch;
      while ((attachMatch = attachmentRegex.exec(html)) !== null) {
        const url = attachMatch[1] || attachMatch[3];
        const name = (attachMatch[2] || attachMatch[4]).trim();
        if (url && name) {
          attachments.push({ file_name: name, file_url: url });
        }
      }

      // Determine content type
      let content_type: ParsedLesson["content_type"] = "article";
      if (video_url) {
        content_type = content ? "mixed" : "video";
      }

      const lesson: ParsedLesson = {
        title,
        content,
        video_url,
        content_type,
        attachments,
      };

      console.log(`Parsed lesson: ${title}, video: ${video_url ? "yes" : "no"}`);

      return new Response(
        JSON.stringify({ success: true, lesson }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: false, error: "Unknown action" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error in getcourse-content-scraper:", error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : "Unknown error" 
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
