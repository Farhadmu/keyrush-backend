import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type UserDocument = User & Document;

export enum UserRole {
  GUEST = 'GUEST',
  PLAYER = 'PLAYER',
  TEAM_CAPTAIN = 'TEAM_CAPTAIN',
  ORGANIZATION_ADMIN = 'ORGANIZATION_ADMIN',
  ORGANIZATION_MODERATOR = 'ORGANIZATION_MODERATOR',
  COMPETITION_ADMIN = 'COMPETITION_ADMIN',
  PLATFORM_MODERATOR = 'PLATFORM_MODERATOR',
  SUPER_ADMIN = 'SUPER_ADMIN',
}

export enum UserStatus {
  ACTIVE = 'ACTIVE',
  SUSPENDED = 'SUSPENDED',
  BANNED = 'BANNED',
  PENDING_VERIFICATION = 'PENDING_VERIFICATION',
}

@Schema({ timestamps: true })
export class User {
  @Prop({ required: true, unique: true, trim: true, minlength: 3, maxlength: 20 })
  username: string;

  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  email: string;

  @Prop({ required: true })
  passwordHash: string;

  @Prop({ default: UserStatus.ACTIVE, enum: Object.values(UserStatus) })
  status: string;

  @Prop({ default: 'BD' })
  country: string;

  @Prop({ default: 'EN', enum: ['EN', 'BN'] })
  languagePreference: string;

  @Prop({ type: [String], default: [UserRole.PLAYER], enum: Object.values(UserRole) })
  roles: string[];

  @Prop({ default: null })
  organizationId: string;

  @Prop({ default: false })
  isEmailVerified: boolean;

  @Prop({ default: null })
  emailVerificationToken: string;

  @Prop({ default: null })
  emailVerificationExpires: Date;

  @Prop({ default: null })
  passwordResetToken: string;

  @Prop({ default: null })
  passwordResetExpires: Date;

  @Prop({ default: 0 })
  failedLoginAttempts: number;

  @Prop({ default: null })
  lockUntil: Date;

  @Prop({ default: false })
  twoFactorEnabled: boolean;

  @Prop({ default: null })
  twoFactorSecret: string;

  @Prop({ type: [String], default: [] })
  twoFactorBackupCodes: string[];

  @Prop({ default: null })
  lastLoginAt: Date;
}

export const UserSchema = SchemaFactory.createForClass(User);
