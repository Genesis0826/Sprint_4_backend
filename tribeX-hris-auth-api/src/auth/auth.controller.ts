import {
  Controller,
  Post,
  Body,
  Get,
  Headers,
  UnauthorizedException,
  UseGuards,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { ThrottlerGuard } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';

const COOKIE_NAME = 'refresh_token';

function setCookieOptions(maxAgeMs: number) {
  const isProd = process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'none' : 'lax',
    maxAge: maxAgeMs,
    path: '/api/tribeX/auth',
  } as const;
}

@Controller()
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @UseGuards(ThrottlerGuard)
  @Post('login')
  async login(
    @Body() loginDto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { access_token, refresh_token, refresh_max_age_ms } =
      await this.authService.login(
      loginDto,
      req,
    );

    res.cookie(
      COOKIE_NAME,
      refresh_token,
      setCookieOptions(refresh_max_age_ms),
    );

    return { access_token };
  }

  @UseGuards(ThrottlerGuard)
  @Post('refresh')
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const token: string | undefined = (req.cookies as Record<string, string>)[
      COOKIE_NAME
    ];

    if (!token) throw new UnauthorizedException('No refresh token cookie');

    const { access_token, refresh_token, refresh_max_age_ms } =
      await this.authService.refresh(token);

    res.cookie(COOKIE_NAME, refresh_token, setCookieOptions(refresh_max_age_ms));

    return { access_token };
  }

  @UseGuards(ThrottlerGuard)
  @Post('logout')
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Headers('authorization') authHeader?: string,
  ) {
    const refreshToken: string | undefined = (
      req.cookies as Record<string, string>
    )[COOKIE_NAME];

    if (!refreshToken)
      throw new UnauthorizedException('No refresh token cookie');

    const accessToken = authHeader?.startsWith('Bearer ')
      ? authHeader.slice(7)
      : undefined;

    await this.authService.logout(refreshToken, req, accessToken);

    const isProd = process.env.NODE_ENV === 'production';
    res.clearCookie(COOKIE_NAME, {
      path: '/api/tribeX/auth',
      secure: isProd,
      sameSite: isProd ? 'none' : 'lax',
    } as const);

    return { message: 'Logged out' };
  }

  @Post('set-password')
  setPassword(@Body() body: { token: string; password: string }) {
    return this.authService.setPassword(body.token, body.password);
  }

  @UseGuards(ThrottlerGuard)
  @Post('forgot-password')
  forgotPassword(@Body() body: ForgotPasswordDto) {
    return this.authService.requestPasswordReset(body);
  }

  @Get('me')
  me(@Headers('authorization') authHeader?: string) {
    if (!authHeader)
      throw new UnauthorizedException('Missing Authorization header');

    const [type, token] = authHeader.split(' ');
    if (type !== 'Bearer' || !token) {
      throw new UnauthorizedException('Invalid Authorization header format');
    }

    return this.authService.me(token);
  }
}
