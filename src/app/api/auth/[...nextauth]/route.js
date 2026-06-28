import NextAuth from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import connectFuelDB from '@/lib/db-fuel';
import User from '@/models/User';

const AUTH_LOGIN_MODE = (process.env.AUTH_LOGIN_MODE || 'both').toLowerCase();

function normalizeIdentifier(value) {
  return String(value || '').trim().toLowerCase();
}

function isEmailIdentifier(identifier) {
  return identifier.includes('@');
}

function buildIdentifierQuery(identifier) {
  if (AUTH_LOGIN_MODE === 'login-id-only') {
    if (isEmailIdentifier(identifier)) {
      throw new Error('Login ID is required. Email login is disabled.');
    }
    return { loginId: identifier };
  }

  if (AUTH_LOGIN_MODE === 'email-only') {
    return { email: identifier };
  }

  // Default mode: allow either email or loginId.
  if (isEmailIdentifier(identifier)) {
    return { email: identifier };
  }
  return { loginId: identifier };
}

function normalizeAuthUser(user) {
  return {
    id: user._id?.toString() || user.id?.toString(),
    email: user.email,
    loginId: user.loginId,
    name: user.name,
    role: user.role,
    stationId: user.stationId?.toString(),
    stationName: user.stationName,
  };
}

async function tryFuelLogin(identifier, password) {
  await connectFuelDB();

  const query = buildIdentifierQuery(identifier);
  const user = await User.findOne(query).select('+password');

  if (!user) {
    return null;
  }

  if (user.isActive === false) {
    throw new Error('Account deactivated. Contact your administrator.');
  }

  const isPasswordValid = await user.comparePassword(password);
  if (!isPasswordValid) {
    return null;
  }

  return normalizeAuthUser(user);
}

export const authOptions = {
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        identifier: { label: 'Email or Login ID', type: 'text' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        const identifierInput = credentials?.identifier || credentials?.email;
        if (!identifierInput || !credentials?.password) {
          throw new Error('Email/Login ID and password are required');
        }

        const identifier = normalizeIdentifier(identifierInput);
        const password = credentials.password;

        const user = await tryFuelLogin(identifier, password);
        if (user) return user;

        throw new Error('Invalid login credentials');
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.loginId = user.loginId;
        token.role = user.role;
        token.stationId = user.stationId;
        token.stationName = user.stationName;
      }
      return token;
    },
    async session({ session, token }) {
      if (token) {
        session.user.id = token.id;
        session.user.loginId = token.loginId;
        session.user.role = token.role;
        session.user.stationId = token.stationId;
        session.user.stationName = token.stationName;
      }
      return session;
    },
  },
  pages: {
    signIn: '/login',
    error: '/login',
  },
  session: {
    strategy: 'jwt',
    maxAge: 24 * 60 * 60, // 24 hours
  },
  secret: process.env.NEXTAUTH_SECRET,
};

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
