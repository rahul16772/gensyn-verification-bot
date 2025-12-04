const database = require('../services/database');
const blockchain = require('../services/blockchain');
const config = require('../config/config');
const logger = require('../utils/logger');

class AutoVerifyWorker {
  constructor(client) {
    this.client = client;
    this.isRunning = false;
  }

  start() {
    const intervalMs = config.autoVerify.intervalMinutes * 60 * 1000;
    
    logger.info(`Auto-verify worker started (interval: ${config.autoVerify. intervalMinutes} min)`);
    
    // Run immediately, then on interval
    this.run();
    setInterval(() => this. run(), intervalMs);
  }

  async run() {
    if (this. isRunning) {
      logger.debug('Auto-verify already running, skipping');
      return;
    }

    this.isRunning = true;
    logger.debug('Auto-verify worker running.. .');

    try {
      const users = database.getAllUsers();
      const userEntries = Object.entries(users);
      
      let processed = 0;
      let newVerifications = 0;

      for (const [wallet, userData] of userEntries) {
        if (processed >= config.autoVerify.maxBatchSize) break;

        try {
          const results = await blockchain.verifyAllContracts(wallet);
          
          for (const result of results) {
            if (result.success && ! database.isVerified(wallet, result.contractId)) {
              // Record verification
              database.recordVerification(wallet, result.contractId, result.hash, result.blockNumber);
              
              // Assign role
              await this.assignRole(userData. discordId, result. roleId);
              newVerifications++;
              
              logger.info('Auto-verified user', { 
                wallet, 
                contract: result.contractName 
              });
            }
          }

          processed++;
          
          // Delay between checks
          await this. delay(config.performance.delayBetweenChecks);
          
        } catch (error) {
          logger.debug('Auto-verify error for wallet', { wallet, error: error.message });
        }
      }

      logger. debug('Auto-verify complete', { processed, newVerifications });

    } catch (error) {
      logger.error('Auto-verify worker error', { error: error.message });
    } finally {
      this.isRunning = false;
    }
  }

  async assignRole(discordId, roleId) {
    try {
      for (const guild of this.client. guilds. cache.values()) {
        const member = await guild.members.fetch(discordId). catch(() => null);
        if (member) {
          const role = guild.roles.cache.get(roleId);
          if (role) {
            await member. roles.add(role);
            return true;
          }
        }
      }
    } catch (error) {
      logger. error('Failed to assign role in auto-verify', { error: error.message });
    }
    return false;
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = AutoVerifyWorker;
