import {IsNotEmpty, IsString} from 'class-validator';

export class TeamPathParamsDto {
  @IsString()
  @IsNotEmpty()
  public teamId!: string;
}
