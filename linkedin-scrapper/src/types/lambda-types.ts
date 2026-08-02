export interface ScraperQueryTask {
  keyword: string;
  location: string;
  geoId?: string;
  userIds?: string[];
  userId?: string;
  [key: string]: unknown;
}

export interface LambdaEvent {
  queries?: ScraperQueryTask[];
  queryStringParameters?: Record<string, string> | null;
  body?: string | null;
}

export interface LambdaResponse {
  statusCode: number;
  headers?: Record<string, string>;
  body: string;
}
