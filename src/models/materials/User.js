import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const { Schema } = mongoose;

export const MATERIALS_ROLES = ['admin', 'staff', 'auditor', 'customer'];

const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    loginId: {
      type: String,
      lowercase: true,
      trim: true,
      sparse: true,
      unique: true,
    },
    password: {
      type: String,
      required: true,
      minlength: 6,
      select: false,
    },
    role: {
      type: String,
      enum: MATERIALS_ROLES,
      required: true,
      index: true,
    },
    phone: { type: String, trim: true },
    isActive: { type: Boolean, default: true },
    // For customers — links this login account to a Customer record
    customerId: { type: Schema.Types.ObjectId, index: true },
    createdBy: { type: Schema.Types.ObjectId },
    createdByName: { type: String },
  },
  { timestamps: true }
);

userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

userSchema.methods.comparePassword = function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// Uses connection-level model registration to avoid collision with fuel User model
export function getMaterialsUserModel(conn) {
  return conn.models.User || conn.model('User', userSchema);
}
