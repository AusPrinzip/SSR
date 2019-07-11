
const dsteem              = require('dsteem')
const client              = new dsteem.Client('https://anyx.io')
const findtrxfrompermlink = require('../findtrxfrompermlink/app.js')
const sm_pub              = 'STM7yk3tav5BFEyppNzHhKaXsMTPw8xYX1B1gWXq6bvtT34uVUKbQ'
var mongoUtil             = require('./database')
const sbt_url             = 'https://steembottracker.net'
const axios 			  = require('axios')

mongoUtil.connectDB(async (err) => {
	const db          = mongoUtil.getDB()
	const dbase       = db.db('steemium')
	const smartsteem  = dbase.collection('smartsteem')
	let _votesellers  = await smartsteem.find().toArray()
	let votesellers   = _votesellers.map((x) => votesellers.push(x.account))
	const ignore_list = []
	let response      = await axios.get(sbt_url + '/bid_bots')
	let bidbots       = response.data
	bidbots.map((x)   => {return ignore_list.push(x.name)})

	console.log('number of registered votesellers => ' + votesellers.length)
	console.log('number of ignored accounts => ' + ignore_list.length)
  if (err) throw err

	function start () {
		var sm_votes = []
		let postURL = 'https://steemit.com/travelfeed/@travelfeed/introducing-travelfeed-beta'
		var author   = postURL.substring(postURL.lastIndexOf('@') + 1, postURL.lastIndexOf('/'))
		var permlink = postURL.substr(postURL.lastIndexOf('/') + 1)
		let utils = dsteem.cryptoUtils
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
				}
				if (ignore_list.indexOf(voter) > -1) {
					console.log(voter + ' is in the ignore list')
					continue
				}
				let history = await client.database.call('get_account_history', [voter, -1, 1000])
				let match = history.find((x) => x[1].op[0] == 'vote' && x[1].op[1].permlink == permlink)
				if (!match) continue
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
					console.log('BINGO smartmarket voter found!')
					smartsteem.insertOne({account: voter})
					.then((res) => console.log('new smartsteem voteseller added to db'))
					.catch((e) => console.log(e))
					console.log(trx)
					sm_votes.push(vote)
				}
			}
			console.log(sm_votes)
		})
	}

start()

})