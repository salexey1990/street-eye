# StreetEye — Техническое задание: Бэкенд MVP

> **Версия:** 1.6 · Апрель 2026  
> **Стек:** NestJS · PostgreSQL · Redis · Docker Compose  
> **Срок:** 10 недель  
> **Связанные docs:** StreetEye MVP Specification v1.5

---

## 1. Обзор и архитектура

Бэкенд StreetEye MVP — NestJS-монолит с модульной структурой. Каждый домен изолирован в отдельный модуль. Внешние зависимости минимальны: PostgreSQL как основная БД (включая хранение refresh-токенов), Redis для rate-limiting и кэширования, Resend для email.

Монолит выбран намеренно: он поддерживается одним разработчиком, легко деплоится через Docker Compose и не требует оркестрации до 50 000 пользователей. Разбивка на микросервисы — после MVP при реальной нагрузке.

### 1.1 Модульная структура

| Модуль | Ответственность | Зависимости |
|---|---|---|
| AuthModule | Регистрация, вход, токены, сброс пароля | UsersModule, MailModule |
| UsersModule | Профиль, уровень, предпочтения | — |
| TasksModule | База заданий, фильтрация, выборка | UsersModule |
| SessionsModule | Активная сессия задания пользователя | TasksModule, UsersModule |
| JournalModule | Записи дневника, самооценка, заметки | SessionsModule, UsersModule |
| BadgesModule | Логика выдачи бейджей, трекинг | JournalModule, UsersModule |
| MailModule | Отправка писем через Resend. Шаблоны на ru и en — язык выбирается по полю `locale` пользователя | — |
| NotificationsModule | Хранение push-токенов, отправка push-уведомлений через Expo Push API | UsersModule |
| SubscriptionsModule | Верификация покупок (App Store / Google Play), статус подписки, лимиты Free/Premium. **При запуске MVP деактивирован** (см. раздел 8b) | UsersModule |
| PromoModule | Генерация и активация промокодов, выдача lifetime Premium. **При запуске MVP деактивирован** (см. раздел 8c) | SubscriptionsModule, UsersModule |
| HealthModule | Health-check эндпоинт для мониторинга | — |

### 1.2 Стек технологий

| Компонент | Технология | Версия / пакет |
|---|---|---|
| Runtime | Node.js | `node >= 20 LTS` |
| Фреймворк | NestJS | `@nestjs/core ^10` |
| Язык | TypeScript | `typescript ^5` |
| ORM | Prisma | `prisma ^5` |
| БД | PostgreSQL | `postgres:16-alpine (Docker)` |
| Кэш / сессии | Redis | `redis:7-alpine (Docker)` |
| Валидация | class-validator | `class-validator ^0.14, class-transformer` |
| Авторизация | Passport + JWT | `@nestjs/passport, @nestjs/jwt, bcrypt` |
| Rate limiting | NestJS Throttler | `@nestjs/throttler ^5` |
| HTTP-безопасность | Helmet | `helmet ^7` |
| Email | Resend SDK | `resend ^3` |
| Тесты | Jest | `jest ^29, @nestjs/testing` |
| Контейнеризация | Docker Compose | `docker-compose.yml (dev + prod)` |
| CI/CD | GitHub Actions | `.github/workflows/deploy.yml` |
| Локализация (i18n) | Встроенный NestJS | `Accept-Language` header + поля `_ru`/`_en` в БД. ru \| en на старте |

### 1.3 Структура проекта

Монорепозиторий с единым `package.json`:

```
src/
├── main.ts                    # Bootstrap, глобальные middleware
├── app.module.ts              # Корневой модуль
├── common/                    # Shared: guards, decorators, pipes, interceptors
│   ├── guards/                # JwtAuthGuard, RolesGuard
│   ├── decorators/            # @CurrentUser, @Public
│   ├── filters/               # GlobalExceptionFilter
│   └── interceptors/          # LoggingInterceptor, TransformInterceptor
├── config/                    # ConfigModule: env validation через Joi
├── prisma/                    # PrismaService, schema.prisma, migrations/
├── auth/                      # AuthModule
├── users/                     # UsersModule
├── tasks/                     # TasksModule
├── sessions/                  # SessionsModule
├── journal/                   # JournalModule
├── badges/                    # BadgesModule
├── mail/                      # MailModule
├── notifications/             # NotificationsModule
├── subscriptions/             # SubscriptionsModule
├── promo/                     # PromoModule
└── health/                    # HealthModule
```

---

## 2. Схема базы данных

Все таблицы описаны в Prisma schema. Миграции — через `prisma migrate deploy`. Ниже — полная схема с комментариями.

### 2.1 Таблица users

```prisma
model User {
  id                  String     @id @default(uuid())
  email               String     @unique
  passwordHash        String
  isEmailVerified     Boolean    @default(false)
  locale              Locale     @default(EN)       // EN | RU
  level               Level      @default(BEGINNER) // BEGINNER | INTERMEDIATE | PRO
  preferredCategories Category[]                    // VISUAL | TECHNICAL | SOCIAL | RESTRICTION
  createdAt           DateTime   @default(now())
  updatedAt           DateTime   @updatedAt
  refreshTokens       RefreshToken[]
  emailTokens         EmailToken[]
  taskSessions        TaskSession[]
  journalEntries      JournalEntry[]
  userBadges          UserBadge[]
}
```

### 2.2 Таблица refresh_tokens

```prisma
model RefreshToken {
  id          String   @id @default(uuid())
  tokenHash   String   @unique          // bcrypt-хэш токена
  userId      String
  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  expiresAt   DateTime
  createdAt   DateTime @default(now())
  @@index([userId])
}
```

### 2.3 Таблица email_tokens

```prisma
model EmailToken {
  id          String         @id @default(uuid())
  tokenHash   String         @unique
  userId      String
  user        User           @relation(fields: [userId], references: [id], onDelete: Cascade)
  type        EmailTokenType // VERIFY_EMAIL | RESET_PASSWORD
  expiresAt   DateTime
  usedAt      DateTime?
  createdAt   DateTime       @default(now())
  @@index([userId])
}
```

### 2.4 Таблица tasks

