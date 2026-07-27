CREATE TABLE "Tag" (
    "id" SERIAL NOT NULL,
    "label" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Tag_label_key" ON "Tag"("label");

INSERT INTO "Tag" ("label", "sortOrder") VALUES
  ('Commercial', 10),
  ('HOA', 20),
  ('Industrial', 30),
  ('Manufactured Home', 40),
  ('Office', 50),
  ('Other', 60),
  ('Parking', 70),
  ('Residential', 80),
  ('Retail', 90),
  ('Senior Living', 100),
  ('Storage', 110),
  ('Student Housing', 120);

INSERT INTO "Tag" ("label")
SELECT DISTINCT property_tag.label
FROM "Property"
CROSS JOIN LATERAL unnest("Property"."tags") AS property_tag(label)
ON CONFLICT ("label") DO NOTHING;

CREATE TABLE "_PropertyToTag" (
    "A" INTEGER NOT NULL,
    "B" INTEGER NOT NULL,

    CONSTRAINT "_PropertyToTag_AB_pkey" PRIMARY KEY ("A", "B")
);

CREATE INDEX "_PropertyToTag_B_index" ON "_PropertyToTag"("B");

INSERT INTO "_PropertyToTag" ("A", "B")
SELECT "Property"."id", "Tag"."id"
FROM "Property"
CROSS JOIN LATERAL unnest("Property"."tags") AS property_tag(label)
JOIN "Tag" ON "Tag"."label" = property_tag.label
ON CONFLICT DO NOTHING;

ALTER TABLE "_PropertyToTag" ADD CONSTRAINT "_PropertyToTag_A_fkey" FOREIGN KEY ("A") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "_PropertyToTag" ADD CONSTRAINT "_PropertyToTag_B_fkey" FOREIGN KEY ("B") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Property" DROP COLUMN "tags";
