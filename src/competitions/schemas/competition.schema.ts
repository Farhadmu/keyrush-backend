import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export type CompetitionDocument = Competition & Document;

export enum CompetitionStatus {
  DRAFT = 'DRAFT',
  REGISTRATION_OPEN = 'REGISTRATION_OPEN',
  REGISTRATION_CLOSED = 'REGISTRATION_CLOSED',
  HEATS_GENERATED = 'HEATS_GENERATED',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

@Schema({ _id: false })
export class CompetitionSettings {
  @Prop({ default: 'EN', enum: ['EN', 'BN'] })
  language: string;

  @Prop({ default: 'MEDIUM' })
  difficulty: string;

  @Prop({ default: 60 })
  raceDurationSeconds: number;

  @Prop({ default: 20, min: 20 })
  minParticipants: number;

  @Prop({ default: 300, max: 300 })
  maxParticipants: number;

  @Prop({ default: 2, min: 2 })
  roomMinPlayers: number;

  @Prop({ default: 7, max: 7 })
  roomMaxPlayers: number;

  @Prop({ default: 'SINGLE_ELIMINATION' })
  tournamentFormat: string;
}

@Schema({ timestamps: true })
export class Competition {
  @Prop({ required: true })
  title: string;

  @Prop({ required: true, unique: true })
  slug: string;

  @Prop({ default: '' })
  description: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true })
  organizerId: MongooseSchema.Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Organization', default: null })
  organizationId: MongooseSchema.Types.ObjectId;

  @Prop({ default: 'PUBLIC', enum: ['PUBLIC', 'PRIVATE', 'ORG_ONLY'] })
  visibility: string;

  @Prop({ default: CompetitionStatus.REGISTRATION_OPEN, enum: Object.values(CompetitionStatus) })
  status: string;

  @Prop({ type: CompetitionSettings, default: () => ({}) })
  settings: CompetitionSettings;

  @Prop({ default: 0 })
  currentParticipantCount: number;

  @Prop({ default: () => new Date() })
  registrationStart: Date;

  @Prop({ default: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) })
  registrationEnd: Date;

  @Prop({ default: () => new Date(Date.now() + 8 * 24 * 60 * 60 * 1000) })
  eventStart: Date;
}

export const CompetitionSchema = SchemaFactory.createForClass(Competition);
