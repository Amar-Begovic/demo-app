import { PrismaClient } from "../app/generated/prisma";

const prisma = new PrismaClient();

async function main() {
  const result = await prisma.article.updateMany({
    where: { articleGroup: null },
    data: { articleGroup: "Metalni" },
  });
  console.log(`Updated ${result.count} articles to group "Metalni"`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
