ALTER TABLE "_PropertyToTag" DROP CONSTRAINT "_PropertyToTag_AB_pkey";

CREATE UNIQUE INDEX "_PropertyToTag_AB_unique" ON "_PropertyToTag"("A", "B");
