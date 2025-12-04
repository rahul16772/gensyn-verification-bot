const database = require('../services/database');
const blockchain = require('../services/blockchain');
const config = require('../config/config');
const logger = require('../utils/logger');
const { EmbedBuilder } = require('discord.js');

class AutoVerifyWorker {
  constructor(client) {
    this.client = client;
    this.isRunning = false;
    this.stats = {
      totalRuns: 0,
      totalChecked: 0,
      totalVerified: 0,
      lastRun: null,
    };
    
    // High-performance settings
    this.maxConcurrent = parseInt(process.env.MAX_CONCURRENT_VERIFICATIONS) || 10;
    this.delayBetweenChecks = parseInt(process.env.DELAY_BETWEEN_CHECKS) || 100;
  }

  start() {
    if (!config.autoVerify.enabled) {
      logger.info('⏸️  Auto-verification disabled');
      return;
    }

    const intervalMs = config.autoVerify.intervalMinutes * 60 * 1000;
    
    logger.info('🤖 Auto-verification worker started', {
      interval: `${config.autoVerify.intervalMinutes} minute(s)`,
      batchSize: config.autoVerify.maxBatchSize,
      maxConcurrent: this.maxConcurrent,
      contracts: config.contracts.length
    });

    // Run immediately after 30 seconds
    setTimeout(() => this.run(), 30000);

    // Then run on interval
    setInterval(() => this.run(), intervalMs);
  }

  async run() {
    if (this.isRunning) {
      logger.warn('Auto-verification already running, skipping this cycle...');
      return;
    }

    this.isRunning = true;
    this.stats.totalRuns++;
    this.stats.lastRun = new Date().toISOString();

    const startTime = Date.now();
    logger.info('🤖 Starting auto-verification cycle', { 
      cycle: this.stats.totalRuns,
      contracts: config.contracts.length
    });

    try {
      const unverifiedUsers = database.getAllUnverified();
      const usersToCheck = unverifiedUsers.slice(0, config.autoVerify.maxBatchSize);

      if (usersToCheck.length === 0) {
        logger.info('✅ No users pending verification');
        this.isRunning = false;
        return;
      }

      logger.info(`📊 Processing ${usersToCheck.length} user(s) with pending verifications...`);

      // Process in chunks for parallel execution
      const verified = await this.processUsersInParallel(usersToCheck);

      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      const rate = duration > 0 ? (usersToCheck.length / (duration / 60)).toFixed(1) : 0;
      
      logger.info('🤖 Auto-verification cycle complete', {
        checked: usersToCheck.length,
        verified: verified,
        duration: `${duration}s`,
        rate: `${rate} users/min`
      });

      this.stats.totalChecked += usersToCheck.length;
      this.stats.totalVerified += verified;

    } catch (error) {
      logger.error('Auto-verification error', { error: error.message, stack: error.stack });
    } finally {
      this.isRunning = false;
    }
  }

  async processUsersInParallel(users) {
    let verifiedCount = 0;
    const chunks = this.chunkArray(users, this.maxConcurrent);

    for (const chunk of chunks) {
      // Process chunk in parallel
      const results = await Promise.allSettled(
        chunk.map(user => this.verifyUser(user))
      );

      // Count successes
      verifiedCount += results.filter(r => r.status === 'fulfilled' && r.value).length;

      // Small delay between chunks to avoid rate limits
      if (this.delayBetweenChecks > 0) {
        await this.delay(this.delayBetweenChecks);
      }
    }

    return verifiedCount;
  }

