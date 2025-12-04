const { SlashCommandBuilder, EmbedBuilder } = require('discord. js');
const database = require('../services/database');
const config = require('../config/config');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('mystatus')
    .setDescription('Check your verification status'),

  async execute(interaction) {
    const discordId = interaction.user.id;
    const userData = database.getUserByDiscordId(discordId);

    if (!userData) {
      return interaction.reply({
        content: '❌ You have not linked a wallet yet.\n\nUse `/link wallet:0xYourAddress` to get started.',
        ephemeral: true
      });
    }

    const verifications = userData.verifications || {};
    const totalContracts = config.contracts.length;
    const verifiedCount = Object.values(verifications).filter(v => v.verified).length;
    const percentage = Math.round((verifiedCount / totalContracts) * 100);

    const embed = new EmbedBuilder()
      .setTitle('📊 Your Verification Status')
      .setColor(verifiedCount === totalContracts ?  0x00ff00 : 0xffaa00)
      . addFields(
        { name: '🔗 Wallet', value: `\`${userData.wallet}\``, inline: false },
        { name: '📅 Linked', value: new Date(userData.linkedAt).toLocaleDateString(), inline: true },
        { name: '📈 Progress', value: `${verifiedCount}/${totalContracts} (${percentage}%)`, inline: true }
      )
      . setTimestamp();

    // Add status for each contract
    let contractStatus = '';
    for (const contract of config.contracts) {
      const verification = verifications[contract.id];
      if (verification?. verified) {
        contractStatus += `✅ **${contract.name}**\n`;
      } else {
        contractStatus += `❌ **${contract.name}**\n`;
      }
    }

    embed.addFields({ name: 'Contracts', value: contractStatus || 'No contracts configured', inline: false });

    return interaction.reply({ embeds: [embed], ephemeral: true });
  }
};
