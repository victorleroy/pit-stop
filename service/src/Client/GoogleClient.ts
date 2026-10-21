import {OAuth2Client} from 'google-auth-library';
import {UnauthorizedHttpError} from '~/Error/HttpError';

export interface GoogleProfile {
  email: string;
  name: string;
  pictureUrl?: string;
  sub: string;
}

export class GoogleClient {
  private readonly client: OAuth2Client;

  public constructor(private readonly clientId: string) {
    this.client = new OAuth2Client(clientId);
  }

  public async verifyIdToken(idToken: string): Promise<GoogleProfile> {
    try {
      const ticket = await this.client.verifyIdToken({audience: this.clientId, idToken});
      const payload = ticket.getPayload();

      if (!payload?.sub || !payload.email) {
        throw new UnauthorizedHttpError('Malformed Google token');
      }

      if (!payload.email_verified) {
        throw new UnauthorizedHttpError('This Google account has no verified email');
      }

      return {
        email: payload.email.toLowerCase(),
        name: payload.name ?? payload.email,
        ...(payload.picture ? {pictureUrl: payload.picture} : {}),
        sub: payload.sub,
      };
    } catch (error: unknown) {
      if (error instanceof UnauthorizedHttpError) {
        throw error;
      }

      throw new UnauthorizedHttpError('Invalid Google token', error as Error);
    }
  }
}
