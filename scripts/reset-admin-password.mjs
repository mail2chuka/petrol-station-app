import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Parse .env.local manually (dotenv not installed)
const envPath = join(__dirname, '../.env.local');
const envContent = readFileSync(envPath, 'utf8');
for (const line of envContent.split(/\r?\n/)) {
  const match = line.match(/^([A-Z_]+)=["']?(.+?)["']?\s*$/);
  if (match) process.env[match[1]] = match[2].trim();
}

const userSchema = new mongoose.Schema({
  name: String,
  email: { type: String, lowercase: true },
  password: String,
  role: String,
  isActive: Boolean,
}, { timestamps: true });

const User = mongoose.models.User || mongoose.model('User', userSchema);

async function run() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('Missing MONGODB_URI in .env.local');

  await mongoose.connect(uri);
  console.log('Connected to MongoDB.');

  const email = 'admin@ecanagroup.com';
  const newPassword = 'admin123';

  const user = await User.findOne({ email });
  if (!user) {
    console.error('No user found with email:', email);
    await mongoose.connection.close();
    process.exit(1);
  }

  const salt = await bcrypt.genSalt(10);
  user.password = await bcrypt.hash(newPassword, salt);
  await user.save();

  console.log('Password updated successfully for:', email);
  console.log('New password: admin123');

  await mongoose.connection.close();
  process.exit(0);
}

run().catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
