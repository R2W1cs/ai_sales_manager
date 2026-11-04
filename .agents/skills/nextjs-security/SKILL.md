---
name: nextjs-security
description: Security patterns for Next.js applications on Vercel. Use when implementing CSP, auth middleware, input validation, rate limiting, CSRF protection, or security headers.
---

# Next.js Security Patterns

This skill covers essential security patterns for Next.js applications deployed on Vercel, including CSP, authentication middleware, input validation, rate limiting, and secure configuration.

## When to use this skill

- Implementing Content Security Policy (CSP)
- Adding authentication/authorization middleware
- Validating and sanitizing user inputs
- Setting up rate limiting for APIs
- Configuring CSRF protection
- Adding security headers
- Securing cookies and sessions
- Preventing SQL injection
- Securing server actions

---

## 1. Content Security Policy (CSP)

CSP protects against XSS attacks, clickjacking, and code injection. Use nonces for enhanced security.

### CSP Middleware Implementation

```typescript
// middleware.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  // Generate unique nonce for each request
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const isDev = process.env.NODE_ENV === "development";

  const cspHeader = `
    default-src 'self';
    script-src 'self' 'nonce-${nonce}' 'strict-dynamic' ${isDev ? "'unsafe-eval'" : ""};
    style-src 'self' ${isDev ? "'unsafe-inline'" : `'nonce-${nonce}'`};
    img-src 'self' blob: data: https:;
    font-src 'self';
    object-src 'none';
    base-uri 'self';
    form-action 'self';
    frame-ancestors 'none';
    upgrade-insecure-requests;
  `;

  const contentSecurityPolicyHeaderValue = cspHeader.replace(/\s{2,}/g, " ").trim();

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", contentSecurityPolicyHeaderValue);

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });

  response.headers.set("Content-Security-Policy", contentSecurityPolicyHeaderValue);
  return response;
}

export const config = {
  matcher: [
    {
      source: "/((?!api|_next/static|_next/image|favicon.ico).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
```

### Using Nonce in Components

```tsx
// app/layout.tsx
import { headers } from "next/headers";
import Script from "next/script";

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    <html lang="en">
      <body>
        {children}
        <Script
          src="https://analytics.example.com/script.js"
          strategy="afterInteractive"
          nonce={nonce}
        />
      </body>
    </html>
  );
}
```

---

## 2. Environment Variables Security

Handle secrets and credentials securely with environment variables.

### Variable Naming Conventions

```bash
# Database credentials - NEVER commit to git
DATABASE_URL="postgresql://user:password@localhost:5432/mydb"

# API Keys - Use Vercel's sensitive environment variables
STRIPE_SECRET_KEY="sk_live_..."
OPENAI_API_KEY="sk-..."

# Public variables (exposed to browser - use sparingly)
NEXT_PUBLIC_API_URL="https://api.example.com"

# Auth secrets - Generate with: openssl rand -base64 32
AUTH_SECRET="your-secret-here"

# Vercel automatically provides:
# VERCEL_URL - Deployment URL
# VERCEL_ENV - Environment (production, preview, development)
```

### Type-Safe Environment (Project Pattern)

```typescript
// env.ts
import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  server: {
    DATABASE_URL: z.string().url(),
    AUTH_SECRET: z.string().min(32),
    STRIPE_SECRET_KEY: z.string().startsWith("sk_"),
  },
  client: {
    NEXT_PUBLIC_API_URL: z.string().url(),
  },
  runtimeEnv: {
    DATABASE_URL: process.env.DATABASE_URL,
    AUTH_SECRET: process.env.AUTH_SECRET,
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
  },
});
```

---

## 3. Authentication Middleware

Protect routes and APIs with middleware. Verify authentication and authorization on every request.

### Security Middleware Pattern

```typescript
// middleware.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

export async function middleware(request: NextRequest) {
  const token = await getToken({
    req: request,
    secret: process.env.AUTH_SECRET,
  });

  // Protect API routes
  if (request.nextUrl.pathname.startsWith("/api/protected")) {
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  // Protect admin routes
  if (request.nextUrl.pathname.startsWith("/admin")) {
    if (!token || token.role !== "admin") {
      return NextResponse.redirect(new URL("/login", request.url));
    }
  }

  // Add security headers
  const response = NextResponse.next();
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Permissions-Policy", "geolocation=(), microphone=(), camera=()");

  return response;
}

export const config = {
  matcher: ["/api/protected/:path*", "/admin/:path*"],
};
```

