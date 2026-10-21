export class HttpError extends Error {
  public constructor(
    public readonly status: number,
    message: string,
    public readonly cause?: Error,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class BadRequestHttpError extends HttpError {
  public constructor(message: string, cause?: Error) {
    super(400, message, cause);
  }
}

export class UnauthorizedHttpError extends HttpError {
  public constructor(message: string, cause?: Error) {
    super(401, message, cause);
  }
}

export class ForbiddenHttpError extends HttpError {
  public constructor(message: string, cause?: Error) {
    super(403, message, cause);
  }
}

export class NotFoundHttpError extends HttpError {
  public constructor(message: string, cause?: Error) {
    super(404, message, cause);
  }
}

export class ConflictHttpError extends HttpError {
  public constructor(message: string, cause?: Error) {
    super(409, message, cause);
  }
}

export class TooManyRequestsHttpError extends HttpError {
  public constructor(message: string, cause?: Error) {
    super(429, message, cause);
  }
}
