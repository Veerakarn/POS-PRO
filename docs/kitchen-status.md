# Kitchen order tracking

- Orders are grouped by `Order.id` within each production station. Separate submissions at the same table remain separate cards.
- The kitchen team uses its existing branch-scoped `kitchen.view` permission to receive (`NEW` → `ACKNOWLEDGED`) and serve (`ACKNOWLEDGED` / `PREPARING` / `READY` → `SERVED`) that station's items. Cancelled items and closed table sessions cannot be updated.
- Item status is shared across stations if the same menu item routes to multiple stations. Serving it from one station completes that item everywhere.
- The branch switch is persisted in `Branch.orderStatusTrackingEnabled` (default enabled). Disabling hides controls and customer progress without marking orders served. Cards stay until the table closes. Enabling again resumes saved item statuses.
- Customers poll every 10 seconds while the page is visible, using the active table QR secret and session nonce. Closed or invalid sessions return no orders. Status requests expose no billing or customer account information.

## Deployment

Apply migration `20261021010000_order_status_tracking` to the intended database before deploying the new application. The migration adds one non-null boolean column with a default; it does not remove existing data.

Use the project's existing migration workflow (`npm.cmd run db:deploy`) against the intended environment, then deploy the app (the build regenerates Prisma Client). The Print Agent does not need an update.

## Verification

`node --test tests/kitchen-progress.test.cjs` tests grouping, status transitions, branch authorization, toggling and customer QR restrictions with database doubles.

`node tests/kitchen-progress-browser.cjs [directory containing playwright]` runs isolated kitchen/customer browser fixtures with the actual React components. It verifies grouped cards, receive/serve, polling, toggling, reload and narrow screens. It does not access the real application database or printers.
