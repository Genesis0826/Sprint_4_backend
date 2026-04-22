// src/applicants/applicants.controller.ts

import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Body,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  Req,
  Res,
  Headers,
  UnauthorizedException,
  Param,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ApiConsumes, ApiTags, ApiOperation } from '@nestjs/swagger';
import { ApplicantJwtAuthGuard } from '../auth/applicant-jwt-auth.guard';
import type { Request, Response } from 'express';
import { ThrottlerGuard } from '@nestjs/throttler';
import { ApplicantsService } from './applicants.service';
import { CreateApplicantDto } from './dto/create-applicant.dto';
import { ApplicantLoginDto } from './dto/applicant-login.dto';
import { UploadSfiaResumeDto } from './dto/upload-sfia-resume.dto';


const APPLICANT_COOKIE = 'applicant_refresh_token';

function cookieOptions(maxAgeMs: number) {
  const isProd = process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'none' : 'lax',
    maxAge: maxAgeMs,
    path: '/api/tribeX/auth',
  } as const;
}

@ApiTags('Applicants')
@Controller('applicants')
export class ApplicantsController {
  constructor(private readonly applicantsService: ApplicantsService) {}

  @Post('register')
  @UseGuards(ThrottlerGuard)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Applicant self-registration via Career Portal' })
  register(@Body() dto: CreateApplicantDto, @Query('company') companyId?: string) {
    return this.applicantsService.register(dto, companyId);
  }

  @Post('login')
  @UseGuards(ThrottlerGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Applicant login — returns access token + sets HttpOnly refresh cookie' })
  async login(
    @Body() dto: ApplicantLoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { access_token, refresh_token, refresh_max_age_ms } =
      await this.applicantsService.login(dto);
    res.cookie(APPLICANT_COOKIE, refresh_token, cookieOptions(refresh_max_age_ms));
    return { access_token };
  }

  @Post('refresh')
  @UseGuards(ThrottlerGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Issue new access token from applicant refresh cookie' })
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const token: string | undefined = (req.cookies as Record<string, string>)[APPLICANT_COOKIE];
    if (!token) throw new UnauthorizedException('No applicant refresh token cookie');
    const { access_token, refresh_token, refresh_max_age_ms } =
      await this.applicantsService.refresh(token);
    res.cookie(APPLICANT_COOKIE, refresh_token, cookieOptions(refresh_max_age_ms));
    return { access_token };
  }

  @Post('logout')
  @UseGuards(ThrottlerGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Revoke applicant session and blacklist access token' })
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Headers('authorization') authHeader?: string,
  ) {
    const refreshToken: string | undefined = (req.cookies as Record<string, string>)[APPLICANT_COOKIE];
    if (!refreshToken) throw new UnauthorizedException('No applicant refresh token cookie');

    const accessToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined;
    await this.applicantsService.logout(refreshToken, accessToken);

    const isProd = process.env.NODE_ENV === 'production';
    res.clearCookie(APPLICANT_COOKIE, {
      path: '/api/tribeX/auth',
      secure: isProd,
      sameSite: isProd ? 'none' : 'lax',
    } as const);

    return { message: 'Logged out' };
  }

  @Get('verify-email')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify applicant email address via token' })
  verifyEmail(@Query('token') token: string) {
    return this.applicantsService.verifyEmail(token);
  }

  @Post('resend-verification')
  @UseGuards(ThrottlerGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Resend verification email to an unverified applicant' })
  resendVerification(@Body() body: { email: string }) {
    return this.applicantsService.resendVerification(body.email);
  }

  @Get('me')
  @UseGuards(ApplicantJwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get own applicant profile' })
  getMe(@Req() req: any) {
    return this.applicantsService.getMe(req.user.sub_userid);
  }

  @Patch('me')
  @UseGuards(ApplicantJwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update own applicant profile' })
  updateMe(@Req() req: any, @Body() body: any) {
    return this.applicantsService.updateMe(req.user.sub_userid, body);
  }

  @Post('me/resume')
  @UseGuards(ApplicantJwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Upload or replace applicant resume (PDF/DOC/DOCX, max 5MB)' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  uploadResume(@Req() req: any, @UploadedFile() file: Express.Multer.File) {
    return this.applicantsService.uploadResume(req.user.sub_userid, file);
  }

  @Delete('me/resume')
  @UseGuards(ApplicantJwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete applicant resume' })
  deleteResume(@Req() req: any) {
    return this.applicantsService.deleteResume(req.user.sub_userid);
  }

  @Post('sfia-upload')
  @UseGuards(ApplicantJwtAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Applicant: Upload SFIA resume for a specific job posting (applicant_id optional for testing)' })
  uploadSfiaResume(
    @Body() dto: UploadSfiaResumeDto,
    @Query('applicant_id') applicantIdParam?: string,
    @Req() req?: any,
  ) {
    const applicantId = applicantIdParam || req.user.sub_userid;
    return this.applicantsService.uploadSfiaResume(applicantId, dto);
  }
}
