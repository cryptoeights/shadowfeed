// x402 v2 protocol types for Stacks facilitator

export interface Env {
  HIRO_API_KEY?: string;
}

// CAIP-2 network identifiers
export const NETWORKS = {
  MAINNET: 'stacks:1',
  TESTNET: 'stacks:2147483648',
} as const;

export const SUPPORTED_ASSETS = ['STX', 'SBTC', 'USDCX'] as const;

export const HIRO_API = {
  mainnet: 'https://api.hiro.so',
  testnet: 'https://api.testnet.hiro.so',
} as const;

// --- Request/Response types ---

export interface ResourceInfo {
  url: string;
  description?: string;
  mimeType?: string;
}

export interface PaymentRequirements {
  scheme: string;
  network: string;
  amount: string;
  asset: string;
  payTo: string;
  maxTimeoutSeconds?: number;
  extra?: Record<string, unknown>;
}

export interface StacksPayload {
  transaction: string; // hex-encoded serialized TX
}

export interface PaymentPayload {
  x402Version: number;
  payload: StacksPayload;
  accepted?: PaymentRequirements;
  resource?: ResourceInfo;
}

export interface FacilitatorRequest {
  x402Version: number;
  paymentPayload: PaymentPayload;
  paymentRequirements: PaymentRequirements;
}

export interface SupportedKind {
  x402Version: number;
  scheme: string;
  network: string;
}

export interface SupportedResponse {
  kinds: SupportedKind[];
  extensions: string[];
  signers: Record<string, string[]>;
}

export interface VerifyResponse {
  isValid: boolean;
  invalidReason?: string;
  payer?: string;
}

export interface SettleResponse {
  success: boolean;
  errorReason?: string;
  payer?: string;
  transaction?: string;
  network?: string;
}