```prisma
model Task {
  id             String   @id @default(uuid())
  title_ru       String
  title_en       String
  description_ru String
  description_en String
  tip_ru         String
  tip_en         String
  category       Category // VISUAL | TECHNICAL | SOCIAL | RESTRICTION
  level          Level    // BEGINNER | INTERMEDIATE | PRO
  durationMins   Int      // Рекомендуемое время: 30 | 60 | 90
  tags           String[]
  isActive       Boolean  @default(true)
  createdAt      DateTime @default(now())
  sessions       TaskSession[]
}
```

### 2.5 Таблица task_sessions

```prisma
model TaskSession {
  id           String        @id @default(uuid())
  userId       String
  user         User          @relation(fields: [userId], references: [id], onDelete: Cascade)
  taskId       String
  task         Task          @relation(fields: [taskId], references: [id])
  status       SessionStatus // ACTIVE | COMPLETED | SKIPPED | SAVED_FOR_LATER
  startedAt    DateTime      @default(now())
  completedAt  DateTime?
  journalEntry JournalEntry?
  @@index([userId])
  @@index([userId, status])
}
```

### 2.6 Таблица journal_entries

```prisma
model JournalEntry {
  id          String      @id @default(uuid())
  userId      String
  user        User        @relation(fields: [userId], references: [id], onDelete: Cascade)
  sessionId   String      @unique
  session     TaskSession @relation(fields: [sessionId], references: [id])
  note        String?     @db.VarChar(500)
  selfRating  SelfRating  // FAILED | PARTIAL | SUCCESS
  hasPhoto    Boolean     @default(false)  // фото хранится локально на устройстве
  createdAt   DateTime    @default(now())
  updatedAt   DateTime    @updatedAt
  @@index([userId])
}
```

### 2.7 Таблицы badges и user_badges

```prisma
model Badge {
  id          String      @id @default(uuid())
  key         String      @unique  // FIRST_STEP | WEEK | STREAK_3 | ALL_CATEGORIES
  name        String
  description String
  userBadges  UserBadge[]
}

model UserBadge {
  id       String   @id @default(uuid())
  userId   String
  user     User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  badgeId  String
  badge    Badge    @relation(fields: [badgeId], references: [id])
  earnedAt DateTime @default(now())
  @@unique([userId, badgeId])
}
```

### 2.8 Enums

```prisma
enum Level         { BEGINNER INTERMEDIATE PRO }
enum Category      { VISUAL TECHNICAL SOCIAL RESTRICTION }
enum SessionStatus { ACTIVE COMPLETED SKIPPED SAVED_FOR_LATER }
enum SelfRating    { FAILED PARTIAL SUCCESS }
enum EmailTokenType { VERIFY_EMAIL RESET_PASSWORD }
enum Locale        { EN RU }
enum Platform      { IOS ANDROID }
enum SubscriptionStatus { ACTIVE EXPIRED CANCELLED }
```

### 2.9 Таблица push_tokens

```prisma
model PushToken {
  id        String   @id @default(uuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  token     String   @unique          // Expo push token
  platform  Platform                  // IOS | ANDROID
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  @@index([userId])
}
```

### 2.10 Таблица subscriptions

```prisma
model Subscription {
  id              String             @id @default(uuid())
  userId          String
  user            User               @relation(fields: [userId], references: [id], onDelete: Cascade)
  platform        Platform?          // IOS | ANDROID | null (для промо)
  productId       String             // 'streeteye_premium_monthly' | 'promo_lifetime'
  transactionId   String             @unique  // ID транзакции магазина или 'promo_{promoCodeId}'
  receipt         String?            @db.Text  // null для промо
  status          SubscriptionStatus @default(ACTIVE) // ACTIVE | EXPIRED | CANCELLED
  expiresAt       DateTime
  createdAt       DateTime           @default(now())
  updatedAt       DateTime           @updatedAt
  @@index([userId])
  @@index([userId, status])
}
```

### 2.11 Таблица promo_codes

```prisma
model PromoCode {
  id        String    @id @default(uuid())
  code      String    @unique          // 8 символов, uppercase, A-Z0-9
  usedById  String?
  usedBy    User?     @relation(fields: [usedById], references: [id])
  usedAt    DateTime?
  expiresAt DateTime                   // срок действия кода (не подписки)
  createdAt DateTime  @default(now())
  @@index([code])
}
```

**Дополнение к модели User:** к связям User добавляются:

```prisma
  pushTokens      PushToken[]
  subscriptions   Subscription[]
  usedPromoCodes  PromoCode[]
```

---

## 3. AuthModule — авторизация

Реализует полный цикл: регистрация → подтверждение email → вход → обновление токенов → сброс пароля → выход. Без сторонних OAuth-провайдеров.

### 3.1 Эндпоинты

| Метод | Путь | Описание | Auth |
|---|---|---|---|
| POST | `/auth/register` | Регистрация, отправка письма подтверждения | Публичный |
| POST | `/auth/verify-email` | Подтверждение email по токену из письма | Публичный |
| POST | `/auth/login` | Вход, возврат access + refresh токенов | Публичный |
| POST | `/auth/refresh` | Обновление access токена по refresh | Refresh токен в теле |
| POST | `/auth/logout` | Инвалидация refresh токена | JWT |
| POST | `/auth/forgot-password` | Отправка письма для сброса пароля | Публичный |
| POST | `/auth/reset-password` | Установка нового пароля по токену | Публичный |
| POST | `/auth/resend-verify` | Повторная отправка письма подтверждения | Публичный |

### 3.2 Логика токенов

- **Access token** — JWT, TTL 15 минут, подписан HS256, payload: `{ sub, email, iat, exp }`
- **Refresh token** — случайная строка `crypto.randomBytes(64)`, хранится в БД как bcrypt-хэш, TTL 30 дней
- При каждом `/auth/refresh` старый refresh токен инвалидируется, выдаётся новый (rotation)
- При смене пароля — инвалидируются все refresh токены пользователя

### 3.3 Email-токены

- Генерируются через `crypto.randomBytes(32).toString('hex')`
- Хранятся в БД как bcrypt-хэш с TTL: verify-email — 24 часа, reset-password — 30 минут
- После использования — помечаются `usedAt`, повторное использование запрещено
- Rate limit на `/auth/resend-verify` и `/auth/forgot-password`: 3 запроса / 10 минут на IP

### 3.4 Защита от атак

