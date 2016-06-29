var mongoose = require('mongoose');

module.exports = {

	setup: function (callback){
	  mongoose.connect('mongodb://localhost/express');
		var db = mongoose.connection;
		db.on('error', console.error.bind(console, 'connection error:'));
		db.once('open', function (){
			var track = mongoose.Schema({
				'lat': String,
				'lng': String,
				'pedido': String,
				'placa': String,
				'motorizado': String
			});
			this.Track = mongoose.model('Track', track);
			if (callback){callback();}
		}.bind(this));
	},
	track: function (pedido, placa, motorizado, lat, lng){
		var moto = new this.Track({
			'lat': lat,
			'lng': lng,
			'placa': placa,
			'pedido': pedido,
			'motorizado': motorizado
		});
		console.log("save");
		moto.save();
	},
	get_tracks: function (busqueda, callback) {
		var q = {
			'$or': [
				{'placa': busqueda},
				{'pedido': busqueda},
				{'motorizado': {
					'$regex': '.*' + busqueda + '.*'
				}}
			]
		};
		this.Track.find(q, {}, function(err, raw){
			
			raw.forEach(function (doc, index, raw) {
				callback(doc);
			});
		});
	}
};