### Better Auth Pattern (Project Standard)

```typescript
// middleware.ts
import { auth } from "~/lib/auth";
import { NextResponse } from "next/server";

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const session = req.auth;

  // Admin routes require admin role
  if (pathname.startsWith("/admin")) {
    if (!session?.user || session.user.role !== "admin") {
      return NextResponse.redirect(new URL("/login", req.url));
    }
  }

  return NextResponse.next();
});
```

---

## 4. Input Validation & Sanitization

Validate and sanitize all user inputs to prevent XSS and injection attacks.

### Validation with Zod & DOMPurify

```typescript
// app/api/posts/route.ts
import { NextResponse } from "next/server";
import DOMPurify from "isomorphic-dompurify";
import { z } from "zod";

const PostSchema = z.object({
  title: z.string().min(1).max(200),
  content: z.string().min(1).max(10000),
  authorId: z.string().uuid(),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();

    // Validate input
    const validatedData = PostSchema.parse(body);

    // Sanitize HTML content to prevent XSS
    const sanitizedContent = DOMPurify.sanitize(validatedData.content, {
      ALLOWED_TAGS: ["p", "br", "strong", "em", "a"],
      ALLOWED_ATTR: ["href"],
    });

    // Save with parameterized queries (Prisma handles this)
    const post = await db.post.create({
      data: {
        title: validatedData.title,
        content: sanitizedContent,
        authorId: validatedData.authorId,
      },
    });

    return NextResponse.json(post, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid input", details: error.errors }, { status: 400 });
    }

    // Don't expose internal errors
    console.error("Post creation error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
```

### Server Action Validation Pattern

```typescript
"use server";

import { adminActionClient } from "~/lib/safe-actions";
import { z } from "zod";
import DOMPurify from "isomorphic-dompurify";

const contentSchema = z.object({
  title: z.string().min(1).max(200),
  content: z.string().min(1).max(10000),
});

export const createContent = adminActionClient
  .inputSchema(contentSchema)
  .action(async ({ parsedInput, ctx: { db } }) => {
    // Sanitize before saving
    const sanitizedContent = DOMPurify.sanitize(parsedInput.content, {
      ALLOWED_TAGS: ["p", "br", "strong", "em", "a", "ul", "ol", "li"],
      ALLOWED_ATTR: ["href", "target"],
    });

    return db.content.create({
      data: {
        title: parsedInput.title,
        content: sanitizedContent,
      },
    });
  });
```

---

## 5. Rate Limiting

Protect APIs against abuse and DDoS attacks by limiting requests per IP or user.

### Rate Limiter Implementation

```typescript
// lib/rate-limit.ts
import { LRUCache } from "lru-cache";

interface RateLimitOptions {
  interval?: number;
  uniqueTokenPerInterval?: number;
}

export function rateLimit(options: RateLimitOptions = {}) {
  const tokenCache = new LRUCache<string, number[]>({
    max: options.uniqueTokenPerInterval || 500,
    ttl: options.interval || 60000,
  });

  return {
    check: (limit: number, token: string): Promise<void> =>
      new Promise((resolve, reject) => {
        const tokenCount = tokenCache.get(token) || [0];

        if (tokenCount[0] === 0) {
          tokenCache.set(token, [1]);
        }

        tokenCount[0] += 1;
        const currentUsage = tokenCount[0];
        const isRateLimited = currentUsage >= limit;

        return isRateLimited ? reject() : resolve();
      }),
  };
}
```

### Usage in API Route

```typescript
// app/api/submit/route.ts
import { NextResponse } from "next/server";
import { rateLimit } from "~/lib/rate-limit";

const limiter = rateLimit({
  interval: 60 * 1000, // 1 minute
  uniqueTokenPerInterval: 500,
});

export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for") || "anonymous";

  try {
    await limiter.check(10, ip); // 10 requests per minute

    // Your API logic here
    return NextResponse.json({ data: "success" });
  } catch {
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
  }
}
```

### Upstash Ratelimit (Production)

```typescript
// lib/rate-limit.ts
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

export const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(10, "10 s"),
  analytics: true,
});

// Usage
export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for") ?? "127.0.0.1";
  const { success, limit, reset, remaining } = await ratelimit.limit(ip);

  if (!success) {
    return NextResponse.json(
      { error: "Rate limit exceeded" },
      {
        status: 429,
        headers: {
          "X-RateLimit-Limit": limit.toString(),
          "X-RateLimit-Remaining": remaining.toString(),
          "X-RateLimit-Reset": reset.toString(),
        },
      },
    );
  }

  // Continue with request
}
```

