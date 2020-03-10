#!/usr/bin/env node
// Temporary demo client
// Works both in browser and node.js
const fs = require('fs')
const axios = require('axios')
const assert = require('assert')
const snarkjs = require('snarkjs')
const crypto = require('crypto')
const circomlib = require('circomlib')
const bigInt = snarkjs.bigInt
const merkleTree = require('./lib/MerkleTree')
const Web3 = require('web3')
const buildGroth16 = require('websnark/src/groth16')
const websnarkUtils = require('websnark/src/utils')
const { toWei, fromWei } = require('web3-utils')

let web3, tornado, circuit, proving_key, groth16, senderAccount
const MERKLE_TREE_HEIGHT = 20
const ETH_AMOUNT = 8e18

/** Whether we are in a browser or node.js */
const inBrowser = (typeof window !== 'undefined')

/** Generate random number of specified byte length */
const rbigint = nbytes => snarkjs.bigInt.leBuff2int(crypto.randomBytes(nbytes))

/** Compute pedersen hash */
const pedersenHash = data => circomlib.babyJub.unpackPoint(circomlib.pedersenHash.hash(data))[0]

/** BigNumber to hex string of specified length */
function toHex(number, length = 32) {
  let str = number instanceof Buffer ? number.toString('hex') : bigInt(number).toString(16)
  return '0x' + str.padStart(length * 2, '0')
}

/** Display account balance */
async function printBalance(account, name) {
  console.log(`${name} UBQ balance is`, web3.utils.fromWei(await web3.eth.getBalance(account)))
}

/**
 * Create deposit object from secret and nullifier
 */
function createDeposit(nullifier, secret) {
  let deposit = { nullifier, secret }
  deposit.preimage = Buffer.concat([deposit.nullifier.leInt2Buff(31), deposit.secret.leInt2Buff(31)])
  deposit.commitment = pedersenHash(deposit.preimage)
  deposit.nullifierHash = pedersenHash(deposit.nullifier.leInt2Buff(31))
  return deposit
}

/**
 * Make an UBQ deposit
 */
async function deposit() {
  const deposit = createDeposit(rbigint(31), rbigint(31))

  console.log('Submitting deposit transaction')
  console.log('Waiting for inclusion in block')
  await tornado.methods.deposit(toHex(deposit.commitment)).send({ value: ETH_AMOUNT, from: senderAccount, gas:2e6 })

  const note = toHex(deposit.preimage, 62)
  console.log('Your note:', note)
  return note
}

/**
 * Generate merkle tree for a deposit.
 * Download deposit events from the contract, reconstructs merkle tree, finds our deposit leaf
 * in it and generates merkle proof
 * @param contract Tornado contract address
 * @param deposit Deposit object
 */
async function generateMerkleProof(contract, deposit) {
  // Get all deposit events from smart contract and assemble merkle tree from them
  console.log('Getting current state from tornado contract')
  const events = await contract.getPastEvents('Deposit', { fromBlock: contract.deployedBlock, toBlock: 'latest' })
  const leaves = events
    .sort((a, b) => a.returnValues.leafIndex - b.returnValues.leafIndex) // Sort events in chronological order
    .map(e => e.returnValues.commitment)
  const tree = new merkleTree(MERKLE_TREE_HEIGHT, leaves)

  // Find current commitment in the tree
  let depositEvent = events.find(e => e.returnValues.commitment === toHex(deposit.commitment))
  let leafIndex = depositEvent ? depositEvent.returnValues.leafIndex : -1

  // Validate that our data is correct
  const isValidRoot = await contract.methods.isKnownRoot(toHex(await tree.root())).call()
  const isSpent = await contract.methods.isSpent(toHex(deposit.nullifierHash)).call()
  assert(isValidRoot === true, 'Merkle tree is corrupted')
  assert(isSpent === false, 'The note is already spent')
  assert(leafIndex >= 0, 'The deposit is not found in the tree')

  // Compute merkle proof of our commitment
  return await tree.path(leafIndex)
}

/**
 * Generate SNARK proof for withdrawal
 * @param contract Tornado contract address
 * @param note Note string
 * @param recipient Funds recipient
 * @param relayer Relayer address
 * @param fee Relayer fee
 * @param refund Receive ether for exchanged tokens
 */
