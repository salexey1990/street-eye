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
AuthModule      → UsersModule, MailModule, Redis
UsersModule     → (no deps)
TasksModule     → UsersModule
SessionsModule  → TasksModule, UsersModule
JournalModule   → SessionsModule, UsersModule
BadgesModule    → JournalModule, UsersModule
MailModule      → (no deps)
HealthModule    → (no deps)
```

**Planned `src/` structure (not yet fully implemented):**
```
src/
├── common/          # JwtAuthGuard, RolesGuard, @CurrentUser, @Public, GlobalExceptionFilter, interceptors
├── config/          # ConfigModule with Joi env validation
├── prisma/          # PrismaService, schema.prisma, migrations/
├── auth/            # JWT + refresh tokens, email verification, password reset
├── users/           # Profile, skill level (BEGINNER|INTERMEDIATE|PRO), preferred categories
├── tasks/           # Assignment database, filtering by level/category
├── sessions/        # Active task session per user
├── journal/         # Completed assignments with photos, notes, self-evaluation
├── badges/          # Achievement logic and milestone tracking
├── mail/            # Resend SDK, bilingual templates (ru/en via user.locale)
└── health/          # Health-check endpoint
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
- `spec/StreetEye_MVP_Specification.md` — product features, monetization, roadmap
- `spec/StreetEye_Backend_TZ.md` — complete API endpoints, DB schema, module contracts
