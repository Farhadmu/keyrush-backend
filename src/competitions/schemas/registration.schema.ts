import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export type CompetitionRegistrationDocument = CompetitionRegistration & Document;

@Schema({ timestamps: true })
export class CompetitionRegistration {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Competition', required: true })
  competitionId: MongooseSchema.Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true })
  userId: MongooseSchema.Types.ObjectId;

  @Prop({ required: true })
  username: string;

  @Prop({ default: 'CONFIRMED', enum: ['CONFIRMED', 'WAITLISTED', 'CANCELLED'] })
  status: string;

  @Prop({ default: 0 })
  seedNumber: number;
}

export const CompetitionRegistrationSchema = SchemaFactory.createForClass(CompetitionRegistration);
CompetitionRegistrationSchema.index({ competitionId: 1, userId: 1 }, { unique: true });
