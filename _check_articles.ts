import { PrismaClient } from "./app/generated/prisma";

const prisma = new PrismaClient();

const codes = [
  "1054","1109","1110","1111","1112","1113","1114","1115","1116","1117",
  "1119","1120","1122","1154","1157","1161","1162","1177","1180","1181",
  "1213","1214","1216","1233","1234","1235","1236","1253","1262","1301",
  "1303","1309","1330","1341","1342","1349","1374","1381","1383","1384",
  "1391","1403","1415","1435","1442","1472","1550","1551","1568","1617",
  "1618","199","271","336","337","385","562","566","583","588",
  "682","708","716","717","718","719","736","737","738","775",
  "776","777","781","785","808","829","830","831","832","833",
  "834","835","836","837","838","887","888","923","924","926",
  "956","957","959"
];

async function main() {
  const articles = await prisma.article.findMany({
    where: { code: { in: codes } },
    select: {
      id: true,
      code: true,
      name: true,
      _count: {
        select: {
          productionOrders: true,
          productionOrderItems: true,
        },
      },
    },
  });

  const withOrders = articles.filter(
    (a) => a._count.productionOrders > 0 || a._count.productionOrderItems > 0
  );
  const withoutOrders = articles.filter(
    (a) => a._count.productionOrders === 0 && a._count.productionOrderItems === 0
  );

  console.log("Ukupno artikala pronadjeno u bazi:", articles.length);
  console.log("Od toga SA nalozima:", withOrders.length);
  if (withOrders.length > 0) {
    withOrders.forEach((a) =>
      console.log(
        `  - ${a.code} ${a.name} | nalozi: ${a._count.productionOrders} | stavke: ${a._count.productionOrderItems}`
      )
    );
  }
  console.log("Artikli BEZ naloga:", withoutOrders.length);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
