
# Исправление отображения HTML в чек-листе (студенческий вид)

## Проблема

В `ChecklistStudentView` три поля выводятся через `{value}` вместо `dangerouslySetInnerHTML`:
- Строка 217: `{content.title || "Чек-лист"}` 
- Строка 219: `{content.description}`
- Строка 245: `{group.title}`

Это приводит к тому, что HTML-теги (например `<FONT COLOR="#E03E3E">`) отображаются как текст.

## Решение

### Файл: `src/components/admin/lesson-editor/blocks/ChecklistBlock.tsx`

3 точечных замены в студенческом виде:

**Строка 217** — заголовок чек-листа:
```tsx
// Было:
<p className="font-medium">{content.title || "Чек-лист"}</p>

// Станет:
<p className="font-medium" dangerouslySetInnerHTML={{ __html: content.title || "Чек-лист" }} />
```

**Строка 219** — описание:
```tsx
// Было:
<p className="text-sm text-muted-foreground">{content.description}</p>

// Станет:
<p className="text-sm text-muted-foreground" dangerouslySetInnerHTML={{ __html: content.description }} />
```

**Строка 245** — заголовок группы:
```tsx
// Было:
<h4 className="...">{group.title}</h4>

// Станет:
<h4 className="..." dangerouslySetInnerHTML={{ __html: group.title }} />
```

## Затронутые файлы

| Файл | Действие |
|---|---|
| `src/components/admin/lesson-editor/blocks/ChecklistBlock.tsx` | 3 замены в студенческом виде (title, description, group.title) |

## Что НЕ трогаем

- Редактор (ChecklistEditor) -- без изменений
- item.label и item.description -- уже используют dangerouslySetInnerHTML (строки 264, 270)
- Другие файлы -- без изменений
