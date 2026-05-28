import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { CreatorEventsService } from './creator-events.service';
import { CreatorEvent } from './entities/creator-event.entity';
import { CreatorEventMatch } from './entities/creator-event-match.entity';
import { CreatorEventPrediction } from './entities/creator-event-prediction.entity';
import { CreatorEventWinner } from './entities/creator-event-winner.entity';
import { WinnersQueryDto } from './dto/winners-query.dto';
import { LeaderboardQueryDto } from './dto/leaderboard-query.dto';

type MockRepo = jest.Mocked<
  Pick<Repository<any>, 'findOne' | 'createQueryBuilder' | 'find' | 'findByIds'>
>;

function createMockQueryBuilder(returnValue: any): any {
  return {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getManyAndCount: jest.fn().mockResolvedValue(returnValue),
    getRawMany: jest.fn().mockResolvedValue(returnValue?.[0] || []),
    getCount: jest.fn().mockResolvedValue(returnValue?.[1] || 0),
    select: jest.fn().mockReturnThis(),
    groupBy: jest.fn().mockReturnThis(),
    having: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    getOne: jest.fn().mockResolvedValue(null),
  };
}

describe('CreatorEventsService', () => {
  let service: CreatorEventsService;
  let eventRepo: MockRepo;
  let matchRepo: MockRepo;
  let predictionRepo: MockRepo;
  let winnerRepo: MockRepo;

  const mockEvent = {
    id: 'event-1',
    on_chain_event_id: '1',
    creator_address: 'GABC123',
    title: 'Test Event',
    is_active: true,
    is_cancelled: false,
    winners_verified: true,
  } as CreatorEvent;

  const mockWinners = [
    {
      id: 'w1',
      event_id: 'event-1',
      user_address: 'GUSER1',
      total_correct: 5,
      total_matches: 5,
      completion_time: new Date('2026-01-01T10:00:00Z'),
      verified_at: new Date('2026-01-02T10:00:00Z'),
    },
    {
      id: 'w2',
      event_id: 'event-1',
      user_address: 'GUSER2',
      total_correct: 5,
      total_matches: 5,
      completion_time: new Date('2026-01-01T12:00:00Z'),
      verified_at: new Date('2026-01-02T10:00:00Z'),
    },
  ] as CreatorEventWinner[];

  beforeEach(async () => {
    eventRepo = {
      findOne: jest.fn(),
      createQueryBuilder: jest.fn(),
      find: jest.fn(),
      findByIds: jest.fn(),
    };

    matchRepo = {
      findOne: jest.fn(),
      createQueryBuilder: jest.fn(),
      find: jest.fn(),
      findByIds: jest.fn(),
    };

    predictionRepo = {
      findOne: jest.fn(),
      createQueryBuilder: jest.fn(),
      find: jest.fn(),
      findByIds: jest.fn(),
    };

    winnerRepo = {
      findOne: jest.fn(),
      createQueryBuilder: jest.fn(),
      find: jest.fn(),
      findByIds: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CreatorEventsService,
        { provide: getRepositoryToken(CreatorEvent), useValue: eventRepo },
        { provide: getRepositoryToken(CreatorEventMatch), useValue: matchRepo },
        {
          provide: getRepositoryToken(CreatorEventPrediction),
          useValue: predictionRepo,
        },
        {
          provide: getRepositoryToken(CreatorEventWinner),
          useValue: winnerRepo,
        },
      ],
    }).compile();

    service = module.get<CreatorEventsService>(CreatorEventsService);
  });

  describe('getWinners', () => {
    it('should throw NotFoundException when event does not exist', async () => {
      eventRepo.findOne.mockResolvedValue(null);

      await expect(
        service.getWinners('nonexistent', new WinnersQueryDto()),
      ).rejects.toThrow(NotFoundException);
    });

    it('should return empty data when winners are not verified', async () => {
      eventRepo.findOne.mockResolvedValue({
        ...mockEvent,
        winners_verified: false,
      });

      const result = await service.getWinners('event-1', new WinnersQueryDto());

      expect(result).toEqual({ data: [], total: 0, page: 1, limit: 20 });
    });

    it('should return winners sorted by completion time ascending', async () => {
      eventRepo.findOne.mockResolvedValue(mockEvent);
      const qb = createMockQueryBuilder([mockWinners, 2]);
      winnerRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.getWinners('event-1', new WinnersQueryDto());

      expect(winnerRepo.createQueryBuilder).toHaveBeenCalledWith('w');
      expect(qb.orderBy).toHaveBeenCalledWith('w.completion_time', 'ASC');
      expect(result.data).toHaveLength(2);
      expect(result.data[0].user_address).toBe('GUSER1');
      expect(result.data[0].rank).toBe(1);
      expect(result.data[1].user_address).toBe('GUSER2');
      expect(result.data[1].rank).toBe(2);
    });

    it('should include correct fields in winner response', async () => {
      eventRepo.findOne.mockResolvedValue(mockEvent);
      const qb = createMockQueryBuilder([mockWinners, 2]);
      winnerRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.getWinners('event-1', new WinnersQueryDto());

      expect(result.data[0]).toEqual({
        rank: 1,
        user_address: 'GUSER1',
        total_correct: 5,
        total_matches: 5,
        completion_time: mockWinners[0].completion_time.toISOString(),
        verified_at: mockWinners[0].verified_at.toISOString(),
      });
    });

    it('should handle pagination correctly', async () => {
      eventRepo.findOne.mockResolvedValue(mockEvent);
      const qb = createMockQueryBuilder([mockWinners, 2]);
      winnerRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.getWinners('event-1', {
        page: 1,
        limit: 10,
      });

      expect(qb.skip).toHaveBeenCalledWith(0);
      expect(qb.take).toHaveBeenCalledWith(10);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(10);
    });
  });

  describe('getLeaderboard', () => {
    const mockRawResults = [
      {
        user_address: 'GUSER1',
        total_predictions: '10',
        correct_predictions: '10',
        last_prediction_time: new Date('2026-01-01T10:00:00Z'),
      },
      {
        user_address: 'GUSER2',
        total_predictions: '10',
        correct_predictions: '8',
        last_prediction_time: new Date('2026-01-01T12:00:00Z'),
      },
    ];

    it('should throw NotFoundException when event does not exist', async () => {
      eventRepo.findOne.mockResolvedValue(null);

      await expect(
        service.getLeaderboard('nonexistent', new LeaderboardQueryDto()),
      ).rejects.toThrow(NotFoundException);
    });

    it('should return leaderboard with correct calculations', async () => {
      eventRepo.findOne.mockResolvedValue(mockEvent);
      const qb = createMockQueryBuilder([mockRawResults, 2]);
      predictionRepo.createQueryBuilder.mockReturnValue(qb);
      winnerRepo.find.mockResolvedValue([mockWinners[0]]);

      const result = await service.getLeaderboard(
        'event-1',
        new LeaderboardQueryDto(),
      );

      expect(result.data).toHaveLength(2);
      expect(result.data[0].user_address).toBe('GUSER1');
      expect(result.data[0].total_predictions).toBe(10);
      expect(result.data[0].correct_predictions).toBe(10);
      expect(result.data[0].accuracy_percentage).toBe(100);
      expect(result.data[0].is_winner).toBe(true);
      expect(result.data[1].is_winner).toBe(false);
    });

    it('should apply minPredictions filter', async () => {
      eventRepo.findOne.mockResolvedValue(mockEvent);
      const qb = createMockQueryBuilder([mockRawResults, 2]);
      predictionRepo.createQueryBuilder.mockReturnValue(qb);

      await service.getLeaderboard('event-1', {
        page: 1,
        limit: 20,
        minPredictions: 5,
      });

      expect(qb.having).toHaveBeenCalledWith('COUNT(p.id) >= :minPredictions', {
        minPredictions: 5,
      });
    });

    it('should sort by correct predictions desc, total predictions desc, completion time asc', async () => {
      eventRepo.findOne.mockResolvedValue(mockEvent);
      const qb = createMockQueryBuilder([mockRawResults, 2]);
      predictionRepo.createQueryBuilder.mockReturnValue(qb);
      winnerRepo.find.mockResolvedValue([]);

      await service.getLeaderboard('event-1', new LeaderboardQueryDto());

      expect(qb.orderBy).toHaveBeenCalledWith('correct_predictions', 'DESC');
      expect(qb.addOrderBy).toHaveBeenCalledWith('total_predictions', 'DESC');
      expect(qb.addOrderBy).toHaveBeenCalledWith('last_prediction_time', 'ASC');
    });

    it('should return empty leaderboard when event has no predictions', async () => {
      eventRepo.findOne.mockResolvedValue(mockEvent);
      const qb = createMockQueryBuilder([[], 0]);
      predictionRepo.createQueryBuilder.mockReturnValue(qb);
      winnerRepo.find.mockResolvedValue([]);

      const result = await service.getLeaderboard(
        'event-1',
        new LeaderboardQueryDto(),
      );

      expect(result.data).toHaveLength(0);
      expect(result.total).toBe(0);
    });

    it('should handle pagination in leaderboard', async () => {
      eventRepo.findOne.mockResolvedValue(mockEvent);
      const qb = createMockQueryBuilder([mockRawResults, 2]);
      predictionRepo.createQueryBuilder.mockReturnValue(qb);
      winnerRepo.find.mockResolvedValue([]);

      const result = await service.getLeaderboard('event-1', {
        page: 1,
        limit: 5,
      });

      expect(qb.skip).toHaveBeenCalledWith(0);
      expect(qb.take).toHaveBeenCalledWith(5);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(5);
    });
  });
});
