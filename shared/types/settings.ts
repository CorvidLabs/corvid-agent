/** Types for self-service environment variable configuration. */

export interface EnvVarUpdate {
  key: string;
  value: string;
}

export interface EnvVarsUpdateRequest {
  updates: EnvVarUpdate[];
}

export interface EnvVarsUpdateResponse {
  success: boolean;
  requiresRestart: boolean;
  updated: string[];
}
