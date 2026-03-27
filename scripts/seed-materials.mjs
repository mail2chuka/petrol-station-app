import dotenv from 'dotenv';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '../.env.local') });

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true, lowercase: true },
    loginId: { type: String, unique: true, sparse: true, lowercase: true },
    password: { type: String, required: true },
    role: { type: String, required: true, enum: ['admin', 'staff', 'auditor', 'customer'] },
    phone: { type: String },
    isActive: { type: Boolean, default: true },
    business: { type: String, default: 'materials' },
  },
  { timestamps: true }
);

async function run() {
  const uri = process.env.MONGODB_URI_MATERIALS;
  if (!uri) {
    throw new Error('Missing MONGODB_URI_MATERIALS in .env.local file');
  }

  console.log('Connecting to materials MongoDB...');
  const conn = await mongoose.createConnection(uri).asPromise();

  const User = conn.models.User || conn.model('User', userSchema);

  const email = 'admin@materials.example.com';
  const loginId = 'materials.admin';
  const password = 'admin123';
  const name = 'Materials Administrator';

  const exists = await User.findOne({ $or: [{ email }, { loginId }] });
  if (exists) {
    console.log('Materials admin already exists:', email);
    await conn.close();
    process.exit(0);
  }

  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(password, salt);

  await User.create({
    name,
    email,
    loginId,
    password: hashedPassword,
    role: 'admin',
    business: 'materials',
    isActive: true,
  });

  console.log('✅ Materials admin user created successfully!');
  console.log('Email:', email);
  console.log('Login ID:', loginId);
  console.log('Password:', password);
  console.log('\n⚠️  IMPORTANT: Change this password immediately after first login!\n');

  await conn.close();
  process.exit(0);
}

run().catch((e) => {
  console.error('Error:', e);
  process.exit(1);
});
