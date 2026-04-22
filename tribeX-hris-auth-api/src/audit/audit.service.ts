import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

export type IncidentSeverity = 'WARNING' | 'ERROR' | 'CRITICAL';

@Injectable()
export class AuditService {
  constructor(private readonly supabaseService: SupabaseService) {}

  private async resolveUserId(userId?: string | null): Promise<string | null> {
    if (!userId) return null;
    const { data } = await this.supabaseService
      .getClient()
      .from('user_profile')
      .select('user_id')
      .eq('user_id', userId)
      .maybeSingle();

    return data?.user_id ?? null;
  }

  async log(action: string, performedBy: string, companyId: string, targetUserId?: string) {
    const [safePerformedBy, safeTargetUserId] = await Promise.all([
      this.resolveUserId(performedBy),
      this.resolveUserId(targetUserId),
    ]);

    const { error } = await this.supabaseService
      .getClient()
      .from('admin_audit_logs')
      .insert({
        action,
        performed_by: safePerformedBy,
        company_id: companyId,
        target_user_id: safeTargetUserId,
        severity: 'INFO',
      });

    // Audit logging is fire-and-forget — a failure here should never break the main operation.
    if (error) {
      console.error('[AuditService] Failed to write audit log:', error.message);
    }
  }

  async logIncident(
    action: string,
    severity: IncidentSeverity,
    options?: {
      companyId?: string;
      performedBy?: string;
      targetUserId?: string;
      ipAddress?: string;
    },
  ) {
    const [safePerformedBy, safeTargetUserId] = await Promise.all([
      this.resolveUserId(options?.performedBy),
      this.resolveUserId(options?.targetUserId),
    ]);

    const { error } = await this.supabaseService
      .getClient()
      .from('admin_audit_logs')
      .insert({
        action,
        performed_by: safePerformedBy,
        company_id: options?.companyId ?? null,
        target_user_id: safeTargetUserId,
        severity,
        ip_address: options?.ipAddress ?? null,
      });

    if (error) {
      console.error('[AuditService] Failed to write incident log:', error.message);
    }
  }

  async getLogs(companyId: string, limit = 50, offset = 0) {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('admin_audit_logs')
      .select(
        '*, performer:user_profile!admin_audit_logs_performed_by_fkey(first_name, last_name)',
      )
      .eq('company_id', companyId)
      .order('timestamp', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw new InternalServerErrorException(error.message);
    return data ?? [];
  }

  async getLogsCount(companyId: string) {
    const { count, error } = await this.supabaseService
      .getClient()
      .from('admin_audit_logs')
      .select('*', { count: 'exact', head: true })
      .eq('company_id', companyId);

    if (error) throw new InternalServerErrorException(error.message);
    return { count: count ?? 0 };
  }
}
