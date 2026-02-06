ЖЁСТКИЕ ПРАВИЛА ИСПОЛНЕНИЯ ДЛЯ LOVABLE.DEV
1) Ничего не ломать и не трогать лишнее. Только add-only / минимальный diff.
2) Dry-run → execute для любых массовых/опасных операций. STOP-предохранители обязательны.
3) Никаких хардкод-UUID/токенов/секретов. Никаких внутренних ID/таблиц в ответах пользователю.
4) Безопасность: no-PII в логах/промптах. Доступ только к данным самого пользователя. Service role only где нужно.
5) Финал: отчёт с пруфами (UI-скрины из 7500084@gmail.com + логи + SQL-check + diff-summary).
6) “SYSTEM ACTOR Proof” обязателен: реальные записи в audit_logs с actor_type='system', actor_user_id=NULL, actor_label заполнен.

ТЗ: AI-КОНТАКТ-ЦЕНТР TELEGRAM — БОТ “ОЛЕГ” (Urban Online)

0) ЦЕЛЬ
Сделать Telegram-бота “Олег” для private DM, который закрывает:
- Support (поддержка)
- Sales (продажи/продление/апсейл)
- Smalltalk (общение + возврат к прошлой теме)
- Handoff (эскалация на человека)

Интеграция через существующую Edge Function:
- supabase/functions/telegram-webhook/index.ts
Новая Edge Function:
- supabase/functions/telegram-ai-support/index.ts
Настройки через UI админки Contact Center (Oleg Settings).

1) ТРИГГЕРЫ / КОГДА ВЫЗЫВАТЬ AI
AI включается только если:
- chatType === 'private'
- msg.text существует
- msg.text НЕ начинается с '/'
- нет активного handoff (ai_handoffs.status IN ('open','waiting_human'))
- auto_reply_enabled=true для данного bot_id
- не превышены rate limits
Команды (/start,/help,/buy) не трогать.

2) КЛЮЧЕВЫЕ ТРЕБОВАНИЯ (безопасность/качество)
2.1 Идемпотентность: не отвечать дважды на один Telegram message_id.
2.2 No-PII: не логировать и не включать в промпт email/телефон/адрес/платёжные данные.
2.3 Изоляция данных: tools возвращают только “свои” данные по telegram_user_id/user_id.
2.4 No internal: не показывать UUID, токены, названия таблиц, конфиги, edge routes.
2.5 Режим “человек подключён”: при handoff waiting_human/open бот НЕ продолжает “умничать”.

3) ФАЗА 1 — БАЗА ДАННЫХ (МИГРАЦИИ)

ВАЖНОЕ УТОЧНЕНИЕ ПО ТИПАМ:
- bot_id: использовать тот тип, который реально в проекте: если telegram_bots.id = uuid → uuid. Если text → text.
НЕЛЬЗЯ смешивать: в запросах и настройках bot_id должен быть одного типа везде.

3.1 telegram_ai_conversations (диалоги/контекст)
Добавить поддержку идемпотентности без “processed_message_ids в json” (чтобы не раздувать json):
- либо отдельная таблица telegram_ai_processed_messages
- либо уникальная запись outbox по message_id

Рекомендуемая схема:
A) telegram_ai_conversations (контекст)
```sql
CREATE TABLE telegram_ai_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_user_id bigint NOT NULL,
  user_id uuid REFERENCES auth.users(id),
  bot_id uuid REFERENCES telegram_bots(id),
  messages jsonb DEFAULT '[]'::jsonb,
  last_message_at timestamptz DEFAULT now(),
  last_topics_summary text,
  last_intent text,
  last_confidence numeric,
  user_tone_preference jsonb,
  style_detected jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX idx_tg_ai_conv_user_bot ON telegram_ai_conversations(telegram_user_id, bot_id);

ALTER TABLE telegram_ai_conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role only" ON telegram_ai_conversations FOR ALL TO service_role USING (true);