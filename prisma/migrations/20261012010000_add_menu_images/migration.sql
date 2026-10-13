CREATE TABLE "MenuImage" (
    "id" TEXT NOT NULL,
    "menuItemId" TEXT NOT NULL,
    "content" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MenuImage_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "MenuImage_menuItemId_key" ON "MenuImage"("menuItemId");
ALTER TABLE "MenuImage" ADD CONSTRAINT "MenuImage_menuItemId_fkey"
    FOREIGN KEY ("menuItemId") REFERENCES "MenuItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
