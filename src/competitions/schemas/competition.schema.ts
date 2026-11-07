import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export type CompetitionDocument = Competition & Document;

export enum CompetitionStatus {
  DRAFT = 'DRAFT',
  PUBLISHED = 'PUBLISHED',
  REGISTRATION_OPEN = 'REGISTRATION_OPEN',
  REGISTRATION_CLOSED = 'REGISTRATION_CLOSED',
  CHECK_IN_OPEN = 'CHECK_IN_OPEN',
  CHECK_IN_CLOSED = 'CHECK_IN_CLOSED',
  READY = 'READY',
  HEATS_GENERATED = 'HEATS_GENERATED',
  IN_PROGRESS = 'IN_PROGRESS',
  PAUSED = 'PAUSED',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
  POSTPONED = 'POSTPONED',
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

  @Prop({ default: 16 })
  qualifyingCount: number;

  @Prop({ default: 'RANDOM', enum: ['RANDOM', 'RANKED_ELO', 'INSTITUTION_BALANCED'] })
  seedingRule: string;

  @Prop({ default: 'NET_WPM', enum: ['NET_WPM', 'ACCURACY', 'HEAD_TO_HEAD'] })
  tieBreakRule: string;

  @Prop({ default: 'AUTO_LOSS', enum: ['AUTO_LOSS', 'DISQUALIFY'] })
  noShowPolicy: string;

  @Prop({ default: 15 })
  disconnectionGraceSeconds: number;
}

@Schema({ timestamps: true })
export class Competition {
  @Prop({ required: true })
  title: string;

  @Prop({ required: true, unique: true })
  slug: string;

  @Prop({ default: '' })
  description: string;

  @Prop({ default: 'UNIVERSITY_ESPORTS' })
  category: string;

  @Prop({ default: '' })
  banner: string;

  @Prop({ default: '' })
  logo: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true })
  organizerId: MongooseSchema.Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Organization', default: null })
  organizationId: MongooseSchema.Types.ObjectId;

  @Prop({ default: '' })
  contactPerson: string;

  @Prop({ default: '' })
  contactEmail: string;

  @Prop({ default: '' })
  contactPhone: string;

  @Prop({ default: 'BD' })
  country: string;

  @Prop({ default: 'Dhaka' })
  city: string;

  @Prop({ default: '' })
  institution: string;

  @Prop({ default: '' })
  rules: string;

  @Prop({ default: '' })
  termsAndConditions: string;

  @Prop({ default: 'PUBLIC', enum: ['PUBLIC', 'PRIVATE', 'ORG_ONLY'] })
  visibility: string;

  @Prop({ default: CompetitionStatus.REGISTRATION_OPEN, enum: Object.values(CompetitionStatus) })
  status: string;

  @Prop({ type: CompetitionSettings, default: () => ({}) })
  settings: CompetitionSettings;

  @Prop({ default: 0 })
  currentParticipantCount: number;

  // Schedule Fields
  @Prop({ default: () => new Date() })
  registrationStart: Date;

  @Prop({ default: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) })
  registrationEnd: Date;

  @Prop({ default: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) })
  checkInStart: Date;

  @Prop({ default: () => new Date(Date.now() + 8 * 24 * 60 * 60 * 1000) })
  checkInEnd: Date;

  @Prop({ default: () => new Date(Date.now() + 8 * 24 * 60 * 60 * 1000) })
  eventStart: Date;

  @Prop({ default: () => new Date(Date.now() + 9 * 24 * 60 * 60 * 1000) })
  eventEnd: Date;

  @Prop({ default: 'Asia/Dhaka' })
  timezone: string;

  @Prop({ default: 120 })
  breakIntervalSeconds: number;

  @Prop({ default: null })
  finalRoundTime: Date;

  @Prop({ default: null })
  certificatePublicationTime: Date;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', default: null })
  winnerUserId: MongooseSchema.Types.ObjectId;
}

export const CompetitionSchema = SchemaFactory.createForClass(Competition);

