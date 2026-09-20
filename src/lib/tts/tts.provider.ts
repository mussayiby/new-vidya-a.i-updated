export type TtsSynthesisRequest = {
  text: string;
  language: string;
  segmentId: string;
};

export type TtsSynthesisResult = {
  audio: Uint8Array;
  mimeType: "audio/wav";
  provider: string;
  language: string;
  cacheKey: string;
};

export interface TextToSpeechProvider {
  synthesize(request: TtsSynthesisRequest): Promise<TtsSynthesisResult>;
}
