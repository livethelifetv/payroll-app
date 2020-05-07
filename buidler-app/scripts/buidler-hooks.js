let accounts
let finance, tokens, vault
let denominationToken
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

module.exports = {
  postDao: async function({ _experimentalAppInstaller, log }, bre) {
    const bigExp = (x, y = 18) =>
      bre.web3.utils
        .toBN(x)
        .mul(bre.web3.utils.toBN(10).pow(bre.web3.utils.toBN(y)))
    const pct16 = x => bigExp(x, 16)

    // Retrieve accounts.
    accounts = await bre.web3.eth.getAccounts()

    vault = await _experimentalAppInstaller('vault')
    log(`> Vault app installed: ${vault.address}`)

    finance = await _experimentalAppInstaller('finance', {
      initializeArgs: [
        vault.address,
        60 * 60 * 24 * 30, // 30 days
      ],
    })
    log(`> Finance app installed: ${finance.address}`)

    // Deploy a minime token an generate tokens to root account
    const minime = await deployMinimeToken(bre)
    await minime.generateTokens(accounts[0], pct16(100))
    log(`> Minime token deployed: ${minime.address}`)

    tokens = await _experimentalAppInstaller('token-manager', {
      skipInitialize: true,
    })

    await minime.changeController(tokens.address)
    log(`> Change minime controller to tokens app`)
    await tokens.initialize([minime.address, true, 0])
    log(`> Tokens app installed: ${tokens.address}`)

    await deployDenominationToken(bre.artifacts, 18, bigExp(4500))
    await depositDenominationToken(bre.artifacts, bigExp(2000))
  },

  postInit: async function({ proxy, log }, bre) {
    await vault.createPermission('TRANSFER_ROLE', finance.address)
    log(`> TRANSFER_ROLE assigned to ${finance.address}`)
    await finance.createPermission('CREATE_PAYMENTS_ROLE', proxy.address)
    log(`> CREATE_PAYMENTS_ROLE assigned to ${proxy.address}`)
    await tokens.createPermission('MINT_ROLE', proxy.address)
    log(`> MINT_ROLE assigned to ${proxy.address}`)
  },

  getInitParams: async function(_, bre) {
    const equityMultiplier = 4
    const vestingLength = 0
    const vestingCliffLength = 0
    const vestingRevokable = true

    return [
      finance.address,
      denominationToken.address,
      tokens.address,
      equityMultiplier,
      vestingLength,
      vestingCliffLength,
      vestingRevokable,
    ]
  },
}

async function depositDenominationToken(artifacts, amount) {
  // Experimental app installer doesn't expose the deposit functionality for vault
  const Vault = artifacts.require('Vault')
  const vaultContract = await Vault.at(vault.address)

  await denominationToken.approve(vaultContract.address, amount, {
    from: accounts[0],
  })
  await vaultContract.deposit(denominationToken.address, amount, {
    from: accounts[0],
  })
}

async function deployDenominationToken(artifacts, decimals, initialSupply) {
  denominationToken = await deployToken(
    'Dai Stablecoin',
    'DAI',
    decimals,
    initialSupply,
    accounts[0],
    artifacts
  )
  console.log(
    `> ERC20 denomination token deployed: ${denominationToken.address}`
  )
}

async function deployToken(
  tokenName,
  tokenSymbol,
  decimals,
  initialSupply,
  fromAccount,
  artifacts
) {
  const ERC20 = artifacts.require('ERC20Mock')

  return ERC20.new(tokenName, tokenSymbol, decimals, initialSupply, {
    from: fromAccount,
  })
}

async function deployMinimeToken(bre) {
  const MiniMeToken = await bre.artifacts.require('MiniMeToken')
  const token = await MiniMeToken.new(
    ZERO_ADDRESS,
    ZERO_ADDRESS,
    0,
    'Org token',
    18,
    'OGT',
    true
  )
  return token
}