import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import User from '@/models/User';
import { requireAdmin } from '@/lib/auth';

function slugifyLoginId(input) {
  const normalized = String(input || '')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '.')
    .replace(/\.+/g, '.')
    .replace(/^\.|\.$/g, '');
  return normalized || 'user';
}

async function generateUniqueLoginId(UserModel, seed) {
  const base = slugifyLoginId(seed).slice(0, 24);
  let candidate = base;
  let counter = 1;
  while (await UserModel.findOne({ loginId: candidate })) {
    candidate = `${base}${counter}`;
    counter += 1;
  }
  return candidate;
}

export async function POST() {
  try {
    await requireAdmin();
    await connectDB();

    const users = await User.find({
      $or: [{ loginId: { $exists: false } }, { loginId: '' }, { loginId: null }],
    }).select('_id name email');

    let updated = 0;
    for (const user of users) {
      const seed = user.name || user.email?.split('@')[0] || 'user';
      const loginId = await generateUniqueLoginId(User, seed);
      await User.updateOne({ _id: user._id }, { $set: { loginId } });
      updated += 1;
    }

    return NextResponse.json({
      message: 'Login IDs generated successfully',
      updated,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error.message || 'Failed to generate login IDs' },
      { status: error.message === 'Authentication required' ? 401 : 500 }
    );
  }
}
