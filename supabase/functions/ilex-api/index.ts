import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// User agents for human-like behavior
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0',
];

// Random delay to simulate human behavior (2-5 seconds)
async function humanDelay(min = 2000, max = 5000): Promise<void> {
  const delay = min + Math.random() * (max - min);
  console.log(`Human delay: ${Math.round(delay)}ms`);
  await new Promise(r => setTimeout(r, delay));
}

// Get random user agent
function getRandomUserAgent(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

// Get common headers for requests
function getHeaders(sessionCookie?: string): Record<string, string> {
  const headers: Record<string, string> = {
    'User-Agent': getRandomUserAgent(),
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
    'Accept-Encoding': 'gzip, deflate, br',
    'Connection': 'keep-alive',
    'Upgrade-Insecure-Requests': '1',
    'Cache-Control': 'max-age=0',
  };
  
  if (sessionCookie) {
    headers['Cookie'] = sessionCookie;
  }
  
  return headers;
}

// Authenticate and get session cookie
async function authenticate(login: string, password: string): Promise<{ success: boolean; sessionCookie?: string; error?: string }> {
  try {
    console.log('Attempting authentication...');
    
    // First, get the login page to get any required cookies/tokens
    await humanDelay(1000, 2000);
    
    const loginPageResponse = await fetch('https://ilex-private.ilex.by/login', {
      method: 'GET',
      headers: getHeaders(),
    });
    
    const loginPageCookies = loginPageResponse.headers.get('set-cookie') || '';
    console.log('Got login page, cookies:', loginPageCookies ? 'present' : 'none');
    
    await humanDelay();
    
    // Attempt login
    const loginResponse = await fetch('https://ilex-private.ilex.by/api/auth/login', {
      method: 'POST',
      headers: {
        ...getHeaders(loginPageCookies),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ login, password }),
    });
    
    if (!loginResponse.ok) {
      console.error('Login failed with status:', loginResponse.status);
      return { success: false, error: `Ошибка авторизации: ${loginResponse.status}` };
    }
    
    const setCookie = loginResponse.headers.get('set-cookie');
    if (setCookie) {
      console.log('Authentication successful, got session cookie');
      return { success: true, sessionCookie: setCookie };
    }
    
    // Try to get session from response body
    const responseText = await loginResponse.text();
    console.log('Login response:', responseText.substring(0, 200));
    
    return { success: true, sessionCookie: loginPageCookies };
  } catch (error) {
    console.error('Authentication error:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Ошибка подключения' };
  }
}

// Check connection status using Firecrawl
async function checkConnection(): Promise<{ online: boolean; message: string }> {
  try {
    const firecrawlApiKey = Deno.env.get('FIRECRAWL_API_KEY');
    
    if (!firecrawlApiKey) {
      return { online: false, message: 'Firecrawl API не настроен' };
    }
    
    console.log('Checking iLex connection via Firecrawl...');
    
    const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${firecrawlApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: 'https://ilex-private.ilex.by',
        formats: ['markdown'],
        onlyMainContent: true,
        waitFor: 2000,
      }),
    });
    
    if (response.ok) {
      const data = await response.json();
      if (data.success) {
        return { online: true, message: 'Подключение успешно' };
      }
    }
    
    return { online: false, message: 'Сайт недоступен' };
  } catch (error) {
    console.error('Connection check error:', error);
    return { online: false, message: error instanceof Error ? error.message : 'Ошибка проверки' };
  }
}

// Fetch document content using Firecrawl
async function fetchDocument(url: string): Promise<{ success: boolean; content?: string; title?: string; html?: string; error?: string }> {
  try {
    const firecrawlApiKey = Deno.env.get('FIRECRAWL_API_KEY');
    
    if (!firecrawlApiKey) {
      return { success: false, error: 'Firecrawl API не настроен' };
    }
    
    // Format URL
    let formattedUrl = url.trim();
    if (!formattedUrl.startsWith('http://') && !formattedUrl.startsWith('https://')) {
      formattedUrl = `https://ilex-private.ilex.by${formattedUrl.startsWith('/') ? '' : '/'}${formattedUrl}`;
    }
    
    console.log('Fetching document:', formattedUrl);
    
    await humanDelay();
    
    const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${firecrawlApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: formattedUrl,
        formats: ['markdown', 'html'],
        onlyMainContent: false,
        waitFor: 3000,
      }),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Firecrawl error:', errorText);
      return { success: false, error: `Ошибка получения документа: ${response.status}` };
    }
    
    const data = await response.json();
    
    if (!data.success) {
      return { success: false, error: data.error || 'Не удалось получить документ' };
    }
    
    const content = data.data?.markdown || data.markdown || '';
    const html = data.data?.html || data.html || '';
    const title = data.data?.metadata?.title || data.metadata?.title || 'Документ';
    
    return { success: true, content, title, html };
  } catch (error) {
    console.error('Fetch document error:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Ошибка получения документа' };
  }
}

