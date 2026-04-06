# StreetEye — Техническое задание: Мобильное приложение MVP

> **Версия:** 1.5 · Апрель 2026
> **Платформы:** iOS 16+, Android 13+
> **Фреймворк:** React Native + Expo SDK 51
> **Срок разработки:** 10 недель
> **Связанные docs:** StreetEye MVP Specification v1.4, StreetEye Backend TZ v1.4

---

## 1. Обзор

Мобильное приложение — единственная точка контакта пользователя с продуктом. Бэкенд существует для его обслуживания. Всё, что видит и делает пользователь, описано в этом документе.

Принцип разработки: приложение должно работать на улице, одной рукой, в кармане. Каждый экран проверяется вопросом: «Удобно ли это на ходу, при ярком солнце, в перчатках?»

### 1.1 Стек технологий

| Компонент | Технология | Версия / пакет |
|---|---|---|
| Фреймворк | React Native + Expo | `expo ~51.0` |
| Навигация | Expo Router | `expo-router ~3.5` |
| Язык | TypeScript | `typescript ^5` |
| Состояние | Zustand | `zustand ^4` |
| Сетевые запросы | TanStack Query | `@tanstack/react-query ^5` |
| HTTP-клиент | Axios | `axios ^1.6` |
| Локальная БД | Expo SQLite | `expo-sqlite ~13` |
| Локальное хранение | Expo SecureStore + AsyncStorage | `expo-secure-store ~13`, `@react-native-async-storage/async-storage ^1.23` |
| Локализация | i18next + react-i18next | `i18next ^23`, `react-i18next ^14` |
| Определение языка | expo-localization | `expo-localization ~15` |
| Push-уведомления | Expo Notifications | `expo-notifications ~0.27` |
| In-App Purchase | expo-in-app-purchases | `expo-in-app-purchases ~14` |
| Работа с фото | expo-image-picker | `expo-image-picker ~15` |
| Анимации | React Native Reanimated | `react-native-reanimated ~3.10` |
| Иконки | @expo/vector-icons | `@expo/vector-icons ^14` — иконки aperture, lock, eye, mail |
| Crashlytics | @react-native-firebase/crashlytics | `^20` |
| Тесты | Jest + React Native Testing Library | `jest ^29`, `@testing-library/react-native ^12` |

### 1.2 Структура проекта

```
app/
├── (auth)/
│   ├── login.tsx
│   └── register.tsx
├── (onboarding)/
│   ├── welcome.tsx
│   ├── language.tsx
│   ├── level.tsx
│   ├── preferences.tsx
│   ├── notifications.tsx
│   └── first-task.tsx
├── (tabs)/
│   ├── index.tsx          # главный экран / задание
│   ├── journal.tsx        # дневник
│   └── profile.tsx        # профиль
├── task/
│   └── [id].tsx           # карточка задания
├── journal/
│   └── [id].tsx           # запись дневника
├── paywall.tsx
└── _layout.tsx

components/
├── ui/                    # переиспользуемые компоненты
├── auth/                  # RegisterSheet (bottom sheet быстрой регистрации)
├── task/                  # компоненты карточки задания
├── journal/               # компоненты дневника
└── onboarding/            # компоненты онбординга

store/
├── auth.store.ts
├── task.store.ts
├── journal.store.ts
└── settings.store.ts

lib/
├── api/                   # API-клиент, эндпоинты
├── i18n/                  # конфиги локализации
│   ├── locales/
│   │   ├── ru.json
│   │   └── en.json
│   └── index.ts
├── db/                    # SQLite-схема и запросы
└── hooks/                 # кастомные хуки

constants/
├── theme.ts               # цвета, отступы, типографика
└── config.ts              # BASE_URL, таймауты
```

### 1.3 Дизайн-система

Дизайн-система основана на существующих экранах регистрации и входа, разработанных в Pencil. Все токены ниже соответствуют реализованному дизайну и являются источником истины для всей разработки.

**Визуальный стиль:** тёмный нативный UI. Фон нейтральный тёмно-серый (не чёрный), акцент — фиолетовый. Системный шрифт — SF Pro (iOS) / Roboto (Android) через `System` font family. Компоненты следуют паттернам нативных мобильных приложений: pill-кнопки, скруглённые инпуты с иконками внутри.

**Цветовая палитра:**

| Токен | Hex | Применение |
|---|---|---|
| `bg` | `#1C1C1E` | Фон всех экранов |
| `bgSurface` | `#2C2C2E` | Фон инпутов, карточек |
| `bgElevated` | `#3A3A3C` | Hover/active состояния |
| `text` | `#FFFFFF` | Заголовки, основной текст |
| `textSecondary` | `#EBEBF5` с opacity 0.6 | Подзаголовки, подписи |
| `textMuted` | `#EBEBF5` с opacity 0.3 | Placeholder, hint-текст |
| `textDisabled` | `#EBEBF5` с opacity 0.18 | Неактивные элементы |
| `accent` | `#9B51E0` | Кнопки, ссылки, иконка логотипа |
| `accentPressed` | `#7B3DB8` | Состояние нажатия кнопки |
| `separator` | `#EBEBF5` с opacity 0.15 | Разделители «или» |
| `iconMuted` | `#EBEBF5` с opacity 0.4 | Иконки внутри инпутов |

**Типографика:**

| Токен | Размер | Weight | Применение |
|---|---|---|---|
| `displayLg` | 28px | 700 | Заголовки экранов («Создать аккаунт») |
| `displaySm` | 16px | 400 | Подзаголовки («Зарегистрируйтесь, чтобы начать») |
| `label` | 15px | 400 | Подписи полей («Email», «Пароль») |
| `body` | 17px | 400 | Текст в инпутах, основной текст |
| `bodySmall` | 15px | 400 | Вспомогательный текст («Нет аккаунта?») |
| `link` | 15px | 600 | Ссылки («Войти», «Зарегистрироваться», «Забыли пароль?») |
| `button` | 17px | 700 | Текст кнопок |

