'use strict';

let UserSockets = require('../UserSockets');
let RoundStartTimes = require('../RoundStartTimes');
let WordService = require('../WordService');
let Games = require('../Games');
let words = WordService.get();
let Round = require('../../../models/Round');
let _ = require('lodash');
const initialDelayTime = 1000;

class ActiveRoundAPI {

	constructor(opts) {
		this.app = opts.app;
		this.io = opts.io;
	
		// Get all rounds
		this.app.get('/api/rounds/:gameId/:userId', (req, res) => {
			let gameId = req.params.gameId;
			let userId = req.params.userId;
			let game = Games.find(game => game.id === gameId);
			res.send(this._roundsJSON(game, userId));
		});
	}

	_roundsJSON(game, userId) {
		let roundsJSON = game.get('rounds').toJSON();
		if (!roundsJSON.length) {
			return [];
		}
		// In the current round, we only want to send the word with the drawer
		let currentRoundJSON = roundsJSON[roundsJSON.length-1];
		if (currentRoundJSON.drawerId !== userId) {
			currentRoundJSON.word = null;
		}
		currentRoundJSON.percentOfTimeInitiallySpent = (Date.now()-RoundStartTimes.get(game))/game.get('gameTime');
		return roundsJSON;
	}

	startGame(game) {
		// Give everyone a second before beginning
		setTimeout(() => {
			this.createNextRound(game);
		}, initialDelayTime);
	}

	createNextRound(game) {
		if (game.get('rounds').length<game.get('numRounds')) {
			RoundStartTimes.set(game, Date.now());
			let params = this.createNextRoundParams(game);
			game.get('rounds').add(new Round(params));
			game.get('users').forEach(user => {
				let socket = UserSockets.get(user);
				if (socket) {
					socket.emit(`change:rounds:${game.id}`, this._roundsJSON(game, user.id));
				}
			});
			setTimeout(() => {
				this.createNextRound(game);
			}, game.get('gameTime'));
		} else {
			game.get('users').forEach(user => {
				let socket = UserSockets.get(user);
				if (socket) {
					socket.emit(`endGame:${game.id}`);
				}
			});	
			Games.remove(game);
			UserSockets.forEach(socket => {
				socket.emit('change:gameList', Games.toJSON());
			});
		}
	}

	createNextRoundParams(game) {
		let newRoundIndex = game.get('rounds').length;
		let users = game.get('users');
		let drawerId = users.getAtIndex(newRoundIndex%users.length).id;
		// let drawerId = users.getAtIndex(0).id;
		return {
			drawerId: drawerId,
			word: _.sample(words),
			percentOfTimeInitiallySpent: 0,
			name: `Round ${newRoundIndex+1}`
		};
	}

}

module.exports = opts => {
	return new ActiveRoundAPI(opts);
}