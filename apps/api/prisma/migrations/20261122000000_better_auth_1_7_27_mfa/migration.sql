ALTER TABLE "users"
ADD COLUMN IF NOT EXISTS "twoFactorEnabled" BOOLEAN DEFAULT false;

ALTER TABLE "sessions"
ADD COLUMN IF NOT EXISTS "mfaVerified" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS "two_factors" (
  "id" TEXT NOT NULL,
  "secret" TEXT NOT NULL,
  "backupCodes" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "verified" BOOLEAN DEFAULT true,
  "failedVerificationCount" INTEGER DEFAULT 0,
  "lockedUntil" TIMESTAMPTZ,
  CONSTRAINT "two_factors_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "two_factors_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "two_factors_userId_idx" ON "two_factors"("userId");
CREATE INDEX IF NOT EXISTS "two_factors_secret_idx" ON "two_factors"("secret");
