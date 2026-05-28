import { Controller, Get, Param, Query, UseInterceptors } from '@nestjs/common';
import { CacheInterceptor, CacheTTL } from '@nestjs/cache-manager';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { CreatorEventsService } from './creator-events.service';
import {
  WinnersQueryDto,
  PaginatedWinnersResponse,
} from './dto/winners-query.dto';
import {
  LeaderboardQueryDto,
  PaginatedLeaderboardResponse,
} from './dto/leaderboard-query.dto';
import { Public } from '../common/decorators/public.decorator';

@ApiTags('Creator Events')
@Controller('creator-events')
export class CreatorEventsController {
  constructor(private readonly creatorEventsService: CreatorEventsService) {}

  @Get(':id/winners')
  @Public()
  @UseInterceptors(CacheInterceptor)
  @CacheTTL(300)
  @ApiOperation({
    summary: 'Get winners (users with perfect predictions) for an event',
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated list of winners sorted by completion time',
  })
  @ApiResponse({ status: 404, description: 'Event not found' })
  async getWinners(
    @Param('id') id: string,
    @Query() query: WinnersQueryDto,
  ): Promise<PaginatedWinnersResponse> {
    return this.creatorEventsService.getWinners(id, query);
  }

  @Get(':id/leaderboard')
  @Public()
  @UseInterceptors(CacheInterceptor)
  @CacheTTL(60)
  @ApiOperation({ summary: 'Get event leaderboard ranked by score' })
  @ApiResponse({
    status: 200,
    description: 'Paginated leaderboard with accuracy and winner status',
  })
  @ApiResponse({ status: 404, description: 'Event not found' })
  async getLeaderboard(
    @Param('id') id: string,
    @Query() query: LeaderboardQueryDto,
  ): Promise<PaginatedLeaderboardResponse> {
    return this.creatorEventsService.getLeaderboard(id, query);
  }
}
