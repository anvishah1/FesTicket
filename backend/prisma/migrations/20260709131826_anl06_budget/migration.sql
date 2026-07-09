-- CreateTable
CREATE TABLE "Budget" (
    "id" SERIAL NOT NULL,
    "festId" INTEGER NOT NULL,
    "category" "ExpenseCategory",
    "amount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Budget_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Budget_festId_idx" ON "Budget"("festId");

-- CreateIndex
CREATE UNIQUE INDEX "Budget_festId_category_key" ON "Budget"("festId", "category");

-- AddForeignKey
ALTER TABLE "Budget" ADD CONSTRAINT "Budget_festId_fkey" FOREIGN KEY ("festId") REFERENCES "Fest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
