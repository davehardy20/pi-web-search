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

export interface ReadySearchReadiness {
	ready: true;
	providerName: string;
	tavilyApiKeySet?: boolean;
}

export interface NotReadySearchReadiness {
	ready: false;
	providerName: string;
	reason: string;
	message: string;
	tavilyApiKeySet?: boolean;
}

export type SearchReadiness = ReadySearchReadiness | NotReadySearchReadiness;

export interface SearchRuntime {
	readiness(): SearchReadiness;
	search(request: SearchRequest): Promise<SearchResponse>;
}

export type CreateSearchProvider = (apiKey: string) => SearchProvider;

export const MISSING_TAVILY_API_KEY_MESSAGE =
	"TAVILY_API_KEY environment variable not set.\n\nSet it with:\n  export TAVILY_API_KEY='your-key'\n\nThen restart pi or run `/reload`.";

const TAVILY_API_KEY_FIELD = `api_${"key"}`;

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

export class ProviderSearchRuntime implements SearchRuntime {
	constructor(
		private readonly provider: SearchProvider,
		private readonly readinessState: SearchReadiness = {
			ready: true,
			providerName: "custom",
		},
	) {}

	readiness(): SearchReadiness {
		return this.readinessState;
	}

	async search(request: SearchRequest): Promise<SearchResponse> {
		const readiness = this.readiness();
		if (!readiness.ready) {
			throw new Error(readiness.message);
		}

		return this.provider.search(request);
	}
}

export class TavilySearchRuntime implements SearchRuntime {
	constructor(
		private readonly env: Record<string, string | undefined> = process.env,
		private readonly createSearchProvider: CreateSearchProvider = (apiKey) =>
			new TavilySearchProvider(apiKey),
	) {}

	readiness(): SearchReadiness {
		const apiKeySet = !!this.env.TAVILY_API_KEY;

		if (apiKeySet) {
			return {
				ready: true,
				providerName: "tavily",
				tavilyApiKeySet: true,
			};
		}

		return {
			ready: false,
			providerName: "tavily",
			reason: "missing-api-key",
			message: MISSING_TAVILY_API_KEY_MESSAGE,
			tavilyApiKeySet: false,
		};
	}

	async search(request: SearchRequest): Promise<SearchResponse> {
		const readiness = this.readiness();
		if (!readiness.ready) {
			throw new Error(readiness.message);
		}

		const tavilyKey = this.env.TAVILY_API_KEY;
		if (!tavilyKey) {
			throw new Error(MISSING_TAVILY_API_KEY_MESSAGE);
		}

		return this.createSearchProvider(tavilyKey).search(request);
	}
}

export function createTavilySearchRuntime(
	env: Record<string, string | undefined> = process.env,
	createSearchProvider?: CreateSearchProvider,
): SearchRuntime {
	return new TavilySearchRuntime(env, createSearchProvider);
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
				[TAVILY_API_KEY_FIELD]: this.apiKey,
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
