import {IsBoolean, IsIn, IsNotEmpty, IsOptional, IsString, MaxLength} from 'class-validator';
import {IsPlainEmail} from '~/Dto/IsPlainEmail';
import {ORG_STATUSES} from '~/Db/schema';

export class CreateOrgDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  public name!: string;

  /** The first administrator is invited, never created silently (ADR D12). */
  @IsPlainEmail()
  public adminEmail!: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(253)
  public domain?: string;
}

export class SetOrgStatusDto {
  @IsIn(ORG_STATUSES as unknown as string[])
  public status!: string;
}

export class ReleaseDomainDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(253)
  public domain!: string;
}

export class VerifyDomainDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(253)
  public domain!: string;

  @IsBoolean()
  public verified!: boolean;
}
