import {useEffect, useRef} from 'react';

// hl=en keeps the Google button in English whatever the browser language.
const GSI_SRC = 'https://accounts.google.com/gsi/client?hl=en';

interface GoogleCredentialResponse {
  credential: string;
}

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            callback: (response: GoogleCredentialResponse) => void;
            client_id: string;
          }) => void;
          renderButton: (element: HTMLElement, options: Record<string, unknown>) => void;
        };
      };
    };
  }
}

const loadGsiScript = () =>
  new Promise<void>((resolve, reject) => {
    if (window.google?.accounts?.id) {
      resolve();
      return;
    }

    const existing = document.querySelector<HTMLScriptElement>(`script[src="${GSI_SRC}"]`);

    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('Failed to load Google script')));
      return;
    }

    const script = document.createElement('script');
    script.src = GSI_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Google script'));
    document.head.appendChild(script);
  });

/** Google only accepts a pixel width, and only within these bounds. */
const MIN_WIDTH = 200;
const MAX_WIDTH = 400;

/**
 * Google draws this button itself, so it cannot be stretched with CSS: the width has to be
 * measured and handed over. Re-measured on resize, otherwise it stops matching the fields
 * below it as soon as the card changes size.
 */
export const useGoogleSignIn = (onCredential: (idToken: string) => void, clientId?: string) => {
  const buttonRef = useRef<HTMLDivElement>(null);
  const callbackRef = useRef(onCredential);
  callbackRef.current = onCredential;

  useEffect(() => {
    let cancelled = false;
    let renderedWidth = 0;
    let observer: ResizeObserver | undefined;

    const render = () => {
      const element = buttonRef.current;

      if (cancelled || !element || !window.google) return;

      const width = Math.round(
        Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, element.offsetWidth)),
      );

      // Rendering rewrites the element, which wakes the observer up again.
      if (width === renderedWidth) return;

      renderedWidth = width;
      window.google.accounts.id.renderButton(element, {
        // Google renders the button in the browser language unless told otherwise.
        locale: 'en',
        shape: 'pill',
        size: 'large',
        text: 'continue_with',
        theme: 'outline',
        width,
      });
    };

    if (!clientId) return undefined;

    loadGsiScript()
      .then(() => {
        if (cancelled || !buttonRef.current || !window.google) return;

        window.google.accounts.id.initialize({
          callback: ({credential}) => callbackRef.current(credential),
          client_id: clientId,
        });

        render();

        observer = new ResizeObserver(render);
        observer.observe(buttonRef.current);
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
      observer?.disconnect();
    };
  }, [clientId]);

  return buttonRef;
};
