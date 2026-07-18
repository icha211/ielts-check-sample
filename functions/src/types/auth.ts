export type UserRole = "user" | "developer";

export interface DecodedAuthToken {
  uid: string;
  role?: UserRole | string;
  [key: string]: unknown;
}

export type VerifyTokenFn = (token: string) => Promise<DecodedAuthToken>;
