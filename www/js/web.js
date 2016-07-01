socket = io();
		var marker = null;
		var ruta = null;
		var markers = [];
		var motorizados = {};
		var map;
		socket.emit('who-i-am');
		socket.on('you-are', function (msg){
			document.getElementById("web_id").innerHTML = msg;
			$("#qr").qrcode({
			    "size": 100,
			    "color": "#000",
			    "text": msg
			});
		});
		socket.on('ionic-qr', function (msg){
			document.getElementById("cell_id").value = msg;
		});
		socket.on('gps', function (msg){

			if (motorizados[msg.django_id] == undefined) {
				motorizados[msg.django_id] = {markers: [], marker: null};
			}

			if(motorizados[msg.django_id].marker){
				motorizados[msg.django_id].marker.setMap(null);
				motorizados[msg.django_id].marker = null;
			}

			var cityCircle = new google.maps.Circle({
			    strokeColor: motorizados[msg.django_id].detenido?'#FF0000':'#0B9444',
			    strokeOpacity: 1,
			    strokeWeight: 2,
			    fillColor: motorizados[msg.django_id].detenido?	'#FF0000':'#8DC63E',
			    fillOpacity: 0.8,
			    map: map,
			    center: msg,
			    radius: 10
			});

			motorizados[msg.django_id].markers.push(cityCircle);


			var icon = motorizados[msg.django_id].detenido?'img/pin_red.svg':'img/pin.svg';
			motorizados[msg.django_id].marker = new google.maps.Marker({
				position: msg,
				map: map,
				icon: icon,
				title: 'my ID ' + msg.django_id,
				animation: google.maps.Animation.DROP
			});
			map.setCenter(msg);
		});
		socket.on('motorizado-detenido', function(message) {
			console.log(message);
			motorizados[message.identificador].detenido = true;
		});
		var map;
		function initMap() {
		  map = new google.maps.Map(document.getElementById('map'), {
		    center: {lat: 10.3970683, lng: -75.4925649},
		    zoom: 15
		  });
		}