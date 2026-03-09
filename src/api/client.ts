import { RETRY_CONFIG } from '../config.js';
import { log } from '../logger.js';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchJson<T>(url: string): Promise<T> {
  const { maxRetries, baseDelay, maxDelay, timeout } = RETRY_CONFIG;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(timeout),
        headers: { Accept: 'application/json' },
      });

      if (response.status === 429) {
        const retryAfter = parseInt(response.headers.get('Retry-After') ?? '60', 10);
        log('warn', `Rate limited (429). Waiting ${retryAfter}s before retry...`);
        await sleep(retryAfter * 1000);
        continue;
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return (await response.json()) as T;
    } catch (err) {
      if (attempt === maxRetries) {
        throw err;
      }
      const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
      log('warn', `Attempt ${attempt + 1} failed: ${err}. Retrying in ${delay}ms...`);
      await sleep(delay);
    }
  }

  throw new Error('Unreachable');
}

export { sleep };
