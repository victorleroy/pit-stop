import {IsEmail, Matches} from 'class-validator';

/**
 * `IsEmail` alone accepts RFC quoted local parts, which may hold "@": with
 * `"x@acme.com@"@attacker.com` the verified-domain check read acme.com while the mail went
 * to attacker.com. Every address the service takes has one "@" and no quote.
 */
export const IsPlainEmail = (): PropertyDecorator => (target, propertyKey) => {
  IsEmail()(target, propertyKey);
  Matches(/^[^@"\s]+@[^@"\s]+$/, {message: 'email must be a plain address'})(target, propertyKey);
};
