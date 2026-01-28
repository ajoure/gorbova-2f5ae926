
# План: Сохранение сессии и последней страницы + Копирование ссылок

## Часть 1: Надёжное восстановление сессии в мобильном Safari

### Проблема
Текущий механизм с фиксированной задержкой (1200ms) ненадёжен:
- iOS агрессивно выгружает вкладки из памяти
- При возврате в Safari страница перезагружается «холодно»
- Supabase не успевает восстановить сессию из localStorage

### Решение
Заменить фиксированную задержку на **активное ожидание сессии**:
1. AuthContext: инициализировать `onAuthStateChange` ДО вызова `getSession` (рекомендация Supabase)
2. ProtectedRoute: ждать не фиксированное время, а пока `loading === false` И прошла минимальная задержка
3. Добавить повторную проверку `getSession` если сессия не найдена после таймаута

### Изменения в AuthContext.tsx

```typescript
useEffect(() => {
  let isMounted = true;

  // 1. СНАЧАЛА подписываемся на изменения (рекомендация Supabase)
  const { data: { subscription } } = supabase.auth.onAuthStateChange(
    (event, session) => {
      if (!isMounted) return;
      
      setSession(session);
      setUser(session?.user ?? null);
      
      if (session?.user) {
        setTimeout(() => {
          if (isMounted) {
            fetchUserRole(session.user.id).then((r) => {
              if (isMounted) setRole(r);
            });
          }
        }, 0);
      } else {
        setRole("user");
      }
      setLoading(false);
    }
  );

  // 2. ПОТОМ проверяем текущую сессию
  supabase.auth.getSession().then(({ data: { session } }) => {
    if (!isMounted) return;
    
    if (session) {
      setSession(session);
      setUser(session.user);
      fetchUserRole(session.user.id).then((r) => {
        if (isMounted) setRole(r);
      });
    }
    setLoading(false);
  });

  return () => {
    isMounted = false;
    subscription.unsubscribe();
  };
}, []);
```

### Изменения в ProtectedRoute.tsx

```typescript
export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { user, loading } = useAuth();
  const location = useLocation();
  
  const [isInitializing, setIsInitializing] = useState(true);
  const [retryCount, setRetryCount] = useState(0);
  
  useEffect(() => {
    const isMobileSafari = /iPhone|iPad|iPod/.test(navigator.userAgent) && 
                           /Safari/.test(navigator.userAgent) &&
                           !/Chrome/.test(navigator.userAgent);
    
    // Базовая задержка: 1500ms для мобильного Safari, 600ms для остальных
    const delay = isMobileSafari ? 1500 : 600;
    
    const timer = setTimeout(() => setIsInitializing(false), delay);
    return () => clearTimeout(timer);
  }, []);

  // Повторная проверка сессии если пользователь не найден после инициализации
  useEffect(() => {
    if (!loading && !isInitializing && !user && retryCount < 2) {
      // Попробуем ещё раз получить сессию
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session) {
          // Сессия найдена — перезагрузим страницу для корректной инициализации
          window.location.reload();
        }
      });
      setRetryCount(prev => prev + 1);
    }
  }, [loading, isInitializing, user, retryCount]);

  if (loading || isInitializing) {
    return <Loader />;
  }

  if (!user) {
    const redirectTo = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/auth?redirectTo=${redirectTo}`} replace />;
  }

  return <>{children}</>;
}
```

---

## Часть 2: Сохранение и восстановление последней страницы

### Механизм
1. **Сохранение**: при каждом переходе на защищённую страницу записываем URL в localStorage
2. **Восстановление**: при запуске приложения (после успешной авторизации) проверяем сохранённый URL и редиректим

### Новый хук: useLastRoute.ts

```typescript
// src/hooks/useLastRoute.ts

const STORAGE_KEY = 'last_protected_route';

// Страницы, которые не нужно запоминать
const EXCLUDED_PATHS = ['/', '/auth', '/help', '/docs'];

export function saveLastRoute(pathname: string, search: string) {
  if (EXCLUDED_PATHS.some(p => pathname === p || pathname.startsWith('/auth'))) {
    return;
  }
  const fullPath = pathname + search;
  localStorage.setItem(STORAGE_KEY, fullPath);
}

export function getLastRoute(): string | null {
  return localStorage.getItem(STORAGE_KEY);
}

export function clearLastRoute() {
  localStorage.removeItem(STORAGE_KEY);
}
```

### Интеграция в ProtectedRoute

```typescript
import { saveLastRoute } from "@/hooks/useLastRoute";

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { user, loading } = useAuth();
  const location = useLocation();
  
  // Сохраняем текущий маршрут при каждом изменении (если авторизован)
  useEffect(() => {
    if (user && !loading) {
      saveLastRoute(location.pathname, location.search);
    }
  }, [user, loading, location.pathname, location.search]);
  
  // ... остальная логика
}
```

### Восстановление в DomainRouter.tsx

```typescript
import { getLastRoute, clearLastRoute } from "@/hooks/useLastRoute";

export function DomainHomePage() {
  const { user, loading: authLoading } = useAuth();
  // ...
  
  if (isMainDomain) {
    if (authLoading || isInitializing) {
      return <Loader />;
    }
    
    if (user) {
      // Проверяем сохранённый маршрут
      const lastRoute = getLastRoute();
      if (lastRoute && lastRoute !== '/dashboard') {
        clearLastRoute(); // Очищаем чтобы не зациклиться
        return <Navigate to={lastRoute} replace />;
      }
      return <Navigate to="/dashboard" replace />;
    }
    return <Landing />;
  }
  // ...
}
```

### Восстановление после логина в Auth.tsx

```typescript
import { getLastRoute, clearLastRoute } from "@/hooks/useLastRoute";

