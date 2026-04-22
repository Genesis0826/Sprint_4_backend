import { Module } from '@nestjs/common';
import { OffboardingService } from './offboarding.service';
import { EmployeeOffboardingController } from './employee-offboarding.controller';
import { ManagerOffboardingController } from './manager-offboarding.controller';
import { HrOffboardingController } from './hr-offboarding.controller';
import { SystemAdminOffboardingController } from './system-admin-offboarding.controller';
import { AuthModule } from '../auth/auth.module';
import { SupabaseModule } from '../supabase/supabase.module';
import { AuditModule } from '../audit/audit.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [AuthModule, SupabaseModule, AuditModule, NotificationsModule],
  controllers: [
    EmployeeOffboardingController,
    ManagerOffboardingController,
    HrOffboardingController,
    SystemAdminOffboardingController,
  ],
  providers: [OffboardingService],
  exports: [OffboardingService],
})
export class OffboardingModule {}
