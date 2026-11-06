import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export type AuditLogDocument = AuditLog & Document;

@Schema({ timestamps: true })
export class AuditLog {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', default: null, index: true })
  actorId: MongooseSchema.Types.ObjectId | null;

  @Prop({ default: 'SYSTEM' })
  actorUsername: string;

  @Prop({ required: true, index: true })
  action: string; // e.g. 'AUTH_LOGIN', 'USER_SUSPEND', 'ROOM_FORCE_CANCEL', 'ROLE_CHANGE'

  @Prop({ required: true })
  resource: string; // e.g. 'USER', 'COMPETITION', 'ORGANIZATION', 'ROOM'

  @Prop({ default: '' })
  resourceId: string;

  @Prop({ type: Object, default: () => ({}) })
  details: Record<string, any>;

  @Prop({ default: '127.0.0.1' })
  ipAddress: string;

  @Prop({ default: '' })
  userAgent: string;
}

export const AuditLogSchema = SchemaFactory.createForClass(AuditLog);
AuditLogSchema.index({ createdAt: -1 });
AuditLogSchema.index({ action: 1, createdAt: -1 });
