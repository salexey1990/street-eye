import { randomUUID } from 'crypto';

// ─── Types ────────────────────────────────────────────────────────────────────

interface DbUser {
  id: string;
  email: string;
  passwordHash: string;
  isEmailVerified: boolean;
  locale: string;
  level: string;
  preferredCategories: string[];
  createdAt: Date;
  updatedAt: Date;
}

interface DbRefreshToken {
  id: string;
  tokenHash: string;
  userId: string;
  user?: DbUser;
  expiresAt: Date;
  createdAt: Date;
}

interface DbEmailToken {
  id: string;
  tokenHash: string;
  userId: string;
  type: string;
  expiresAt: Date;
  usedAt: Date | null;
  createdAt: Date;
}

interface DbTaskSession {
  id: string;
  userId: string;
  taskId: string;
  status: string;
  startedAt: Date;
  completedAt: Date | null;
}

interface DbUserBadge {
  id: string;
  userId: string;
  badgeId: string;
  earnedAt: Date;
}

// ─── Where helpers ────────────────────────────────────────────────────────────

function matchesWhere(obj: Record<string, unknown>, where: Record<string, unknown>): boolean {
  for (const [key, condition] of Object.entries(where)) {
    const val = obj[key];
    if (condition === null || condition === undefined) {
      if (val !== null && val !== undefined) return false;
    } else if (condition && typeof condition === 'object' && !Array.isArray(condition)) {
      const cond = condition as Record<string, unknown>;
      if ('gt' in cond && !(val > cond.gt)) return false;
      if ('not' in cond && val === cond.not) return false;
      if ('not' in cond && val === null && cond.not === null) return false;
    } else {
      if (val !== condition) return false;
    }
  }
  return true;
}

// ─── In-memory Prisma mock ─────────────────────────────────────────────────────

export class InMemoryPrismaService {
  private _users: DbUser[] = [];
  private _refreshTokens: DbRefreshToken[] = [];
  private _emailTokens: DbEmailToken[] = [];
  private _taskSessions: DbTaskSession[] = [];
  private _userBadges: DbUserBadge[] = [];

  reset() {
    this._users = [];
    this._refreshTokens = [];
    this._emailTokens = [];
    this._taskSessions = [];
    this._userBadges = [];
  }

  // ── $queryRaw (used by health check) ───────────────────────────────────────

  $queryRaw = jest.fn().mockResolvedValue([{ '?column?': 1 }]);

  // ── $transaction ───────────────────────────────────────────────────────────

  $transaction = async (ops: Promise<unknown>[]) => Promise.all(ops);

  // ── user ───────────────────────────────────────────────────────────────────

  user = {
    findUnique: async ({ where }: { where: Record<string, unknown> }): Promise<DbUser | null> => {
      if (where.id) return this._users.find((u) => u.id === where.id) ?? null;
      if (where.email) return this._users.find((u) => u.email === where.email) ?? null;
      return null;
    },

    create: async ({ data }: { data: Partial<DbUser> }): Promise<DbUser> => {
      if (this._users.find((u) => u.email === data.email)) {
        const err = Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
        throw err;
      }
      const user: DbUser = {
        id: randomUUID(),
        email: data.email!,
        passwordHash: data.passwordHash!,
        isEmailVerified: false,
        locale: 'EN',
        level: 'BEGINNER',
        preferredCategories: [],
        createdAt: new Date(),
        updatedAt: new Date(),
        ...data,
      };
      this._users.push(user);
      return user;
    },

    update: async ({ where, data }: { where: Record<string, unknown>; data: Partial<DbUser> }): Promise<DbUser> => {
      const idx = this._users.findIndex((u) => matchesWhere(u as unknown as Record<string, unknown>, where));
      if (idx === -1) throw new Error('User not found');
      this._users[idx] = { ...this._users[idx], ...data, updatedAt: new Date() };
      return this._users[idx];
    },

    delete: async ({ where }: { where: Record<string, unknown> }): Promise<DbUser> => {
      const idx = this._users.findIndex((u) => matchesWhere(u as unknown as Record<string, unknown>, where));
      if (idx === -1) throw new Error('User not found');
      return this._users.splice(idx, 1)[0];
    },
  };

