
const dsteem              = require('dsteem')
const client              = new dsteem.Client('https://anyx.io')
const findtrxfrompermlink = require('../findtrxfrompermlink/app.js')
const sm_pub              = 'STM7yk3tav5BFEyppNzHhKaXsMTPw8xYX1B1gWXq6bvtT34uVUKbQ'
var mongoUtil             = require('./database')
const sbt_url             = 'https://steembottracker.net'
const axios 			  = require('axios')

var response 
var bidbots

mongoUtil.connectDB(async (err) => {
	if (err) throw err

	const db          = mongoUtil.getDB()
	const dbase       = db.db('steemium')
	const smartsteem  = dbase.collection('smartsteem')

	// fetch last 5k smartsteem SM payments and update the DB its faster

	// you could store ignored accounts per permlink

	async function start (postURL) {
		var sm_votes = []
		var author   = postURL.substring(postURL.lastIndexOf('@') + 1, postURL.lastIndexOf('/'))
		var permlink = postURL.substr(postURL.lastIndexOf('/') + 1)
		let utils    = dsteem.cryptoUtils

		var ignore_list   = []
		let query
		var votesellers = []

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
			votesellers = query[0].accounts
			console.log('number of registered votesellers => ' + votesellers.length)
			console.log('number of ignored accounts => ' + ignore_list.length)
		}

		client.database.call('get_content', [author, permlink])
		.then(async(result) => {
			let votes = result.active_votes
			for (let i = 0; i < votes.length; i++) {
				console.log(i + ' / ' + votes.length)
				let vote = votes[i]
				let voter = vote.voter
				if (votesellers.indexOf(voter) > -1) {
					console.log(voter + ' is already registered as SM voteseller')
					sm_votes.push(vote)
					continue
				}
				if (ignore_list.indexOf(voter) > -1) {
					console.log(voter + ' is already registered in the ignore list')
					continue
				}
				let history = await client.database.call('get_account_history', [voter, -1, 500])
				let match = history.find((x) => x[1].op[0] == 'vote' && x[1].op[1].permlink == permlink)
				if (!match) {
					history = await client.database.call('get_account_history', [voter, -1, 5000])
					match = history.find((x) => x[1].op[0] == 'vote' && x[1].op[1].permlink == permlink)
				}
				if (!match) {
					console.log(voter + ' vote-trx to current post (permlink) could not be found')
					smartsteem.updateOne(
						{postURL: postURL},
						{$addToSet: {ignore: voter}}
					)
					continue
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
					continue
				}
				if (pub == sm_pub) {
					console.log('BINGO smartmarket voter found! - ' + voter)
					smartsteem.updateOne(
						{postURL: postURL},
						{$addToSet: {accounts: voter}}
					)
					sm_votes.push(vote)
				} else {
					console.log(voter + ' added to ignore list')
					smartsteem.updateOne(
						{postURL: postURL},
						{$addToSet: {ignore: voter}}
					)
				}
			}
			console.log(sm_votes)
		})
	}
	start('https://steemit.com/travelfeed/@travelfeed/introducing-travelfeed-beta')
})