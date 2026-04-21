import { Controller, Get, Post, Body, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { OffboardingService } from './offboarding.service';
import { CreateOffboardingCaseDto } from './dto/create-case.dto';

const ALL_STAFF = ['Employee', 'Manager', 'HR Officer', 'HR Recruiter', 'Admin', 'System Admin'];

@ApiTags('Employee Offboarding')
@ApiBearerAuth()
@Controller('offboarding/employee')
@UseGuards(JwtAuthGuard, RolesGuard)
export class EmployeeOffboardingController {
  constructor(private readonly offboardingService: OffboardingService) {}

  // Submit a resignation (Employee only)
  @Post('cases')
  @Roles(...ALL_STAFF)
  @ApiOperation({ summary: 'Submit a resignation (employee initiates)' })
  createCase(@Body() dto: CreateOffboardingCaseDto, @Req() req: any) {
    return this.offboardingService.createCase(dto, req.user.sub_userid);
  }

  // View own case
  @Get('cases/my')
  @Roles(...ALL_STAFF)
  @ApiOperation({ summary: 'Get my own active offboarding case' })
  getMyCase(@Req() req: any) {
    return this.offboardingService.getMyCaseByEmployeeId(req.user.sub_userid);
  }
}