  async verifyUser(user) {
    const { wallet, discordId, pendingContracts } = user;

    try {
      // Check each pending contract for this user
      for (const contractId of pendingContracts) {
        const verification = await blockchain.verifyTransaction(wallet, contractId);

        if (verification.success) {
          const contract = verification.contract;

          // Find guild and assign role
          for (const guild of this.client.guilds.cache.values()) {
            try {
              const member = await guild.members.fetch(discordId);
              if (!member) continue;

              const role = guild.roles.cache.get(contract.roleId);
              if (!role) {
                logger.error('Role not found', { 
                  roleId: contract.roleId, 
                  contract: contract.name 
                });
                continue;
              }

              // Assign role if not already assigned
              if (!member.roles.cache.has(contract.roleId)) {
                await member.roles.add(role);
                logger.info(`✅ Auto-verified: ${member.user.tag} for ${contract.name}`);
              }

              // Mark as verified in database
              database.markVerifiedForContract(
                wallet, 
                contractId, 
                verification.hash, 
                verification.blockNumber
              );

              // Send DM notification
              if (config.features.dmNotifications) {
                await this.sendDMNotification(member, contract, verification);
              }

              // Log to verification channel
              await this.logVerification(guild, member, contract, verification);

              return true;

            } catch (error) {
              logger.error('Error processing user in guild', { 
                discordId, 
                guild: guild.name,
                error: error.message 
              });
            }
          }
        }
      }

      return false;

    } catch (error) {
      logger.error('Verification error for user', { 
        wallet, 
        error: error.message 
      });
      return false;
    }
  }

  async sendDMNotification(member, contract, verification) {
    try {
      const shortTxHash = `${verification.hash.slice(0, 10)}...${verification.hash.slice(-8)}`;
      
      const embed = new EmbedBuilder()
        .setColor(0x00ff00)
        .setTitle('✅ Auto-Verified!')
        .setDescription(`You've been automatically verified for **${contract.name}**!`)
        .addFields(
          { name: 'Contract', value: contract.name, inline: true },
          { name: 'Network', value: config.blockchain.chainName, inline: true },
          { name: 'Transaction', value: `\`${shortTxHash}\``, inline: false },
          { name: 'Block', value: `${verification.blockNumber}`, inline: true },
          { name: 'Confirmations', value: `${verification.confirmations}`, inline: true }
        )
        .setFooter({ text: 'Check /mystatus to see all your verifications' })
        .setTimestamp();

      await member.send({ embeds: [embed] });
      logger.debug('DM notification sent', { userId: member.id, contract: contract.name });
    } catch (error) {
      logger.debug('Could not send DM', { 
        userId: member.id, 
        error: error.message 
      });
    }
  }

  async logVerification(guild, member, contract, verification) {
    if (!contract.verificationChannelId) return;

    try {
      const channel = guild.channels.cache.get(contract.verificationChannelId);
      if (!channel) {
        logger.debug('Verification channel not found', { 
          channelId: contract.verificationChannelId 
        });
        return;
      }

      const shortTxHash = `${verification.hash.slice(0, 10)}...${verification.hash.slice(-8)}`;

      const embed = new EmbedBuilder()
        .setColor(0x00ff00)
        .setTitle('🤖 Auto-Verification')
        .setDescription(`<@${member.id}> verified for **${contract.name}**`)
        .addFields(
          { name: 'User', value: member.user.tag, inline: true },
          { name: 'Contract', value: contract.name, inline: true },
          { name: 'Transaction', value: `\`${shortTxHash}\``, inline: false },
          { name: 'Block', value: `${verification.blockNumber}`, inline: true },
          { name: 'Confirmations', value: `${verification.confirmations}`, inline: true }
        )
        .setFooter({ text: `Auto-verified by bot • ${config.blockchain.chainName}` })
        .setTimestamp();

      await channel.send({ embeds: [embed] });
      logger.debug('Verification logged to channel', { 
        channelId: contract.verificationChannelId,
        contract: contract.name
      });
    } catch (error) {
      logger.debug('Could not log to channel', { 
        channelId: contract.verificationChannelId,
        error: error.message 
      });
    }
  }

  chunkArray(array, size) {
    const chunks = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  getStats() {
    return {
      ...this.stats,
      isRunning: this.isRunning,
      averagePerRun: this.stats.totalRuns > 0 
        ? (this.stats.totalVerified / this.stats.totalRuns).toFixed(1) 
        : 0,
      successRate: this.stats.totalChecked > 0
        ? `${Math.round((this.stats.totalVerified / this.stats.totalChecked) * 100)}%`
        : '0%'
    };
  }

  stop() {
    this.isRunning = false;
    logger.info('🛑 Auto-verification worker stopped');
  }
}

module.exports = AutoVerifyWorker;
