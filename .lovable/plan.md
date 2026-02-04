

# План: Glassmorphism редизайн тренинга "Бухгалтерия как бизнес"

## Анализ текущего состояния

В проекте уже используется стеклянный дизайн-язык:
- `GlassCard` — основной компонент с `backdrop-blur-24px`, `bg-card/60`
- `GlassFilterPanel` — панель фильтров с `backdrop-blur-xl`, `bg-card/30`
- CSS переменные `--glass-bg`, `--glass-border`, `--glass-shadow`
- iOS-подобная цветовая схема: глубокий синий фон в сайдбаре, голубой primary

## Референс-стиль

По изображению пользователя — iOS-подобная навигация:
- Глубокий синий градиентный фон (как в sidebar)
- Белые иконки и текст
- Сильный blur-эффект
- Pill-shaped контейнеры с тонкими полупрозрачными границами

## Файлы для редизайна

| Файл | Что переработать |
|------|------------------|
| `src/pages/BusinessTraining.tsx` | Лендинг: hero, benefits, pricing |
| `src/pages/BusinessTrainingContent.tsx` | Личный кабинет: карточки, прогресс, CTA |

## Детальные изменения

### 1. BusinessTraining.tsx (Лендинг)

#### 1.1 Hero-секция
- Усилить стеклянный эффект на карточках benefits
- Добавить плавающие градиентные blob-элементы
- Улучшить floating badge с более выраженным blur

**Было:**
```tsx
<div className="flex items-start gap-3 p-3 rounded-lg bg-card/40 backdrop-blur-sm border border-border/30">
```

**Станет:**
```tsx
<div className="flex items-start gap-3 p-4 rounded-2xl bg-white/10 backdrop-blur-xl border border-white/20 shadow-lg shadow-primary/5 hover:bg-white/15 transition-all duration-300">
```

#### 1.2 Benefits grid — новый стиль

```tsx
<div className="flex items-start gap-3 p-4 rounded-2xl backdrop-blur-xl border transition-all duration-300"
  style={{
    background: "linear-gradient(135deg, hsl(var(--card) / 0.5), hsl(var(--card) / 0.2))",
    borderColor: "hsl(var(--border) / 0.3)",
    boxShadow: "0 8px 32px rgba(0, 0, 0, 0.08), inset 0 1px 0 hsl(var(--card) / 0.5)"
  }}
>
```

#### 1.3 Pricing карточка
- Усилить стеклянный эффект
- Добавить inner glow
- Более читаемый контраст для цен

**Было:**
```tsx
<GlassCard className="p-8 lg:p-10 backdrop-blur-xl bg-card/60 border-primary/10">
```

**Станет:**
```tsx
<GlassCard className="p-8 lg:p-10 relative overflow-hidden">
  {/* Inner glow gradient */}
  <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-accent/5 pointer-events-none rounded-2xl" />
  <div className="absolute -top-32 -right-32 w-64 h-64 bg-primary/10 rounded-full blur-3xl pointer-events-none" />
  ...
</GlassCard>
```

#### 1.4 Floating badge эксперта

**Было:**
```tsx
<GlassCard className="px-4 py-3 flex items-center gap-3 bg-card/90 backdrop-blur-xl border-primary/20">
```

**Станет:**
```tsx
<div className="px-4 py-3 flex items-center gap-3 rounded-2xl backdrop-blur-2xl border border-white/30 shadow-xl"
  style={{
    background: "linear-gradient(135deg, hsl(var(--card) / 0.95), hsl(var(--card) / 0.8))",
    boxShadow: "0 20px 50px rgba(0, 0, 0, 0.15), inset 0 1px 0 hsl(0 0% 100% / 0.3)"
  }}
>
```

### 2. BusinessTrainingContent.tsx (Личный кабинет)

#### 2.1 Навигационные табы (iOS-style, как на референсе)

Добавить новую pill-shaped навигацию:

```tsx
{/* Glass navigation bar - iOS style */}
<div className="p-2 rounded-2xl backdrop-blur-2xl border border-white/20 shadow-lg"
  style={{
    background: "linear-gradient(180deg, hsl(var(--card) / 0.4), hsl(var(--card) / 0.25))"
  }}
>
  <div className="flex items-center gap-2 justify-center">
    {navItems.map((item) => (
      <button
        key={item.id}
        className={cn(
          "flex flex-col items-center gap-1.5 px-5 py-3 rounded-xl transition-all duration-300",
          item.active 
            ? "bg-primary/20 text-primary shadow-lg" 
            : "text-muted-foreground hover:text-foreground hover:bg-white/10"
        )}
      >
        <item.icon className="h-5 w-5" />
        <span className="text-xs font-medium">{item.label}</span>
      </button>
    ))}
  </div>
</div>
```

#### 2.2 Карточка даты старта