| Вектор | Защита |
|---|---|
| Брутфорс пароля | Throttler: 5 попыток / 15 мин на IP. После блокировки — 429 с `Retry-After` |
| Спам регистраций | Email подтверждение обязательно. Аккаунт без verify — неактивен |
| Кража refresh токена | Хранится только хэш. Token rotation при каждом refresh. Detect reuse attack |
| SQL-инъекции | Prisma параметризованные запросы, raw SQL запрещён |
| XSS / clickjacking | Helmet: `Content-Security-Policy`, `X-Frame-Options`, `HSTS` |
| CORS | Whitelist: только домен мобильного клиента (задаётся через env `ALLOWED_ORIGINS`) |

### 3.5 DTO регистрации с данными онбординга

Регистрация происходит после онбординга. Клиент передаёт данные, собранные на экранах онбординга (язык, уровень, предпочтения), вместе с email и паролем. Это позволяет создать пользователя сразу с заполненным профилем — без дополнительного `PATCH /users/me`.

```typescript
class RegisterDto {
  @IsEmail()
  email: string;

  @IsString() @MinLength(8)
  password: string;

  @IsOptional() @IsEnum(Level)
  level?: Level;                  // из онбординга, экран 3. Default: BEGINNER

  @IsOptional() @IsArray() @IsEnum(Category, { each: true })
  @ArrayMinSize(1) @ArrayMaxSize(2)
  preferredCategories?: Category[];  // из онбординга, экран 4. Default: [VISUAL]

  @IsOptional() @IsEnum(Locale)
  locale?: Locale;                // из онбординга, экран 2. Default: EN
}
```

При регистрации: если `level`, `preferredCategories` или `locale` не переданы — используются значения по умолчанию из Prisma-схемы (`BEGINNER`, `EN`). Это поддерживает обратную совместимость — регистрация работает и без данных онбординга.

---

## 4. UsersModule — профиль пользователя

### 4.1 Эндпоинты

| Метод | Путь | Описание | Auth |
|---|---|---|---|
| GET | `/users/me` | Получить профиль текущего пользователя | JWT |
| PATCH | `/users/me` | Обновить level, preferredCategories, locale | JWT |
| PATCH | `/users/me/password` | Смена пароля (требует текущий пароль) | JWT |
| DELETE | `/users/me` | Удаление аккаунта и всех данных | JWT |

### 4.2 DTO: UpdateUserDto

```typescript
class UpdateUserDto {
  @IsOptional() @IsEnum(Level)
  level?: Level;

  @IsOptional() @IsArray() @IsEnum(Category, { each: true })
  @ArrayMinSize(1) @ArrayMaxSize(2)
  preferredCategories?: Category[];

  @IsOptional() @IsEnum(Locale)
  locale?: Locale;
}
```

### 4.3 Response: UserProfileDto

```typescript
class UserProfileDto {
  id:                   string;
  email:                string;
  isEmailVerified:      boolean;
  locale:               Locale;    // EN | RU
  level:                Level;
  preferredCategories:  Category[];
  createdAt:            string;    // ISO 8601
  stats: {
    totalCompleted:  number;
    currentStreak:   number;  // дней подряд
    badgesEarned:    number;
  };
}
```

---

## 5. TasksModule — задания

Задания хранятся в PostgreSQL. В MVP — 30 заданий, загружаются через seed-скрипт из JSON-файла. Контент не редактируется через API (нет CMS). Обновление контента — через новую миграцию.

### 5.1 Эндпоинты

| Метод | Путь | Описание | Auth | Параметры |
|---|---|---|---|---|
| GET | `/tasks/random` | Случайное задание для авторизованного пользователя | JWT | Фильтрует по level и categories из профиля. Исключает последние 5 |
| GET | `/tasks/random/guest` | Случайное задание для гостя (онбординг, экран 6) | Публичный | Query: `level`, `categories`, `locale`. Не исключает историю (у гостя её нет) |
| GET | `/tasks/:id` | Получить задание по ID | JWT | Используется для восстановления активной сессии |
| GET | `/tasks` | Список заданий с фильтрацией | JWT | Query: `level`, `category`, `tags`. Пагинация: `page`, `limit` (max 50) |

### 5.2 Логика /tasks/random (авторизованный)

1. Читает уровень и `preferredCategories` из профиля пользователя
2. Получает ID последних 5 заданий пользователя из `task_sessions`
3. Делает запрос к БД: `WHERE level = :level AND category IN (:categories) AND id NOT IN (:recentIds) AND isActive = true ORDER BY RANDOM() LIMIT 1`
4. Если результат пуст (все задания просмотрены) — убирает фильтр `recentIds`, повторяет запрос
5. **Не создаёт сессию.** Возвращает задание без фиксации — пользователь может нажать «Другое задание» несколько раз (Free: 1 раз, Premium: 3 раза за сессию приложения)
6. Перед отдачей: разрешает локаль из заголовка `Accept-Language` (en | ru, fallback → en). Возвращает `title`, `description`, `tip` уже на нужном языке — клиент не знает о полях `_ru`/`_en` в БД

### 5.3 Логика /tasks/random/guest (гостевой)

Публичный эндпоинт для выдачи первого задания на экране 6 онбординга — до регистрации.

1. Читает `level`, `categories`, `locale` из query-параметров (обязательные)
2. Делает запрос к БД: `WHERE level = :level AND category IN (:categories) AND isActive = true ORDER BY RANDOM() LIMIT 1`
3. Не исключает последние задания (у гостя нет истории сессий)
4. Не создаёт сессию (гость не может иметь сессию)
5. Разрешает локаль из query-параметра `locale` (не из `Accept-Language`, т.к. гость выбрал язык в онбординге явно)
6. Возвращает `TaskDto` — тот же формат, что и для авторизованных

**Валидация query-параметров:**

```typescript
class GuestRandomTaskQueryDto {
  @IsEnum(Level)
  level: Level;

  @IsArray() @IsEnum(Category, { each: true })
  @ArrayMinSize(1) @ArrayMaxSize(2)
  categories: Category[];

  @IsEnum(Locale)
  locale: Locale;
}
```

**Rate limit:** 5 запросов / 15 мин на IP — жёстче, чем для авторизованных, чтобы защититься от парсинга без аккаунта.

### 5.4 Response: TaskDto

```typescript
class TaskDto {
  id:           string;
  title:        string;  // уже выбранная локаль по Accept-Language или query locale
  description:  string;  // бэкенд разрешает нужный язык до отдачи клиенту
  tip:          string;
  category:     Category;
  level:        Level;
  durationMins: number;
  tags:         string[];
}
```

---

