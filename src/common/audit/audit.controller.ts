import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuditService } from './audit.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '../../auth/roles.enum';

@Controller('audit')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.PLATFORM_MODERATOR)
  @Get('logs')
  async getLogs(
    @Query('limit') limit: number = 50,
    @Query('skip') skip: number = 0,
  ) {
    return this.auditService.getRecentLogs(Number(limit) || 50, Number(skip) || 0);
  }
}

