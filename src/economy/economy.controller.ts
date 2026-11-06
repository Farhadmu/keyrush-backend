import { Controller, Get, Post, Body, UseGuards, BadRequestException } from '@nestjs/common';
import { EconomyService } from './economy.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Controller('economy')
export class EconomyController {
  constructor(private readonly economyService: EconomyService) {}

  @UseGuards(JwtAuthGuard)
  @Get('battle-pass')
  async getBattlePass(@CurrentUser('userId') userId: string) {
    return this.economyService.getBattlePass(userId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('battle-pass/claim')
  async claimTierReward(
    @CurrentUser('userId') userId: string,
    @Body('tierLevel') tierLevel: number,
  ) {
    if (!tierLevel || typeof tierLevel !== 'number') {
      throw new BadRequestException('tierLevel is required and must be a number');
    }
    return this.economyService.claimTierReward(userId, tierLevel);
  }

  // Idempotent Payment Webhook (Stripe / bKash / SSLCommerz)
  @Post('webhook')
  async handlePaymentWebhook(@Body() payload: any) {
    return this.economyService.processPaymentWebhook(payload);
  }

  // Sandbox simulation endpoint
  @UseGuards(JwtAuthGuard)
  @Post('sandbox-upgrade')
  async simulateSandboxUpgrade(
    @CurrentUser('userId') userId: string,
    @Body('provider') provider: string = 'STRIPE_SANDBOX',
  ) {
    const transactionId = `txn_sandbox_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    return this.economyService.processPaymentWebhook({
      transactionId,
      provider,
      userId,
      tier: 'PRO',
      amount: 9.99,
    });
  }
}

