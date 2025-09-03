import path from 'path';
import { createLogger, format, transports, config, Logger as WinstonLogger } from 'winston';
import Transport from 'winston-transport';

export default class Logger {
  private static instance: Logger;
  private serviceName: string;
  private environment: string;
  private static bot_id: string = process.env.BOT_ID || '';
  private static meeting_url: string = process.env.MEETING_URL || '';
  private isLocalEnv: boolean;
  private logger: WinstonLogger;
  private static context: Record<string, any> = {};

  constructor() {
    this.serviceName = process.env.SERVICE_NAME || 'SB-BOT';
    this.environment = process.env.ENV || 'development';
    this.isLocalEnv = this.environment === 'development';

    this.logger = this.createLoggerInstance();
  }

  private createHttpTransport(): transports.HttpTransportInstance {
    const httpTransport = new transports.Http({
      host: 'http-intake.logs.us5.datadoghq.com',
      path: `/api/v2/logs?dd-api-key=${process.env.DATADOG_API_KEY}&ddsource=nodejs&service=${this.serviceName}`,
      ssl: true
    });

    httpTransport.on('error', (err: Error) => {
      console.error('Error in Datadog HTTP transport:', err);
    });

    return httpTransport;
  }

  private getTransports(): Transport[] {
    const consoleTransport = new transports.Console({
      format: format.combine(format.colorize(), format.simple())
    });

    if (this.isLocalEnv) {
      return [consoleTransport];
    }

    return [consoleTransport, this.createHttpTransport()];
  }

  private createLoggerInstance(): WinstonLogger {
    return createLogger({
      level: process.env.LOG_LEVEL || 'info',
      levels: config.npm.levels,
      exitOnError: false,
      format: format.combine(format.timestamp(), format.errors({ stack: true }), format.json()),
      defaultMeta: {
        env: this.environment,
        service: this.serviceName,
        bot_id: Logger.bot_id,
        meeting_url: Logger.meeting_url,
      },
      transports: this.getTransports()
    });
  }

  static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  static setContext(context: Record<string, any>): typeof Logger {
    Logger.context = context;
    return Logger;
  }

  static addContext(additionalContext: Record<string, any>): typeof Logger {
    Logger.context = { ...Logger.context, ...additionalContext };
    return Logger;
  }

  static getContext(): Record<string, any> {
    return { ...Logger.context };
  }

  static clearContext(): typeof Logger {
    Logger.context = {};
    return Logger;
  }

  static withFunctionName(functionName: string): typeof Logger {
    return Logger.setContext({ functionName });
  }

  static error(message: string | Error, meta: Record<string, any> = {}): void {
    const logger = Logger.getInstance().logger;

    const baseMeta: Record<string, any> = { ...Logger.context, ...meta };

    const resolveError = (
      errLike: unknown
    ): { name?: string; message?: string; stack?: string } | undefined => {
      if (!errLike) return undefined;
      if (errLike instanceof Error) {
        return {
          name: errLike.name,
          message: errLike.message,
          stack: errLike.stack
        };
      }
      if (typeof errLike === 'string') {
        return { message: errLike };
      }
      if (typeof errLike === 'object') {
        const anyObj = errLike as Record<string, any>;
        return {
          name: typeof anyObj.name === 'string' ? anyObj.name : undefined,
          message: typeof anyObj.message === 'string' ? anyObj.message : undefined,
          stack: typeof anyObj.stack === 'string' ? anyObj.stack : undefined
        };
      }
      return { message: String(errLike) };
    };

    const primaryError =
      message instanceof Error
        ? message
        : baseMeta.error instanceof Error
          ? baseMeta.error
          : undefined;

    const normalizedError = resolveError(primaryError ?? baseMeta.error);

    if (baseMeta.stack && (!normalizedError || !normalizedError.stack)) {
      const merged = normalizedError ?? {};
      (merged as any).stack =
        typeof baseMeta.stack === 'string' ? baseMeta.stack : String(baseMeta.stack);
      baseMeta.error = merged;
    } else if (normalizedError) {
      baseMeta.error = normalizedError;
    }

    baseMeta.error.stackTrace = Logger.formatStackTrace(baseMeta.error);
    baseMeta.error.stackString = String(baseMeta.error.stack);

    if (baseMeta.error && baseMeta.error.stack && baseMeta.stack) {
      delete baseMeta.stack;
    }

    const logMessage =
      message instanceof Error
        ? message.message
        : typeof message === 'string'
          ? message
          : (baseMeta.error && (baseMeta.error as any).message) || 'Unexpected error';

    logger.error(logMessage, baseMeta);
  }

  static formatStackTrace(error: Error) {
    if (!error || !error.stack) return [];

    const projectRoot = path.resolve(process.cwd());

    return error.stack
      .split('\n')
      .slice(1)
      .map(line => {
        const match = line.match(/at\s+(.*)\s+\((.*):(\d+):(\d+)\)/);
        if (match) {
          const [_, functionName, filePath, line, column] = match;
          const relativeFilePath = filePath.startsWith(projectRoot)
            ? path.relative(projectRoot, filePath)
            : filePath;
          return {
            function: functionName,
            file: relativeFilePath,
            line: parseInt(line, 10),
            column: parseInt(column, 10)
          };
        }
        return line.trim();
      });
  }

  static warn(message: string, meta: Record<string, any> = {}): void {
    Logger.getInstance().logger.warn(message, { ...Logger.context, ...meta });
  }

  static info(message: string, meta: Record<string, any> = {}): void {
    Logger.getInstance().logger.info(message, { ...Logger.context, ...meta });
  }

  static verbose(message: string, meta: Record<string, any> = {}): void {
    Logger.getInstance().logger.verbose(message, { ...Logger.context, ...meta });
  }

  static debug(message: string, meta: Record<string, any> = {}): void {
    Logger.getInstance().logger.debug(message, { ...Logger.context, ...meta });
  }

  static silly(message: string, meta: Record<string, any> = {}): void {
    Logger.getInstance().logger.silly(message, { ...Logger.context, ...meta });
  }
}
