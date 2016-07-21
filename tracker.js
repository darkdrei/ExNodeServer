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
				'empresa': String,
				'retraso': Boolean,
				'motorizado': String
			});
			this.Track = mongoose.model('Track', track);
			if (callback){callback();}
		}.bind(this));
	},
	track: function (empresa, retraso, motorizado, lat, lng){
		var moto = new this.Track({
			'lat': lat,
			'lng': lng,
			'retraso': retraso,
			'empresa': empresa,
			'motorizado': motorizado
		});
		console.log("save");
		moto.save();
	},
	get_tracks: function (busqueda, callback) {
		var q = {
			'$or': [
				{'empresa': busqueda},
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