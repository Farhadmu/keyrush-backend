import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export type AiAnalysisDocument = AiAnalysis & Document;

export enum AiAnalysisType {
  COACHING = 'COACHING',
  WEAKNESS_DETECTION = 'WEAKNESS_DETECTION',
  PRACTICE_PLAN = 'PRACTICE_PLAN',
  FAIR_PLAY_ANOMALY = 'FAIR_PLAY_ANOMALY',
  PASSAGE_GENERATION = 'PASSAGE_GENERATION',
}

@Schema({ timestamps: true })
export class AiAnalysis {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', default: null, index: true })
  userId: MongooseSchema.Types.ObjectId | null;

  @Prop({ required: true, enum: Object.values(AiAnalysisType), index: true })
  type: string;

  @Prop({ type: Object, default: () => ({}) })
  inputMetrics: Record<string, any>;

  @Prop({ type: Object, default: () => ({}) })
  result: Record<string, any>;

  @Prop({ default: 'HEURISTIC_ENGINE' })
  provider: string; // 'GEMINI_PRO', 'OPENAI', 'HEURISTIC_ENGINE'

  @Prop({ default: () => new Date() })
  generatedAt: Date;
}

export const AiAnalysisSchema = SchemaFactory.createForClass(AiAnalysis);
AiAnalysisSchema.index({ userId: 1, type: 1, createdAt: -1 });