// В useEffect после успешной авторизации:
useEffect(() => {
  if (user && mode !== "update_password") {
    // Сначала проверяем redirectTo из URL
    const urlRedirect = searchParams.get("redirectTo");
    if (urlRedirect) {
      navigate(urlRedirect);
      return;
    }
    
    // Затем проверяем сохранённый маршрут
    const lastRoute = getLastRoute();
    if (lastRoute) {
      clearLastRoute();
      navigate(lastRoute);
      return;
    }
    
    // По умолчанию — на дашборд
    navigate('/dashboard');
  }
}, [user, mode, navigate, searchParams]);
```

---

## Часть 3: Копирование ссылок на контакты и сделки

### UI решение
Добавить кнопку «Скопировать ссылку» в двух местах:
1. **Внутри карточки** (ContactDetailSheet / DealDetailSheet) — основное место
2. **В строке таблицы** — быстрый доступ через иконку

### Утилита для копирования

```typescript
// src/utils/clipboardUtils.ts

import { toast } from "sonner";

export async function copyToClipboard(text: string, successMessage = "Ссылка скопирована") {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(successMessage);
    return true;
  } catch (err) {
    // Fallback для старых браузеров
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.position = "fixed";
    textArea.style.left = "-999999px";
    document.body.appendChild(textArea);
    textArea.select();
    try {
      document.execCommand("copy");
      toast.success(successMessage);
      return true;
    } catch {
      toast.error("Не удалось скопировать");
      return false;
    } finally {
      document.body.removeChild(textArea);
    }
  }
}

export function getContactUrl(contactId: string) {
  return `${window.location.origin}/admin/contacts?contact=${contactId}`;
}

export function getDealUrl(dealId: string) {
  return `${window.location.origin}/admin/deals?deal=${dealId}`;
}
```

### Изменения в ContactDetailSheet.tsx

Добавить кнопку в header карточки:

```tsx
import { Copy, Link } from "lucide-react";
import { copyToClipboard, getContactUrl } from "@/utils/clipboardUtils";

// В header секции:
<Button
  variant="ghost"
  size="icon"
  onClick={() => copyToClipboard(getContactUrl(contact.id), "Ссылка на контакт скопирована")}
  title="Скопировать ссылку"
>
  <Link className="h-4 w-4" />
</Button>
```

### Изменения в DealDetailSheet.tsx

Аналогично:

```tsx
import { copyToClipboard, getDealUrl } from "@/utils/clipboardUtils";

<Button
  variant="ghost"
  size="icon"
  onClick={() => copyToClipboard(getDealUrl(deal.id), "Ссылка на сделку скопирована")}
  title="Скопировать ссылку"
>
  <Link className="h-4 w-4" />
</Button>
```

### Изменения в AdminContacts.tsx (таблица)

Добавить иконку копирования в строку:

```tsx
// В TableRow, после других действий:
<TooltipProvider>
  <Tooltip>
    <TooltipTrigger asChild>
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        onClick={(e) => {
          e.stopPropagation();
          copyToClipboard(getContactUrl(contact.id), "Ссылка скопирована");
        }}
      >
        <Link className="h-3.5 w-3.5" />
      </Button>
    </TooltipTrigger>
    <TooltipContent>Скопировать ссылку</TooltipContent>
  </Tooltip>
</TooltipProvider>
```

### Изменения в AdminDeals.tsx (таблица)

Аналогично для сделок.

---

## Файлы для изменения

| Файл | Изменения |
|------|-----------|
| `src/contexts/AuthContext.tsx` | Переупорядочить `onAuthStateChange` и `getSession` |
| `src/components/layout/ProtectedRoute.tsx` | Увеличить задержку, добавить retry-логику, сохранять маршрут |
| `src/components/layout/DomainRouter.tsx` | Восстанавливать последний маршрут при редиректе на dashboard |
| `src/pages/Auth.tsx` | Восстанавливать последний маршрут после логина |
| `src/hooks/useLastRoute.ts` | **НОВЫЙ** — хук для сохранения/восстановления маршрута |
| `src/utils/clipboardUtils.ts` | **НОВЫЙ** — утилиты копирования и генерации URL |
| `src/components/admin/ContactDetailSheet.tsx` | Добавить кнопку копирования ссылки |
| `src/components/admin/DealDetailSheet.tsx` | Добавить кнопку копирования ссылки |
| `src/pages/admin/AdminContacts.tsx` | Добавить иконку копирования в таблицу |
| `src/pages/admin/AdminDeals.tsx` | Добавить иконку копирования в таблицу |

---

## Результат

1. **Сессия** — более надёжное восстановление с retry-логикой
2. **Последняя страница** — сохраняется в localStorage и восстанавливается при запуске
3. **Копирование ссылок** — доступно и в карточке, и в списке

---

## Технические детали

### Логика восстановления маршрута

```
Запуск приложения
       ↓
  Пользователь авторизован?
       ↓ Да
  Есть redirectTo в URL?
       ↓ Нет
  Есть сохранённый маршрут?
       ↓ Да
  Редирект на сохранённый маршрут
```

### Исключения из сохранения

- `/` — главная страница
- `/auth` — страница авторизации
- `/help`, `/docs` — публичные страницы

### Совместимость

- Работает в Safari, Chrome, Firefox
- Fallback для `navigator.clipboard` в старых браузерах
- PWA: сохранённый маршрут работает при запуске из иконки
