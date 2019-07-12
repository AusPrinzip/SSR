
const dsteem              = require('dsteem')
const nodes               = ['anyx.io', 'api.steemit.com', 'api.steemitdev.com', 'api.steem.house', 'appbasetest.timcliff.com', 'gtg.steem.house:8090', 'steemd.minnowsupportproject.org', 'steemd.privex.io', 'rpc.usesteem.com', 'rpc.steemviz.com', 'rpc.steemliberator.com', 'rpc.curiesteem.com']

const chalk = require('chalk')
// const log   = console.log()

const findtrxfrompermlink = require('../findtrxfrompermlink/app.js')
const sm_pub              = 'STM7yk3tav5BFEyppNzHhKaXsMTPw8xYX1B1gWXq6bvtT34uVUKbQ'
var mongoUtil             = require('./database')
const sbt_url             = 'https://steembottracker.net'
const axios               = require('axios')
const utils               = dsteem.cryptoUtils

var response 
var bidbots

var sm_votes          = []
var clients           = []
var confirmed_clients = [] 

nodes.forEach((node) => {
	clients.push(new dsteem.Client('https://' + node))
})
function wait (seconds) {
	return new Promise((resolve, reject) => {
		setTimeout(() => {resolve()}, seconds * 1000)
	})
}
function timeout (seconds) {
	return new Promise((resolve, reject) => {
		setTimeout(() => {
			reject(new Error('timeout'))
		}, seconds * 1000)
	})
}
// testing clients
function loadClients () {
	return new Promise(async (resolve, reject) => {
		var promises = []
		clients.forEach(async(client) => { 
			try {
				promises.push(Promise.race([client.database.call('get_account_history', ['smartsteem', -1, 50]), timeout(3)])) 
				await Promise.all(promises)
				// console.log(client.address + ' is good')
				console.log(chalk.blue(client.address + ' is good'))
				confirmed_clients.push(client)
			} catch(e) {
				console.log(e)
				console.log(chalk.red(client.address + ' is bad'))
			}
		})
		try {
			await Promise.all(promises)
		} catch(e) {
			console.log(e)
		}
		return resolve()
	})
}



