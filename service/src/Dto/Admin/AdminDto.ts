import {IsBoolean, IsNotEmpty, IsString} from 'class-validator';

export class SetAdminDto {
  @IsBoolean()
  public isAdmin!: boolean;
}

export class HandOverDto {
  @IsString()
  @IsNotEmpty()
  public userId!: string;
}

export class TeamMemberPathParamsDto {
  @IsString()
  @IsNotEmpty()
  public teamId!: string;

  @IsString()
  @IsNotEmpty()
  public userId!: string;
}

export class OrgAdminPathParamsDto {
  @IsString()
  @IsNotEmpty()
  public userId!: string;
}