## 6. SessionsModule — сессии заданий

`TaskSession` — связь между пользователем и заданием. Фиксирует статус прохождения: `ACTIVE` → `COMPLETED` | `SKIPPED` | `SAVED_FOR_LATER`.

### 6.1 Эндпоинты

| Метод | Путь | Описание |
|---|---|---|
| POST | `/sessions` | Создать сессию для задания. Вызывается при нажатии «Взять это» или автоматически после регистрации гостя для миграции задания из онбординга. Тело: `{ taskId }`. Возвращает `TaskSessionDto`. Запрещено, если уже есть `ACTIVE` сессия |
| GET | `/sessions/active` | Активная сессия пользователя. Возвращает `TaskSessionDto` или 404 |
| PATCH | `/sessions/:id` | Обновить статус сессии: `COMPLETED` \| `SKIPPED` \| `SAVED_FOR_LATER`. Возвращает обновлённый `TaskSessionDto` |
| GET | `/sessions` | История сессий с вложенным заданием. Query: `status`, `limit` (max 50), `cursor` (cursor-based pagination). Возвращает `TaskSessionDto[]` |

**Сценарий миграции гостевого задания:** после регистрации клиент вызывает `POST /sessions` с `taskId` задания из онбординга, затем сразу `PATCH /sessions/:id` с `status: COMPLETED`. С точки зрения бэкенда это обычные вызовы — специальной логики миграции не требуется. Вся оркестрация на стороне клиента.

### 6.1a Response: TaskSessionDto

Все эндпоинты SessionsModule возвращают сессию с вложенным заданием. Клиенту не нужно делать дополнительных запросов для получения данных задания. Бэкенд разрешает локаль задания по `Accept-Language` перед отдачей — клиент получает `title`, `description`, `tip` на нужном языке.

```typescript
class TaskSessionDto {
  id:          string;
  status:      SessionStatus;  // ACTIVE | COMPLETED | SKIPPED | SAVED_FOR_LATER
  startedAt:   string;         // ISO 8601
  completedAt: string | null;  // ISO 8601, null для ACTIVE и SAVED_FOR_LATER
  task: {
    id:           string;
    title:        string;      // уже на нужной локали
    description:  string;
    tip:          string;
    category:     Category;
    level:        Level;
    durationMins: number;
    tags:         string[];
  };
}
```

Реализация через Prisma: `include: { task: true }` в каждом запросе SessionsModule. Поля `_ru`/`_en` разрешаются в `TaskSessionDto` через тот же `LocaleInterceptor`, что используется в TasksModule.

### 6.2 Правила статусов

- Только одна `ACTIVE` сессия на пользователя одновременно
- Переход `ACTIVE` → `COMPLETED` запускает `BadgesModule.checkAndAward(userId)`
- Переход `ACTIVE` → `SKIPPED` — задание засчитывается как пропущенное, не влияет на streak
- `SAVED_FOR_LATER` — задание сохраняется, пользователь может взять новое
- Нельзя изменить статус уже закрытой сессии (`COMPLETED` / `SKIPPED`)

---

## 7. JournalModule — дневник

Каждая запись привязана к сессии (1:1). Создаётся при завершении задания. Фото хранится локально на устройстве — бэкенд хранит только флаг `hasPhoto`.

### 7.1 Эндпоинты

| Метод | Путь | Описание |
|---|---|---|
| POST | `/journal` | Создать запись. Вызывается при `COMPLETED` сессии. `sessionId` обязателен |
| GET | `/journal` | Список записей. Query: `category`, `selfRating`, `limit`, `cursor` |
| GET | `/journal/:id` | Запись по ID (только своя) |
| PATCH | `/journal/:id` | Обновить заметку / `selfRating` / `hasPhoto` |
| DELETE | `/journal/:id` | Удалить запись |
| GET | `/journal/stats` | Агрегированная статистика: всего, по категориям, текущий streak |

### 7.2 DTO: CreateJournalEntryDto

```typescript
class CreateJournalEntryDto {
  @IsUUID()
  sessionId: string;

  @IsOptional() @IsString() @MaxLength(500)
  note?: string;

  @IsEnum(SelfRating)
  selfRating: SelfRating;

  @IsOptional() @IsBoolean()
  hasPhoto?: boolean;
}
```

### 7.3 Response: JournalStatsDto

```typescript
class JournalStatsDto {
  totalCompleted:  number;
  totalSkipped:    number;
  currentStreak:   number;  // дней подряд с выполненным заданием
  longestStreak:   number;
  byCategory: {
    VISUAL:       number;
    TECHNICAL:    number;
    SOCIAL:       number;
    RESTRICTION:  number;
  };
  byRating: {
    SUCCESS: number;
    PARTIAL: number;
    FAILED:  number;
  };
}
```

### 7.4 Логика streak

- Streak — количество календарных дней подряд, в которых есть хотя бы одна `COMPLETED` сессия
- Считается по UTC-дате `completedAt`
- День засчитывается в streak, если в нём есть хотя бы одна `COMPLETED` сессия — наличие `SKIPPED` сессий в тот же день не влияет на streak
- День без единой `COMPLETED` сессии обнуляет streak, даже если в этот день есть `SKIPPED` задания
- Если последнее выполненное задание было вчера или сегодня — streak продолжается
- Вычисляется при каждом запросе `/journal/stats` (не хранится как отдельное поле, кэшируется в Redis на 5 минут)

---

## 8. BadgesModule — бейджи

Бейджи выдаются автоматически при завершении задания. Логика проверки вызывается из `SessionsModule` при переходе в статус `COMPLETED`.

### 8.1 Эндпоинты

| Метод | Путь | Описание |
|---|---|---|
| GET | `/badges` | Все бейджи с признаком earned/not earned для текущего пользователя |
| GET | `/badges/earned` | Только полученные бейджи с датой получения |

### 8.2 Условия получения

| Ключ бейджа | Условие | Проверка |
|---|---|---|
| `FIRST_STEP` | Первое выполненное задание | `COUNT(sessions WHERE status=COMPLETED) >= 1` |
| `WEEK` | 7 выполненных заданий (любой период) | `COUNT(sessions WHERE status=COMPLETED) >= 7` |
| `STREAK_3` | 3 дня подряд | `currentStreak >= 3` из JournalStats |
| `ALL_CATEGORIES` | По одному в каждой категории | `COUNT(DISTINCT category WHERE COMPLETED) = 4` |

