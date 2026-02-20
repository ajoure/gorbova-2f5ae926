

# Полная интеграция hoster.by API: Cloud + DNS управление

## Обзор API hoster.by (serviceapi.hoster.by)

Проанализирован Swagger JSON. Доступны следующие возможности:

### Cloud API (управление VPS)
| Endpoint | Метод | Что делает | Реализовано? |
|----------|-------|-----------|:---:|
| `/cloud/orders` | GET | Список облаков | Да |
| `/cloud/orders/{id}/` | GET | Детали облака (имя, дата, баланс) | Нет |
| `/cloud/orders/{id}/balance` | GET | Баланс облака | Нет |
| `/cloud/orders/balance` | GET | Баланс всех облаков | Нет |
| `/cloud/orders/{id}/vm` | GET | Список VM | Да |
| `/cloud/orders/{id}/vm/{vmId}` | GET | Детали VM (CPU, RAM, диск, IP, трафик, стоимость) | Нет |
| `/cloud/orders/{id}/vm/{vmId}/start` | PATCH | Запустить VM | Нет |
| `/cloud/orders/{id}/vm/{vmId}/stop` | PATCH | Остановить VM | Нет |
| `/cloud/orders/{id}/vm/{vmId}/reboot` | PATCH | Перезагрузить VM | Нет |
| `/cloud/orders/{id}/vm/{vmId}/reset` | PATCH | Жесткий сброс VM | Нет |
| `/cloud/orders/{id}/vm/{vmId}/shutdown` | PATCH | Мягкое выключение VM | Нет |

### DNS API (управление доменами и записями)
| Endpoint | Метод | Что делает | Реализовано? |
|----------|-------|-----------|:---:|
| `/dns/orders` | GET | Список доменов | Нет |
| `/dns/orders/{id}/` | GET | Детали домена (nameservers, даты, регистрант) | Нет |
| `/dns/orders/{id}/` | DELETE | Удалить DNS-заказ | Нет |
| `/dns/orders/{id}/records` | GET | Все DNS-записи домена | Нет |
| `/dns/orders/{id}/records/a` | GET | A-записи | Нет |
| `/dns/orders/{id}/records/a` | POST | Добавить A-запись | Нет |
| `/dns/orders/{id}/records/aaaa` | GET | AAAA-записи | Нет |

---

## Что будет сделано

### Часть 1: Edge-функция `hosterby-api/index.ts` -- новые action-ветки

Добавляем следующие actions (add-only, существующие не трогаем):

**Cloud:**
- `cloud_order_detail` -- GET `/cloud/orders/{orderId}/`
- `cloud_balance` -- GET `/cloud/orders/balance` (общий) или `/cloud/orders/{orderId}/balance` (конкретный)
- `vm_detail` -- GET `/cloud/orders/{orderId}/vm/{vmId}` (полная информация о VM)
- `vm_start` -- PATCH `.../start`
- `vm_stop` -- PATCH `.../stop`
- `vm_reboot` -- PATCH `.../reboot`
- `vm_reset` -- PATCH `.../reset` (жесткий сброс)
- `vm_shutdown` -- PATCH `.../shutdown` (мягкое выключение)

**DNS:**
- `list_dns_orders` -- GET `/dns/orders`
- `dns_order_detail` -- GET `/dns/orders/{orderId}/`
- `list_dns_records` -- GET `/dns/orders/{orderId}/records`
- `add_dns_a_record` -- POST `/dns/orders/{orderId}/records/a` (body: name, content, ttl, disabled)

Каждый action:
1. Проверяет наличие ключей (cloud или dns, в зависимости от действия)
2. Получает JWT через `getAccessToken()`
3. Выполняет запрос через `hosterRequest()`
4. DNS-actions используют `dns_access_key` / `dns_secret_key` из config
5. Записывает audit log для мутирующих операций (start/stop/reboot/reset/shutdown, add_dns_a_record)
6. Возвращает нормализованный ответ

### Часть 2: UI -- Переработка карточки настроек

**Файл: `HosterBySettingsCard.tsx` -- структурная переработка**

