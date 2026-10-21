import type {Context} from 'hono';
import {HttpError} from '~/Error/HttpError';
import {logger} from '~/logger';

export const errorHandler = (error: Error, context: Context): Response => {
  if (error instanceof HttpError) {
    // 4xx are the domain talking, not incidents: logged at debug, never at error.
    logger.debug({err: error, path: context.req.path}, 'Request refused');

    return context.json({message: error.message}, error.status as 400);
  }

  logger.error({err: error, path: context.req.path}, 'Unhandled error');

  return context.json({message: 'Internal server error'}, 500);
};
