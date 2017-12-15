//GAME DATA
var opt_playerspeed = 120.
	opt_pdt 		= 0.0001,
	opt_local 		= 0.016;



var frame_time = 60/1000; // run the local game at 16ms/ 60hz
if(typeof(global) != 'undefined') frame_time = 45; //run server at 45ms/ 22hz

(function () {

    var lastTime = 0;
    var vendors = ['ms', 'moz', 'webkit', 'o'];

    for (var x = 0; x < vendors.length && !window.requestAnimationFrame; ++x) {
        window.requestAnimationFrame = window[vendors[x] + 'RequestAnimationFrame'];
        window.cancelAnimationFrame = window[vendors[x] + 'CancelAnimationFrame'] || window[vendors[x] + 'CancelRequestAnimationFrame'];
    }

    if (!window.requestAnimationFrame) {
        window.requestAnimationFrame = function (callback, element) {
            var currTime = Date.now(), timeToCall = Math.max(0, frame_time - (currTime - lastTime));
            var id = window.setTimeout(function(){callback(currTime + timeToCall); }, timeToCall);
            lastTime = currTime + timeToCall;
            return id;
        };
    }

    if (!window.cancelAnimationFrame) {
        window.cancelAnimationFrame = function (id){clearTimeout(id);};
    }

}() );



//*****************************************************************************************************
// Game Core Class
//*****************************************************************************************************

//Game Core constructor
var game_core = function(game_instance){
	this.instance = game_instance;
	this.server = this.instance !== undefined;

	this.world = {
		width: 720,
		height: 480
	};

	this.playerspeed = opt_playerspeed;

	//Physics times
	this._pdt = opt_pdt;				//The physics update delta time
	this._pdte = new Date().getTime();	//The physics update last delta time

	//Local times
	this.local_time = opt_local;		//The local timer
	this._dt = new Date().getTime();	//The local timer delta
	this._dte = new Date().getTime();	//The local timer last frame time

	//Start the physics loop
	this.create_physics_simulation();

	//Start the fast paced timer
	this.create_timer();

	//Client init
	if(!this.server){
		//Create keyboard handler
		this.keyboard = new THREEx.KeyboardState();

		//Create default settings
		this.client_create_configuration();

		//List of previous server updates
		this.server_updates = [];

		//Connect to the server
		this.client_connect_to_server();

		//Start pinging server for latency
		this.client_create_ping_timer();
	}
	else{
		this.server_time = 0;
		this.laststate = {};
	}
};

//server side we set the 'game_core' class to a global type, so that it can use it anywhere.
if(typeof(global) != 'undefined') {
    module.exports = global.game_core = game_core;
}

//*****************************************************************************************************
// Helper functions
//*****************************************************************************************************
	// (4.22208334636).fixed(n) will return fixed point value to n places, default n = 3
	Number.prototype.fixed = function(n) { n = n || 3; return parseFloat(this.toFixed(n)); };
	//copies a 2d vector like object from one to another
	game_core.prototype.pos = function(a) { return {x:a.x,y:a.y}; };
	//Add a 2d vector with another one and return the resulting vector
	game_core.prototype.v_add = function(a,b) { return { x:(a.x+b.x).fixed(), y:(a.y+b.y).fixed() }; };
	//Subtract a 2d vector with another one and return the resulting vector
	game_core.prototype.v_sub = function(a,b) { return { x:(a.x-b.x).fixed(),y:(a.y-b.y).fixed() }; };
	//Multiply a 2d vector with a scalar value and return the resulting vector
	game_core.prototype.v_mul_scalar = function(a,b) { return {x: (a.x*b).fixed() , y:(a.y*b).fixed() }; };
	//For the server, we need to cancel the setTimeout that the polyfill creates
	game_core.prototype.stop_update = function() {  window.cancelAnimationFrame( this.updateid );  };
	//Simple linear interpolation
	game_core.prototype.lerp = function(p, n, t) { var _t = Number(t); _t = (Math.max(0, Math.min(1, _t))).fixed(); return (p + _t * (n - p)).fixed(); };
	//Simple linear interpolation between 2 vectors
	game_core.prototype.v_lerp = function(v,tv,t) { return { x: this.lerp(v.x, tv.x, t), y:this.lerp(v.y, tv.y, t) }; };



