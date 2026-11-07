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
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Competition', required: true, index: true })
  competitionId: MongooseSchema.Types.ObjectId;

  @Prop({ default: 1 })
  roundNumber: number;

  @Prop({ required: true })
  heatNumber: number;

  @Prop({ default: '' })
  roomId: string; // Dedicated live room ID: e.g. 'ROOM-EVENT-<slug>-H1'

  @Prop({ default: 'PENDING', enum: ['PENDING', 'READY', 'RACING', 'COMPLETED', 'CANCELLED', 'DISPUTED'] })
  status: string;

  @Prop({ type: [HeatParticipant], default: [] })
  participants: HeatParticipant[];

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'TypingPassage', default: null })
  passageId: MongooseSchema.Types.ObjectId;

  @Prop({ default: null })
  scheduledStartTime: Date;

  @Prop({ default: null })
  actualStartTime: Date;

  @Prop({ default: null })
  completedAt: Date;

  @Prop({
    type: [
      {
        userId: String,
        username: String,
        disconnectedAt: Date,
        reconnectedAt: Date,
      },
    ],
    default: [],
  })
  disconnectionRecords: Array<{
    userId: string;
    username: string;
    disconnectedAt: Date;
    reconnectedAt?: Date;
  }>;

  @Prop({ default: '' })
  organizerNotes: string;

  @Prop({
    type: {
      hasDispute: { type: Boolean, default: false },
      reason: { type: String, default: '' },
      resolvedBy: { type: String, default: '' },
      resolvedAt: { type: Date, default: null },
    },
    default: () => ({ hasDispute: false, reason: '', resolvedBy: '', resolvedAt: null }),
  })
  disputeState: {
    hasDispute: boolean;
    reason: string;
    resolvedBy: string;
    resolvedAt: Date | null;
  };
}

export const EventHeatSchema = SchemaFactory.createForClass(EventHeat);
EventHeatSchema.index({ competitionId: 1, roundNumber: 1, heatNumber: 1 }, { unique: true });

