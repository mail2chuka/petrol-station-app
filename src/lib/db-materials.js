import mongoose from 'mongoose';

const MONGODB_URI_MATERIALS = process.env.MONGODB_URI_MATERIALS;

let cached = global.mongooseMaterials;

if (!cached) {
  cached = global.mongooseMaterials = { conn: null, promise: null };
}

async function connectMaterialsDB() {
  if (!MONGODB_URI_MATERIALS) {
    throw new Error('MONGODB_URI_MATERIALS is not configured');
  }

  if (cached.conn) {
    return cached.conn;
  }

  if (!cached.promise) {
    const opts = {
      bufferCommands: false,
    };

    cached.promise = mongoose.createConnection(MONGODB_URI_MATERIALS, opts).asPromise();
  }

  try {
    cached.conn = await cached.promise;
  } catch (error) {
    cached.promise = null;
    throw error;
  }

  return cached.conn;
}

export default connectMaterialsDB;