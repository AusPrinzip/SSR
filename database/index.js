const config = require("../config/index.js");
const MongoClient = require('mongodb').MongoClient;

function createIndex () { 
  smartsteem.createIndex( { 'account': 1 },{ unique:true })
  .then((res) => console.log(res))
  .catch((e) => console.log(e))
}

// const utils = require('../scripts/utils_mix.js')
var host, port, db, user, password 
// var env = config.env

if (process.env.NODE_ENV === 'development') {
    // utils.logger.debug('Looks like we are in development mode!');
     host = config.dev.db.host;
     port = config.dev.db.port;
     db = config.dev.db.name;
     user = config.dev.db.user;
     password = config.dev.db.password;
} else {
    // utils.logger.debug('Looks like we are in production mode!');
     host = config.build.db.host;
     port = config.build.db.port;
     db = config.build.db.name;
     user = config.build.db.user;
     password = config.build.db.password;
}

var uri = ("mongodb://" + user + ":" + password +"@" + host + ":" + port + "/" + db);
// utils.logger.info('DB uri: ' + uri)

let _db

const connectDB = async (callback) => {
  try {
    MongoClient.connect(uri, { useNewUrlParser: true }, (err, db) => {
      _db = db
      return callback(err)
    })    
  } catch (e) {
    throw e
  }
}

const getDB = () => _db

const disconnectDB = () => _db.close()



module.exports = { connectDB, getDB, disconnectDB }