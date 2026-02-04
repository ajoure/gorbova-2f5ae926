

# План: Glassmorphism редизайн страницы урока и блоков квеста

## Проблема

Редизайн glassmorphism был применён только к:
- ✅ `BusinessTraining.tsx` — лендинг продукта
- ✅ `BusinessTrainingContent.tsx` — главная страница курса

**Страницы уроков НЕ затронуты:**
- ❌ `LibraryLesson.tsx` — страница урока
- ❌ `KvestLessonView.tsx` — квест-режим с шагами
- ❌ Компоненты блоков: `QuizSurveyBlock`, `RoleDescriptionBlock`, `DiagnosticTableBlock`, `SequentialFormBlock`, `VideoUnskippableBlock`

## Текущий стиль блоков

На скриншоте видно:
- Обычные белые `Card` без blur-эффектов
- Стандартные radio-buttons без glass-эффекта
- Progress bar без усиленного стиля
- Заголовки без градиентных акцентов

## Цели редизайна

1. **Progress header** — стеклянный sticky-заголовок с blur
2. **Step indicators** — стеклянные кнопки шагов
3. **Block cards** — glassmorphism-карточки для каждого блока
4. **Quiz options** — стеклянные варианты ответов
5. **Role description** — стеклянная карточка с описанием роли
6. **Navigation buttons** — gradient + glow эффекты

## Файлы для редизайна

| Файл | Изменения |
|------|-----------|
| `src/components/lesson/KvestLessonView.tsx` | Progress header, step indicators, block containers, navigation |
| `src/pages/LibraryLesson.tsx` | Обёртка страницы, breadcrumb, header |
| `src/components/admin/lesson-editor/blocks/QuizSurveyBlock.tsx` | Студенческий режим: опции, результаты |
| `src/components/admin/lesson-editor/blocks/RoleDescriptionBlock.tsx` | Карточка роли, badge, кнопка |

## Детальные изменения

### 1. KvestLessonView.tsx — Progress Header

**Было (строка 393):**
```tsx
<Card className="bg-gradient-to-r from-primary/5 to-primary/10 border-primary/20 sticky top-0 z-10">
```

**Станет:**
```tsx
<div 
  className="sticky top-0 z-10 rounded-2xl backdrop-blur-2xl border border-primary/30 shadow-xl overflow-hidden"
  style={{
    background: "linear-gradient(135deg, hsl(var(--primary) / 0.08), hsl(var(--primary) / 0.03))",
    boxShadow: "0 12px 40px hsl(var(--primary) / 0.15), inset 0 1px 0 hsl(0 0% 100% / 0.2)"
  }}
>
  {/* Decorative orb */}
  <div className="absolute -top-16 -right-16 w-48 h-48 bg-primary/20 rounded-full blur-3xl pointer-events-none" />
  ...
</div>
```

### 2. KvestLessonView.tsx — Step Indicators

**Было (строка 411-435):**
```tsx
<button className={cn(
  "w-7 h-7 rounded-full text-xs font-medium transition-all flex items-center justify-center",
  completed ? 'bg-primary text-primary-foreground' : ...
)}>
```

**Станет:**
```tsx
<button className={cn(
  "w-8 h-8 rounded-xl text-xs font-medium transition-all flex items-center justify-center backdrop-blur-sm",
  completed
    ? "bg-primary/90 text-primary-foreground shadow-lg shadow-primary/30"
    : isCurrent
      ? "bg-primary text-primary-foreground ring-2 ring-primary ring-offset-2 shadow-lg"
      : isAccessible
        ? "bg-white/40 text-foreground hover:bg-white/60 border border-white/30"
        : "bg-muted/50 text-muted-foreground cursor-not-allowed"
)}>
```

### 3. KvestLessonView.tsx — Block Cards

**Было (строка 452-461):**
```tsx
<Card className={cn(
  "transition-all duration-300",
  isCompleted && !isCurrent && "border-primary/30 bg-primary/5",
  isCurrent && "ring-2 ring-primary/50 shadow-lg"
)}>
```

