План исправлений: bePaid Provider-Managed Subscriptions — Финальный PATCH-лист

Обнаруженные критические проблемы

ПРОБЛЕМА 1: Подпись webhook проверяется НЕПРАВИЛЬНО

Текущее состояние кода (bepaid-webhook/index.ts, строки 431-485, 517-612):
	1.	Код читает body правильно (bodyText = await req.text() на строке 518) — ОК
	2.	Код проверяет подпись по raw body (строка 561: verifyWebhookSignature(bodyText, signatureHeader, customPublicKey)) — ОК
	3.	НО: Используется захардкоженный BEPAID_PUBLIC_KEY (строки 420-428) как fallback — НЕЛЬЗЯ
	4.	НО: PEM wrapper НЕ нормализуется правильно — публичный ключ из БД может не содержать переносов строк по 64 символа

Факт из документации bePaid (строки 403-427):

В заголовке Content-Signature находится RSA цифровая подпись запроса.
Хэш вычисляется функцией SHA256.
Публичный ключ можно получить в личном кабинете.
При проверке подписи необходимо использовать тело полученного автоматического 
уведомления В ТОМ ВИДЕ, В КОТОРОМ ОНО ПОЛУЧЕНО (без сериализации/десериализации).

Проблема: Публичный ключ в integration_instances.config.public_key:
	•	Может храниться без PEM-header/footer
	•	Может храниться без переносов строк по 64 символа
	•	Текущий wrapper добавляет только header/footer, но не разбивает base64 по 64 символа

⸻

ПРОБЛЕМА 2: PII сохраняется в provider_webhook_orphans

Строки 586-593:

await supabase.from('provider_webhook_orphans').insert({
  provider: 'bepaid',
  provider_subscription_id: body?.id || body?.subscription?.id || null,
  provider_payment_id: body?.transaction?.uid || body?.last_transaction?.uid || null,
  reason: signatureSkipReason || 'invalid_signature',
  raw_data: body,  // <-- ПОЛНЫЙ BODY С PII/КАРТАМИ!
  processed: false,
});

Аналогично в строках 734-741, 778-786, 1030-1037.

⸻

ПРОБЛЕМА 3: Неверное поведение при отсутствии public_key / секрета

Текущее поведение допускает “skip signature check / accept all” при отсутствии секрета — это НЕЛЬЗЯ.

Правило:
	•	Нет public_key в integration_instances.config (пустой/битый/отсутствует) → 500 misconfig + alert админам + orphan (safe subset)
	•	Нет Authorization: Basic ... И нет Content-Signature → если нет secret_key для BasicAuth → 500 misconfig + alert + orphan (safe subset)
	•	Есть public_key, но подпись невалидна / BasicAuth невалиден → 401 unauthorized + orphan (safe subset)

⸻

ПРОБЛЕМА 4: bepaid-create-subscription-checkout — maybeSingle() при дубликатах

Строки 114-118:

const { data: profileByEmail } = await supabase
  .from('profiles')
  .select('user_id, id')
  .ilike('email', customerEmail.trim())
  .maybeSingle(); // <-- Падает при >1 строки!

Правило: при коллизии email → 409 + остановка (ничего не создаём автоматически).

⸻

Детальный план исправлений

PATCH-1.0: Верификация webhook — порядок проверки (BasicAuth + подпись)

Файл: supabase/functions/bepaid-webhook/index.ts

Единая логика (обязательная):
	1.	Читать RAW body: const bodyText = await req.text()
	2.	Парсить JSON body (try/catch)
	3.	Получить конфиг интеграции: shop_id, secret_key, public_key из integration_instances.config
	4.	Если в заголовке есть Authorization: Basic ... → проверить shop_id:secret_key
	•	если совпало → signatureVerified = true
	5.	Иначе → проверять RSA подпись по Content-Signature и RAW body через public_key
	6.	Если не прошли ни BasicAuth, ни подпись → 401 + orphan (safe subset)
	7.	Если конфиг не позволяет проверить (нет public_key для RSA и нет secret_key для BasicAuth) → 500 + alert + orphan (safe subset)

⸻

PATCH-1.1: Нормализация public_key в PEM-формат

Файл: supabase/functions/bepaid-webhook/index.ts

Добавить функцию normalizePemPublicKey:

function normalizePemPublicKey(rawKey: string | null | undefined): string | null {
  if (!rawKey) return null;

  let key = rawKey.trim();

  // Remove existing PEM headers/footers if present
  key = key
    .replace(/-----BEGIN PUBLIC KEY-----/g, '')
    .replace(/-----END PUBLIC KEY-----/g, '')
    .replace(/[\r\n\s]/g, ''); // Remove all whitespace

  if (key.length === 0) return null;

  // Split base64 into 64-character lines
  const lines: string[] = [];
  for (let i = 0; i < key.length; i += 64) {
    lines.push(key.substring(i, i + 64));
  }

  // Reconstruct PEM
  return `-----BEGIN PUBLIC KEY-----\n${lines.join('\n')}\n-----END PUBLIC KEY-----`;
}


