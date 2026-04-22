import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import * as crypto from 'node:crypto';
import { PDFParse } from 'pdf-parse';
import { SupabaseService } from '../supabase/supabase.service';
import { AuditService } from '../audit/audit.service';
import { MailService } from '../mail/mail.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateJobPostingDto } from './dto/create-job-posting.dto';
import { UpdateJobPostingDto } from './dto/update-job-posting.dto';
import { CreateApplicationDto } from './dto/create-application.dto';
import { ApplicationQuestionDto } from './dto/create-questions.dto';
import { ApplicationResumeUploadDto } from './dto/application-resume-upload.dto';
import { GetRankedCandidatesDto } from './dto/get-ranked-candidates.dto';
import { ManualRankingItemDto } from './dto/save-manual-ranking.dto';
import { ScheduleInterviewDto } from './dto/schedule-interview.dto';
import { InterviewResponseDto } from './dto/interview-response.dto';
import { OnboardingService } from '../onboarding/onboarding.service';

type RankingMode = 'sfia' | 'manual';

type SfiaDemandSkill = {
  skill_id: string;
  skill_name: string;
  required_level: number;
  weight: number;
};

type SfiaSupplySkill = {
  owner_key: string;
  skill_id: string;
  skill_name: string;
  candidate_level: number;
  match_score: number | null;
};

type SkillBreakdown = {
  sfia_skill_id: string;
  skill_name: string;
  demand_level: number;
  supply_level: number;
  points: number;
  matched: boolean;
};

type RankedCandidate = {
  application_id: string;
  applicant_id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone_number: string | null;
  applicant_code: string | null;
  status: string;
  applied_at: string;
  sfia_match_percentage: number;
  sfia_rank: number;
  manual_rank_position: number | null;
  effective_rank: number;
  skill_breakdown: SkillBreakdown[];
};

type RankedApplicationRow = {
  application_id: string;
  job_posting_id: string;
  applicant_id: string;
  status: string;
  application_timestamp: string;
  pre_screening_score: number | null;
  sfia_matching_percentage: number | null;
  manual_rank_position: number | null;
  ranking_mode: string;
};

type ApplicantProfileRow = {
  applicant_id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone_number: string | null;
  applicant_code: string | null;
};

function normalizeNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function roundToTwo(value: number) {
  return Math.round(value * 100) / 100;
}

