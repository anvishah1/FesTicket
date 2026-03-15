# Razorpay setup – accounts and limits

## Do you need to pay money right now?

**No.** You can build and test everything **without paying Razorpay anything**.

- **Test mode**: Free. No KYC, no real money. Use test keys and dummy UPI/cards.
- **Live mode**: You don’t “pay Razorpay upfront”. They take a **fee per successful transaction** (e.g. ~2% in India). Money from customers goes to your linked bank account minus that fee.

So: **no monthly fee or upfront cost**; you only pay a percentage when you actually receive payments (in live mode).

---

## Step 1: Create a Razorpay account

1. Go to **[https://razorpay.com](https://razorpay.com)** → **Sign Up**.
2. Enter email, create password, verify email.
3. Fill the signup form. Razorpay may ask for **PAN** or basic business details even for Test mode – this is part of their standard onboarding, not full KYC. If PAN is required to complete signup, you have to enter it; there’s no way around that step. You still don’t need to complete **full KYC** (bank linking, business verification) to use Test mode.
4. You land on the **Dashboard**. You’re in **Test mode** by default (toggle at top: Test / Live).

**Test mode** does not require full KYC (no bank account, no business docs). You can generate test keys and test payments right after signup. If they asked for PAN at signup, that’s normal – it doesn’t mean you’re going live.

---

## Step 2: Get API keys (Test mode)

1. In Dashboard, go to **Settings** (or **Account & Settings**) → **API Keys**.
2. Click **Generate Key** (for Test mode).
3. You get:
   - **Key ID** (starts with `rzp_test_`) – used in the frontend.
   - **Key Secret** – used only on the backend; never put this in frontend or git.

Add these to your env (see below). No payment or card needed to generate test keys.

---

## Step 3: Test mode vs Live mode

| | Test mode | Live mode |
|---|-----------|-----------|
| **KYC** | No full KYC (they may still ask PAN at signup) | Full KYC required (24–48 hrs) |
| **Money** | No real money; test UPI/cards only | Real payments |
| **Keys** | `rzp_test_...` | `rzp_live_...` |
| **Use case** | Development and testing | Production |

Start with **Test mode**. When you’re ready to go live, complete KYC, add your bank account, switch to Live, and use live keys in production env.

---

## Step 4: UPI and other methods

- **Test mode**: Use **Razorpay’s test credentials only** – your real UPI ID or card will not work. No real money is charged.
  - **Test UPI (success):** `success@razorpay`
  - **Test UPI (failure):** `failure@razorpay`
  - **Test cards** and more: [Razorpay test credentials](https://razorpay.com/docs/payments/payments/test-card-details/)
- **Live mode**: Real UPI/cards work. Razorpay’s standard **transaction fees** apply (e.g. ~2% for UPI/cards in India). No extra “UPI fee” beyond their normal pricing.

So: **no extra cost “for UPI”**; same fee structure for UPI/cards/netbanking in live mode.

---

## Step 5: Where the money goes (your case)

- All payments (test or live) are tied to **one Razorpay account**.
- In **live mode** you link a **bank account** in Razorpay. After settlement (e.g. T+2 days), money is sent to that account minus Razorpay’s fee.
- You said you’ll **collect first and split to fests later** – so one bank account (yours/company’s) receives everything; you handle payouts to fests separately.

---

## Env variables (for the app)

**Backend** (`backend/.env`):

- `RAZORPAY_KEY_ID=rzp_test_xxxx`   (from Step 2)
- `RAZORPAY_KEY_SECRET=xxxx`        (from Step 2)

**Frontend** (for Checkout):

- `NEXT_PUBLIC_RAZORPAY_KEY_ID=rzp_test_xxxx`   (same Key ID; safe to expose)

If these are missing, the app can fall back to the old “simulated” payment (no real Razorpay). Once you add the keys, the real Razorpay flow is used.