async function generateProof(contract, note, recipient, relayer = 0, fee = 0, refund = 0) {
  // Decode hex string and restore the deposit object
  let buf = Buffer.from(note.slice(2), 'hex')
  let deposit = createDeposit(bigInt.leBuff2int(buf.slice(0, 31)), bigInt.leBuff2int(buf.slice(31, 62)))

  // Compute merkle proof of our commitment
  const { root, path_elements, path_index } = await generateMerkleProof(contract, deposit)

  // Prepare circuit input
  const input = {
    // Public snark inputs
    root: root,
    nullifierHash: deposit.nullifierHash,
    recipient: bigInt(recipient),
    relayer: bigInt(relayer),
    fee: bigInt(fee),
    refund: bigInt(refund),

    // Private snark inputs
    nullifier: deposit.nullifier,
    secret: deposit.secret,
    pathElements: path_elements,
    pathIndices: path_index,
  }

  console.log('Generating SNARK proof')
  console.time('Proof time')
  const proofData = await websnarkUtils.genWitnessAndProve(groth16, input, circuit, proving_key)
  const { proof } = websnarkUtils.toSolidityInput(proofData)
  console.timeEnd('Proof time')

  const args = [
    toHex(input.root),
    toHex(input.nullifierHash),
    toHex(input.recipient, 20),
    toHex(input.relayer, 20),
    toHex(input.fee),
    toHex(input.refund)
  ]

  return { proof, args }
}

/**
 * Do a UBQ withdrawal
 * @param note Note to withdraw
 * @param recipient Recipient address
 */
async function withdraw(note, recipient) {
  const { proof, args } = await generateProof(tornado, note, recipient)

  console.log('Submitting withdraw transaction')
  console.log('Waiting for inclusion in block')
  await tornado.methods.withdraw(proof, ...args).send({ from: senderAccount, gas: 1e6 })
  console.log('Done')
}

/**
 * Do a UBQ withdrawal through relay
 * @param note Note to withdraw
 * @param recipient Recipient address
 * @param relayUrl Relay url address
 */
async function withdrawRelay(note, recipient, relayUrl) {
  const resp = await axios.get(relayUrl + '/status')
  const { relayerAddress, netId, gasPrices } = resp.data
  assert(netId === await web3.eth.net.getId() || netId === '*', 'This relay is for different network')
  console.log('Relay address: ', relayerAddress)

  const fee = bigInt(toWei(gasPrices.fast.toString(), 'gwei')).mul(bigInt(1e6))
  const { proof, args } = await generateProof(tornado, note, recipient, relayerAddress, fee)

  console.log('Sending withdraw transaction through relay')
  const resp2 = await axios.post(relayUrl + '/relay', { contract: tornado._address, proof: { proof, publicSignals: args } })
  console.log(`Transaction submitted through relay, tx hash: ${resp2.data.txHash}`)

  let receipt = await waitForTxReceipt(resp2.data.txHash)
  console.log('Transaction mined in block', receipt.blockNumber)
  console.log('Done')
}

/**
 * Waits for transaction to be mined
 * @param txHash Hash of transaction
 * @param attempts
 * @param delay
 */
function waitForTxReceipt(txHash, attempts = 60, delay = 1000) {
  return new Promise((resolve, reject) => {
    const checkForTx = async (txHash, retryAttempt = 0) => {
      const result = await web3.eth.getTransactionReceipt(txHash)
      if (!result || !result.blockNumber) {
        if (retryAttempt <= attempts) {
          setTimeout(() => checkForTx(txHash, retryAttempt + 1), delay)
        } else {
          reject(new Error('tx was not mined'))
        }
      } else {
        resolve(result)
      }
    }
    checkForTx(txHash)
  })
}

/**
 * Init web3, contracts, and snark
 */
