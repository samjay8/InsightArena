import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreatorEvent } from './entities/creator-event.entity';
import { CreatorEventMatch } from './entities/creator-event-match.entity';
import { CreatorEventPrediction } from './entities/creator-event-prediction.entity';
import { CreatorEventWinner } from './entities/creator-event-winner.entity';
import {
  WinnersQueryDto,
  WinnerResponse,
  PaginatedWinnersResponse,
} from './dto/winners-query.dto';
import {
  LeaderboardQueryDto,
  LeaderboardEntryResponse,
  PaginatedLeaderboardResponse,
} from './dto/leaderboard-query.dto';

@Injectable()
export class CreatorEventsService {
  private readonly logger = new Logger(CreatorEventsService.name);

  constructor(
    @InjectRepository(CreatorEvent)
    private readonly eventRepository: Repository<CreatorEvent>,
    @InjectRepository(CreatorEventMatch)
    private readonly matchRepository: Repository<CreatorEventMatch>,
    @InjectRepository(CreatorEventPrediction)
    private readonly predictionRepository: Repository<CreatorEventPrediction>,
    @InjectRepository(CreatorEventWinner)
    private readonly winnerRepository: Repository<CreatorEventWinner>,
  ) {}

  async getWinners(
    eventId: string,
    query: WinnersQueryDto,
  ): Promise<PaginatedWinnersResponse> {
    const event = await this.eventRepository.findOne({
      where: { id: eventId },
    });

    if (!event) {
      throw new NotFoundException(`Event "${eventId}" not found`);
    }

    if (!event.winners_verified) {
      return {
        data: [],
        total: 0,
        page: query.page ?? 1,
        limit: query.limit ?? 20,
      };
    }

    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 20, 100);
    const skip = (page - 1) * limit;

    const [winners, total] = await this.winnerRepository
      .createQueryBuilder('w')
      .where('w.event_id = :eventId', { eventId })
      .orderBy('w.completion_time', 'ASC')
      .skip(skip)
      .take(limit)
      .getManyAndCount();

    const data: WinnerResponse[] = winners.map((w, index) => ({
      rank: skip + index + 1,
      user_address: w.user_address,
      total_correct: w.total_correct,
      total_matches: w.total_matches,
      completion_time: w.completion_time.toISOString(),
      verified_at: w.verified_at.toISOString(),
    }));

    return { data, total, page, limit };
  }

  async getLeaderboard(
    eventId: string,
    query: LeaderboardQueryDto,
  ): Promise<PaginatedLeaderboardResponse> {
    const event = await this.eventRepository.findOne({
      where: { id: eventId },
    });

    if (!event) {
      throw new NotFoundException(`Event "${eventId}" not found`);
    }

    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 20, 100);
    const minPredictions = query.minPredictions ?? 0;
    const skip = (page - 1) * limit;

    const qb = this.predictionRepository
      .createQueryBuilder('p')
      .select([
        'p.user_address AS user_address',
        'COUNT(p.id) AS total_predictions',
        'SUM(CASE WHEN p.is_correct = true THEN 1 ELSE 0 END) AS correct_predictions',
        'MAX(p.predicted_at) AS last_prediction_time',
      ])
      .where('p.event_id = :eventId', { eventId })
      .groupBy('p.user_address')
      .having('COUNT(p.id) >= :minPredictions', { minPredictions })
      .orderBy('correct_predictions', 'DESC')
      .addOrderBy('total_predictions', 'DESC')
      .addOrderBy('last_prediction_time', 'ASC')
      .skip(skip)
      .take(limit);

    const rawResults = await qb.getRawMany();
    const totalResult = await qb.getCount();

    // Define proper type for rawResults to avoid any
    type RawResult = {
      user_address: string;
      total_predictions: string;
      correct_predictions: string;
      last_prediction_time: Date | null;
    };
    const typedResults = rawResults as RawResult[];

    const winners = await this.winnerRepository.find({
      where: { event_id: eventId },
      select: ['user_address'],
    });
    const winnerAddresses = new Set(winners.map((w) => w.user_address));

    const data: LeaderboardEntryResponse[] = typedResults.map((row, index) => {
      const totalPredictions = Number(row.total_predictions);
      const correctPredictions = Number(row.correct_predictions);
      const accuracyPercentage =
        totalPredictions > 0
          ? Math.round((correctPredictions / totalPredictions) * 100)
          : 0;

      return {
        rank: skip + index + 1,
        user_address: row.user_address,
        total_predictions: totalPredictions,
        correct_predictions: correctPredictions,
        accuracy_percentage: accuracyPercentage,
        is_winner: winnerAddresses.has(row.user_address),
        completion_time: row.last_prediction_time
          ? new Date(row.last_prediction_time).toISOString()
          : null,
      };
    });

    return {
      data,
      total: totalResult,
      page,
      limit,
    };
  }

  async findByOnChainId(onChainEventId: string): Promise<CreatorEvent | null> {
    return this.eventRepository.findOne({
      where: { on_chain_event_id: onChainEventId },
    });
  }
}
