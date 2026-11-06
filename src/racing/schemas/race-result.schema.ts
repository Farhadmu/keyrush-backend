import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export type RaceResultDocument = RaceResult & Document;

@Schema({ _id: false })
export class ParticipantResult {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true })
  userId: MongooseSchema.Types.ObjectId;

  @Prop({ required: true })
  username: string;

  @Prop({ default: 'car_cyber_phantom' })
  carId: string;

  @Prop({ required: true })
  rankPosition: number;

  @Prop({ required: true })
  netWpm: number;

  @Prop({ required: true })
  rawWpm: number;

  @Prop({ required: true })
  accuracy: number;

  @Prop({ default: 0 })
  finishTimeMs: number;

  @Prop({ default: false })
  isFlaggedSuspicious: boolean;

  @Prop({ default: '' })
  suspicionReason: string;
}

@Schema({ _id: false })
export class ReplaySnapshot {
  @Prop({ required: true })
  timeMs: number;

  @Prop({ type: [Object], default: [] })
  positions: Array<{
    userId: string;
    progress: number;
    wpm: number;
    speed: number;
  }>;
}

@Schema({ timestamps: true })
export class RaceResult {
  @Prop({ required: true, index: true })
  roomId: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'TypingPassage', default: null })
  passageId: MongooseSchema.Types.ObjectId;

  @Prop({ default: 'English Passage' })
  passageTitle: string;

  @Prop({ default: 'EN' })
  language: string;

  @Prop({ type: [ParticipantResult], default: [] })
  participants: ParticipantResult[];

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', default: null })
  winnerUserId: MongooseSchema.Types.ObjectId;

  @Prop({ default: () => new Date() })
  raceStartedAt: Date;

  @Prop({ default: () => new Date() })
  raceFinishedAt: Date;

  @Prop({ type: [ReplaySnapshot], default: [] })
  replaySnapshots: ReplaySnapshot[];
}

export const RaceResultSchema = SchemaFactory.createForClass(RaceResult);
RaceResultSchema.index({ createdAt: -1 });
RaceResultSchema.index({ 'participants.userId': 1, createdAt: -1 });
RaceResultSchema.index({ winnerUserId: 1 });

