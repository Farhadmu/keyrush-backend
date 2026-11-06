import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export type ProfileDocument = Profile & Document;

@Schema({ _id: false })
export class PlayerStats {
  @Prop({ default: 0 })
  totalRaces: number;

  @Prop({ default: 0 })
  wins: number;

  @Prop({ default: 0 })
  losses: number;

  @Prop({ default: 0 })
  bestWpm: number;

  @Prop({ default: 0 })
  averageWpm: number;

  @Prop({ default: 0 })
  averageAccuracy: number;

  @Prop({ default: 0 })
  totalPracticeTimeMs: number;
}

@Schema({ timestamps: true })
export class Profile {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true, unique: true })
  userId: MongooseSchema.Types.ObjectId;

  @Prop({ default: '' })
  displayName: string;

  @Prop({ default: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80' })
  avatarUrl: string;

  @Prop({ default: '' })
  bio: string;

  @Prop({ default: 1 })
  level: number;

  @Prop({ default: 0 })
  xp: number;

  @Prop({ default: 'ROOKIE', enum: ['ROOKIE', 'RACER', 'PRO', 'ELITE', 'GRANDMASTER'] })
  rank: string;

  @Prop({ default: 1000 })
  eloRating: number;

  @Prop({ default: 'BRONZE', enum: ['BRONZE', 'SILVER', 'GOLD', 'PLATINUM', 'DIAMOND', 'MASTER', 'GRANDMASTER'] })
  eloTier: string;

  @Prop({ type: [String], default: ['car_cyber_phantom'] })
  unlockedCars: string[];

  @Prop({ default: 'car_cyber_phantom' })
  selectedCarId: string;

  @Prop({ type: PlayerStats, default: () => ({}) })
  stats: PlayerStats;
}

export const ProfileSchema = SchemaFactory.createForClass(Profile);
