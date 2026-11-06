import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export type BattlePassDocument = BattlePass & Document;

@Schema({ timestamps: true })
export class BattlePass {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true })
  userId: MongooseSchema.Types.ObjectId;

  @Prop({ default: 1 })
  season: number;

  @Prop({ default: 'FREE', enum: ['FREE', 'PRO'] })
  tier: string;

  @Prop({ default: 1 })
  currentLevel: number;

  @Prop({ default: 0 })
  seasonXp: number;

  @Prop({ type: [Number], default: [] })
  claimedTiers: number[];

  @Prop({ default: null })
  purchasedAt: Date;

  @Prop({ default: null })
  paymentProvider: string;

  @Prop({ default: null, index: true })
  transactionId: string;
}

export const BattlePassSchema = SchemaFactory.createForClass(BattlePass);

