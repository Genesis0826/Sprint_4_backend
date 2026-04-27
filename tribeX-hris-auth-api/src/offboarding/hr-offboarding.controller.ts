import { Controller, Get, Post, Patch, Put, Param, Body, Query, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { OffboardingService } from './offboarding.service';
import { CreateOffboardingCaseDto } from './dto/create-case.dto';
import { UpdateOffboardingStatusDto } from './dto/update-status.dto';
import { UpdateChecklistItemDto } from './dto/update-checklist-item.dto';
import { UpdateFinalPayDto } from './dto/update-final-pay.dto';
import { AcceptRejectCaseDto } from './dto/accept-reject-case.dto';
import { ConfigureChecklistTemplateDto } from './dto/configure-checklist-template.dto';
import { ReleaseClearanceDto } from './dto/release-clearance.dto';

const HR_ONLY = ['HR Officer', 'HR Recruiter', 'Admin', 'System Admin'];

@ApiTags('HR Offboarding Management')
@ApiBearerAuth()
@Controller('offboarding/hr')
@UseGuards(JwtAuthGuard, RolesGuard)
export class HrOffboardingController {
  constructor(private readonly offboardingService: OffboardingService) {}

  // ── CHECKLIST TEMPLATE (Phase 1) ───────────────────────────────────────────

  @Post('checklist-templates')
  @Roles(...HR_ONLY)
  @ApiOperation({ summary: 'Configure offboarding checklist template for the company' })
  configureTemplate(@Body() dto: ConfigureChecklistTemplateDto, @Req() req: any) {
    return this.offboardingService.configureChecklistTemplate(dto, req.user.company_id, req.user.sub_userid);
  }

  @Get('checklist-templates')
  @Roles(...HR_ONLY)
  @ApiOperation({ summary: 'Get all checklist templates for the company' })
  getTemplates(@Req() req: any) {
    return this.offboardingService.getChecklistTemplates(req.user.company_id);
  }

  // ── CASES ──────────────────────────────────────────────────────────────────

  @Post('cases')
  @Roles(...HR_ONLY)
  @ApiOperation({ summary: 'HR creates a Termination or End of Contract case' })
  createCase(@Body() dto: CreateOffboardingCaseDto, @Req() req: any) {
    return this.offboardingService.createCase(dto, req.user.sub_userid);
  }

  @Get('cases')
  @Roles(...HR_ONLY)
  @ApiOperation({ summary: 'List all offboarding cases with optional filters' })
  getAllCases(
    @Query('status') status?: string,
    @Query('offboarding_type') offboarding_type?: string,
  ) {
    return this.offboardingService.getAllCases({ status, offboarding_type });
  }

  @Get('cases/:caseId')
  @Roles(...HR_ONLY)
  @ApiOperation({ summary: 'Get full detail of an offboarding case' })
  getCase(@Param('caseId') caseId: string) {
    return this.offboardingService.getCaseById(caseId);
  }

  // ── ACCEPT / REJECT (Phase 3) ──────────────────────────────────────────────

  @Patch('cases/:caseId/review')
  @Roles(...HR_ONLY)
  @ApiOperation({ summary: 'Accept or Reject a resignation (HR Phase 3)' })
  acceptRejectCase(
    @Param('caseId') caseId: string,
    @Body() dto: AcceptRejectCaseDto,
    @Req() req: any,
  ) {
    return this.offboardingService.acceptRejectCase(
      caseId, dto.action, req.user.sub_userid, dto.rejection_reason,
    );
  }

  // ── STATUS ─────────────────────────────────────────────────────────────────

  @Patch('cases/:caseId/status')
  @Roles(...HR_ONLY)
  @ApiOperation({ summary: 'Update case status (HR_Accepted or Completed)' })
  updateStatus(
    @Param('caseId') caseId: string,
    @Body() dto: UpdateOffboardingStatusDto,
    @Req() req: any,
  ) {
    return this.offboardingService.updateStatus(caseId, dto.status, req.user);
  }

  // ── CHECKLIST (Phases 5–7) ─────────────────────────────────────────────────

  @Get('cases/:caseId/checklist')
  @Roles(...HR_ONLY)
  @ApiOperation({ summary: 'Get all checklist items for a case' })
  getChecklist(@Param('caseId') caseId: string) {
    return this.offboardingService.getChecklist(caseId);
  }

  @Post('cases/:caseId/checklist')
  @Roles(...HR_ONLY)
  @ApiOperation({ summary: 'Add a custom checklist item to a case' })
  addChecklistItem(
    @Param('caseId') caseId: string,
    @Body('item_name') item_name: string,
  ) {
    return this.offboardingService.addChecklistItem(caseId, item_name);
  }

  @Patch('cases/:caseId/checklist/:itemId')
  @Roles(...HR_ONLY)
  @ApiOperation({ summary: 'Update checklist item status (Verified or Disputed)' })
  updateChecklistItem(
    @Param('caseId') _caseId: string,
    @Param('itemId') itemId: string,
    @Body() dto: UpdateChecklistItemDto,
    @Req() req: any,
  ) {
    return this.offboardingService.updateChecklistItem(itemId, dto.status, req.user.sub_userid);
  }

  // ── KNOWLEDGE TRANSFER ─────────────────────────────────────────────────────

  @Get('cases/:caseId/knowledge-transfer')
  @Roles(...HR_ONLY)
  @ApiOperation({ summary: 'Get knowledge transfer record for a case' })
  getKT(@Param('caseId') caseId: string) {
    return this.offboardingService.getKnowledgeTransfer(caseId);
  }

  // ── SYSTEM ACCESS ──────────────────────────────────────────────────────────

  @Get('cases/:caseId/system-access')
  @Roles(...HR_ONLY)
  @ApiOperation({ summary: 'Get system access records for a case' })
  getSystemAccess(@Param('caseId') caseId: string) {
    return this.offboardingService.getSystemAccess(caseId);
  }

  @Post('cases/:caseId/system-access')
  @Roles(...HR_ONLY)
  @ApiOperation({ summary: 'Add a system access record manually' })
  addSystemAccess(
    @Param('caseId') caseId: string,
    @Body('system_name') system_name: string,
  ) {
    return this.offboardingService.addSystemAccess(caseId, system_name);
  }

  @Patch('cases/:caseId/system-access/:accessId/revoke')
  @Roles(...HR_ONLY)
  @ApiOperation({ summary: 'Revoke access to a system' })
  revokeAccess(
    @Param('caseId') _caseId: string,
    @Param('accessId') accessId: string,
    @Req() req: any,
  ) {
    return this.offboardingService.revokeSystemAccess(accessId, req.user.sub_userid);
  }

  // ── FINAL PAY (Phases 8–10) ────────────────────────────────────────────────

  @Get('cases/:caseId/final-pay')
  @Roles(...HR_ONLY)
  @ApiOperation({ summary: 'Get final pay record for a case' })
  getFinalPay(@Param('caseId') caseId: string) {
    return this.offboardingService.getFinalPay(caseId);
  }

  @Put('cases/:caseId/final-pay')
  @Roles(...HR_ONLY)
  @ApiOperation({ summary: 'Set or update final pay breakdown (total computed server-side)' })
  updateFinalPay(
    @Param('caseId') caseId: string,
    @Body() dto: UpdateFinalPayDto,
  ) {
    return this.offboardingService.updateFinalPay(caseId, dto);
  }

  @Patch('cases/:caseId/final-pay/release')
  @Roles(...HR_ONLY)
  @ApiOperation({ summary: 'Release final pay to employee' })
  releaseFinalPay(@Param('caseId') caseId: string) {
    return this.offboardingService.releaseFinalPay(caseId);
  }

  @Post('cases/:caseId/final-pay/confirm-transfer')
  @Roles(...HR_ONLY)
  @ApiOperation({ summary: 'Record bank transfer confirmation and create payroll log entry (Phase 10)' })
  confirmTransfer(@Param('caseId') caseId: string, @Req() req: any) {
    return this.offboardingService.recordPayTransferConfirmation(caseId, req.user.sub_userid);
  }

  // ── CLEARANCE DOCUMENTS (Phases 11–12) ────────────────────────────────────

  @Get('cases/:caseId/clearance-documents')
  @Roles(...HR_ONLY)
  @ApiOperation({ summary: 'Get clearance document status for a case (Phase 12)' })
  getClearanceDocs(@Param('caseId') caseId: string) {
    return this.offboardingService.getClearanceDocuments(caseId);
  }

  @Post('cases/:caseId/clearance-documents/release')
  @Roles(...HR_ONLY)
  @ApiOperation({ summary: 'Release clearance documents after all checklist items verified (Phase 11)' })
  releaseClearanceDocs(
    @Param('caseId') caseId: string,
    @Body() dto: ReleaseClearanceDto,
    @Req() req: any,
  ) {
    return this.offboardingService.releaseClearanceDocuments(caseId, req.user.sub_userid, dto.notes);
  }

  // ── VACANCY + RECRUITMENT TRIGGER (Phase 13) ───────────────────────────────

  @Post('cases/:caseId/trigger-job-posting')
  @Roles(...HR_ONLY)
  @ApiOperation({ summary: 'Flag position as vacant and trigger a new job posting (Phase 13)' })
  triggerJobPosting(@Param('caseId') caseId: string, @Req() req: any) {
    return this.offboardingService.triggerJobPosting(caseId, req.user.sub_userid);
  }
}
