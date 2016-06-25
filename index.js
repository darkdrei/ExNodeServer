var session = require('./session');
var listening = require('./listening');
var app = require('express')();
var http = require('http').Server(app);
var io = require('socket.io')(http);
var request = require('request');
var mongoose = require('mongoose');
var express = require('express');
var multer  = require('multer')

var storage =   multer.diskStorage({
  destination: function (req, file, callback) {
    callback(null, './img');
  },
  filename: function (req, file, callback) {
    callback(null, file.fieldname + '-' + Date.now()+'.'+file.mimetype.split("/")[1]);
  }
});

var upload = multer({ storage : storage}).single('confirmacion');

var pedidos_pendientes = [];
var pedidos_auto = [];
var motorizados_gps = [];
var motorizado_detenido = {};

io.on('connection', function(socket) {

	socket.on('ionic-qr', function(msg){
		console.log('QR:');
		console.log(msg);
		io.to(msg.web_id).emit('ionic-qr', msg.cell_id);
	});

	socket.on('who-i-am', function() {
		io.to(socket.id).emit('you-are', socket.id);
	});

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
		console.log('web-login', message);
		var cookieJar = request.jar();
		var django_id = message['django_id'];
		var usertype = message['usertype'];
		var username = message['username'];
		var password = message['password'];
		var web_pass = message['web_password'];
		if (usertype == 'CELL') {
			request.post(
				{url:'http://localhost:8000/session/', jar:cookieJar, form: {'username': django_id, 'password': web_pass} },
				function (error, response, body) {
					if (!error && response.statusCode == 200) {
						var data = JSON.parse(body);
						console.log(data);
						session.login(django_id, username, password, usertype, function (success){
							if (success){
								session.add_jar(django_id, cookieJar);
								session.set_value(django_id, 'socket', socket.id, usertype);
								socket.emit('web-success-login');
								socket.emit('list-pedidos', pedidos_pendientes);
								listening.add_session(data.tipo, django_id, django_id, socket);
								console.log(listening.listenings);
								socket.on('disconnect', function(){
									listening.delte_session(data.tipo, django_id, django_id, socket.id);
								});
							}else{
								socket.emit('web-error-login');
							}
						});
					}else{
						socket.emit('web-error-login');
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

		var cookieJar = session.get_jar(django_id);

		if (!cookieJar) {
			console.log("no tienes cookies pri");
		} else if (usertype == 'CELL') {
			request(
				{url:'http://localhost:8000/logged/', jar:cookieJar},
				function (error, response, body) {
					if (!error && response.statusCode == 200) {
						var data = JSON.parse(body);
						session.login(django_id, username, password, usertype, function (success){
							if (success){
								socket.emit('success-login');
								listening.add_session(data.tipo, django_id, django_id, socket);
								socket.on('disconnect', function(){
									listening.delte_session(data.type, django_id, django_id, socket.id);
								});
							}else{
								socket.emit('error-login');
							}
						});
					}
					else{
						console.log("no estas loggeado pri")
					}
				}
			);
		}
		if (usertype == 'WEB') {
			listening.add_session('web', '123', '123', socket);
		};
	});

	socket.on('add-pedido', function(message) {
		var django_id = message['django_id'];
		var usertype = message['usertype'];

		//var ID = session.get_session(django_id, usertype);

		if(true){//ID){
			pedidos_pendientes.push(message.pedido);
			delay_pedido(message.pedido);
			listening.add_messages_by_type(1, [message.pedido], function(django_id, sockets, message){
				for(var s in sockets){
					sockets[s].emit('notify-pedido', message);
				}
			});
		}
	});

	socket.on('asignar-pedido', function(message){
		var django_id = message['django_id'];
		var usertype = message['usertype'];
		var identificador = message['identificador'];

		//var ID = session.get_session(django_id, usertype);

		if(true){//ID){
			listening.add_messages(2, identificador, [message.pedido]);

			var sessions = listening.get_sessions(2, identificador);
			var messages = listening.get_messages(2, identificador);

			for(var i in sessions){
				var session = sessions[i];
				for(var s in session){
					var socket = session[s];
					for(m in messages){
						socket.emit('asignar-pedido', messages[m]);
					}
				}
			}
		}
	});

	socket.on('auto-asignar-pedido', function(message){
		var django_id = message['django_id'];
		var usertype = message['usertype'];
		var identificador = message['identificador'];

		//var ID = session.get_session(django_id, usertype);

		if(true){//ID){
			listening.add_messages(2, identificador, [message.pedido]);

			var sessions = listening.get_sessions(2, identificador);
			var messages = listening.get_messages(2, identificador);

			for(var i in sessions){
				var session = sessions[i];
				for(var s in session){
					var socket = session[s];
					for(m in messages){
						socket.emit('asignar-pedido', messages[m]);
					}
				}
			}
		}
	});

	socket.on('accept-pedido', function(message) {

		console.log('accept-pedido');

		var django_id = message['django_id'];
		var usertype = message['usertype'];

		var ID = session.get_session(django_id, usertype);

		if(ID){
			var index = pedidos_pendientes.findIndex(function(pedido){
				return pedido.id == message.pedido_id;
			});
			console.log('accept-pedido', message, index, pedidos_pendientes[index]);
			listening.add_messages_by_type(1, [pedidos_pendientes[index]], function(django_id, sockets, message){
				for(var s in sockets){
					if(sockets[s] != socket){
						sockets[s].emit('delete-pedido', message);
					}
				}
			});
			delete pedidos_pendientes[index];
			pedidos_pendientes.splice(index, 1);
		}
	});

	socket.on('send-gps', function(message){
		var django_id = message['django_id'];
		var usertype = message['usertype'];

		var ID = session.get_session(django_id, usertype);

		if(ID){
			//console.log('GPS:', message);
			if(!en_movimiento(message, ID['gps'])){
				esperar_movimiento(django_id);
			}else{
				cancelar_espera(django);
			}
			session.set_value(django_id, 'gps', message, usertype);
			listening.add_messages_by_type('web', [message], function(django_id, sockets, message){
				for(var s in sockets){
					sockets[s].emit('gps', message);
				}
			});
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

app.get('/form', function(req, res){
  res.sendFile(__dirname + '/form.html');
});

app.post('/upload',function(req,res){
	console.log("uploading file")
    upload(req,res,function(err) {
        if(err) {
            return res.end("Error uploading file.");
        }
        for(var i in req){
        	console.log(i);
        }
        console.log(req.file);
        console.log(req.body);
        res.end("File is uploaded");
    });
});


http.listen(4000, function(){
  console.log('listening on *:4000');
});

function delay_pedido(data){
	setTimeout(function(){	
		var index = pedidos_pendientes.indexOf(data);
		if (index > -1) {
			var pedido = pedidos_pendientes[index];
			auto_asignar(pedido);
			pedidos_auto.push(pedido);
			delete pedidos_pendientes[index];
			pedidos_pendientes.splice(index, 1);
			console.log("pedido eliminado", data);
			listening.add_messages_by_type(1, [data], function(django_id, sockets, message){
				for(var s in sockets){
					sockets[s].emit('delete-pedido', message);
				}
			});
		}
	}, data.time);
}


function auto_asignar(pedido){
	request.post(
		{url:'http://localhost:8000/auto/', form: {'identificador': '359291054481645'} },
		function (error, response, body) {
			if (!error && response.statusCode == 200) {
				var identificador = body;
				console.log("voy a auto_asignar el pedido" , pedido, 'al usuario', body);
				listening.add_messages(2, identificador, [pedido]);

				var sessions = listening.get_sessions(2, identificador);
				var messages = listening.get_messages(2, identificador);

				for(var i in sessions){
					var session = sessions[i];
					for(var s in session){
						var socket = session[s];
						for(m in messages){
							socket.emit('asignar-pedido', messages[m]);
						}
					}
				}

				listening.add_messages_by_type('web', [pedido], function(django_id, sockets, message){
					for(var s in sockets){
						sockets[s].emit('auto-asignar-pedido', {'pedido':pedido, 'motorizado': identificador});
					}
				});
			}
		}
	)
}

function en_movimiento(actual, anterior){
	return Math.sqrt(Math.pow((actual.lat - actual.lat), 2) + Math.pow((actual.lng - actual.lng), 2)) > 0.00487217386;
}

function esperar_movimiento(identificador){
	console.log("estoy verificando", (motorizado_detenido[identificador] == undefined || motorizado_detenido[identificador]._called));
	if (motorizado_detenido[identificador] == undefined || motorizado_detenido[identificador]._called) {
		motorizado_detenido[identificador] = setTimeout(function(){
			listening.add_messages_by_type('web', [{'identificador': identificador}], function(django_id, sockets, message){
				for(var s in sockets){
					sockets[s].emit('motorizado-detenido', message);
				}
			});
		}, 20000);
	};
}

function cancelar_espera(identificador){
	if (motorizado_detenido[identificador] != undefined && !motorizado_detenido[identificador]._called) {
		clearTimeout(motorizado_detenido[identificador]);
		motorizado_detenido[identificador] = undefined;
		listening.add_messages_by_type('web', [message], function(django_id, sockets, message){
			for(var s in sockets){
				sockets[s].emit('motorizado-movimiento', {'identificador': identificador});
			}
		});
	};
}