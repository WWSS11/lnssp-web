import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";

interface AdminCredential {
  id: string;
  username: string;
  passwordHash: string;
}

function loadAdminCredentials(): AdminCredential[] {
  const configured = process.env.ADMIN_USERS_JSON;
  if (configured) {
    try {
      const rows = JSON.parse(configured) as unknown;
      if (!Array.isArray(rows)) return [];
      return rows.filter((row): row is AdminCredential => {
        if (!row || typeof row !== "object") return false;
        const item = row as Record<string, unknown>;
        return (
          typeof item.id === "string" && item.id.trim().length > 0 &&
          typeof item.username === "string" && item.username.trim().length > 0 &&
          typeof item.passwordHash === "string" && item.passwordHash.length > 0
        );
      });
    } catch {
      return [];
    }
  }

  const username = process.env.ADMIN_USERNAME;
  const passwordHash = process.env.ADMIN_PASSWORD_HASH;
  return username && passwordHash
    ? [{ id: `admin:${username}`, username, passwordHash }]
    : [];
}

export const { auth, signIn, signOut, handlers } = NextAuth({
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.username || !credentials?.password) {
          return null;
        }

        const username = String(credentials.username);
        const admin = loadAdminCredentials().find(
          (candidate) => candidate.username === username,
        );
        if (!admin) return null;

        const isValid = await bcrypt.compare(
          credentials.password as string,
          admin.passwordHash,
        );

        if (!isValid) {
          return null;
        }

        return {
          id: admin.id,
          name: admin.username,
          email: `${admin.username}@admin.local`,
        };
      },
    }),
  ],
  session: {
    strategy: "jwt",
  },
  callbacks: {
    jwt({ token, user }) {
      if (user?.id) token.adminId = user.id;
      return token;
    },
    session({ session, token }) {
      if (session.user && typeof token.adminId === "string") {
        session.user.id = token.adminId;
      }
      return session;
    },
  },
  pages: {
    signIn: "/admin/login",
  },
});