### 8.3 Логика checkAndAward

1. Получает список бейджей, которых у пользователя ещё нет
2. Для каждого отсутствующего бейджа — проверяет условие через БД-запрос
3. Если условие выполнено — создаёт запись в `user_badges`
4. Возвращает массив новых бейджей (может быть пустым)

Вызов асинхронный, не блокирует ответ на `PATCH /sessions/:id`.

---

## 8a. NotificationsModule — push-уведомления

Push-уведомления отправляются через Expo Push API. Бэкенд хранит push-токены устройств и формирует уведомления на нужном языке по полю `locale` пользователя.

### 8a.1 Эндпоинты

| Метод | Путь | Описание | Auth |
|---|---|---|---|
| POST | `/users/me/push-token` | Сохранить или обновить push-токен устройства. Тело: `{ token, platform }` | JWT |
| DELETE | `/users/me/push-token` | Удалить push-токен (при выходе из аккаунта) | JWT |

### 8a.2 DTO: SavePushTokenDto

```typescript
class SavePushTokenDto {
  @IsString()
  token: string;  // Expo push token: ExponentPushToken[...]

  @IsEnum(Platform)
  platform: Platform;  // IOS | ANDROID
}
```

### 8a.3 Типы уведомлений

| Тип | Триггер | Формируется | Текст (пример) |
|---|---|---|---|
| Ежедневное напоминание | Cron-задача по расписанию пользователя | Бэкенд | «Время выйти на улицу. Новое задание ждёт» |
| Бейдж получен | После `checkAndAward` при выдаче нового бейджа | Бэкенд | «Новый бейдж: Серия x3 🔥» |
| Streak под угрозой | Cron в 20:00 UTC, если нет `COMPLETED` за сегодня | Бэкенд | «Серия прервётся сегодня. Успейте выполнить задание» |
| Таймер задания | Локальное уведомление на устройстве | Клиент | «Время вышло. Как прошла съёмка?» |

### 8a.4 Отправка через Expo Push API

```typescript
// notifications/notifications.service.ts
async sendPush(userId: string, titleKey: string, bodyKey: string, data?: Record<string, string>): Promise<void> {
  const user = await this.usersService.findById(userId);
  const tokens = await this.prisma.pushToken.findMany({ where: { userId } });
  if (!tokens.length) return;

  const locale = user.locale.toLowerCase(); // 'en' | 'ru'
  const title = this.i18n.t(titleKey, { lng: locale });
  const body = this.i18n.t(bodyKey, { lng: locale });

  await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(tokens.map(t => ({
      to: t.token,
      title,
      body,
      data,
    }))),
  });
}
```

### 8a.5 Cron-задачи

Используется `@nestjs/schedule` (cron):

- **Ежедневное напоминание** — `0 10 * * *` (10:00 UTC). Отправляется пользователям, у которых нет `ACTIVE` или `COMPLETED` сессии за сегодня
- **Streak под угрозой** — `0 20 * * *` (20:00 UTC). Отправляется пользователям с `currentStreak >= 1`, у которых нет `COMPLETED` за сегодня

---

## 8b. SubscriptionsModule — подписки и монетизация

> **🚫 MVP Launch Policy (v1.6): модуль деактивирован при запуске**
>
> `SubscriptionsModule` **реализован** и присутствует в кодовой базе, но **не применяет ограничения** на период первичного запуска MVP. Управляется переменной окружения `MONETIZATION_ENABLED`.
>
> **Поведение при `MONETIZATION_ENABLED=false` (режим запуска):**
> - `GET /subscriptions/status` возвращает `isPremium: true` для всех пользователей
> - Лимиты (`tasksPerMonth`, `anotherTaskPerSession`, `journalEntriesVisible`) не применяются
> - `UserProfileDto.isPremium` всегда `true` — клиент снимает все ограничения
> - Эндпоинты `/subscriptions/verify` и `/subscriptions/restore` принимают запросы, но возвращают успех без реальной верификации через App Store / Google Play
>
> **Как включить монетизацию (v1.1):**
> 1. Установить `MONETIZATION_ENABLED=true` в env
> 2. Добавить `APPLE_SHARED_SECRET` и `GOOGLE_SERVICE_ACCOUNT_KEY` в env
> 3. Проверить флоу: достижение лимита → paywall → покупка → верификация → снятие лимита
>
> Переменная `MONETIZATION_ENABLED` проверяется в `SubscriptionsService.getStatus()` и в guard `PremiumGuard` (если используется).

Управляет статусом подписки пользователя. Верифицирует покупки через App Store / Google Play. Предоставляет информацию о лимитах Free/Premium плана.

### 8b.1 Эндпоинты

| Метод | Путь | Описание | Auth |
|---|---|---|---|
| POST | `/subscriptions/verify` | Верифицировать покупку. Тело: `{ receipt, platform, productId }` | JWT |
| GET | `/subscriptions/status` | Текущий статус подписки и лимиты | JWT |
| POST | `/subscriptions/restore` | Восстановить покупку (проверяет receipt заново) | JWT |

### 8b.2 Логика верификации покупки

1. Получает `receipt` и `platform` от клиента
2. Для iOS — валидирует receipt через Apple App Store Server API
3. Для Android — валидирует через Google Play Developer API
4. При успехе — создаёт или обновляет запись в таблице `subscriptions`
5. Возвращает обновлённый статус подписки

### 8b.3 DTO: VerifyPurchaseDto

```typescript
class VerifyPurchaseDto {
  @IsString()
  receipt: string;

  @IsEnum(Platform)
  platform: Platform;  // IOS | ANDROID

  @IsString()
  productId: string;   // 'streeteye_premium_monthly'
}
```

### 8b.4 Response: SubscriptionStatusDto

```typescript
class SubscriptionStatusDto {
  isPremium:        boolean;
  plan:             'free' | 'premium';
  expiresAt:        string | null;  // ISO 8601, null для Free
  limits: {
    tasksPerMonth:       number;  // Free: 10, Premium: unlimited (-1)
    anotherTaskPerSession: number;  // Free: 1, Premium: 3
    journalEntriesVisible: number;  // Free: 10, Premium: unlimited (-1)
  };
}
```

### 8b.5 Лимиты Free / Premium