Семейство шрифтов: `System` (SF Pro на iOS, Roboto на Android) — не подключать кастомные шрифты, использовать нативный стек.

**Компоненты:**

```typescript
export const theme = {
  colors: {
    bg:             '#1C1C1E',
    bgSurface:      '#2C2C2E',
    bgElevated:     '#3A3A3C',
    text:           '#FFFFFF',
    textSecondary:  'rgba(235,235,245,0.6)',
    textMuted:      'rgba(235,235,245,0.3)',
    textDisabled:   'rgba(235,235,245,0.18)',
    accent:         '#9B51E0',
    accentPressed:  '#7B3DB8',
    separator:      'rgba(235,235,245,0.15)',
    iconMuted:      'rgba(235,235,245,0.4)',
  },
  spacing: {
    xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48,
  },
  radius: {
    sm:   8,
    md:   12,   // инпуты
    lg:   16,
    pill: 100,  // кнопки
  },
  font: {
    family: 'System',
    displayLg:  { fontSize: 28, fontWeight: '700' as const },
    displaySm:  { fontSize: 16, fontWeight: '400' as const },
    label:      { fontSize: 15, fontWeight: '400' as const },
    body:       { fontSize: 17, fontWeight: '400' as const },
    bodySmall:  { fontSize: 15, fontWeight: '400' as const },
    link:       { fontSize: 15, fontWeight: '600' as const },
    button:     { fontSize: 17, fontWeight: '700' as const },
  },
};
```

**Компонент: TextInput**

```typescript
const inputStyle = {
  backgroundColor: theme.colors.bgSurface,  // #2C2C2E
  borderRadius:    theme.radius.md,          // 12px
  height:          52,
  paddingHorizontal: 16,
  paddingVertical: 14,
  color:           theme.colors.text,
  fontSize:        theme.font.body.fontSize,
  // без border в дефолтном состоянии
};

// Иконки слева/справа: opacity 0.4, размер 20px
// Иконка «показать пароль» (глаз): справа, tapable
// Иконка email (конверт): слева, статичная
// Иконка пароля (замок): слева, статичная
```

**Компонент: Button (primary)**

```typescript
const buttonStyle = {
  backgroundColor: theme.colors.accent,     // #9B51E0
  borderRadius:    theme.radius.pill,        // 100px
  height:          56,
  alignItems:      'center' as const,
  justifyContent:  'center' as const,
  // pressed state: backgroundColor: theme.colors.accentPressed
};

const buttonTextStyle = {
  color:      theme.colors.text,
  ...theme.font.button,                      // 17px, 700
};
```

**Компонент: Logo**

Иконка диафрагмы (aperture) фиолетовая + текст «StreetEye» в одну строку. Иконка: `@expo/vector-icons` → `Ionicons` → `aperture`, размер 28px, цвет `accent`. Текст: `displayLg`, цвет `text`. Под логотипом — tagline `displaySm`, цвет `textSecondary`.

**Разделитель «или»:**

Горизонтальная линия `separator` с текстом «или» по центру. Цвет текста `textMuted`, размер 13px.

---

## 2. Навигация и архитектура экранов

### 2.1 Карта навигации

```
Запуск приложения
│
├── Новый пользователь → Онбординг (6 экранов) → Главный экран
│
├── Зарегистрирован, токен жив → Главный экран
│
└── Зарегистрирован, токен истёк → Экран входа → Главный экран

Главный экран (tabs)
├── [Tab 1] Задание       — текущее активное задание
├── [Tab 2] Дневник       — список записей
└── [Tab 3] Профиль       — настройки, бейджи, статистика

Модальные экраны (поверх tabs)
├── Карточка задания      — полная карточка при «Другое задание»
├── Запись дневника       — создание / просмотр записи
└── Paywall               — экран подписки
```

### 2.2 Логика первого запуска

```typescript
// _layout.tsx — корневой layout
async function getInitialRoute(): Promise<string> {
  const onboardingDone = await AsyncStorage.getItem('onboarding_complete');
  if (!onboardingDone) return '/(onboarding)/welcome';

  const token = await SecureStore.getItemAsync('access_token');
  if (!token) return '/(auth)/login';

  return '/(tabs)';
}
```

Правило: регистрация не требуется до первого выполненного задания. Гость может пройти онбординг и получить задание без аккаунта. Аккаунт запрашивается только при попытке сохранить запись в дневник.

### 2.3 Режим гостя

Гость (не авторизованный пользователь) может:
- Пройти онбординг
- Получить задание (через публичный эндпоинт `GET /tasks/random/guest`)
- Просмотреть совет к заданию

Гость не может:
- Сохранить запись в дневник
- Получить бейдж
- Видеть историю
- Нажать «Другое задание» (доступно только авторизованным)

При попытке сохранить → открывается `RegisterSheet` (раздел 3.6) — упрощённая форма регистрации поверх текущего экрана.

### 2.4 Хранение данных онбординга до регистрации

Все данные, собранные на экранах онбординга, хранятся локально до момента регистрации:

```typescript
// store/settings.store.ts — данные онбординга
interface OnboardingData {
  locale: 'ru' | 'en';
  level: 'BEGINNER' | 'INTERMEDIATE' | 'PRO';
  preferredCategories: Category[];  // 1–2 категории
}

// Сохранение при прохождении онбординга
await AsyncStorage.setItem('onboarding_data', JSON.stringify({
  locale,
  level,
  preferredCategories,
}));
```

**Ключи AsyncStorage для гостевого режима:**

| Ключ | Тип | Описание | Когда очищается |
|---|---|---|---|
| `onboarding_data` | JSON | Язык, уровень, категории | После успешной регистрации |
| `onboarding_complete` | `'true'` | Флаг завершения онбординга | Никогда (пользователь не проходит онбординг повторно) |
| `guest_active_task` | JSON (TaskDto) | Задание, полученное на экране 6 | После создания серверной сессии при регистрации |

При регистрации данные онбординга передаются в тело `POST /auth/register`, а гостевое задание превращается в серверную сессию:

