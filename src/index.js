'use strict';

let Game = require('../../models/Game');
let User = require('../../models/User');
let _ = require('lodash');
let EventEmitter = require('events');
let UserCollection = require('../../models/userCollection');
let Games = require('./Games');
let UserSockets = require('./UserSockets');

let userCollection = new UserCollection();
let gameCollection = Games;

// Notify all of the users when a game is added/removed
function notifyUsersOfGamesChange() {
	// TODO use a user socket map
	// userCollection.notifyAll('update:gameList', gameCollection.getAll().map(game => game.toJSON()));
}
gameCollection.on('add', notifyUsersOfGamesChange);
gameCollection.on('remove', notifyUsersOfGamesChange);

module.exports = opts => {
	let app = opts.app;
	let io = opts.io;
	let activeRoundAPI = require('./api/ActiveRoundAPI')({
		app: app,
		io: io
	});
	let canvasAPI = require('./api/CanvasAPI')({
		app: app,
		io: io
	});
	let messageAPI = require('./api/MessageAPI')({
		app: app,
		io: io
	});

	// Get all games
	app.get('/api/game', function(req, res) {
		res.send(gameCollection.getAll());
	});

	// Get game by id
	app.get('/api/game/:gameId', function(req, res) {
		let gameId = req.params.gameId;
		let game = gameCollection.get({id: gameId});
		if (game) {
			res.send(game.toJSON());
			return;
		}
		res.send(null);
	});

	// Delete a game
	app.delete('/api/game/:gameId', function(req, res) {
		let gameId = req.params.gameId;
		let game = gameCollection.get({id: gameId});
		let userId = _.get(req, 'body.user.id');
		// Only allow the host to delete
		if (game.get('host').id === userId) {
			gameCollection.remove({id: gameId});
			UserSockets.forEach(socket => {
				socket.emit('change:gameList', gameCollection.toJSON());
			});
			game.get('users').forEach(user => {
				let socket = UserSockets.get(user);
				if (socket) {
					socket.emit('leaveGame');
				}
			});
		}
		res.send(game.toJSON());
	});

	// Update game name
	app.post('/api/game/name', function(req, res) {
		let userId = _.get(req, 'body.user.id');
		let gameId = _.get(req, 'body.gameId');
		let gameName = _.get(req, 'body.gameName');
		let game = gameCollection.get({id: gameId});
		// Only allow the host to update the game name
		if (game && game.get('host').id === userId) {
			game.set('name', gameName);
			game.get('users').forEach(user => {
				let socket = UserSockets.get(user);
				if (socket) {
					socket.emit('change:game', game);
				}
			});
			UserSockets.forEach(socket => {
				socket.emit('change:gameList', gameCollection.toJSON());
			});
		}
		res.send();
	});

	// Start game
	app.post('/api/game/start', function(req, res) {
		let userId = _.get(req, 'body.user.id');
		let gameId = _.get(req, 'body.gameId');
		let game = gameCollection.get({id: gameId});
		// Only allow the host to start the game
		if (game && game.get('host').id === userId) {
			activeRoundAPI.startGame(game);
			game.get('users').forEach(user => {
				let socket = UserSockets.get(user);
				if (socket) {
					socket.emit('startGame', game);
				}
			});
		}
		res.send();
	});

	// Join a game
	app.post('/api/game/:gameId', joinGame);
	function joinGame(req, res) {
		let userId = _.get(req, 'body.user.id');
		let gameId = req.params.gameId;
		let game = gameCollection.get({id: gameId});
		let user = userCollection.get({id: userId});
		if (game) {
			if (!_.find(game.get('users'), {id: userId})) {
				game.addUser(user);
				game.get('users').forEach(user => {
					let socket = UserSockets.get(user);
					if (socket) {
						socket.emit('change:game', game);
					}
				});
				UserSockets.forEach(socket => {
					socket.emit('change:gameList', gameCollection.toJSON());
				});
				// user.addGame(game);
			}
			res.send(game.toJSON());
		} else {
			// Game not found
		}
	}

	// Remove user from game
	app.delete('/api/game/:gameId/user', function(req, res) {
		let userId = _.get(req, 'body.user.id');
		let gameId = req.params.gameId;
		let game = gameCollection.get({id: gameId});
		let user = userCollection.get({id: userId});
		if (game && game.get('users').find({id: userId})) {
			game.removeUser(user);
			game.get('users').forEach(user => {
				let socket = UserSockets.get(user);
				if (socket) {
					socket.emit('change:game', game);
				}
			});
		}
		res.send();
	});

	// Create a game
	app.post('/api/game', createGame); 
	function createGame(req, res) {
		let userId = _.get(req, 'body.user.id');
		let user = userCollection.get({id: userId});
		let game = new Game({
			name: req.body.name,
			host: user
		});
		gameCollection.add(game);
		UserSockets.forEach(socket => {
			socket.emit('change:gameList', gameCollection.toJSON());
		});
		res.send(game.toJSON());
	}

	io.on('connection', function(socket) {
		socket.on('saveUser', saveUser.bind(this, socket));
		socket.on('getUserById', getUserById.bind(this, socket));
	});
	function saveUser(socket, user, cb) {
		let newUser = new User({
			name: user.name
		});
		userCollection.add(newUser);
		UserSockets.set(newUser, socket);
		cb(newUser.toJSON());
	}

	function getUserById(socket, userId, cb) {
		let user = userCollection.get({id: userId});
		if (user) {
			UserSockets.set(user, socket);
			cb(user.toJSON());
			return;
		}
		cb({});
	}


	// TESTING

/*
	let fakeSocket = new EventEmitter();

	io.emit('connection', fakeSocket);

	let user;
	fakeSocket.emit('saveUser', {
		name: 'harry potter'
	}, o => user = o);

	let game;
	createGame({
		body: {user: {id: user.id}, name: 'test game'}
	}, {
		send: g => game = g
	});

	joinGame({
		body: {user: {id: user.id}},
		params: {gameId: game.id}
	}, {
		send: () => {}
	})


	fakeSocket.emit('disconnect');

	console.log('g', game);

*/


};