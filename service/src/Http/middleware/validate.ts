import {plainToInstance} from 'class-transformer';
import {validate} from 'class-validator';
import type {Context} from 'hono';
import {BadRequestHttpError} from '~/Error/HttpError';

type ClassType<T> = new () => T;

/**
 * Bridges the class-validator DTOs to Hono. Validation lives with the shape it validates, so
 * a route never has to restate what a valid body looks like.
 */
export const validateBody = async <T extends object>(
  context: Context,
  dto: ClassType<T>,
): Promise<T> => {
  const raw = await context.req.json().catch(() => {
    throw new BadRequestHttpError('Expected a JSON body');
  });

  const instance = plainToInstance(dto, raw, {enableImplicitConversion: false});
  const errors = await validate(instance as object, {
    forbidUnknownValues: true,
    whitelist: true,
  });

  if (errors.length) {
    const details = errors
      .flatMap((error) => Object.values(error.constraints ?? {}))
      .join('; ');

    throw new BadRequestHttpError(details || 'Invalid request body');
  }

  return instance;
};
