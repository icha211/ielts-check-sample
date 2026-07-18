import type { DecodedAuthToken } from "./auth";

declare global {
  namespace Express {
    interface Request {
      auth?: DecodedAuthToken;
    }
  }
}

export {};