mongoUtil.connectDB(async (err) => {
	if (err) throw err

	const db          = mongoUtil.getDB()
	const dbase       = db.db('steemium')
	const smartsteem  = dbase.collection('smartsteem')

	// fetch last 5k smartsteem SM payments and update the DB its faster

	async function getUsers () {
		return new Promise((resolve, reject) => {
			var votesellers = []
			client.database.call('get_account_history', ['smartsteem', -1, 5000])
			.then((res) => {
				res.forEach((el) => {
					let trans = el[1]
					let op = trans.op
					if (op[0] == 'transfer' && op[1].memo.startsWith("#")) {
						votesellers.push(op[1].to)
					}
				})
				let uniq = [...new Set(votesellers)]
				return resolve(uniq)
			})
		})
	}
	// you could store ignored accounts per permlink

	function getRandomInt(max) {
	  return Math.floor(Math.random() * Math.floor(max));
	}

	function compute (client, vote, postURL) {
		return new Promise(async(resolve, reject) => {
			let  permlink = postURL.substr(postURL.lastIndexOf('/') + 1)
			let voter     = vote.voter
			let history   = []
			try {
				history = await client.database.call('get_account_history', [voter, -1, 1500])
			} catch(e){
				console.log(client.address + ' error')
				return reject(e)
			}
			
			let match = history.find((x) => x[1].op[0] == 'vote' && x[1].op[1].permlink == permlink)
			if (!match) {
				try {
					history = await client.database.call('get_account_history', [voter, -1, 5000])
				} catch(e){
					console.log(client.address + ' error')
					return reject(e)
				}
				match = history.find((x) => x[1].op[0] == 'vote' && x[1].op[1].permlink == permlink)
			}
			if (!match) {
				console.log(voter + ' vote-trx to current post (permlink) could not be found')
				console.log(history.length)
				smartsteem.updateOne(
					{postURL: postURL},
					{$addToSet: {ignore: voter}}
				).catch((e) => console.log(e))
				return resolve()
			}
			let trx = await findtrxfrompermlink.findVoteTrx(match[1])
			let digest = utils.transactionDigest(trx)
			let signature
			let pub = ''
			try { 
				signature = dsteem.Signature.fromString(trx.signatures[0])
				pub = signature.recover(digest).toString()
			} catch(e) {
				console.log(e)
				console.log(trx.signatures)
				return resolve()
			}
			if (pub == sm_pub) {
				console.log(chalk.green('BINGO smartmarket voter found! - ' + voter))
				smartsteem.updateOne(
					{postURL: postURL},
					{$addToSet: {accounts: voter}}
				).catch((e) => console.log(e))
				sm_votes.push(vote)
				return resolve()
			} else {
				console.log(voter + ' added to ignore list')
				smartsteem.updateOne(
					{postURL: postURL},
					{$addToSet: {ignore: voter}}
				).catch((e) => console.log(e))
				return resolve()
			}
		})
	}

	async function start (postURL) {
		await loadClients()
		console.log('Number of rpc node connections: ' + confirmed_clients.length)
		let registry = await smartsteem.find({'get_account_history': {$exists: true}}).toArray()
		let lastUpdate = registry[0].lastUpdate
		// refresh get account history every X time

		var author   = postURL.substring(postURL.lastIndexOf('@') + 1, postURL.lastIndexOf('/'))
		var permlink = postURL.substr(postURL.lastIndexOf('/') + 1)

		var ignore_list = []
		let query
		var votesellers = registry[0].get_account_history

		try { 
			response      = await axios.get(sbt_url + '/bid_bots')
			bidbots       = response.data
			bidbots.map((x)   => ignore_list.push(x.name))
			ignore_list.push(...['tipu', 'ocdb'])
			await smartsteem.insertOne({postURL: postURL, ignore: ignore_list, accounts: []})		
		}catch(e) {
			console.log('ignore list entry already exists , error code = ' + e.code)
			if (e.code !== 11000) throw new Error(e)
			query       = await smartsteem.find({postURL: postURL}).toArray()
			ignore_list = query[0].ignore
			votesellers.push(...query[0].accounts)
			console.log('number of registered votesellers => ' + votesellers.length)
			console.log('number of ignored accounts => ' + ignore_list.length)
		}
		let random_node = getRandomInt(confirmed_clients.length)
		confirmed_clients[random_node].database.call('get_content', [author, permlink])
		.then(async(result) => {
			console.log('content loaded')
			let votes = result.active_votes
			if (votes.length == 0) return start(postURL)
			var promises = []
			for (let i = 0; i < votes.length; i++) {
				let vote = votes[i]
				let voter = vote.voter
				console.log(i + ' / ' + votes.length + ' ' + voter)
				if (votesellers.indexOf(voter) > -1) {
					console.log(voter + ' is already registered as SM voteseller')
					sm_votes.push(vote)
					continue
				}
				if (ignore_list.indexOf(voter) > -1) {
					console.log(voter + ' is already registered in the ignore list')
					continue
				}
				promises.push(Promise.race([compute(confirmed_clients[promises.length], vote, postURL), timeout(10)]))
				// let promise = compute(confirmed_clients[promises.length], vote, postURL)
				console.log('using ' + confirmed_clients[promises.length - 1].address)
				if (promises.length == confirmed_clients.length) {
					console.log('confirmed_clients = ' + confirmed_clients.length)
					console.log(chalk.yellow('reached ' + promises.length + ' promises..waiting'))
					console.log(promises)
					// await Promise.race(promises)
					// await wait(8)
					try { 
						await Promise.all(promises)
						// await wait(1)
					} catch(e) {
						console.log(chalk.bgRed.bold(e))
					}
					console.log('done')
					promises.splice(0, promises.length)
				}
			}
			// console.log(sm_votes)
		})
	}
	start('https://steemit.com/travelfeed/@travelfeed/introducing-travelfeed-beta')
	// getUsers().then((res) => {
	// 	smartsteem.insertOne(
	// 		{'get_account_history': res, createdDate: new Date(), lastUpdate: new Date()}
	// 	)
	// })
})