| Параметр | Free | Premium ($3.99/мес) |
|---|---|---|
| Задания в месяц | 10 | Без ограничений |
| «Другое задание» за сессию | 1 | 3 |
| Записи дневника | Последние 10 | Полная история |
| Бейджи | 2 из 4 | Все 4 |
| Пробный период | — | 7 дней бесплатно |

### 8b.6 Дополнение к UserProfileDto

Поле `isPremium` добавляется в ответ `GET /users/me`:

```typescript
class UserProfileDto {
  // ... существующие поля ...
  isPremium:            boolean;    // true если есть активная подписка
  subscriptionExpiresAt: string | null;
}
```

Значение `isPremium` вычисляется: `EXISTS(subscription WHERE userId = :id AND status = 'ACTIVE' AND expiresAt > NOW())`.

---

## 8c. PromoModule — промокоды

> **🚫 MVP Launch Policy (v1.6): модуль деактивирован при запуске**
>
> `PromoModule` **реализован**, но точки входа (`POST /promo/redeem`) недоступны пользователям при `MONETIZATION_ENABLED=false`. Административные эндпоинты (`POST /promo/generate`, `GET /promo/list`) работают в любом режиме — промокоды можно готовить заранее. Включается вместе с `SubscriptionsModule` при переходе к v1.1.

Промокоды — альтернатива подписке через App Store / Google Play. Каждый код одноразовый, даёт lifetime Premium. Создаются через защищённый API-эндпоинт. Отзыв кода в MVP не реализуется.

### 8c.1 Эндпоинты

| Метод | Путь | Описание | Auth |
|---|---|---|---|
| POST | `/promo/redeem` | Активировать промокод. Тело: `{ code }` | JWT |
| POST | `/promo/generate` | Создать N промокодов. Тело: `{ count, expiresAt }` | API-ключ (`X-Admin-Key` header) |
| GET | `/promo/list` | Список всех промокодов (с фильтрацией по статусу) | API-ключ (`X-Admin-Key` header) |

### 8c.2 Логика активации (`POST /promo/redeem`)

1. Получает `code` из тела запроса. Приводит к uppercase, убирает пробелы
2. Ищет в БД: `WHERE code = :code AND usedById IS NULL AND expiresAt > NOW()`
3. Если код не найден → `PROMO_CODE_INVALID` (404)
4. Если код уже использован → `PROMO_CODE_ALREADY_USED` (409)
5. Если код истёк → `PROMO_CODE_EXPIRED` (410)
6. Если у пользователя уже есть активная подписка → `ALREADY_PREMIUM` (409)
7. В одной транзакции:
   - Обновляет `promo_codes`: `usedById = userId`, `usedAt = NOW()`
   - Создаёт запись в `subscriptions`: `productId = 'promo_lifetime'`, `transactionId = 'promo_{promoCodeId}'`, `platform = null`, `receipt = null`, `expiresAt = 2099-12-31`, `status = ACTIVE`
8. Возвращает `SubscriptionStatusDto` с обновлённым статусом

### 8c.3 Логика генерации (`POST /promo/generate`)

Защищён заголовком `X-Admin-Key` — значение из env `ADMIN_API_KEY`. Без валидного ключа → 401.

```typescript
class GeneratePromoDto {
  @IsInt() @Min(1) @Max(100)
  count: number;               // сколько кодов создать

  @IsDateString()
  expiresAt: string;           // срок действия кодов (ISO 8601)
}
```

Генерация кода:

```typescript
function generatePromoCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // без 0/O/1/I — исключены для читаемости
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars[crypto.randomInt(chars.length)];
  }
  return code; // Пример: 'K7X2NP4G'
}
```

Возвращает массив созданных кодов.

### 8c.4 DTO и Response

```typescript
class RedeemPromoDto {
  @IsString() @Length(8, 8)
  code: string;
}

// Response на POST /promo/redeem — SubscriptionStatusDto (тот же, что в 8b.4)

// Response на POST /promo/generate
class GeneratePromoResponseDto {
  codes: string[];     // массив созданных кодов
  count: number;
  expiresAt: string;   // ISO 8601
}

// Response на GET /promo/list
class PromoCodeDto {
  id:        string;
  code:      string;
  usedBy:    string | null;   // email пользователя или null
  usedAt:    string | null;
  expiresAt: string;
  createdAt: string;
}
```

### 8c.5 Коды ошибок

| Код | HTTP | Когда |
|---|---|---|
| `PROMO_CODE_INVALID` | 404 | Код не существует |
| `PROMO_CODE_ALREADY_USED` | 409 | Код уже активирован другим пользователем |
| `PROMO_CODE_EXPIRED` | 410 | Срок действия кода истёк |
| `ALREADY_PREMIUM` | 409 | У пользователя уже есть активная подписка |

---

## 9. Глобальные механизмы

### 9.1 Формат ответов

Все успешные ответы оборачиваются через `TransformInterceptor`:

```json
{
  "success": true,
  "data": { ... },
  "meta": { "timestamp": "2026-03-01T10:00:00Z" }
}
```

Пагинация (cursor-based):

```json
{
  "success": true,
  "data": [ ... ],
  "meta": {
    "nextCursor": "uuid-строка или null",
    "hasMore": true
  }
}
```

### 9.2 Формат ошибок

`GlobalExceptionFilter` обрабатывает все исключения:

```json
{
  "success": false,
  "error": {
    "code":    "INVALID_CREDENTIALS",
    "message": "Неверный email или пароль",
    "details": []
  },
  "meta": { "timestamp": "..." }
}
```

Коды ошибок:

| Код | HTTP | Когда |
|---|---|---|
| `VALIDATION_ERROR` | 400 | Ошибка валидации DTO |
| `INVALID_CREDENTIALS` | 401 | Неверный email/пароль |
| `EMAIL_NOT_VERIFIED` | 403 | Email не подтверждён |
| `TOKEN_EXPIRED` | 401 | Истёкший токен |
| `TOKEN_INVALID` | 401 | Невалидный токен |
| `NOT_FOUND` | 404 | Ресурс не найден |
| `FORBIDDEN` | 403 | Нет доступа к чужому ресурсу |
| `ACTIVE_SESSION_EXISTS` | 409 | Уже есть активная сессия задания |
| `PROMO_CODE_INVALID` | 404 | Промокод не существует |
| `PROMO_CODE_ALREADY_USED` | 409 | Промокод уже активирован |
| `PROMO_CODE_EXPIRED` | 410 | Срок действия промокода истёк |
| `ALREADY_PREMIUM` | 409 | У пользователя уже есть активная подписка |
| `RATE_LIMIT_EXCEEDED` | 429 | Превышен лимит запросов |
| `INTERNAL_ERROR` | 500 | Внутренняя ошибка сервера |

