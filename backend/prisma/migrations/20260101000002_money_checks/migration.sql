-- ARCH-08 follow-up (adversarial-review defense-in-depth): the earlier
-- non-negative money CHECKs predate the columns PAY-02/PAY-04 added, so the
-- stated "all currency columns are non-negative INTEGER paise" invariant did not
-- actually cover Booking.promoDiscount, Booking.refundedAmount, or
-- Payment.refundedAmount. Extend the CHECKs so every money column is guarded.

ALTER TABLE "Booking" DROP CONSTRAINT IF EXISTS booking_refund_promo_nonneg;
ALTER TABLE "Booking" ADD CONSTRAINT booking_refund_promo_nonneg CHECK ("promoDiscount" >= 0 AND "refundedAmount" >= 0);

ALTER TABLE "Payment" DROP CONSTRAINT IF EXISTS payment_refund_nonneg;
ALTER TABLE "Payment" ADD CONSTRAINT payment_refund_nonneg CHECK ("refundedAmount" >= 0);
