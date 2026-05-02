import NextAuth from 'next-auth';
import GitHub from 'next-auth/providers/github';
import Credentials from 'next-auth/providers/credentials';

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  providers: [
    GitHub({
      clientId: process.env.GITHUB_ID,
      clientSecret: process.env.GITHUB_SECRET,
    }),
    Credentials({
      name: 'Guest',
      credentials: {
        name: { label: 'Display name', type: 'text' },
      },
      authorize: async (credentials) => {
        const name =
          typeof credentials?.name === 'string' && credentials.name.trim().length > 0
            ? credentials.name.trim()
            : `Visitor-${Math.random().toString(36).slice(2, 8)}`;
        return {
          id: `guest:${name}`,
          name,
          email: `${name.toLowerCase().replace(/[^a-z0-9]/g, '-')}@guest.ai-zoo`,
        };
      },
    }),
  ],
  session: { strategy: 'jwt' },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id ?? token.sub ?? token.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as { id?: string }).id = (token.id as string) ?? token.sub;
      }
      return session;
    },
  },
});
