import type {
	SearchProvider,
	SearchReadiness,
	SearchRequest,
	SearchResponse,
	SearchRuntime,
} from "../../src/search-provider.js";

export class InMemorySearchProvider implements SearchProvider {
	public lastRequest?: SearchRequest;

	constructor(
		private readonly response:
			| SearchResponse
			| ((request: SearchRequest) => SearchResponse),
		private readonly error?: Error,
	) {}

	async search(request: SearchRequest): Promise<SearchResponse> {
		this.lastRequest = request;

		if (this.error) {
			throw this.error;
		}

		return typeof this.response === "function"
			? this.response(request)
			: this.response;
	}
}

export class InMemorySearchRuntime implements SearchRuntime {
	private readonly provider: InMemorySearchProvider;

	constructor(
		response: SearchResponse | ((request: SearchRequest) => SearchResponse),
		error?: Error,
		private readonly readinessState: SearchReadiness = {
			ready: true,
			providerName: "in-memory",
			tavilyApiKeySet: true,
		},
	) {
		this.provider = new InMemorySearchProvider(response, error);
	}

	get lastRequest(): SearchRequest | undefined {
		return this.provider.lastRequest;
	}

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
