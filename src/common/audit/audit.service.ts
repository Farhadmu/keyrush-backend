import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AuditLog, AuditLogDocument } from './schemas/audit-log.schema';

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    @InjectModel(AuditLog.name) private readonly auditLogModel: Model<AuditLogDocument>,
  ) {}

  async logAction(params: {
    actorId?: string | null;
    actorUsername?: string;
    action: string;
    resource: string;
    resourceId?: string;
    details?: Record<string, any>;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<AuditLogDocument> {
    try {
      const entry = new this.auditLogModel({
        actorId: params.actorId || null,
        actorUsername: params.actorUsername || 'SYSTEM',
        action: params.action,
        resource: params.resource,
        resourceId: params.resourceId || '',
        details: params.details || {},
        ipAddress: params.ipAddress || '127.0.0.1',
        userAgent: params.userAgent || '',
      });
      return await entry.save();
    } catch (err: any) {
      this.logger.error(`Failed to record audit log: ${err.message}`);
      return null as any;
    }
  }

  async getRecentLogs(limit = 100, skip = 0) {
    return this.auditLogModel
      .find()
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .exec();
  }
}