**Станет:**
```tsx
<div 
  className={cn(
    "rounded-2xl backdrop-blur-xl border transition-all duration-300 overflow-hidden",
    isCompleted && !isCurrent 
      ? "border-primary/30 shadow-md"
      : isCurrent 
        ? "border-primary/40 ring-2 ring-primary/30 shadow-xl"
        : "border-border/40 shadow-lg"
  )}
  style={{
    background: isCompleted && !isCurrent
      ? "linear-gradient(135deg, hsl(var(--primary) / 0.08), hsl(var(--primary) / 0.03))"
      : isCurrent
        ? "linear-gradient(135deg, hsl(var(--card) / 0.7), hsl(var(--card) / 0.4))"
        : "linear-gradient(135deg, hsl(var(--card) / 0.5), hsl(var(--card) / 0.25))",
    boxShadow: isCurrent 
      ? "0 16px 48px rgba(0, 0, 0, 0.1), inset 0 1px 0 hsl(0 0% 100% / 0.2)"
      : "0 8px 32px rgba(0, 0, 0, 0.06), inset 0 1px 0 hsl(0 0% 100% / 0.15)"
  }}
>
```

### 4. KvestLessonView.tsx — Block Header

**Было (строка 464-468):**
```tsx
<div className={cn(
  "px-4 py-2 border-b flex items-center justify-between",
  isCompleted ? "bg-primary/10" : isCurrent ? "bg-primary/10" : "bg-muted/30"
)}>
```

**Станет:**
```tsx
<div className={cn(
  "px-4 py-3 border-b border-white/10 flex items-center justify-between",
  isCompleted 
    ? "bg-gradient-to-r from-primary/15 to-primary/5" 
    : isCurrent 
      ? "bg-gradient-to-r from-primary/10 to-transparent" 
      : "bg-white/5"
)}>
```

### 5. KvestLessonView.tsx — Navigation Buttons

**Было (строки 507-530):**
```tsx
<Button onClick={() => goToStep(currentStepIndex + 1)} className="gap-2" size="lg">
```

**Станет:**
```tsx
<Button 
  onClick={() => goToStep(currentStepIndex + 1)}
  className="gap-2 bg-gradient-to-r from-primary via-primary/90 to-accent/80 hover:from-primary/90 hover:to-accent/70 shadow-lg shadow-primary/25 border-0"
  size="lg"
>
```

### 6. QuizSurveyBlock.tsx — Question Cards (студенческий режим)

**Было (строка 490-495):**
```tsx
<GlassCard
  className={cn(
    "p-5 transition-all duration-300",
    answers[q.id] && "border-primary/30 bg-primary/5"
  )}
>
```

**Станет:**
```tsx
<div
  className={cn(
    "p-5 rounded-2xl backdrop-blur-xl border transition-all duration-300",
    answers[q.id] 
      ? "border-primary/40 shadow-lg shadow-primary/10" 
      : "border-border/30 shadow-md"
  )}
  style={{
    background: answers[q.id]
      ? "linear-gradient(135deg, hsl(var(--primary) / 0.08), hsl(var(--primary) / 0.03))"
      : "linear-gradient(135deg, hsl(var(--card) / 0.5), hsl(var(--card) / 0.25))",
    boxShadow: answers[q.id]
      ? "0 12px 40px hsl(var(--primary) / 0.1), inset 0 1px 0 hsl(0 0% 100% / 0.2)"
      : "0 8px 32px rgba(0, 0, 0, 0.06), inset 0 1px 0 hsl(0 0% 100% / 0.15)"
  }}
>
```

### 7. QuizSurveyBlock.tsx — Radio Options

**Текущий стиль** — стандартные radio buttons в label.

