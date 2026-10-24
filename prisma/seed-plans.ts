import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const plans = [
    { id: "starter", name: "Starter", priceMonthly: 97, priceYearly: 970, maxSessions: 1, order: 0 },
    { id: "pro", name: "Pro", priceMonthly: 197, priceYearly: 1970, maxSessions: 3, order: 1 },
    { id: "agency", name: "Agência", priceMonthly: 497, priceYearly: 4970, maxSessions: 10, order: 2 },
];

async function main() {
    for (const plan of plans) {
        await prisma.plan.upsert({ where: { id: plan.id }, update: {}, create: plan });
    }
    console.log(`Planos garantidos: ${plans.map(p => p.id).join(", ")}`);
}

main()
    .catch((e) => { console.error(e); process.exit(1); })
    .finally(() => prisma.$disconnect());