// Search for documents
async function searchDocuments(query: string): Promise<{ success: boolean; results?: any[]; error?: string }> {
  try {
    const firecrawlApiKey = Deno.env.get('FIRECRAWL_API_KEY');
    
    if (!firecrawlApiKey) {
      return { success: false, error: 'Firecrawl API не настроен' };
    }
    
    console.log('Searching iLex for:', query);
    
    await humanDelay();
    
    // Use Firecrawl search with site restriction
    const response = await fetch('https://api.firecrawl.dev/v1/search', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${firecrawlApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: `site:ilex-private.ilex.by ${query}`,
        limit: 20,
        lang: 'ru',
        country: 'BY',
      }),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Firecrawl search error:', errorText);
      return { success: false, error: `Ошибка поиска: ${response.status}` };
    }
    
    const data = await response.json();
    
    if (!data.success) {
      return { success: false, error: data.error || 'Поиск не дал результатов' };
    }
    
    const results = (data.data || []).map((item: any) => ({
      url: item.url,
      title: item.title || 'Без названия',
      description: item.description || '',
    }));
    
    return { success: true, results };
  } catch (error) {
    console.error('Search error:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Ошибка поиска' };
  }
}

// Extract text from HTML for clean document export
function extractCleanText(html: string): string {
  // Remove script and style tags
  let text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
  text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
  text = text.replace(/<head[^>]*>[\s\S]*?<\/head>/gi, '');
  
  // Convert common tags to newlines
  text = text.replace(/<\/?(p|div|br|h[1-6]|li|tr)[^>]*>/gi, '\n');
  text = text.replace(/<\/?(td|th)[^>]*>/gi, '\t');
  
  // Remove remaining tags
  text = text.replace(/<[^>]+>/g, '');
  
  // Decode HTML entities
  text = text.replace(/&nbsp;/g, ' ');
  text = text.replace(/&amp;/g, '&');
  text = text.replace(/&lt;/g, '<');
  text = text.replace(/&gt;/g, '>');
  text = text.replace(/&quot;/g, '"');
  text = text.replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(dec));
  
  // Clean up whitespace
  text = text.replace(/\t+/g, '\t');
  text = text.replace(/[ ]+/g, ' ');
  text = text.replace(/\n\s*\n/g, '\n\n');
  text = text.trim();
  
  return text;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  
  try {
    const { action, ...params } = await req.json();
    
    console.log('iLex API action:', action);
    
    let result: any;
    
    switch (action) {
      case 'check_connection':
        result = await checkConnection();
        break;
        
      case 'fetch_document':
        if (!params.url) {
          return new Response(
            JSON.stringify({ success: false, error: 'URL обязателен' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        result = await fetchDocument(params.url);
        if (result.success && result.html) {
          result.cleanText = extractCleanText(result.html);
        }
        break;
        
      case 'search':
        if (!params.query) {
          return new Response(
            JSON.stringify({ success: false, error: 'Запрос обязателен' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        result = await searchDocuments(params.query);
        break;
        
      case 'authenticate':
        const login = params.login || Deno.env.get('ILEX_LOGIN');
        const password = params.password || Deno.env.get('ILEX_PASSWORD');
        
        if (!login || !password) {
          return new Response(
            JSON.stringify({ success: false, error: 'Логин и пароль обязательны' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        
        result = await authenticate(login, password);
        break;
        
      default:
        return new Response(
          JSON.stringify({ success: false, error: `Неизвестное действие: ${action}` }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
    
    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('iLex API error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Внутренняя ошибка' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
