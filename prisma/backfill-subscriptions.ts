import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const TRIAL_DAYS = parseInt(process.env.TRIAL_DAYS || "7", 10);

async function main() {
    const users = await prisma.user.findMany({
        where: { role: { not: "SUPERADMIN" }, subscription: null },
        select: { id: true, email: true },
    });
    const trialEndsAt = new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000);

    for (const user of users) {
        await prisma.subscription.create({
            data: { userId: user.id, planId: "starter", status: "TRIALING", trialEndsAt },
        });
    }
    console.log(`Trial de ${TRIAL_DAYS} dias criado para ${users.length} usuário(s).`);
}

main()
    .catch((e) => { console.error(e); process.exit(1); })
    .finally(() => prisma.$disconnect());