//*****************************************************************************************************
// Player Class
//*****************************************************************************************************

//Player constructor
var game_player = function(game_instance, player_instance){
	this.instance = player_instance;
	this.game = game_instance;

	//Set up inital values
	this.pos = {x:0, y:0};
	this.size = {x:16, y:16, hx:8, hy:8};
	this.state = 'connected';
	this.id = player.userid;

    //These are used in moving around
    this.old_state = {pos:{x:0,y:0}};
    this.cur_state = {pos:{x:0,y:0}};
    this.state_time = new Date().getTime();

    //Local history of inputs
    this.inputs = [];

    //The world bounds we are confined to
    this.pos_limits = {
        x_min: this.size.hx,
        x_max: this.game.world.width - this.size.hx,
        y_min: this.size.hy,
        y_max: this.game.world.height - this.size.hy
    };  
};

//Drawing Method
game_player.prototype.draw = function(){
	game.ctx.fillStyle = "#0000FF"; //Blue

    //Draw the square
    game.ctx.fillRect(this.pos.x - this.size.hx, this.pos.y - this.size.hy, this.size.x, this.size.y);

    //Draw a status update
    game.ctx.fillStyle = this.info_color;
    game.ctx.fillText(this.state, this.pos.x+10, this.pos.y + 4);
};

if(typeof(global) != 'undefined') {
    module.exports = global.game_player = game_player;
}
//*****************************************************************************************************
// Shared Functions
//*****************************************************************************************************

//Main update loop
game_core.prototype.update = function(t){
    //Work out the delta time
    this.dt = this.lastframetime ? ( (t - this.lastframetime)/1000.0).fixed() : opt_local;

    //Store the last frame time
    this.lastframetime = t;

    //Update the game specifics
    if(!this.server) {
        this.client_update();
    } else {
        this.server_update();
    }

    //schedule the next update
    this.updateid = window.requestAnimationFrame(this.update.bind(this), this.viewport);
};

//NOTE: currently assumes game_player
game_core.prototype.check_collision = function(item){
    //Left wall.
    if(item.pos.x <= item.pos_limits.x_min) {
        item.pos.x = item.pos_limits.x_min;
    }

    //Right wall
    if(item.pos.x >= item.pos_limits.x_max) {
        item.pos.x = item.pos_limits.x_max;
    }
    
    //Top wall.
    if(item.pos.y <= item.pos_limits.y_min) {
        item.pos.y = item.pos_limits.y_min;
    }

    //bottom wall
    if(item.pos.y >= item.pos_limits.y_max) {
        item.pos.y = item.pos_limits.y_max;
    }

    //Fixed point helps be more deterministic
    item.pos.x = item.pos.x.fixed(4);
    item.pos.y = item.pos.y.fixed(4);
};

game_core.prototype.process_input = function(player) {
    var x_dir = 0;
    var y_dir = 0;
    var ic = player.inputs.length;

    if(ic) {
        for(var j = 0; j < ic; ++j) {
            if(player.inputs[j].seq <= player.last_input_seq) continue;

            var input = player.inputs[j].inputs;
            var c = input.length;
            for(var i = 0; i < c; ++i) {
                var key = input[i];
                if(key == 'l') {
                    x_dir -= 1;
                }
                if(key == 'r') {
                    x_dir += 1;
                }
                if(key == 'd') {
                    y_dir += 1;
                }
                if(key == 'u') {
                    y_dir -= 1;
                }
            } 
        }
    } 

    //we have a direction vector now, so apply the same physics as the client
    var resulting_vector = this.physics_movement_vector_from_direction(x_dir,y_dir);
    if(player.inputs.length) {
    	//clear the array
        player.last_input_time = player.inputs[ic-1].time;
        player.last_input_seq = player.inputs[ic-1].seq;
    }

    return resulting_vector;
};

game_core.prototype.physics_movement_vector_from_direction = function(x,y) {
    //Must be fixed step, at physics sync speed.
    return {
        x : (x * (this.playerspeed * 0.015)).fixed(3),
        y : (y * (this.playerspeed * 0.015)).fixed(3)
    };
}; 

game_core.prototype.update_physics = function() {
    if(this.server) {
        this.server_update_physics();
    } else {
        this.client_update_physics();
    }
};