async function init() {
  let contractJson
  if (inBrowser) {
    // Initialize using injected web3 (Metamask)
    // To assemble web version run `npm run browserify`
    web3 = new Web3(window.web3.currentProvider, null, { transactionConfirmationBlocks: 1 })
    contractJson = await (await fetch('contracts/ETHTornado.json')).json()
    circuit = await (await fetch('circuits/withdraw.json')).json()
    proving_key = await (await fetch('circuits/withdraw_proving_key.bin')).arrayBuffer()
  } else {
    // Initialize from local node
    web3 = new Web3('http://localhost:8588', null, { transactionConfirmationBlocks: 1 })
    contractJson = require('./contracts/ETHTornado.json')
    circuit = require('./circuits/withdraw.json')
    proving_key = fs.readFileSync('circuits/withdraw_proving_key.bin').buffer
    require('dotenv').config()
  }
  groth16 = await buildGroth16()

  const tx = await web3.eth.getTransaction("0x3aff57fb32f6b7ec17304f3c352000bb9d522d54f6fdfbec55d2f469c1a39181")
  tornado = new web3.eth.Contract(contractJson.abi, "0x5f0c5a6F699772b0E1d78ac00Af40174bFef8623")
  tornado.deployedBlock = tx.blockNumber

  senderAccount = (await web3.eth.getAccounts())[0]
  console.log('Loaded')
}

// ========== CLI related stuff below ==============

/** Print command line help */
function printHelp(code = 0) {
  console.log(`Usage:
  Submit a deposit from default UBQ account and return the resulting note
  $ ./tornado.js deposit

  Withdraw a note to 'recipient' account
  $ ./tornado.js withdraw <note> <recipient> [relayUrl]

  Check address balance
  $ ./tornado.js balance <address>

Example:
  $ ./tornado.js deposit
  ...
  Your note: 0x1941fa999e2b4bfeec3ce53c2440c3bc991b1b84c9bb650ea19f8331baf621001e696487e2a2ee54541fa12f49498d71e24d00b1731a8ccd4f5f5126f3d9f400

  $ ./tornado.js withdraw 0x1941fa999e2b4bfeec3ce53c2440c3bc991b1b84c9bb650ea19f8331baf621001e696487e2a2ee54541fa12f49498d71e24d00b1731a8ccd4f5f5126f3d9f400 0xee6249BA80596A4890D1BD84dbf5E4322eA4E7f0
`)
  process.exit(code)
}

/** Process command line args and run */
async function runConsole(args) {
  if (args.length === 0) {
    printHelp()
  } else {
    switch (args[0]) {
    case 'deposit':
      if (args.length === 1) {
        await init()
        await printBalance(tornado._address, 'Tornado')
        await printBalance(senderAccount, 'Sender account')
        await deposit()
        await printBalance(tornado._address, 'Tornado')
        await printBalance(senderAccount, 'Sender account')
      } else {
        printHelp(1)
      }
      break
    case 'balance':
      if (args.length === 2 && /^0x[0-9a-fA-F]{40}$/.test(args[1])) {
        await init()
        await printBalance(args[1])
      } else {
        printHelp(1)
      }
      break
    case 'withdraw':
      if (args.length >= 3 && args.length <= 4 && /^0x[0-9a-fA-F]{124}$/.test(args[1]) && /^0x[0-9a-fA-F]{40}$/.test(args[2])) {
        await init()
        await printBalance(tornado._address, 'Tornado')
        await printBalance(args[2], 'Recipient account')
        if (args[3]) {
          await withdrawRelay(args[1], args[2], args[3])
        } else {
          await withdraw(args[1], args[2])
        }
        await printBalance(tornado._address, 'Tornado')
        await printBalance(args[2], 'Recipient account')
      } else {
        printHelp(1)
      }
      break
    case 'test':
      if (args.length === 1) {
        await init()
        const note1 = await deposit()
        await withdraw(note1, senderAccount)
      } else {
        printHelp(1)
      }
      break
    case 'testRelay':
      if (args.length === 1) {
        await init()
        const note1 = await deposit()
        await withdrawRelay(note1, senderAccount, 'http://localhost:8000')
      } else {
        printHelp(1)
      }
      break

    default:
      printHelp(1)
    }
  }
}

if (inBrowser) {
  window.deposit = deposit
  window.withdraw = async () => {
    const note = prompt('Enter the note to withdraw')
    const recipient = (await web3.eth.getAccounts())[0]
    await withdraw(note, recipient)
  }
  init()
} else {
  runConsole(process.argv.slice(2))
    .then(() => process.exit(0))
    .catch(err => { console.log(err); process.exit(1) })
}
