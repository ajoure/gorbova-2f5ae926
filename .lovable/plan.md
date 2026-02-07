
# План: Интеграция анализа аудитории с ботом Олегом + автообновление

## Обнаруженные проблемы

### Проблема 1: Анализ завершается таймаутом (shutdown)
**Причина:** Функция `analyze-audience` обрабатывает 4 батча по 800 сообщений, что занимает >60 секунд. Edge Function имеет лимит по времени, и после обработки 4-го батча происходит shutdown до сохранения результатов.

**Логи показывают:**
```
23:57:21 - Analyzing batch 1/4
23:58:23 - Analyzing batch 2/4
23:59:10 - Analyzing batch 3/4
00:00:02 - Analyzing batch 4/4
00:00:39 - shutdown
```

### Проблема 2: Нет связи инсайтов с ботом Олегом
**Текущее состояние:** Инсайты хранятся в `audience_insights`, но бот Олег их НЕ использует. В `buildSystemPrompt()` нет раздела с информацией об аудитории.

### Проблема 3: Нет автоматического обновления
**Текущее состояние:** Нет cron-задачи для `analyze-audience`. Анализ запускается только вручную.

---

## Решение

### Фаза 1: Исправить таймаут анализа

**Подход:** Использовать `google/gemini-2.5-flash` вместо `gemini-2.5-pro` — он в 3-5 раз быстрее при сопоставимом качестве для структурированного извлечения данных.

```text
Изменение в analyze-audience/index.ts:
- Строка 178: model: "google/gemini-2.5-flash" (вместо pro)
- Добавить timeout на fetch запросы (30 сек)
- Уменьшить BATCH_SIZE_FOR_AI до 500 сообщений
```

---

### Фаза 2: Создать динамический промпт-пакет с инсайтами

**Новый пакет:** `audience_insights_dynamic` — автоматически генерируемый на основе данных из `audience_insights`.

**Структура контента:**
```text
== ЗНАНИЕ АУДИТОРИИ (автообновляется) ==

БОЛИ КЛИЕНТОВ:
1. Страх ошибок и административной ответственности
   - Клиенты боятся допустить ошибку и получить штраф
   - Примеры: "у меня знакомый ИП платит все подряд по таким письмам"
   - Как использовать: проявляй эмпатию, предлагай защиту через экспертизу клуба

2. Страх при взаимодействии с госорганами
   - Вызовы, запросы, блокировки вызывают панику
   - Как использовать: позиционируй клуб как "безопасное место"

ИНТЕРЕСЫ:
1. Готовые шаблоны и инструкции
2. Разбор кейсов и экспертная оценка
...

ВОЗРАЖЕНИЯ И СОМНЕНИЯ:
...

КАК ПРИМЕНЯТЬ:
- При продаже: акцентируй на решении конкретных болей
- При поддержке: проявляй понимание стресса
- При возражениях: используй примеры из реальных отзывов
```

**Миграция БД:**
```sql
INSERT INTO ai_prompt_packages (
  code, name, description, category, content, is_system, enabled
) VALUES (
  'audience_insights',
  'Знание аудитории (авто)',
  'Автоматически обновляемый пакет с инсайтами целевой аудитории',
  'sales',
  '[Заполняется автоматически из audience_insights]',
  true,
  true
);
```

---

### Фаза 3: Функция генерации промпт-пакета из инсайтов

**Новая функция или часть существующей:** После успешного анализа — автоматически обновлять контент пакета `audience_insights`.

**Добавить в `analyze-audience/index.ts` (после сохранения инсайтов):**
```typescript
// Генерация контента для промпт-пакета
const packageContent = generateAudienceInsightsPrompt(mergedInsights, finalSummary);

// Обновить или создать пакет
await supabase.from('ai_prompt_packages')
  .upsert({
    code: 'audience_insights',
    name: 'Знание аудитории (авто)',
    description: `Автообновление: ${new Date().toISOString().split('T')[0]}. ${mergedInsights.length} инсайтов.`,
    category: 'sales',
    content: packageContent,
    is_system: true,
    enabled: true,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'code' });
```

**Функция генерации:**
```typescript
function generateAudienceInsightsPrompt(insights: AudienceInsight[], summary: string): string {
  const painPoints = insights.filter(i => i.insight_type === 'pain_point');
  const interests = insights.filter(i => i.insight_type === 'interest');
  const objections = insights.filter(i => i.insight_type === 'objection');
  const questions = insights.filter(i => i.insight_type === 'question');
  
  return `== ЗНАНИЕ АУДИТОРИИ ==
