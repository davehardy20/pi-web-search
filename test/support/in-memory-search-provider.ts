import type {
  SearchProvider,
  SearchRequest,
  SearchResponse,
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
