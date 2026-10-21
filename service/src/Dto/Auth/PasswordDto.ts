import {IsIn, IsNotEmpty, IsOptional, IsString, MaxLength, MinLength} from 'class-validator';
import {IsPlainEmail} from '~/Dto/IsPlainEmail';
import {ORG_ROLES} from '~/Db/schema';

/** Long enough to matter, not so long that people write it down. */
const MIN_PASSWORD = 12;
const MAX_PASSWORD = 200;

export class LoginDto {
  @IsPlainEmail()
  public email!: string;

  @IsString()
  @IsNotEmpty()
  public password!: string;
}

/** No password here: it is chosen on the confirmation link, by whoever holds the mailbox. */
export class RegisterDto {
  @IsPlainEmail()
  public email!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  public name!: string;
}

export class VerifyEmailDto {
  @IsString()
  @IsNotEmpty()
  public token!: string;

  @IsString()
  @MinLength(MIN_PASSWORD)
  @MaxLength(MAX_PASSWORD)
  public password!: string;
}

export class AcceptInvitationDto {
  @IsString()
  @IsNotEmpty()
  public token!: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  public name?: string;

  @IsOptional()
  @IsString()
  @MinLength(MIN_PASSWORD)
  @MaxLength(MAX_PASSWORD)
  public password?: string;
}

export class InviteDto {
  @IsPlainEmail()
  public email!: string;

  @IsOptional()
  @IsIn(ORG_ROLES as unknown as string[])
  public role?: string;
}

export class RequestResetDto {
  @IsPlainEmail()
  public email!: string;
}

export class ConfirmResetDto {
  @IsString()
  @IsNotEmpty()
  public token!: string;

  @IsString()
  @MinLength(MIN_PASSWORD)
  @MaxLength(MAX_PASSWORD)
  public password!: string;
}

export class SetupDto {
  @IsString()
  @IsNotEmpty()
  public token!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  public orgName!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  public name!: string;

  @IsPlainEmail()
  public email!: string;

  @IsString()
  @MinLength(MIN_PASSWORD)
  @MaxLength(MAX_PASSWORD)
  public password!: string;
}

export class TokenDto {
  @IsString()
  @IsNotEmpty()
  public token!: string;
}