@Injectable()
export class JobsService {
  private readonly logger = new Logger(JobsService.name);

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly auditService: AuditService,
    private readonly mailService: MailService,
    private readonly onboardingService: OnboardingService,
    private readonly notificationsService: NotificationsService,
  ) {}

  // ---------------------------------------------------------------------------
  // HR-facing methods — all scoped by companyId from JWT
  // ---------------------------------------------------------------------------

  async createPosting(dto: CreateJobPostingDto, companyId: string, performedBy: string) {
    const supabase = this.supabaseService.getClient();
    const job_posting_id = crypto.randomUUID();

    const { data, error } = await supabase
      .from('job_postings')
      .insert({
        job_posting_id,
        company_id: companyId,
        title: dto.title,
        description: dto.description,
        location: dto.location ?? null,
        employment_type: dto.employment_type ?? null,
        salary_range: dto.salary_range ?? null,
        department_id: dto.department_id ?? null,
        closes_at: dto.closes_at ?? null,
        status: 'open',
        posted_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) throw new InternalServerErrorException(error.message);

    await this.auditService.log(
      `Job posting created: "${dto.title}"`,
      performedBy,
      companyId,
    );

    return data;
  }

  async findAllPostings(companyId: string) {
    const supabase = this.supabaseService.getClient();

    // Auto-close any open postings whose closes_at has passed
    const now = new Date().toISOString();
    await supabase
      .from('job_postings')
      .update({ status: 'closed' })
      .eq('company_id', companyId)
      .eq('status', 'open')
      .not('closes_at', 'is', null)
      .lt('closes_at', now);

    const { data, error } = await supabase
      .from('job_postings')
      .select('*, job_applications(application_id, applicant_profile(status))')
      .eq('company_id', companyId)
      .order('posted_at', { ascending: false });

    if (error) throw new InternalServerErrorException(error.message);
    return (data ?? []).map((row: any) => ({
      ...row,
      // Only count applicants who have not been converted to employees (matches pipeline filter)
      applicant_count: (row.job_applications as any[] ?? []).filter(
        (a: any) => a.applicant_profile?.status !== 'converted_employee',
      ).length,
      job_applications: undefined,
    }));
  }

  async findOnePosting(jobPostingId: string, companyId: string) {
    const supabase = this.supabaseService.getClient();

    const { data, error } = await supabase
      .from('job_postings')
      .select('*')
      .eq('job_posting_id', jobPostingId)
      .eq('company_id', companyId)
      .maybeSingle();

    if (error) throw new InternalServerErrorException(error.message);
    if (!data) throw new NotFoundException('Job posting not found');
    return data;
  }

  async getJobSfiaSkills(jobPostingId: string, companyId: string) {
    await this.findOnePosting(jobPostingId, companyId);
    const supabase = this.supabaseService.getClient();
    const { data, error } = await supabase
      .from('job_posting_sfia_skill')
      .select('job_posting_skills_id, skill_id, required_level, weight')
      .eq('job_posting_id', jobPostingId)
      .order('required_level', { ascending: false });
    if (error) throw new InternalServerErrorException(error.message);
    return data ?? [];
  }

  async saveJobSfiaSkills(
    jobPostingId: string,
    skills: Array<{ skill_id: string; required_level: number; weight?: number }>,
    companyId: string,
  ) {
    await this.findOnePosting(jobPostingId, companyId);
    const supabase = this.supabaseService.getClient();

    // Delete existing skills for this job
    await supabase.from('job_posting_sfia_skill').delete().eq('job_posting_id', jobPostingId);

    if (skills.length === 0) return [];

    const rows = skills.map((s) => ({
      job_posting_id: jobPostingId,
      skill_id: s.skill_id.trim(),
      required_level: Math.max(1, Math.min(7, Math.round(s.required_level))),
      weight: s.weight ?? 1,
    }));

    const { data, error } = await supabase
      .from('job_posting_sfia_skill')
      .insert(rows)
      .select('job_posting_skills_id, skill_id, required_level, weight');

    if (error) throw new InternalServerErrorException(error.message);
    return data ?? [];
  }

  async updatePosting(jobPostingId: string, dto: UpdateJobPostingDto, companyId: string, performedBy: string) {
    const supabase = this.supabaseService.getClient();

    const existing = await this.findOnePosting(jobPostingId, companyId);

    const updateFields: Record<string, any> = {};
    if (dto.title !== undefined) updateFields.title = dto.title;
    if (dto.description !== undefined) updateFields.description = dto.description;
    if (dto.location !== undefined) updateFields.location = dto.location;
    if (dto.employment_type !== undefined) updateFields.employment_type = dto.employment_type;
    if (dto.salary_range !== undefined) updateFields.salary_range = dto.salary_range;
    if (dto.department_id !== undefined) updateFields.department_id = dto.department_id;
    if (dto.closes_at !== undefined) updateFields.closes_at = dto.closes_at;
    if (dto.status !== undefined) updateFields.status = dto.status;

    const { data, error } = await supabase
      .from('job_postings')
      .update(updateFields)
      .eq('job_posting_id', jobPostingId)
      .eq('company_id', companyId)
      .select()
      .single();

    if (error) throw new InternalServerErrorException(error.message);

    // Build a human-readable summary of what changed
    const changedFields = Object.keys(updateFields);
    const statusChange = dto.status && dto.status !== existing.status
      ? ` (status: ${existing.status} → ${dto.status})`
      : '';
    await this.auditService.log(
      `Job posting updated: "${existing.title}" - fields: ${changedFields.join(', ')}${statusChange}`,
      performedBy,
      companyId,
    );

    return data;
  }

  async closePosting(jobPostingId: string, companyId: string, performedBy: string) {
    const supabase = this.supabaseService.getClient();

    const existing = await this.findOnePosting(jobPostingId, companyId);

    const { error } = await supabase
      .from('job_postings')
      .update({ status: 'closed' })
      .eq('job_posting_id', jobPostingId)
      .eq('company_id', companyId);

    if (error) throw new InternalServerErrorException(error.message);

    await this.auditService.log(
      `Job posting closed: "${existing.title}"`,
      performedBy,
      companyId,
    );

    return { message: 'Job posting closed successfully' };
  }

  // ---------------------------------------------------------------------------
  // Application questions — HR manages, applicants read
  // ---------------------------------------------------------------------------

  async setQuestionsForPosting(jobPostingId: string, questions: ApplicationQuestionDto[], companyId: string, performedBy: string) {
    const supabase = this.supabaseService.getClient();

    // Verify job ownership
    const existing = await this.findOnePosting(jobPostingId, companyId);

    // Replace all existing questions
    await supabase.from('application_questions').delete().eq('job_posting_id', jobPostingId);

    if (questions.length === 0) {
      await this.auditService.log(
        `Application form cleared: job "${existing.title}"`,
        performedBy,
        companyId,
      );
      return [];
    }

    const rows = questions.map((q, i) => ({
      question_id: crypto.randomUUID(),
      job_posting_id: jobPostingId,
      question_text: q.question_text,
      question_type: q.question_type,
      options: q.options ?? null,
      is_required: q.is_required ?? true,
      sort_order: q.sort_order ?? i,
    }));

    const { data, error } = await supabase
      .from('application_questions')
      .insert(rows)
      .select();

    if (error) throw new InternalServerErrorException(error.message);

    await this.auditService.log(
      `Application form updated: job "${existing.title}" - ${questions.length} question(s) set`,
      performedBy,
      companyId,
    );

    return data ?? [];
  }

  async getQuestionsForPosting(jobPostingId: string) {
    const supabase = this.supabaseService.getClient();

    const { data, error } = await supabase
      .from('application_questions')
      .select('question_id, question_text, question_type, options, is_required, sort_order')
      .eq('job_posting_id', jobPostingId)
      .order('sort_order');

    if (error) throw new InternalServerErrorException(error.message);
    return data ?? [];
  }

  // ---------------------------------------------------------------------------
  // Applications — HR view
  // ---------------------------------------------------------------------------

  async getApplicationsForJob(jobPostingId: string, companyId: string) {
    const supabase = this.supabaseService.getClient();

    await this.findOnePosting(jobPostingId, companyId);

    const { data: regularApps, error: regularError } = await supabase
      .from('job_applications')
      .select(`
        application_id,
        status,
        applied_at,
        applicant_id,
        applicant_profile (
          first_name,
          last_name,
          email,
          phone_number,
          applicant_code,
          status
        )
      `)
      .eq('job_posting_id', jobPostingId)
      .order('applied_at', { ascending: false });

    if (regularError) throw new InternalServerErrorException(regularError.message);

    const { data: sfiaApps, error: sfiaError } = await supabase
      .from('job_application_sfia')
      .select('application_id, status, application_timestamp, applicant_id')
      .eq('job_posting_id', jobPostingId)
      .order('application_timestamp', { ascending: false });

    if (sfiaError) {
      this.logger.warn(`Unable to fetch SFIA applications for job ${jobPostingId}: ${sfiaError.message}`);
    }

    const regularIds = new Set((regularApps ?? []).map((a: { application_id: string }) => a.application_id));

    const uniqueSfiaApps = (sfiaApps ?? []).filter(
      (a: { application_id: string }) => !regularIds.has(a.application_id),
    );

    let sfiaProfiles: ApplicantProfileRow[] = [];
    if (uniqueSfiaApps.length > 0) {
      const applicantIds = uniqueSfiaApps.map((a: { applicant_id: string }) => a.applicant_id);
      const { data: profiles } = await supabase
        .from('applicant_profile')
        .select('applicant_id, first_name, last_name, email, phone_number, applicant_code, status')
        .in('applicant_id', applicantIds);
      sfiaProfiles = (profiles ?? []) as ApplicantProfileRow[];
    }

    const profileMap = new Map(sfiaProfiles.map((p) => [p.applicant_id, p]));

    const normalizedSfiaApps = uniqueSfiaApps.map(
      (a: { application_id: string; status: string; application_timestamp: string; applicant_id: string }) => ({
        application_id: a.application_id,
        status: a.status?.toLowerCase() ?? 'submitted',
        applied_at: a.application_timestamp,
        applicant_id: a.applicant_id,
        applicant_profile: profileMap.get(a.applicant_id) ?? null,
      }),
    );

    const all = [...(regularApps ?? []), ...normalizedSfiaApps].sort(
      (a, b) => new Date(b.applied_at).getTime() - new Date(a.applied_at).getTime(),
    );

    return all.filter((a: any) => {
      const profile = a.applicant_profile as { status?: string } | null;
      return profile?.status !== 'converted_employee';
    });
  }

  async getRankedCandidates(
    jobPostingId: string,
    companyId: string,
    query: GetRankedCandidatesDto,
  ) {
    const mode: RankingMode = query.mode ?? 'sfia';
    const limit = query.limit ?? 20;

    const job = await this.findOnePosting(jobPostingId, companyId);
    const applications = await this.getRankedApplicationRows(jobPostingId, companyId);
    const demandSkills = await this.getJobDemandSkills(jobPostingId);

    const ranked = await this.buildRankedCandidates(
      jobPostingId,
      applications,
      demandSkills,
    );

    const sfiaRanked = ranked.map((candidate, index) => ({
      ...candidate,
      sfia_rank: index + 1,
    }));

    const manuallyRanked = this.sortCandidatesByMode(sfiaRanked, mode).map(
      (candidate, index) => ({
        ...candidate,
        effective_rank: index + 1,
      }),
    );

    return {
      job_posting_id: jobPostingId,
      title: job.title,
      ranking_mode: mode,
      total_candidates: manuallyRanked.length,
      top_count: Math.min(limit, manuallyRanked.length),
      required_skill_count: demandSkills.length,
      candidates: manuallyRanked.slice(0, limit),
    };
  }

  async saveManualRanking(
    jobPostingId: string,
    companyId: string,
    performedBy: string,
    rankings: ManualRankingItemDto[],
  ) {
    const supabase = this.supabaseService.getClient();

    const jobPosting = await this.findOnePosting(jobPostingId, companyId);

    const { data: applications, error: applicationsError } = await supabase
      .from('job_application_sfia')
      .select('application_id, manual_rank_position')
      .eq('job_posting_id', jobPostingId);

    if (applicationsError) {
      throw new InternalServerErrorException(applicationsError.message);
    }

    const validApplicationIds = new Set(
      (applications ?? []).map((row: { application_id: string }) => row.application_id),
    );

    const uniqueIds = new Set<string>();
    const uniqueRanks = new Set<number>();
    for (const item of rankings) {
      if (!validApplicationIds.has(item.application_id)) {
        throw new BadRequestException(
          `Application ${item.application_id} does not belong to this job posting`,
        );
      }
      if (uniqueIds.has(item.application_id)) {
        throw new BadRequestException('Duplicate application_id in manual ranking payload');
      }
      if (uniqueRanks.has(item.rank)) {
        throw new BadRequestException('Duplicate rank values are not allowed');
      }
      uniqueIds.add(item.application_id);
      uniqueRanks.add(item.rank);
    }

    const updates = rankings.map((item) =>
      supabase
        .from('job_application_sfia')
        .update({ manual_rank_position: item.rank, ranking_mode: 'MANUAL' })
        .eq('job_posting_id', jobPostingId)
        .eq('application_id', item.application_id),
    );

    const results = await Promise.all(updates);
    const failed = results.find((result) => result.error);
    if (failed?.error) {
      throw new InternalServerErrorException(failed.error.message);
    }

    const previousRankMap = new Map(
      (applications ?? []).map((row: { application_id: string; manual_rank_position: number | null }) => [
        row.application_id,
        row.manual_rank_position,
      ]),
    );

    const historyRows = rankings.map((item) => ({
      history_id: crypto.randomUUID(),
      application_id: item.application_id,
      performed_by: performedBy,
      previous_rank: previousRankMap.get(item.application_id) ?? null,
      new_rank: item.rank,
      changed_at: new Date().toISOString(),
    }));

    const { error: historyError } = await supabase
      .from('manual_ranking_history')
      .insert(historyRows);

    if (historyError) {
      throw new InternalServerErrorException(historyError.message);
    }

    await this.auditService.log(
      `Manual candidate ranking saved for "${jobPosting.title}" (${rankings.length} candidate(s))`,
      performedBy,
      companyId,
    );

    return {
      message: 'Manual ranking saved successfully',
      job_posting_id: jobPostingId,
      updated_count: rankings.length,
    };
  }

  async getApplicationDetail(applicationId: string, companyId: string) {
    const supabase = this.supabaseService.getClient();

    const { data: app, error } = await supabase
      .from('job_applications')
      .select(`
        application_id, applicant_id, status, applied_at, job_posting_id,
        applicant_profile (first_name, last_name, email, phone_number, applicant_code, resume_url, resume_name, resume_uploaded_at)
      `)
      .eq('application_id', applicationId)
      .maybeSingle();

    if (error) throw new InternalServerErrorException(error.message);
    if (!app) throw new NotFoundException('Application not found');

    // Verify job belongs to this company
    await this.findOnePosting(app.job_posting_id, companyId);

    // Get answers joined with question info
    const { data: answers } = await supabase
      .from('applicant_answers')
      .select(`
        answer_id, answer_value,
        application_questions (question_id, question_text, question_type, options, sort_order)
      `)
      .eq('application_id', applicationId)
      .order('application_questions(sort_order)');

    // Get all interview schedules for this application, keyed by stage
    const { data: schedules } = await supabase
      .from('interview_schedules')
      .select('application_id, stage, scheduled_date, scheduled_time, duration_minutes, format, location, meeting_link, interviewer_name, interviewer_title, notes, created_at, applicant_response, applicant_response_note, applicant_responded_at')
      .eq('application_id', applicationId)
      .order('created_at', { ascending: false });

    const interview_schedules: Record<string, any> = {};
    for (const s of (schedules ?? [])) {
      const key = s.stage ?? 'first_interview';
      interview_schedules[key] = s;
    }
    const latestSchedule = (schedules ?? [])[0] ?? null;

    // Keep legacy survey score for manual-mode views
    const { data: sfiaApp } = await supabase
      .from('job_application_sfia')
      .select('pre_screening_score')
      .eq('application_id', applicationId)
      .maybeSingle();

    const surveyScore = sfiaApp
      ? this.readNullableNumber(
          sfiaApp as unknown as Record<string, unknown>,
          ['pre_screening_score'],
        )
      : null;
    const sfiaScore = await this.getSfiaScoreForApplication(applicationId);

    // Generate a signed URL for the resume if it's stored as a file path
    const profile = (app as any).applicant_profile as Record<string, any> | null;
    if (profile?.resume_url && !profile.resume_url.startsWith('https://')) {
      const { data: urlData } = await supabase.storage
        .from('applicant-resumes')
        .createSignedUrl(profile.resume_url, 60 * 60 * 24 * 7);
      if (urlData?.signedUrl) {
        (app as any).applicant_profile = { ...profile, resume_url: urlData.signedUrl };
      }
    }

    return {
      ...app,
      answers: answers ?? [],
      interview_schedule: latestSchedule,
      interview_schedules,
      // Backward-compatible field for older frontend consumers.
      // In this schema, pre_screening_score stores screening score (0-100).
      survey_score: surveyScore,
      sfia_grade: sfiaScore.sfia_grade,
      sfia_match_percentage: sfiaScore.sfia_match_percentage,
      resume_upload: await this.getLatestResumeUpload((app as any).applicant_id, (app as any).job_posting_id),
    };
  }

  async updateApplicationStatus(
    applicationId: string,
    status: string,
    companyId: string,
    rejectionReason?: string,
  ) {
    const supabase = this.supabaseService.getClient();

    const { data: app, error: appError } = await supabase
      .from('job_applications')
      .select('application_id, job_posting_id, applicant_id')
      .eq('application_id', applicationId)
      .maybeSingle();

    if (appError) throw new InternalServerErrorException(appError.message);

    if (app) {
      await this.findOnePosting(app.job_posting_id, companyId);

      // Block re-hiring an applicant already converted to an employee
      if (status === 'hired') {
        const { data: applicantProfile } = await supabase
          .from('applicant_profile')
          .select('status')
          .eq('applicant_id', app.applicant_id)
          .maybeSingle();

        if (applicantProfile?.status === 'converted_employee') {
          throw new ConflictException(
            'This applicant has already been converted to an employee and cannot be re-hired.',
          );
        }
      }

      // Enforce one-hire-per-company constraint
      if (status === 'hired') {
        const { data: hiredApps } = await supabase
          .from('job_applications')
          .select('application_id, job_posting_id')
          .eq('applicant_id', app.applicant_id)
          .eq('status', 'hired')
          .neq('application_id', applicationId);

        if (hiredApps && hiredApps.length > 0) {
          const hiredPostingIds = hiredApps.map((a: any) => a.job_posting_id);
          const { data: inSameCompany } = await supabase
            .from('job_postings')
            .select('job_posting_id')
            .in('job_posting_id', hiredPostingIds)
            .eq('company_id', companyId)
            .limit(1);

          if (inSameCompany && inSameCompany.length > 0) {
            throw new ConflictException(
              'This applicant has already been hired for a position at this company. An applicant can only be hired once per company.',
            );
          }
        }
      }

      const updatePayload: any = { status };
      if (status.toLowerCase() === 'rejected' && rejectionReason) {
        updatePayload.rejection_reason = rejectionReason;
      }

      const { error } = await supabase
        .from('job_applications')
        .update(updatePayload)
        .eq('application_id', applicationId);

      if (error) throw new InternalServerErrorException(error.message);

      // When an applicant is hired, auto-create their onboarding record
      if (status === 'hired') {
        await this.onboardingService.createOnboardingRecord({
          applicationId: app.application_id,
          applicantId:   app.applicant_id,
          jobPostingId:  app.job_posting_id,
          companyId,
        });
        await this.onboardingService.createApplicantSession({
          applicantId:  app.applicant_id,
          jobPostingId: app.job_posting_id,
          companyId,
        });
        await supabase
          .from('applicant_profile')
          .update({ status: 'onboarding' })
          .eq('applicant_id', app.applicant_id);
      }

      // Send applicant notification for key status changes
      const statusMessages: Record<string, string> = {
        shortlisted:          'Great news! Your application has been shortlisted.',
        rejected:             "Thank you for applying. Unfortunately, we won't be moving forward at this time.",
        hold:                 "Your application is currently on hold. We'll be in touch soon.",
        first_interview:      'You have been scheduled for a first interview!',
        technical_interview:  'You have been scheduled for a technical interview!',
        final_interview:      'You have been scheduled for a final interview!',
        hired:                "Congratulations! We're excited to welcome you to the team!",
      };
      const notifMessage = statusMessages[status.toLowerCase()];
      if (notifMessage) {
        try {
          await this.notificationsService.createApplicantNotification({
            applicant_id: app.applicant_id,
            message: notifMessage,
            notification_type: 'status_update',
            job_posting_id: app.job_posting_id,
          });
        } catch (notifError) {
          this.logger.error(`Failed to create applicant notification: ${notifError}`);
        }
      }

      return { message: 'Application status updated' };
    }

    // Fall back to SFIA applications table
    const { data: sfiaApp, error: sfiaAppError } = await supabase
      .from('job_application_sfia')
      .select('application_id, job_posting_id')
      .eq('application_id', applicationId)
      .maybeSingle();

    if (sfiaAppError) throw new InternalServerErrorException(sfiaAppError.message);
    if (!sfiaApp) throw new NotFoundException('Application not found');

    await this.findOnePosting(sfiaApp.job_posting_id, companyId);

    const { error: sfiaUpdateError } = await supabase
      .from('job_application_sfia')
      .update({ status: status.toUpperCase() })
      .eq('application_id', applicationId);

    if (sfiaUpdateError) throw new InternalServerErrorException(sfiaUpdateError.message);
    return { message: 'Application status updated' };
  }

  async scheduleInterview(applicationId: string, dto: ScheduleInterviewDto, companyId: string) {
    const supabase = this.supabaseService.getClient();

    // Verify application belongs to this company
    const { data: app, error: appError } = await supabase
      .from('job_applications')
      .select('application_id, job_posting_id, applicant_id, status')
      .eq('application_id', applicationId)
      .maybeSingle();

    if (appError) throw new InternalServerErrorException(appError.message);
    if (!app) throw new NotFoundException('Application not found');

    await this.findOnePosting(app.job_posting_id, companyId);

    const stage = dto.stage ?? 'first_interview';

    const { data: existingSchedule } = await supabase
      .from('interview_schedules')
      .select('schedule_id')
      .eq('application_id', applicationId)
      .eq('stage', stage)
      .maybeSingle();
    const isReschedule = !!existingSchedule;

    const scheduleId = crypto.randomUUID();
    const { error: insertError } = await supabase
      .from('interview_schedules')
      .upsert({
        schedule_id:        scheduleId,
        application_id:     applicationId,
        company_id:         companyId,
        stage,
        scheduled_date:     dto.scheduled_date,
        scheduled_time:     dto.scheduled_time,
        duration_minutes:   dto.duration_minutes,
        format:             dto.format,
        location:           dto.location ?? null,
        meeting_link:       dto.meeting_link ?? null,
        interviewer_name:   dto.interviewer_name,
        interviewer_title:  dto.interviewer_title ?? null,
        notes:              dto.notes ?? null,
        scheduled_by_email: dto.scheduled_by_email ?? null,
        applicant_response:      null,
        applicant_response_note: null,
        applicant_responded_at:  null,
        updated_at:         new Date().toISOString(),
      }, { onConflict: 'application_id,stage' });

    if (insertError) throw new InternalServerErrorException(insertError.message);

    await supabase
      .from('job_applications')
      .update({ status: stage })
      .eq('application_id', applicationId);

    // Fetch applicant info for the email
    const { data: profile } = await supabase
      .from('applicant_profile')
      .select('first_name, last_name, email')
      .eq('applicant_id', app.applicant_id)
      .maybeSingle();

    const { data: posting } = await supabase
      .from('job_postings')
      .select('title')
      .eq('job_posting_id', app.job_posting_id)
      .maybeSingle();

    if (profile?.email) {
      const applicantName = [profile.first_name, profile.last_name].filter(Boolean).join(' ') || 'Applicant';
      const stageLabelMap: Record<string, string> = {
        first_interview:     '1st Interview',
        technical_interview: 'Technical Interview',
        final_interview:     'Final Interview',
      };
      await this.mailService.sendInterviewScheduleEmail({
        to:               profile.email,
        applicantName,
        jobTitle:         posting?.title ?? 'the position',
        stageLabel:       stageLabelMap[stage] ?? stage,
        isReschedule,
        scheduledDate:    dto.scheduled_date,
        scheduledTime:    dto.scheduled_time,
        durationMinutes:  dto.duration_minutes,
        format:           dto.format,
        location:         dto.location,
        meetingLink:      dto.meeting_link,
        interviewerName:  dto.interviewer_name,
        interviewerTitle: dto.interviewer_title,
        notes:            dto.notes,
      });
    }

    await this.auditService.log(
      `Interview scheduled for application ${applicationId} on ${dto.scheduled_date} at ${dto.scheduled_time}`,
      'system',
      companyId,
    );

    return { message: 'Interview scheduled and email sent', schedule_id: scheduleId };
  }

  async cancelInterviewSchedule(applicationId: string, stage: string, companyId: string, reason?: string) {
    const supabase = this.supabaseService.getClient();

    const { data: app, error: appError } = await supabase
      .from('job_applications')
      .select('application_id, job_posting_id, applicant_id')
      .eq('application_id', applicationId)
      .maybeSingle();

    if (appError) throw new InternalServerErrorException(appError.message);
    if (!app) throw new NotFoundException('Application not found');

    await this.findOnePosting(app.job_posting_id, companyId);

    // Find the schedule for this specific stage
    const { data: schedule } = await supabase
      .from('interview_schedules')
      .select('scheduled_date, scheduled_time, duration_minutes, format')
      .eq('application_id', applicationId)
      .eq('stage', stage)
      .maybeSingle();

    if (!schedule) {
      // No schedule found — nothing to cancel, just return success
      return { message: 'No schedule found for this stage' };
    }

    // Delete the schedule row for this stage
    const { error: deleteError } = await supabase
      .from('interview_schedules')
      .delete()
      .eq('application_id', applicationId)
      .eq('stage', stage);

    if (deleteError) throw new InternalServerErrorException(deleteError.message);

    // Send cancellation email to applicant
    const { data: profile } = await supabase
      .from('applicant_profile')
      .select('first_name, last_name, email')
      .eq('applicant_id', app.applicant_id)
      .maybeSingle();

    const { data: posting } = await supabase
      .from('job_postings')
      .select('title')
      .eq('job_posting_id', app.job_posting_id)
      .maybeSingle();

    const stageLabelMap: Record<string, string> = {
      first_interview:     '1st Interview',
      technical_interview: 'Technical Interview',
      final_interview:     'Final Interview',
    };

    if (profile?.email) {
      const applicantName = [profile.first_name, profile.last_name].filter(Boolean).join(' ') || 'Applicant';
      await this.mailService.sendInterviewCancellationEmail({
        to:            profile.email,
        applicantName,
        jobTitle:      posting?.title ?? 'the position',
        scheduledDate: schedule.scheduled_date,
        scheduledTime: schedule.scheduled_time,
        stageLabel:    stageLabelMap[stage] ?? stage,
        reason:        reason ?? null,
      });
    }

    await this.auditService.log(
      `Interview schedule cancelled for application ${applicationId}, stage: ${stage}`,
      'system',
      companyId,
    );

    return { message: 'Interview schedule cancelled and applicant notified' };
  }

  async resendInterviewEmail(applicationId: string, companyId: string) {
    const supabase = this.supabaseService.getClient();

    const { data: app, error: appError } = await supabase
      .from('job_applications')
      .select('application_id, job_posting_id, applicant_id')
      .eq('application_id', applicationId)
      .maybeSingle();

    if (appError) throw new InternalServerErrorException(appError.message);
    if (!app) throw new NotFoundException('Application not found');

    await this.findOnePosting(app.job_posting_id, companyId);

    const { data: schedule, error: schedError } = await supabase
      .from('interview_schedules')
      .select('scheduled_date, scheduled_time, duration_minutes, format, location, meeting_link, interviewer_name, interviewer_title, notes')
      .eq('application_id', applicationId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (schedError) throw new InternalServerErrorException(schedError.message);
    if (!schedule) throw new NotFoundException('No interview schedule found for this application');

    const { data: profile } = await supabase
      .from('applicant_profile')
      .select('first_name, last_name, email')
      .eq('applicant_id', app.applicant_id)
      .maybeSingle();

    const { data: posting } = await supabase
      .from('job_postings')
      .select('title')
      .eq('job_posting_id', app.job_posting_id)
      .maybeSingle();

    if (!profile?.email) throw new NotFoundException('Applicant email not found');

    const applicantName = [profile.first_name, profile.last_name].filter(Boolean).join(' ') || 'Applicant';
    await this.mailService.sendInterviewScheduleEmail({
      to:               profile.email,
      applicantName,
      jobTitle:         posting?.title ?? 'the position',
      scheduledDate:    schedule.scheduled_date,
      scheduledTime:    schedule.scheduled_time,
      durationMinutes:  schedule.duration_minutes,
      format:           schedule.format,
      location:         schedule.location,
      meetingLink:      schedule.meeting_link,
      interviewerName:  schedule.interviewer_name,
      interviewerTitle: schedule.interviewer_title,
      notes:            schedule.notes,
    });

    return { message: 'Interview email resent successfully' };
  }

  // ---------------------------------------------------------------------------
  // Applicant interview schedule & response methods
  // ---------------------------------------------------------------------------

  async getMyInterviewSchedules(applicantId: string) {
    const supabase = this.supabaseService.getClient();

    const { data: apps, error: appsError } = await supabase
      .from('job_applications')
      .select('application_id, status, job_postings (title, job_posting_id)')
      .eq('applicant_id', applicantId);

    if (appsError) throw new InternalServerErrorException(appsError.message);
    if (!apps?.length) return [];

    const appIds = apps.map((a) => a.application_id);

    const { data: schedules, error: schedError } = await supabase
      .from('interview_schedules')
      .select('schedule_id, application_id, stage, scheduled_date, scheduled_time, duration_minutes, format, location, meeting_link, interviewer_name, interviewer_title, notes, created_at, applicant_response, applicant_response_note, applicant_responded_at')
      .in('application_id', appIds)
      .order('created_at', { ascending: false });

    if (schedError) throw new InternalServerErrorException(schedError.message);

    const appMap = new Map(apps.map((a) => [a.application_id, a]));

    return (schedules ?? []).map((s) => ({
      ...s,
      job_title:          (appMap.get(s.application_id) as any)?.job_postings?.title ?? '',
      application_status: (appMap.get(s.application_id) as any)?.status ?? '',
    }));
  }

  async respondToInterview(applicationId: string, applicantId: string, dto: InterviewResponseDto) {
    const supabase = this.supabaseService.getClient();

    const { data: app, error: appError } = await supabase
      .from('job_applications')
      .select('application_id, job_posting_id, applicant_id, job_postings (title)')
      .eq('application_id', applicationId)
      .eq('applicant_id', applicantId)
      .maybeSingle();

    if (appError) throw new InternalServerErrorException(appError.message);
    if (!app) throw new NotFoundException('Application not found');

    // If the applicant specifies a stage, update that stage's schedule.
    // Otherwise, update the most recent pending schedule (applicant_response IS NULL).
    const baseUpdate = supabase
      .from('interview_schedules')
      .update({
        applicant_response:      dto.action,
        applicant_response_note: dto.note ?? null,
        applicant_responded_at:  new Date().toISOString(),
      })
      .eq('application_id', applicationId);

    const { data: schedule, error: schedError } = await (
      dto.stage
        ? baseUpdate.eq('stage', dto.stage)
        : baseUpdate.is('applicant_response', null)
    )
      .select('scheduled_by_email, scheduled_date, scheduled_time, stage')
      .maybeSingle();

    if (schedError) throw new InternalServerErrorException(schedError.message);
    if (!schedule) throw new NotFoundException('No pending interview schedule found for this application');

    const { data: profile } = await supabase
      .from('applicant_profile')
      .select('first_name, last_name, email')
      .eq('applicant_id', applicantId)
      .maybeSingle();

    if (schedule.scheduled_by_email && profile?.email) {
      const applicantName = [profile.first_name, profile.last_name].filter(Boolean).join(' ') || 'Applicant';
      this.mailService.sendApplicantResponseEmail({
        to:             schedule.scheduled_by_email,
        applicantName,
        applicantEmail: profile.email,
        jobTitle:       (app.job_postings as any)?.title ?? 'the position',
        action:         dto.action,
        note:           dto.note,
        scheduledDate:  schedule.scheduled_date,
        scheduledTime:  schedule.scheduled_time,
      }).catch(() => {});
    }

    return { message: 'Response recorded' };
  }

  async getHRInterviewCalendar(companyId: string) {
    const supabase = this.supabaseService.getClient();

    const { data, error } = await supabase
      .from('interview_schedules')
      .select(`
        schedule_id, application_id, scheduled_date, scheduled_time, duration_minutes,
        format, location, meeting_link, interviewer_name, interviewer_title,
        applicant_response, created_at,
        job_applications (
          status, applicant_id,
          job_postings (title, job_posting_id)
        )
      `)
      .eq('company_id', companyId)
      .order('scheduled_date', { ascending: true });

    if (error) throw new InternalServerErrorException(error.message);

    const applicantIds = [
      ...new Set(
        (data ?? [])
          .map((s) => (s.job_applications as any)?.applicant_id)
          .filter(Boolean),
      ),
    ];

    const { data: profiles } = applicantIds.length
      ? await supabase
          .from('applicant_profile')
          .select('applicant_id, first_name, last_name, email')
          .in('applicant_id', applicantIds)
      : { data: [] };

    const profileMap = new Map((profiles ?? []).map((p) => [p.applicant_id, p]));

    return (data ?? []).map((s) => {
      const app     = s.job_applications as any;
      const profile = profileMap.get(app?.applicant_id);
      return {
        schedule_id:        s.schedule_id,
        application_id:     s.application_id,
        scheduled_date:     s.scheduled_date,
        scheduled_time:     s.scheduled_time,
        duration_minutes:   s.duration_minutes,
        format:             s.format,
        location:           s.location,
        meeting_link:       s.meeting_link,
        interviewer_name:   s.interviewer_name,
        interviewer_title:  s.interviewer_title,
        applicant_response: s.applicant_response,
        created_at:         s.created_at,
        application_status: app?.status,
        job_title:          app?.job_postings?.title ?? '',
        job_posting_id:     app?.job_postings?.job_posting_id ?? '',
        first_name:         profile?.first_name ?? '',
        last_name:          profile?.last_name  ?? '',
        email:              profile?.email       ?? '',
      };
    });
  }

  async getHRInterviewNotifications(companyId: string) {
    const supabase = this.supabaseService.getClient();

    const { data, error } = await supabase
      .from('interview_schedules')
      .select(`
        schedule_id, application_id, scheduled_date, scheduled_time, format,
        interviewer_name, applicant_response, applicant_response_note, applicant_responded_at,
        job_applications (
          applicant_id,
          job_postings (title)
        )
      `)
      .eq('company_id', companyId)
      .not('applicant_response', 'is', null)
      .order('applicant_responded_at', { ascending: false });

    if (error) throw new InternalServerErrorException(error.message);

    const applicantIds = [
      ...new Set(
        (data ?? [])
          .map((s) => (s.job_applications as any)?.applicant_id)
          .filter(Boolean),
      ),
    ];

    const { data: profiles } = applicantIds.length
      ? await supabase
          .from('applicant_profile')
          .select('applicant_id, first_name, last_name, email')
          .in('applicant_id', applicantIds)
      : { data: [] };

    const profileMap = new Map((profiles ?? []).map((p) => [p.applicant_id, p]));

    return (data ?? []).map((s) => {
      const app     = s.job_applications as any;
      const profile = profileMap.get(app?.applicant_id);
      return {
        schedule_id:             s.schedule_id,
        application_id:          s.application_id,
        scheduled_date:          s.scheduled_date,
        scheduled_time:          s.scheduled_time,
        format:                  s.format,
        interviewer_name:        s.interviewer_name,
        applicant_response:      s.applicant_response,
        applicant_response_note: s.applicant_response_note,
        applicant_responded_at:  s.applicant_responded_at,
        job_title:               app?.job_postings?.title ?? '',
        first_name:              profile?.first_name ?? '',
        last_name:               profile?.last_name  ?? '',
        email:                   profile?.email       ?? '',
      };
    });
  }

  async getSurveyScore(applicationId: string) {
    const supabase = this.supabaseService.getClient();

    const { data: application, error: appError } = await supabase
      .from('job_applications')
      .select('application_id, applicant_id')
      .eq('application_id', applicationId)
      .maybeSingle();

    if (appError) throw new InternalServerErrorException(appError.message);
    if (!application) throw new NotFoundException('Application not found');

    const { data: sfiaApp, error: sfiaError } = await supabase
      .from('job_application_sfia')
      .select('pre_screening_score')
      .eq('application_id', applicationId)
      .maybeSingle();

    if (sfiaError) throw new InternalServerErrorException(sfiaError.message);

    const surveyScore = sfiaApp
      ? this.readNullableNumber(
          sfiaApp as unknown as Record<string, unknown>,
          ['pre_screening_score'],
        ) ?? 0
      : 0;

    return { 
      applicationId: application.application_id,
      applicantId: application.applicant_id,
      surveyScore,
    };
  }

  // Calculate survey score from applicant answers with weighted scoring
  private async calculateSurveyScore(applicationId: string): Promise<number> {
    const supabase = this.supabaseService.getClient();

    const { data: answers, error } = await supabase
      .from('applicant_answers')
      .select(`answer_value, application_questions (question_type, options, sort_order, is_required)`)
      .eq('application_id', applicationId);

    if (error) {
      console.error('Error fetching answers:', error.message);
      return 0;
    }

    if (!answers || answers.length === 0) return 0;

    let totalWeightedScore = 0;
    let totalWeight = 0;

    answers.forEach((record: any) => {
      const val = record.answer_value;
      const question = record.application_questions;
      
      if (!val || !question) return;

      let score = 0;
      // Required questions have higher weight
      let weight = question.is_required ? 1.5 : 1.0;

      // Normalize different answer types to 0-100 scale
      if (question.question_type === 'text') {
        // Enhanced text scoring: consider both length and word count
        const trimmedText = val.trim();
        const wordCount = trimmedText.split(/\s+/).length;
        const charCount = trimmedText.length;
        
        // Score based on both word count and character count
        // Ideal: 50-150 words or 250-750 characters
        const wordScore = Math.min(100, (wordCount / 75) * 100); // 75 words = 100 points
        const charScore = Math.min(100, (charCount / 500) * 100); // 500 chars = 100 points
        
        // Take the average of both scores
        score = (wordScore + charScore) / 2;
        
        // Bonus points for punctuation (indicates structured response)
        const punctuationCount = (trimmedText.match(/[.!?]/g) || []).length;
        if (punctuationCount > 0) {
          score = Math.min(100, score + punctuationCount * 2);
        }
      } else if (question.question_type === 'multiple_choice') {
        // Multiple choice: options are stored as strings in the options array
        if (question.options && Array.isArray(question.options)) {
          const idx = question.options.indexOf(val);
          if (idx !== -1) {
            // Assume options are ordered from least to most desirable
            // Give full points for last option, scaled down for earlier options
            const optionCount = question.options.length;
            score = ((idx + 1) / optionCount) * 100;
          } else {
            // If value not in options, try parsing as number
            const numVal = parseFloat(val);
            score = isNaN(numVal) ? 50 : Math.min(100, numVal); // Default 50 if unparseable
          }
        } else {
          const numVal = parseFloat(val);
          score = isNaN(numVal) ? 50 : Math.min(100, numVal);
        }
      } else if (question.question_type === 'checkbox') {
        // Checkbox: parse as JSON array and count selected items
        try {
          const selected = JSON.parse(val);
          if (Array.isArray(selected) && selected.length > 0) {
            const optionCount = question.options?.length || selected.length;
            // Score based on percentage of options selected
            // But penalize selecting too many or too few
            const selectionRatio = selected.length / optionCount;
            
            // Optimal selection is 40-60% of options
            if (selectionRatio >= 0.4 && selectionRatio <= 0.6) {
              score = 100;
            } else if (selectionRatio < 0.4) {
              // Too few selected
              score = (selectionRatio / 0.4) * 100;
            } else {
              // Too many selected
              score = 100 - ((selectionRatio - 0.6) / 0.4) * 30; // Max 30 point penalty
            }
          } else {
            score = 0;
          }
        } catch {
          // If parsing fails, try numeric value
          const numVal = parseFloat(val);
          score = isNaN(numVal) ? 0 : Math.min(100, numVal);
        }
      } else {
        // Default: try to parse as number
        const numVal = parseFloat(val);
        score = isNaN(numVal) ? 50 : Math.min(100, numVal);
      }

      totalWeightedScore += score * weight;
      totalWeight += weight;
    });

    // Normalize to 0-100 range
    const normalizedScore = totalWeight > 0 ? (totalWeightedScore / totalWeight) : 0;
    return Math.round(normalizedScore * 100) / 100;
  }

  // ---------------------------------------------------------------------------
  // Public methods — no auth required
  // ---------------------------------------------------------------------------

  async getPublicCareersBySlug(slug: string) {
    const supabase = this.supabaseService.getClient();

    const { data: company } = await supabase
      .from('company')
      .select('company_id, company_name, slug')
      .eq('slug', slug)
      .maybeSingle();

    if (!company) throw new NotFoundException('Company not found');

    const { data: jobs } = await supabase
      .from('job_postings')
      .select('job_posting_id, title, description, location, employment_type, salary_range, posted_at, closes_at')
      .eq('company_id', company.company_id)
      .eq('status', 'open')
      .or('closes_at.is.null,closes_at.gt.' + new Date().toISOString())
      .order('posted_at', { ascending: false });

    return {
      company_id: company.company_id,
      company_name: company.company_name,
      slug: company.slug,
      jobs: jobs ?? [],
    };
  }

  // ---------------------------------------------------------------------------
  // Applicant-facing methods — scoped by companyId from applicant JWT
  // ---------------------------------------------------------------------------

  async getOpenJobsForApplicant(companyId: string | null) {
    const supabase = this.supabaseService.getClient();

    let query = supabase
      .from('job_postings')
      .select('*')
      .eq('status', 'open')
      .or('closes_at.is.null,closes_at.gt.' + new Date().toISOString())
      .order('posted_at', { ascending: false });

    if (companyId) {
      query = query.eq('company_id', companyId);
    }

    const { data, error } = await query;

    if (error) throw new InternalServerErrorException(error.message);
    return data ?? [];
  }

  async applyToJob(jobPostingId: string, applicantId: string, companyId: string | null, dto: CreateApplicationDto) {
    if (!companyId) {
      throw new ForbiddenException(
        'Your account is not linked to a company. Please register via the company-specific link.',
      );
    }

    const supabase = this.supabaseService.getClient();

    const { data: job } = await supabase
      .from('job_postings')
      .select('job_posting_id, status')
      .eq('job_posting_id', jobPostingId)
      .eq('company_id', companyId)
      .maybeSingle();

    if (!job) throw new NotFoundException('Job posting not found');
    if (job.status !== 'open') throw new ForbiddenException('This job posting is no longer accepting applications');

    // Block hired/onboarding applicants from applying to new jobs
    const { data: applicantProfile } = await supabase
      .from('applicant_profile')
      .select('status')
      .eq('applicant_id', applicantId)
      .maybeSingle();
    if (applicantProfile?.status === 'onboarding' || applicantProfile?.status === 'converted_employee') {
      throw new ForbiddenException('You have already been hired and cannot apply to new positions.');
    }

    const { data: existing } = await supabase
      .from('job_applications')
      .select('application_id')
      .eq('job_posting_id', jobPostingId)
      .eq('applicant_id', applicantId)
      .maybeSingle();

    if (existing) throw new ConflictException('You have already submitted an application for this role.');

    const application_id = crypto.randomUUID();
    const { data, error } = await supabase
      .from('job_applications')
      .insert({
        application_id,
        job_posting_id: jobPostingId,
        applicant_id: applicantId,
        status: 'submitted',
        applied_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) throw new InternalServerErrorException(error.message);

    await this.ensureSfiaApplicationRow({
      applicationId: application_id,
      applicantId,
      jobPostingId,
      status: 'submitted',
      appliedAt: data.applied_at,
    });

    // Save answers if provided
    if (dto.answers && dto.answers.length > 0) {
      const answerRows = dto.answers.map((a) => ({
        answer_id: crypto.randomUUID(),
        application_id,
        question_id: a.question_id,
        answer_value: a.answer_value ?? null,
      }));

      const { error: answerError } = await supabase.from('applicant_answers').insert(answerRows);
      if (answerError) {
        console.error('Failed to save applicant answers:', answerError.message);
      }

      // Calculate survey score after answers are saved
      const surveyScore = await this.calculateSurveyScore(application_id);
      const { error: scoreError } = await supabase
        .from('job_application_sfia')
        .update({ pre_screening_score: surveyScore })
        .eq('application_id', application_id);

      if (scoreError) {
        console.error('Failed to save survey score:', scoreError.message);
      }
    }

    // Extract SFIA skills from the uploaded resume, then score
    if (dto.resume_storage_path) {
      try {
        const resumeBuffer = await this.downloadResumeBuffer(dto.resume_storage_path);
        if (resumeBuffer) {
          const mimeType = dto.resume_storage_path.toLowerCase().endsWith('.pdf')
            ? 'application/pdf'
            : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
          const resumeText = await this.extractResumeText(resumeBuffer, mimeType);
          if (resumeText.trim().length > 0) {
            const allSkills = await this.getAllSfiaSkills();
            const matches = this.matchSkillsFromText(resumeText, allSkills);
            await this.populateCandidateSkillScores(application_id, matches);
          }
        }
      } catch (err) {
        this.logger.warn(
          `SFIA skill extraction failed for application ${application_id}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    await this.calculateAndCacheSfiaScoreForApplication(
      jobPostingId,
      application_id,
      applicantId,
    );

    return {
      ...data,
      resume_upload: dto.resume_storage_path && dto.resume_file_name
        ? {
            file_name: dto.resume_file_name,
            storage_path: dto.resume_storage_path,
            signed_url: '',
          }
        : await this.getLatestResumeUpload(applicantId, jobPostingId),
    };
  }

  async getMyApplicationDetail(applicationId: string, applicantId: string) {
    const supabase = this.supabaseService.getClient();

    const { data: app, error } = await supabase
      .from('job_applications')
      .select(`
        application_id, applicant_id, status, applied_at, job_posting_id,
        applicant_profile (first_name, last_name, email, phone_number, applicant_code),
        job_postings (title, description, location, employment_type, salary_range, status, posted_at, closes_at)
      `)
      .eq('application_id', applicationId)
      .eq('applicant_id', applicantId)
      .maybeSingle();

    if (error) throw new InternalServerErrorException(error.message);
    if (!app) throw new NotFoundException('Application not found');

    const { data: answers } = await supabase
      .from('applicant_answers')
      .select(`
        answer_id, answer_value,
        application_questions (question_id, question_text, question_type, options, sort_order)
      `)
      .eq('application_id', applicationId)
      .order('application_questions(sort_order)');

    const { data: schedules } = await supabase
      .from('interview_schedules')
      .select('schedule_id, application_id, stage, scheduled_date, scheduled_time, duration_minutes, format, location, meeting_link, interviewer_name, interviewer_title, notes, created_at, updated_at, applicant_response, applicant_response_note, applicant_responded_at')
      .eq('application_id', applicationId)
      .order('created_at', { ascending: false });

    const interview_schedules: Record<string, any> = {};
    for (const s of (schedules ?? [])) {
      const key = s.stage ?? 'first_interview';
      interview_schedules[key] = s;
    }
    const latestSchedule = (schedules ?? [])[0] ?? null;

    // Keep legacy survey score for manual-mode views
    const { data: sfiaApp } = await supabase
      .from('job_application_sfia')
      .select('pre_screening_score')
      .eq('application_id', applicationId)
      .maybeSingle();

    const surveyScore = sfiaApp
      ? this.readNullableNumber(
          sfiaApp as unknown as Record<string, unknown>,
          ['pre_screening_score'],
        )
      : null;
    const sfiaScore = await this.getSfiaScoreForApplication(applicationId);

    return {
      ...app,
      answers: answers ?? [],
      interview_schedule: latestSchedule,
      interview_schedules,
      survey_score: surveyScore,
      sfia_grade: sfiaScore.sfia_grade,
      sfia_match_percentage: sfiaScore.sfia_match_percentage,
      resume_upload: await this.getLatestResumeUpload(app.applicant_id, app.job_posting_id),
    };
  }

  private async getSfiaScoreForApplication(applicationId: string) {
    const supabase = this.supabaseService.getClient();
    const { data, error } = await supabase
      .from('job_application_sfia')
      .select('sfia_matching_percentage')
      .eq('application_id', applicationId)
      .maybeSingle();

    if (error) throw new InternalServerErrorException(error.message);

    const percentage = data?.sfia_matching_percentage == null
      ? null
      : normalizeNumber(data.sfia_matching_percentage);

    if (percentage == null || !Number.isFinite(percentage)) {
      const { data: application, error: applicationError } = await supabase
        .from('job_applications')
        .select('job_posting_id, applicant_id')
        .eq('application_id', applicationId)
        .maybeSingle();

      if (applicationError) throw new InternalServerErrorException(applicationError.message);
      if (!application) {
        return {
          sfia_match_percentage: null,
          sfia_grade: null,
          sfia_assessment_status: 'not_assessed' as const,
        };
      }

      const demandSkills = await this.getJobDemandSkills(application.job_posting_id);
      if (demandSkills.length === 0) {
        return {
          sfia_match_percentage: null,
          sfia_grade: null,
          sfia_assessment_status: 'not_configured' as const,
        };
      }

      const supplySkills = await this.getCandidateSupplySkills([
        {
          application_id: applicationId,
          job_posting_id: application.job_posting_id,
          applicant_id: application.applicant_id,
          status: 'submitted',
          application_timestamp: new Date().toISOString(),
          pre_screening_score: null,
          sfia_matching_percentage: null,
          manual_rank_position: null,
          ranking_mode: 'sfia',
        },
      ]);

      const computed = this.computeSfiaScore(demandSkills, supplySkills);
      const computedPercentage = computed.relevancePercentage;

      if (computed.maxPossiblePoints <= 0) {
        return {
          sfia_match_percentage: null,
          sfia_grade: null,
          sfia_assessment_status: 'not_configured' as const,
        };
      }

      const fallbackGrade = computedPercentage <= 0
        ? 1
        : Math.max(1, Math.min(7, Math.ceil((computedPercentage / 100) * 7)));

      return {
        sfia_match_percentage: roundToTwo(computedPercentage),
        sfia_grade: fallbackGrade,
        sfia_assessment_status: 'assessed' as const,
      };
    }

    const bounded = Math.max(0, Math.min(100, percentage));
    const grade = bounded <= 0
      ? 1
      : Math.max(1, Math.min(7, Math.ceil((bounded / 100) * 7)));

    return {
      sfia_match_percentage: roundToTwo(bounded),
      sfia_grade: grade,
      sfia_assessment_status: 'assessed' as const,
    };
  }

  async getMyApplications(applicantId: string) {
    const supabase = this.supabaseService.getClient();

    const { data, error } = await supabase
      .from('job_applications')
      .select(`
        application_id,
        status,
        applied_at,
        job_posting_id,
        job_postings (
          title,
          location,
          employment_type,
          status
        )
      `)
      .eq('applicant_id', applicantId)
      .order('applied_at', { ascending: false });

    if (error) throw new InternalServerErrorException(error.message);
    return data ?? [];
  }

  private async buildRankedCandidates(
    jobPostingId: string,
    applications: RankedApplicationRow[],
    demandSkills: SfiaDemandSkill[],
  ): Promise<RankedCandidate[]> {
    const supplyRows = await this.getCandidateSupplySkills(applications);
    const applicantProfiles = await this.getApplicantProfiles(applications);
    const groupedSupply = supplyRows.reduce<Record<string, SfiaSupplySkill[]>>(
      (acc, row) => {
        acc[row.owner_key] ??= [];
        acc[row.owner_key].push(row);
        return acc;
      },
      {},
    );
    const profileByApplicantId = new Map(
      applicantProfiles.map((profile) => [profile.applicant_id, profile]),
    );

    const ranked = applications.map((application) => {
      const profile = profileByApplicantId.get(application.applicant_id);
      const supplySkills =
        groupedSupply[application.application_id] ??
        groupedSupply[application.applicant_id] ??
        [];

      const score = this.computeSfiaScore(demandSkills, supplySkills);
      void this.cacheSfiaScore(jobPostingId, application.application_id, score.relevancePercentage);

      return {
        application_id: application.application_id,
        applicant_id: application.applicant_id,
        first_name: profile?.first_name ?? '',
        last_name: profile?.last_name ?? '',
        email: profile?.email ?? '',
        phone_number: profile?.phone_number ?? null,
        applicant_code: profile?.applicant_code ?? null,
        status: application.status,
        applied_at: application.application_timestamp,
        sfia_match_percentage: score.relevancePercentage,
        sfia_rank: 0,
        manual_rank_position: normalizeNumber(application.manual_rank_position) || null,
        effective_rank: 0,
        skill_breakdown: score.breakdown,
      } satisfies RankedCandidate;
    });

    return ranked.sort((a, b) => {
      if (b.sfia_match_percentage !== a.sfia_match_percentage) {
        return b.sfia_match_percentage - a.sfia_match_percentage;
      }
      return new Date(a.applied_at).getTime() - new Date(b.applied_at).getTime();
    });
  }

  private sortCandidatesByMode(
    candidates: RankedCandidate[],
    mode: RankingMode,
  ): RankedCandidate[] {
    if (mode === 'sfia') return [...candidates];

    return [...candidates].sort((a, b) => {
      const leftRank = a.manual_rank_position ?? Number.MAX_SAFE_INTEGER;
      const rightRank = b.manual_rank_position ?? Number.MAX_SAFE_INTEGER;
      if (leftRank !== rightRank) return leftRank - rightRank;
      return a.sfia_rank - b.sfia_rank;
    });
  }

  private computeSfiaScore(
    demandSkills: SfiaDemandSkill[],
    supplySkills: SfiaSupplySkill[],
  ) {
    const skillById = new Map(
      supplySkills.map((skill) => [skill.skill_id, skill]),
    );

    const relevantDemand = demandSkills;

    const breakdown = relevantDemand.map((demandSkill) => {
      const supplySkill = skillById.get(demandSkill.skill_id);
      const supplyLevel = supplySkill?.candidate_level ?? 0;

      let points = 0;
      if (supplyLevel === demandSkill.required_level) points = 3;
      else if (supplyLevel > demandSkill.required_level) points = 1.5;

      return {
        sfia_skill_id: demandSkill.skill_id,
        skill_name: demandSkill.skill_name,
        demand_level: demandSkill.required_level,
        supply_level: supplyLevel,
        points,
        matched: points > 0,
      } satisfies SkillBreakdown;
    });

    const totalPoints = breakdown.reduce((sum, item) => sum + item.points, 0);
    const maxPossiblePoints = relevantDemand.length * 3;
    const relevancePercentage =
      maxPossiblePoints > 0
        ? roundToTwo((totalPoints / maxPossiblePoints) * 100)
        : 0;

    return {
      totalPoints,
      maxPossiblePoints,
      relevancePercentage,
      breakdown,
    };
  }

  private async getJobDemandSkills(jobPostingId: string): Promise<SfiaDemandSkill[]> {
    const supabase = this.supabaseService.getClient();
    const { data, error } = await supabase
      .from('job_posting_sfia_skill')
      .select('job_posting_skills_id, job_posting_id, skill_id, required_level, weight')
      .eq('job_posting_id', jobPostingId);

    if (error) {
      this.handleMissingSfiaSchema(error.message, 'job_posting_sfia_skill');
      throw new InternalServerErrorException(error.message);
    }

    const demandRows = (data ?? [])
      .map((row: Record<string, unknown>) => {
        const skillId = this.readFirstString(row, [
          'sfia_skill_id',
          'skill_id',
          'sfia_id',
        ]);
        if (!skillId) return null;

        return {
          skill_id: skillId,
          skill_name: skillId,
          required_level: normalizeNumber(
            this.readFirstValue(row, ['required_level', 'level']),
          ),
          weight: normalizeNumber(this.readFirstValue(row, ['weight'])),
        } satisfies SfiaDemandSkill;
      })
      .filter((row): row is SfiaDemandSkill => row !== null);

    return this.attachSkillNames(demandRows);
  }

  private async getCandidateSupplySkills(
    applications: RankedApplicationRow[],
  ): Promise<SfiaSupplySkill[]> {
    if (applications.length === 0) return [];

    const applicationIds = applications
      .map((row) => row.application_id)
      .filter((value): value is string => Boolean(value));

    if (applicationIds.length === 0) return [];

    const supabase = this.supabaseService.getClient();
    const { data, error } = await supabase
      .from('candidate_skill_score_sfia')
      .select('application_id, skill_id, candidate_level, match_score')
      .in('application_id', applicationIds);

    if (error) {
      this.handleMissingSfiaSchema(error.message, 'candidate_skill_score_sfia');
      throw new InternalServerErrorException(error.message);
    }

    const supplyRows = (data ?? [])
      .map((row: Record<string, unknown>) => {
        const ownerKey =
          this.readFirstString(row, ['application_id', 'applicant_id']) ?? '';
        const skillId = this.readFirstString(row, [
          'sfia_skill_id',
          'skill_id',
          'sfia_id',
        ]);
        if (!ownerKey || !skillId) return null;

        return {
          owner_key: ownerKey,
          skill_id: skillId,
          skill_name: skillId,
          candidate_level: normalizeNumber(
            this.readFirstValue(row, ['candidate_level', 'level']),
          ),
          match_score: this.readNullableNumber(row, ['match_score']),
        } satisfies SfiaSupplySkill;
      })
      .filter((row): row is SfiaSupplySkill => row !== null);

    return this.attachSkillNames(supplyRows);
  }

  private async getCandidateSupplySkillsForApplication(
    applicationId: string,
    applicantId: string,
  ): Promise<SfiaSupplySkill[]> {
    const supabase = this.supabaseService.getClient();
    const { data, error } = await supabase
      .from('candidate_skill_score_sfia')
      .select('application_id, skill_id, candidate_level, match_score')
      .eq('application_id', applicationId);

    if (error) {
      this.handleMissingSfiaSchema(error.message, 'candidate_skill_score_sfia');
      // Table may not exist yet — return empty so the score caches as 0 instead of failing silently
      return [];
    }

    const supplyRows = (data ?? [])
      .map((row: Record<string, unknown>) => {
        const ownerKey =
          this.readFirstString(row, ['application_id', 'applicant_id']) ??
          applicationId;
        const skillId = this.readFirstString(row, [
          'sfia_skill_id',
          'skill_id',
          'sfia_id',
        ]);
        if (!ownerKey || !skillId) return null;

        return {
          owner_key: ownerKey,
          skill_id: skillId,
          skill_name: skillId,
          candidate_level: normalizeNumber(
            this.readFirstValue(row, ['candidate_level', 'level']),
          ),
          match_score: this.readNullableNumber(row, ['match_score']),
        } satisfies SfiaSupplySkill;
      })
      .filter((row): row is SfiaSupplySkill => row !== null);

    // Fallback: if no per-application rows exist yet, allow applicant-level rows.
    if (supplyRows.length > 0) {
      return this.attachSkillNames(supplyRows);
    }

    const { data: applicantRows, error: applicantErr } = await supabase
      .from('candidate_skill_score_sfia')
      .select('application_id, skill_id, candidate_level, match_score')
      .eq('applicant_id', applicantId);

    if (applicantErr) {
      this.handleMissingSfiaSchema(applicantErr.message, 'candidate_skill_score_sfia');
      return [];
    }

    const fallbackRows = (applicantRows ?? [])
      .map((row: Record<string, unknown>) => {
        const skillId = this.readFirstString(row, [
          'sfia_skill_id',
          'skill_id',
          'sfia_id',
        ]);
        if (!skillId) return null;

        return {
          owner_key: applicationId,
          skill_id: skillId,
          skill_name: skillId,
          candidate_level: normalizeNumber(
            this.readFirstValue(row, ['candidate_level', 'level']),
          ),
          match_score: this.readNullableNumber(row, ['match_score']),
        } satisfies SfiaSupplySkill;
      })
      .filter((row): row is SfiaSupplySkill => row !== null);

    return this.attachSkillNames(fallbackRows);
  }

  private async calculateAndCacheSfiaScoreForApplication(
    jobPostingId: string,
    applicationId: string,
    applicantId: string,
  ) {
    try {
      const demandSkills = await this.getJobDemandSkills(jobPostingId);
      const supplySkills = await this.getCandidateSupplySkillsForApplication(
        applicationId,
        applicantId,
      );

      const score = this.computeSfiaScore(demandSkills, supplySkills);
      await this.cacheSfiaScore(
        jobPostingId,
        applicationId,
        score.relevancePercentage,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Unable to compute SFIA score for application ${applicationId}: ${message}`,
      );
    }
  }

  private async cacheSfiaScore(
    jobPostingId: string,
    applicationId: string,
    sfiaMatchPercentage: number,
  ) {
    const supabase = this.supabaseService.getClient();

    const { error } = await supabase
      .from('job_application_sfia')
      .update({ sfia_matching_percentage: sfiaMatchPercentage })
      .eq('job_posting_id', jobPostingId)
      .eq('application_id', applicationId);

    if (error) {
      this.logger.warn(
        `Unable to cache sfia_match_percentage for application ${applicationId}: ${error.message}`,
      );
    }
  }

  private async ensureSfiaApplicationRow(params: {
    applicationId: string;
    applicantId: string;
    jobPostingId: string;
    status: string;
    appliedAt: string;
  }) {
    const supabase = this.supabaseService.getClient();

    const { error } = await supabase.from('job_application_sfia').upsert(
      {
        application_id: params.applicationId,
        job_posting_id: params.jobPostingId,
        applicant_id: params.applicantId,
        status: params.status,
        application_timestamp: params.appliedAt,
        ranking_mode: 'SFIA',
      },
      {
        onConflict: 'application_id',
      },
    );

    if (error) {
      this.handleMissingSfiaSchema(error.message, 'job_application_sfia');
      this.logger.warn(
        `Unable to mirror application ${params.applicationId} to job_application_sfia: ${error.message}`,
      );
    }
  }

  private async getLatestResumeUpload(
    applicantId: string,
    jobPostingId: string,
  ): Promise<ApplicationResumeUploadDto | null> {
    const supabase = this.supabaseService.getClient();
    const folder = `${applicantId}/${jobPostingId}`;

    const { data: files, error } = await supabase.storage
      .from('sfia-resumes')
      .list(folder, {
        limit: 20,
        sortBy: { column: 'name', order: 'desc' },
      });

    if (error) {
      if (error.message.toLowerCase().includes('bucket')) return null;
      this.logger.warn(
        `Unable to inspect SFIA resume storage for ${folder}: ${error.message}`,
      );
      return null;
    }

    const latest = files?.find((file) => file.name);
    if (!latest) return null;

    const storagePath = `${folder}/${latest.name}`;
    const { data: signedData, error: signedError } = await supabase.storage
      .from('sfia-resumes')
      .createSignedUrl(storagePath, 60 * 60);

    if (signedError) {
      this.logger.warn(
        `Unable to sign SFIA resume ${storagePath}: ${signedError.message}`,
      );
      return {
        file_name: latest.name,
        storage_path: storagePath,
        signed_url: '',
      };
    }

    return {
      file_name: latest.name,
      storage_path: storagePath,
      signed_url: signedData.signedUrl,
    };
  }

  private readFirstValue(
    row: Record<string, unknown>,
    keys: string[],
  ): unknown {
    for (const key of keys) {
      if (row[key] !== undefined && row[key] !== null) return row[key];
    }
    return undefined;
  }

  private readFirstString(
    row: Record<string, unknown>,
    keys: string[],
  ): string | null {
    const value = this.readFirstValue(row, keys);
    return typeof value === 'string' && value.trim() !== '' ? value : null;
  }

  private readNullableNumber(
    row: Record<string, unknown>,
    keys: string[],
  ): number | null {
    const value = this.readFirstValue(row, keys);
    if (value === undefined || value === null || value === '') return null;
    const parsed = normalizeNumber(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  private async getRankedApplicationRows(
    jobPostingId: string,
    companyId: string,
  ): Promise<RankedApplicationRow[]> {
    const supabase = this.supabaseService.getClient();

    await this.findOnePosting(jobPostingId, companyId);

    const { data, error } = await supabase
      .from('job_application_sfia')
      .select(
        'application_id, job_posting_id, applicant_id, status, application_timestamp, pre_screening_score, sfia_matching_percentage, manual_rank_position, ranking_mode',
      )
      .eq('job_posting_id', jobPostingId);

    if (error) {
      this.handleMissingSfiaSchema(error.message, 'job_application_sfia');
      throw new InternalServerErrorException(error.message);
    }

    return (data ?? []) as RankedApplicationRow[];
  }

  private async getApplicantProfiles(
    applications: RankedApplicationRow[],
  ): Promise<ApplicantProfileRow[]> {
    const applicantIds = applications
      .map((row) => row.applicant_id)
      .filter((value): value is string => Boolean(value));

    if (applicantIds.length === 0) return [];

    const supabase = this.supabaseService.getClient();
    const { data, error } = await supabase
      .from('applicant_profile')
      .select('applicant_id, first_name, last_name, email, phone_number, applicant_code')
      .in('applicant_id', applicantIds);

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return (data ?? []) as ApplicantProfileRow[];
  }

  private async attachSkillNames<T extends { skill_id: string; skill_name: string }>(
    rows: T[],
  ): Promise<T[]> {
    const skillIds = [...new Set(rows.map((row) => row.skill_id).filter(Boolean))];
    if (skillIds.length === 0) return rows;

    const supabase = this.supabaseService.getClient();
    const { data, error } = await supabase
      .from('sfia_skills')
      .select('*')
      .in(this.getSkillPrimaryKeyColumn(), skillIds);

    if (error) {
      this.handleMissingSfiaSchema(error.message, 'sfia_skills');
      return rows;
    }

    const nameById = new Map<string, string>();
    for (const row of (data ?? []) as Record<string, unknown>[]) {
      const id = this.readFirstString(row, ['skill_id', 'sfia_skill_id', 'id']);
      if (!id) continue;
      const name =
        this.readFirstString(row, ['skill_name', 'name']) ??
        this.readFirstString(row, ['skill']) ??
        id;
      nameById.set(id, name);
    }

    return rows.map((row) => ({
      ...row,
      skill_name: nameById.get(row.skill_id) ?? row.skill_name,
    }));
  }

  private getSkillPrimaryKeyColumn() {
    return 'skill_id';
  }

  private handleMissingSfiaSchema(message: string, tableName: string) {
    if (message.includes('schema cache')) {
      this.logger.error(
        `SFIA ranking requires the ${tableName} table, but it is not available in the configured Supabase project.`,
      );
    }
  }

  // ─── B1: Accept Hiring Offer ───────────────────────────────────────────────

  async acceptOffer(applicationId: string, applicantId: string) {
    const supabase = this.supabaseService.getClient();

    const { data: app, error: fetchErr } = await supabase
      .from('job_applications')
      .select('application_id, applicant_id, status')
      .eq('application_id', applicationId)
      .eq('applicant_id', applicantId)
      .maybeSingle();

    if (fetchErr) throw new InternalServerErrorException(fetchErr.message);
    if (!app) throw new NotFoundException('Application not found.');
    if (app.status !== 'hired')
      throw new BadRequestException('Offer can only be accepted when status is "hired".');

    const { error } = await supabase
      .from('job_applications')
      .update({ status: 'offer_accepted', offer_accepted_at: new Date().toISOString() })
      .eq('application_id', applicationId);

    if (error) throw new InternalServerErrorException(error.message);

    this.logger.log(`[acceptOffer] Application ${applicationId} accepted by applicant ${applicantId}`);
    return { status: 'offer_accepted' };
  }

  private getManilaDayCode(date = new Date()): string {
    const shortWeekday = new Intl.DateTimeFormat('en-US', {
      weekday: 'short',
      timeZone: 'Asia/Manila',
    })
      .format(date)
      .toUpperCase();

    const dayCodeMap: Record<string, string> = {
      SUN: 'SUN',
      MON: 'MON',
      TUE: 'TUES',
      WED: 'WED',
      THU: 'THURS',
      FRI: 'FRI',
      SAT: 'SAT',
    };

    return dayCodeMap[shortWeekday] ?? 'MON';
  }

  private parseScheduleWorkdays(rawWorkdays: unknown): string[] {
    if (!rawWorkdays) return [];

    if (Array.isArray(rawWorkdays)) {
      return rawWorkdays.map((d) => String(d).trim().toUpperCase()).filter(Boolean);
    }

    if (typeof rawWorkdays === 'string') {
      const trimmed = rawWorkdays.trim();
      if (!trimmed) return [];

      if (trimmed.startsWith('[')) {
        try {
          const parsed = JSON.parse(trimmed);
          if (Array.isArray(parsed)) {
            return parsed.map((d) => String(d).trim().toUpperCase()).filter(Boolean);
          }
        } catch {
          // fall through to CSV parsing
        }
      }

      return trimmed
        .split(',')
        .map((d) => d.trim().toUpperCase())
        .filter(Boolean);
    }

    return [];
  }

  // ─── B7: Cron — Auto-mark absent at end of day (11:59 PM Manila) ──────────

  @Cron('59 23 * * *', { timeZone: 'Asia/Manila', name: 'autoMarkAbsent' })
  async autoMarkAbsent() {
    const supabase = this.supabaseService.getClient();
    const cronLogger = new Logger('autoMarkAbsent');

    const manilaDate = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
    const manilaStart = `${manilaDate}T00:00:00.000+08:00`;
    const manilaEnd = `${manilaDate}T23:59:59.999+08:00`;
    const dayCode = this.getManilaDayCode();

    const { data: schedules, error: schedErr } = await supabase
      .from('schedules')
      .select('employee_id, workdays');

    if (schedErr) { cronLogger.error(`Failed to fetch schedules: ${schedErr.message}`); return; }

    const scheduledToday = (schedules ?? []).filter((s: any) => {
      const workdays = this.parseScheduleWorkdays(s.workdays);
      return workdays.includes(dayCode);
    });

    if (scheduledToday.length === 0) { cronLogger.log(`No employees scheduled for ${manilaDate}`); return; }

    const employeeIds = scheduledToday.map((s: any) => s.employee_id as string).filter(Boolean);

    const { data: existingLogs } = await supabase
      .from('attendance_time_logs')
      .select('employee_id')
      .in('employee_id', employeeIds)
      .gte('timestamp', manilaStart)
      .lte('timestamp', manilaEnd);

    const loggedSet = new Set((existingLogs ?? []).map((l: any) => l.employee_id as string));

    const absentRows = scheduledToday
      .filter((s: any) => !loggedSet.has(s.employee_id as string))
      .map((s: any) => ({
        log_id: crypto.randomUUID(),
        employee_id: s.employee_id,
        log_type: 'absence',
        status: 'ABSENT',
        clock_type: 'ABSENT_NO_CLOCKIN',
        timestamp: `${manilaDate}T23:59:00.000+08:00`,
        log_status: 'APPROVED',
        notes: 'Auto-marked by system — no clock-in recorded',
      }));

    if (absentRows.length === 0) { cronLogger.log(`All scheduled employees clocked in on ${manilaDate}`); return; }

    const { error: insertErr } = await supabase.from('attendance_time_logs').insert(absentRows);
    if (insertErr) cronLogger.error(`Failed to insert absent records: ${insertErr.message}`);
    else cronLogger.log(`Auto-marked ${absentRows.length} employee(s) absent for ${manilaDate}`);
  }

  // ─── B7 continued: Cron — Auto close open clock-ins (00:01 AM Manila) ─────

  @Cron('1 0 * * *', { timeZone: 'Asia/Manila', name: 'autoCloseOpenClockIns' })
  async autoCloseOpenClockIns() {
    const supabase = this.supabaseService.getClient();
    const cronLogger = new Logger('autoCloseOpenClockIns');

    const yesterday = new Date(Date.now() - 86400000)
      .toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
    const yesterdayStart = `${yesterday}T00:00:00.000+08:00`;
    const yesterdayEnd = `${yesterday}T23:59:59.999+08:00`;

    const { data: openIns, error: fetchErr } = await supabase
      .from('attendance_time_logs')
      .select('log_id, employee_id, schedule_id')
      .eq('log_type', 'time-in')
      .gte('timestamp', yesterdayStart)
      .lte('timestamp', yesterdayEnd);

    if (fetchErr) { cronLogger.error(`Failed to fetch open clock-ins: ${fetchErr.message}`); return; }
    if (!openIns || openIns.length === 0) return;

    const empIds = openIns.map((l: any) => l.employee_id as string);
    const { data: timeOuts } = await supabase
      .from('attendance_time_logs')
      .select('employee_id')
      .eq('log_type', 'time-out')
      .in('employee_id', empIds)
      .gte('timestamp', yesterdayStart)
      .lte('timestamp', yesterdayEnd);

    const timedOutSet = new Set((timeOuts ?? []).map((l: any) => l.employee_id as string));

    const closeRows = (openIns as any[])
      .filter((l) => !timedOutSet.has(l.employee_id as string))
      .map((l) => ({
        log_id: crypto.randomUUID(),
        employee_id: l.employee_id,
        schedule_id: l.schedule_id ?? null,
        log_type: 'time-out',
        clock_type: 'NO_CLOCKOUT',
        status: 'PRESENT',
        log_status: 'APPROVED',
        timestamp: `${yesterday}T23:59:00.000+08:00`,
        notes: 'Auto clock-out — employee did not clock out',
      }));

    if (closeRows.length === 0) return;

    const { error: insertErr } = await supabase.from('attendance_time_logs').insert(closeRows);
    if (insertErr) cronLogger.error(`Failed to insert auto clock-outs: ${insertErr.message}`);
    else cronLogger.log(`Auto clock-out recorded for ${closeRows.length} employee(s) from ${yesterday}`);
  }

  // ── SFIA Resume Skill Extraction ────────────────────────────────────────────

  private async extractResumeText(buffer: Buffer, mimeType: string): Promise<string> {
    try {
      if (mimeType === 'application/pdf') {
        const parser = new PDFParse({ data: buffer });
        const result = await parser.getText();
        return result.text ?? '';
      }
      // DOC (OLE2 binary) and DOCX: decode as latin1 to preserve all bytes,
      // then strip non-printable chars — equivalent to `cat file | tr -cd '[:print:]'`
      return buffer.toString('latin1').replace(/[^\x20-\x7E\n\r\t]/g, ' ').replace(/\s+/g, ' ');
    } catch {
      return '';
    }
  }

  private matchSkillsFromText(
    resumeText: string,
    sfiaSkills: Array<{ skill_id: string; skill: string; category: string }>,
  ): Array<{ skill_id: string; candidate_level: number }> {
    const lowerText = resumeText.toLowerCase();
    const results: Array<{ skill_id: string; candidate_level: number }> = [];

    const highKeywords = ['lead', 'senior', 'principal', 'head of', 'architect', 'manager', 'director'];
    const midHighKeywords = ['specialist', 'expert', 'advanced'];
    const midKeywords = ['mid', 'intermediate', 'experienced'];
    const lowKeywords = ['junior', 'associate', 'entry', 'graduate', 'intern'];

    // Assess overall seniority from the full document — a resume has one seniority level
    let globalLevel = 3;
    if (highKeywords.some(kw => lowerText.includes(kw))) globalLevel = 5;
    else if (midHighKeywords.some(kw => lowerText.includes(kw))) globalLevel = 4;
    else if (lowKeywords.some(kw => lowerText.includes(kw))) globalLevel = 2;

    for (const skill of sfiaSkills) {
      const term = skill.skill.toLowerCase();
      const catTerm = skill.category.toLowerCase();
      if (!lowerText.includes(term) && !lowerText.includes(catTerm)) continue;
      results.push({ skill_id: skill.skill_id, candidate_level: globalLevel });
    }

    return results;
  }

  private async getAllSfiaSkills(): Promise<Array<{ skill_id: string; skill: string; category: string }>> {
    const supabase = this.supabaseService.getClient();
    const { data, error } = await supabase
      .from('sfia_skills')
      .select('skill_id, skill, category');
    if (error) {
      this.handleMissingSfiaSchema(error.message, 'sfia_skills');
      return [];
    }
    return (data ?? []) as Array<{ skill_id: string; skill: string; category: string }>;
  }

  private async populateCandidateSkillScores(
    applicationId: string,
    matches: Array<{ skill_id: string; candidate_level: number }>,
  ): Promise<void> {
    if (matches.length === 0) return;
    const supabase = this.supabaseService.getClient();
    const rows = matches.map(m => ({
      candidate_skill_score_sfia_id: crypto.randomUUID(),
      application_id: applicationId,
      skill_id: m.skill_id,
      candidate_level: m.candidate_level,
      match_score: null,
    }));
    try {
      const { error } = await supabase.from('candidate_skill_score_sfia').upsert(rows, {
        onConflict: 'application_id,skill_id',
        ignoreDuplicates: false,
      });
      if (error) this.logger.warn(`populateCandidateSkillScores: ${error.message}`);
    } catch (err) {
      this.logger.warn(`populateCandidateSkillScores threw: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  private async downloadResumeBuffer(storagePath: string): Promise<Buffer | null> {
    try {
      const supabase = this.supabaseService.getClient();
      const { data, error } = await supabase.storage.from('sfia-resumes').download(storagePath);
      if (error || !data) {
        this.logger.warn(`Could not download SFIA resume at ${storagePath}: ${error?.message}`);
        return null;
      }
      return Buffer.from(await data.arrayBuffer());
    } catch {
      return null;
    }
  }
}
