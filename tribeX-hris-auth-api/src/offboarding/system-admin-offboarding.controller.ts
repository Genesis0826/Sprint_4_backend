import { Controller, Post, Delete, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { OffboardingService } from './offboarding.service';

const SYSTEM_ADMIN_ONLY = ['System Admin'];

@ApiTags('System Admin Offboarding')
@ApiBearerAuth()
@Controller('offboarding/system-admin')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SystemAdminOffboardingController {
  constructor(private readonly offboardingService: OffboardingService) {}

  // Phase 1 — Enable offboarding module for a company tenant
  @Post('tenants/:companyId/enable')
  @Roles(...SYSTEM_ADMIN_ONLY)
  @ApiOperation({ summary: 'Enable offboarding module for a company tenant' })
  enable(@Param('companyId') companyId: string, @Req() req: any) {
    return this.offboardingService.enableOffboardingModule(companyId, req.user.sub_userid);
  }

  // Disable offboarding module
  @Post('tenants/:companyId/disable')
  @Roles(...SYSTEM_ADMIN_ONLY)
  @ApiOperation({ summary: 'Disable offboarding module for a company tenant' })
  disable(@Param('companyId') companyId: string, @Req() req: any) {
    return this.offboardingService.disableOffboardingModule(companyId, req.user.sub_userid);
  }

  // Phase 3 — View and audit offboarding activity logs across all tenants
  @Get('audit-logs')
  @Roles(...SYSTEM_ADMIN_ONLY)
  @ApiOperation({ summary: 'View offboarding activity logs across all tenants (Phase 3)' })
  getAuditLogs(
    @Query('company_id') company_id?: string,
    @Query('employee_id') employee_id?: string,
  ) {
    return this.offboardingService.getOffboardingAuditLogs({ company_id, employee_id });
  }
}
