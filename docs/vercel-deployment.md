# Deploy POS@PRO to Vercel

## One-time project setup

1. Import the repository into Vercel and select the `pos-pro` project.
2. Keep the framework preset as **Next.js** and the root directory at the repository root. Use `npm run build` as the build command and leave the output directory unset.
3. Add these Production environment variables before the first production build:
   - `DATABASE_URL`: the pooled Neon PostgreSQL connection string, including `sslmode=require`.
   - `NEXT_PUBLIC_APP_URL`: the final HTTPS Vercel or custom-domain origin, with no trailing slash. This value is used in table QR codes; changing it requires a new build/deployment.
   - `INITIAL_SETUP_TOKEN`: a long, unique random secret, needed only while creating the first organization or claiming the initial owner in production.
4. If this is a new, empty database, deploy once and open `/setup` to create the organization and owner. If the database already has the shop's organization, do not initialize it again; use the owner-claim flow only if the owner account is still unclaimed. Once initial setup/claim is complete, remove `INITIAL_SETUP_TOKEN` from the Production environment and redeploy.
5. Open `/api/health` and confirm it returns HTTP 200 with `status: "ok"` and `database: "connected"`. Then sign in, configure the branch/menu/payment/tax/printer settings, and use `/settings/readiness` before opening the store. Print fresh table QR codes from `/settings/tables`; previously printed codes that contain a localhost URL must be replaced.

For Preview deployments, use a separate Neon branch/database and a preview HTTPS origin if you need to test QR orders. Do not point experimental preview builds at the live restaurant database.

## Database releases

The Vercel build generates the Prisma client but does not change the database schema. Before releasing a version that adds migrations, take a Neon restore point, apply the committed migrations to the intended database with `npm run db:deploy`, then deploy the matching application version. Never use `npm run db:migrate` against production; it runs the development migration workflow.

## Store printers

Vercel cannot reach USB or private-LAN printers directly. Run the separate Windows Print Agent on an always-on computer inside each branch, point `POSPRO_SERVER_URL` to the deployed HTTPS origin, set the agent token from the POS printer settings, then verify a real test print from `/settings/printers`.

## Before opening

- Confirm `/api/health` is healthy and `/settings/readiness` has no unresolved setup items.
- Test one complete order and payment flow from a phone/tablet, confirm it reaches the right kitchen/bar queue, and verify the receipt and kitchen ticket print.
- Verify the branch's backup/restore plan in Neon and keep Preview data separate from Production.