### 9.3 Rate limiting

| Эндпоинт / группа | Лимит | Комментарий |
|---|---|---|
| Все эндпоинты (глобально) | 100 / мин на IP | Базовая защита от флуда |
| `POST /auth/login` | 5 / 15 мин на IP | Защита от брутфорса пароля |
| `POST /auth/register` | 10 / час на IP | Защита от массовой регистрации |
| `POST /auth/forgot-password` | 3 / 10 мин на IP | Защита от спама email |
| `POST /auth/resend-verify` | 3 / 10 мин на IP | Защита от спама email |
| `GET /tasks/random` | 10 / мин на user | Лимит на переключение заданий |
| `GET /tasks/random/guest` | 5 / 15 мин на IP | Жёсткий лимит для неавторизованных — защита от парсинга |
| `POST /subscriptions/verify` | 5 / мин на user | Защита от спама верификации |
| `POST /users/me/push-token` | 5 / мин на user | Защита от спама токенов |
| `POST /promo/redeem` | 5 / 15 мин на user | Защита от перебора промокодов |
| `POST /promo/generate` | 10 / мин на IP | Защита генерации (доступ по API-ключу) |

### 9.4 Переменные окружения

```bash
# Приложение
NODE_ENV=production
PORT=3000
ALLOWED_ORIGINS=https://streeteye.app

# База данных
DATABASE_URL=postgresql://user:pass@postgres:5432/streeteye

# Redis
REDIS_URL=redis://redis:6379

# JWT
JWT_ACCESS_SECRET=<случайная строка 64+ символа>
JWT_REFRESH_SECRET=<случайная строка 64+ символа>
JWT_ACCESS_TTL=900        # 15 минут в секундах
JWT_REFRESH_TTL=2592000   # 30 дней в секундах

# Email
RESEND_API_KEY=re_xxxxxxxxxxxx
RESEND_FROM=noreply@streeteye.app

# Ссылки в письмах
APP_BASE_URL=https://streeteye.app

# Локализация
DEFAULT_LOCALE=en             # fallback если Accept-Language не поддерживается
SUPPORTED_LOCALES=en,ru       # список через запятую — валидируется при старте

# Push-уведомления (Expo)
EXPO_ACCESS_TOKEN=<токен для Expo Push API>

# In-App Purchases
# При MONETIZATION_ENABLED=false — верификация не выполняется, isPremium всегда true
MONETIZATION_ENABLED=false
APPLE_SHARED_SECRET=<shared secret для верификации App Store receipts>
GOOGLE_SERVICE_ACCOUNT_KEY=<путь к JSON-ключу сервисного аккаунта Google Play>

# Промокоды (админский доступ)
ADMIN_API_KEY=<случайная строка 64+ символа для заголовка X-Admin-Key>
```

### 9.5 Конфигурация ConfigModule

Все переменные валидируются через Joi при старте приложения. Если обязательная переменная отсутствует — приложение не запустится с понятной ошибкой. Это предотвращает запуск с неполной конфигурацией в продакшене.

---

## 10. Инфраструктура и деплой

### 10.1 Docker Compose (dev)

```yaml
version: '3.9'
services:
  api:
    build: .
    ports: ['3000:3000']
    volumes: ['./src:/app/src']   # hot reload
    env_file: .env
    depends_on: [postgres, redis]
  postgres:
    image: postgres:16-alpine
    volumes: ['pgdata:/var/lib/postgresql/data']
    environment:
      POSTGRES_DB: streeteye
      POSTGRES_USER: streeteye
      POSTGRES_PASSWORD: ${DB_PASSWORD}
  redis:
    image: redis:7-alpine
    volumes: ['redisdata:/data']
    command: redis-server --appendonly yes
volumes:
  pgdata:
  redisdata:
```

### 10.2 Dockerfile (production)

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npx prisma generate
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/prisma ./prisma
EXPOSE 3000
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main"]
```

### 10.3 GitHub Actions CI/CD

```yaml
# .github/workflows/deploy.yml
on:
  push:
    branches: [main]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - run: npm run test
      - run: npm run test:e2e
  deploy:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - name: Deploy to VPS
        run: |
          ssh user@vps 'cd /app && git pull && docker-compose up -d --build'
