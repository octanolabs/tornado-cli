/*
  Command line arguments/usage
*/

const commandLineArgs = require('command-line-args')
const commandLineUsage = require('command-line-usage')

// define options
const optionDefinitions = [
  {
    name: 'deposit',
    type: Boolean,
    alias: 'd',
    description: 'Submit a deposit and return the resulting note'
  },
  {
    name: 'withdraw',
    type: String,
    alias: 'w',
    typeLabel: '{underline note}',
    description: 'Withdraw a note to \'recipient\' account'
  },
  {
    name: 'balance',
    type: String,
    alias: 'b',
    typeLabel: '{underline address}',
    description: 'Check address balance'
  },
  {
    name: 'pools',
    type: Boolean,
    alias: 'P',
    description: 'List available pools'
  },
  {
    name: 'help',
    alias: 'h',
    type: Boolean,
    description: 'Print this usage guide.'
  }
]

const allDefinitions = [
  {
    name: 'from',
    type: String,
    alias: 'f',
    typeLabel: '{underline address}',
    description: 'From address (default: eth.accounts[0])'
  },
  {
    name: 'pool',
    type: Number,
    alias: 'p',
    defaultValue: 1,
    typeLabel: '{underline id}',
    description: 'Pool to use (default: 1)'
  }
]

const withdrawDefinitions = [
  {
    name: 'to',
    type: String,
    alias: 't',
    typeLabel: '{underline address}',
    description: 'Recipient for withdraw'
  },
  {
    name: 'relay',
    type: String,
    alias: 'r',
    typeLabel: '{underline url}',
    description: 'Relay to use for withdraw'
  }
]

// usage template
// https://github.com/75lb/command-line-usage
const sections = [
  {
    header: 'tornado-cli',
    content: [
      'Submit a deposit and return the resulting note\n',
      '$ ./tornado.js --deposit --from <address> --pool 1',
      '$ ./tornado.js -dp 1\n',
      'Withdraw a note to \'recipient\' account\n',
      '$ ./tornado.js --withdraw <note> --to <recipient> --relay [relayUrl]',
      '$ ./tornado.js -w <note> -t <recipient>\n',
      'Check address balance\n',
      '$ ./tornado.js -b <address>\n'
    ]
  },
  {
    header: 'Commands',
    optionList: optionDefinitions
  },
  {
    header: 'Options',
    optionList: allDefinitions
  },
  {
    header: 'Withdraw Options',
    optionList: withdrawDefinitions
  }
]

// parse args/usage
const options = commandLineArgs(optionDefinitions)
const usage = commandLineUsage(sections)

module.exports = {
  options() {
    return options
  },
  usage() {
    return usage
  }
}
