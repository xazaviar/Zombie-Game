var loggerLevel = 5;
var FATAL 	= 0,
	ERROR	= 1,
	WARNING	= 2,
	INFO	= 3,
	DEBUG	= 4,
	TRACE	= 5;
var UUID 		= require('node-uuid'),
	game_server = module.exports = {
			game: {	"id": UUID(),
					"players": [],
					"player_count": 0,
					"player_count_max": 10
				  }, 
			game_count: 1
		};

//Set shared globals with browser code
global.window = global.document = global;
require('./game.core.js');


//******************************************************************************
// Inital game setup
//******************************************************************************
game_server.game.gamecore = new game_core(game_server.game);
game_server.game.gamecore.update(new Date().getTime());
if(loggerLevel >= TRACE) console.log('The game has been initialized.');


//******************************************************************************
// Game Timer Logic
//******************************************************************************
game_server.local_time = 0;
game_server._dt = new Date().getTime();
game_server._dte = new Date().getTime();

setInterval(function(){
	game_server._dt = new Date().getTime() - game_server._dte;
	game_server._dte = new Date().getTime();
	game_server.local_time += game_server._dt/1000.0;
}, 4);


//******************************************************************************
// Game Server player interactions
//******************************************************************************
game_server.onMessage = function(client, message){
	var message_parts = message.split('.');
	var message_type = message_parts[0];

	if(message_type == 'i'){
		this.onInput(client, message_parts);
	} 
	else if(message_type == 'p'){
		client.send('s.p.' + message_parts[1]);
	}
};

game_server.onInput = function(client, parts){
	var input_commands = parts[1].split('-');
    var input_time = parts[2].replace('-','.');
    var input_seq = parts[3];		

    if(client && client.game && client.game.gamecore) {
        client.game.gamecore.handle_server_input(client.userid, input_commands, input_time, input_seq);
    }
};

game_server.joinGame = function(player, _callback){
	// console.log(this.game, player.userid);

	console.log("HIT");

	if(this.game.player_count <  this.game.player_count_max){
		this.game.players[player.userid] = new game_player(this.game, player);
		this.game.player_count++;
		_callback(true);
	}
	console.log("HIT bad");
	
	_callback(false); //Game must be full
};

game_server.leaveGame = function(player_id){
	delete this.game.players[player_id];
	this.game.player_count--;
}
