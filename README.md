# Tornado-cli for Ubiq

Tornado Cash CLI for Ubiq Mainnet.

# Tornado Cash Privacy Solution [![Build Status](https://travis-ci.org/tornadocash/tornado-core.svg?branch=master)](https://travis-ci.org/tornadocash/tornado-core)

Tornado Cash is a non-custodial Ethereum and ERC20 privacy solution based on zkSNARKs. It improves transaction privacy by breaking the on-chain link between recipient and destination addresses. It uses a smart contract that accepts UBQ deposits that can be withdrawn by a different address. Whenever UBQ is withdrawn by the new address, there is no way to link the withdrawal to the deposit, ensuring complete privacy.

To make a deposit user generates a secret and sends its hash (called a commitment) along with the deposit amount to the Tornado smart contract. The contract accepts the deposit and adds the commitment to its list of deposits.

Later, the user decides to make a withdrawal. In order to do that, the user should provide a proof that he or she possesses a secret to an unspent commitment from the smart contract’s list of deposits. zkSnark technology allows that to happen without revealing which exact deposit corresponds to this secret. The smart contract will check the proof, and transfer deposited funds to the address specified for withdrawal. An external observer will be unable to determine which deposit this withdrawal came from.

You can read more about it in [this medium article](https://medium.com/@tornado.cash/introducing-private-transactions-on-ethereum-now-42ee915babe0)

## Specs
- Deposit gas const: 1088354 (43381 + 50859 * tree_depth)
- Withdraw gas cost: 301233
- Circuit Constraints = 28271 (1869 + 1325 * tree_depth)
- Circuit Proof time = 10213ms (1071 + 347 * tree_depth)
- Serverless

![image](diagram.png)

## Whitepaper
**[https://tornado.cash/Tornado.cash_whitepaper_v1.4.pdf](https://tornado.cash/Tornado.cash_whitepaper_v1.4.pdf)**

## Was it audited?

Tornado.cash protocols, circuits, and smart contracts were audited by a group of experts from [ABDK Consulting](https://www.abdk.consulting), specializing in zero knowledge, cryptography, and smart contracts.

During the audit no critical issues were found and all outstanding issues were fixed. The results can be found here:

* Cryptographic review https://tornado.cash/Tornado_cryptographic_review.pdf
* Smart contract audit https://tornado.cash/Tornado_solidity_audit.pdf
* Zk-SNARK circuits audit https://tornado.cash/Tornado_circuit_audit.pdf

Underlying circomlib dependency is currently being audited, and the team already published most of the fixes for found issues

## Requirements
1. `node v11.15.0`
2. `npm install -g npx`

## Usage

You can see example usage in cli.js, it works both in console and in browser.

1. `npm install`

Usage:
```bash
tornado-cli

  Submit a deposit and return the resulting note

  $ ./tornado.js --deposit --from <address> --pool 1
  $ ./tornado.js -dp 1

  Withdraw a note to 'recipient' account

  $ ./tornado.js --withdraw <note> --to <recipient> --relay [relayUrl]
  $ ./tornado.js -w <note> -t <recipient>

  Check address balance

  $ ./tornado.js -b <address>


Commands

  -d, --deposit           Submit a deposit and return the resulting note
  -w, --withdraw note     Withdraw a note to 'recipient' account
  -b, --balance address   Check address balance
  -P, --pools             List available pools
  -h, --help              Print this usage guide.

Options

  -f, --from address   From address (default: eth.accounts[0])
  -p, --pool id        Pool to use (default: 1)

Withdraw Options

  -t, --to address   Recipient for withdraw
  -r, --relay url    Relay to use for withdraw
```

Example:
```bash
./tornado.js --deposit
```
> Your note: tornado-eth-0.1-42-0xf73dd6833ccbcc046c44228c8e2aa312bf49e08389dadc7c65e6a73239867b7ef49c705c4db227e2fadd8489a494b6880bdcb6016047e019d1abec1c7652
> Tornado UBQ balance is 8.9
> Sender account UBQ balance is 1004873.470619891361352542
> Submitting deposit transaction
> Tornado UBQ balance is 9
> Sender account UBQ balance is 1004873.361652048361352542

```bash
./tornado.js --withdraw 0xf73dd6833ccbcc046c44228c8e2aa312bf49e08389dadc7c65e6a73239867b7ef49c705c4db227e2fadd8489a494b6880bdcb6016047e019d1abec1c7652 --to 0x8589427373D6D84E98730D7795D8f6f8731FDA16
```

> Relay address:  0x6A31736e7490AbE5D5676be059DFf064AB4aC754
> Getting current state from tornado contract
> Generating SNARK proof
> Proof time: 9117.051ms
> Sending withdraw transaction through relay
> Transaction submitted through the relay. View transaction on etherscan https://kovan.etherscan.io/tx/0xcb21ae8cad723818c6bc7273e83e00c8393fcdbe74802ce5d562acad691a2a7b
> Transaction mined in block 17036120
> Done

## Credits

Special thanks to @barryWhiteHat and @kobigurk for valuable input,
and to @jbaylina for awesome [Circom](https://github.com/iden3/circom) & [Websnark](https://github.com/iden3/websnark) framework
