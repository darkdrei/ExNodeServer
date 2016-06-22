socket = io();
var marker = null;
var ruta = null;
var markers = [];
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
	console.log(msg);
	markers.push(msg);
	var myLatLng = msg;
	if (marker == null || true){
		marker = new google.maps.Marker({
			position: myLatLng,
			map: map,
			title: 'my ID 4545646 ',
			animation: google.maps.Animation.DROP
		});
		map.setCenter(myLatLng);

		ruta = new google.maps.Polyline({
		    path: markers,
		    geodesic: true,
		    strokeColor: '#FF0000',
		    strokeOpacity: 1.0,
		    strokeWeight: 2
		});
		ruta.setMap(map);
	}else{
		var cityCircle = new google.maps.Circle({
	      strokeColor: '#0B9444',
	      strokeOpacity: 1,
	      strokeWeight: 2,
	      fillColor: '#8DC63E',
	      fillOpacity: 0.8,
	      map: map,
	      center: marker.getPosition(),
	      radius: 10
	    });
		marker.setPosition(myLatLng);
	}
});

var map;
var Track;
function initMap() {
  map = new google.maps.Map(document.getElementById('map'), {
    center: {lat: 10.3970683, lng: -75.4925649},
    zoom: 15
  });
}


