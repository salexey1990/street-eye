# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

StreetEye is a NestJS backend for a mobile app that delivers street photography assignments. Users get daily challenges, track completions in a journal, and earn badges. The app supports Russian and English locales.

## Commands

```bash
# Development
npm run start:dev       # watch mode with auto-reload
npm run start:debug     # watch mode + Node debugger

# Build & Production
npm run build           # compile TypeScript via nest build
npm run start:prod      # run compiled dist/main

# Tests
npm run test            # unit tests (src/**/*.spec.ts)
npm run test:watch      # unit tests in watch mode
npm run test:cov        # unit tests with coverage report
npm run test:e2e        # e2e tests (test/**/*.e2e-spec.ts)
npm run test:debug      # debug tests with Node inspector

# To run a single test file:
npx jest src/auth/auth.service.spec.ts

# Code quality
npm run lint            # ESLint with auto-fix
npm run format          # Prettier format
```

## Architecture

NestJS monolith with modular domain isolation. Intentionally not microservices — designed for one developer, deploys via Docker Compose, scales to 50K users.

**Module dependency graph:**
```
AuthModule           → UsersModule, MailModule, Redis
UsersModule          → (no deps)
TasksModule          → UsersModule
SessionsModule       → TasksModule, UsersModule
NotificationsModule  → (no deps)
SubscriptionsModule  → (no deps)
PromoModule          → SubscriptionsModule
JournalModule        → Redis (own client)
BadgesModule         → JournalModule, NotificationsModule
MailModule           → (no deps)
HealthModule         → (no deps)
```

**Current `src/` structure:**
```
src/
├── common/          JwtAuthGuard, AdminKeyGuard, @CurrentUser, @Public, @Locale, GlobalExceptionFilter,
│                    TransformInterceptor, LocaleInterceptor, LoggingMiddleware, Swagger helpers
├── config/          ConfigModule with Joi env validation (env.validation.ts)
├── prisma/          PrismaService + PrismaModule
├── auth/            JWT + refresh tokens (Redis), email verification, password reset
├── users/           Profile CRUD, change password, isPremium in profile
├── mail/            Resend SDK, bilingual HTML templates (verify-email, reset-password ru/en)
├── health/          Health-check endpoint
├── tasks/           Task CRUD, random selection with locale resolution, guest endpoint, seed data (30 tasks)
├── sessions/        Active session management, status transitions (ACTIVE→COMPLETED/SKIPPED), cursor pagination
├── notifications/   Push tokens (Expo), cron reminders (daily + streak warnings)
├── subscriptions/   IAP verification (App Store / Google Play), status, limits
├── promo/           Promo code generation (admin) and redemption → grants lifetime premium subscription
├── journal/         Journal entries for completed sessions; stats (streaks, by-category, by-rating) cached in Redis
└── badges/          Achievement checks (FIRST_STEP, WEEK, STREAK_3, ALL_CATEGORIES); push notification on award
```

## Database (Prisma + PostgreSQL)

Key design decisions:
- All localizable text has `_ru` and `_en` suffix fields (e.g., `title_ru`, `title_en`)
- `Accept-Language` header determines which locale fields are returned
- User locale stored as `Locale` enum (`EN | RU`)
- Skill level: `Level` enum (`BEGINNER | INTERMEDIATE | PRO`)
- Task categories: `Category` enum (`VISUAL | TECHNICAL | SOCIAL | RESTRICTION`)

Run migrations: `npx prisma migrate deploy`
Generate client after schema changes: `npx prisma generate`

## Infrastructure

- **PostgreSQL 16** + **Redis 7** — both run via Docker Compose
- **Resend** — transactional email (3000/month free tier)
- **Passport.js + JWT** — access tokens (short-lived) + refresh tokens stored in Redis
- **NestJS Throttler** — rate limiting
- **Helmet** — HTTP security headers
- **class-validator** + **class-transformer** — DTO validation (must enable `ValidationPipe` globally in `main.ts`)

## Specs

Full product and technical specs are in `spec/`:
- `spec/StreetEye_MVP_Specification_v1.2.md` — product features, monetization, roadmap
- `spec/StreetEye_Backend_TZ_v1.2.md` — complete API endpoints, DB schema, module contracts
