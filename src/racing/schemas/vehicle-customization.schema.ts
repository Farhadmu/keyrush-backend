import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export type VehicleCustomizationDocument = VehicleCustomization & Document;

@Schema({ _id: false })
export class VehicleCustomizationOptions {
  @Prop({ default: '#3B82F6' })
  paintColor: string;

  @Prop({ default: 'metallic', enum: ['gloss', 'matte', 'metallic', 'chrome', 'iridescent'] })
  finish: string;

  @Prop({ default: 'standard', enum: ['standard', 'aeroblade', 'cybermesh', 'carbon_deep'] })
  rimStyle: string;

  @Prop({ default: '#FFFFFF' })
  rimColor: string;

  @Prop({ default: 'none', enum: ['none', 'sport', 'gt_wing', 'cyber_spoiler'] })
  spoiler: string;

  @Prop({ default: false })
  underglow: boolean;

  @Prop({ default: '#00F0FF' })
  underglowColor: string;

  @Prop({ default: '#00F0FF' })
  nitroFlameColor: string;

  @Prop({ default: '#94A3B8' })
  wheelSmokeColor: string;
}

export const VehicleCustomizationOptionsSchema = SchemaFactory.createForClass(VehicleCustomizationOptions);

@Schema({ timestamps: true })
export class VehicleCustomization {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true, index: true })
  userId: MongooseSchema.Types.ObjectId;

  @Prop({ required: true, default: 'car_cyber_phantom' })
  carId: string;

  @Prop({ type: VehicleCustomizationOptions, default: () => ({}) })
  customization: VehicleCustomizationOptions;
}

export const VehicleCustomizationSchema = SchemaFactory.createForClass(VehicleCustomization);
VehicleCustomizationSchema.index({ userId: 1, carId: 1 }, { unique: true });

