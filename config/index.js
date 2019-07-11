'use strict'

const path = require('path')

module.exports = {
  build: {
    db: {
        user:process.env.DB_USER,
        password:process.env.DB_PWD,
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT) || 27017,
        name: process.env.DB_NAME || 'db'
    }
  },
  dev: {
    db: {
        user:process.env.DB_USER,
        password:process.env.DB_PWD,
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT) || 27017,
        name: process.env.DB_NAME || 'db'
    }
  }
}
