import {IsNotEmpty, IsString, MaxLength} from 'class-validator';

export class AddTeamMemberDto {
  @IsString()
  @IsNotEmpty()
  public userId!: string;
}

export class CreateTeamDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  public name!: string;
}
