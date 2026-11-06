import {
  Controller,
  Get,
  Patch,
  Param,
  Body,
  UseGuards,
  Query,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserRole } from './schemas/user.schema';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('profile/:username')
  async getProfile(@Param('username') username: string) {
    return this.usersService.getProfileByUsername(username);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me/dashboard')
  async getMyDashboard(@CurrentUser('userId') userId: string) {
    return this.usersService.getProfileByUserId(userId);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('profile')
  async updateProfile(
    @CurrentUser('userId') userId: string,
    @Body() body: any,
  ) {
    return this.usersService.updateProfile(userId, body);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('car')
  async updateCar(
    @CurrentUser('userId') userId: string,
    @Body('carId') carId: string,
  ) {
    return this.usersService.updateCarSelection(userId, carId);
  }

  // Admin Endpoints
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.PLATFORM_MODERATOR)
  @Get('admin/all')
  async getAllUsers(
    @Query('search') search?: string,
    @Query('role') role?: string,
    @Query('status') status?: string,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 50,
  ) {
    return this.usersService.getAllUsers({ search, role, status, page: Number(page), limit: Number(limit) });
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.PLATFORM_MODERATOR)
  @Patch('admin/:id/status')
  async updateUserStatus(
    @Param('id') userId: string,
    @Body('status') status: string,
    @CurrentUser('userId') adminUserId: string,
  ) {
    return this.usersService.updateUserStatus(userId, status, { userId: adminUserId });
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  @Patch('admin/:id/roles')
  async updateUserRoles(
    @Param('id') userId: string,
    @Body('roles') roles: string[],
    @CurrentUser('userId') adminUserId: string,
  ) {
    return this.usersService.updateUserRoles(userId, roles, { userId: adminUserId });
  }
}
