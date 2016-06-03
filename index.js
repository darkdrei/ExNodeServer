var app = require('express')();
var http = require('http').Server(app);
var io = require('socket.io')(http);

var clients = {};

io.on('connection', function(socket) {
  socket.on('i-am', function(type) {
  	clients[socket.id] = {'type': type};
  	if (type == 'WEB'){
		  io.to(socket.id).emit('you-are', socket.id);
		  console.log("I AM WEB: " + socket.id);
  	}else
  	if (type == 'CELL'){
  		console.log("I AM CEL: " + socket.id);
  		socket.on('ionic-qr', function(msg){
  			console.log('QR:');
  			console.log(msg);
        io.to(msg.web_id).emit('ionic-qr', msg.cell_id);
		  });
      socket.on('cell-active', function(msg) {
        console.log(msg);
        clients[socket.id].cell_id = msg.cell_id
      });
		  socket.on('send-gps', function(msg){
  			console.log('GPS:');
  			console.log(msg);
  			for (var i in clients){
  				if (clients[i] == 'WEB'){
					 io.to(i).emit('send-gps', msg);
  				}
  			}
		  });
  	}
  });


  socket.on('hola',function(data){
    console.log(data);
    console.log(data.web_id+"  "+socket.id);
    io.to(socket.id).emit('respuesta', {id_gps:'7845652456'});
  });


  socket.on('add-pedido', function(data) {
    console.log(data);
    for (var i in clients){
      if (clients[i].type == 'CELL'){
        io.to(i).emit('notify-pedido', data);
      }
    }
  });
});


app.get('/', function(req, res){
  res.sendFile(__dirname + '/web.html');
});

app.get('/jquery.js', function(req, res){
  res.sendFile(__dirname + '/jquery.js');
});
app.get('/jquery.qrcode.js', function(req, res){
  res.sendFile(__dirname + '/jquery.qrcode.js');
});


app.get('/cell', function(req, res){
  res.sendFile(__dirname + '/cell.html');
});


http.listen(3000, function(){
  console.log('listening on *:3000');
});