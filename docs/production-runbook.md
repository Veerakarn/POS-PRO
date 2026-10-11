# POS@PRO production runbook

## Required Vercel environment variables

- `DATABASE_URL`: pooled Neon connection string with `sslmode=require`
- `QR_TOKEN_SECRET`: at least 32 random bytes; never reuse the database password
- `INITIAL_SETUP_TOKEN`: required only while claiming the first owner account
- `NEXT_PUBLIC_APP_URL`: the final HTTPS production origin, without a trailing slash

Set each value separately for Production and Preview. Run `npm run db:deploy` against the production Neon database before promoting a build that contains a new migration.

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
