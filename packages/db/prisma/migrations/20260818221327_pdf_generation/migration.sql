-- AlterTable
ALTER TABLE "_PropertyToTag" ADD CONSTRAINT "_PropertyToTag_AB_pkey" PRIMARY KEY ("A", "B");

-- DropIndex
DROP INDEX "_PropertyToTag_AB_unique";
