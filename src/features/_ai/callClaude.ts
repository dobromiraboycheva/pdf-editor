/**
 * Minimal direct-to-Anthropic client for browser use.
 * Requires the user's own API key. Sends the `anthropic-dangerous-direct-browser-access`
 * header so the API accepts calls from a browser origin.
 */

export interface ClaudeCallOptions {
  apiKey: string;
  model: string;
  system?: string;
  prompt: string;
  maxTokens?: number;
  signal?: AbortSignal;
}

interface ClaudeMessagesResponse {
  content: { type: string; text?: string }[];
}

export async function callClaude(opts: ClaudeCallOptions): Promise<string> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': opts.apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: opts.model,
      max_tokens: opts.maxTokens ?? 4096,
      ...(opts.system ? { system: opts.system } : {}),
      messages: [{ role: 'user', content: opts.prompt }],
    }),
    signal: opts.signal,
  });
  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(
      `Claude API ${response.status}: ${errText || response.statusText}`,
    );
  }
  const data = (await response.json()) as ClaudeMessagesResponse;
  return data.content
    .filter((b): b is { type: 'text'; text: string } =>
      b.type === 'text' && typeof b.text === 'string',
    )
    .map((b) => b.text)
    .join('\n');
}
