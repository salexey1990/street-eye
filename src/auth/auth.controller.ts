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

const ACCESS_TOKEN_EXAMPLE = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJhMWIyYzNkNC1lNWY2LTc4OTAtYWJjZC1lZjEyMzQ1Njc4OTAiLCJlbWFpbCI6InVzZXJAZXhhbXBsZS5jb20iLCJpYXQiOjE3MDk4OTM2MDAsImV4cCI6MTcwOTg5NDUwMH0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
const REFRESH_TOKEN_EXAMPLE = 'a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456ab';
const TIMESTAMP = '2026-03-15T10:00:00.000Z';

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
  @ApiOperation({
    summary: 'Register a new user',
    description: 'Creates an account and sends a verification email. Account is inactive until email is verified.',
  })
  @ApiResponse({
    status: 201,
    description: 'User created — verification email sent.',
    schema: {
      example: {
        success: true,
        data: { message: 'Verification email sent to user@example.com' },
        meta: { timestamp: TIMESTAMP },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Validation error.',
    schema: {
      example: {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          details: [
            { field: 'email', message: 'email must be an email' },
            { field: 'password', message: 'password must be longer than or equal to 8 characters' },
          ],
        },
        meta: { timestamp: TIMESTAMP },
      },
    },
  })
  @ApiResponse({
    status: 409,
    description: 'Email already registered.',
    schema: {
      example: {
        success: false,
        error: { code: 'CONFLICT', message: 'Email already registered', details: [] },
        meta: { timestamp: TIMESTAMP },
      },
    },
  })
  @ApiResponse({
    status: 429,
    description: 'Rate limit exceeded (10 requests / hour per IP).',
    schema: {
      example: {
        success: false,
        error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many requests', details: [] },
        meta: { timestamp: TIMESTAMP },
      },
    },
  })
  register(@Body() dto: RegisterDto, @Req() req: Request) {
    return this.authService.register(dto, resolveLocale(req));
  }

  @Public()
  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Verify email address',
    description: 'Activates the account using the token from the verification email. Token is valid for 24 hours and single-use.',
  })
  @ApiResponse({
    status: 200,
    description: 'Email verified successfully.',
    schema: {
      example: {
        success: true,
        data: { message: 'Email verified successfully' },
        meta: { timestamp: TIMESTAMP },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Token invalid, expired, or already used.',
    schema: {
      example: {
        success: false,
        error: { code: 'TOKEN_INVALID', message: 'Token is invalid or has expired', details: [] },
        meta: { timestamp: TIMESTAMP },
      },
    },
  })
  verifyEmail(@Body() dto: VerifyEmailDto) {
    return this.authService.verifyEmail(dto);
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 900000, limit: 5 } })
  @ApiOperation({
    summary: 'Log in',
    description: 'Returns a short-lived access token (15 min) and a long-lived refresh token (30 days). Email must be verified.',
  })
  @ApiResponse({
    status: 200,
    description: 'Login successful.',
    schema: {
      example: {
        success: true,
        data: { accessToken: ACCESS_TOKEN_EXAMPLE, refreshToken: REFRESH_TOKEN_EXAMPLE },
        meta: { timestamp: TIMESTAMP },
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Invalid credentials.',
    schema: {
      example: {
        success: false,
        error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password', details: [] },
        meta: { timestamp: TIMESTAMP },
      },
    },
  })
  @ApiResponse({
    status: 403,
    description: 'Email not verified.',
    schema: {
      example: {
        success: false,
        error: { code: 'EMAIL_NOT_VERIFIED', message: 'Please verify your email before logging in', details: [] },
        meta: { timestamp: TIMESTAMP },
      },
    },
  })
  @ApiResponse({
    status: 429,
    description: 'Rate limit exceeded (5 requests / 15 min per IP).',
    schema: {
      example: {
        success: false,
        error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many requests', details: [] },
        meta: { timestamp: TIMESTAMP },
      },
    },
  })
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Refresh access token',
    description: 'Issues a new access + refresh token pair. The old refresh token is immediately invalidated (rotation). Re-use of a consumed token returns 401.',
  })
  @ApiResponse({
    status: 200,
    description: 'New token pair issued.',
    schema: {
      example: {
        success: true,
        data: { accessToken: ACCESS_TOKEN_EXAMPLE, refreshToken: 'x9y8z7w6v5u4t3s2r1q0p9o8n7m6l5k4j3i2h1g0f9e8d7c6b5a4z3y2x1w0v9u8' },
        meta: { timestamp: TIMESTAMP },
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Refresh token invalid or expired.',
    schema: {
      example: {
        success: false,
        error: { code: 'TOKEN_INVALID', message: 'Refresh token is invalid or has expired', details: [] },
        meta: { timestamp: TIMESTAMP },
      },
    },
  })
  refresh(@Body() dto: RefreshDto) {
    return this.authService.refresh(dto);
  }

  @ApiBearerAuth('access-token')
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Log out',
    description: 'Invalidates the provided refresh token. Access token expires naturally (15 min TTL).',
  })
  @ApiResponse({
    status: 200,
    description: 'Logged out successfully.',
    schema: {
      example: {
        success: true,
        data: { message: 'Logged out successfully' },
        meta: { timestamp: TIMESTAMP },
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Missing or invalid access token / refresh token not found.',
    schema: {
      example: {
        success: false,
        error: { code: 'TOKEN_INVALID', message: 'Access token is missing or invalid', details: [] },
        meta: { timestamp: TIMESTAMP },
      },
    },
  })
  logout(@CurrentUser() user: JwtPayload, @Body() dto: RefreshDto) {
    return this.authService.logout(user.sub, dto);
  }

  @Public()
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 600000, limit: 3 } })
  @ApiOperation({
    summary: 'Request password reset',
    description: 'Sends a password reset link to the email if it is registered. Always returns 200 to prevent email enumeration.',
  })
  @ApiResponse({
    status: 200,
    description: 'Reset email sent (or silently skipped for unknown addresses).',
    schema: {
      example: {
        success: true,
        data: { message: 'If this email is registered, a reset link has been sent' },
        meta: { timestamp: TIMESTAMP },
      },
    },
  })
  @ApiResponse({
    status: 429,
    description: 'Rate limit exceeded (3 requests / 10 min per IP).',
    schema: {
      example: {
        success: false,
        error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many requests', details: [] },
        meta: { timestamp: TIMESTAMP },
      },
    },
  })
  forgotPassword(@Body() dto: ForgotPasswordDto, @Req() req: Request) {
    return this.authService.forgotPassword(dto, resolveLocale(req));
  }

  @Public()
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Reset password',
    description: 'Sets a new password using the token from the reset email. Token is valid for 30 minutes and single-use. All existing refresh tokens are invalidated.',
  })
  @ApiResponse({
    status: 200,
    description: 'Password reset successfully.',
    schema: {
      example: {
        success: true,
        data: { message: 'Password reset successfully. Please log in with your new password.' },
        meta: { timestamp: TIMESTAMP },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Token invalid, expired, or already used.',
    schema: {
      example: {
        success: false,
        error: { code: 'TOKEN_INVALID', message: 'Reset token is invalid or has expired', details: [] },
        meta: { timestamp: TIMESTAMP },
      },
    },
  })
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }

  @Public()
  @Post('resend-verify')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 600000, limit: 3 } })
  @ApiOperation({
    summary: 'Resend verification email',
    description: 'Sends a new verification email if the address is registered and not yet verified. Always returns 200.',
  })
  @ApiResponse({
    status: 200,
    description: 'Verification email sent (or silently skipped).',
    schema: {
      example: {
        success: true,
        data: { message: 'If this email is registered and unverified, a new verification email has been sent' },
        meta: { timestamp: TIMESTAMP },
      },
    },
  })
  @ApiResponse({
    status: 429,
    description: 'Rate limit exceeded (3 requests / 10 min per IP).',
    schema: {
      example: {
        success: false,
        error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many requests', details: [] },
        meta: { timestamp: TIMESTAMP },
      },
    },
  })
  resendVerify(@Body() dto: ResendVerifyDto, @Req() req: Request) {
    return this.authService.resendVerify(dto, resolveLocale(req));
  }
}
