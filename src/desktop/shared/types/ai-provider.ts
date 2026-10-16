export interface AiProviderPublicView {
  baseUrl: string;
  modelId: string;
  hasApiKey: boolean;
}

export interface AiProviderSaveInput {
  baseUrl: string;
  modelId: string;
  apiKey?: string;
}

export interface AiProviderDesktopApi {
  get(): Promise<AiProviderPublicView>;
  save(input: AiProviderSaveInput): Promise<AiProviderPublicView>;
}
