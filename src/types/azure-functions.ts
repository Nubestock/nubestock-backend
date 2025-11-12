import { HttpRequest as AzHttpRequest, InvocationContext } from '@azure/functions';

// Tipos extendidos para Azure Functions
export type Context = InvocationContext & {
  res?: any;
};
export type HttpRequest = AzHttpRequest & {
  body: any;
  query: any;
  headers: any;
};

export type AzureFunction = (context: Context, req: HttpRequest) => Promise<void>;