//*****************************************************************************************************
// Server Functions
//*****************************************************************************************************

//Updated at 15ms , simulates the world state
game_core.prototype.server_update_physics = function() {
	for(var playerid in this.players){
		//Handle player
		this.players[playerid].old_state.pos = this.pos(this.players.self.pos);
    	var new_dir = this.process_input(this.players[playerid]);
    	this.players[playerid].pos = this.v_add( this.players[playerid].old_state.pos, new_dir);

    	//Keep the physics position in the world
    	this.check_collision(this.players[playerid]);

    	//we have cleared the input buffer
    	this.players[playerid].inputs = [];
	}
};

//Makes sure things run smoothly and notifies 
//clients of changes on the server side
game_core.prototype.server_update = function(){

    //Update the state of our local clock to match the timer
    this.server_time = this.local_time;

    //Make a snapshot of the current state, for updating the clients
    var playerPos = [], playerIS = [];
    for(var playerid in this.players){
    	playerPos[playerid] = this.players[playerid].pos;
    	playerIS[playerid] = this.players[playerid].last_input_seq;
    }

    this.laststate = {
        pos  : playerPos,           //players' position
        is   : playerIS,     		//players' last input processed
        t    : this.server_time     //current local time on the server
    };

    //Send the snapshot to the players
    for(var playerid in this.players){
    	this.players[playerid].instance.emit('onserverupdate', this.laststate);
    }
};

game_core.prototype.handle_server_input = function(client_id, input, input_time, input_seq) {
	//Store the input on the player instance for processing in the physics loop
   	this.players[client_id].inputs.push({inputs:input, time:input_time, seq:input_seq});
};


//*****************************************************************************************************
// Client Functions
//*****************************************************************************************************

//This takes input from the client and keeps a record,
//It also sends the input information to the server immediately
//as it is pressed. It also tags each input with a sequence number.
game_core.prototype.client_handle_input = function(){
    var x_dir = 0;
    var y_dir = 0;
    var input = [];
    this.client_has_input = false;

    //Listen to keyboard presses
    if( this.keyboard.pressed('A') ||
        this.keyboard.pressed('left')) {
        x_dir = -1;
        input.push('l');
    }
    if( this.keyboard.pressed('D') ||
        this.keyboard.pressed('right')) {
        x_dir = 1;
        input.push('r');
    }
    if( this.keyboard.pressed('S') ||
        this.keyboard.pressed('down')) {
        y_dir = 1;
        input.push('d');
    }
    if( this.keyboard.pressed('W') ||
        this.keyboard.pressed('up')) {
        y_dir = -1;
        input.push('u');
    }


    if(input.length) {
        //Update what sequence we are on now
        this.input_seq += 1;

        //Store the input state as a snapshot of what happened.
        this.players.self.inputs.push({
            inputs : input,
            time : this.local_time.fixed(3),
            seq : this.input_seq
        });

        //Send the packet of information to the server.
        //The input packets are labelled with an 'i' in front.
        var server_packet = 'i.';
            server_packet += input.join('-') + '.';
            server_packet += this.local_time.toFixed(3).replace('.','-') + '.';
            server_packet += this.input_seq;

        this.socket.send(server_packet);

        //Return the direction if needed
        return this.physics_movement_vector_from_direction(x_dir, y_dir);

    } 
    else {
        return {x:0,y:0};
    }
};

game_core.prototype.client_process_net_prediction_correction = function() {
    //if no updates
    if(!this.server_updates.length) return;


    //The most recent server update
    var latest_server_data = this.server_updates[this.server_updates.length-1];

    //Our latest server position and input
    var server_pos 				= latest_server_data.pos[this.id],
		last_input_on_server 	= latest_server_data.is[this.id];
    		


    //here we handle our local input prediction,
    //by correcting it with the server and reconciling its differences
    if(last_input_on_server) {
        //The last input sequence index in my local input list
        var lastinputseq_index = -1;

        //Find this input in the list, and store the index
        for(var i = 0; i < this.players[this.id].inputs.length; ++i) {
            if(this.players[this.id].inputs[i].seq == last_input_on_server) {
                lastinputseq_index = i;
                break;
            }
        }

        //crop the list of any updates that have already processed
        if(lastinputseq_index != -1) {
            //so we have now gotten an acknowledgement from the server that our inputs here have been accepted
            //and that we can predict from this known position instead

            //remove the rest of the inputs we have confirmed on the server
            var number_to_clear = Math.abs(lastinputseq_index - (-1));
            this.players[this.id].inputs.splice(0, number_to_clear);

            //The player is now located at the new server position, authoritive server
            this.players[this.id].cur_state.pos = this.pos(server_pos);
            this.players[this.id].last_input_seq = lastinputseq_index;

            //Now we reapply all the inputs that we have locally that
            //the server hasn't yet confirmed. This will 'keep' our position the same,
            //but also confirm the server position at the same time.
            this.client_update_physics();
            this.client_update_local_position();

        } 
    } 
};