(Данные автоматически обновляются на основе анализа ${summary.substring(0, 100)}...)

=== ГЛАВНЫЕ БОЛИ КЛИЕНТОВ ===
${painPoints.slice(0, 5).map((p, i) => 
  `${i+1}. ${p.title}
   - ${p.description}
   - Примеры: "${(p.examples || []).slice(0, 2).join('", "')}"
   - Как использовать в продажах: акцентируй решение этой боли через клуб`
).join('\n\n')}

=== ЧТО ИНТЕРЕСУЕТ АУДИТОРИЮ ===
${interests.slice(0, 5).map((p, i) => 
  `${i+1}. ${p.title}: ${p.description}`
).join('\n')}

=== ЧАСТЫЕ ВОЗРАЖЕНИЯ ===
${objections.slice(0, 3).map((p, i) => 
  `${i+1}. ${p.title}
   - Ответ: [используй факты из примеров клуба]`
).join('\n')}

=== ЧАСТО ЗАДАВАЕМЫЕ ВОПРОСЫ ===
${questions.slice(0, 5).map((p, i) => 
  `${i+1}. ${p.title}`
).join('\n')}

=== КАК ПРИМЕНЯТЬ ===
- При ПРОДАЖЕ: связывай продукт с конкретной болью клиента
- При ПОДДЕРЖКЕ: проявляй эмпатию к стрессу и страху
- При ВОЗРАЖЕНИЯХ: используй реальные примеры успешных клиентов
- При НЕУВЕРЕННОСТИ: направляй к эксперту (Катерине)`;
}
```

---

### Фаза 4: Подключить пакет к боту Олегу

**Изменение в `telegram-ai-support/index.ts`:**

В `buildSystemPrompt()` добавить пакет `audience_insights` в список активных по умолчанию для режима sales:

```typescript
// В PRESET_TO_PACKAGE или отдельной логике:
// Если settings.toggles.sales_enabled — добавить 'audience_insights' в effectivePackages
if (settings.toggles.sales_enabled) {
  effectivePackages.push('audience_insights');
}
```

---

### Фаза 5: Cron-задача для ежедневного обновления

**Расписание:** 3:00 UTC (= 3:00 по Лондону зимой, 4:00 летом)

**Миграция SQL:**
```sql
SELECT cron.schedule(
  'audience-analysis-nightly',
  '0 3 * * *',  -- каждый день в 03:00 UTC
  $$
  SELECT net.http_post(
    url := 'https://hdjgkjceownmmnrqqtuz.supabase.co/functions/v1/analyze-audience',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'
    ),
    body := '{"force": true, "source": "cron-nightly"}'::jsonb
  ) AS request_id;
  $$
);
```

---

### Фаза 6: UI — индикатор связи с ботом

**Изменение в `AdminMarketingInsights.tsx`:**

Добавить информационную карточку:

```tsx
<Card className="border-green-200 bg-green-50">
  <CardContent className="pt-4">
    <div className="flex items-center gap-2">
      <Bot className="h-5 w-5 text-green-600" />
      <span className="font-medium">Связь с Олегом</span>
      <Badge variant="outline" className="bg-green-100">Активна</Badge>
    </div>
    <p className="text-sm text-muted-foreground mt-2">
      Инсайты автоматически передаются боту Олегу для использования в продажах.
      Следующее обновление: 03:00 UTC
    </p>
  </CardContent>
</Card>
```

---

## Технические детали

| Компонент | Файл | Изменения |
|-----------|------|-----------|
| Edge Function | `analyze-audience/index.ts` | Переход на flash модель, +генерация промпт-пакета |
| Edge Function | `telegram-ai-support/index.ts` | +audience_insights в effectivePackages для sales |
| Миграция | SQL | +cron job, +audience_insights package |
| UI | `AdminMarketingInsights.tsx` | +индикатор связи с ботом |

**Оценка объёма:** ~150 строк Edge Function, ~50 строк SQL, ~30 строк UI

---

## Критерии приёмки (DoD)

| Проверка | Ожидаемый результат |
|----------|---------------------|
| Анализ завершается | Нет shutdown, все батчи обработаны |
| Пакет `audience_insights` | Создан и содержит структурированный контент |
| Бот Олег | В режиме продаж использует инсайты аудитории |
| Cron job | Задача `audience-analysis-nightly` существует и активна |
| UI | Показывает статус связи с ботом |
| SQL-proof | `SELECT code, updated_at FROM ai_prompt_packages WHERE code = 'audience_insights'` |
