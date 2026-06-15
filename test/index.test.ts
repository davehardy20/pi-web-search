import * as fs from "node:fs";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";
import type { SearchResponse } from "../src/search-provider.js";
import { InMemorySearchRuntime } from "./support/in-memory-search-provider.js";

// Mock @earendil-works/pi-ai (provides StringEnum used for searchDepth)
vi.mock("@earendil-works/pi-ai", () => ({
	StringEnum: (values: readonly string[]) =>
		vi.fn().mockReturnValue({ type: "string", enum: values }),
}));

const { default: webSearchExtension } = await import("../src/index.js");

interface ToolDefinition {
	name: string;
	description: string;
	execute: (
		toolCallId: string,
		params: Record<string, unknown>,
		signal: AbortSignal,
	) => Promise<unknown>;
}

interface CommandDefinition {
	description?: string;
	handler: (args: string, ctx: unknown) => Promise<void>;
}

type MockPi = {
	registerCommand: ReturnType<typeof vi.fn>;
	registerTool: ReturnType<typeof vi.fn>;
	sendMessage: ReturnType<typeof vi.fn>;
	commands: Map<string, CommandDefinition>;
	tools: Map<string, ToolDefinition>;
};

function createMockPi(): MockPi {
	const commands = new Map<string, CommandDefinition>();
	const tools = new Map<string, ToolDefinition>();

	return {
		registerCommand: vi.fn((name: string, definition: CommandDefinition) => {
			commands.set(name, definition);
		}),
		registerTool: vi.fn((definition: ToolDefinition) => {
			tools.set(definition.name, definition);
		}),
		sendMessage: vi.fn(),
		commands,
		tools,
	};
}

function createSuccessfulResponse(): SearchResponse {
	return {
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
		responseTime: 0.5,
	};
}

