import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export type TypingResultDocument = TypingResult & Document;

@Schema({ timestamps: true })
export class TypingResult {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true, index: true })
  userId: MongooseSchema.Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'TypingPassage', default: null })
  passageId: MongooseSchema.Types.ObjectId;

  @Prop({ default: '60s' })
  mode: string; // '15s', '30s', '60s', '120s', 'custom', 'endless', 'word_sprint', 'code'

  @Prop({ default: 'EN', enum: ['EN', 'BN'] })
  language: string;

  @Prop({ required: true })
  netWpm: number;

  @Prop({ required: true })
  rawWpm: number;

  @Prop({ required: true })
  accuracy: number;

  @Prop({ default: 60 })
  durationSeconds: number;

  @Prop({ default: 0 })
  correctChars: number;

  @Prop({ default: 0 })
  incorrectChars: number;

  @Prop({ type: Object, default: () => ({}) })
  keyMisses: Record<string, number>; // character weaknesses e.g. { 'p': 4, 'q': 2 }
}

export const TypingResultSchema = SchemaFactory.createForClass(TypingResult);
TypingResultSchema.index({ userId: 1, createdAt: -1 });
TypingResultSchema.index({ userId: 1, language: 1 });
