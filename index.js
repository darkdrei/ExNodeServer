var session = require('./session');
var listening = require('./listening');
var tracker = require('./tracker');
var app = require('express')();
var http = require('http').Server(app);
var io = require('socket.io')(http);
var request = require('request');
var multer  = require('multer');
var fs = require('fs');

var host =  'http://192.168.0.109:9000'; //'http://localhost:8000';
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

	/*tracker.setup(function(){
		console.log("ok");
		tracker.track('pedido1', 'placa1', 'motorizado perez', 10.3970683, -75.4925648);
		tracker.get_tracks('pedido1', function(doc){
			console.log(doc);
		});
	});*/
	socket.on('ionic-qr', function(msg){
		console.log('QR:');
		console.log(msg);
		io.to(msg.web_id).emit('ionic-qr', {imei: msg.cell_id});
	});

	socket.on('who-i-am', function() {
		io.to(socket.id).emit('you-are', { id: socket.id});
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

		var cookieJar = request.jar();
		var django_id = message['django_id'];
		var usertype = message['usertype'];
		var username = message['username'];
		var password = message['password'];
		var web_pass = message['web_password'];
		if (usertype == 'CELL') {
			request.post(
				{url: host + '/usuario/session/', jar:cookieJar, form: {'username': django_id, 'password': web_pass} },
				function (error, response, body) {
					if (!error && response.statusCode == 200) {
						var data = JSON.parse(body);
						console.log(data);
						session.login(django_id, username, password, usertype, function (success){
							if (success){
								session.add_jar(django_id, cookieJar);
								session.add_data(django_id, data);
								session.set_value(django_id, 'socket', socket.id, usertype);
								socket.emit('web-success-login');
								socket.emit('list-pedidos', pedidos_pendientes);
								listening.add_session(data.tipo, django_id, django_id, socket);
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
				{url: host + '/usuario/logged/', jar:cookieJar},
				function (error, response, body) {
					if (!error && response.statusCode == 200) {
						var data = JSON.parse(body);
						session.login(django_id, username, password, usertype, function (success){
							if (success){
								socket.emit('success-login');
								listening.add_session(data.tipo, django_id, django_id, socket);
								socket.on('disconnect', function(){
									listening.delte_session(data.tipo, django_id, django_id, socket.id);
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
			var empresa = message.empresa;
			var token = message.token;
			session.add_token(socket, token);
			console.log(session.tokens);
			listening.add_session('web-empresa-' + empresa, '123', '123', socket);
		};
	});

	socket.on('add-pedido', function(message) {
		var id = message['django_id'];
		var usertype = message['usertype'];

		//var ID = session.get_session(django_id, usertype);

		if(true){//ID){
			if (message.pedidos) {
				var pedidos = message.pedidos;
				for (var i = pedidos.length - 1; i >= 0; i--) {
					var pedido = pedidos[i];
					pedido.tipo = message.tipo;
					pedidos_pendientes.push(pedido);
					delay_pedido(pedido);
					listening.add_messages_by_type(2, [pedido], function(django_id, sockets, message){
						var ciudad = session.get_data(django_id)['ciudad'];
						if (ciudad == message.ciudad) {
							for(var s in sockets){
								sockets[s].emit('notify-pedido', message);
							}
						};
					});
					listening.add_messages_by_type(1, [pedido], function(django_id, sockets, message){
						var ciudad = session.get_data(django_id)['ciudad'];
						console.log(ciudad, message.ciudad, ciudad == message.ciudad)
						if (ciudad == message.ciudad) {
							for(var s in sockets){
								sockets[s].emit('notify-pedido', message);
							}	
						};
					});
				};
			};
		}
	});

	socket.on('asignar-pedido', function(message){
		var django_id = message['django_id'];
		var usertype = message['usertype'];

		//var ID = session.get_session(django_id, usertype);

		if(true){//ID){

			var pedido = message.pedido;
			pedido.tipo = message.tipo;
			var identificador = message.pedido.motorizado;
			listening.add_messages(1, identificador, [pedido]);

			var sessions = listening.get_sessions(1, identificador);
			var messages = listening.get_messages(1, identificador);

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

	socket.on('recojer-pedido', function(message) {

		console.log('recojer-pedido');

		var django_id = message['django_id'];
		var usertype = message['usertype'];

		var ID = session.get_session(django_id, usertype);

		if(ID){
			recojer_pedido(message.pedido_id, message.cell_id, message.tipo)			
		}
	});

	socket.on('pedido-recibido', function(message) {

		console.log('pedido-recibido');

		var django_id = message['django_id'];
		var usertype = message['usertype'];

		var ID = session.get_session(django_id, usertype);

		if(ID){
			recibir_pedido(message.pedido_id, message.cell_id);
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
			aceptar_pedido(message.pedido_id, message.cell_id);

			if (index > -1) {
				listening.add_messages_by_type(1, [pedidos_pendientes[index]], function(django_id, sockets, message){
					for(var s in sockets){
						if(sockets[s] != socket){
							sockets[s].emit('delete-pedido', message);
						}
					}
				});
				delete pedidos_pendientes[index];
				pedidos_pendientes.splice(index, 1);
			};
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

			var empresa = session.get_data(django_id)['empresa'];
			listening.add_messages_by_type('web-empresa-' + empresa, [message], function(django_id, sockets, message){
				for(var s in sockets){
					sockets[s].emit('gps', message);
				}
			});
		}
	});

	socket.on('reponse-gps', function(message){
		var django_id = message['django_id'];
		var usertype = message['usertype'];

		var ID = session.get_session(django_id, usertype);

		if(ID){
			auto_asignar(message);
		}
	});

	socket.on('select-motorizado', function(message){
		var django_id = message['django_id'];
		var usertype = message['usertype'];

		//var ID = session.get_session(django_id, usertype);

		if(true){//ID){
			var motorizado = message.motorizado;
			var token = message.token;
			console.log(token, motorizado);
			var session_id = session.get_token(token);
			session_id.emit('select-motorizado', message);
		}
	});	
});

app.get('/', function(req, res){
  res.sendFile(__dirname + '/www/web.html');
});

app.get('/js/jquery.js', function(req, res){
  res.sendFile(__dirname + '/www/js/jquery.js');
});
app.get('/js/jquery.qrcode.js', function(req, res){
  res.sendFile(__dirname + '/www/js/jquery.qrcode.js');
});
app.get('/js/web.js', function(req, res){
  res.sendFile(__dirname + '/www/js/web.js');
});
app.get('/css/web.css', function(req, res){
  res.sendFile(__dirname + '/www/css/web.css');
});

app.get('/img/pin.svg', function(req, res){
  res.sendFile(__dirname + '/www/img/pin.svg');
});

app.get('/img/sel_pin.svg', function(req, res){
  res.sendFile(__dirname + '/www/img/sel_pin.svg');
});

app.get('/img/pin_red.svg', function(req, res){
  res.sendFile(__dirname + '/www/img/pin_red.svg');
});

app.get('/cell', function(req, res){
  res.sendFile(__dirname + '/www/cell.html');
});

app.get('/form', function(req, res){
  res.sendFile(__dirname + '/form.html');
});

app.post('/upload',function(req,res){

	console.log("uploading file ");
    upload(req,res,function(err) {
        if(err) {
            return res.end("Error uploading file.");
        }
        var django_id = req.body['django_id'];
		var usertype = req.body['usertype'];
		var pedido = req.body['pedido'];
		var tipo = req.body['tipo'];

		var ID = session.get_session(django_id, usertype);

        if (ID) {
        	var cookieJar = session.get_jar(django_id);
        	var url = host + '/pedidos/confirmar/pws/';
			if(tipo == 1){
				url = host + '/pedidos/confirmar/pplataforma/';
			}
			request.post(
				{
					url: url, jar:cookieJar, formData: 
					{
						pedido: pedido,
						motorizado: django_id,
						imagen: fs.createReadStream(__dirname + "/" +req.file.path),
					} 
				},
				function (error, response, body) {
					console.log("status response", response.statusCode);
					console.log("response", body);
					if (!error && response.statusCode == 200) {
						return res.end("File is uploaded");
					}else{
						return res.end("Error post");
					}
				}
			)
        }else{
        	return res.end("Not logged");
        }
    });
});


http.listen(4000, function(){
  console.log('listening on *:4000');
});

function delay_pedido(data){
	var time = 10000;
	if (data.time) {
		time = data.time;
	};
	setTimeout(function(){	
		var index = pedidos_pendientes.indexOf(data);
		if (index > -1) {
			var pedido = pedidos_pendientes[index];
			//auto_asignar(pedido);
			pedidos_auto.push(pedido);
			delete pedidos_pendientes[index];
			pedidos_pendientes.splice(index, 1);
			listening.add_messages_by_type(1, [data], function(django_id, sockets, message){
				for(var s in sockets){
					sockets[s].emit('delete-pedido', message);
					sockets[s].emit('request-gps', message);
				}
			});
		}
	}, time);
}

function en_movimiento(actual, anterior){
	return Math.sqrt(Math.pow((actual.lat - actual.lat), 2) + Math.pow((actual.lng - actual.lng), 2)) > 0.00487217386;
}

function esperar_movimiento(identificador){
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

function aceptar_pedido(pedido_id, cell_id){
	var cookieJar = session.get_jar(cell_id);
	console.log("enviare esto", {
				pedido: pedido_id,
				motorizado: cell_id,
			});
	request.post(
		{
			url: host + '/pedidos/aceptar/pws/', jar:cookieJar, form: 
			{
				pedido: pedido_id,
				motorizado: cell_id,
			} 
		},
		function (error, response, body) {
			if (!error && response.statusCode == 200) {
			}else{
				console.log("hubo un error servicio aceptar_pedido");
			}
			console.log(body)
		}
	)
}

function recojer_pedido(pedido_id, cell_id, tipo){
	var cookieJar = session.get_jar(cell_id);
	var url = host + '/pedidos/recoger/pws/';
	if(tipo == 1){
		url = host + '/pedidos/recoger/pplataforma/';
	}
	console.log("mandare a la url ", url);
	request.post(
		{
			url: url, jar:cookieJar, form: 
			{
				pedido: pedido_id,	
				motorizado: cell_id,
			}
		},
		function (error, response, body) {
			if (!error && response.statusCode == 200) {
			}else{
				console.log("hubo un error servicio recoger_pedido");
			}
			console.log(body)
		}
	)
}

function recibir_pedido(pedido_id, cell_id){
	var cookieJar = session.get_jar(cell_id);
	request.post(
		{
			url: host + '/pedidos/aceptar/pplataforma/', jar:cookieJar, form: 
			{
				pedido: pedido_id,
				motorizado: cell_id,
			} 
		},
		function (error, response, body) {
			if (!error && response.statusCode == 200) {
			}else{
				console.log("hubo un error servicio recibir_pedido");
			}
			console.log(body)
		}
	)
}

function auto_asignar(data){
	var tienda = data.pedido.tienda[0].id;
	var motorizado_json = []
	motorizado_json.push({
		'lat': data.lat,
		'lng': data.lng,
		'identificador': data.django_id
	})

	var cookieJar = session.get_jar(data.django_id);

	request.post(
		{
			url: host + '/pedidos/autoasignar/', jar:cookieJar, form: 
			{
				tienda: tienda,	
				motorizado_json: JSON.stringify(motorizado_json),
			}
		},
		function (error, response, body) {
			if (!error && response.statusCode == 200) {
				var identificador = body;
				listening.add_messages(1, identificador, [data.pedido]);

				var sessions = listening.get_sessions(1, identificador);
				var messages = listening.get_messages(1, identificador);

				for(var i in sessions){
					var session = sessions[i];
					for(var s in session){
						var socket = session[s];
						socket.emit('asignar-pedido', data.pedido);
					}
				}
				console.log(body);
			}else{
				console.log("hubo un error servicio auto_asignar");
			}
		}
	)
}