⸻

PATCH-1.2: Убрать BEPAID_PUBLIC_KEY захардкоженный (полностью)

Удалить строки 420-428 (константа BEPAID_PUBLIC_KEY).
Запрещены любые fallback-ключи в коде.

⸻

PATCH-1.3: verifyWebhookSignature — без fallback и без логирования ключа

Изменить функцию verifyWebhookSignature (строки 431-485):
	•	Убрать fallback на BEPAID_PUBLIC_KEY
	•	Убрать логирование publicKeyPem.substring(...)

async function verifyWebhookSignature(
  body: string,
  signature: string | null,
  publicKeyPem: string
): Promise<boolean> {
  if (!signature) return false;

  try {
    // ... текущая RSA-SHA256 проверка без изменений ...
  } catch (error) {
    console.error('RSA signature verification error:', error);
    return false;
  }
}


⸻

PATCH-1.4: Поведение при отсутствии public_key (500 + alert + orphan safe subset)

Изменить участок перед RSA-проверкой (около строки 556-580):

const rawPublicKey = bepaidInstance?.config?.public_key;
const normalizedPublicKey = normalizePemPublicKey(rawPublicKey);

if (!normalizedPublicKey) {
  // 500 misconfig + alert + orphan (safe subset)
  await supabase.from('provider_webhook_orphans').insert({
    provider: 'bepaid',
    provider_subscription_id: body?.id || body?.subscription?.id || null,
    provider_payment_id: body?.transaction?.uid || body?.last_transaction?.uid || null,
    reason: 'missing_public_key',
    raw_data: {
      id: body?.id,
      state: body?.state,
      event: body?.event,
      tracking_id: body?.tracking_id || rawTrackingIdEarly,
      last_transaction: body?.last_transaction
        ? { uid: body.last_transaction.uid, status: body.last_transaction.status }
        : null,
      plan: body?.plan
        ? { id: body.plan.id, amount: body.plan.amount, currency: body.plan.currency }
        : null,
    },
    processed: false,
  });

  try {
    await fetch(`${supabaseUrl}/functions/v1/telegram-notify-admins`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseServiceKey}`,
      },
      body: JSON.stringify({
        message: '🚨 КРИТИЧНО: Webhook bePaid отклонён — отсутствует/битый public_key в интеграции.',
        source: 'bepaid-webhook-misconfig',
      }),
    });
  } catch (_) {}

  return new Response(
    JSON.stringify({ error: 'Server misconfiguration: missing public_key' }),
    { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}


⸻

PATCH-1.5: Поведение при отсутствии секретов для BasicAuth (500 + alert + orphan safe subset)

Если нет Authorization: Basic ... И нет Content-Signature, а secret_key пустой/отсутствует:

const authHeader = req.headers.get('Authorization');
const signatureHeader = req.headers.get('Content-Signature');

if (!authHeader?.startsWith('Basic ') && !signatureHeader) {
  const secretKey = bepaidInstance?.config?.secret_key;

  if (!secretKey) {
    await supabase.from('provider_webhook_orphans').insert({
      provider: 'bepaid',
      provider_subscription_id: body?.id || body?.subscription?.id || null,
      provider_payment_id: body?.transaction?.uid || body?.last_transaction?.uid || null,
      reason: 'missing_secret_key',
      raw_data: {
        id: body?.id,
        state: body?.state,
        event: body?.event,
        tracking_id: body?.tracking_id || rawTrackingIdEarly,
        last_transaction: body?.last_transaction
          ? { uid: body.last_transaction.uid, status: body.last_transaction.status }
          : null,
        plan: body?.plan
          ? { id: body.plan.id, amount: body.plan.amount, currency: body.plan.currency }
          : null,
      },
      processed: false,
    });

    try {
      await fetch(`${supabaseUrl}/functions/v1/telegram-notify-admins`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseServiceKey}`,
        },
        body: JSON.stringify({
          message: '🚨 КРИТИЧНО: Webhook bePaid отклонён — нет secret_key и нет Content-Signature (misconfig).',
          source: 'bepaid-webhook-misconfig',
        }),
      });
    } catch (_) {}

    return new Response(
      JSON.stringify({ error: 'Server misconfiguration: missing secret_key/signature' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}


⸻

PATCH-1.6: Safe subset для provider_webhook_orphans (во ВСЕХ местах)

Заменить во ВСЕХ местах вставки в orphans (строки 586-593, 734-741, 778-786, 1030-1037):

raw_data: {
  id: body?.id,
  state: body?.state,
  event: body?.event,
  tracking_id: body?.tracking_id || rawTrackingIdEarly,
  last_transaction: body?.last_transaction ? {
    uid: body.last_transaction.uid,
    status: body.last_transaction.status,
  } : null,
  plan: body?.plan ? {
    id: body.plan.id,
    amount: body.plan.amount,
    currency: body.plan.currency,
  } : null,
},


⸻

PATCH-1.7: invalid_signature / unauthorized → 401 + orphan (safe subset)

Если BasicAuth не совпал и RSA-подпись не прошла — возвращать:

return new Response(JSON.stringify({ error: 'Invalid webhook signature' }), {
  status: 401,
  headers: { ...corsHeaders, 'Content-Type': 'application/json' },
});


⸻

PATCH-1.8: Идемпотентность по transaction.uid (уже есть, оставить)

Строки 754-766 — оставить как есть.

⸻

PATCH-2: bepaid-create-subscription-checkout — коллизии email (409 + остановка)

Файл: supabase/functions/bepaid-create-subscription-checkout/index.ts

Заменить блок с maybeSingle():

// БЫЛО:
const { data: profileByEmail } = await supabase
  .from('profiles')
  .select('user_id, id')
  .ilike('email', customerEmail.trim())
  .maybeSingle();

// СТАЛО:
const { data: profilesByEmail, error: profilesError } = await supabase
  .from('profiles')
  .select('user_id, id')
  .ilike('email', customerEmail.trim());

if (profilesError) {
  return new Response(JSON.stringify({ error: 'profiles lookup failed' }), {
    status: 500,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// Коллизия email → 409 + остановка
if (profilesByEmail && profilesByEmail.length > 1) {
  return new Response(JSON.stringify({
    error: 'Multiple profiles found for this email. Please contact support.',
    code: 'EMAIL_COLLISION',
  }), {
    status: 409,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

const profileByEmail = profilesByEmail?.[0] || null;

if (profileByEmail?.user_id) {
  userId = profileByEmail.user_id;
  profileId = profileByEmail.id;
} else {
  // Create new user...
}


⸻

PATCH-3: PaymentDialog — условие !savedCard (проверка)

Файл: src/components/payment/PaymentDialog.tsx
	•	handlePayment: условие должно быть без !savedCard:

if (paymentFlowType === 'provider_managed' && isSubscription && !isTrial) {

	•	UI RadioGroup: условие показа тоже без !savedCard:

{isSubscription && !isTrial && ( ... )}


⸻

PATCH-4: PaymentMethods — UI уже улучшен (оставить)
	•	Пояснения MIT vs bePaid
	•	Tooltip “Изменить карту”
	•	Показ product + tariff

⸻

Технический раздел: Точные строки для изменений

bepaid-webhook/index.ts

Действие	Строки	Описание
Добавить функцию	После 416	normalizePemPublicKey()
Удалить	420-428	Захардкоженный BEPAID_PUBLIC_KEY
Изменить	431-485	verifyWebhookSignature(..., publicKeyPem: string) без fallback и без логов ключа
Добавить	~556-610	(1) порядок проверки BasicAuth/Signature (2) 500 misconfig при отсутствии public_key/secret_key
Изменить	586-593	Safe subset в raw_data
Изменить	734-741	Safe subset в raw_data
Изменить	778-786	Safe subset в raw_data
Изменить	1030-1037	Safe subset в raw_data
Добавить	где invalid_signature	401 unauthorized + orphan safe subset

bepaid-create-subscription-checkout/index.ts

Действие	Строки	Описание
Изменить	112-146	Убрать maybeSingle(), добавить 409 при коллизии email


⸻

DoD (Definition of Done)

1) SQL-пруфы

-- Новые orphans должны иметь safe raw_data (без card/holder/email)
SELECT id, reason,
       raw_data->>'id' as sub_id,
       raw_data->>'state' as state,
       raw_data->'last_transaction'->>'uid' as tx_uid,
       length(cast(raw_data as text)) as raw_size
FROM provider_webhook_orphans
ORDER BY created_at DESC LIMIT 10;

-- Коллизии email должны возвращать 409 (проверка вручную по логам/HTTP)

2) Поведение статусов
	•	Нет public_key → 500 + alert + orphan safe subset
	•	Коллизия email → 409 + остановка
	•	Невалидная подпись/BasicAuth → 401 + orphan safe subset

3) Ожидаемый результат в БД (после валидного webhook)
	•	provider_subscriptions.state = 'active'
	•	orders_v2.status = 'paid'
	•	subscriptions_v2.status = 'active', billing_type = 'provider_managed'
	•	payments_v2 создан с provider_payment_id = {transaction.uid}

⸻

Порядок выполнения
	1.	PATCH-1.0 — порядок проверки BasicAuth/Signature
	2.	PATCH-1.1 — normalize PEM
	3.	PATCH-1.2 — убрать BEPAID_PUBLIC_KEY
	4.	PATCH-1.3 — verifyWebhookSignature без fallback и без логов ключа
	5.	PATCH-1.4/1.6 — safe subset во всех orphans
	6.	PATCH-1.4/1.5 — 500 misconfig + alert при missing public_key/secret_key
	7.	PATCH-1.7 — 401 unauthorized при invalid signature
	8.	PATCH-2 — 409 при коллизии email
	9.	PATCH-3 — проверить UI/handlePayment без !savedCard
	10.	Deploy → тест webhook → SQL/логи/UI-пруфы