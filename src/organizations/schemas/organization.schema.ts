import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export type OrganizationDocument = Organization & Document;

@Schema({ timestamps: true })
export class Organization {
  @Prop({ required: true })
  name: string;

  @Prop({ required: true, unique: true })
  slug: string;

  @Prop({ default: 'UNIVERSITY', enum: ['UNIVERSITY', 'COLLEGE', 'SCHOOL', 'CLUB', 'COMMUNITY', 'COMPANY'] })
  type: string;

  @Prop({ default: 'BD' })
  country: string;

  @Prop({ default: '' })
  website: string;

  @Prop({ default: 'https://images.unsplash.com/photo-1541339907198-e08756dedf3f?w=150&auto=format&fit=crop&q=80' })
  logoUrl: string;

  @Prop({ default: false })
  isVerified: boolean;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true })
  ownerId: MongooseSchema.Types.ObjectId;

  @Prop({ default: 1 })
  memberCount: number;
}

export const OrganizationSchema = SchemaFactory.createForClass(Organization);
