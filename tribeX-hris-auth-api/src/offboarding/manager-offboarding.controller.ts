import { Controller, Get, Patch, Param, Body, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { OffboardingService } from './offboarding.service';
import { UpdateOffboardingStatusDto } from './dto/update-status.dto';
import { UpdateKnowledgeTransferDto } from './dto/update-knowledge-transfer.dto';

const MANAGER_UP = ['Manager', 'HR Officer', 'HR Recruiter', 'Admin', 'System Admin'];

@ApiTags('Manager Offboarding')
@ApiBearerAuth()
@Controller('offboarding/manager')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ManagerOffboardingController {
  constructor(private readonly offboardingService: OffboardingService) {}

  @Get('cases')
  @Roles(...MANAGER_UP)
  @ApiOperation({ summary: 'List all offboarding cases visible to manager' })
  getAllCases() {
    return this.offboardingService.getAllCases();
  }

  @Get('cases/:caseId')
  @Roles(...MANAGER_UP)
  @ApiOperation({ summary: 'Get full detail of an offboarding case' })
  getCase(@Param('caseId') caseId: string) {
    return this.offboardingService.getCaseById(caseId);
  }

  @Patch('cases/:caseId/status')
  @Roles(...MANAGER_UP)
  @ApiOperation({ summary: 'Update case status (Manager can set Manager_Acknowledged)' })
  updateStatus(
    @Param('caseId') caseId: string,
    @Body() dto: UpdateOffboardingStatusDto,
    @Req() req: any,
  ) {
    return this.offboardingService.updateStatus(caseId, dto.status, req.user);
  }

  @Patch('cases/:caseId/knowledge-transfer')
  @Roles(...MANAGER_UP)
  @ApiOperation({ summary: 'Manager signs off on or updates knowledge transfer' })
  updateKT(
    @Param('caseId') caseId: string,
    @Body() dto: UpdateKnowledgeTransferDto,
    @Req() req: any,
  ) {
    return this.offboardingService.updateKnowledgeTransfer(caseId, dto, req.user.sub_userid);
  }
}
