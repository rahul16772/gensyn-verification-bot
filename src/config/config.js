require('dotenv').config();

const config = {
  // Discord Configuration
  discord: {
    token: process.env. DISCORD_TOKEN,
    verificationChannelId: process. env.VERIFICATION_CHANNEL_ID,
  },

  // Blockchain Configuration
  blockchain: {
    chainId: process.env.CHAIN_ID || '685685',
    chainName: process. env.CHAIN_NAME || 'Gensyn Testnet',
    minConfirmations: parseInt(process.env. MIN_CONFIRMATIONS) || 1,
    searchBlocks: parseInt(process. env.SEARCH_BLOCKS) || 10000,
  },

  // Multi-Contract Configuration (Up to 10 contracts)
  contracts: [],

  // Auto-Verification Settings
  autoVerify: {
    enabled: process. env.ENABLE_AUTO_VERIFY !== 'false',
    intervalMinutes: parseInt(process.env.AUTO_VERIFY_INTERVAL) || 5,
    maxBatchSize: parseInt(process.env. AUTO_VERIFY_BATCH_SIZE) || 10,
  },

  // Database Settings
  database: {
    path: process.env.DB_PATH || './data/users.json',
    backupEnabled: process.env.DB_BACKUP_ENABLED !== 'false',
    backupInterval: parseInt(process.env. DB_BACKUP_INTERVAL) || 24,
  },

  // Logging Settings
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    errorLogPath: './logs/error.log',
    combinedLogPath: './logs/combined. log',
  },

  // Rate Limiting
  rateLimit: {
    verifyCommandCooldown: parseInt(process.env. VERIFY_COOLDOWN) || 60,
    linkCommandCooldown: parseInt(process.env. LINK_COOLDOWN) || 30,
  },

  // Feature Flags
  features: {
    dmNotifications: process. env.FEATURE_DM_NOTIFICATIONS !== 'false',
    adminCommands: process.env. FEATURE_ADMIN_COMMANDS !== 'false',
    statistics: process.env. FEATURE_STATISTICS !== 'false',
  },

  // Performance Settings
  performance: {
    maxConcurrentVerifications: parseInt(process. env.MAX_CONCURRENT_VERIFICATIONS) || 10,
    delayBetweenChecks: parseInt(process.env. DELAY_BETWEEN_CHECKS) || 100,
  },
};

// Load contracts dynamically (simplified - only 3 settings per contract)
for (let i = 1; i <= 10; i++) {
  const address = process.env[`CONTRACT_${i}_ADDRESS`];
  const roleId = process.env[`CONTRACT_${i}_ROLE_ID`];
  const rpcUrl = process.env[`CONTRACT_${i}_RPC_URL`];

  if (address && roleId && rpcUrl) {
    config. contracts.push({
      id: `contract${i}`,
      name: `Contract ${i}`,
      address: address,
      roleId: roleId,
      rpcUrl: rpcUrl,
    });
  }
}

// Helper functions for multi-contract support
config.getContractById = function(contractId) {
  return this.contracts.find(c => c.id === contractId);
};

config.getContractByAddress = function(address) {
  if (!address) return null;
  return this.contracts.find(c => c. address. toLowerCase() === address. toLowerCase());
};

config.getContractByRoleId = function(roleId) {
  return this. contracts.find(c => c.roleId === roleId);
};

config.getAllContractAddresses = function() {
  return this. contracts.map(c => c.address. toLowerCase());
};

config.getDefaultContract = function() {
  return this.contracts[0];
};

// Validation
function validateConfig() {
  if (!config.discord. token) {
    throw new Error('❌ Missing DISCORD_TOKEN in environment variables');
  }

  if (config.contracts.length === 0) {
    throw new Error('❌ At least one contract must be configured (ADDRESS + ROLE_ID + RPC_URL)');
  }

  console.log(`✅ Loaded ${config.contracts.length} contract(s)`);
  config.contracts.forEach((c, i) => {
    console.log(`   ${i + 1}. ${c.address. substring(0, 10)}...  → Role: ${c.roleId}`);
  });
}

validateConfig();

module.exports = config;
