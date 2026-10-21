import {IsIn, IsInt, IsNotEmpty, IsString} from 'class-validator';

export class CastVoteDto {
  @IsString()
  @IsNotEmpty()
  public targetId!: string;

  @IsInt()
  @IsIn([1, -1])
  public delta!: number;
}
