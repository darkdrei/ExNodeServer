var session = require('./session');
var app = require('express')();
var http = require('http').Server(app);
var io = require('socket.io')(http);
var request = require('request');


var pedidos_pendientes = [];
var motorizados_gps = [];

io.on('connection', function(socket) {
	socket.on('identify', function(message){
		var django_id = message['django_id'];
		var usertype = message['usertype'];

		var ID = session.get_session(django_id, usertype);
		console.log('identify', {"ID": ID});
		socket.emit('identify', {"ID": ID});
		if (ID){
			session.clear(django_id, usertype);
			session.set_value(django_id, 'socket', socket.id, usertype);
		}
	});

	socket.on('web-login', function(message){
		console.log('web-login')
		var django_id = message['django_id'];
		var usertype = message['usertype'];
		var username = message['username'];
		var password = message['password'];
		var web_pass = message['web_password'];
		if (usertype == 'CELL') {
			request.post(
				'http://192.168.0.106:8000/session/',
				{ form: {'username': django_id, 'password': web_pass} },
				function (error, response, body) {
					if (!error && response.statusCode == 200) {
						session.login(django_id, username, password, usertype, function (success){
							if (success){
								session.set_value(django_id, 'socket', socket.id, usertype);
								socket.emit('web-success-login');
							}else{
								socket.emit('web-error-login');
							}
						});
					}else{
						socket.emit('error-login');
					}
				}
			);
		};
	});

	socket.on('login', function(message){
		var django_id = message['django_id'];
		var usertype = message['usertype'];
		var username = message['username'];
		var password = message['password'];

		if (usertype == 'CELL') {
			session.login(django_id, username, password, usertype, function (success){
				if (success){
					session.set_value(django_id, 'socket', socket.id, usertype);
					socket.emit('success-login');
				}else{
					socket.emit('error-login');
				}
			});
		};
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

http.listen(4000, function(){
  console.log('listening on *:4000');
});

function delay_pedido(data){
  setTimeout(function(){
    var index = pedidos_pendientes.indexOf(data);
    if (index > -1) {
      delete pedidos_pendientes[index];
      pedidos_pendientes.splice(index, 1);
      console.log("pedido eliminado", data);
      for (var i in clients){
        if (clients[i].type == 'CELL'){
         io.to(i).emit('delete-pedido', data);
         io.to(i).emit('request-gps', {});
        }
      }
    }
  }, data.time);
}