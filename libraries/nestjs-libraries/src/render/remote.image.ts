import { getSsrfSafeDispatcher } from '@gitroom/nestjs-libraries/dtos/webhooks/ssrf.safe.dispatcher';

// Downloads an image for the renderer. Every request, including each redirect
// hop, goes through the SSRF-safe dispatcher; the body is cut off at maxBytes
// and a download that is too big or fails gives back undefined, so a missing
// logo or photo never stops a post from being created.
export async function downloadImage(
  url: string,
  maxBytes: number,
  allowedHosts?: string[]
): Promise<Buffer | undefined> {
  try {
    const parsed = new URL(url);
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

    const res = await fetch(url, {
      // @ts-ignore undici option, not in lib.dom fetch types
      dispatcher: getSsrfSafeDispatcher(),
      redirect: 'follow',
      signal: AbortSignal.timeout(15_000),
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; BrandEngineBot/1.0)' },
    });
    if (!res.ok || !res.body) {
      return undefined;
    }
    const declared = Number(res.headers.get('content-length') || 0);
    if (declared > maxBytes) {
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
        return undefined;
      }
      chunks.push(value);
    }
    return Buffer.concat(chunks);
  } catch (err) {
    return undefined;
  }
}
