import mongoose from 'mongoose';

const MONGODB_URI_FUEL = process.env.MONGODB_URI_FUEL || process.env.MONGODB_URI;

if (!MONGODB_URI_FUEL) {
  throw new Error('Please define MONGODB_URI_FUEL (or MONGODB_URI) in your environment');
}

let cached = global.mongooseFuel;

if (!cached) {
  cached = global.mongooseFuel = { conn: null, promise: null };
}

async function connectFuelDB() {
  if (cached.conn) {
    return cached.conn;
  }

  if (!cached.promise) {
    const opts = {
      bufferCommands: false,
    };

    cached.promise = mongoose.connect(MONGODB_URI_FUEL, opts).then((m) => m);
  }

  try {
    cached.conn = await cached.promise;
  } catch (error) {
    cached.promise = null;
    throw error;
  }

  return cached.conn;
}

export default connectFuelDB;