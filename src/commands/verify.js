const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const database = require('../services/database');
const blockchain = require('../services/blockchain');
const config = require('../config/config');
const logger = require('../utils/logger');

module. exports = {
  data: new SlashCommandBuilder()
    .setName('verify')
    .setDescription('Verify your contract interactions and get roles')
    .addStringOption(option =>
      option.setName('contract')
        .setDescription('Specific contract to verify (optional - verifies all if not specified)')
        . setRequired(false)
    ),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const discordId = interaction. user.id;
    const specificContract = interaction.options.getString('contract');

    // Check if user has linked wallet
    const userData = database.getUserByDiscordId(discordId);
    if (!userData) {
      return interaction. editReply({
        content: '❌ You need to link your wallet first!\n\nUse `/link wallet:0xYourAddress` to link your wallet.'
      });
    }

    const wallet = userData.wallet;
    const member = interaction.member;

    try {
      let results;
      
      if (specificContract) {
        // Verify specific contract
        const contract = config.contracts.find(c => 
          c.id === specificContract || 
          c.name.toLowerCase() === specificContract.toLowerCase()
        );
        
        if (!contract) {
          return interaction.editReply({
            content: `❌ Contract "${specificContract}" not found.\n\nAvailable contracts: ${config.contracts.map(c => c.name).join(', ')}`
          });
        }

        const result = await blockchain.verifyTransaction(wallet, contract.id);
        results = [{ ... result, contractId: contract.id, contractName: contract.name, roleId: contract. roleId }];
      } else {
        // Verify all contracts
        results = await blockchain.verifyAllContracts(wallet);
      }

      // Process results and assign roles
      const successfulVerifications = [];
      const failedVerifications = [];
      const alreadyVerified = [];

      for (const result of results) {
        if (database.isVerified(wallet, result.contractId)) {
          alreadyVerified.push(result. contractName);
          continue;
        }

        if (result.success) {
          // Record verification
          database.recordVerification(wallet, result.contractId, result.hash, result.blockNumber);
          
          // Assign role
          try {
            const role = interaction.guild.roles. cache.get(result. roleId);
            if (role) {
              await member.roles.add(role);
              successfulVerifications.push({
                name: result. contractName,
                role: role.name,
                txHash: result.hash
              });
            }
          } catch (roleError) {
            logger.error('Failed to assign role', { error: roleError.message });
          }
        } else {
          failedVerifications.push({
            name: result.contractName,
            error: result.error
          });
        }
      }

      // Build response embed
      const embed = new EmbedBuilder()
        .setTitle('🔍 Verification Results')
        . setColor(successfulVerifications.length > 0 ?  0x00ff00 : 0xff0000)
        .setTimestamp();

      if (successfulVerifications.length > 0) {
        embed.addFields({
          name: '✅ Verified',
          value: successfulVerifications.map(v => 
            `**${v.name}** → Role: ${v.role}\n\`${v.txHash. substring(0, 20)}...\``
          ).join('\n\n'),
          inline: false
        });
      }

      if (alreadyVerified. length > 0) {
        embed. addFields({
          name: '📋 Already Verified',
          value: alreadyVerified.join(', '),
          inline: false
        });
      }

      if (failedVerifications.length > 0) {
        embed.addFields({
          name: '❌ Not Verified',
          value: failedVerifications.map(v => 
            `**${v.name}**: ${v.error}`
          ).join('\n'),
          inline: false
        });
      }

      // Send announcement to verification channel
      if (successfulVerifications.length > 0 && config.discord.verificationChannelId) {
        try {
          const channel = interaction.guild.channels.cache. get(config.discord.verificationChannelId);
          if (channel) {
            const announceEmbed = new EmbedBuilder()
              .setTitle('🎉 New Verification!')
              .setColor(0x00ff00)
              .setDescription(`${interaction.user} has been verified! `)
              .addFields({
                name: 'Contracts',
                value: successfulVerifications.map(v => `✅ ${v. name}`).join('\n')
              })
              .setTimestamp();
            
            await channel.send({ embeds: [announceEmbed] });
          }
        } catch (error) {
          logger.error('Failed to send announcement', { error: error.message });
        }
      }

      return interaction.editReply({ embeds: [embed] });

    } catch (error) {
      logger.error('Verification command error', { error: error.message });
      return interaction. editReply({
        content: `❌ Verification failed: ${error.message}`
      });
    }
  }
};
