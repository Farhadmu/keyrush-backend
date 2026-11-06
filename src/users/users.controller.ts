import { Controller, Get, Patch, Param, Body, UseGuards } from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('profile/:username')
  async getProfile(@Param('username') username: string) {
    return this.usersService.getProfileByUsername(username);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('car')
  async updateCar(@CurrentUser('userId') userId: string, @Body('carId') carId: string) {
    return this.usersService.updateCarSelection(userId, carId);
  }
}
