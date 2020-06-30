// @ts-check
import winston from 'winston';
const env = process.env;

let logger = winston.createLogger({
  level: env.LOG_LEVEL || 'info',
  transports: [
    new winston.transports.Console()
  ],
  format: winston.format.combine(
    winston.format.colorize(),
    winston.format.simple()
  )
});

export default logger;