describe("pi-web-search package", () => {
	it("declares the pi-package keyword and extension manifest", () => {
		const packageJson = JSON.parse(
			fs.readFileSync(new URL("../package.json", import.meta.url), "utf8"),
		) as {
			keywords?: string[];
			pi?: { extensions?: string[] };
			peerDependencies?: Record<string, string>;
		};

		expect(packageJson.keywords).toContain("pi-package");
		expect(packageJson.pi?.extensions).toEqual(["./src/index.ts"]);
		expect(packageJson.peerDependencies).toMatchObject({
			"@earendil-works/pi-coding-agent": "*",
			"@earendil-works/pi-ai": "*",
			typebox: "*",
		});
	});

	it("does not include pi-tui as a peer dependency", () => {
		const packageJson = JSON.parse(
			fs.readFileSync(new URL("../package.json", import.meta.url), "utf8"),
		) as {
			peerDependencies?: Record<string, string>;
		};

		expect(packageJson.peerDependencies).not.toHaveProperty(
			"@earendil-works/pi-tui",
		);
	});

	it("registers web_search tool and web-search-status command", () => {
		const pi = createMockPi();

		webSearchExtension(pi as unknown as ExtensionAPI);

		expect(pi.commands.has("web-search-status")).toBe(true);
		expect(pi.tools.has("web_search")).toBe(true);
	});

	it("emits package metadata from /web-search-status", async () => {
		const originalKey = process.env.TAVILY_API_KEY;
		delete process.env.TAVILY_API_KEY;

		try {
			const pi = createMockPi();
			webSearchExtension(pi as unknown as ExtensionAPI);

			const statusCommand = pi.commands.get("web-search-status");
			expect(statusCommand).toBeDefined();
			if (!statusCommand) throw new Error("web-search-status not registered");

			await statusCommand.handler("", {});

			expect(pi.sendMessage).toHaveBeenCalledWith(
				expect.objectContaining({
					customType: "web-search-status",
					display: true,
					content: expect.stringContaining("@davehardy20/pi-web-search v0.1.0"),
					details: expect.objectContaining({
						packageName: "@davehardy20/pi-web-search",
						version: "0.1.0",
						tavilyApiKeySet: false,
						searchReady: false,
						searchProvider: "tavily",
					}),
				}),
			);
			expect(pi.sendMessage).toHaveBeenCalledWith(
				expect.objectContaining({
					content: expect.stringContaining("tavily_api_key: not set"),
				}),
			);
			expect(pi.sendMessage).toHaveBeenCalledWith(
				expect.objectContaining({
					content: expect.stringContaining("search_ready: not ready"),
				}),
			);
		} finally {
			if (originalKey !== undefined) {
				process.env.TAVILY_API_KEY = originalKey;
			}
		}
	});

	it("shows api key as set when TAVILY_API_KEY is present", async () => {
		const originalKey = process.env.TAVILY_API_KEY;
		process.env.TAVILY_API_KEY = "test-key";

		try {
			const pi = createMockPi();
			webSearchExtension(pi as unknown as ExtensionAPI);

			const statusCommand = pi.commands.get("web-search-status");
			expect(statusCommand).toBeDefined();
			if (!statusCommand) throw new Error("web-search-status not registered");

			await statusCommand.handler("", {});

			expect(pi.sendMessage).toHaveBeenCalledWith(
				expect.objectContaining({
					details: expect.objectContaining({
						tavilyApiKeySet: true,
						searchReady: true,
						searchProvider: "tavily",
					}),
				}),
			);
			expect(pi.sendMessage).toHaveBeenCalledWith(
				expect.objectContaining({
					content: expect.stringContaining("tavily_api_key: set"),
				}),
			);
			expect(pi.sendMessage).toHaveBeenCalledWith(
				expect.objectContaining({
					content: expect.stringContaining("search_ready: ready"),
				}),
			);
		} finally {
			if (originalKey !== undefined) {
				process.env.TAVILY_API_KEY = originalKey;
			} else {
				delete process.env.TAVILY_API_KEY;
			}
		}
	});

	it("web_search throws when TAVILY_API_KEY is not set", async () => {
		const originalKey = process.env.TAVILY_API_KEY;
		delete process.env.TAVILY_API_KEY;

		try {
			const pi = createMockPi();
			webSearchExtension(pi as unknown as ExtensionAPI);

			const tool = pi.tools.get("web_search");
			expect(tool).toBeDefined();
			if (!tool) throw new Error("web_search tool not registered");

			await expect(
				tool.execute("tc1", { query: "test" }, new AbortController().signal),
			).rejects.toThrow("TAVILY_API_KEY environment variable not set");
		} finally {
			if (originalKey !== undefined) {
				process.env.TAVILY_API_KEY = originalKey;
			}
		}
	});

	it("web_search with injected runtime does not require TAVILY_API_KEY", async () => {
		const originalKey = process.env.TAVILY_API_KEY;
		delete process.env.TAVILY_API_KEY;

		try {
			const runtime = new InMemorySearchRuntime(createSuccessfulResponse());
			const pi = createMockPi();
			webSearchExtension(pi as unknown as ExtensionAPI, runtime);

			const tool = pi.tools.get("web_search");
			expect(tool).toBeDefined();
			if (!tool) throw new Error("web_search tool not registered");

			const result = (await tool.execute(
				"tc1",
				{ query: "test query" },
				new AbortController().signal,
			)) as {
				details: { resultCount: number };
			};

			expect(result.details.resultCount).toBe(1);
			expect(runtime.lastRequest?.query).toBe("test query");
		} finally {
			if (originalKey !== undefined) {
				process.env.TAVILY_API_KEY = originalKey;
			}
		}
	});

	it("web_search normalizes parameters before calling the runtime", async () => {
		const runtime = new InMemorySearchRuntime(createSuccessfulResponse());
		const pi = createMockPi();
		webSearchExtension(pi as unknown as ExtensionAPI, runtime);

		const tool = pi.tools.get("web_search");
		expect(tool).toBeDefined();
		if (!tool) throw new Error("web_search tool not registered");
		await tool.execute(
			"tc1",
			{ query: "test query", maxResults: 25, searchDepth: "advanced" },
			new AbortController().signal,
		);

		expect(runtime.lastRequest).toMatchObject({
			query: "test query",
			maxResults: 10,
			searchDepth: "advanced",
			includeAnswer: true,
		});

		await tool.execute(
			"tc2",
			{ query: "test query", maxResults: -5, includeAnswer: false },
			new AbortController().signal,
		);

		expect(runtime.lastRequest).toMatchObject({
			query: "test query",
			maxResults: 1,
			searchDepth: "basic",
			includeAnswer: false,
		});
	});

	it("web_search returns results from the search runtime", async () => {
		const pi = createMockPi();
		webSearchExtension(
			pi as unknown as ExtensionAPI,
			new InMemorySearchRuntime(createSuccessfulResponse()),
		);

		const tool = pi.tools.get("web_search");
		expect(tool).toBeDefined();
		if (!tool) throw new Error("web_search tool not registered");
		const result = (await tool.execute(
			"tc1",
			{ query: "test query" },
			new AbortController().signal,
		)) as {
			content: Array<{ type: string; text: string }>;
			details: { query: string; resultCount: number; responseTime: number };
		};

		expect(result.content[0].type).toBe("text");
		expect(result.content[0].text).toContain("Test answer");
		expect(result.content[0].text).toContain("Test Result");
		expect(result.details.resultCount).toBe(1);
		expect(result.details.query).toBe("test query");
	});

	it("web_search returns no-results message when runtime returns empty", async () => {
		const pi = createMockPi();
		webSearchExtension(
			pi as unknown as ExtensionAPI,
			new InMemorySearchRuntime({
				query: "obscure query",
				results: [],
				responseTime: 0.3,
			}),
		);

		const tool = pi.tools.get("web_search");
		expect(tool).toBeDefined();
		if (!tool) throw new Error("web_search tool not registered");
		const result = (await tool.execute(
			"tc1",
			{ query: "obscure query" },
			new AbortController().signal,
		)) as {
			content: Array<{ type: string; text: string }>;
			details: { resultCount: number };
		};

		expect(result.content[0].text).toContain("No results found");
		expect(result.details.resultCount).toBe(0);
	});

	it("web_search throws on runtime error", async () => {
		const pi = createMockPi();
		webSearchExtension(
			pi as unknown as ExtensionAPI,
			new InMemorySearchRuntime(
				createSuccessfulResponse(),
				new Error("Tavily API error (401): Unauthorized"),
			),
		);

		const tool = pi.tools.get("web_search");
		expect(tool).toBeDefined();
		if (!tool) throw new Error("web_search tool not registered");
		await expect(
			tool.execute("tc1", { query: "test" }, new AbortController().signal),
		).rejects.toThrow("Search failed: Tavily API error (401): Unauthorized");
	});
});
