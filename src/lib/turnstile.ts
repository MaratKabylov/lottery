export type TurnstileOptions = {
  sitekey: string;
  size: "flexible";
  language: "ru";
  "response-field": false;
  callback: (token: string) => void;
  "expired-callback": () => void;
  "timeout-callback": () => void;
  "error-callback": () => void;
};

export type TurnstileApi = {
  ready: (callback: () => void) => void;
  render: (container: HTMLElement, options: TurnstileOptions) => string;
  remove: (id: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let loading: Promise<TurnstileApi> | undefined;

export function loadTurnstile(): Promise<TurnstileApi> {
  if (loading) return loading;
  const script = document.createElement("script");
  script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
  script.async = true;
  loading = new Promise<TurnstileApi>((resolve, reject) => {
    const timer = window.setTimeout(fail, 15_000);
    function fail() {
      window.clearTimeout(timer);
      script.remove();
      reject(new Error("Не удалось загрузить проверку. Попробуйте ещё раз."));
    }
    function ready() {
      const api = window.turnstile;
      if (!api) return fail();
      api.ready(() => {
        window.clearTimeout(timer);
        resolve(api);
      });
    }
    if (window.turnstile) ready();
    else {
      script.onload = ready;
      script.onerror = fail;
      document.head.append(script);
    }
  }).catch((error: unknown) => {
    loading = undefined;
    throw error;
  });
  return loading;
}
