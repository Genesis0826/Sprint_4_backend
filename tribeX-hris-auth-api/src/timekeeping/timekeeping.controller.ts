import {
  Controller,
  Post,
  Get,
  Put,
  Param,
  Body,
  Req,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiParam,
} from '@nestjs/swagger';
import { TimekeepingService } from './timekeeping.service';
import { TimePunchDto } from './dto/time-punch.dto';
import { ReportAbsenceDto } from './dto/report-absence.dto';
import { UpsertScheduleDto } from './dto/upsert-schedule.dto';
import { BulkScheduleDto } from './dto/bulk-schedule.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

// Keep aligned with your existing user roles
const HR_AND_ABOVE = [
  'Admin',
  'System Admin',
  'HR Officer',
  'HR Recruiter',
  'HR Interviewer',
  'Manager',
];

// Roles that can create/edit schedules
const SCHEDULE_MANAGERS = ['System Admin', 'HR Officer', 'HR Recruiter', 'HR Interviewer'];

@ApiTags('Timekeeping')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('timekeeping')
export class TimekeepingController {
  constructor(private readonly timekeepingService: TimekeepingService) {}

  @Post('time-in')
  @ApiOperation({
    summary: 'Employee: Clock in',
    description:
      'Records a clock-in punch with GPS coordinates. ' +
      'Rejects duplicate clock-in without a matching clock-out. ' +
      'Requires an assigned work schedule.',
  })
  timeIn(@Body() dto: TimePunchDto, @Req() req: any) {
    return this.timekeepingService.timeIn(req.user.sub_userid, dto, req);
  }

  @Post('time-out')
  @ApiOperation({
    summary: 'Employee: Clock out',
    description:
      'Records a clock-out punch with GPS coordinates. ' +
      'Rejects if no prior clock-in exists for the current shift/day.',
  })
  timeOut(@Body() dto: TimePunchDto, @Req() req: any) {
    return this.timekeepingService.timeOut(req.user.sub_userid, dto, req);
  }

  @Post('report-absence')
  @ApiOperation({
    summary: 'Employee: Report an absence with reason',
    description:
      'Records an absence for today with a specified reason. ' +
      'Rejected if the employee has already clocked in or already reported absence today.',
  })
  reportAbsence(@Body() dto: ReportAbsenceDto, @Req() req: any) {
    return this.timekeepingService.reportAbsence(req.user.sub_userid, dto);
  }

  @Post('auto-mark-absent')
  @UseGuards(RolesGuard)
  @Roles('System Admin', 'HR Officer', 'HR Recruiter', 'HR Interviewer')
  @ApiOperation({
    summary: 'System: Auto-mark absent employees',
    description:
      'Marks all employees scheduled for today as absent if they have ' +
      'no clock-in and did not self-report an absence. ' +
      'Intended to be called at end of business day (or by a cron scheduler). ' +
      'Safe to call multiple times — duplicate absences are skipped. ' +
      'Restricted to HR/System Admin roles.',
  })
  autoMarkAbsent() {
    return this.timekeepingService.autoMarkAbsentEmployees();
  }

  @Get('my-status')
  @ApiOperation({
    summary: "Employee: Get today's punch status",
    description:
      "Returns the employee's current punch status for today, " +
      'including first clock-in and latest clock-out if present.',
  })
  getMyStatus(@Req() req: any) {
    return this.timekeepingService.getMyStatus(req.user.sub_userid);
  }

  @Get('my-timesheet')
  @ApiOperation({
    summary: 'Employee: View own timesheet',
    description:
      "Returns the authenticated employee's punches grouped by date. " +
      'Can be filtered by from/to date.',
  })
  @ApiQuery({ name: 'from', required: false, example: '2026-03-01' })
  @ApiQuery({ name: 'to', required: false, example: '2026-03-31' })
  getMyTimesheet(
    @Req() req: any,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.timekeepingService.getMyTimesheet(
      req.user.sub_userid,
      from,
      to,
    );
  }

  @Get('employees')
  @UseGuards(RolesGuard)
  @Roles(...HR_AND_ABOVE)
  @ApiOperation({ summary: 'HR/Manager: List employees eligible for timekeeping' })
  getEmployees(@Req() req: any) {
    return this.timekeepingService.getEmployeeUsers(req.user.company_id);
  }

