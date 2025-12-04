const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const database = require('../services/database');
const blockchain = require('../services/blockchain');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('stats')
    .setDescription('View bot statistics (Admin only)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const stats = database.getStats();
    const connectionTest = await blockchain.testConnection();

    const embed = new EmbedBuilder()
      .setTitle('📊 Bot Statistics')
      .setColor(0x00aaff)
      .addFields(
        { name: '👥 Total Users', value: stats.totalUsers. toString(), inline: true },
        { name: '✅ Verified', value: stats.verifiedUsers.toString(), inline: true },
        { name: '⏳ Pending', value: stats.pendingUsers.toString(), inline: true },
        { name: '🔗 Blockchain', value: connectionTest. success ? `✅ Block: ${connectionTest.blockNumber}` : '❌ Offline', inline: false }
      )
      .setTimestamp();

    // Add per-contract stats
    let contractStats = '';
    for (const [contractId, data] of Object.entries(stats.contractStats)) {
      contractStats += `**${data.name}**: ${data.verified} verified\n`;
    }

    if (contractStats) {
      embed.addFields({ name: '📝 Contract Stats', value: contractStats, inline: false });
    }

    return interaction.editReply({ embeds: [embed] });
  }
};