**Станет:**
```tsx
<label
  className={cn(
    "flex items-start gap-3 p-4 rounded-xl backdrop-blur-sm border transition-all duration-200 cursor-pointer",
    selectedOption === opt.id
      ? "bg-primary/15 border-primary/40 shadow-md"
      : "bg-white/10 border-white/20 hover:bg-white/20 hover:border-white/30"
  )}
>
  <RadioGroupItem value={opt.id} className="mt-0.5" />
  <span className="text-sm leading-relaxed">{opt.text}</span>
</label>
```

### 8. QuizSurveyBlock.tsx — Result Card

**Станет:**
```tsx
<div 
  className="rounded-2xl backdrop-blur-2xl border border-primary/30 shadow-xl overflow-hidden"
  style={{
    background: "linear-gradient(135deg, hsl(var(--primary) / 0.1), hsl(var(--primary) / 0.03))",
    boxShadow: "0 16px 48px hsl(var(--primary) / 0.15), inset 0 1px 0 hsl(0 0% 100% / 0.3)"
  }}
>
  {/* Floating decoration */}
  <div className="absolute -top-12 -right-12 w-40 h-40 bg-primary/20 rounded-full blur-3xl pointer-events-none" />
  ...
</div>
```

### 9. RoleDescriptionBlock.tsx — Role Card

**Было (строка 169-176):**
```tsx
<Card>
  <CardContent className="py-6">
    <div className="prose ...">
```

**Станет:**
```tsx
<div 
  className="rounded-2xl backdrop-blur-xl border border-border/40 shadow-lg overflow-hidden"
  style={{
    background: "linear-gradient(135deg, hsl(var(--card) / 0.6), hsl(var(--card) / 0.3))",
    boxShadow: "0 12px 40px rgba(0, 0, 0, 0.08), inset 0 1px 0 hsl(0 0% 100% / 0.2)"
  }}
>
  <div className="p-6 prose prose-sm ...">
```

### 10. RoleDescriptionBlock.tsx — Action Button

**Было (строка 180):**
```tsx
<Button onClick={onComplete} className="w-full">
```

**Станет:**
```tsx
<Button 
  onClick={onComplete} 
  className="w-full bg-gradient-to-r from-primary via-primary/90 to-accent/80 hover:from-primary/90 hover:to-accent/70 shadow-lg shadow-primary/25 border-0"
>
```

### 11. LibraryLesson.tsx — Page Background

Добавить декоративные blob-элементы в обёртку:

```tsx
<DashboardLayout>
  <div className="container mx-auto px-4 py-6 max-w-4xl relative">
    {/* Decorative background blobs */}
    <div className="absolute top-0 right-0 w-80 h-80 bg-primary/5 rounded-full blur-3xl pointer-events-none -z-10" />
    <div className="absolute bottom-1/3 left-0 w-64 h-64 bg-accent/5 rounded-full blur-3xl pointer-events-none -z-10" />
    ...
  </div>
</DashboardLayout>
```

### 12. LibraryLesson.tsx — Header Badges

**Станет:**
```tsx
<Badge 
  variant="secondary" 
  className={cn(
    config.color,
    "backdrop-blur-sm bg-white/20 border border-white/30"
  )}
>
```

## Технические заметки

1. **GlassCard замена** — в блоках используется `GlassCard`, но для более тонкого контроля заменяем на inline styles с `backdrop-blur`
2. **Dark mode** — все стили используют CSS переменные, автоматически адаптируются
3. **Performance** — ограничиваем количество blur-элементов на странице

## DoD (Definition of Done)

| Проверка | Ожидаемый результат |
|----------|---------------------|
| Страница урока `/library/buh-business/test-role` | Glassmorphism progress bar, стеклянные карточки |
| QuizSurveyBlock | Стеклянные варианты ответов, результат с blur |
| RoleDescriptionBlock | Стеклянная карточка роли, gradient-кнопка |
| Step indicators | Стеклянные кнопки шагов |
| Dark mode | Все элементы читаемы |
| Mobile | Адаптивность сохранена |

