# Quick setup checklist

## If "Request failed" on admin signup or AdminRequest table not in Prisma Studio

1. **Regenerate DB and client** (from `backend` folder):
   ```bash
   npx prisma generate
   npx prisma db push
   ```
2. **Restart the backend** (stop and run `npm run dev` again).
3. **Restart Prisma Studio** if it’s open (close and run `npx prisma studio` again) so it shows the `AdminRequest` model.

## If student editor requests don’t appear in RoleRequest

1. **Set a fest key first.** A student’s key must match a fest’s `adminKey`. From `backend`:
   ```bash
   node src/scripts/setFestAdminKey.js <festId> <key> [adminEmail]
   ```
   Example: `node src/scripts/setFestAdminKey.js 4 TATHVA-2025-KEY`
   This sets `adminKey` for fest 4 to `TATHVA-2025-KEY`.
2. **Student signup:** On `/signup`, tick “I want to become an Editor” and enter that **exact** key. If the key doesn’t match any fest, you’ll get “Invalid fest key” and no RoleRequest is created.
