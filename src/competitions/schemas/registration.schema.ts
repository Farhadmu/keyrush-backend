import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export type CompetitionRegistrationDocument = CompetitionRegistration & Document;

export enum VerificationStatus {
  PENDING = 'PENDING',
  VERIFIED = 'VERIFIED',
  REJECTED = 'REJECTED',
}

export enum CheckInStatus {
  NOT_CHECKED_IN = 'NOT_CHECKED_IN',
  CHECKED_IN = 'CHECKED_IN',
}

@Schema({ timestamps: true })
export class CompetitionRegistration {
  @Prop({ required: true, unique: true, index: true })
  registrationId: string; // e.g. 'REG-2026-ABCD1234'

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Competition', required: true, index: true })
  competitionId: MongooseSchema.Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true, index: true })
  userId: MongooseSchema.Types.ObjectId;

  @Prop({ required: true })
  username: string;

  // Personal Information
  @Prop({ default: '' })
  fullName: string;

  @Prop({ default: '' })
  email: string;

  @Prop({ default: '' })
  phone: string;

  @Prop({ default: 'BD' })
  country: string;

  @Prop({ default: 'Dhaka' })
  city: string;

  @Prop({ default: '' })
  profilePhotoUrl: string;

  // Academic Information
  @Prop({ default: '' })
  institutionName: string; // University / College name

  @Prop({ default: '' })
  department: string;

  @Prop({ default: '' })
  studentId: string;

  @Prop({ default: '' })
  registrationNumber: string;

  @Prop({ default: '' })
  academicBatch: string; // e.g. '2022-2026' or 'Batch 58'

  @Prop({ default: '' })
  currentSemester: string; // e.g. '6th'

  @Prop({ default: 0 })
  graduationYear: number;

  // Competition Info
  @Prop({ default: 'EN', enum: ['EN', 'BN'] })
  preferredLanguage: string;

  @Prop({ default: '' })
  teamName: string;

  @Prop({ default: '' })
  competitionExperience: string;

  @Prop({ default: '' })
  emergencyContact: string;

  // Metadata & Status
  @Prop({ default: 'CONFIRMED', enum: ['CONFIRMED', 'WAITLISTED', 'CANCELLED'] })
  status: string;

  @Prop({ default: VerificationStatus.PENDING, enum: Object.values(VerificationStatus) })
  verificationStatus: string;

  @Prop({ default: '' })
  verificationNotes: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', default: null })
  verifiedBy: MongooseSchema.Types.ObjectId;

  @Prop({ default: null })
  verifiedAt: Date;

  @Prop({ default: CheckInStatus.NOT_CHECKED_IN, enum: Object.values(CheckInStatus) })
  checkInStatus: string;

  @Prop({ default: null })
  checkedInAt: Date;

  @Prop({ default: 0 })
  seedNumber: number;

  @Prop({ default: '' })
  assignedGroup: string;

  @Prop({ default: 0 })
  assignedHeat: number;

  @Prop({ default: 'UNKNOWN', enum: ['UNKNOWN', 'PRESENT', 'NO_SHOW'] })
  attendanceStatus: string;

  @Prop({ default: '' })
  cancellationReason: string;

  @Prop({ default: false })
  fairPlayConsent: boolean;
}

export const CompetitionRegistrationSchema = SchemaFactory.createForClass(CompetitionRegistration);
CompetitionRegistrationSchema.index({ competitionId: 1, userId: 1 }, { unique: true });
CompetitionRegistrationSchema.index({ competitionId: 1, verificationStatus: 1 });
CompetitionRegistrationSchema.index({ competitionId: 1, checkInStatus: 1 });

