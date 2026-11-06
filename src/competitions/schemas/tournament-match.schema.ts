import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export type TournamentMatchDocument = TournamentMatch & Document;

export enum MatchStatus {
  SCHEDULED = 'SCHEDULED',
  READY = 'READY',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  DISPUTED = 'DISPUTED',
  BYE = 'BYE',
}

@Schema({ _id: false })
export class MatchPlayer {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', default: null })
  userId: MongooseSchema.Types.ObjectId | null;

  @Prop({ default: 'TBD' })
  username: string;

  @Prop({ default: 0 })
  seed: number;

  @Prop({ default: 0 })
  score: number; // Net WPM

  @Prop({ default: 0 })
  accuracy: number;

  @Prop({ default: false })
  isWinner: boolean;
}

@Schema({ timestamps: true })
export class TournamentMatch {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Competition', required: true, index: true })
  competitionId: MongooseSchema.Types.ObjectId;

  @Prop({ required: true })
  roundNumber: number; // 1 = Round of 16 / Qualifiers, etc.

  @Prop({ required: true })
  matchNumber: number;

  @Prop({ default: 'ROUND_1' })
  roundName: string; // 'Quarterfinal', 'Semifinal', 'Grand Final'

  @Prop({ type: MatchPlayer, required: true })
  player1: MatchPlayer;

  @Prop({ type: MatchPlayer, required: true })
  player2: MatchPlayer;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', default: null })
  winnerId: MongooseSchema.Types.ObjectId | null;

  @Prop({ default: MatchStatus.SCHEDULED, enum: Object.values(MatchStatus) })
  status: string;

  @Prop({ default: '' })
  roomId: string; // Associated race room when live

  @Prop({ default: null })
  scheduledTime: Date;

  @Prop({ default: null })
  completedAt: Date;
}

export const TournamentMatchSchema = SchemaFactory.createForClass(TournamentMatch);
TournamentMatchSchema.index({ competitionId: 1, roundNumber: 1, matchNumber: 1 });