```typescript
async function registerAndMigrateGuestTask(email: string, password: string): Promise<string | null> {
  // 1. Регистрация с данными онбординга
  const raw = await AsyncStorage.getItem('onboarding_data');
  const onboarding = raw ? JSON.parse(raw) : {};

  await api.post('/auth/register', {
    email,
    password,
    level: onboarding.level,
    preferredCategories: onboarding.preferredCategories,
    locale: onboarding.locale,
  });

  // 2. Подтверждение email и вход (пользователь переходит по ссылке из письма)
  // ... после верификации и логина:

  // 3. Создать серверную сессию для гостевого задания (если есть)
  const taskRaw = await AsyncStorage.getItem('guest_active_task');
  if (taskRaw) {
    const task = JSON.parse(taskRaw);
    const sessionRes = await api.post('/sessions', { taskId: task.id });
    await AsyncStorage.removeItem('guest_active_task');
    return sessionRes.data.data.id; // sessionId
  }

  // 4. Очистить данные онбординга
  await AsyncStorage.removeItem('onboarding_data');

  return null;
}
```

---

## 3. Авторизация

### 3.1 Экран входа — `(auth)/login.tsx`

**Поля:**
- Email — `TextInput`, `keyboardType="email-address"`, `autoCapitalize="none"`
- Пароль — `TextInput`, `secureTextEntry`

**Действия:**
- «Войти» — `POST /auth/login`, сохранить `access_token` в SecureStore, `refresh_token` в SecureStore, перейти на `/(tabs)`
- «Забыли пароль?» — перейти на экран сброса пароля
- «Зарегистрироваться» — перейти на `(auth)/register`

**Обработка ошибок:**

| Код от API | Сообщение пользователю |
|---|---|
| `INVALID_CREDENTIALS` | «Неверный email или пароль» |
| `EMAIL_NOT_VERIFIED` | «Подтвердите email — письмо отправлено при регистрации» |
| `RATE_LIMIT_EXCEEDED` | «Слишком много попыток. Подождите 15 минут» |
| Нет сети | «Нет подключения к интернету» |

**Состояния кнопки:** обычная → загрузка (spinner вместо текста) → ошибка (встряска формы) → успех (переход).

### 3.2 Экран регистрации — `(auth)/register.tsx`

**Поля:**
- Email
- Пароль (мин. 8 символов)
- Повтор пароля
- Чекбокс «Принимаю условия и политику конфиденциальности»

**Действия:**
- «Создать аккаунт» — валидация на клиенте → `POST /auth/register` с данными онбординга из AsyncStorage (`level`, `preferredCategories`, `locale`) → экран подтверждения email
- «Уже есть аккаунт? Войти» — назад на login

**Клиентская валидация (до запроса):**
- Email — `/.+@.+\..+/`
- Пароль — длина ≥ 8
- Пароли совпадают
- Чекбокс отмечен

**Важно:** при отправке `POST /auth/register` клиент автоматически прикрепляет `level`, `preferredCategories` и `locale` из AsyncStorage (см. раздел 2.4). Пользователь не вводит эти данные повторно — они были собраны на экранах онбординга.

### 3.3 Экран подтверждения email

Статический экран: «Письмо отправлено на {email}. Перейдите по ссылке для активации.»

Кнопка «Отправить повторно» → `POST /auth/resend-verify`. Кнопка доступна через 60 секунд (таймер обратного отсчёта).

### 3.4 Экран сброса пароля

**Шаг 1:** Ввод email → `POST /auth/forgot-password` → сообщение «Письмо отправлено».

**Шаг 2:** Ссылка из письма открывает диплинк `streeteye://reset-password?token=...` → экран ввода нового пароля → `POST /auth/reset-password`.

### 3.5 Управление токенами на клиенте

```typescript
// lib/api/client.ts

// Access token живёт в памяти (переменная модуля)
let accessToken: string | null = null;

// Refresh token — в SecureStore
async function refreshAccessToken(): Promise<string> {
  const refresh = await SecureStore.getItemAsync('refresh_token');
  const res = await axios.post('/auth/refresh', { refreshToken: refresh });
  accessToken = res.data.data.accessToken;
  return accessToken;
}

// Axios interceptor — автообновление при 401
api.interceptors.response.use(
  (r) => r,
  async (error) => {
    if (error.response?.status === 401 && !error.config._retry) {
      error.config._retry = true;
      await refreshAccessToken();
      error.config.headers.Authorization = `Bearer ${accessToken}`;
      return api(error.config);
    }
    return Promise.reject(error);
  }
);
```

### 3.6 Bottom sheet быстрой регистрации — `components/auth/RegisterSheet.tsx`

Упрощённая форма регистрации, которая появляется поверх главного экрана, когда гость пытается сохранить результат (нажимает «Задание выполнено» или «Сохранить на потом»). Пользователь не покидает контекст задания — это повышает конверсию по сравнению с навигацией на полноэкранный экран регистрации.

**Отличие от полноэкранной регистрации (`(auth)/register.tsx`):**

| | Полноэкранная | Bottom sheet |
|---|---|---|
| Контекст | Отдельный экран, навигация | Поверх главного экрана, не теряет контекст |
| Поля | Email, пароль, повтор пароля, чекбокс | Email, пароль (минимум) |
| Когда появляется | Пользователь сам переходит | Автоматически при действии гостя |
| После успеха | Экран подтверждения email | Закрывается, продолжает прерванное действие |

**Содержимое bottom sheet:**

- Заголовок: «Зарегистрируйтесь, чтобы сохранить результат» (`displaySm`, цвет `text`)
- Подзаголовок: «Это займёт 10 секунд» (`bodySmall`, цвет `textSecondary`)
- Поле Email — `TextInput`, `keyboardType="email-address"`, `autoCapitalize="none"`
- Поле Пароль — `TextInput`, `secureTextEntry`, иконка глаза справа
- Текст под полями: «Регистрируясь, вы принимаете условия использования и политику конфиденциальности» (`bodySmall`, цвет `textMuted`, ссылки — цвет `accent`)
- Кнопка «Создать аккаунт» (primary, полная ширина)
- Ссылка «Уже есть аккаунт? Войти» — открывает полноэкранный `(auth)/login.tsx`

