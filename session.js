var sqlite3 = require('sqlite3').verbose();
var file = 'db.sqlite3';
var db = new sqlite3.Database(file);

module.exports = {
	session: {'WEB': {}, 'CELL': {}},
	timeouts: {'WEB': {}, 'CELL': {}},
	jars: {},

	hash: function (username, password, usertype){
		return new Buffer(username+'/'+password + '/' + usertype).toString('base64')
	},

	die_session: function(session_id, usertype){
		this.timeouts[usertype][session_id] = setTimeout(function(session_id) {
		  delete this.session[usertype][session_id];
		}.bind(this), 60000, session_id);
	},

	login: function (session_id, username, password, usertype, callback) {
		db.serialize(function() {
			password = this.hash(username, password, usertype);
			db.all("SELECT * FROM user WHERE username = '" + username + "' AND password = '" + password + "'", function(err, rows) {
		      if (rows.length > 0) {
		      	this.session[usertype][session_id] = rows[0];
		      	this.die_session(session_id, usertype);
		      	callback(true);
		      }else{
		      	callback(false);
		      }
		    }.bind(this));
		}.bind(this));
	},

	add_jar: function(session_id, cookieJar){
		this.jars[session_id] = cookieJar;
	},

	get_jar: function(session_id){
		return this.jars[session_id];
	},

	clear: function (session_id, usertype){
		clearTimeout(this.timeouts[usertype][session_id]);
		this.die_session(session_id, usertype);
	},

	get_session: function (session_id, usertype) {
		return this.session[usertype][session_id];
	},

	set_value: function(session_id, key, value, usertype){
		this.session[usertype][session_id][key] = value;
	}

};