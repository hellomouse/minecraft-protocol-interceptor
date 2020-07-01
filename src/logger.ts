// @ts-check
import winston, { Logform, format, transports } from 'winston';
import { formatWithOptions } from 'util';

const env = process.env;

const ENABLE_COLOR = env.LOG_DISABLE_COLOR !== '1';

const FORMAT_OPTIONS = {
  depth: null,
  maxArrayLength: null,
  colors: ENABLE_COLOR
};

export let logger = winston.createLogger({
  level: env.LOG_LEVEL || 'info',
  transports: [
    new transports.Console()
  ],
  format: format.combine(
    ENABLE_COLOR
      ? format.colorize()
      : format.uncolorize(),
    // winston.format.prettyPrint({ depth: Infinity }),
    // winston.format.simple(),
    format.printf((info: Logform.TransformableInfo) => {
      // @ts-ignore typescript pls
      let splat = info[Symbol.for('splat')];
      return [
        `${info.level}:`,
        splat
          ? formatWithOptions(FORMAT_OPTIONS, info.message, ...splat)
          : formatWithOptions(FORMAT_OPTIONS, info.message)
      ].join(' ');
    })
  )
});

export default logger;
