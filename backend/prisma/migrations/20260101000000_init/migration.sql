-- CreateEnum
CREATE TYPE "Role" AS ENUM ('VIEWER', 'EDITOR', 'HOST', 'ADMIN');

-- CreateEnum
CREATE TYPE "RoleStatus" AS ENUM ('ACTIVE', 'PENDING', 'DENIED');

-- CreateEnum
CREATE TYPE "EventStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'UPCOMING', 'LIVE', 'PAST', 'CANCELLED');

-- CreateEnum
CREATE TYPE "Visibility" AS ENUM ('PUBLIC', 'PRIVATE');

-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('PENDING', 'COMPLETED', 'CANCELLED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CARD', 'UPI', 'NETBANKING', 'WALLET');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'SUCCESS', 'FAILED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "SponsorStatus" AS ENUM ('NEGOTIATING', 'PENDING', 'CONFIRMED');

-- CreateEnum
CREATE TYPE "ExpenseCategory" AS ENUM ('INFRASTRUCTURE', 'MARKETING', 'ARTIST_FEES', 'CATERING', 'TRANSPORTATION', 'SECURITY', 'DECORATION', 'SOUND_AV', 'PRIZES', 'MISCELLANEOUS');

-- CreateEnum
CREATE TYPE "FileType" AS ENUM ('PROOF', 'BILL');

-- CreateEnum
CREATE TYPE "RoleRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'DENIED');

-- CreateEnum
CREATE TYPE "AdminRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'DENIED');

