'use strict';

let Games = require('../Games');
let _ = require('lodash');
let UserSockets = require('../UserSockets');
let RoundStartTimes = require('../RoundStartTimes');

class MessageAPI {
	constructor(opts) {
		this.app = opts.app;
		this.io = opts.io;

		this.onMessageReceived = this.onMessageReceived.bind(this);

		this.io.on('connection', socket => {
			socket.on('gameMessage', this.onMessageReceived);
		});
	}

	onMessageReceived(opts) {
		let game = Games.find(game => game.id === opts.gameId);
		let activeRound = _.get(game, 'activeRound');
		let message = opts.message;
		let res;
		if (opts.userId && activeRound) {
			let wordIsCorrect = this.wordIsCorrect(activeRound, message);
			if (wordIsCorrect) {
				// If someone has already guessed the correct answer and they type it again then do nothing
				if (game.activeRound.get('userPoints')[opts.userId]) { return; }
				if (game.activeRound.get('drawerId') === opts.userId) { return; }
				let points = this.getPoints(game);
				game.activeRound.get('userPoints')[opts.userId] = points;
				game.get('users').forEach(user => {
					let socket = UserSockets.get(user);
					if (socket) {
						socket.emit(`change:activeRoundPoints:${game.activeRound.id}`, game.activeRound.get('userPoints'));
					}
				});
				res = {
					text: '',
					wordIsCorrect: true,
					points: points,
					userId: opts.userId
				};
			} else {
				res = {
					text: message,
					wordIsCorrect: false,
					userId: opts.userId
				};
			}
			game.get('users').forEach(user => {
				let socket = UserSockets.get(user);
				if (socket) {
					socket.emit(`gameMessage:${game.id}`, res);
				}
			});
		}
	}

	wordIsCorrect(round, word) {
		return round.get('word') === word;
	}

	getPoints(game) {
		let percentTimeLeftInRound = 1-((Date.now()-RoundStartTimes.get(game))/game.get('gameTime'));
		return Math.round(percentTimeLeftInRound*100);
	}	
}

module.exports = opts => {
	return new MessageAPI(opts);
}