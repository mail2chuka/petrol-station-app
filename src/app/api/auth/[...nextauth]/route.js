import NextAuth from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import connectFuelDB from '@/lib/db-fuel';
import connectMaterialsDB from '@/lib/db-materials';
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

function normalizeAuthUser(user, business) {
  return {
    id: user._id?.toString() || user.id?.toString(),
    email: user.email,
    loginId: user.loginId,
    name: user.name,
    role: user.role,
    business,
    stationId: user.stationId?.toString(),
    stationName: user.stationName,
    // For materials customer accounts — used to scope their own data
    customerId: user.customerId?.toString(),
  };
}

async function tryFuelLogin(identifier, password) {
  await connectFuelDB();

  const query = buildIdentifierQuery(identifier);
  const user = await User.findOne(query).select('+password');

  if (!user) {
    return null; // Not in fuel DB — caller will try materials
  }

  if (user.isActive === false) {
    throw new Error('Account deactivated. Contact your administrator.');
  }

  const isPasswordValid = await user.comparePassword(password);
  if (!isPasswordValid) {
    return null; // Wrong password — allow materials fallthrough for dual-account owners
  }

  return normalizeAuthUser(user, 'fuel');
}

async function tryMaterialsLogin(identifier, password) {
  if (!process.env.MONGODB_URI_MATERIALS) {
    return null;
  }

  try {
    const materialsConn = await connectMaterialsDB();
    const query = buildIdentifierQuery(identifier);
    const user = await materialsConn.db.collection('users').findOne(query);

    if (!user) return null;

    if (user.isActive === false) {
      throw new Error('Account deactivated. Contact your administrator.');
    }

    if (!user.password) return null;

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) return null;

    return normalizeAuthUser(user, 'materials');
  } catch (error) {
    if (error.message === 'Account deactivated. Contact your administrator.') {
      throw error;
    }
    console.error('Materials login fallback failed:', error);
    return null;
  }
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

        // Fuel DB is the primary source. tryFuelLogin throws if email is found
        // but credentials are invalid — preventing fallthrough to materials.
        const fuelUser = await tryFuelLogin(identifier, password);
        if (fuelUser) return fuelUser;

        // Email not found in fuel DB — try materials DB (if configured).
        const materialsUser = await tryMaterialsLogin(identifier, password);
        if (materialsUser) return materialsUser;

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
        token.business = user.business || 'fuel';
        token.stationId = user.stationId;
        token.stationName = user.stationName;
        token.customerId = user.customerId;
      }
      return token;
    },
    async session({ session, token }) {
      if (token) {
        session.user.id = token.id;
        session.user.loginId = token.loginId;
        session.user.role = token.role;
        session.user.business = token.business || 'fuel';
        session.user.stationId = token.stationId;
        session.user.stationName = token.stationName;
        session.user.customerId = token.customerId;
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
