import type express from "express";
import { logger } from "./logger";

export type ErrorResponse = {
  error: string;
  code: string;
};

export class HttpError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export function sendErrorResponse(
  response: express.Response,
  error: unknown,
  fallbackMessage: string,
): void {
  const statusCode = error instanceof HttpError ? error.statusCode : 500;
  const code = error instanceof HttpError ? error.code : "BOT_UNEXPECTED_ERROR";
  const message = error instanceof Error ? error.message : fallbackMessage;

  logger.error(message, error);
  response.status(statusCode).json({ error: message, code } satisfies ErrorResponse);
}