  // ── refreshToken ───────────────────────────────────────────────────────────

  refreshToken = {
    create: async ({ data }: { data: Partial<DbRefreshToken> }): Promise<DbRefreshToken> => {
      const token: DbRefreshToken = {
        id: randomUUID(),
        tokenHash: data.tokenHash!,
        userId: data.userId!,
        expiresAt: data.expiresAt!,
        createdAt: new Date(),
      };
      this._refreshTokens.push(token);
      return token;
    },

    findMany: async ({ where }: { where: Record<string, unknown> }): Promise<DbRefreshToken[]> => {
      const results = this._refreshTokens.filter((t) =>
        matchesWhere(t as unknown as Record<string, unknown>, where),
      );
      // Attach user for refresh flow
      return results.map((t) => ({
        ...t,
        user: this._users.find((u) => u.id === t.userId),
      }));
    },

    delete: async ({ where }: { where: Record<string, unknown> }): Promise<DbRefreshToken> => {
      const idx = this._refreshTokens.findIndex((t) =>
        matchesWhere(t as unknown as Record<string, unknown>, where),
      );
      if (idx === -1) throw new Error('RefreshToken not found');
      return this._refreshTokens.splice(idx, 1)[0];
    },

    deleteMany: async ({ where }: { where: Record<string, unknown> }): Promise<{ count: number }> => {
      const before = this._refreshTokens.length;
      this._refreshTokens = this._refreshTokens.filter(
        (t) => !matchesWhere(t as unknown as Record<string, unknown>, where),
      );
      return { count: before - this._refreshTokens.length };
    },
  };

  // ── emailToken ─────────────────────────────────────────────────────────────

  emailToken = {
    create: async ({ data }: { data: Partial<DbEmailToken> }): Promise<DbEmailToken> => {
      const token: DbEmailToken = {
        id: randomUUID(),
        tokenHash: data.tokenHash!,
        userId: data.userId!,
        type: data.type!,
        expiresAt: data.expiresAt!,
        usedAt: null,
        createdAt: new Date(),
      };
      this._emailTokens.push(token);
      return token;
    },

    findMany: async ({ where }: { where: Record<string, unknown> }): Promise<DbEmailToken[]> => {
      return this._emailTokens.filter((t) =>
        matchesWhere(t as unknown as Record<string, unknown>, where),
      );
    },

    update: async ({ where, data }: { where: Record<string, unknown>; data: Partial<DbEmailToken> }): Promise<DbEmailToken> => {
      const idx = this._emailTokens.findIndex((t) =>
        matchesWhere(t as unknown as Record<string, unknown>, where),
      );
      if (idx === -1) throw new Error('EmailToken not found');
      this._emailTokens[idx] = { ...this._emailTokens[idx], ...data };
      return this._emailTokens[idx];
    },

    deleteMany: async ({ where }: { where: Record<string, unknown> }): Promise<{ count: number }> => {
      const before = this._emailTokens.length;
      this._emailTokens = this._emailTokens.filter(
        (t) => !matchesWhere(t as unknown as Record<string, unknown>, where),
      );
      return { count: before - this._emailTokens.length };
    },
  };

  // ── taskSession ────────────────────────────────────────────────────────────

  taskSession = {
    count: async ({ where }: { where: Record<string, unknown> }): Promise<number> => {
      return this._taskSessions.filter((s) =>
        matchesWhere(s as unknown as Record<string, unknown>, where),
      ).length;
    },

    findMany: async ({ where }: { where: Record<string, unknown> }): Promise<DbTaskSession[]> => {
      return this._taskSessions.filter((s) =>
        matchesWhere(s as unknown as Record<string, unknown>, where),
      );
    },
  };

  // ── userBadge ──────────────────────────────────────────────────────────────

  userBadge = {
    count: async ({ where }: { where: Record<string, unknown> }): Promise<number> => {
      return this._userBadges.filter((b) =>
        matchesWhere(b as unknown as Record<string, unknown>, where),
      ).length;
    },
  };

  // ── expose store for test assertions ──────────────────────────────────────

  get _store() {
    return {
      users: this._users,
      refreshTokens: this._refreshTokens,
      emailTokens: this._emailTokens,
    };
  }
}
