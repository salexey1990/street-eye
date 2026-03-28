import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { HealthService } from './health.service';
import { Public } from '../common/decorators/public.decorator';

@ApiTags('health')
@Public()
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @ApiOperation({ summary: 'Health check', description: 'Returns service status and database connectivity. Used by monitoring and load balancers. No authentication required.' })
  @ApiResponse({
    status: 200,
    description: 'Service is healthy.',
    schema: {
      example: {
        success: true,
        data: { status: 'ok', db: 'up', uptime: 3600 },
        meta: { timestamp: '2026-03-01T10:00:00Z' },
      },
    },
  })
  check() {
    return this.healthService.check();
  }
}
