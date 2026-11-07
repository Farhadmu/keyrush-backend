import { Injectable, OnModuleInit, OnModuleDestroy, Logger, Inject, forwardRef } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Competition, CompetitionDocument, CompetitionStatus } from './schemas/competition.schema';
import { CompetitionRegistration, CompetitionRegistrationDocument } from './schemas/registration.schema';
import { RedisService } from '../common/redis/redis.service';
import { EventHeatsService } from '../event-heats/event-heats.service';

@Injectable()
export class CompetitionSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CompetitionSchedulerService.name);
  private timer: NodeJS.Timeout | null = null;
  private isProcessing = false;

  constructor(
    @InjectModel(Competition.name) private compModel: Model<CompetitionDocument>,
    @InjectModel(CompetitionRegistration.name) private regModel: Model<CompetitionRegistrationDocument>,
    private readonly redisService: RedisService,
    @Inject(forwardRef(() => EventHeatsService))
    private readonly heatsService?: EventHeatsService,
  ) {}

  onModuleInit() {
    this.logger.log('🕒 [Scheduler] Initializing Competition Lifecycle Scheduler...');
    // Initial evaluation for startup / recovery of missed schedules
    setTimeout(() => this.evaluateSchedules(), 2000);

    // Run periodic evaluation every 30 seconds
    this.timer = setInterval(() => {
      this.evaluateSchedules();
    }, 30000);
  }

  onModuleDestroy() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async evaluateSchedules() {
    if (this.isProcessing) return;

    const lockKey = 'keyrush:lock:scheduler:competitions';
    let lockAcquired = false;

    try {
      if (this.redisService?.acquireLock) {
        lockAcquired = await this.redisService.acquireLock(lockKey, 25000);
        if (!lockAcquired) {
          // Another server instance is currently executing the scheduler tick
          return;
        }
      }

      this.isProcessing = true;
      const now = new Date();

      // Find competitions that might need lifecycle transition
      const activeCompetitions = await this.compModel.find({
        status: {
          $in: [
            CompetitionStatus.DRAFT,
            CompetitionStatus.PUBLISHED,
            CompetitionStatus.REGISTRATION_OPEN,
            CompetitionStatus.REGISTRATION_CLOSED,
            CompetitionStatus.CHECK_IN_OPEN,
            CompetitionStatus.CHECK_IN_CLOSED,
            CompetitionStatus.READY,
            CompetitionStatus.HEATS_GENERATED,
          ],
        },
      });

      for (const comp of activeCompetitions) {
        try {
          await this.evaluateSingleCompetition(comp, now);
        } catch (err: any) {
          this.logger.error(`Error evaluating competition ${comp._id} (${comp.title}): ${err.message}`);
        }
      }
    } catch (err: any) {
      this.logger.error(`Scheduler evaluation loop error: ${err.message}`);
    } finally {
      this.isProcessing = false;
      if (lockAcquired && this.redisService?.releaseLock) {
        await this.redisService.releaseLock(lockKey);
      }
    }
  }

  private async evaluateSingleCompetition(comp: CompetitionDocument, now: Date) {
    let statusChanged = false;
    const oldStatus = comp.status;

    // Transition 1: PUBLISHED / DRAFT -> REGISTRATION_OPEN
    if (
      (comp.status === CompetitionStatus.PUBLISHED || comp.status === CompetitionStatus.DRAFT) &&
      comp.registrationStart &&
      now >= new Date(comp.registrationStart) &&
      now < new Date(comp.registrationEnd)
    ) {
      comp.status = CompetitionStatus.REGISTRATION_OPEN;
      statusChanged = true;
      this.logger.log(`[Scheduler] ${comp.title}: Status transitioned to REGISTRATION_OPEN`);
    }

    // Transition 2: REGISTRATION_OPEN -> REGISTRATION_CLOSED
    if (
      comp.status === CompetitionStatus.REGISTRATION_OPEN &&
      comp.registrationEnd &&
      now >= new Date(comp.registrationEnd)
    ) {
      comp.status = CompetitionStatus.REGISTRATION_CLOSED;
      statusChanged = true;
      this.logger.log(`[Scheduler] ${comp.title}: Status transitioned to REGISTRATION_CLOSED`);
    }

    // Transition 3: REGISTRATION_CLOSED -> CHECK_IN_OPEN
    if (
      comp.status === CompetitionStatus.REGISTRATION_CLOSED &&
      comp.checkInStart &&
      now >= new Date(comp.checkInStart) &&
      now < new Date(comp.checkInEnd)
    ) {
      comp.status = CompetitionStatus.CHECK_IN_OPEN;
      statusChanged = true;
      this.logger.log(`[Scheduler] ${comp.title}: Status transitioned to CHECK_IN_OPEN`);
    }

    // Transition 4: CHECK_IN_OPEN -> CHECK_IN_CLOSED
    if (
      comp.status === CompetitionStatus.CHECK_IN_OPEN &&
      comp.checkInEnd &&
      now >= new Date(comp.checkInEnd)
    ) {
      comp.status = CompetitionStatus.CHECK_IN_CLOSED;
      statusChanged = true;
      this.logger.log(`[Scheduler] ${comp.title}: Status transitioned to CHECK_IN_CLOSED`);

      // Evaluate minimum check-in threshold (min 20 participants)
      const confirmedCheckIns = await this.regModel.countDocuments({
        competitionId: comp._id,
        checkInStatus: 'CHECKED_IN',
      });

      const minRequired = comp.settings?.minParticipants || 20;

      if (confirmedCheckIns >= minRequired) {
        comp.status = CompetitionStatus.READY;
        this.logger.log(
          `[Scheduler] ${comp.title}: Ready for tournament! Check-in count (${confirmedCheckIns}) >= min (${minRequired}). Status -> READY`,
        );
      } else {
        this.logger.warn(
          `[Scheduler] ${comp.title}: Insufficient check-ins: ${confirmedCheckIns} checked-in out of min ${minRequired}. Waiting for organizer action.`,
        );
      }
    }

    // Transition 5: Event Start Reached -> HEATS & RACE LAUNCH -> IN_PROGRESS
    if (
      (comp.status === CompetitionStatus.CHECK_IN_CLOSED ||
        comp.status === CompetitionStatus.READY ||
        comp.status === CompetitionStatus.HEATS_GENERATED) &&
      comp.eventStart &&
      now >= new Date(comp.eventStart)
    ) {
      const confirmedCheckIns = await this.regModel.countDocuments({
        competitionId: comp._id,
        checkInStatus: 'CHECKED_IN',
      });
      const minRequired = comp.settings?.minParticipants || 20;

      if (confirmedCheckIns >= minRequired) {
        if (this.heatsService) {
          const schedulerCaller = {
            userId: comp.organizerId ? comp.organizerId.toString() : 'system_scheduler',
            roles: ['SUPER_ADMIN'],
          };

          if (comp.status !== CompetitionStatus.HEATS_GENERATED) {
            try {
              await this.heatsService.generateHeatsForCompetition(
                comp._id.toString(),
                comp.settings?.seedingRule || 'INSTITUTION_BALANCED',
                schedulerCaller,
              );
            } catch (err: any) {
              this.logger.warn(`[Scheduler] Could not generate heats automatically: ${err.message}`);
            }
          }

          try {
            await this.heatsService.startHeat(comp._id.toString(), 1, 1, schedulerCaller);
          } catch (err: any) {
            this.logger.warn(`[Scheduler] Could not launch heat 1 automatically: ${err.message}`);
          }
        }

        comp.status = CompetitionStatus.IN_PROGRESS;
        statusChanged = true;
        this.logger.log(`[Scheduler] ${comp.title}: Event start reached with ${confirmedCheckIns} racers. Status -> IN_PROGRESS`);
      } else {
        this.logger.warn(
          `[Scheduler] ${comp.title}: Event start reached but insufficient check-ins (${confirmedCheckIns} < ${minRequired}). Holding event for organizer decision.`,
        );
      }
    }

    if (statusChanged) {
      await comp.save();
      this.logger.log(`[Scheduler] Successfully updated ${comp.title}: ${oldStatus} -> ${comp.status}`);
    }
  }
}