```

### 10.4 Health check

```
GET /health
→ 200 { status: 'ok', db: 'up', redis: 'up', uptime: 12345 }
```

Используется для мониторинга. Доступен без авторизации.

---

## 11. Тестирование

### 11.1 Стратегия

| Уровень | Инструмент | Что покрываем |
|---|---|---|
| Unit | Jest | Бизнес-логика: streak, badge conditions, token generation, randomizer |
| Integration | Jest + Prisma | Модули с реальной тестовой БД (test DB в Docker) |
| E2E | Supertest | Полный HTTP-цикл для критических флоу: register, login, task flow |

### 11.2 Обязательное покрытие

- `AuthModule`: регистрация → verify → login → refresh → logout (happy path + все ошибки)
- `AuthModule`: регистрация с данными онбординга (`level`, `preferredCategories`, `locale` в теле `POST /auth/register`)
- `AuthModule`: forgot-password → reset-password флоу
- `AuthModule`: rate limiting (мок throttler)
- `TasksModule`: логика `/tasks/random` (исключение последних 5, fallback при пустом результате)
- `TasksModule`: логика `/tasks/random/guest` (валидация query-параметров, rate limit по IP, корректная локаль)
- `SessionsModule`: создание сессии (`POST /sessions`), переход статусов, запрет двух активных сессий
- `JournalModule`: вычисление streak (граничные случаи: один день, пропуск, SKIPPED + COMPLETED в один день, длинная серия)
- `BadgesModule`: каждое условие бейджа отдельно
- `SubscriptionsModule`: верификация покупки, проверка статуса, истечение подписки
- `NotificationsModule`: сохранение/удаление push-токена, формирование уведомления по локали
- `PromoModule`: генерация кодов (уникальность, формат), активация (happy path, уже использован, истёк, уже Premium), защита API-ключом

### 11.3 Тестовая БД

В CI поднимается отдельный PostgreSQL контейнер. Перед каждым тестовым суитом — `prisma migrate reset --force`. Тесты изолированы, не зависят от порядка запуска.

---

## 12. План реализации бэкенда

Бэкенд разрабатывается параллельно с мобильным приложением. Каждый этап заканчивается работающим API, который можно тестировать через Postman/Insomnia.

| Неделя | Модуль | Задачи | Результат |
|---|---|---|---|
| 1 | Фундамент | Инициализация NestJS, TypeScript конфиг; Docker Compose: postgres + redis + api; Prisma setup, schema.prisma, первая миграция; ConfigModule с Joi-валидацией env | Запускающийся проект с БД |
| 2 | Безопасность | Helmet, CORS, GlobalExceptionFilter; TransformInterceptor (формат ответов); @nestjs/throttler глобально + per-route; HealthModule | `GET /health` возвращает 200 |
| 3–4 | AuthModule | UsersModule (CRUD профиля); Passport Local Strategy, bcrypt; JWT access + refresh tokens (PostgreSQL); MailModule + Resend + шаблоны писем на ru и en; Все 9 auth эндпоинтов + unit + e2e тесты | Полный цикл auth работает |
| 5–6 | TasksModule | Модель Task с полями `_ru`/`_en`, seed-скрипт (30 заданий, JSON с ru + en контентом); SessionsModule: `POST /sessions` для создания сессии, статусы, активная сессия; `GET /tasks/random` с логикой исключений и разрешением локали по Accept-Language; Тесты логики randomizer | Мобильное приложение может получать задания |
| 7 | JournalModule | CRUD записей дневника; `GET /journal/stats` со streak-логикой; Redis кэш для stats (5 мин); Тесты граничных случаев streak | Дневник полностью работает |
| 8 | BadgesModule + NotificationsModule | 4 бейджа, checkAndAward логика; Seed бейджей в БД; Push-токены (`POST /users/me/push-token`); Cron-задачи напоминаний и streak-уведомлений; Тесты условий бейджей | Бейджи и push-уведомления работают |
| 9 | SubscriptionsModule + PromoModule | Верификация покупок App Store / Google Play; `GET /subscriptions/status` (возвращает `isPremium: true` при `MONETIZATION_ENABLED=false`); лимиты Free/Premium (применяются только при `MONETIZATION_ENABLED=true`); `isPremium` в `UserProfileDto`; таблица `promo_codes`, генерация и активация промокодов, `POST /promo/redeem` (заблокирован при `MONETIZATION_ENABLED=false`), `POST /promo/generate` с API-ключом; тесты верификации, лимитов и промокодов | Монетизация реализована и готова к включению в v1.1 |
| 10 | Полировка | E2E тесты всех критических флоу; GitHub Actions CI/CD пайплайн; Деплой на VPS, prod Docker Compose; Нагрузочный тест (Artillery): 100 rps; Документация API (Swagger через @nestjs/swagger) | Бэкенд готов к публичному запуску |

---

## 13. Локализация (i18n)

Бэкенд поддерживает два языка: English (en) и Русский (ru). Логика локализации полностью на стороне бэкенда — клиент получает уже разрешённый текст и не знает о структуре хранения.

### 13.1 Схема хранения переводов в БД

- Таблица `tasks`: поля `title_ru`, `title_en`, `description_ru`, `description_en`, `tip_ru`, `tip_en`
- Таблица `users`: поле `locale` (enum `Locale { EN RU }`), `@default(EN)`
- Seed-файл заданий: `tasks.seed.json` содержит оба языка для каждого задания

### 13.2 Разрешение локали на запросе

`LocaleInterceptor` — глобальный interceptor, определяет язык для каждого запроса по приоритету:

1. Заголовок `Accept-Language` в запросе (приоритет мобильного клиента)
2. Поле `locale` из профиля авторизованного пользователя (если нет заголовка)
3. `DEFAULT_LOCALE` из env (fallback — en)

Если значение из `Accept-Language` не входит в `SUPPORTED_LOCALES` — применяется fallback. Неподдерживаемый язык не возвращает ошибку, а тихо деградирует до дефолта.

### 13.3 Локализация email-писем

- Каждый тип письма имеет два шаблона Resend: `verify-email.ru.html` / `verify-email.en.html`, `reset-password.ru.html` / `reset-password.en.html`
- `MailService.send()` принимает параметр `locale` и выбирает нужный шаблон автоматически
- При регистрации язык письма берётся из `Accept-Language` запроса. После авторизации — из `user.locale`

### 13.4 Добавление нового языка (v1.x)

Для добавления нового языка (например, казахский — kz) нужно:

1. Добавить `KZ` в enum `Locale` в `schema.prisma`, создать миграцию
2. Добавить поля `title_kz`, `description_kz`, `tip_kz` в таблицу `tasks`, заполнить через миграцию данных
3. Добавить `kz` в `SUPPORTED_LOCALES` в env — без изменения кода приложения
4. Создать email-шаблоны `*.kz.html` в `MailService`

---

## Итого

Бэкенд StreetEye MVP — 11 модулей, 41 эндпоинт, полная схема БД из 11 таблиц. Без внешних платных зависимостей: авторизация самописная, email через бесплатный tier Resend, инфраструктура на VPS от $5/месяц.

| Параметр | Значение | Комментарий |
|---|---|---|
| Модулей | 11 | Auth, Users, Tasks, Sessions, Journal, Badges, Mail, Notifications, Subscriptions, Promo, Health |
| Эндпоинтов | 41 | Полный API для мобильного клиента, включая гостевой доступ, push-токены, подписки и промокоды. При запуске MVP эндпоинты подписок/промокодов не применяют ограничений (`MONETIZATION_ENABLED=false`) |
| Таблиц в БД | 11 | Users, RefreshTokens, EmailTokens, Tasks, Sessions, Journal, Badges, UserBadges, PushTokens, Subscriptions, PromoCodes |
| Поддерживаемые языки | 2 | EN (default) + RU. Accept-Language + locale в профиле + env fallback |
| Платные зависимости | 0 | Resend: 3 000 писем/мес бесплатно — хватит на MVP |
| Срок разработки | 10 недель | 1 backend-разработчик, параллельно с мобилкой |
| Стоимость хостинга | от $5/мес | VPS Hetzner CX22 (2 vCPU, 4 GB RAM) — хватит до 10K users |

---

*StreetEye Backend TZ v1.6 · Апрель 2026*