---

## 6. CSRF Protection

Protect against Cross-Site Request Forgery attacks using CSRF tokens.

### CSRF Token Implementation

```typescript
// app/api/csrf/route.ts
import { NextResponse } from "next/server";
import { randomBytes } from "crypto";

export async function GET() {
  const token = randomBytes(32).toString("hex");

  const response = NextResponse.json({ csrfToken: token });

  // Set CSRF token in httpOnly cookie
  response.cookies.set("csrf-token", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 3600, // 1 hour
  });

  return response;
}
```

### Verify CSRF Token

```typescript
// lib/csrf.ts
import { cookies } from "next/headers";

export async function verifyCsrfToken(submittedToken: string): Promise<boolean> {
  const cookieStore = await cookies();
  const storedToken = cookieStore.get("csrf-token")?.value;

  if (!storedToken || !submittedToken) {
    return false;
  }

  // Use timing-safe comparison
  return crypto.timingSafeEqual(Buffer.from(storedToken), Buffer.from(submittedToken));
}
```

---

## 7. Secure Cookie Configuration

Configure cookies with security flags to protect against XSS and CSRF.

```typescript
// app/api/session/route.ts
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const response = NextResponse.json({ success: true });

  // Secure cookie configuration
  response.cookies.set("session", "your-session-token", {
    httpOnly: true, // Prevents JavaScript access
    secure: true, // Only sent over HTTPS
    sameSite: "strict", // CSRF protection
    maxAge: 60 * 60 * 24, // 1 day
    path: "/",
  });

  return response;
}
```

### Cookie Options Reference

| Option     | Description                          | Recommended Value        |
| ---------- | ------------------------------------ | ------------------------ |
| `httpOnly` | Prevents JS access                   | `true`                   |
| `secure`   | HTTPS only                           | `true` in production     |
| `sameSite` | CSRF protection                      | `"strict"` or `"lax"`    |
| `maxAge`   | Expiration in seconds                | Depends on use case      |
| `path`     | Cookie scope                         | `"/"` or specific routes |
| `domain`   | Domain scope (omit for current only) | Usually omit             |

---

## 8. SQL Injection Prevention

Use Prisma or parameterized queries to prevent SQL injection.

### Secure Prisma Usage

```typescript
// ❌ BAD: Vulnerable to SQL injection
const user = await prisma.$queryRawUnsafe(`SELECT * FROM users WHERE email = '${email}'`);

// ✅ GOOD: Use Prisma's type-safe queries
const user = await prisma.user.findUnique({
  where: { email },
  select: {
    id: true,
    email: true,
    name: true,
    // Don't select sensitive fields like password
  },
});

// ✅ GOOD: Parameterized raw queries when needed
const users = await prisma.$queryRaw`
  SELECT * FROM users WHERE name = ${name} AND email = ${email}
`;
```

### Secure Query Patterns

```typescript
// ✅ Safe search with Prisma
const searchUsers = async (query: string) => {
  return prisma.user.findMany({
    where: {
      OR: [{ name: { contains: query, mode: "insensitive" } }, { email: { contains: query } }],
    },
  });
};

// ✅ Safe filtering
const filterProducts = async (filters: { minPrice?: number; category?: string }) => {
  return prisma.product.findMany({
    where: {
      ...(filters.minPrice && { price: { gte: filters.minPrice } }),
      ...(filters.category && { category: { slug: filters.category } }),
    },
  });
};
```

---

## 9. Security Headers in next.config.ts

Configure comprehensive security headers in Next.js config.

```typescript
// next.config.ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,

  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "X-DNS-Prefetch-Control",
            value: "on",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          {
            key: "X-Frame-Options",
            value: "SAMEORIGIN",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "X-XSS-Protection",
            value: "1; mode=block",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },

  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "trusted-cdn.com",
      },
    ],
  },
};

export default nextConfig;
```

---

## 10. Secure Server Actions

Server Actions must validate authentication and authorization.

