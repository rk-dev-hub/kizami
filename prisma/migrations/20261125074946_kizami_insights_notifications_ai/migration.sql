-- CreateEnum
CREATE TYPE "InsightKind" AS ENUM ('MISSING_PUNCH', 'FORGOT_CLOCK_OUT', 'MONTHLY_OVERTIME_PACE', 'YEARLY_OVERTIME_PACE', 'LEGAL_CAP_RISK', 'CONSECUTIVE_WORKDAYS', 'SHORT_REST_INTERVAL', 'LATE_NIGHT_STREAK', 'BREAK_SHORTAGE_REPEAT', 'PAID_LEAVE_OBLIGATION', 'PAID_LEAVE_EXPIRING', 'WEEKLY_40H_NEAR');

-- CreateEnum
CREATE TYPE "InsightSeverity" AS ENUM ('INFO', 'CAUTION', 'WARNING');

-- CreateEnum
CREATE TYPE "InsightStatus" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'RESOLVED');

-- CreateEnum
CREATE TYPE "NotificationKind" AS ENUM ('FORGOT_CLOCK_OUT', 'MISSING_PUNCH', 'REQUEST_RESULT', 'ADMIN_MESSAGE', 'INSIGHT_ALERT', 'PENDING_APPROVALS', 'WEEKLY_DIGEST');

-- CreateEnum
CREATE TYPE "AiFeature" AS ENUM ('DAILY_NOTES', 'DRAFT_FROM_TEXT', 'ANSWER_QUESTION', 'SUMMARIZE_REQUEST', 'EXPLAIN_INSIGHT', 'CLOSING_MESSAGE', 'WEEKLY_DIGEST');

-- CreateEnum
CREATE TYPE "AiOutcome" AS ENUM ('OK', 'FALLBACK_NO_KEY', 'RATE_LIMITED', 'TIMEOUT', 'API_ERROR', 'REFUSAL', 'INVALID_OUTPUT');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditAction" ADD VALUE 'MESSAGE_SEND';
ALTER TYPE "AuditAction" ADD VALUE 'INSIGHT_ACK';

-- AlterTable
ALTER TABLE "WorkRule" ADD COLUMN     "agreementMonthlyLimitMinutes" INTEGER NOT NULL DEFAULT 2700,
ADD COLUMN     "agreementYearStartMonth" INTEGER NOT NULL DEFAULT 4,
ADD COLUMN     "agreementYearlyLimitMinutes" INTEGER NOT NULL DEFAULT 21600,
ADD COLUMN     "specialClauseEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "specialMonthsPerYear" INTEGER NOT NULL DEFAULT 6,
ADD COLUMN     "specialYearlyLimitMinutes" INTEGER NOT NULL DEFAULT 43200;

-- CreateTable
CREATE TABLE "InsightSetting" (
    "kind" "InsightKind" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "params" JSONB NOT NULL DEFAULT '{}',
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "InsightSetting_pkey" PRIMARY KEY ("kind")
);

-- CreateTable
CREATE TABLE "Insight" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "kind" "InsightKind" NOT NULL,
    "periodKey" TEXT NOT NULL,
    "severity" "InsightSeverity" NOT NULL,
    "status" "InsightStatus" NOT NULL DEFAULT 'OPEN',
    "facts" JSONB NOT NULL,
    "detectedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "ackById" UUID,
    "ackNote" TEXT,
    "ackAt" TIMESTAMPTZ(6),
    "resolvedAt" TIMESTAMPTZ(6),

    CONSTRAINT "Insight_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "kind" "NotificationKind" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "linkPath" TEXT,
    "senderId" UUID,
    "dedupeKey" TEXT NOT NULL,
    "readAt" TIMESTAMPTZ(6),
    "emailedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationPreference" (
    "userId" UUID NOT NULL,
    "kind" "NotificationKind" NOT NULL,
    "email" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("userId","kind")
);

-- CreateTable
CREATE TABLE "AiUsageLog" (
    "id" UUID NOT NULL,
    "userId" UUID,
    "feature" "AiFeature" NOT NULL,
    "model" TEXT,
    "outcome" "AiOutcome" NOT NULL,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "latencyMs" INTEGER,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiUsageLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiCache" (
    "key" TEXT NOT NULL,
    "feature" "AiFeature" NOT NULL,
    "output" JSONB NOT NULL,
    "expiresAt" TIMESTAMPTZ(6) NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiCache_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "JobRun" (
    "name" TEXT NOT NULL,
    "lastRunAt" TIMESTAMPTZ(6) NOT NULL,
    "lastStatus" TEXT NOT NULL,
    "lastError" TEXT,

    CONSTRAINT "JobRun_pkey" PRIMARY KEY ("name")
);

-- CreateIndex
CREATE INDEX "Insight_status_severity_idx" ON "Insight"("status", "severity");

-- CreateIndex
CREATE INDEX "Insight_userId_status_idx" ON "Insight"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Insight_userId_kind_periodKey_key" ON "Insight"("userId", "kind", "periodKey");

-- CreateIndex
CREATE UNIQUE INDEX "Notification_dedupeKey_key" ON "Notification"("dedupeKey");

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_idx" ON "Notification"("userId", "readAt");

-- CreateIndex
CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_emailedAt_idx" ON "Notification"("emailedAt");

-- CreateIndex
CREATE INDEX "AiUsageLog_userId_createdAt_idx" ON "AiUsageLog"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "AiUsageLog_createdAt_idx" ON "AiUsageLog"("createdAt");

-- CreateIndex
CREATE INDEX "AiCache_expiresAt_idx" ON "AiCache"("expiresAt");

-- AddForeignKey
ALTER TABLE "Insight" ADD CONSTRAINT "Insight_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Insight" ADD CONSTRAINT "Insight_ackById_fkey" FOREIGN KEY ("ackById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiUsageLog" ADD CONSTRAINT "AiUsageLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
