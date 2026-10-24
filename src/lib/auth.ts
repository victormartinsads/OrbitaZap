import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { authConfig } from "@/auth.config";
import { clientIp, hit, isLimited, MINUTE, reset } from "@/lib/rate-limit";

class TooManyAttempts extends CredentialsSignin {
  code = "rate_limited";
}

const LOGIN_WINDOW = 15 * MINUTE;
const MAX_FAILS_PER_EMAIL = 5;
const MAX_ATTEMPTS_PER_IP = 20;

// Compared when the e-mail doesn't exist, so response time doesn't reveal which accounts exist.
const DUMMY_HASH = bcrypt.hashSync("orbitazap-timing-equalizer", 10);

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      authorize: async (credentials, request) => {
        const parsedCredentials = z
          .object({ email: z.string().email(), password: z.string().min(6) })
          .safeParse(credentials);
        if (!parsedCredentials.success) return null;

        const email = parsedCredentials.data.email.toLowerCase();
        const { password } = parsedCredentials.data;
        const emailKey = `login:email:${email}`;

        const ip = clientIp(request.headers);
        if (!hit(`login:ip:${ip}`, MAX_ATTEMPTS_PER_IP, LOGIN_WINDOW).allowed) throw new TooManyAttempts();
        if (isLimited(emailKey, MAX_FAILS_PER_EMAIL, LOGIN_WINDOW)) throw new TooManyAttempts();

        const user = await prisma.user.findFirst({ where: { email: { equals: email, mode: "insensitive" } } });
        const passwordsMatch = await bcrypt.compare(password, user?.password ?? DUMMY_HASH);

        if (user && passwordsMatch) {
          reset(emailKey);
          return user;
        }

        hit(emailKey, MAX_FAILS_PER_EMAIL, LOGIN_WINDOW);
        return null;
      },
    }),
  ],
  secret: process.env.AUTH_SECRET,
});
