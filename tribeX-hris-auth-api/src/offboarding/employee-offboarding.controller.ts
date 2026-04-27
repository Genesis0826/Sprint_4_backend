import { Controller, Get, Post, Patch, Param, Body, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { OffboardingService } from './offboarding.service';
import { CreateOffboardingCaseDto } from './dto/create-case.dto';
import { UpdateKnowledgeTransferDto } from './dto/update-knowledge-transfer.dto';

const ALL_STAFF = ['Employee', 'Manager', 'HR Officer', 'HR Recruiter', 'Admin', 'System Admin'];

@ApiTags('Employee Offboarding')
@ApiBearerAuth()
@Controller('offboarding/employee')
@UseGuards(JwtAuthGuard, RolesGuard)
export class EmployeeOffboardingController {
  constructor(private readonly offboardingService: OffboardingService) {}

  // Phase 1 — Submit Resignation
  @Post('cases')
  @Roles(...ALL_STAFF)
  @ApiOperation({ summary: 'Submit a resignation (employee initiates)' })
  createCase(@Body() dto: CreateOffboardingCaseDto, @Req() req: any) {
    return this.offboardingService.createCase(dto, req.user.sub_userid);
  }

  // Phase 2 — View resignation status
  @Get('cases/my')
  @Roles(...ALL_STAFF)
  @ApiOperation({ summary: 'Get my own active offboarding case with full status' })
  getMyCase(@Req() req: any) {
    return this.offboardingService.getMyCaseByEmployeeId(req.user.sub_userid);
  }

  // Phase 4 — View offboarding checklist
  @Get('cases/:caseId/checklist')
  @Roles(...ALL_STAFF)
  @ApiOperation({ summary: 'View offboarding checklist assigned to me' })
  getChecklist(@Param('caseId') caseId: string) {
    return this.offboardingService.getChecklist(caseId);
  }

  // Phase 5 — Acknowledge return of company asset
  @Patch('cases/:caseId/checklist/:itemId/acknowledge')
  @Roles(...ALL_STAFF)
  @ApiOperation({ summary: 'Acknowledge return of a company asset (sets item to Submitted)' })
  acknowledgeAsset(
    @Param('caseId') _caseId: string,
    @Param('itemId') itemId: string,
    @Req() req: any,
  ) {
    return this.offboardingService.acknowledgeAssetReturn(itemId, req.user.sub_userid);
  }

  // Knowledge transfer notes (employee writes handover notes)
  @Patch('cases/:caseId/knowledge-transfer')
  @Roles(...ALL_STAFF)
  @ApiOperation({ summary: 'Employee writes knowledge transfer / handover notes' })
  updateKT(
    @Param('caseId') caseId: string,
    @Body() dto: UpdateKnowledgeTransferDto,
    @Req() req: any,
  ) {
    return this.offboardingService.updateKnowledgeTransfer(caseId, dto, req.user.sub_userid);
  }

  // Phase 7 — View final pay breakdown
  @Get('cases/:caseId/final-pay')
  @Roles(...ALL_STAFF)
  @ApiOperation({ summary: 'View final pay breakdown' })
  getFinalPay(@Param('caseId') caseId: string) {
    return this.offboardingService.getFinalPay(caseId);
  }

  // Phase 8 — View clearance document status
  @Get('cases/:caseId/clearance-documents')
  @Roles(...ALL_STAFF)
  @ApiOperation({ summary: 'View clearance document status (Pending or Released)' })
  getClearanceDocs(@Param('caseId') caseId: string) {
    return this.offboardingService.getClearanceDocuments(caseId);
  }
}
