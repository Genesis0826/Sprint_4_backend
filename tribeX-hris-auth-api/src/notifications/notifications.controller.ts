import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
  Req,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateNotificationDto } from './dto/create-notification.dto';

@ApiTags('Notifications')
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  // ── HR/Employee notifications (JWT-protected, user_notifications table) ──────

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Patch('read-all')
  @ApiOperation({ summary: 'Mark all notifications as read for current user' })
  markAllRead(@Req() req: any) {
    return this.notificationsService.markAllRead(req.user.sub_userid);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get('me')
  @ApiOperation({ summary: 'Get notifications for the current user' })
  getMyNotifications(@Req() req: any) {
    return this.notificationsService.getForUser(req.user.sub_userid);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Patch(':id/read')
  @ApiOperation({ summary: 'Mark a single notification as read' })
  markRead(@Param('id') id: string, @Req() req: any) {
    return this.notificationsService.markRead(id, req.user.sub_userid);
  }

  // ── Applicant notifications (notifications table, no auth required) ───────────

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new applicant notification (internal use)' })
  createNotification(@Body() dto: CreateNotificationDto) {
    return this.notificationsService.createApplicantNotification(dto);
  }

  @Get('applicant/:applicant_id/unread')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get unread notifications for an applicant' })
  getUnreadNotifications(@Param('applicant_id') applicantId: string) {
    return this.notificationsService.getUnreadNotifications(applicantId);
  }

  @Get('applicant/:applicant_id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get all notifications for an applicant' })
  getAllNotifications(@Param('applicant_id') applicantId: string) {
    return this.notificationsService.getAllNotifications(applicantId);
  }

  @Patch('applicant/:applicant_id/mark-all-read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark all notifications as read for an applicant' })
  markAllAsRead(@Param('applicant_id') applicantId: string) {
    return this.notificationsService.markAllAsRead(applicantId);
  }

  @Patch(':notification_id/mark-read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark a single applicant notification as read' })
  markNotificationAsRead(@Param('notification_id') notificationId: string) {
    return this.notificationsService.markNotificationAsRead(notificationId);
  }
}
