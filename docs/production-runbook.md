# POS@PRO production runbook

## Required Vercel environment variables

- `DATABASE_URL`: pooled Neon connection string with `sslmode=require`
- `INITIAL_SETUP_TOKEN`: required only while claiming the first owner account
- `NEXT_PUBLIC_APP_URL`: the final HTTPS production origin, without a trailing slash

Set these values in Vercel for Production. `NEXT_PUBLIC_APP_URL` is the public HTTPS URL encoded into table QR codes; set it before deploying and redeploy after changing it. Set a separate URL for Preview if you intend to test QR orders there. Keep `INITIAL_SETUP_TOKEN` as a long random value, use it only for first-time setup/owner claim, then remove it from Vercel after the owner account is initialized.

For every release that adds a Prisma migration, back up or create a Neon restore point, then run `npm run db:deploy` against the intended Neon database before sending traffic to that release. Never run `migrate dev` against production.

## Monitoring

Monitor `GET /api/health`. A healthy response is HTTP 200 with `status: ok` and `database: connected`. Alert after two consecutive HTTP 503 responses. Do not use this endpoint as a database benchmark.

Review these pages during operation:

- `/settings/printers` for failed or queued print jobs
- `/shifts` for cash differences and shifts left open
- `/inventory` for negative or low stock
- `/audit` for refunds, voids, discounts, staff changes, and login events

## Backup and recovery

Enable Neon point-in-time restore for the production project and keep the retention period appropriate for the store. Before a destructive migration, create a Neon restore point or branch. Test restoration into a separate Neon branch before the first live opening and quarterly afterward. Never test a restore over the production database.

## Print Agent

The Windows Print Agent must run on a computer inside each branch network. Keep its token outside source control. After deployment, update its server URL to the production HTTPS origin, run a test print from `/settings/printers`, and verify both Windows/USB and network printers that the branch actually uses.

## Release checklist

1. Run `npm run check`, `npm run lint`, all database tests, and `npm run build`.
2. Apply migrations with `npm run db:deploy`.
3. Verify `/api/health` on the deployed URL.
4. Complete one test sale: QR order, kitchen display, split/discount if used, payment, receipt, refund, and cash shift close.
5. Confirm the sale, stock movement, print job, and audit trail on their respective pages.
