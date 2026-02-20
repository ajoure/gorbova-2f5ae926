
# Создание зеркала cons.gorbova.by для consultation.gorbova.by

## Что будет сделано

Три шага для создания полноценного зеркала:

### 1. Добавить DNS A-запись через hoster.by API

Через edge-функцию `hosterby-api` (action: `add_dns_a_record`) создать A-запись `cons.gorbova.by`, указывающую на IP `185.158.133.1` (IP Lovable для кастомных доменов). Для этого:
- Определить `order_id` домена `gorbova.by` через `list_dns_orders`
- Добавить A-запись: `cons` -> `185.158.133.1`

### 2. Обновить DomainRouter.tsx

Добавить `cons.gorbova.by` как ещё один домен, показывающий страницу `Consultation`:

```
const isConsultationDomain = hostname === "consultation.gorbova.by" || hostname === "cons.gorbova.by";
```

Одна строка — без изменения остальной логики.

### 3. Подключить домен в Lovable

Добавить `cons.gorbova.by` как кастомный домен в настройках проекта Lovable, чтобы SSL-сертификат был выпущен и домен обслуживался.

---

## Затрагиваемые файлы

| Файл | Изменение |
|------|-----------|
| `src/components/layout/DomainRouter.tsx` | Добавить `cons.gorbova.by` в условие `isConsultationDomain` |

Также: вызов hoster.by API для создания DNS-записи и подключение домена в настройках Lovable.
