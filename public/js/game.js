var socket = io.connect('/');

socket.on('onconnected', function(data){
	console.log(data.id);
});