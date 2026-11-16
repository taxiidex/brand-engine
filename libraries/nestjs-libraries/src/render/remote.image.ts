import { Logger } from '@nestjs/common';
import { getSsrfSafeDispatcher } from '@gitroom/nestjs-libraries/dtos/webhooks/ssrf.safe.dispatcher';

const logger = new Logger('downloadImage');

// Free photo CDNs throttle one server to roughly a download every few
// seconds and answer 429 in between (measured on Pixabay: the block lasts
// 3 to 9 seconds), so retries back off for up to about 15 seconds in total.
const RETRY_DELAYS_MS = [1500, 3000, 4500, 6000];
const ATTEMPTS = RETRY_DELAYS_MS.length + 1;
const RETRY_STATUS = new Set([429, 500, 502, 503, 504]);
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Downloads an image for the renderer. Every request, including each redirect
// hop, goes through the SSRF-safe dispatcher; the body is cut off at maxBytes
// and a download that is too big or fails gives back undefined, so a missing
// logo or photo never stops a post from being created. A temporary failure is
// retried a couple of times before giving up.
export async function downloadImage(
  url: string,
  maxBytes: number,
  allowedHosts?: string[]
): Promise<Buffer | undefined> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch (err) {
    return undefined;
  }
  if (parsed.protocol !== 'https:') {
    return undefined;
  }
  if (
    allowedHosts &&
    !allowedHosts.some(
      (host) => parsed.hostname === host || parsed.hostname.endsWith(`.${host}`)
    )
  ) {
    return undefined;
  }

  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    try {
      const res = await fetch(url, {
        // @ts-ignore undici option, not in lib.dom fetch types
        dispatcher: getSsrfSafeDispatcher(),
        redirect: 'follow',
        signal: AbortSignal.timeout(15_000),
        headers: {
          'user-agent': 'Mozilla/5.0 (compatible; BrandEngineBot/1.0)',
        },
      });

      if (!res.ok || !res.body) {
        await res.body?.cancel().catch(() => undefined);
        if (RETRY_STATUS.has(res.status) && attempt < ATTEMPTS) {
          const retryAfter = Number(res.headers.get('retry-after') || 0);
          await sleep(
            Math.max(
              RETRY_DELAYS_MS[attempt - 1],
              Math.min(retryAfter, 10) * 1000
            )
          );
          continue;
        }
        logger.warn(`${parsed.hostname} answered ${res.status}`);
        return undefined;
      }

      const declared = Number(res.headers.get('content-length') || 0);
      if (declared > maxBytes) {
        await res.body.cancel().catch(() => undefined);
        logger.warn(`${parsed.hostname} image is too big (${declared} bytes)`);
        return undefined;
      }

      const reader = res.body.getReader();
      const chunks: Uint8Array[] = [];
      let total = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done || !value) {
          break;
        }
        total += value.length;
        if (total > maxBytes) {
          await reader.cancel().catch(() => undefined);
          logger.warn(`${parsed.hostname} image is too big`);
          return undefined;
        }
        chunks.push(value);
      }
      return Buffer.concat(chunks);
    } catch (err) {
      if (attempt < ATTEMPTS) {
        await sleep(RETRY_DELAYS_MS[attempt - 1]);
        continue;
      }
      logger.warn(`${parsed.hostname} download failed: ${err}`);
    }
  }
  return undefined;
}