game_core.prototype.client_process_net_updates = function() {
    //if no updates
    if(!this.server_updates.length) return;

    //First : Find the position in the updates, on the timeline
    //We call this current_time, then we find the past_pos and the target_pos using this,
    //searching throught the server_updates array for current_time in between 2 other times.
    // Then :  other player position = lerp ( past_pos, target_pos, current_time );

    //Find the position in the timeline of updates we stored.
    var current_time = this.client_time;
    var count = this.server_updates.length-1;
    var target = null;
    var previous = null;

    //We look from the 'oldest' updates, since the newest ones
    //are at the end (list.length-1 for example). This will be expensive
    //only when our time is not found on the timeline, since it will run all
    //samples. Usually this iterates very little before breaking out with a target.
    for(var i = 0; i < count; ++i) {
        var point = this.server_updates[i];
        var next_point = this.server_updates[i+1];

        //Compare our point in time with the server times we have
        if(current_time > point.t && current_time < next_point.t) {
            target = next_point;
            previous = point;
            break;
        }
    }

    //With no target we store the last known
    //server position and move to that instead
    if(!target) {
        target = this.server_updates[0];
        previous = this.server_updates[0];
    }

    //Now that we have a target and a previous destination,
    //We can interpolate between then based on 'how far in between' we are.
    //This is simple percentage maths, value/target = [0,1] range of numbers.
    //lerp requires the 0,1 value to lerp to? thats the one.
    if(target && previous) {
        this.target_time = target.t;

        var difference = this.target_time - current_time;
        var max_difference = (target.t - previous.t).fixed(3);
        var time_point = (difference/max_difference).fixed(3);

        //Because we use the same target and previous in extreme cases
        //It is possible to get incorrect values due to division by 0 difference
        //and such. This is a safe guard and should probably not be here. lol.
        if(isNaN(time_point)) time_point = 0;
        if(time_point == -Infinity) time_point = 0;
        if(time_point == Infinity) time_point = 0;

        //The most recent server update
        var latest_server_data = this.server_updates[this.server_updates.length-1];

        //These are the exact server positions from this tick
        for(var playerid in this.players){
        	if(playerid == this.id ) continue;

        	var other_server_pos = latest_server_data.pos[playerid];
        	var other_target_pos = target.pos[playerid];
        	var other_past_pos = previous.pos[playerid];

        	var pastPos = this.v_lerp(other_past_pos, other_target_pos, time_point);

        	if(this.client_smoothing) {
            	this.players.other.pos = this.v_lerp(this.players[playerid].pos, pastPos, this._pdt*this.client_smooth);
	        } else {
	            this.players.other.pos = this.pos(pastPos);
	        }
        }

        
        //if not predicting client movement, maintain the local player position
        //using the same method, smoothing the players information from the past.
        if(!this.client_predict) {
            //These are the exact server positions from this tick, but only for the ghost
            var my_server_pos = latest_server_data.pos[this.id];

            //The other players positions in this timeline, behind us and in front of us
            var my_target_pos = target.pos[this.id];
            var my_past_pos = previous.pos[this.id];

            //Snap the ghost to the new server position
            var pastPos = this.pos(my_server_pos);
            var local_target = this.v_lerp(my_past_pos, my_target_pos, time_point);

            //Smoothly follow the destination position
            if(this.client_smoothing) {
                this.players[this.id].pos = this.v_lerp( this.players[this.id].pos, local_target, this._pdt*this.client_smooth);
            } else {
                this.players[this.id].pos = this.pos(local_target);
            }
        }
    }
};