-- CreateEnum
CREATE TYPE "EmailStatus" AS ENUM ('QUEUED', 'SENT', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "PromoKind" AS ENUM ('PERCENT', 'FLAT');

-- CreateTable
CREATE TABLE "User" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT,
    "name" TEXT,
    "phone" TEXT,
    "organizationName" TEXT,
    "organizationEmail" TEXT,
    "role" "Role" NOT NULL DEFAULT 'VIEWER',
    "roleStatus" "RoleStatus" NOT NULL DEFAULT 'ACTIVE',
    "profileCompleted" BOOLEAN NOT NULL DEFAULT false,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "emailVerifyToken" TEXT,
    "resetPasswordToken" TEXT,
    "resetPasswordExpiry" TIMESTAMP(3),
    "lastLogin" TIMESTAMP(3),
    "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockUntil" TIMESTAMP(3),
    "tokenVersion" INTEGER NOT NULL DEFAULT 0,
    "managedFestId" INTEGER,
    "editorFestId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Fest" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "college" TEXT NOT NULL,
    "description" TEXT,
    "image" TEXT,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "adminKey" TEXT,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Fest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Event" (
    "id" SERIAL NOT NULL,
    "festId" INTEGER,
    "hostId" INTEGER,
    "name" TEXT NOT NULL,
    "shortDescription" TEXT,
    "description" TEXT,
    "aboutEvent" TEXT,
    "audience" TEXT,
    "image" TEXT,
    "category" TEXT,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "startTime" TEXT,
    "endTime" TEXT,
    "venue" TEXT,
    "venueAddress" TEXT,
    "onlineLink" TEXT,
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "visibility" "Visibility" NOT NULL DEFAULT 'PUBLIC',
    "status" "EventStatus" NOT NULL DEFAULT 'PUBLISHED',
    "discount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketType" (
    "id" SERIAL NOT NULL,
    "eventId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "price" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "sold" INTEGER NOT NULL DEFAULT 0,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TicketType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Booking" (
    "id" SERIAL NOT NULL,
    "bookingCode" TEXT NOT NULL,
    "eventId" INTEGER NOT NULL,
    "userId" INTEGER,
    "guestEmail" TEXT,
    "guestName" TEXT,
    "guestPhone" TEXT,
    "subtotal" INTEGER NOT NULL,
    "discount" INTEGER NOT NULL DEFAULT 0,
    "platformFee" INTEGER NOT NULL DEFAULT 0,
    "tax" INTEGER NOT NULL DEFAULT 0,
    "total" INTEGER NOT NULL,
    "status" "BookingStatus" NOT NULL DEFAULT 'PENDING',
    "promoCodeId" INTEGER,
    "promoDiscount" INTEGER NOT NULL DEFAULT 0,
    "refundedAmount" INTEGER NOT NULL DEFAULT 0,
    "refundReason" TEXT,
    "purchaseDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Booking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingItem" (
    "id" SERIAL NOT NULL,
    "bookingId" INTEGER NOT NULL,
    "ticketTypeId" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPrice" INTEGER NOT NULL,
    "totalPrice" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BookingItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attendee" (
    "id" SERIAL NOT NULL,
    "bookingId" INTEGER NOT NULL,
    "ticketTypeId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Attendee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" SERIAL NOT NULL,
    "bookingId" INTEGER NOT NULL,
    "orderId" TEXT,
    "amount" INTEGER NOT NULL,
    "refundedAmount" INTEGER NOT NULL DEFAULT 0,
    "refundId" TEXT,
    "method" "PaymentMethod",
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "transactionId" TEXT,
    "paymentDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sponsor" (
    "id" SERIAL NOT NULL,
    "festId" INTEGER,
    "eventId" INTEGER,
    "companyName" TEXT NOT NULL,
    "contactPerson" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "sponsorshipAmount" INTEGER NOT NULL,
    "receivedAmount" INTEGER NOT NULL DEFAULT 0,
    "status" "SponsorStatus" NOT NULL DEFAULT 'NEGOTIATING',
    "notes" TEXT,
    "agreementUrl" TEXT,
    "agreementType" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Sponsor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Expense" (
    "id" SERIAL NOT NULL,
    "hostId" INTEGER NOT NULL,
    "festId" INTEGER,
    "eventId" INTEGER,
    "description" TEXT NOT NULL,
    "category" "ExpenseCategory" NOT NULL,
    "vendor" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "paymentDate" TIMESTAMP(3),
    "paymentMethod" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpenseFile" (
    "id" SERIAL NOT NULL,
    "expenseId" INTEGER NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileType" "FileType" NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "fileSize" INTEGER,
    "mimeType" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExpenseFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoleRequest" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "festId" INTEGER,
    "requestedRole" "Role" NOT NULL,
    "organization" TEXT,
    "status" "RoleRequestStatus" NOT NULL DEFAULT 'PENDING',
    "requestDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "reviewedById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RoleRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" SERIAL NOT NULL,
    "token" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "familyId" TEXT,
    "revokedAt" TIMESTAMP(3),
    "userAgent" TEXT,
    "ipAddress" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminRequest" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "organization" TEXT,
    "festName" TEXT,
    "phone" TEXT,
    "status" "AdminRequestStatus" NOT NULL DEFAULT 'PENDING',
    "passwordSet" TEXT,
    "adminKeySet" TEXT,
    "festId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventQuestion" (
    "id" SERIAL NOT NULL,
    "eventId" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'text',
    "options" TEXT,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttendeeAnswer" (
    "id" SERIAL NOT NULL,
    "bookingId" INTEGER NOT NULL,
    "questionId" INTEGER NOT NULL,
    "value" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AttendeeAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailLog" (
    "id" SERIAL NOT NULL,
    "toEmail" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "template" TEXT,
    "bookingId" INTEGER,
    "provider" TEXT,
    "providerMessageId" TEXT,
    "status" "EmailStatus" NOT NULL DEFAULT 'QUEUED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookEvent" (
    "id" SERIAL NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'razorpay',
    "eventId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromoCode" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "festId" INTEGER,
    "eventId" INTEGER,
    "kind" "PromoKind" NOT NULL,
    "percentOff" INTEGER,
    "flatOffPaise" INTEGER,
    "maxDiscountPaise" INTEGER,
    "minSubtotalPaise" INTEGER,
    "maxRedemptions" INTEGER,
    "redeemedCount" INTEGER NOT NULL DEFAULT 0,
    "startsAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PromoCode_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_managedFestId_key" ON "User"("managedFestId");

-- CreateIndex
CREATE UNIQUE INDEX "Fest_adminKey_key" ON "Fest"("adminKey");

-- CreateIndex
CREATE INDEX "Event_festId_idx" ON "Event"("festId");

-- CreateIndex
CREATE INDEX "Event_hostId_idx" ON "Event"("hostId");

-- CreateIndex
CREATE INDEX "Event_status_idx" ON "Event"("status");

-- CreateIndex
CREATE INDEX "Event_visibility_idx" ON "Event"("visibility");

-- CreateIndex
CREATE INDEX "TicketType_eventId_idx" ON "TicketType"("eventId");

-- CreateIndex
CREATE UNIQUE INDEX "Booking_bookingCode_key" ON "Booking"("bookingCode");

-- CreateIndex
CREATE INDEX "Booking_eventId_status_idx" ON "Booking"("eventId", "status");

-- CreateIndex
CREATE INDEX "Booking_eventId_purchaseDate_idx" ON "Booking"("eventId", "purchaseDate");

-- CreateIndex
CREATE INDEX "Booking_status_createdAt_idx" ON "Booking"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Booking_guestEmail_idx" ON "Booking"("guestEmail");

-- CreateIndex
CREATE INDEX "Booking_userId_idx" ON "Booking"("userId");

-- CreateIndex
CREATE INDEX "BookingItem_bookingId_idx" ON "BookingItem"("bookingId");

-- CreateIndex
CREATE INDEX "Attendee_bookingId_idx" ON "Attendee"("bookingId");

-- CreateIndex
CREATE INDEX "Attendee_ticketTypeId_idx" ON "Attendee"("ticketTypeId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_bookingId_key" ON "Payment"("bookingId");

-- CreateIndex
CREATE INDEX "Payment_bookingId_idx" ON "Payment"("bookingId");

-- CreateIndex
CREATE INDEX "Sponsor_festId_idx" ON "Sponsor"("festId");

-- CreateIndex
CREATE INDEX "Sponsor_eventId_idx" ON "Sponsor"("eventId");

-- CreateIndex
CREATE INDEX "Expense_hostId_idx" ON "Expense"("hostId");

-- CreateIndex
CREATE INDEX "Expense_festId_idx" ON "Expense"("festId");

-- CreateIndex
CREATE INDEX "Expense_eventId_idx" ON "Expense"("eventId");

-- CreateIndex
CREATE INDEX "RoleRequest_userId_idx" ON "RoleRequest"("userId");

-- CreateIndex
CREATE INDEX "RoleRequest_festId_idx" ON "RoleRequest"("festId");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_token_key" ON "RefreshToken"("token");

-- CreateIndex
CREATE INDEX "RefreshToken_userId_idx" ON "RefreshToken"("userId");

-- CreateIndex
CREATE INDEX "EventQuestion_eventId_idx" ON "EventQuestion"("eventId");

-- CreateIndex
CREATE INDEX "AttendeeAnswer_bookingId_idx" ON "AttendeeAnswer"("bookingId");

-- CreateIndex
CREATE INDEX "EmailLog_status_idx" ON "EmailLog"("status");

-- CreateIndex
CREATE INDEX "EmailLog_bookingId_idx" ON "EmailLog"("bookingId");

-- CreateIndex
CREATE UNIQUE INDEX "WebhookEvent_eventId_key" ON "WebhookEvent"("eventId");

-- CreateIndex
CREATE INDEX "PromoCode_eventId_idx" ON "PromoCode"("eventId");

-- CreateIndex
CREATE UNIQUE INDEX "PromoCode_festId_code_key" ON "PromoCode"("festId", "code");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_managedFestId_fkey" FOREIGN KEY ("managedFestId") REFERENCES "Fest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_editorFestId_fkey" FOREIGN KEY ("editorFestId") REFERENCES "Fest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_festId_fkey" FOREIGN KEY ("festId") REFERENCES "Fest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_hostId_fkey" FOREIGN KEY ("hostId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketType" ADD CONSTRAINT "TicketType_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingItem" ADD CONSTRAINT "BookingItem_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingItem" ADD CONSTRAINT "BookingItem_ticketTypeId_fkey" FOREIGN KEY ("ticketTypeId") REFERENCES "TicketType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attendee" ADD CONSTRAINT "Attendee_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attendee" ADD CONSTRAINT "Attendee_ticketTypeId_fkey" FOREIGN KEY ("ticketTypeId") REFERENCES "TicketType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sponsor" ADD CONSTRAINT "Sponsor_festId_fkey" FOREIGN KEY ("festId") REFERENCES "Fest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sponsor" ADD CONSTRAINT "Sponsor_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_hostId_fkey" FOREIGN KEY ("hostId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_festId_fkey" FOREIGN KEY ("festId") REFERENCES "Fest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseFile" ADD CONSTRAINT "ExpenseFile_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "Expense"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoleRequest" ADD CONSTRAINT "RoleRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoleRequest" ADD CONSTRAINT "RoleRequest_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoleRequest" ADD CONSTRAINT "RoleRequest_festId_fkey" FOREIGN KEY ("festId") REFERENCES "Fest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminRequest" ADD CONSTRAINT "AdminRequest_festId_fkey" FOREIGN KEY ("festId") REFERENCES "Fest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventQuestion" ADD CONSTRAINT "EventQuestion_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendeeAnswer" ADD CONSTRAINT "AttendeeAnswer_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

