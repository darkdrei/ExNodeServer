var session = require('./session');
var listening = require('./listening');
var tracker = require('./tracker');
var app = require('express')();
var http = require('http').Server(app);
var io = require('socket.io')(http);
var request = require('request');
var multer  = require('multer');
var fs = require('fs');

var host =  'http://104.236.33.228:9000'; //'http://192.168.0.103:9000'; //

var storage =   multer.diskStorage({
  destination: function (req, file, callback) {
    callback(null, './img');
  },
  filename: function (req, file, callback) {
    callback(null, file.fieldname + '-' + Date.now()+'.'+file.mimetype.split("/")[1]);
  }
});

var upload = multer({storage: storage}).single('confirmacion');

var pedidos_pendientes = [];
var pedidos_auto = [];
var motorizados_gps = {};
var motorizado_detenido = {};

tracker.setup(function(){
	console.log("setup ok");
});

io.on('connection', function(socket) {

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
		//console.log('identify', {"ID": ID});
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
						console.log('web-login success');
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
			tracker.get_tracks(empresa, function(doc){
				socket.emit('rutas', doc);
			});
			listening.add_session('web-empresa-' + empresa, '123', '123', socket);
		};
	});

	socket.on('add-pedido', function(message) {
		var id = message['django_id'];
		var usertype = message['usertype'];

		//var ID = session.get_session(django_id, usertype);
		console.log('add-pedido');
		if(true){//ID){
			if (message.pedidos) {
				var pedidos = message.pedidos;
				for (var i = pedidos.length - 1; i >= 0; i--) {
					var pedido = pedidos[i];
					pedido['emit'] = 'add-pedido';
					pedido.tipo = message.tipo;
					pedido.time = message.retraso;
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
						var tienda = session.get_data(django_id)['tienda'];
						console.log(tienda, message.tienda, tienda == message.tienda)
						if (tienda == message.tienda[0].id) {
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
		console.log('asignar-pedido', message);
		if(true){//ID){

			var pedido = message.pedido;
			pedido['emit'] = 'asignar-pedido';
			pedido.estado = 'asignado';
			pedido.tipo = message.tipo;
			var identificador = pedido.motorizado;
			listening.add_messages(1, identificador, [pedido]);

			var sessions = listening.get_sessions(1, identificador);
			for(var i in sessions){
				var session = sessions[i];
				for(var j in session){
					var s = session[j];
					send_unread_messages(1, identificador, s);
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
			var tipo = session.get_data(django_id)['tipo'];
			recojer_pedido(message.pedido_id, message.cell_id, message.tipo);
			var messages = listening.get_messages(tipo, django_id);
			for (var i = messages.length - 1; i >= 0; i--) {
				var m = messages[i];
				console.log('recoger', m);
				if (m && m.id == message.pedido_id && m.tipo == message.tipo) {
					console.log('modificare este', m.id);
					m.estado = "recogido";
					socket.emit('modificar-pedido', m);
					return;
				}
			}
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
				listening.add_messages_by_type(2, [pedidos_pendientes[index]], function(django_id, sockets, message){
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
			//console.log('GPS:', message, ID['gps'], en_movimiento(message, ID['gps']));
			if(!en_movimiento(message, ID['gps'])){
				esperar_movimiento(django_id);
			}else{
				cancelar_espera(django_id);
			}
			session.set_value(django_id, 'gps', message, usertype);

			save_gps(message);

			var empresa = session.get_data(django_id)['empresa'];
			listening.add_messages_by_type('web-empresa-' + empresa, [message], function(django_id, sockets, message){
				for(var s in sockets){
					sockets[s].emit('gps', message);
				}
			});
		}
	});

	socket.on('stop-gps', function(message){
		var django_id = message['django_id'];
		var usertype = message['usertype'];

		var ID = session.get_session(django_id, usertype);
		console.log('stop-gps')
		if(ID){
			clear_gps(message.cell_id);
		}
	});

	socket.on('reponse-gps', function(message){
		var django_id = message['django_id'];
		var usertype = message['usertype'];

		var ID = session.get_session(django_id, usertype);

		console.log('response', message);

		if(ID){
			var pedido = message.pedido
			if(!motorizados_gps[pedido.id]){
				motorizados_gps[pedido.id] = []
			}
			motorizados_gps[pedido.id].push({
				'lat': message.lat,
				'lng': message.lng,
				'identificador': message.django_id
			});
		}
	});

	socket.on('select-motorizado', function(message){

		console.log(message);

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

	socket.on('visit-message', function(message) {

		console.log(message);

		var django_id = message['django_id'];
		var usertype = message['usertype'];

		var ID = session.get_session(django_id, usertype);

		if(ID){
			var tipo = session.get_data(django_id)['tipo'];
			var messages = listening.get_messages(tipo, django_id);
			listening.visit_message(tipo, django_id, message.message_id, socket.id, function(){
				//pass
			});
		}
	});

	socket.on('delete-message', function(message) {

		console.log('delete-message');

		var django_id = message['django_id'];
		var usertype = message['usertype'];

		var ID = session.get_session(django_id, usertype);

		if(ID){
			var tipo = session.get_data(django_id)['tipo'];
			var messages = listening.get_messages(tipo, django_id);
			listening.delete_messages(tipo, django_id, message.message_id);
		}
	});

	socket.on('modificar-pedido', function(message) {
		var id = message['django_id'];
		var usertype = message['usertype'];

		//var ID = session.get_session(django_id, usertype);
		console.log('modificar-pedido');
		if(true){//ID){
			var pedido = message.pedido;
			pedido['emit'] = 'modificar-pedido';
			pedido.estado = 'asignado';
			pedido.tipo = message.tipo;
			var identificador = pedido.motorizado;
			listening.add_messages(1, identificador, [pedido]);

			var sessions = listening.get_sessions(1, identificador);
			for(var i in sessions){
				var session = sessions[i];
				for(var j in session){
					var s = session[j];
					send_unread_messages(1, identificador, s);
				}
			}
		}
	});
	
	socket.on('modificar-motorizado-pedido', function(message) {
		var id = message['django_id'];
		var usertype = message['usertype'];

		//var ID = session.get_session(django_id, usertype);
		if(true){//ID){
			console.log('modificar-motorizado-pedido');
			var pedido = message.pedido;
			pedido['emit'] = 'asignar-pedido';
			pedido.tipo = message.tipo;
			var identificador = message.mot_siguiente;
			listening.add_messages(1, identificador, [pedido]);

			var sessions = listening.get_sessions(1, identificador);
			for(var i in sessions){
				var session = sessions[i];
				for(var j in session){
					var s = session[j];
					send_unread_messages(1, identificador, s);
				}
			}

			var pedido2 = JSON.parse(JSON.stringify(pedido));
			pedido2['emit'] = 'trasladar-pedido';
			pedido2.tipo = message.tipo;
			var identificador2 = message.mot_anterior;
			listening.add_messages(1, identificador2, [pedido2]);

			var sessions = listening.get_sessions(1, identificador2);
			for(var i in sessions){
				var session = sessions[i];
				for(var j in session){
					var s = session[j];
					send_unread_messages(1, identificador2, s);
				}
			}

		}
	});
	
	socket.on('numero-pedido', function(message) {

		//console.log('numero-pedido', message);

		var django_id = message['django_id'];
		var usertype = message['usertype'];

		var ID = session.get_session(django_id, usertype);

		if(ID){
			numero_pedido(message.cell_id)		
		}
	});

	socket.on('get-messages', function(message) {

		var tipo = session.get_data(message.cell_id)['tipo'];

		var django_id = message['django_id'];
		var usertype = message['usertype'];

		var ID = session.get_session(django_id, usertype);

		if(ID){
			send_messages(tipo, message.cell_id, socket);
		}
	});

	socket.on('get-info', function(message) {
		socket.emit('get-info', session.get_data(message.identificador));
	})

	socket.on('get-data', function(message) {
		console.log('get-data', message);
		get_data(message.cell_id, socket)
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

app.get('/img/icon.png', function(req, res){
  res.sendFile(__dirname + '/www/img/icon.png');
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

	var cookieJar = session.get_jar(django_id);
		empresa = session.get_data(django_id);
        if (cookieJar) {
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
						listening.add_messages_by_type('web-empresa-' + empresa, [{'identificador': identificador}], function(django_id, sockets, message){
							for(var s in sockets){
								sockets[s].emit('pedido-entregado', {motorizado: session.get_data(django_id), pedido: pedido_id});
							}
						});
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

app.post('/cancel',function(req,res){

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
        	var url = host + '/pedidos/cancelar/pws/';
			if(tipo == 1){
				url = host + '/pedidos/cancelar/pplataforma/';
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
			delay_auto(JSON.parse(JSON.stringify(pedido)));
			delete pedidos_pendientes[index];
			pedidos_pendientes.splice(index, 1);
			pedido['emit'] = 'delete-pedido';
			listening.add_messages_by_type(1, [JSON.parse(JSON.stringify(pedido))], function(django_id, sockets, message){
				for(var s in sockets){
					sockets[s].emit('delete-pedido', message);
					var tienda = session.get_data(django_id)['tienda'];
					if (tienda == message.tienda[0].id) {
						sockets[s].emit('request-gps', message);
					}
				}
			});
			listening.add_messages_by_type(2, [JSON.parse(JSON.stringify(pedido))], function(django_id, sockets, message){
				for(var s in sockets){
					sockets[s].emit('delete-pedido', message);
				}
			});
		}
	}, time);
}

function en_movimiento(actual, anterior){
	if (anterior) {
		var distance = Math.sqrt(Math.pow((actual.lat - anterior.lat), 2) + Math.pow((actual.lng - anterior.lng), 2));
		return distance > 0.00487217386;
	};
	return true;
}

function esperar_movimiento(identificador){
	var empresa = session.get_data(identificador)['empresa'];
	if (motorizado_detenido[identificador] == undefined || motorizado_detenido[identificador]._called) {
		motorizado_detenido[identificador] = setTimeout(function(){
			session.get_data(identificador)['detenido'] = true;
			listening.add_messages_by_type('web-empresa-' + empresa, [{'identificador': identificador}], function(django_id, sockets, message){
				for(var s in sockets){
					sockets[s].emit('motorizado-detenido', message);
				}
			});
		}, 20000);
	};
}

function cancelar_espera(identificador){
	var empresa = session.get_data(identificador)['empresa'];
	session.get_data(identificador)['detenido'] = false;
	listening.add_messages_by_type('web-empresa-' + empresa, [{'identificador': identificador}], function(django_id, sockets, message){
		for(var s in sockets){
			sockets[s].emit('motorizado-movimiento', message);
		}
	});

	if (motorizado_detenido[identificador] != undefined && !motorizado_detenido[identificador]._called) {
		clearTimeout(motorizado_detenido[identificador]);
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

function numero_pedido(cell_id){
	var cookieJar = session.get_jar(cell_id);
	var tipo = session.get_data(cell_id)['tipo'];

	request.post(
		{
			url: host + '/motorizado/get/pedidos/', jar:cookieJar, form: 
			{
				motorizado: cell_id,
			} 
		},
		function (error, response, body) {
			if (!error && response.statusCode == 200) {
			}else{
				console.log("hubo un error servicio motorizad_get_pedidos");
			}
			listening.add_messages(tipo, cell_id, [{numero_pedidos: body, emit:'numero-pedido'}]);
			var sessions = listening.get_sessions(tipo, cell_id);
			for(var i in sessions){
				var session = sessions[i];
				for(var j in session){
					var s = session[j];
					send_unread_messages(tipo, cell_id, s);
				}
			}
			//console.log(body)
		}
	)
}

function get_data(cell_id, socket){
	var cookieJar = session.get_jar(cell_id);
	console.log("enviare esto", {
				motorizado: cell_id,
			});
	request(
		{
			url: host + '/motorizado/get/info/?q='+cell_id 
		},
		function (error, response, body) {
			if (!error && response.statusCode == 200) {
				var resp = JSON.parse(body);
				resp = resp.object_list[0];
				if (!resp) {
					resp = {
						nombre:'No',
						apellidos: 'Registrado'
					}
				}
				if (resp.foto) {
					resp.foto = host + '/media/' + resp.foto;
				};
				console.log(resp);
				socket.emit('get-data', resp);
			}else{
				console.log("hubo un error servicio motorizado_get_info");
			}
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

function auto_asignar(pedido, motorizado_json){
	var tienda = pedido.tienda[0].id;

	request.post(
		{
			url: host + '/pedidos/autoasignar/', form: 
			{
				tienda: tienda,	
				motorizado_json: JSON.stringify(motorizado_json),
			}
		},
		function (error, response, body) {
			if (!error && response.statusCode == 200) {
				var identificador = body;
				
				aceptar_pedido(pedido.id, identificador);

				pedido['emit'] = 'asignar-pedido';
				listening.add_messages(1, identificador, [pedido]);

				var sessions = listening.get_sessions(1, identificador);
				var messages = listening.get_messages(1, identificador);

				for(var i in sessions){
					var session = sessions[i];
					for(var s in session){
						var socket = session[s];
						socket.emit('asignar-pedido', pedido);
					}
				}
				console.log(body);
			}else{
				console.log("hubo un error servicio auto_asignar");
			}
		}
	)
}

function delay_auto(pedido){

	var time = 10000;
	
	setTimeout(function(){
		console.log('delay-auto', motorizados_gps);
		if(motorizados_gps[pedido.id]){
			var locations = motorizados_gps[pedido.id]
			auto_asignar(pedido, locations);
		}
	}, time);
}

function send_messages(tipo, django_id, socket){
	var messages = listening.get_messages(tipo, django_id);
	for(var i in messages){
		var message = messages[i];
		console.log('message', message.id,message.estado, socket.id);
		socket.emit(message.emit, message);
	}
}

function send_unread_messages(tipo, django_id, socket){
	var messages = listening.get_messages(tipo, django_id);
	//console.log(messages);
	for(var i in messages){
		var message = messages[i];
		if (message['_visited_'].length == 0) {
			//console.log('voy a mandar', message.emit);
			socket.emit(message.emit, message);
		};
	}
}

function clear_gps(cell_id){
	var empresa = session.get_data(cell_id)['empresa'];
	tracker.delete_tracks({'motorizado': cell_id}, function(err){});
	listening.add_messages_by_type('web-empresa-' + empresa, [{'identificador': cell_id}], function(django_id, sockets, message){
		for(var s in sockets){
			sockets[s].emit('clear-gps', message);
		}
	});
}

function save_gps(message){
	var empresa = session.get_data(message.django_id)['empresa'];
	var detenido = session.get_data(message.django_id)['detenido'];
	if (!message.error) {
		tracker.track(empresa, detenido, message.django_id, message.lat, message.lng);
	};
}
