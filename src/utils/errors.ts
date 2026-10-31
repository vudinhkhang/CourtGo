/**
 * Phân tách rõ lỗi công khai hiển thị cho người dùng (tiếng Việt tự nhiên, hướng dẫn bước tiếp theo)
 * và thông tin lỗi kỹ thuật nội bộ dành cho log / quản trị.
 */
export class AppError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly publicMessage: string;
  public readonly nextStepHint?: string;
  public readonly internalDetail?: Record<string, unknown>;

  constructor(options: {
    code: string;
    statusCode: number;
    publicMessage: string;
    nextStepHint?: string;
    internalDetail?: Record<string, unknown>;
  }) {
    super(options.publicMessage);
    this.name = 'AppError';
    this.code = options.code;
    this.statusCode = options.statusCode;
    this.publicMessage = options.publicMessage;
    this.nextStepHint = options.nextStepHint;
    this.internalDetail = options.internalDetail;
  }
}
