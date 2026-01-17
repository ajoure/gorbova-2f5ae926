-- Add iLex Private as a news source with authentication config
INSERT INTO news_sources (name, url, country, category, is_active, priority, scrape_config)
VALUES (
  'iLex Private',
  'https://ilex-private.ilex.by/',
  'by',
  'npa',
  true,
  80,
  '{"requires_auth": true, "auth_type": "form_login", "login_url": "/public/service-login"}'::jsonb
);