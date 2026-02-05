
# План: Исправить ошибку бота + добавить кнопки форматирования

## Проблема 1: "Нет активного бота"

**Причина:** Код ищет `.eq("is_active", true)`, но в таблице `telegram_bots`:
- Поле называется `status` (не `is_active`)
- Значение `'active'` (строка, не boolean)

**Файл:** `src/components/admin/communication/BroadcastsTabContent.tsx`

**Строка 340:**
```text
БЫЛО:   .eq("is_active", true)
СТАЛО:  .eq("status", "active")
```

---

## Проблема 2: Кнопки форматирования

Нужно добавить toolbar над Textarea с кнопками:
- **B** — жирный (`*текст*`)
- **I** — курсив (`_текст_`)
- **</>** — код (`` `текст` ``)
- **🔗** — ссылка (`[текст](url)`)

### Реализация

1. **Создать компонент TelegramTextToolbar**

```typescript
interface Props {
  textareaRef: React.RefObject<HTMLTextAreaElement>;
  value: string;
  onChange: (value: string) => void;
}

function TelegramTextToolbar({ textareaRef, value, onChange }: Props) {
  const wrapSelection = (prefix: string, suffix: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = value.substring(start, end);
    
    const newText = 
      value.substring(0, start) + 
      prefix + selectedText + suffix + 
      value.substring(end);
    
    onChange(newText);
    
    // Restore cursor position
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(
        start + prefix.length,
        end + prefix.length
      );
    }, 0);
  };

  return (
    <div className="flex gap-1 mb-2">
      <Button variant="outline" size="sm" onClick={() => wrapSelection('*', '*')}>
        <Bold className="h-4 w-4" />
      </Button>
      <Button variant="outline" size="sm" onClick={() => wrapSelection('_', '_')}>
        <Italic className="h-4 w-4" />
      </Button>
      <Button variant="outline" size="sm" onClick={() => wrapSelection('`', '`')}>
        <Code className="h-4 w-4" />
      </Button>
      <Button variant="outline" size="sm" onClick={() => {
        const url = prompt('Введите URL:');
        if (url) wrapSelection('[', `](${url})`);
      }}>
        <Link className="h-4 w-4" />
      </Button>
    </div>
  );
}
```

2. **Добавить ref для textarea и toolbar в UI**

```typescript
// State
const textareaRef = useRef<HTMLTextAreaElement>(null);

// В JSX перед Textarea:
<TelegramTextToolbar 
  textareaRef={textareaRef}
  value={message}
  onChange={setMessage}
/>

<Textarea
  ref={textareaRef}
  placeholder="Введите текст сообщения..."
  value={message}
  onChange={(e) => setMessage(e.target.value)}
  rows={6}
/>
```

---

## Файлы для изменения

| Файл | Изменение |
|------|-----------|
| `src/components/admin/communication/BroadcastsTabContent.tsx` | Исправить запрос бота + добавить toolbar |

---

## Результат

1. Кнопка "Тест себе" успешно отправляет сообщение
2. Над текстовым полем появятся кнопки: **B**, _I_, `</>`, 🔗
3. При выделении текста и нажатии кнопки — текст оборачивается в нужные символы