**Клиентская валидация:**
- Email — `/.+@.+\..+/`
- Пароль — длина ≥ 8
- Кнопка неактивна, пока оба поля не валидны

**Состояния кнопки:** обычная → загрузка (spinner) → ошибка (встряска + сообщение) → успех (закрытие sheet).

**Обработка ошибок:**

| Код от API | Сообщение |
|---|---|
| `VALIDATION_ERROR` | Показать под конкретным полем |
| `RATE_LIMIT_EXCEEDED` | «Слишком много попыток. Подождите» |
| Нет сети | «Нет подключения к интернету» |
| Email уже занят | «Этот email уже зарегистрирован. Войти?» (ссылка на login) |

**Логика после успешной регистрации:**

```typescript
// components/auth/RegisterSheet.tsx
async function onRegisterSuccess(): Promise<void> {
  // 1. Отправить POST /auth/register с данными онбординга
  const raw = await AsyncStorage.getItem('onboarding_data');
  const onboarding = raw ? JSON.parse(raw) : {};

  await api.post('/auth/register', {
    email,
    password,
    level: onboarding.level,
    preferredCategories: onboarding.preferredCategories,
    locale: onboarding.locale,
  });

  // 2. Показать сообщение «Проверьте почту» внутри bottom sheet
  //    Пользователь переходит по ссылке из письма → приложение ловит диплинк
  //    → автоматический вход → продолжение прерванного действия

  // 3. После верификации и логина — вызвать callback:
  //    onComplete(email, password) — родительский компонент
  //    выполняет миграцию гостевого задания (см. раздел 5.4)
}
```

**Важно:** bottom sheet не закрывается при тапе вне его области (чтобы пользователь не потерял введённые данные). Закрытие — только кнопкой «×» в правом верхнем углу или свайпом вниз с подтверждением.

---

Онбординг — линейная последовательность из 6 экранов. Прогресс сохраняется в AsyncStorage после каждого шага. Если пользователь закрыл приложение на шаге 3 — возобновляет с шага 3.

### 4.1 Экран 1 — Приветствие `(onboarding)/welcome.tsx`

Полноэкранный. Логотип по центру. Тагline. Кнопка «Начать». Никакого текста про функции — только атмосфера.

### 4.2 Экран 2 — Язык `(onboarding)/language.tsx`

Два варианта: «Русский» и «English». По умолчанию выбран язык из `expo-localization`. Если устройство не на ru или en — по умолчанию en.

При выборе: `i18n.changeLanguage(locale)` + запись в AsyncStorage (ключ `onboarding_data.locale`). На сервер данные не отправляются — пользователь ещё не зарегистрирован.

### 4.3 Экран 3 — Уровень `(onboarding)/level.tsx`

Три карточки: «Новичок», «Средний», «Профи». Под каждой — одна строка описания. Одиночный выбор. Сохраняется локально в AsyncStorage (ключ `onboarding_data.level`).

### 4.4 Экран 4 — Предпочтения `(onboarding)/preferences.tsx`

Четыре категории: «Визуальное», «Техническое», «Социальное», «Ограничения». Мультивыбор, минимум 1, максимум 2. Сохраняется локально в AsyncStorage (ключ `onboarding_data.preferredCategories`).

### 4.5 Экран 5 — Уведомления `(onboarding)/notifications.tsx`

Запрос разрешения через `Notifications.requestPermissionsAsync()`. Кнопка «Разрешить» и ссылка «Позже». Если отказ — push просто не будут приходить, приложение работает нормально.

### 4.6 Экран 6 — Первое задание `(onboarding)/first-task.tsx`

Показывает первое задание, уже подобранное по уровню и категориям. Пользователь ещё не зарегистрирован — используется публичный гостевой эндпоинт.

```typescript
async function fetchFirstTask(): Promise<Task> {
  const raw = await AsyncStorage.getItem('onboarding_data');
  const { level, preferredCategories, locale } = JSON.parse(raw);

  const response = await api.get('/tasks/random/guest', {
    params: {
      level,
      categories: preferredCategories.join(','),
      locale,
    },
  });
  const task = response.data.data;

  // Сохраняем задание и его ID для использования после регистрации
  await AsyncStorage.setItem('guest_active_task', JSON.stringify(task));

  return task;
}
```

Кнопка «Пошёл снимать»:
1. `onboarding_complete = true` в AsyncStorage
2. Переход на главный экран `/(tabs)`
3. Главный экран читает задание из `guest_active_task` и отображает в состоянии A (активное задание)
4. Серверная сессия **не создаётся** — гость не авторизован

---

## 5. Главный экран — задание

`(tabs)/index.tsx`

### 5.1 Состояния экрана

**A. Активное задание** — пользователь взял задание, оно в процессе.

Отображает:
- Метаданные: категория + уровень (монопространственный шрифт, мелко)
- Название задания (крупно, serif)
- Описание (2–3 строки)
- Опциональный таймер (включается тапом на иконку)
- Кнопка «Задание выполнено» (главная, полная ширина)
- Кнопка «Сохранить на потом» (вторичная)
- Свайп вниз → показывает совет

**B. Нет активного задания** — пользователь ещё не взял или завершил предыдущее.

Отображает:
- Счётчик выполненных заданий и серии
- Кнопка «Получить задание» (главная)
- Если есть сохранённые задания → список «Отложенные»

**C. Лимит исчерпан (Free)** — пользователь использовал 10 заданий в месяц.

Отображает:
- Счётчик «10 / 10 заданий в этом месяце»
- Кнопка «Перейти на Premium» → `paywall.tsx`
- Дата обновления лимита

### 5.2 Логика получения задания