**Было:**
```tsx
<GlassCard className="relative overflow-hidden border-primary/20 bg-gradient-to-r from-primary/5 via-primary/10 to-primary/5">
```

**Станет:**
```tsx
<div className="relative overflow-hidden rounded-2xl backdrop-blur-2xl border border-primary/30 shadow-xl"
  style={{
    background: "linear-gradient(135deg, hsl(var(--primary) / 0.08), hsl(var(--primary) / 0.03))",
    boxShadow: "0 12px 40px rgba(var(--primary) / 0.1), inset 0 1px 0 hsl(var(--primary) / 0.2)"
  }}
>
  {/* Floating orb */}
  <div className="absolute -top-12 -right-12 w-40 h-40 bg-primary/20 rounded-full blur-3xl" />
  ...
</div>
```

#### 2.3 Карточка "О тренинге"

```tsx
<div className="relative p-5 rounded-2xl backdrop-blur-xl border border-border/40 shadow-lg overflow-hidden"
  style={{
    background: "linear-gradient(135deg, hsl(var(--card) / 0.5), hsl(var(--card) / 0.3))"
  }}
>
  {/* Subtle gradient overlay */}
  <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent pointer-events-none rounded-2xl" />
  ...
</div>
```

#### 2.4 Progress-карточка

```tsx
<div className="p-4 rounded-2xl backdrop-blur-xl border border-border/30 shadow-md"
  style={{
    background: "linear-gradient(135deg, hsl(var(--card) / 0.4), hsl(var(--card) / 0.2))"
  }}
>
  <div className="flex items-center justify-between mb-2">
    <span className="text-sm font-medium">Прогресс обучения</span>
    <span className="text-sm text-muted-foreground">{completedCount} из {totalCount} уроков</span>
  </div>
  <Progress value={progress} className="h-2" />
</div>
```

#### 2.5 CTA кнопки — gradient + glow

```tsx
<Button 
  className="flex-1 relative overflow-hidden bg-gradient-to-r from-primary via-primary/90 to-accent/80 hover:from-primary/90 hover:to-accent/70 shadow-lg shadow-primary/25"
>
  <span className="relative z-10 flex items-center gap-2">
    <ExternalLink className="h-4 w-4" />
    Подробнее о тренинге
  </span>
</Button>
```

### 3. Улучшение читаемости

#### 3.1 Контраст текста
- Все заголовки: `text-foreground` (уже хорошо)
- Описания: `text-muted-foreground/90` вместо `text-muted-foreground`
- Цены: добавить `drop-shadow-sm` для лучшей читаемости на glass-фоне

#### 3.2 Иконки в карточках
- Добавить фоновые круги: `p-2 rounded-xl bg-primary/10 backdrop-blur-sm`

### 4. Декоративные элементы

#### 4.1 Floating orbs (фоновые градиентные пятна)

```tsx
{/* Decorative blobs */}
<div className="absolute top-1/4 right-0 w-96 h-96 rounded-full bg-primary/10 blur-3xl pointer-events-none" />
<div className="absolute bottom-1/4 left-0 w-80 h-80 rounded-full bg-accent/10 blur-3xl pointer-events-none" />
<div className="absolute top-1/2 left-1/2 -translate-x-1/2 w-[600px] h-[600px] rounded-full bg-gradient-to-br from-primary/5 to-accent/5 blur-3xl pointer-events-none" />
```

#### 4.2 Inner shadows для глубины

```css
boxShadow: "0 8px 32px rgba(0, 0, 0, 0.08), inset 0 1px 0 hsl(0 0% 100% / 0.2)"
```

## Примерная структура изменений

```text
BusinessTraining.tsx:
├── Hero Section
│   ├── Benefits cards → стеклянные карточки с inner glow
│   ├── CTA buttons → gradient + shadow
│   └── Expert floating badge → усиленный blur
├── Pricing Section
│   ├── Main card → стекло + декоративные blob'ы
│   ├── Price display → лучший контраст
│   └── Feature lists → иконки с фоном
└── Background → градиентные orb'ы

BusinessTrainingContent.tsx:
├── Navigation → iOS-style pill navigation
├── Start Date Card → стекло + floating orb
├── Telegram CTA → стекло с amber-акцентом
├── About Card → стекло + overlay
├── Progress Card → стекло + Progress
└── Action Buttons → gradient + glow
```

## Совместимость

- Все изменения используют существующие CSS переменные
- Тёмная тема автоматически адаптируется через CSS переменные
- Не затрагиваем другие страницы

## DoD (Definition of Done)

| Проверка | Ожидаемый результат |
|----------|---------------------|
| Лендинг `/business-training` | Стеклянные карточки, читаемый текст |
| Личный кабинет `/library/buh-business` | iOS-style навигация, стеклянные карточки |
| Тёмная тема | Все элементы читаемы, контраст сохранён |
| Мобильная версия | Адаптивность сохранена |
| Производительность | backdrop-blur не замедляет рендер |