```typescript
"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "~/lib/session";
import { z } from "zod";

const UpdateProfileSchema = z.object({
  name: z.string().min(1).max(100),
  bio: z.string().max(500).optional(),
});

export async function updateProfile(formData: FormData) {
  // 1. Verify authentication
  const session = await getSession();
  if (!session?.userId) {
    throw new Error("Unauthorized");
  }

  // 2. Validate input
  const rawData = {
    name: formData.get("name"),
    bio: formData.get("bio"),
  };

  const validatedData = UpdateProfileSchema.parse(rawData);

  // 3. Check authorization (user can only update own profile)
  const user = await db.user.findUnique({
    where: { id: session.userId },
  });

  if (!user) {
    throw new Error("User not found");
  }

  // 4. Perform action
  await db.user.update({
    where: { id: session.userId },
    data: validatedData,
  });

  // 5. Revalidate cache
  revalidatePath("/profile");

  return { success: true };
}
```

### Using Project's Safe Action Pattern

```typescript
"use server";

import { userActionClient } from "~/lib/safe-actions";
import { z } from "zod";

const profileSchema = z.object({
  name: z.string().min(1).max(100),
  bio: z.string().max(500).optional(),
});

export const updateProfile = userActionClient
  .inputSchema(profileSchema)
  .action(async ({ parsedInput, ctx: { db, user, revalidate } }) => {
    // Authorization is already handled by userActionClient
    // User context is available in ctx.user

    await db.user.update({
      where: { id: user.id },
      data: parsedInput,
    });

    revalidate({
      paths: ["/profile"],
      tags: [`user-${user.id}`],
    });

    return { success: true };
  });
```

---

## 11. Disable Source Maps in Production

Prevent exposing source code structure in production.

```typescript
// next.config.ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,

  // Disable source maps in production
  productionBrowserSourceMaps: false,

  // Remove console logs in production
  compiler: {
    removeConsole:
      process.env.NODE_ENV === "production"
        ? {
            exclude: ["error", "warn"],
          }
        : false,
  },

  webpack: (config, { dev, isServer }) => {
    if (!dev && !isServer) {
      // Disable source maps for client-side production builds
      config.devtool = false;
    }

    return config;
  },
};

export default nextConfig;
```

---

## 12. Dependency Auditing

Keep dependencies updated and free from vulnerabilities.

### Package.json Scripts

```json
{
  "scripts": {
    "audit": "bun audit",
    "audit:fix": "bun audit fix",
    "check-updates": "bunx npm-check-updates"
  }
}
```

### Automated Security Scanning

```yaml
# .github/dependabot.yml
version: 2
updates:
  - package-ecosystem: "npm"
    directory: "/"
    schedule:
      interval: "weekly"
    open-pull-requests-limit: 10
```

---

## 13. Vercel Security Configuration

Leverage Vercel's built-in security features.

### Environment Variables CLI

```bash
# Set sensitive environment variables
vercel env add DATABASE_URL
# Select: Production, Preview, Development
# Type: sensitive (encrypted and non-readable)

# View deployment logs for security monitoring
vercel logs <deployment-url>
```

### Vercel Firewall (Enterprise)

Enable protection against:

- SQL Injection
- Cross-Site Scripting (XSS)
- Scanner Detection
- Local File Inclusion (LFI)

---

## Security Principles Checklist

### Defense in Depth

- [ ] Implement CSP with nonces
- [ ] Use CSRF tokens
- [ ] Enable rate limiting
- [ ] Validate on client AND server
- [ ] Monitor logs and set alerts

### Least Privilege

- [ ] Users access only what they need
- [ ] APIs/services with limited permissions
- [ ] Environment variables scoped appropriately
- [ ] Review permissions regularly

### Input Validation

- [ ] Validate ALL user inputs
- [ ] Use Zod schemas
- [ ] Sanitize HTML content
- [ ] Use parameterized queries

### Keep Updated

- [ ] Update dependencies regularly
- [ ] Run `bun audit` before releases
- [ ] Apply security patches quickly
- [ ] Monitor CVE databases

---

## Decision Tree

1. **Adding a new API endpoint?**
   - Add rate limiting
   - Validate all inputs with Zod
   - Return generic error messages
   - Add to protected routes if auth required

2. **Handling user-generated content?**
   - Sanitize HTML with DOMPurify
   - Validate file uploads
   - Store securely (not in public dir)

3. **Adding authentication?**
   - Use Better Auth or NextAuth
   - Implement middleware protection
   - Add CSRF protection for forms
   - Use secure cookie settings

4. **Deploying to production?**
   - Disable source maps
   - Run security audit
   - Check all env vars are set
   - Review CSP configuration
