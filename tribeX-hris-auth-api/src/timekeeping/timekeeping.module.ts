import { Module } from '@nestjs/common';
import { TimekeepingController } from './timekeeping.controller';
import { TimekeepingService } from './timekeeping.service';
import { TimekeepingTasksService } from './timekeeping.tasks';
import { AuthModule } from '../auth/auth.module';
import { SupabaseModule } from '../supabase/supabase.module';

@Module({
  imports: [
    AuthModule, // provides JwtAuthGuard, RolesGuard, Roles decorator
    SupabaseModule, // provides SupabaseService
  ],
  controllers: [TimekeepingController],
  providers: [TimekeepingService, TimekeepingTasksService],
  exports: [TimekeepingService],
})
export class TimekeepingModule {}
