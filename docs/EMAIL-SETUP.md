# Email setup (booking confirmation)

The app sends booking confirmation emails when a payment completes. To enable this, add SMTP settings to `backend/.env`.

---

## Option 1: Gmail (good for testing)

### 1. Turn on 2-Step Verification

1. Go to [Google Account](https://myaccount.google.com) → **Security**.
2. Under "How you sign in to Google", enable **2-Step Verification** if it’s not already on.

### 2. Create an App Password

1. In **Security**, open **2-Step Verification**.
2. At the bottom, click **App passwords**.
3. Select app: **Mail**, device: **Other** → type "FesTicket" → **Generate**.
4. Copy the **16-character password** (no spaces). This is your `SMTP_PASS`.

### 3. Add to `backend/.env`

Open `backend/.env` and add (use your real Gmail and the app password you just generated):

```env
# Email (booking confirmation)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-gmail@gmail.com
SMTP_PASS=xxxx xxxx xxxx xxxx
MAIL_FROM=your-gmail@gmail.com
APP_NAME=FesTicket
```

- Replace `your-gmail@gmail.com` with your Gmail address (for both `SMTP_USER` and `MAIL_FROM`).
- Replace `xxxx xxxx xxxx xxxx` with the 16-character app password (you can paste it with or without spaces).

### 4. Restart the backend

Restart your backend server so it loads the new env vars. Then complete a test booking; the confirmation email should be sent to the address entered on the form.

---

## Option 2: Other providers

Use the same variables in `backend/.env` with your provider’s SMTP details:

| Provider   | SMTP_HOST           | SMTP_PORT |
|-----------|---------------------|-----------|
| Gmail     | smtp.gmail.com      | 587       |
| Outlook   | smtp-mail.outlook.com | 587     |
| SendGrid  | smtp.sendgrid.net   | 587       |
| Mailgun   | smtp.mailgun.org    | 587       |
| Yahoo     | smtp.mail.yahoo.com | 587       |

Set `SMTP_USER` and `SMTP_PASS` to the credentials your provider gives you (often a username + API key or app password). Set `MAIL_FROM` to the “from” address you’re allowed to use.

---

## If you don’t add SMTP

The app still works. Booking confirmations are simply not sent; the backend logs something like:  
`[email] SMTP not configured (SMTP_HOST/USER/PASS). Skipping send.`
