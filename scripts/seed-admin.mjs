import dotenv from 'dotenv';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: join(__dirname, '../.env.local') });

// Define User schema inline
const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true, lowercase: true },
  password: { type: String, required: true },
  role: { type: String, required: true },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

const User = mongoose.models.User || mongoose.model('User', userSchema);

async function run() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('Missing MONGODB_URI in .env.local file');
  }

  console.log('Connecting to MongoDB...');
  await mongoose.connect(uri);

  const email = 'admin@example.com';
  const password = 'admin123';
  const name = 'System Administrator';

  const exists = await User.findOne({ email });
  if (exists) {
    console.log('Admin already exists:', email);
    await mongoose.connection.close();
    process.exit(0);
  }

  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(password, salt);

  await User.create({
    name,
    email,
    password: hashedPassword,
    role: 'admin',
    isActive: true,
  });

  console.log('✅ Admin user created successfully!');
  console.log('Email:', email);
  console.log('Password:', password);
  console.log('\n⚠️  IMPORTANT: Change this password immediately after first login!\n');

  await mongoose.connection.close();
  process.exit(0);
}

run().catch((e) => {
  console.error('Error:', e);
  process.exit(1);
});