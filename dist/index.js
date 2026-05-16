/**
 * Web Search Pi package
 *
 * Features:
 * - web_search tool     - Search the web using Tavily API
 * - /web-search-status  - Show package/debug status
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { StringEnum } from "@earendil-works/pi-ai";
import { Type } from "typebox";
const sourcePath = fileURLToPath(import.meta.url);
const packageRoot = path.resolve(path.dirname(sourcePath), "..");
let cachedPackageMetadata = null;
function getPackageMetadata() {
    if (cachedPackageMetadata) {
        return cachedPackageMetadata;
    }
    let name = "pi-web-search";
    let version = "0.1.0";
    try {
        const packageJsonPath = path.join(packageRoot, "package.json");
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
        name = packageJson.name ?? name;
        version = packageJson.version ?? version;
    }
    catch {
        // Best-effort metadata only.
    }
    cachedPackageMetadata = {
        name,
        version,
        packageRoot,
        sourcePath,
    };
    return cachedPackageMetadata;
}
export default function webSearchExtension(pi) {
    function sendVisibleMessage(content, details) {
        pi.sendMessage({
            customType: "web-search-status",
            content,
            details,
            display: true,
        });
    }
    pi.registerCommand("web-search-status", {
        description: "Show web-search package status",
        handler: async (_args, _ctx) => {
            const metadata = getPackageMetadata();
            const hasApiKey = !!process.env.TAVILY_API_KEY;
            sendVisibleMessage([
                `${metadata.name} v${metadata.version}`,
                `source: ${metadata.sourcePath}`,
                `tavily_api_key: ${hasApiKey ? "set" : "not set"}`,
            ].join("\n"), {
                packageName: metadata.name,
                version: metadata.version,
                sourcePath: metadata.sourcePath,
                packageRoot: metadata.packageRoot,
                tavilyApiKeySet: hasApiKey,
            });
        },
    });
    pi.registerTool({
        name: "web_search",
        label: "Web Search",
        description: "Search the web using Tavily API. Returns relevant results with summaries and source URLs.",
        promptSnippet: "Search the web for current information, facts, documentation, or news.",
        promptGuidelines: [
            "Prefer Context7 (context7_library / context7_docs) for questions about libraries, frameworks, SDKs, APIs, CLI tools, and cloud services — even well-known ones.",
            "Use web_search for current events, general web research, non-library topics, news, and as a fallback when Context7 returns no relevant results or fails with an auth or quota error.",
            "Use searchDepth 'advanced' only when deeper analysis is needed; default to 'basic' for speed and cost.",
            "Do not include API keys, tokens, or secrets in the query.",
        ],
        parameters: Type.Object({
            query: Type.String({
                description: "Search query string",
            }),
            maxResults: Type.Optional(Type.Number({
                description: "Maximum number of results (1-10)",
                default: 5,
            })),
            searchDepth: Type.Optional(StringEnum(["basic", "advanced"], {
                description: "basic = fast, cheaper | advanced = deeper analysis, slower",
                default: "basic",
            })),
            includeAnswer: Type.Optional(Type.Boolean({
                description: "Include AI-generated answer summary",
                default: true,
            })),
        }),
        async execute(_toolCallId, params, signal) {
            const key = process.env.TAVILY_API_KEY;
            if (!key) {
                throw new Error("TAVILY_API_KEY environment variable not set.\n\nSet it with:\n  export TAVILY_API_KEY='your-key'\n\nThen restart pi or run `/reload`.");
            }
            const maxResults = Math.min(Math.max(params.maxResults ?? 5, 1), 10);
            try {
                const res = await fetch("https://api.tavily.com/search", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        api_key: key,
                        query: params.query,
                        max_results: maxResults,
                        search_depth: params.searchDepth ?? "basic",
                        include_answer: params.includeAnswer ?? true,
                        include_images: false,
                        include_raw_content: false,
                    }),
                    signal,
                });
                if (!res.ok) {
                    const errText = await res.text();
                    throw new Error(`Tavily API error (${res.status}): ${errText}`);
                }
                const data = (await res.json());
                if (!data.results || data.results.length === 0) {
                    return {
                        content: [
                            {
                                type: "text",
                                text: `No results found for: "${params.query}"`,
                            },
                        ],
                        details: {
                            query: data.query,
                            resultCount: 0,
                            responseTime: data.response_time,
                        },
                    };
                }
                const lines = [];
                if (data.answer) {
                    lines.push(`**Answer:** ${data.answer}\n`);
                }
                lines.push(`**Sources (${data.results.length}):**\n`);
                for (const r of data.results) {
                    lines.push(`### [${r.title}](${r.url})`);
                    lines.push(r.content);
                    lines.push("");
                }
                lines.push(`_(Search took ${data.response_time?.toFixed(2) ?? "?"}s)_`);
                return {
                    content: [
                        {
                            type: "text",
                            text: lines.join("\n"),
                        },
                    ],
                    details: {
                        query: data.query,
                        resultCount: data.results.length,
                        responseTime: data.response_time,
                    },
                };
            }
            catch (err) {
                throw new Error(`Search failed: ${err instanceof Error ? err.message : String(err)}`);
            }
        },
    });
}
