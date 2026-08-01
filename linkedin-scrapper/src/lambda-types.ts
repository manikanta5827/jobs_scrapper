export interface LambdaEvent {
  queryStringParameters?: Record<string, string> | null;
  queries?: Record<string, string>[];
  body?: string | null;
}

export interface LambdaResponse {
  statusCode: number;
  headers?: Record<string, string>;
  body: string;
}
