'use strict';

var http      = require('http');
var express   = require('express');
var app       = express();
var http      = require('http').Server(app);
var path      = require('path');
var io        = require('socket.io')(http);
var buildDir  = path.resolve(__dirname, '../client/public');
var bodyParser = require('body-parser');

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: true}));

// Bootstrap the game
require('./src')({
	app: app,
	io: io
});

app.use('/static/', express.static(buildDir));

app.all('/*', function(req, res){
	res.sendFile('index.html', {root: buildDir});
});

http.listen(3007, function(){
  console.log('listening on *:3007');
});