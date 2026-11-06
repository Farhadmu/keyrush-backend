import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export type CertificateDocument = Certificate & Document;

@Schema({ timestamps: true })
export class Certificate {
  @Prop({ required: true, unique: true, index: true })
  certificateId: string; // e.g. 'KR-CERT-2026-ABCD1234'

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Competition', required: true })
  competitionId: MongooseSchema.Types.ObjectId;

  @Prop({ required: true })
  competitionTitle: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true, index: true })
  userId: MongooseSchema.Types.ObjectId;

  @Prop({ required: true })
  recipientName: string;

  @Prop({ required: true })
  achievementRank: string; // e.g. 'CHAMPION (1st Place)', 'RUNNER-UP (2nd Place)', 'FINALIST'

  @Prop({ required: true })
  bestWpm: number;

  @Prop({ required: true })
  accuracy: number;

  @Prop({ default: () => new Date() })
  issueDate: Date;

  @Prop({ required: true })
  verificationHash: string; // SHA-256 digital signature

  @Prop({ default: false })
  isRevoked: boolean;

  @Prop({ default: '' })
  revocationReason: string;
}

export const CertificateSchema = SchemaFactory.createForClass(Certificate);
CertificateSchema.index({ userId: 1, competitionId: 1 });
