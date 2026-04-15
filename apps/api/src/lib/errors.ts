// API 共通エラー。errorHandler でこのクラスを見て HTTP ステータスに変換する。
export type ApiErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'BUSINESS_RULE_ERROR'
  | 'RATE_LIMITED'
  | 'INTERNAL_ERROR'
  | 'ACCOUNT_LOCKED';

const CODE_TO_STATUS: Record<ApiErrorCode, number> = {
  VALIDATION_ERROR: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  BUSINESS_RULE_ERROR: 422,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
  ACCOUNT_LOCKED: 423,
};

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly statusCode: number;
  readonly details?: unknown;

  constructor(code: ApiErrorCode, message: string, details?: unknown) {
    super(message);
    this.code = code;
    this.statusCode = CODE_TO_STATUS[code];
    this.details = details;
  }
}

export const validationError = (message: string, details?: unknown): ApiError =>
  new ApiError('VALIDATION_ERROR', message, details);

export const notFound = (message = '対象が見つかりません'): ApiError =>
  new ApiError('NOT_FOUND', message);

export const forbidden = (message = '権限がありません'): ApiError =>
  new ApiError('FORBIDDEN', message);

export const conflict = (message: string): ApiError => new ApiError('CONFLICT', message);

export const unauthenticated = (message = '認証が必要です'): ApiError =>
  new ApiError('UNAUTHENTICATED', message);
