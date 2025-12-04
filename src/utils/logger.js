const fs = require('fs');
const path = require('path');
const config = require('../config/config');

const logsDir = path.join(__dirname, '../../logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

const LOG_LEVELS = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3
};

class Logger {
  constructor(level = 'info') {
    this.level = LOG_LEVELS[level] || LOG_LEVELS.info;
  }

  formatMessage(level, message, meta = {}) {
    const timestamp = new Date().toISOString();
    const metaStr = Object.keys(meta).length > 0 ? ` | ${JSON.stringify(meta)}` : '';
    return `[${timestamp}] [${level.toUpperCase()}] ${message}${metaStr}`;
  }

  writeToFile(level, message) {
    try {
      const logPath = level === 'error' ? config.logging.errorLogPath : config.logging.combinedLogPath;
      fs.appendFileSync(logPath, message + '\n');
    } catch (error) {
      // If writing fails, just continue (don't crash the bot)
      console.error('Failed to write to log file:', error.message);
    }
  }

  log(level, message, meta = {}) {
    if (LOG_LEVELS[level] > this.level) return;
    
    const formattedMessage = this.formatMessage(level, message, meta);
    
    // Color codes for console
    const colors = {
      error: '\x1b[31m',   // Red
      warn: '\x1b[33m',    // Yellow
      info: '\x1b[36m',    // Cyan
      debug: '\x1b[90m',   // Gray
      reset: '\x1b[0m'     // Reset
    };
    
    console.log(`${colors[level]}${formattedMessage}${colors.reset}`);
    this.writeToFile(level, formattedMessage);
  }

  error(message, meta = {}) {
    this.log('error', message, meta);
  }

  warn(message, meta = {}) {
    this.log('warn', message, meta);
  }

  info(message, meta = {}) {
    this.log('info', message, meta);
  }

  debug(message, meta = {}) {
    this.log('debug', message, meta);
  }

  // Special log methods for different contexts
  blockchain(action, data = {}) {
    this.info(`[BLOCKCHAIN] ${action}`, data);
  }

  discord(action, data = {}) {
    this.info(`[DISCORD] ${action}`, data);
  }

  verification(success, wallet, data = {}) {
    const emoji = success ? '✅' : '❌';
    const status = success ? 'SUCCESS' : 'FAILED';
    this.info(`${emoji} Verification ${status}: ${wallet}`, data);
  }
}

module.exports = new Logger(config.logging.level);