```typescript
// Получить случайное задание (без создания сессии)
async function fetchRandomTask(): Promise<Task> {
  const token = await SecureStore.getItemAsync('access_token');

  if (!token) {
    // Гость — используем публичный эндпоинт
    const raw = await AsyncStorage.getItem('onboarding_data');
    const { level, preferredCategories, locale } = JSON.parse(raw);
    const response = await api.get('/tasks/random/guest', {
      params: { level, categories: preferredCategories.join(','), locale },
    });
    return response.data.data;
  }

  // Авторизованный — используем защищённый эндпоинт
  const recent = await db.getRecentTaskIds(5);
  const response = await api.get('/tasks/random', {
    headers: { 'Accept-Language': i18n.language },
    params: { exclude: recent.join(',') },
  });
  return response.data.data;
}

// Принять задание — создать сессию (при нажатии «Взять это»)
// Доступно только авторизованным. Гост при нажатии → bottom sheet регистрации
async function acceptTask(taskId: string): Promise<string> {
  const response = await api.post('/sessions', { taskId });
  const sessionId = response.data.data.id;
  await db.saveActiveSession(sessionId, taskId);
  return sessionId;
}
```

### 5.3 Таймер

Опциональный таймер работает локально, без синхронизации с сервером. Варианты: 30 мин, 60 мин, 90 мин. При запуске → `setTimeout` + локальное push-уведомление через `Notifications.scheduleNotificationAsync`. При сворачивании приложения таймер продолжает работать через background task.

### 5.4 Завершение задания

**Авторизованный пользователь:**

Кнопка «Задание выполнено»:
1. `PATCH /sessions/:id` с `{ status: 'COMPLETED' }`
2. Анимация подтверждения (краткая, 0.5с)
3. Открывается bottom sheet для записи в дневник
4. После закрытия bottom sheet — экран переходит в состояние B

**Гость (не авторизован):**

Кнопка «Задание выполнено»:
1. Открывается `RegisterSheet` (см. раздел 3.6) — упрощённая форма регистрации поверх текущего экрана
2. Пользователь вводит email и пароль → `POST /auth/register` с данными онбординга из AsyncStorage
3. Пользователь подтверждает email по ссылке из письма → автоматический вход
4. После успешного входа клиент автоматически выполняет цепочку:
   - `POST /sessions` с `taskId` из `guest_active_task` → создаёт серверную сессию
   - `PATCH /sessions/:id` с `{ status: 'COMPLETED' }` → завершает сессию
   - Очищает `guest_active_task` из AsyncStorage
5. Открывается bottom sheet для записи в дневник — стандартный флоу

Весь процесс прозрачен: между нажатием «Задание выполнено» и формой дневника пользователь только вводит email, пароль и переходит по ссылке из письма.

```typescript
async function completeTaskAsGuest(taskId: string): Promise<void> {
  // 1. Показать bottom sheet регистрации и дождаться успеха
  const registered = await showRegistrationSheet();
  if (!registered) return; // пользователь отменил

  // 2. Создать серверную сессию для задания из онбординга
  const sessionRes = await api.post('/sessions', { taskId });
  const sessionId = sessionRes.data.data.id;

  // 3. Завершить сессию
  await api.patch(`/sessions/${sessionId}`, { status: 'COMPLETED' });

  // 4. Очистить гостевое задание
  await AsyncStorage.removeItem('guest_active_task');

  // 5. Сохранить сессию локально
  await db.saveActiveSession(sessionId, taskId);

  // 6. Открыть bottom sheet дневника
  showJournalEntrySheet(sessionId);
}
```

**Обработка ошибок в цепочке:** если после регистрации `POST /sessions` или `PATCH /sessions/:id` завершается ошибкой — показать сообщение «Не удалось сохранить задание. Попробуйте ещё раз» и предложить кнопку повтора. Регистрация при этом уже завершена, данные не теряются.

Кнопка «Сохранить на потом»:
1. `PATCH /sessions/:id` с `{ status: 'SAVED_FOR_LATER' }`
2. Задание уходит в список «Отложенные»
3. Экран переходит в состояние B

### 5.5 Переключение задания

Кнопка «Другое задание» (появляется в состоянии B при нажатии «Получить задание»). Доступна максимум 3 раза за сессию (Free: 1 раз). Счётчик отображается рядом: «Ещё 2».

---

## 6. Дневник

`(tabs)/journal.tsx`

### 6.1 Список записей

- Хронологический список, новые сверху
- Каждая карточка: дата, название задания, категория, самооценка (иконка), превью заметки
- Если есть фото — миниатюра слева
- Pull-to-refresh
- Фильтр (bottom sheet): по категории, по самооценке
- Статистика вверху: «Выполнено: 12 · Серия: 3 дня»

**Free-лимит:** показывать только последние 10 записей. Выше — заблокированные карточки с замком и кнопкой «Premium».

### 6.2 Создание записи — `journal/[id].tsx`

Открывается как bottom sheet после завершения задания. Поля:

| Поле | Тип | Детали |
|---|---|---|
| Самооценка | 3 кнопки | «Не получилось» / «Частично» / «Получилось» |
| Заметка | TextInput multiline | Макс. 500 символов, счётчик |
| Фото | Image picker | Из галереи. Хранится локально в документах приложения |
| Статус | Автоматически | `COMPLETED` |

После сохранения: `POST /journal` + локальное сохранение в SQLite.

### 6.3 Просмотр записи

Полноэкранный просмотр. Показывает все поля. Кнопка редактирования (карандаш) → те же поля, но `PATCH /journal/:id`. Кнопка удаления (корзина) → подтверждение → `DELETE /journal/:id` + удаление из SQLite.

### 6.4 Локальное хранение (SQLite)

```sql
CREATE TABLE journal_entries (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  task_title TEXT NOT NULL,
  task_category TEXT NOT NULL,
  note TEXT,
  self_rating TEXT NOT NULL,
  has_photo INTEGER DEFAULT 0,
  photo_uri TEXT,
  created_at TEXT NOT NULL,
  synced INTEGER DEFAULT 0
);
```