Карточка становится расширенной панелью с тремя логическими секциями:

**Секция 1: Подключение (существующая, без изменений по логике)**
- Статус подключения, ключи, кнопка "Проверить"

**Секция 2: Cloud / VPS** (новая)
- Баланс облака (загружается при открытии)
- Список VM с их статусом (on/off), IP, CPU, RAM, ОС
- Для каждой VM -- кнопки управления: Запустить / Остановить / Перезагрузить
- Кнопка "Подробнее" для детальной информации о VM (трафик, диск, стоимость/час)
- Все деструктивные действия (stop/reset/shutdown) -- через AlertDialog с подтверждением

**Секция 3: DNS** (новая)
- Список доменов (загружается при открытии)
- Для каждого домена: имя, nameservers, даты регистрации/истечения
- Раскрывающийся список DNS-записей домена (A, AAAA и др.)
- Кнопка "Добавить A-запись" -- форма с полями: name, content (IP), TTL
- Каждая запись показывает: name, type, content, TTL, disabled/enabled

**Новые компоненты:**
- `HosterByCloudPanel.tsx` -- секция Cloud/VPS с балансом и списком VM
- `HosterByVmCard.tsx` -- карточка одной VM с действиями
- `HosterByDnsPanel.tsx` -- секция DNS с доменами и записями
- `HosterByDnsRecordForm.tsx` -- форма добавления DNS-записи

### Часть 3: Обновление `HosterBySettingsCard.tsx`

Основная карточка получает табы (Tabs) или аккордеон:
- **Обзор** -- текущий статус, ключи, egress (то что есть сейчас)
- **Cloud / VPS** -- баланс + VM-список с управлением
- **DNS** -- домены + записи

Описание карточки меняется с "Белорусский VPS-хостинг. BY-egress для парсинга BY/RU сайтов." на "Управление хостингом hoster.by: Cloud VPS, DNS-записи, BY-egress."

---

## Инструкция: как создать VPS-сервер в hoster.by

API hoster.by **не предоставляет** endpoint для создания нового VPS (нет POST `/cloud/orders` или POST `.../vm`). Создание/заказ VPS делается только через панель управления hoster.by:

1. Зайти на https://cp.hoster.by
2. Перейти в раздел "Облачные серверы" (Cloud)
3. Если облако уже оплачено -- оно появится в списке заказов
4. Внутри облака нажать "Создать виртуальную машину"
5. Выбрать шаблон ОС (Debian, Ubuntu, CentOS и т.д.)
6. Указать ресурсы (CPU, RAM, диск)
7. Подтвердить создание

После создания VM через панель, она автоматически появится в нашей интеграции (через API `/cloud/orders/{id}/vm`), и вы сможете управлять ею (запуск, остановка, перезагрузка) прямо из приложения.

---

## Что НЕ трогаем
- `HosterByConnectionDialog.tsx` -- без изменений
- `HosterByEgressDialog.tsx` -- без изменений
- `integration-healthcheck` -- без изменений
- Существующие actions в edge-функции (test_connection, save_hoster_keys, list_vms, egress-*) -- без изменений
- RLS-политики, таблицы БД -- без изменений

## Технические детали

### DNS-ключи vs Cloud-ключи
DNS API и Cloud API используют одну и ту же схему авторизации (Access-Key + Secret-Key -> JWT -> Access-Token). Но пользователь может иметь разные ключи для Cloud и DNS. В edge-функции:
- Cloud actions используют `cloud_access_key` / `cloud_secret_key`
- DNS actions используют `dns_access_key` / `dns_secret_key` (если заданы), с fallback на cloud-ключи

### STOP-guards для опасных действий
- `vm_stop`, `vm_reset`, `vm_shutdown` -- только с подтверждением (UI: AlertDialog, edge: audit log обязателен)
- `add_dns_a_record` -- валидация формата IP, audit log
- Никаких bulk-операций в первой версии

### Объем изменений
- 1 edge-функция (add-only: ~12 новых case-веток)
- 4 новых UI-компонента
- 1 обновленный UI-компонент (HosterBySettingsCard -- добавление табов)

