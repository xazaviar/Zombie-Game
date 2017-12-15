/*
	References:
	http://buildnewgames.com/real-time-multiplayer/
*/


//Globals
var port = 8080;
var loggerLevel = 5;

var FATAL 	= 0,
	ERROR	= 1,
	WARNING	= 2,
	INFO	= 3,
	DEBUG	= 4,
	TRACE	= 5;


startServer();

function startServer(){
    var express 	= require('express'),
        bodyParser 	= require('body-parser'),
        app 		= express(),
        server 		= require('http').Server(app);

    app.use(bodyParser.json());
    app.use(express.static('public'));


    server.listen(port);
	console.log('::  Express  :: Listening on port '+port);
    


    //**************************************************************************
    //Webpages
    //**************************************************************************
    app.get('/', function (req, res) {
    	if(loggerLevel >= TRACE) console.log('::  Express  :: page requested: home');
        res.sendFile( __dirname + "/public/game.html" );
    });


    //**************************************************************************
    //Files
    //**************************************************************************
    app.get('/*', function (req, res, next) {
    	var file = req.params[0];

    	if(loggerLevel >= TRACE) console.log('::  Express  :: file requested: '+file);
        res.sendFile( __dirname + '/public/' + file);
    });

    setupSocketIO(server);
}

function setupSocketIO(server){
	var io 			= require('socket.io')(server),
        UUID 		= require('node-uuid');


    //Setup the game server
    game_server = require('./public/js/game.server.js');
    

	//When a player connects
	io.sockets.on('connection', function(client){
		client.userid = UUID();

		console.log(client);

		client.emit('onconnected', {'id': client.userid});

		game_server.joinGame(client, function(joined){
			if(loggerLevel >= INFO) console.log(':: socket.io :: player '+client.userid+' unable to join game.');
		});

		if(loggerLevel >= INFO) console.log(':: socket.io :: player '+client.userid+' connected.');

		//When the player does something
		client.on('message', function(m){
			if(loggerLevel >= TRACE) console.log(':: socket.io :: player '+client.userid+' sent '+ m);

			game_server.onMessage(client, m);
		});


		//When the player disconnects
		client.on('disconnect', function(){
			if(loggerLevel >= INFO) console.log(':: socket.io :: player '+client.userid+' disconnected.');

			game_server.leaveGame(client.userid);
		});

	});
}