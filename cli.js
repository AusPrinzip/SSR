#!/usr/bin/env node

const [,, ...args] = process.argv
const chalk = require('chalk')
const app = require('./app.js')

console.log(chalk.bgGreen(`running signature analysis on ${args}`))

app.start(args[0])