import { PrismaClient } from "../app/generated/prisma";

const prisma = new PrismaClient();

async function check() {
  const count = await prisma.fabric.count();
  console.log("Fabrics in DB:", count);
  
  const first5 = await prisma.fabric.findMany({ take: 5 });
  console.log("First 5:", first5);
}

check().finally(() => prisma.$disconnect());