Стратегия синхронизации: write-through. При создании/обновлении — сначала локально, потом запрос к API. При ошибке сети — запись остаётся локальной с флагом `synced = 0`, синхронизируется при следующем запуске с сетью.

---

## 7. Профиль

`(tabs)/profile.tsx`

### 7.1 Разделы профиля

**Статистика:**
- Выполнено заданий всего
- Текущая серия (дней подряд)
- Рекорд серии
- По категориям (визуальная раскладка, без графиков — только числа)

**Бейджи:**

| Бейдж | Иконка | Условие |
|---|---|---|
| Первый шаг | 🏁 | Первое выполненное задание |
| Неделя | 🗓 | 7 заданий за любой период |
| Серия x3 | 🔥 | 3 дня подряд |
| Всё попробовал | ⭐ | По одному заданию в каждой категории |

Полученные бейджи — яркие. Не полученные — серые, с прогрессом.

**Настройки:**
- Уровень (изменить)
- Предпочтения категорий (изменить)
- Язык интерфейса (переключатель ru / en)
- Уведомления (переключатель + время напоминания)

**Аккаунт:**
- Email
- Кнопка «Изменить пароль»
- Кнопка «Управление подпиской» (если Premium)
- Кнопка «Активировать промокод» (если не Premium) → открывает bottom sheet с полем ввода кода
- Кнопка «Выйти»
- Кнопка «Удалить аккаунт» (деструктивная, внизу, мелко)

### 7.2 Смена уровня и категорий

Открывает bottom sheet с теми же компонентами, что в онбординге. `PATCH /users/me` после сохранения.

---

## 8. Монетизация

### 8.1 Paywall — `paywall.tsx`

Открывается при достижении лимита Free-плана. Отображает:

- Что входит в Premium (3–4 пункта)
- Цена: $3.99/мес
- Пробный период: 7 дней бесплатно
- Кнопка «Попробовать бесплатно»
- Мелко: «Отменить можно в любой момент»
- Кнопка «Восстановить покупку»
- Ссылка «Есть промокод?» → раскрывает поле ввода кода + кнопка «Активировать»

### 8.2 In-App Purchase

```typescript
// lib/iap.ts
import * as IAP from 'expo-in-app-purchases';

const SKU_MONTHLY = 'streeteye_premium_monthly';

async function purchasePremium(): Promise<void> {
  await IAP.connectAsync();
  const { results } = await IAP.getProductsAsync([SKU_MONTHLY]);
  await IAP.purchaseItemAsync(SKU_MONTHLY);
}

IAP.setPurchaseListener(({ responseCode, results }) => {
  if (responseCode === IAP.IAPResponseCode.OK) {
    results?.forEach(async (purchase) => {
      if (!purchase.acknowledged) {
        await api.post('/subscriptions/verify', {
          receipt: purchase.transactionReceipt,
          platform: Platform.OS,
        });
        await IAP.finishTransactionAsync(purchase, true);
      }
    });
  }
});
```

### 8.3 Проверка статуса подписки

При запуске приложения: `GET /users/me` возвращает поле `isPremium`. Кэшируется в Zustand. Проверяется перед каждым действием с лимитом.

Лимиты, которые проверяются локально (без запроса к серверу):
- Счётчик заданий в месяце — хранится в AsyncStorage, сбрасывается 1-го числа
- Количество нажатий «Другое задание» за сессию — хранится в памяти (store)

### 8.4 Активация промокода

Промокод — альтернативный путь к Premium, минуя покупку через App Store / Google Play. Даёт lifetime Premium.

**Точки входа:**
- Paywall: ссылка «Есть промокод?» → раскрывает поле ввода
- Профиль → «Активировать промокод» (виден только не-Premium пользователям)

**Компонент: PromoCodeInput (bottom sheet)**

```typescript
function PromoCodeInput({ onSuccess }: { onSuccess: () => void }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function redeem() {
    setLoading(true);
    setError(null);
    try {
      await api.post('/promo/redeem', { code: code.toUpperCase().trim() });
      // Обновить статус подписки в store
      const profile = await api.get('/users/me');
      useAuthStore.getState().setProfile(profile.data.data);
      onSuccess();
    } catch (err) {
      const errorCode = err.response?.data?.error?.code;
      setError(t(`promo.errors.${errorCode}`));
    } finally {
      setLoading(false);
    }
  }

  return (
    // TextInput: 8 символов, uppercase, autoCapitalize="characters"
    // Кнопка «Активировать»: disabled пока code.length < 8
    // Сообщение об ошибке под полем ввода
  );
}
```

**Обработка ошибок:**

| Код от API | Сообщение пользователю |
|---|---|
| `PROMO_CODE_INVALID` | «Промокод не найден» |
| `PROMO_CODE_ALREADY_USED` | «Этот промокод уже использован» |
| `PROMO_CODE_EXPIRED` | «Срок действия промокода истёк» |
| `ALREADY_PREMIUM` | «У вас уже есть Premium-подписка» |

**После успешной активации:**
1. Закрыть bottom sheet / paywall
2. Показать краткую анимацию подтверждения (checkmark, 0.5с)
3. Обновить `isPremium` в Zustand → все лимиты снимаются мгновенно

---

## 9. Локализация

### 9.1 Структура файлов переводов

```
lib/i18n/locales/ru.json
lib/i18n/locales/en.json
```

Ключи организованы по экранам:

```json
{
  "auth": {
    "login": {
      "title": "Войти",
      "email": "E-mail",
      "password": "Пароль",
      "forgot": "Забыли пароль?",
      "submit": "Войти",
      "noAccount": "Нет аккаунта?",
      "register": "Зарегистрироваться"
    },
    "errors": {
      "invalidCredentials": "Неверный email или пароль",
      "emailNotVerified": "Подтвердите email",
      "rateLimitExceeded": "Слишком много попыток. Подождите {{minutes}} мин"
    }
  },
  "task": {
    "done": "Задание выполнено",
    "saveLater": "Сохранить на потом",
    "another": "Другое задание",
    "take": "Взять это",
    "attemptsLeft": "Ещё {{count}}",
    "tip": "Совет"
  },
  "journal": {
    "title": "Дневник",
    "empty": "Пока нет записей",
    "completed": "Выполнено",
    "streak": "Серия",
    "ratings": {
      "failed": "Не получилось",
      "partial": "Частично",
      "success": "Получилось"
    }
  },
  "promo": {
    "title": "Промокод",
    "placeholder": "Введите код",
    "submit": "Активировать",
    "hasCode": "Есть промокод?",
    "success": "Premium активирован!",
    "errors": {
      "PROMO_CODE_INVALID": "Промокод не найден",
      "PROMO_CODE_ALREADY_USED": "Этот промокод уже использован",
      "PROMO_CODE_EXPIRED": "Срок действия промокода истёк",
      "ALREADY_PREMIUM": "У вас уже есть Premium-подписка"
    }
  }
}
```

### 9.2 Инициализация i18n

```typescript
// lib/i18n/index.ts
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import * as Localization from 'expo-localization';
import ru from './locales/ru.json';
import en from './locales/en.json';

const deviceLocale = Localization.getLocales()[0]?.languageCode ?? 'en';
const savedLocale = await AsyncStorage.getItem('locale');
const locale = savedLocale ?? (['ru', 'en'].includes(deviceLocale) ? deviceLocale : 'en');

i18n.use(initReactI18next).init({
  resources: { ru: { translation: ru }, en: { translation: en } },
  lng: locale,
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});
```

### 9.3 Смена языка без перезапуска

```typescript
async function changeLanguage(locale: 'ru' | 'en'): Promise<void> {
  await i18n.changeLanguage(locale);
  await AsyncStorage.setItem('locale', locale);
  api.defaults.headers['Accept-Language'] = locale;
  if (isAuthenticated) {
    await api.patch('/users/me', { locale });
  }
}
```

---

## 10. Push-уведомления

### 10.1 Типы уведомлений

| Тип | Триггер | Текст (пример) |
|---|---|---|
| Ежедневное напоминание | Расписание пользователя | «Время выйти на улицу. Новое задание ждёт» |
| Таймер задания | Истёк таймер | «Время вышло. Как прошла съёмка?» |
| Бейдж получен | После выполнения | «Новый бейдж: Серия x3 🔥» |
| Streak под угрозой | 20:00, если нет задания за день | «Серия прервётся сегодня. Успейте выполнить задание» |

### 10.2 Реализация

```typescript
// Регистрация токена при старте
async function registerForPushNotifications(): Promise<string | null> {
  const { status } = await Notifications.requestPermissionsAsync();
  if (status !== 'granted') return null;

  const token = (await Notifications.getExpoPushTokenAsync()).data;
  await api.post('/users/me/push-token', { token });
  return token;
}

// Локальное уведомление для таймера
async function schedulTimerNotification(minutes: number): Promise<void> {
  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'StreetEye',
      body: t('task.timerDone'),
    },
    trigger: { seconds: minutes * 60 },
  });
}
```

---

## 11. Оффлайн-режим

### 11.1 Что работает без сети

| Функция | Оффлайн | Примечание |
|---|---|---|
| Просмотр активного задания | ✅ | Кэшируется в AsyncStorage |
| Просмотр совета | ✅ | Кэшируется вместе с заданием |
| Просмотр дневника | ✅ | Читается из SQLite |
| Создание записи в дневнике | ✅ | Сохраняется локально, синхронизируется позже |
| Получение нового задания | ❌ | Требует сети |
| Авторизация | ❌ | Требует сети |
| Бейджи | ❌ | Проверяются на сервере |

### 11.2 Индикатор состояния сети

Тонкая полоска вверху экрана при потере сети. Исчезает через 2 секунды после восстановления. Использует `@react-native-community/netinfo`.

### 11.3 Синхронизация при восстановлении сети

```typescript
NetInfo.addEventListener((state) => {
  if (state.isConnected) {
    syncPendingJournalEntries();
  }
});

async function syncPendingJournalEntries(): Promise<void> {
  const pending = await db.getUnsyncedEntries();
  for (const entry of pending) {
    try {
      await api.post('/journal', entry);
      await db.markSynced(entry.id);
    } catch {
      // оставить для следующей попытки
    }
  }
}
```

---

## 12. Тестирование

### 12.1 Стратегия

| Уровень | Инструмент | Что покрываем |
|---|---|---|
| Unit | Jest | Store-логика, утилиты, i18n-хелперы, оффлайн-синхронизация |
| Component | React Native Testing Library | Рендер компонентов, пользовательские взаимодействия |
| E2E | Maestro | Критические флоу: регистрация, онбординг, выполнение задания |

### 12.2 Обязательное покрытие unit-тестами

- `auth.store`: логин, логаут, refresh, guest mode, регистрация с данными онбординга
- `task.store`: счётчик «Другое задание», лимит Free, логика `SAVED_FOR_LATER`, переключение гостевой/авторизованный эндпоинт
- `onboarding`: сохранение/чтение `onboarding_data` и `guest_active_task` из AsyncStorage, передача данных при регистрации, миграция гостевого задания в серверную сессию, очистка AsyncStorage после миграции
- `journal/sync`: оффлайн-запись + синхронизация при восстановлении сети
- `i18n`: смена языка, корректность ключей в обоих локалях
- `iap`: проверка статуса подписки, лимиты
- `promo`: активация промокода (успех, ошибки), обновление isPremium в store, форматирование ввода (uppercase, trim)

### 12.3 E2E-сценарии (Maestro)

```yaml
# flows/onboarding-guest.yaml
# Гостевой флоу: онбординг → первое задание → главный экран с активным заданием
- launchApp
- assertVisible: "StreetEye"
- tapOn: "Начать"
- tapOn: "Русский"
- tapOn: "Новичок"
- tapOn: "Визуальное"
- tapOn: "Позже"   # уведомления
- assertVisible: "Задание"  # первое задание загружено через /tasks/random/guest
- tapOn: "Пошёл снимать"
- assertVisible: "Задание выполнено"  # главный экран, состояние A (активное задание)
```

