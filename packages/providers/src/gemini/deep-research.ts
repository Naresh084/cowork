import { GoogleGenAI } from '@google/genai';

export interface DeepResearchOptions {
  query: string;
  files?: string[];
  outputFormat?: 'markdown' | 'json';
  onProgress?: (status: string, progress: number) => void;
  /** Override the deep research agent model (default: deep-research-pro-preview-12-2025) */
  agent?: string;
}

export interface DeepResearchResult {
  report: string;
  citations: Array<{ title: string; url: string }>;
  searchQueries: string[];
  duration: number;
}

function buildUserContent(options: DeepResearchOptions): string {
  const parts: string[] = [options.query];

  if (options.outputFormat === 'json') {
    parts.push('Respond with a JSON object only.');
  }

  if (options.files && options.files.length > 0) {
    parts.push(`Context files:\n${options.files.join('\n')}`);
  }

  return parts.join('\n\n');
}

function extractCitations(result: unknown): Array<{ title: string; url: string }> {
  const citations: Array<{ title: string; url: string }> = [];
  const seen = new Set<string>();

  const resultAny = result as {
    metadata?: {
      citations?: Array<{ title?: string; url?: string }>;
      groundingMetadata?: {
        groundingChunks?: Array<{ web?: { title?: string; uri?: string } }>;
      };
    };
    outputs?: Array<{
      text?: string;
      citations?: Array<{ title?: string; url?: string }>;
      metadata?: { citations?: Array<{ title?: string; url?: string }> };
    }>;
  };

  const pushCitation = (title: string | undefined, url: string | undefined) => {
    if (!url) return;
    if (seen.has(url)) return;
    seen.add(url);
    citations.push({ title: title || url, url });
  };

  const metadataCitations = resultAny.metadata?.citations ?? [];
  for (const citation of metadataCitations) {
    pushCitation(citation.title, citation.url);
  }

  const outputCitations = resultAny.outputs ?? [];
  for (const output of outputCitations) {
    const direct = output.citations ?? [];
    const nested = output.metadata?.citations ?? [];
    for (const citation of [...direct, ...nested]) {
      pushCitation(citation.title, citation.url);
    }
  }

  const groundingChunks = resultAny.metadata?.groundingMetadata?.groundingChunks ?? [];
  for (const chunk of groundingChunks) {
    pushCitation(chunk.web?.title, chunk.web?.uri);
  }

  return citations;
}

export async function runDeepResearch(
  apiKey: string,
  options: DeepResearchOptions
): Promise<DeepResearchResult> {
  const ai = new GoogleGenAI({ apiKey });
  const startTime = Date.now();

  // Use provided agent or default
  const agentModel = options.agent || 'deep-research-pro-preview-12-2025';

  const interaction = await ai.interactions.create({
    agent: agentModel,
    input: buildUserContent(options),
    background: true,
  });

  let result: unknown;

  while (true) {
    result = await ai.interactions.get(interaction.id);
    const resultAny = result as { status?: string; error?: { message?: string } };

    if (resultAny.status === 'completed') break;
    if (resultAny.status === 'failed' || resultAny.status === 'cancelled') {
      throw new Error(`Research failed: ${resultAny.error?.message || resultAny.status || 'Unknown error'}`);
    }

    options.onProgress?.(resultAny.status || 'running', 0);
    await new Promise((resolve) => setTimeout(resolve, 10000));
  }

  const resultAny = result as {
    outputs?: Array<{ text?: string }>;
    metadata?: { searchQueries?: string[]; webSearchQueries?: string[] };
  };

  const outputs = resultAny.outputs ?? [];
  const lastOutput = outputs[outputs.length - 1];

  return {
    report: lastOutput?.text || '',
    citations: extractCitations(result),
    searchQueries: resultAny.metadata?.searchQueries
      ?? resultAny.metadata?.webSearchQueries
      ?? [],
    duration: Date.now() - startTime,
  };
}
