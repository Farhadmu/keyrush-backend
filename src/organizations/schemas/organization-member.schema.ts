import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export type OrganizationMemberDocument = OrganizationMember & Document;

export enum OrgRole {
  OWNER = 'OWNER',
  ADMIN = 'ADMIN',
  MODERATOR = 'MODERATOR',
  MEMBER = 'MEMBER',
}

export enum MembershipStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  BANNED = 'BANNED',
}

@Schema({ timestamps: true })
export class OrganizationMember {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Organization', required: true, index: true })
  organizationId: MongooseSchema.Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true, index: true })
  userId: MongooseSchema.Types.ObjectId;

  @Prop({ default: OrgRole.MEMBER, enum: Object.values(OrgRole) })
  role: string;

  @Prop({ default: MembershipStatus.PENDING, enum: Object.values(MembershipStatus) })
  status: string;

  @Prop({ default: '' })
  title: string; // e.g. 'Lead Racer', 'Captain', 'Faculty Advisor'

  @Prop({ default: () => new Date() })
  joinedAt: Date;
}

export const OrganizationMemberSchema = SchemaFactory.createForClass(OrganizationMember);
OrganizationMemberSchema.index({ organizationId: 1, userId: 1 }, { unique: true });
OrganizationMemberSchema.index({ organizationId: 1, status: 1 });

