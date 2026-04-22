import {
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { SupabaseService } from '../supabase/supabase.service';
import { CreateNotificationDto } from './dto/create-notification.dto';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private readonly supabaseService: SupabaseService) {}

  // ── HR/Employee notifications (user_notifications table) ─────────────────────

  async createNotification(dto: {
    userId: string;
    companyId: string;
    type: string;
    title: string;
    message: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    const supabase = this.supabaseService.getClient();

    const { data: user } = await supabase
      .from('user_profile')
      .select('user_id, company_id')
      .eq('user_id', dto.userId)
      .maybeSingle();

    if (user?.user_id) {
      const { error } = await supabase
        .from('user_notifications')
        .insert({
          user_id: dto.userId,
          company_id: dto.companyId || user.company_id,
          type: dto.type,
          title: dto.title,
          message: dto.message,
          metadata: dto.metadata ?? null,
        });

      if (error) {
        this.logger.error('[NotificationsService] Failed to create notification:', error.message);
      }
      return;
    }

    const { data: applicant } = await supabase
      .from('applicant_profile')
      .select('applicant_id')
      .eq('applicant_id', dto.userId)
      .maybeSingle();

    if (applicant?.applicant_id) {
      const jobPostingId =
        typeof dto.metadata?.job_posting_id === 'string' ? (dto.metadata.job_posting_id as string) : null;

      const { error } = await supabase
        .from('notifications')
        .insert({
          notification_id: crypto.randomUUID(),
          applicant_id: applicant.applicant_id,
          message: `${dto.title}: ${dto.message}`,
          type: dto.type || 'status_update',
          job_posting_id: jobPostingId,
          is_read: false,
          created_at: new Date().toISOString(),
        });

      if (error) {
        this.logger.error('[NotificationsService] Failed to create applicant notification:', error.message);
      }
      return;
    }

    this.logger.warn(`[NotificationsService] Notification skipped. Unknown recipient id: ${dto.userId}`);
  }

  async notifyAllHRInCompany(
    companyId: string,
    payload: {
      type: string;
      title: string;
      message: string;
      metadata?: Record<string, unknown>;
    },
  ): Promise<void> {
    const { data: hrUsers, error } = await this.supabaseService
      .getClient()
      .from('user_profile')
      .select('user_id, role:role_id(role_name)')
      .eq('company_id', companyId);

    if (error) {
      this.logger.error('[NotificationsService] Failed to fetch HR users:', error.message);
      return;
    }

    const HR_ROLES = ['HR Officer', 'HR Recruiter', 'Admin', 'System Admin'];
    const targets = (hrUsers ?? []).filter((u: any) => HR_ROLES.includes(u.role?.role_name));

    for (const user of targets) {
      await this.createNotification({ userId: user.user_id, companyId, ...payload });
    }
  }

  async getForUser(userId: string, limit = 30) {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('user_notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      this.logger.error('[NotificationsService] Failed to fetch notifications:', error.message);
      return [];
    }
    return data ?? [];
  }

  async markRead(notificationId: string, userId: string): Promise<void> {
    const { error } = await this.supabaseService
      .getClient()
      .from('user_notifications')
      .update({ is_read: true })
      .eq('notification_id', notificationId)
      .eq('user_id', userId);

    if (error) {
      this.logger.error('[NotificationsService] Failed to mark notification read:', error.message);
    }
  }

  async markAllRead(userId: string): Promise<void> {
    const { error } = await this.supabaseService
      .getClient()
      .from('user_notifications')
      .update({ is_read: true })
      .eq('user_id', userId)
      .eq('is_read', false);

    if (error) {
      this.logger.error('[NotificationsService] Failed to mark all notifications read:', error.message);
    }
  }

  // ── Applicant notifications (notifications table) ─────────────────────────────

  async createApplicantNotification(dto: CreateNotificationDto) {
    const supabase = this.supabaseService.getClient();
    const notification_id = crypto.randomUUID();

    const { data, error } = await supabase
      .from('notifications')
      .insert({
        notification_id,
        applicant_id: dto.applicant_id,
        message: dto.message,
        type: dto.notification_type ?? 'status_update',
        job_posting_id: dto.job_posting_id ?? null,
        is_read: false,
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) throw new InternalServerErrorException(error.message);
    return data;
  }

  async getUnreadNotifications(applicantId: string) {
    const supabase = this.supabaseService.getClient();

    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('applicant_id', applicantId)
      .eq('is_read', false)
      .order('created_at', { ascending: false });

    if (error) throw new InternalServerErrorException(error.message);
    return data ?? [];
  }

  async getAllNotifications(applicantId: string) {
    const supabase = this.supabaseService.getClient();

    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('applicant_id', applicantId)
      .order('created_at', { ascending: false });

    if (error) throw new InternalServerErrorException(error.message);
    return data ?? [];
  }

  async markNotificationAsRead(notificationId: string) {
    const supabase = this.supabaseService.getClient();

    const { data, error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('notification_id', notificationId)
      .select()
      .single();

    if (error) throw new InternalServerErrorException(error.message);
    if (!data) throw new NotFoundException('Notification not found');
    return data;
  }

  async markAllAsRead(applicantId: string) {
    const supabase = this.supabaseService.getClient();

    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('applicant_id', applicantId)
      .eq('is_read', false);

    if (error) throw new InternalServerErrorException(error.message);
    return { message: 'All notifications marked as read' };
  }
}
