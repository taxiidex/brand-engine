import { Injectable, Logger } from '@nestjs/common';
import OpenAI from 'openai';
import { zodResponseFormat } from 'openai/helpers/zod';
import { z } from 'zod';

export type LlmProvider = 'openai' | 'anthropic';

interface ObjectRequest<T extends z.ZodTypeAny> {
  // what the model is told it is, and what it must do
  system: string;
  user: string;
  // the shape of the answer, checked again here before it is returned
  schema: T;
  name: string;
  maxTokens: number;
}

// One place that decides which AI answers: OpenAI or Claude. Set with
//   LLM_PROVIDER = openai | anthropic   (default: whichever has a key)
//   LLM_MODEL    = a model id           (default depends on the provider)
// plus OPENAI_API_KEY or ANTHROPIC_API_KEY.
@Injectable()
export class LlmService {
  private readonly _logger = new Logger(LlmService.name);

  provider(): LlmProvider | undefined {
    const wanted = (process.env.LLM_PROVIDER || '').toLowerCase();
    if (wanted === 'openai' || wanted === 'anthropic') {
      return wanted;
    }
    if (process.env.ANTHROPIC_API_KEY && !process.env.OPENAI_API_KEY) {
      return 'anthropic';
    }
    return process.env.OPENAI_API_KEY ? 'openai' : undefined;
  }

  isConfigured() {
    const provider = this.provider();
    return provider === 'anthropic'
      ? !!process.env.ANTHROPIC_API_KEY
      : provider === 'openai'
      ? !!process.env.OPENAI_API_KEY
      : false;
  }

  // Asks for an answer that matches the schema. Gives back undefined when no
  // AI is configured or the answer did not match; throws when the provider
  // itself fails, so the caller can tell the user why.
  async generateObject<T extends z.ZodTypeAny>(
    request: ObjectRequest<T>
  ): Promise<z.infer<T> | undefined> {
    if (!this.isConfigured()) {
      return undefined;
    }
    return this.provider() === 'anthropic'
      ? this.withClaude(request)
      : this.withOpenai(request);
  }

  private async withOpenai<T extends z.ZodTypeAny>(request: ObjectRequest<T>) {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const result = await client.chat.completions.parse(
      {
        model: process.env.LLM_MODEL || 'gpt-4.1',
        max_completion_tokens: request.maxTokens,
        messages: [
          { role: 'system', content: request.system },
          { role: 'user', content: request.user },
        ],
        response_format: zodResponseFormat(request.schema, request.name),
      },
      { timeout: 60 * 1000, maxRetries: 1 }
    );
    return (result.choices[0].message.parsed as z.infer<T>) || undefined;
  }

  // Claude answers by calling a tool whose input is the schema, which makes
  // the answer a JSON object. Newer models reject a forced tool choice, so the
  // tool is only strongly asked for, and JSON in a text reply is accepted too.
  private async withClaude<T extends z.ZodTypeAny>(request: ObjectRequest<T>) {
    const jsonSchema = zodResponseFormat(request.schema, request.name)
      .json_schema.schema;

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: process.env.LLM_MODEL || 'claude-sonnet-5-5',
        max_tokens: request.maxTokens,
        system: `${request.system}

Answer only by calling the ${request.name} tool.`,
        messages: [{ role: 'user', content: request.user }],
        tools: [
          {
            name: request.name,
            description: 'Return the answer in this exact structure.',
            input_schema: jsonSchema,
          },
        ],
        tool_choice: { type: 'auto' },
      }),
      signal: AbortSignal.timeout(60_000),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`Claude request failed (${res.status}) ${detail.slice(0, 200)}`);
    }

    const data = (await res.json()) as {
      content?: { type: string; input?: unknown; text?: string }[];
    };
    const input =
      data.content?.find((b) => b.type === 'tool_use')?.input ??
      this.jsonFromText(data.content?.find((b) => b.type === 'text')?.text);
    const parsed = request.schema.safeParse(input);
    if (!parsed.success) {
      this._logger.warn(
        `Claude answer for ${request.name} did not match the schema: ${parsed.error.message.slice(0, 300)}`
      );
      return undefined;
    }
    return parsed.data as z.infer<T>;
  }

  private jsonFromText(text?: string): unknown {
    const start = text?.indexOf('{') ?? -1;
    const end = text?.lastIndexOf('}') ?? -1;
    if (!text || start < 0 || end <= start) {
      return undefined;
    }
    try {
      return JSON.parse(text.slice(start, end + 1));
    } catch (err) {
      return undefined;
    }
  }
}