```yaml
# flows/guest-complete-and-register.yaml
# Полный флоу: гость завершает задание → регистрация → сессия создаётся → дневник
- tapOn: "Задание выполнено"
- assertVisible: "Зарегистрируйтесь"  # bottom sheet с предложением
- tapOn: "Зарегистрироваться"
- inputText:
    id: "email-input"
    text: "test@example.com"
- inputText:
    id: "password-input"
    text: "12345678"
- inputText:
    id: "password-confirm-input"
    text: "12345678"
- tapOn: "Создать аккаунт"
- assertVisible: "Письмо отправлено"  # экран подтверждения email
# После верификации email и логина:
- assertVisible: "Самооценка"  # bottom sheet дневника открывается автоматически
- tapOn: "Получилось"
- tapOn: "Сохранить"
- assertVisible: "Дневник"  # запись создана
```

```yaml
# flows/complete-task.yaml
# Авторизованный пользователь завершает задание (стандартный флоу)
- tapOn: "Задание выполнено"
- assertVisible: "Самооценка"
- tapOn: "Получилось"
- inputText:
    id: "note-input"
    text: "Хорошо получилось"
- tapOn: "Сохранить"
- assertVisible: "Дневник"
```

---

## 13. Публикация

### 13.1 App Store (iOS)

| Параметр | Значение |
|---|---|
| Bundle ID | `com.streeteye.app` |
| Минимальная версия iOS | 16.0 |
| Категория | Photo & Video |
| Возрастной рейтинг | 4+ |
| In-App Purchase | Да — подписка |

Необходимо до сабмита:
- Apple Developer аккаунт ($99/год) — зарегистрировать на неделе 1
- Скриншоты: iPhone 15 Pro Max (6.7"), iPhone SE (4.7")
- App Privacy — заполнить: данные не передаются третьим лицам, фото хранятся локально
- TestFlight beta — отправить на неделе 8

### 13.2 Google Play (Android)

| Параметр | Значение |
|---|---|
| Application ID | `com.streeteye.app` |
| Минимальная версия Android | 13 (API 33) |
| Категория | Photography |
| Возрастной рейтинг | PEGI 3 / Everyone |

Необходимо до сабмита:
- Google Play Developer аккаунт ($25 однократно)
- Скриншоты: телефон + планшет (опционально)
- Data Safety — заполнить аналогично App Privacy
- Internal testing track — отправить на неделе 8

### 13.3 Expo EAS Build

```json
// eas.json
{
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal"
    },
    "preview": {
      "distribution": "internal",
      "ios": { "simulator": false },
      "android": { "buildType": "apk" }
    },
    "production": {
      "ios": { "buildType": "release" },
      "android": { "buildType": "aab" }
    }
  }
}
```

CI/CD: GitHub Actions запускает `eas build --platform all --profile production` при пуше тега `v*.*.*`.

---

## 14. Переменные окружения

```bash
# .env (не коммитится)
EXPO_PUBLIC_API_URL=https://api.streeteye.app
EXPO_PUBLIC_API_TIMEOUT=10000

# Хранятся в EAS Secrets
APPLE_TEAM_ID=XXXXXXXXXX
GOOGLE_SERVICES_JSON=...
FIREBASE_APP_ID=...
```

---

## 15. План реализации (10 недель)

| Неделя | Модуль | Задачи | Результат |
|---|---|---|---|
| 1–2 | Фундамент | Expo проект, навигация (Expo Router), дизайн-система (`theme.ts` по токенам из Pencil-дизайна), API-клиент с interceptors, авторизация (login/register с данными онбординга/токены), `RegisterSheet` (bottom sheet быстрой регистрации), SecureStore | Авторизация работает |
| 3–4 | Онбординг | 6 экранов онбординга, i18n setup (ru + en), expo-localization, смена языка, хранение данных онбординга в AsyncStorage, гостевой запрос задания (`GET /tasks/random/guest`), режим гостя, guard для защищённых экранов | Полный онбординг с локализацией и гостевым режимом |
| 5–6 | Задание | Главный экран (3 состояния), `GET /tasks/random` (авторизованный) + fallback на `/tasks/random/guest` (гость), `POST /sessions` при «Взять это», карточка задания, таймер, «Другое задание», «Сохранить на потом», завершение задания, интеграция `RegisterSheet` для гостевого флоу с миграцией задания | Рандомайзер работает end-to-end |
| 7 | Дневник | SQLite-схема, создание записи (bottom sheet), список записей, просмотр/редактирование, image picker, оффлайн-синхронизация | Дневник работает локально и онлайн |
| 8 | Профиль + бейджи | Экран профиля, статистика, 4 бейджа, смена уровня/категорий, push-уведомления, streak-уведомление | Полный профиль |
| 9 | Монетизация | IAP setup (iOS + Android), paywall экран со ссылкой «Есть промокод?», лимиты Free, проверка подписки, восстановление покупки, PromoCodeInput bottom sheet, активация промокода (`POST /promo/redeem`), обработка ошибок промокода | Монетизация и промокоды работают |
| 10 | Полировка | Оффлайн-индикатор, анимации (Reanimated), crashlytics, E2E тесты (Maestro), TestFlight + внутренний трек Android, финальный EAS build | Готово к публикации |

---

## Итого

| Параметр | Значение |
|---|---|
| Экранов | 16 (6 онбординг + 3 таба + 4 флоу + 3 модальных) |
| Платформы | iOS 16+ и Android 13+ из одной кодовой базы |
| Языки | ru + en, переключение без перезапуска |
| Локальное хранение | SQLite (дневник) + SecureStore (токены) + AsyncStorage (настройки, данные онбординга) |
| Оффлайн | Просмотр задания и дневника, отложенная синхронизация записей |
| Платные зависимости | Apple Developer $99/год, Google Play $25 однократно |
| Срок | 10 недель, 1 разработчик |

---

*StreetEye Mobile TZ v1.5 · Апрель 2026*
