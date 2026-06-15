import { describe, expect, it, vi } from "vitest";
import {
	MISSING_TAVILY_API_KEY_MESSAGE,
	ProviderSearchRuntime,
	type SearchRequest,
	TavilySearchProvider,
	TavilySearchRuntime,
} from "../src/search-provider.js";

function createMockFetch(
	response: {
		ok: boolean;
		status: number;
		json?: () => Promise<unknown>;
		text?: () => Promise<string>;
	} = {
		ok: true,
		status: 200,
		json: async () => ({
			query: "test query",
			answer: "Test answer",
			results: [
				{
					title: "Test Result",
					url: "https://example.com",
					content: "Test content",
					score: 0.95,
				},
			],
			response_time: 0.5,
		}),
		text: async () => "",
	},
): {
	fetch: typeof fetch;
	lastCall: { url: string; init: RequestInit };
} {
	const lastCall = { url: "", init: {} as RequestInit };

	const fetchFn = vi.fn(async (url: string, init: RequestInit) => {
		lastCall.url = url;
		lastCall.init = init;
		return response as Response;
	});

	return { fetch: fetchFn as unknown as typeof fetch, lastCall };
}

describe("TavilySearchProvider", () => {
	it("calls the Tavily search endpoint with the expected payload", async () => {
		const { fetch: fetchFn, lastCall } = createMockFetch();

		const provider = new TavilySearchProvider("test-key", fetchFn);
		const request: SearchRequest = {
			query: "test query",
			maxResults: 3,
			searchDepth: "advanced",
			includeAnswer: false,
		};

		const result = await provider.search(request);

		expect(lastCall.url).toBe("https://api.tavily.com/search");
		expect(lastCall.init.method).toBe("POST");
		expect(lastCall.init.headers).toMatchObject({
			"Content-Type": "application/json",
		});

		const body = JSON.parse(lastCall.init.body as string);
		expect(body).toMatchObject({
			query: "test query",
			max_results: 3,
			search_depth: "advanced",
			include_answer: false,
			include_images: false,
			include_raw_content: false,
		});
		expect(body.api_key).toBe("test-key");

		expect(result.query).toBe("test query");
		expect(result.answer).toBe("Test answer");
		expect(result.results).toHaveLength(1);
		expect(result.responseTime).toBe(0.5);
	});

	it("throws a formatted error when the Tavily API returns a non-OK response", async () => {
		const { fetch: fetchFn } = createMockFetch({
			ok: false,
			status: 401,
			text: async () => "Unauthorized",
		});

		const provider = new TavilySearchProvider("test-key", fetchFn);
		const request: SearchRequest = {
			query: "test",
			maxResults: 5,
			searchDepth: "basic",
			includeAnswer: true,
		};

		await expect(provider.search(request)).rejects.toThrow(
			"Tavily API error (401): Unauthorized",
		);
	});

	it("passes the abort signal to fetch", async () => {
		const { fetch: fetchFn, lastCall } = createMockFetch({
			ok: true,
			status: 200,
			json: async () => ({
				query: "test",
				results: [],
				response_time: 0.1,
			}),
			text: async () => "",
		});

		const controller = new AbortController();
		const provider = new TavilySearchProvider("test-key", fetchFn);
		const request: SearchRequest = {
			query: "test",
			maxResults: 5,
			searchDepth: "basic",
			includeAnswer: true,
			signal: controller.signal,
		};

		await provider.search(request);

		expect(lastCall.init.signal).toBe(controller.signal);
	});
});

describe("SearchRuntime", () => {
	it("reports Tavily as not ready when the API key is missing", async () => {
		const runtime = new TavilySearchRuntime({});

		expect(runtime.readiness()).toEqual({
			ready: false,
			providerName: "tavily",
			reason: "missing-api-key",
			message: MISSING_TAVILY_API_KEY_MESSAGE,
			tavilyApiKeySet: false,
		});
		await expect(
			runtime.search({
				query: "test",
				maxResults: 5,
				searchDepth: "basic",
				includeAnswer: true,
			}),
		).rejects.toThrow("TAVILY_API_KEY environment variable not set");
	});

	it("creates the Tavily provider only when searching with a ready runtime", async () => {
		const provider = new ProviderSearchRuntime({
			search: async (request) => ({
				query: request.query,
				results: [],
				responseTime: 0.1,
			}),
		});
		const createSearchProvider = vi.fn(() => provider);
		const runtime = new TavilySearchRuntime(
			{ TAVILY_API_KEY: "test-key" },
			createSearchProvider,
		);

		expect(runtime.readiness()).toEqual({
			ready: true,
			providerName: "tavily",
			tavilyApiKeySet: true,
		});
		const response = await runtime.search({
			query: "test query",
			maxResults: 5,
			searchDepth: "basic",
			includeAnswer: true,
		});

		expect(createSearchProvider).toHaveBeenCalledWith("test-key");
		expect(response.query).toBe("test query");
	});
});