  @Get('timesheets')
  @UseGuards(RolesGuard)
  @Roles(...HR_AND_ABOVE)
  @ApiOperation({
    summary: 'HR/Manager: View all employee timesheets',
    description:
      "Returns all attendance logs scoped to the requester's company. " +
      'Includes employee details where available.',
  })
  @ApiQuery({ name: 'from', required: false, example: '2026-03-01' })
  @ApiQuery({ name: 'to', required: false, example: '2026-03-31' })
  getAllTimesheets(
    @Req() req: any,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.timekeepingService.getAllTimesheets(req.user.company_id, from, to);
  }

  @Get('timesheets/:userId/:date')
  @UseGuards(RolesGuard)
  @Roles(...HR_AND_ABOVE)
  @ApiOperation({
    summary: "HR/Manager: View one employee's punches for a specific date",
    description:
      'Returns exact clock-in/clock-out records, GPS, IP, and status info ' +
      'for a specific employee on a given date.',
  })
  @ApiParam({
    name: 'userId',
    description: 'user_id of the target employee',
    example: '8c7ef5ea-1111-2222-3333-444455556666',
  })
  @ApiParam({
    name: 'date',
    description: 'Date in YYYY-MM-DD format',
    example: '2026-03-10',
  })
  getEmployeeDetail(
    @Param('userId') userId: string,
    @Param('date') date: string,
    @Req() req: any,
  ) {
    return this.timekeepingService.getEmployeeDetail(
      userId,
      date,
      req.user.company_id,
    );
  }

  // ─── Schedule CRUD ──────────────────────────────────────────────────────────

  @Get('my-schedule')
  @ApiOperation({ summary: 'Employee: Get own work schedule' })
  getMySchedule(@Req() req: any) {
    return this.timekeepingService.getMySchedule(req.user.sub_userid);
  }

  @Get('my-stats')
  @ApiOperation({ summary: 'Employee: Get attendance stats for a date range' })
  @ApiQuery({ name: 'from', required: true, example: '2026-04-01' })
  @ApiQuery({ name: 'to', required: true, example: '2026-04-30' })
  getMyStats(
    @Req() req: any,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    return this.timekeepingService.getMyStats(req.user.sub_userid, from, to);
  }

  @Get('schedules')
  @UseGuards(RolesGuard)
  @Roles(...HR_AND_ABOVE)
  @ApiOperation({ summary: 'HR/Manager: Get all employees with their assigned schedules' })
  getAllSchedules(@Req() req: any) {
    return this.timekeepingService.getAllSchedules(req.user.company_id);
  }

  @Get('employees/:userId/schedule')
  @UseGuards(RolesGuard)
  @Roles(...HR_AND_ABOVE)
  @ApiOperation({ summary: 'HR/Manager: Get a specific employee\'s schedule' })
  @ApiParam({ name: 'userId', description: 'user_id of the target employee' })
  getEmployeeSchedule(@Param('userId') userId: string, @Req() req: any) {
    return this.timekeepingService.getEmployeeSchedule(userId, req.user.company_id);
  }

  @Put('employees/:userId/schedule')
  @UseGuards(RolesGuard)
  @Roles(...SCHEDULE_MANAGERS)
  @ApiOperation({ summary: 'HR/System Admin: Create or update an employee\'s schedule' })
  @ApiParam({ name: 'userId', description: 'user_id of the target employee' })
  upsertSchedule(
    @Param('userId') userId: string,
    @Body() dto: UpsertScheduleDto,
    @Req() req: any,
  ) {
    return this.timekeepingService.upsertEmployeeSchedule(userId, dto, req.user.company_id, req.user.sub_userid);
  }

  @Post('schedules/bulk')
  @UseGuards(RolesGuard)
  @Roles(...SCHEDULE_MANAGERS)
  @ApiOperation({ summary: 'HR/System Admin: Bulk-assign a schedule to company, department, or selected employees' })
  bulkAssignSchedule(@Body() dto: BulkScheduleDto, @Req() req: any) {
    return this.timekeepingService.bulkAssignSchedule(dto, req.user.company_id, req.user.sub_userid);
  }
}
