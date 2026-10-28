import {IsIn} from 'class-validator';
import {STATS_PERIODS} from '~/Model/OrgModel';

export class OrgStatsQueryDto {
  @IsIn(STATS_PERIODS)
  public period!: string;
}