game_core.prototype.client_onserverupdate_recieved = function(data){
    var this_player = this.players[this.id];
    
    //Store the server time (this is offset by the latency in the network, by the time we get it)
    this.server_time = data.t;

    //Update our local offset time from the last server update
    this.client_time = this.server_time - (this.net_offset/1000);


    //Cache the data from the server, and then play the timeline
    //back to the player with a small delay (net_offset), allowing
    //interpolation between the points.
    this.server_updates.push(data);

    //limit the buffer in seconds worth of updates
    //60fps*buffer seconds = number of samples
    if(this.server_updates.length >= ( 60*this.buffer_size )) {
        this.server_updates.splice(0,1);
    }

    //We can see when the last tick we know of happened.
    //If client_time gets behind this due to latency, a snap occurs
    //to the last tick. Unavoidable, and a really bad connection here.
    //If that happens it might be best to drop the game after a period of time.
    this.oldest_tick = this.server_updates[0].t;

    //Handle the latest positions from the server
    //and make sure to correct our local predictions, making the server have final say.
    this.client_process_net_prediction_correction();
};

game_core.prototype.client_update_local_position = function(){
	if(this.client_predict) {
        //Work out the time we have since we updated the state
        var t = (this.local_time - this.players[this.id].state_time) / this._pdt;

        //Then store the states for clarity,
        var old_state = this.players[this.id].old_state.pos;
        var current_state = this.players[this.id].cur_state.pos;

        //Make sure the visual position matches the states we have stored
        this.players[this.id].pos = current_state;
        
        //We handle collision on client if predicting.
        this.check_collision(this.players[this.id]);

    }
};

game_core.prototype.client_update_physics = function() {
    //Fetch the new direction from the input buffer,
    //and apply it to the state so we can smooth it in the visual state
    if(this.client_predict) {
        this.players[this.id].old_state.pos = this.pos(this.players[this.id].cur_state.pos);
        var nd = this.process_input(this.players[this.id]);
        this.players[this.id].cur_state.pos = this.v_add(this.players[this.id].old_state.pos, nd);
        this.players[this.id].state_time = this.local_time;

    }
};

game_core.prototype.client_update = function() {
    //Clear the screen area
    this.ctx.clearRect(0,0,720,480);

    //Capture inputs from the player
    this.client_handle_input();

    //Network player just gets drawn normally, with interpolation from
    //the server updates, smoothing out the positions from the past.
    //Note that if we don't have prediction enabled - this will also
    //update the actual local client position on screen as well.
    this.client_process_net_updates();

    //Now they should have updated, we can draw the entity
    for(var playerid in this.players){
    	if(playerid == this.id) continue;
    	this.players[playerid].draw();
    }
    
    //When we are doing client side prediction, we smooth out our position
    //across frames using local input states we have stored.
    this.client_update_local_position();

    //And then we finally draw
    this.players[this.id].draw();

    //Work out the fps average
    this.client_refresh_fps();
};

game_core.prototype.create_timer = function(){
    setInterval(function(){
        this._dt = new Date().getTime() - this._dte;
        this._dte = new Date().getTime();
        this.local_time += this._dt/1000.0;
    }.bind(this), 4);
};

game_core.prototype.create_physics_simulation = function() {
    setInterval(function(){
        this._pdt = (new Date().getTime() - this._pdte)/1000.0;
        this._pdte = new Date().getTime();
        this.update_physics();
    }.bind(this), 15);
};

game_core.prototype.client_create_ping_timer = function() {
    //Set a ping timer to 1 second, to maintain the ping/latency between
    //client and server and calculated roughly how our connection is doing
    setInterval(function(){
        this.last_ping_time = new Date().getTime();
        this.socket.send('p.' + (this.last_ping_time) );
    }.bind(this), 1000); 
};

