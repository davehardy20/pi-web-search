/**
 * Search provider seam for the web_search tool.
 *
 * The tool depends on this interface, not on any particular search service.
 * Adapters hide transport, payload shape, and service-specific error handling.
 */

export interface SearchResult {
  title: string;
  url: string;
  content: string;
  score: number;
}

export interface SearchRequest {
  query: string;
  maxResults: number;
  searchDepth: "basic" | "advanced";
  includeAnswer: boolean;
  signal?: AbortSignal;
}

export interface SearchResponse {
  query: string;
  answer?: string;
  results: SearchResult[];
  responseTime: number;
}

export interface SearchProvider {
  search(request: SearchRequest): Promise<SearchResponse>;
}

interface TavilyApiResult {
  title: string;
  url: string;
  content: string;
  score: number;
}

interface TavilyApiResponse {
  answer?: string;
  results: TavilyApiResult[];
  query: string;
  response_time: number;
}

export class TavilySearchProvider implements SearchProvider {
  constructor(
    private readonly apiKey: string,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  async search(request: SearchRequest): Promise<SearchResponse> {
    const res = await this.fetchFn("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: this.apiKey,
        query: request.query,
        max_results: request.maxResults,
        search_depth: request.searchDepth,
        include_answer: request.includeAnswer,
        include_images: false,
        include_raw_content: false,
      }),
      signal: request.signal,
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Tavily API error (${res.status}): ${errText}`);
    }

    const data = (await res.json()) as TavilyApiResponse;

    return {
      query: data.query,
      answer: data.answer,
      results: data.results,
      responseTime: data.response_time,
    };
  }
}
