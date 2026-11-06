import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type TypingPassageDocument = TypingPassage & Document;

@Schema({ timestamps: true })
export class TypingPassage {
  @Prop({ required: true })
  title: string;

  @Prop({ required: true })
  content: string;

  @Prop({ default: 'EN', enum: ['EN', 'BN'] })
  language: string;

  @Prop({ default: 'MEDIUM', enum: ['BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'EXPERT'] })
  difficulty: string;

  @Prop({ required: true })
  wordCount: number;

  @Prop({ default: 'TECH' })
  category: string;

  @Prop({ default: true })
  isPublic: boolean;
}

export const TypingPassageSchema = SchemaFactory.createForClass(TypingPassage);
