import { Injectable, Logger } from '@nestjs/common';
import { TimekeepingService } from './timekeeping.service';

/**
 * Scheduled background tasks for the Timekeeping module.
 *
 * SETUP REQUIRED:
 *   1. npm install @nestjs/schedule
 *   2. Add ScheduleModule.forRoot() to app.module.ts imports
 *   3. Add TimekeepingTasksService to timekeeping.module.ts providers
 */
@Injectable()
export class TimekeepingTasksService {
  private readonly logger = new Logger(TimekeepingTasksService.name);

  constructor(private readonly timekeepingService: TimekeepingService) {}

  /**
   * Manual helper retained for troubleshooting.
   * Scheduled auto-absent execution is owned by JobsService cron handlers.
   */
  async handleAutoMarkAbsent() {
    this.logger.log('CRON: auto-mark-absent job triggered');
    try {
      const result = await this.timekeepingService.autoMarkAbsentEmployees();
      this.logger.log(
        `CRON: auto-mark-absent complete — marked: ${result.marked}, skipped: ${result.skipped}, date: ${result.date}`,
      );
    } catch (err) {
      this.logger.error('CRON: auto-mark-absent failed', err);
    }
  }
}
