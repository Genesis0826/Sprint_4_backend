import { Module } from '@nestjs/common';
import { TimekeepingController } from './timekeeping.controller';
import { TimekeepingService } from './timekeeping.service';
import { AuthModule } from '../auth/auth.module';
import { SupabaseModule } from '../supabase/supabase.module';
import { LeaveModule } from '../leave/leave.module';

@Module({
  imports: [
    AuthModule,
    SupabaseModule,
    LeaveModule, // provides LeaveService for /timekeeping/leave-* alias routes
  ],
  controllers: [TimekeepingController],
  providers: [TimekeepingService],
  exports: [TimekeepingService],
})
export class TimekeepingModule {}
