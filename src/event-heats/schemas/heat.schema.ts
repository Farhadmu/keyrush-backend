import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export type EventHeatDocument = EventHeat & Document;

@Schema({ _id: false })
export class HeatParticipant {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true })
  userId: MongooseSchema.Types.ObjectId;

  @Prop({ required: true })
  username: string;

  @Prop({ default: 'car_cyber_phantom' })
  carId: string;

  @Prop({ default: 0 })
  finishPosition: number;

  @Prop({ default: 0 })
  netWpm: number;

  @Prop({ default: 0 })
  accuracy: number;

  @Prop({ default: false })
  qualified: boolean;
}

@Schema({ timestamps: true })
export class EventHeat {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Competition', required: true })
  competitionId: MongooseSchema.Types.ObjectId;

  @Prop({ default: 1 })
  roundNumber: number;

  @Prop({ required: true })
  heatNumber: number;

  @Prop({ default: 'PENDING', enum: ['PENDING', 'READY', 'RACING', 'COMPLETED', 'CANCELLED'] })
  status: string;

  @Prop({ type: [HeatParticipant], default: [] })
  participants: HeatParticipant[];

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'TypingPassage', default: null })
  passageId: MongooseSchema.Types.ObjectId;

  @Prop({ default: null })
  completedAt: Date;
}

export const EventHeatSchema = SchemaFactory.createForClass(EventHeat);
