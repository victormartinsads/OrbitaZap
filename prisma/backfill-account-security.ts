import { createHash } from "crypto";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
    const verified = await prisma.user.updateMany({
        where: { emailVerifiedAt: null },
        data: { emailVerifiedAt: new Date() },
    });
    console.log(`E-mail marcado como confirmado para ${verified.count} usuário(s) existente(s).`);

    const plainKeys = await prisma.user.findMany({
        where: { apiKey: { startsWith: "wag_" } },
        select: { id: true, apiKey: true },
    });
    for (const user of plainKeys) {
        const key = user.apiKey!;
        await prisma.user.update({
            where: { id: user.id },
            data: {
                apiKey: createHash("sha256").update(key).digest("hex"),
                apiKeyPrefix: key.slice(0, 8),
            },
        });
    }
    console.log(`${plainKeys.length} chave(s) de API convertida(s) para hash.`);
}

main()
    .catch((e) => { console.error(e); process.exit(1); })
    .finally(() => prisma.$disconnect());
