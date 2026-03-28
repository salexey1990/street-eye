import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Req,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiHeader,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { AuthService } from './auth.service';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayload } from '../common/decorators/current-user.decorator';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ResendVerifyDto } from './dto/resend-verify.dto';

function resolveLocale(req: Request): 'en' | 'ru' {
  const header = req.headers['accept-language'] ?? '';
  return header.toLowerCase().startsWith('ru') ? 'ru' : 'en';
}

@ApiTags('auth')
@ApiHeader({
  name: 'Accept-Language',
  description: 'Locale for email content: `en` (default) or `ru`',
  required: false,
  schema: { type: 'string', enum: ['en', 'ru'], default: 'en' },
})
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('register')
  @Throttle({ default: { ttl: 3600000, limit: 10 } })
  @ApiOperation({ summary: 'Register a new user', description: 'Creates an account and sends a verification email. Account is inactive until email is verified.' })
  @ApiResponse({ status: 201, description: 'User created — verification email sent.' })
  @ApiResponse({ status: 400, description: 'Validation error.' })
  @ApiResponse({ status: 409, description: 'Email already registered.' })
  @ApiResponse({ status: 429, description: 'Rate limit exceeded (10 requests / hour per IP).' })
  register(@Body() dto: RegisterDto, @Req() req: Request) {
    return this.authService.register(dto, resolveLocale(req));
  }

  @Public()
  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify email address', description: 'Activates the account using the token from the verification email. Token is valid for 24 hours and single-use.' })
  @ApiResponse({ status: 200, description: 'Email verified successfully.' })
  @ApiResponse({ status: 400, description: 'Token invalid, expired, or already used.' })
  verifyEmail(@Body() dto: VerifyEmailDto) {
    return this.authService.verifyEmail(dto);
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 900000, limit: 5 } })
  @ApiOperation({ summary: 'Log in', description: 'Returns a short-lived access token (15 min) and a long-lived refresh token (30 days). Email must be verified.' })
  @ApiResponse({
    status: 200,
    description: 'Login successful.',
    schema: {
      example: {
        success: true,
        data: { accessToken: 'eyJ...', refreshToken: 'a1b2c3...' },
        meta: { timestamp: '2026-03-01T10:00:00Z' },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Invalid credentials.' })
  @ApiResponse({ status: 403, description: 'Email not verified.' })
  @ApiResponse({ status: 429, description: 'Rate limit exceeded (5 requests / 15 min per IP).' })
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh access token', description: 'Issues a new access + refresh token pair. The old refresh token is immediately invalidated (rotation). Re-use of a consumed token returns 401.' })
  @ApiResponse({
    status: 200,
    description: 'New token pair issued.',
    schema: {
      example: {
        success: true,
        data: { accessToken: 'eyJ...', refreshToken: 'x9y8z7...' },
        meta: { timestamp: '2026-03-01T10:00:00Z' },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Refresh token invalid or expired.' })
  refresh(@Body() dto: RefreshDto) {
    return this.authService.refresh(dto);
  }

  @ApiBearerAuth('access-token')
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Log out', description: 'Invalidates the provided refresh token. Access token expires naturally (15 min TTL).' })
  @ApiResponse({ status: 200, description: 'Logged out successfully.' })
  @ApiResponse({ status: 401, description: 'Missing or invalid access token / refresh token not found.' })
  logout(@CurrentUser() user: JwtPayload, @Body() dto: RefreshDto) {
    return this.authService.logout(user.sub, dto);
  }

  @Public()
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 600000, limit: 3 } })
  @ApiOperation({ summary: 'Request password reset', description: 'Sends a password reset link to the email if it is registered. Always returns 200 to prevent email enumeration.' })
  @ApiResponse({ status: 200, description: 'Reset email sent (or silently skipped for unknown addresses).' })
  @ApiResponse({ status: 429, description: 'Rate limit exceeded (3 requests / 10 min per IP).' })
  forgotPassword(@Body() dto: ForgotPasswordDto, @Req() req: Request) {
    return this.authService.forgotPassword(dto, resolveLocale(req));
  }

  @Public()
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reset password', description: 'Sets a new password using the token from the reset email. Token is valid for 30 minutes and single-use. All existing refresh tokens are invalidated.' })
  @ApiResponse({ status: 200, description: 'Password reset successfully.' })
  @ApiResponse({ status: 400, description: 'Token invalid, expired, or already used.' })
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }

  @Public()
  @Post('resend-verify')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 600000, limit: 3 } })
  @ApiOperation({ summary: 'Resend verification email', description: 'Sends a new verification email if the address is registered and not yet verified. Always returns 200.' })
  @ApiResponse({ status: 200, description: 'Verification email sent (or silently skipped).' })
  @ApiResponse({ status: 429, description: 'Rate limit exceeded (3 requests / 10 min per IP).' })
  resendVerify(@Body() dto: ResendVerifyDto, @Req() req: Request) {
    return this.authService.resendVerify(dto, resolveLocale(req));
  }
}
