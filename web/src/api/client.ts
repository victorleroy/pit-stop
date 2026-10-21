// Defaults to the dev server proxy, so the app works through a tunnel without rebuilding.
const API_URL = import.meta.env.VITE_API_URL || '/api';

const TOKEN_KEY = 'pit-stop.token';

/** Dispatched when the service no longer accepts the session, so the app signs out. */
export const UNAUTHORIZED_EVENT = 'pit-stop:unauthorized';

export const tokenStorage = {
  clear: () => localStorage.removeItem(TOKEN_KEY),
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (token: string) => localStorage.setItem(TOKEN_KEY, token),
};

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export const request = async <T>(
  path: string,
  options: {body?: unknown; method?: string} = {},
): Promise<T> => {
  const token = tokenStorage.get();

  const response = await fetch(`${API_URL}${path}`, {
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    headers: {
      ...(options.body === undefined ? {} : {'Content-Type': 'application/json'}),
      ...(token ? {Authorization: `Bearer ${token}`} : {}),
    },
    method: options.method ?? 'GET',
  });

  if (response.status === 401 && token) {
    tokenStorage.clear();
    window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
  }

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new ApiError(response.status, payload.message ?? response.statusText);
  }

  if (response.status === 204 || response.status === 202) {
    return undefined as T;
  }

  return (await response.json()) as T;
};