game_core.prototype.client_create_configuration = function() {
    this.show_help = false;             //Whether or not to draw the help text
    this.show_server_pos = false;       //Whether or not to show the server position
    this.show_dest_pos = false;         //Whether or not to show the interpolation goal
    this.client_predict = true;         //Whether or not the client is predicting input
    this.input_seq = 0;                 //When predicting client inputs, we store the last input as a sequence number
    this.client_smoothing = true;       //Whether or not the client side prediction tries to smooth things out
    this.client_smooth = 25;            //amount of smoothing to apply to client update dest

    this.net_latency = 0.001;           //the latency between the client and the server (ping/2)
    this.net_ping = 0.001;              //The round trip time from here to the server,and back
    this.last_ping_time = 0.001;        //The time we last sent a ping

    this.net_offset = 100;              //100 ms latency between server and client interpolation for other clients
    this.buffer_size = 2;               //The size of the server history to keep for rewinding/interpolating.
    this.target_time = 0.01;            //the time where we want to be in the server timeline
    this.oldest_tick = 0.01;            //the last time tick we have available in the buffer

    this.client_time = 0.01;            //Our local 'clock' based on server time - client interpolation(net_offset).
    this.server_time = 0.01;            //The time the server reported it was at, last we heard from it
    
    this.dt = 0.016;                    //The time that the last frame took to run
    this.fps = 0;                       //The current instantaneous fps (1/this.dt)
    this.fps_avg_count = 0;             //The number of samples we have taken for fps_avg
    this.fps_avg = 0;                   //The current average fps displayed in the debug UI
    this.fps_avg_acc = 0;               //The accumulation of the last avgcount fps samples

    this.lit = 0;
    this.llt = new Date().getTime();
};


//*****************************************************************************************************
// Client Server Command Functions
//*****************************************************************************************************

game_core.prototype.client_onnetmessage = function(data) {
    var commands = data.split('.');
    var command = commands[0];
    var subcommand = commands[1] || null;
    var commanddata = commands[2] || null;

    switch(command) {
        case 's': //server message
            switch(subcommand) {
                case 'h' : //host a game requested
                    this.client_onhostgame(commanddata); break;

                case 'j' : //join a game requested
                    this.client_onjoingame(commanddata); break;

                case 'r' : //ready a game requested
                    this.client_onreadygame(commanddata); break;

                case 'p' : //server ping
                    this.client_onping(commanddata); break;
            } 
        break;
    }           
};

game_core.prototype.client_onping = function(data) {
    this.net_ping = new Date().getTime() - parseFloat(data);
    this.net_latency = this.net_ping/2;
};

game_core.prototype.client_onconnected = function(data) {
    //The server responded that we are now in a game,
    //this lets us store the information about ourselves and set the colors
    //to show we are now ready to be playing.
    this.id = data.id;
    this.players[this.id].state = 'connected';
    this.players[this.id].online = true;
};

game_core.prototype.client_ondisconnect = function(data) {
    //When we disconnect, we don't know if the other player is
    //connected or not, and since we aren't, everything goes to offline
    this.players[this.id].state = 'not-connected';
    this.players[this.id].online = false;

    for(var playerid in this.players){
    	if(playerid == this.id) continue;
    	this.players[playerid].state = 'not-connected';
    }
};

game_core.prototype.client_connect_to_server = function() {
    //Store a local reference to our connection to the server
    this.socket = io.connect();

    //When we connect, we are not 'connected' until we have a server id
    //and are placed in a game by the server. The server sends us a message for that.
    this.socket.on('connect', function(){
        //this.players.self.state = 'connecting';
    }.bind(this));

    //Sent when we are disconnected (network, server down, etc)
    this.socket.on('disconnect', this.client_ondisconnect.bind(this));
    
    //Sent each tick of the server simulation. This is our authoritive update
    this.socket.on('onserverupdate', this.client_onserverupdate_recieved.bind(this));
    
    //Handle when we connect to the server, showing state and storing id's.
    this.socket.on('onconnected', this.client_onconnected.bind(this));

    //On error we just show that we are not connected for now. Can print the data.
    this.socket.on('error', this.client_ondisconnect.bind(this));

    //On message from the server, we parse the commands and send it to the handlers
    this.socket.on('message', this.client_onnetmessage.bind(this));
};

game_core.prototype.client_refresh_fps = function() {
    //We store the fps for 10 frames, by adding it to this accumulator
    this.fps = 1/this.dt;
    this.fps_avg_acc += this.fps;
    this.fps_avg_count++;

    //When we reach 10 frames we work out the average fps
    if(this.fps_avg_count >= 10) {
        this.fps_avg = this.fps_avg_acc/10;
        this.fps_avg_count = 1;
        this.fps_avg_acc = this.fps;
    } 
};
