import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
  HttpCode,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { LeaveService } from './leave.service';
import { FileLeaveRequestDto } from './dto/file-leave-request.dto';
import { ReviewLeaveRequestDto } from './dto/review-leave-request.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

const HR_AND_ABOVE = [
  'Admin',
  'System Admin',
  'HR Officer',
  'HR Recruiter',
  'HR Interviewer',
  'Manager',
];

@ApiTags('Leave')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('leave')
export class LeaveController {
  constructor(private readonly leaveService: LeaveService) {}

  // ── EMPLOYEE ROUTES ──────────────────────────────────────────

  @Get('balances')
  @ApiOperation({ summary: 'Employee: Get own leave balances' })
  getMyBalances(@Req() req: any) {
    return this.leaveService.getMyLeaveBalances(
      req.user.sub_userid,
      req.user.company_id,
    );
  }

  @Post('requests')
  @HttpCode(201)
  @ApiOperation({ summary: 'Employee: File a leave request' })
  fileLeaveRequest(@Req() req: any, @Body() dto: FileLeaveRequestDto) {
    return this.leaveService.fileLeaveRequest(
      req.user.sub_userid,
      req.user.company_id,
      dto,
    );
  }

  @Get('requests/me')
  @ApiOperation({ summary: 'Employee: Get own leave request history' })
  getMyLeaveRequests(@Req() req: any) {
    return this.leaveService.getMyLeaveRequests(req.user.sub_userid);
  }

  // ── HR ROUTES ────────────────────────────────────────────────

  @Get('requests')
  @UseGuards(RolesGuard)
  @Roles(...HR_AND_ABOVE)
  @ApiOperation({ summary: 'HR: Get all leave requests for company' })
  @ApiQuery({ name: 'status', required: false, example: 'Pending' })
  getLeaveRequests(@Req() req: any, @Query('status') status?: string) {
    return this.leaveService.getLeaveRequests(req.user.company_id, status);
  }

  @Patch('requests/:requestId')
  @UseGuards(RolesGuard)
  @Roles(...HR_AND_ABOVE)
  @ApiOperation({ summary: 'HR: Approve or reject a leave request' })
  reviewLeaveRequest(
    @Param('requestId') requestId: string,
    @Req() req: any,
    @Body() dto: ReviewLeaveRequestDto,
  ) {
    return this.leaveService.reviewLeaveRequest(
      requestId,
      req.user.sub_userid,
      req.user.company_id,
      dto,
    );
  }
}
